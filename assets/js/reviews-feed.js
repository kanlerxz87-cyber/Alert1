/* ============================================================================
 * reviews-feed.js — the all-games Replay Feed (reviews.html)
 *
 * Scans every game on the slate for review events and renders them as a live,
 * chat-style feed:
 *   - manager challenges (M*), umpire/crew-chief reviews (N*), instant replay
 *     (IH), boundary calls (umpire-side home run / fair-foul / stadium-boundary
 *     reviews; charged manager challenges of those plays stay challenges)
 *   - ABS pitch challenges (MJ/NJ) with count before/after
 *   - official-scorer pending rulings (os_ruling_pending_*)
 *   - official scoring changes, detected by diffing each completed play's
 *     classification between polls
 *
 * Latency: each live game is polled on its own schedule (250 ms, or 200 ms while
 * a review is open), its response is ingested and rendered the moment it lands
 * (never waiting for the slowest game in the batch), every poll is cache-busted,
 * and a projected `feed/live` resync runs every few seconds to recover anything
 * a lean projection missed and to carry MLB's own `metaData.timeStamp`.
 *
 * Every tracked entry is persisted through feed-log.js (localStorage + the
 * optional server store) and restored on the next visit.  Alerts go through
 * alert-sound.js (one audio graph + an "already rung" ledger), and the separate
 * official-scoring record book lives in scoring-log.js — the alert path and the
 * scoring book never write to each other.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var MLB = global.MLB;
  var UI = global.UI;
  var Reviews = global.Reviews;
  var FeedLog = global.FeedLog;
  var AlertSound = global.AlertSound;
  var GameState = global.GameState;
  var ScoringLog = global.ScoringLog;

  var SCAN_MS = 250;
  /* Faster probe, only for games that are actually under review, and only for
   * the first few of them — the request budget has to stay sane on a 15-game
   * slate.  Documented in README §Customizing together with the rest. */
  var REVIEW_PROBE_MS = 200;
  var REVIEW_PROBE_MAX_GAMES = 4;
  var STATUS_SWEEP_MS = 125;
  var FETCH_CONCURRENCY = 6;
  var FINAL_GRACE_MS = 30 * 60 * 1000;
  /* Projected feed/live resync per live game: recovers anything the lean
   * projection dropped and captures MLB's official state timecode. */
  var RESYNC_MS = 10000;
  var RESYNC_TICK_MS = 1000;
  var SCHEDULE_TTL_MS = 400;
  var RENDER_COALESCE_MS = 16;
  var STATE_HISTORY_MAX = 90;

  var PLAYBYPLAY_FIELDS = 'allPlays,about,atBatIndex,hasReview,isComplete,inning,halfInning,isTopInning,isScoringPlay,' +
    'result,eventType,description,isOut,rbi,awayScore,homeScore,count,balls,strikes,outs,matchup,batter,id,fullName,pitcher,' +
    'playEvents,details,call,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId,runners,' +
    'isScoringEvent,playIndex,movement,index,isPitch,pitchNumber,type,startTime,endTime,hasOutcome';

  var COUNTERS_FIELDS = 'gameData,review,absChallenges,hasChallenges,away,home,used,remaining,usedSuccessful,usedFailed';

  var FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'abs', label: 'ABS' },
    { id: 'challenges', label: 'Challenges' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'boundary', label: 'Boundary Calls' },
    { id: 'under', label: 'Under Review' },
    { id: 'risk', label: '⚠️ Runs at Risk' },
    { id: 'scoring', label: '✏️ Scoring Changes' },
  ];

  var state = {
    date: MLB.todayISO(),
    dateSeq: 0,
    filter: 'all',
    games: [],
    log: null,
    entries: [],
    snapshots: Object.create(null),
    irregularities: Object.create(null),
    finalSeen: Object.create(null),
    nextDue: Object.create(null),
    statusByPk: Object.create(null),
    scheduleLoaded: false,
    scanning: false,
    scanError: null,
    soundOn: false,
    scoringOnly: false,
    absAlerts: false,
    background: false,
    scoringView: 'all',
    notifyOn: false,
    lastChimeAt: 0,
    lastScanAt: 0,
    timers: { scan: null, sweep: null, countdown: null, render: null, probe: null, resync: null },
    nextScanAt: 0,
    lastRenderSignature: '',
    counterCache: Object.create(null),
    absFetchedRevCount: Object.create(null),
    lastGameDate: undefined,
    nextGameDate: undefined,
    lookingForRecent: false,
    /* ---- latency / live capture ---- */
    inFlight: Object.create(null),      /* gamePk -> startedAt of the open request */
    lastFetchAt: Object.create(null),   /* gamePk -> Date.now() of the last response */
    lastProbeAt: Object.create(null),   /* gamePk -> Date.now() of the last fast probe */
    liveState: Object.create(null),     /* gamePk -> latest captured official state */
    prevState: Object.create(null),     /* gamePk -> captured state before this ingest */
    stateHistory: Object.create(null),  /* gamePk -> [state] bounded ring */
    stateSignatureByPk: Object.create(null),
    coveredUpTo: Object.create(null),   /* gamePk -> highest fully ingested atBatIndex */
    resyncDue: Object.create(null),     /* gamePk -> ms */
    latencySamples: [],                 /* { ms, at, gamePk } */
    inReviewCount: 0,
    renderQueued: false,
    schedule: { at: 0, payload: null, promise: null },
    scanStartedAt: 0,
    lastIngestAt: null,
    servedFromScheduleCache: 0,
    scoringStats: { pending: 0, changes: 0, restored: 0 },
  };

  function $(id) { return document.getElementById(id); }

  function statusLine(text, isError) {
    var el = $('status-line');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
  }

  function urlDate() {
    try {
      var params = new URLSearchParams(global.location.search || '');
      var d = params.get('date');
      return MLB.isValidISODate(d) ? d : null;
    } catch (e) { return null; }
  }

  /* Keep the address bar in step with the selected date (shareable links).
   * Guarded: history.replaceState is not writable in every embedding context. */
  function syncUrl() {
    try {
      var url = new URL(global.location.href);
      if (url.searchParams.get('date') === state.date) return;
      url.searchParams.set('date', state.date);
      global.history.replaceState(null, '', url.toString());
    } catch (e) { /* ignore */ }
  }

  function syncNav() {
    var picker = $('date-picker');
    if (picker && picker.value !== state.date) picker.value = state.date;
    var label = $('date-label');
    if (label) label.textContent = MLB.formatDateLabel(state.date);
    var backLink = document.querySelector('a.btn[href^="index.html"]');
    if (backLink) backLink.setAttribute('href', 'index.html?date=' + encodeURIComponent(state.date));
    syncUrl();
  }

  function parseDate() {
    /* A ?date=YYYY-MM-DD deep link (reviews.html?date=2026-10-28) wins over the
     * picker, so a shared or bookmarked URL always opens the date it names. */
    var fromUrl = urlDate();
    if (fromUrl) return fromUrl;
    var input = $('date-picker');
    var value = input && input.value;
    return MLB.isValidISODate(value) ? value : MLB.todayISO();
  }

  /* ------------------------------------------------------------ log helpers */

  function upsertEntry(entry) {
    if (!entry || !entry.id) return false;
    var index = -1;
    for (var i = 0; i < state.entries.length; i += 1) {
      if (state.entries[i].id === entry.id) { index = i; break; }
    }
    var now = Date.now();
    if (index === -1) {
      entry.firstSeen = entry.firstSeen || now;
      entry.lastSeen = now;
      state.entries.push(entry);
      return true;
    }
    var prev = state.entries[index];
    var merged = Object.assign({}, prev, entry);
    merged.firstSeen = prev.firstSeen || now;
    merged.lastSeen = now;
    if (prev.scoreTracker && entry.scoreTracker) {
      merged.scoreTracker = Object.assign({}, prev.scoreTracker, entry.scoreTracker);
      /* Never overwrite an observed "before" score with a later guess. */
      if (prev.scoreTracker.before && !entry.scoreTracker.before) {
        merged.scoreTracker.before = prev.scoreTracker.before;
      }
    }
    state.entries[index] = merged;
    return false;
  }

  function noteIrregularity(gamePk, text) {
    if (!gamePk || !text) return;
    var list = state.irregularities[gamePk] || [];
    if (list.indexOf(text) === -1) {
      list.push(text);
      state.irregularities[gamePk] = list.slice(-30);
    }
  }

  function persist(expectedSeq, expectedDate) {
    if (expectedSeq !== undefined && expectedSeq !== state.dateSeq) return;
    if (expectedDate !== undefined && expectedDate !== state.date) return;
    if (!state.log) state.log = FeedLog.emptyPayload(state.date);
    state.log.entries = state.entries.slice();
    state.log.snapshots = state.snapshots;
    state.log.irregularities = state.irregularities;
    state.log.savedAt = Date.now();
    FeedLog.save(state.date, state.log);
  }

  function adoptLog(log) {
    if (!log) return;
    if (log.date && MLB.isValidISODate(log.date) && log.date !== state.date) return;
    state.log = log;
    state.entries = Array.isArray(log.entries)
      ? log.entries.filter(function (e) {
          return !e || !e.officialDate || e.officialDate === state.date;
        })
      : [];
    state.snapshots = log.snapshots || Object.create(null);
    state.irregularities = log.irregularities || Object.create(null);
    /* Restored rows were not observed live: pre-mark runs-at-risk rows so the
     * warning state stays visible but the chime does not fire on restore. */
    state.entries.forEach(function (e) {
      if (e && e.review && e.review.runsAtRiskCount > 0) e.warned = true;
    });
  }

  /* ------------------------------------------------------------- scan cycle */

  function flattenGames(payload) {
    var out = [];
    ((payload && payload.dates) || []).forEach(function (d) {
      (d.games || []).forEach(function (g) { out.push(g); });
    });
    return out;
  }

  function teamsOf(game) {
    return {
      away: {
        id: game.teams && game.teams.away && game.teams.away.team ? game.teams.away.team.id : null,
        name: game.teams && game.teams.away && game.teams.away.team ? game.teams.away.team.name : '',
      },
      home: {
        id: game.teams && game.teams.home && game.teams.home.team ? game.teams.home.team.id : null,
        name: game.teams && game.teams.home && game.teams.home.team ? game.teams.home.team.name : '',
      },
    };
  }

  function finalGraceDelay(finalFirstSeen, elapsed) {
    if (elapsed < 2 * 60 * 1000) return 1000;
    if (elapsed < 5 * 60 * 1000) return 2500;
    return 15000;
  }

  /* How long this game's next poll should wait.  Live games keep the 250 ms
   * cadence (200 ms while a review is open, for at most REVIEW_PROBE_MAX_GAMES
   * games at a time); Final games back off through their 30-minute grace. */
  function gameDelay(game, now) {
    var pk = game.gamePk;
    var status = (game.status && game.status.abstractGameState) || '';
    if (status !== 'Live') return finalGraceDelay(state.finalSeen[pk] || now, now - (state.finalSeen[pk] || now));
    if (state.inReviewCount < REVIEW_PROBE_MAX_GAMES && isUnderReviewPk(pk)) return REVIEW_PROBE_MS;
    return SCAN_MS;
  }

  function isUnderReviewPk(pk) {
    return state.entries.some(function (e) {
      return e && String(e.gamePk) === String(pk) && e.review && e.review.inProgress;
    });
  }

  function shouldFetch(game, now) {
    var status = (game.status && game.status.abstractGameState) || '';
    var pk = game.gamePk;
    if (status === 'Live') {
      if (state.inFlight[pk]) return false;
      var due = state.nextDue[pk] || 0;
      if (now < due) return false;
      state.nextDue[pk] = now + gameDelay(game, now);
      return true;
    }
    if (status === 'Final') {
      if (!state.finalSeen[pk]) state.finalSeen[pk] = now;
      var elapsed = now - state.finalSeen[pk];
      if (elapsed > FINAL_GRACE_MS) return false;
      if (state.inFlight[pk]) return false;
      var fdue = state.nextDue[pk] || 0;
      if (now < fdue) return false;
      state.nextDue[pk] = now + finalGraceDelay(state.finalSeen[pk], elapsed);
      return true;
    }
    return false;
  }

  /**
   * fetchGame(game, opts)
   *   opts.mode 'scan' (lean play-by-play + counters) | 'resync' (projected feed/live)
   *
   * Every request is cache-busted and carries a 6 s timeout, so one slow or
   * poisoned response can never hold the other games back.  The result is
   * stamped with `observedAt` (the moment the response landed) and `startedAt`,
   * which is what the latency badge reports.
   */
  function fetchGame(game, opts) {
    opts = opts || {};
    var pk = game.gamePk;
    var startedAt = Date.now();
    var mode = opts.mode || 'scan';

    if (mode === 'resync') {
      return MLB.gameFeedState(pk, { timeout: 6000 })
        .then(function (payload) {
          return { game: game, payload: payload, countersPayload: payload, feedPayload: payload, mode: mode, startedAt: startedAt, observedAt: Date.now() };
        })
        .catch(function (err) {
          return { game: game, payload: null, countersPayload: null, mode: mode, startedAt: startedAt, observedAt: Date.now(), error: err };
        });
    }

    var prevCount = state.absFetchedRevCount[pk];
    var status = (game.status && game.status.abstractGameState) || '';
    var pbpPromise = MLB.playByPlay(pk, { fields: PLAYBYPLAY_FIELDS, retries: 0, bust: true, timeout: 6000 });
    var countersPromise = (prevCount === undefined || status === 'Live')
      ? MLB.gameFeed(pk, { fields: COUNTERS_FIELDS, retries: 0, bust: true, timeout: 6000 }).catch(function () { return null; })
      : Promise.resolve(null);
    return Promise.all([pbpPromise, countersPromise])
      .then(function (parts) {
        return { game: game, payload: parts[0], countersPayload: parts[1], mode: mode, startedAt: startedAt, observedAt: Date.now() };
      })
      .catch(function (err) {
        return { game: game, payload: null, countersPayload: null, mode: mode, startedAt: startedAt, observedAt: Date.now(), error: err };
      });
  }

  /* One request per game in flight; the newest response always wins. */
  function requestGame(game, mode) {
    var pk = game.gamePk;
    if (state.inFlight[pk]) return Promise.resolve(null);
    var startedAt = Date.now();
    state.inFlight[pk] = startedAt;
    return fetchGame(game, { mode: mode }).then(function (result) {
      delete state.inFlight[pk];
      state.lastFetchAt[pk] = Date.now();
      if (result && result.startedAt) {
        state.lastScanAt = Math.max(state.lastScanAt || 0, result.startedAt);
        recordLatency(result.observedAt - result.startedAt, pk);
      }
      return result;
    }).catch(function () {
      delete state.inFlight[pk];
      return null;
    });
  }

  /* ------------------------------------------------------------ latency data */

  function recordLatency(ms, gamePk) {
    if (!isFinite(ms) || ms < 0) return;
    state.latencySamples.push({ ms: ms, at: Date.now(), gamePk: gamePk });
    if (state.latencySamples.length > 400) state.latencySamples = state.latencySamples.slice(-400);
  }

  function latencyStats() {
    var samples = state.latencySamples;
    if (!samples.length) return { count: 0, median: null, p95: null, last: null, worst: null };
    var sorted = samples.map(function (s) { return s.ms; }).sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return {
      count: sorted.length,
      median: sorted[mid],
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
      last: samples[samples.length - 1].ms,
      worst: sorted[sorted.length - 1],
    };
  }

  /* Fastest-observed latency per game, for the cards: "0.3 s". */
  function gameLatency(pk) {
    var best = null;
    for (var i = state.latencySamples.length - 1; i >= 0; i -= 1) {
      var s = state.latencySamples[i];
      if (String(s.gamePk) !== String(pk)) continue;
      if (best === null || s.ms < best) best = s.ms;
      if (state.latencySamples.length - i > 40) break;   /* recent window only */
    }
    return best;
  }

  function runLimited(items, limit, worker) {
    var index = 0;
    var active = 0;
    return new Promise(function (resolve) {
      if (!items.length) { resolve(); return; }
      function next() {
        if (index >= items.length && active === 0) { resolve(); return; }
        while (active < limit && index < items.length) {
          var item = items[index];
          index += 1;
          active += 1;
          worker(item).then(function () {
            active -= 1;
            next();
          });
        }
      }
      next();
    });
  }

  /* ---------------------------------------------------- captured live state */

  /**
   * captureState(result) — turn one response into an official state record and
   * remember it for this game.  `prevState` keeps the observation immediately
   * before it, which is the "before" half of every before/after pair the feed
   * renders.  A record is only pushed onto the bounded history when something
   * material actually moved, so 250 ms polling cannot flood the log.
   */
  function captureState(result) {
    if (!GameState) return null;
    var game = result.game || {};
    var live = result.feedPayload || result.payload || null;
    var stateRec = GameState.capture({
      game: game,
      feed: live,
      countersPayload: result.countersPayload,
      observedAt: result.observedAt,
    });
    if (!stateRec || stateRec.gamePk === null) stateRec = stateRec || null;
    var pk = game.gamePk;
    var previous = stateRec ? stateRec : null;
    if (previous) {
      var prior = state.liveState[pk] || null;
      state.prevState[pk] = prior;
      var sig = stateSignature(previous);
      if (sig !== state.stateSignatureByPk[pk]) {
        state.stateSignatureByPk[pk] = sig;
        var hist = state.stateHistory[pk] || (state.stateHistory[pk] = []);
        hist.push(previous);
        if (hist.length > STATE_HISTORY_MAX) hist.splice(0, hist.length - STATE_HISTORY_MAX);
      }
      state.liveState[pk] = previous;
    }
    return previous;
  }

  function stateSignature(stateRec) {
    if (!stateRec) return '';
    var sc = stateRec.score || {};
    var ct = stateRec.count || {};
    var inn = stateRec.inning || {};
    return [
      stateRec.status ? stateRec.status.abstract : '', stateRec.status ? stateRec.status.code : '',
      sc.away, sc.home, stateRec.outs, ct.balls, ct.strikes,
      inn.num, inn.half, stateRec.atBat.index,
      stateRec.batter ? stateRec.batter.id : '', stateRec.pitcher ? stateRec.pitcher.id : '',
      stateRec.pitchCount ? stateRec.pitchCount.game : '',
      stateRec.timecode ? stateRec.timecode.timeStamp : '',
    ].join('|');
  }

  /* The exact official state to print on a row: the one captured a moment
   * before the event, and the one captured after it.  Both are trimmed to the
   * fields a human review needs, plus their own timestamps to the second. */
  function stateSnapshot(stateRec) {
    if (!stateRec) return null;
    return {
      at: stateRec.observedAt,
      stamp: GameState.stamp(stateRec.observedAt),
      utc: GameState.utc(stateRec.observedAt),
      summary: GameState.summary(stateRec),
      score: stateRec.score,
      outs: stateRec.outs,
      count: stateRec.count,
      inning: GameState.halfLabel(stateRec),
      batter: stateRec.batter ? stateRec.batter.name : null,
      pitcher: stateRec.pitcher ? stateRec.pitcher.name : null,
      pitchCount: stateRec.pitchCount,
      status: stateRec.status,
      timecode: stateRec.timecode,
      challenges: stateRec.challenges,
    };
  }

  function ingestGame(result, expectedSeq, expectedDate) {
    if (expectedSeq !== undefined && expectedSeq !== state.dateSeq) return;
    if (expectedDate !== undefined && expectedDate !== state.date) return;
    if (!result || !result.payload) {
      if (result && result.error && !(result.error && result.error.quiet)) {
        state.scanError = result.error;
      }
      return;
    }
    var game = result.game;
    var plays = Reviews.playsOf(result.payload);
    var teams = teamsOf(game);
    var meta = { gamePk: game.gamePk, teams: teams, feed: result.payload };

    /* Capture the official state FIRST: the before-side of every event below is
     * the state observed on the previous poll, the after-side is this one. */
    var captured = captureState(result);
    var prevCaptured = state.prevState[game.gamePk] || null;
    var beforeSnap = stateSnapshot(prevCaptured);
    var afterSnap = stateSnapshot(captured);
    state.lastIngestAt = result.observedAt || Date.now();
    var firstObservation = !state.coveredUpTo[game.gamePk] && state.coveredUpTo[game.gamePk] !== 0;

    /* ---- reviews */
    var reviews = Reviews.extractReviews(plays, meta);
    reviews.forEach(function (review) {
      var existing = state.entries.find(function (e) { return e.id === review.id; });
      var before = existing && existing.scoreTracker && existing.scoreTracker.before ? existing.scoreTracker.before : null;

      var scoreTracker = {
        before: before,
        possible: null,
        actual: null,
      };

      if (review.inProgress) {
        /* Call-on-field score while the review is still open = the score the
         * review is deciding on.  Taken from the official linescore/result. */
        scoreTracker.before = review.score || before;
      } else {
        scoreTracker.actual = review.scoreAfter || null;
        if (!scoreTracker.before) {
          /* Never infer or fill in the pre-ruling score when the page opened
           * after resolution (README §"Before / Possible / Actual score tracker"). */
          noteIrregularity(game.gamePk, 'Before-review score was not observed for ' + review.id + ' (page opened after the ruling).');
        }
      }
      if (scoreTracker.before && review.runsAtRiskCount > 0) {
        scoreTracker.possible = {
          away: scoreTracker.before.away,
          home: scoreTracker.before.home,
        };
        scoreTracker.possible[review.battingSide] = Math.max(0, scoreTracker.possible[review.battingSide] - review.runsAtRiskCount);
      }

      var entry = {
        id: review.id,
        kind: 'review',
        officialDate: expectedDate || state.date,
        gamePk: game.gamePk,
        matchupLabel: UI.abbr(teams.away) + ' @ ' + UI.abbr(teams.home),
        teams: teams,
        review: review,
        scoreTracker: scoreTracker,
        firstSeenLabel: MLB.formatGameTime(game.gameDate),
        /* exact official state either side of the event, each stamped to the
         * second (see game-state.js) */
        stateBefore: beforeSnap,
        stateAfter: afterSnap,
        capturedAt: result.observedAt,
      };

      var isNew = upsertEntry(entry);
      /* Always operate on the stored entry: upsertEntry merges into the
       * existing object, so flags like `warned` live there. */
      entry = state.entries.find(function (e) { return e.id === entry.id; }) || entry;
      if (!entry.firstObservedAt) entry.firstObservedAt = result.observedAt || Date.now();

      /* One alert per event, ever — the ledger (alert-sound.js) is keyed by the
       * event id and persisted per date, so a refresh, a second tab or a
       * restored log can never replay a sound. ABS pitch challenges stay
       * silent unless the operator opts in (absAlerts). */
      /* Alert only for an event tracked for the first time since the page (or
       * the restored log) knew about it — `isNew` — and never twice for the same
       * event id even across tabs or a refresh (the ledger). */
      var wantsThisReview = state.scoringOnly ? false : (!review.isABS || state.absAlerts);
      if (isNew && wantsThisReview && state.soundOn && claimAlert(entry.id)) chime('review');
      if (review.runsAtRiskCount > 0 && !entry.warned) {
        /* "whenever an active review could remove a run" — alert the moment the
         * condition first becomes visible (including mid-review). The risk
         * alert has its own ledger key so it can legitimately ring once for a
         * review that opens and once again when a scoring movement appears. */
        entry.warned = true;
        if (!state.scoringOnly && state.soundOn && claimAlert(entry.id + ':risk')) chime('risk');
        notifyRunAtRisk(review, teams);
      }
    });

    /* ---- official-scorer pending rulings ---------------------------------
     * These go into the SEPARATE official-scoring book (scoring-log.js) first,
     * which owns the record for refreshes; the feed row and its alert are a
     * read of that book, so a scoring-log change can never lose an alert and an
     * alert toggle can never lose a record. */
    var pending = Reviews.pendingRulings(plays, meta);
    var pendingIds = Object.create(null);
    pending.forEach(function (row) {
      pendingIds[row.id] = true;
      var pendingBefore = row.description || null;
      ScoringLog.upsert({
        id: row.id,
        kind: 'pending',
        date: expectedDate || state.date,
        gamePk: game.gamePk,
        matchup: UI.abbr(teams.away) + ' @ ' + UI.abbr(teams.home),
        atBatIndex: row.atBatIndex,
        inning: row.inningLabel,
        batter: row.batter,
        pitcher: row.pitcher,
        eventType: row.eventType,
        before: pendingBefore,
        after: null,
        stateBefore: beforeSnap,
        stateAfter: afterSnap,
        firstObservedAt: result.observedAt || Date.now(),
        lastObservedAt: result.observedAt || Date.now(),
        observedLive: !firstObservation,
        source: row.source,
        notes: ['Official scorers have not yet decided how this play is charged (' +
          (row.eventType === 'os_ruling_pending_primary' ? 'primary event' : 'prior event') +
          ' ruling pending).'],
      });

      var isNewPending = upsertEntry({
        id: row.id,
        kind: 'pending',
        officialDate: expectedDate || state.date,
        gamePk: game.gamePk,
        matchupLabel: UI.abbr(teams.away) + ' @ ' + UI.abbr(teams.home),
        teams: teams,
        pending: row,
        review: {
          typeLabel: 'Official Scorer Ruling Pending',
          reason: row.eventType === 'os_ruling_pending_primary' ? 'Primary event ruling pending' : 'Prior event ruling pending',
          inningLabel: row.inningLabel,
          description: row.description,
          batter: { name: row.batter },
          pitcher: { name: row.pitcher },
          outcome: 'Pending',
          isABS: false,
          isBoundary: false,
          runsAtRiskCount: 0,
          family: 'pending',
        },
        stateBefore: beforeSnap,
        stateAfter: afterSnap,
        capturedAt: result.observedAt,
      });
      if (!isNewPending) {
        /* keep the newest captured state on the existing row */
        var stored = state.entries.find(function (e) { return e.id === row.id; });
        if (stored) { stored.stateAfter = afterSnap || stored.stateAfter; stored.capturedAt = result.observedAt; }
      }
      if (isNewPending && state.soundOn && claimAlert(row.id)) chime('pending');
    });

    /* A pending ruling that has disappeared from the payload has been decided:
     * close it in the book with the exact wording we last saw plus the state at
     * resolution.  Nothing is guessed about the new classification here — the
     * scoring-change diff below reports that, with its own before/after. */
    var openPending = ScoringLog.pending();
    openPending.forEach(function (rec) {
      if (rec.gamePk !== game.gamePk || pendingIds[rec.id]) return;
      /* Only a lean play-by-play scan can close a ruling, and only once that
       * scan has seen the plate appearance again: a projected resync (or a
       * partial payload) must never be able to close a ruling that is still
       * pending. */
      if (result.mode === 'resync') return;
      if (rec.atBatIndex !== null && rec.atBatIndex !== undefined &&
        state.coveredUpTo[game.gamePk] !== undefined && state.coveredUpTo[game.gamePk] < rec.atBatIndex) return;
      ScoringLog.revise(rec.id, 'Ruling no longer pending: the payload no longer carries ' + rec.eventType +
        ' for this plate appearance. Closed at ' + GameState.stamp(result.observedAt) +
        ' with the exact wording last observed.', {
        resolvedAt: result.observedAt || Date.now(),
        official: 'Pending ruling cleared (the play now carries a decided eventType in the official payload).',
        stateAfter: afterSnap,
      });
    });

    /* ---- official scoring changes ----------------------------------------
     * Diffed from consecutive observations (the payload has no change marker),
     * recorded in the official-scoring book with the exact initial wording and
     * the exact final wording plus both captured states, then mirrored into the
     * feed row and alerted once. */
    var snapshot = Reviews.snapshotPlays(plays);
    var previous = state.snapshots[game.gamePk];
    var diff = Reviews.diffSnapshots(previous, snapshot);
    if (result.mode === 'resync' && previous) {
      /* A resync is a *supplementary* read with a different `fields` projection.
       * Union it into the baseline (the fresher value wins per play) instead of
       * replacing it, so a field the projection happens to omit can never look
       * like a play that disappeared. */
      var union = Object.assign(Object.create(null), previous);
      Object.keys(snapshot).forEach(function (k) { union[k] = snapshot[k]; });
      state.snapshots[game.gamePk] = union;
      diff.vanished = [];
    } else {
      state.snapshots[game.gamePk] = snapshot;
    }

    diff.changes.forEach(function (change) {
      var changeId = game.gamePk + ':' + change.atBatIndex + ':scoring-change';
      ScoringLog.upsert({
        id: changeId,
        kind: 'change',
        date: expectedDate || state.date,
        gamePk: game.gamePk,
        matchup: UI.abbr(teams.away) + ' @ ' + UI.abbr(teams.home),
        atBatIndex: change.atBatIndex,
        inning: change.inningLabel,
        batter: change.batter,
        pitcher: null,
        eventType: change.to ? change.to.eventType : null,
        before: change.from ? change.from.description : null,
        after: change.to ? change.to.description : null,
        changes: Array.isArray(change.fields) ? change.fields : [],
        stateBefore: beforeSnap,
        stateAfter: afterSnap,
        firstObservedAt: change.from && change.from.observedAt ? change.from.observedAt : (result.observedAt || Date.now()),
        lastObservedAt: result.observedAt || Date.now(),
        observedLive: !firstObservation,
        source: change.attribution,
        notes: [
          'Official eventType: ' + (change.from ? change.from.eventType : '—') + ' → ' +
            (change.to ? change.to.eventType : '—') + '.',
          'Detected by diffing the official payload between two observations; MLB publishes no ' +
            'scoring-change marker, so the initial call above is the last wording observed before the change.',
        ],
      });

      var isNewChange = upsertEntry({
        id: changeId,
        kind: 'scoring_change',
        officialDate: expectedDate || state.date,
        gamePk: game.gamePk,
        matchupLabel: UI.abbr(teams.away) + ' @ ' + UI.abbr(teams.home),
        teams: teams,
        change: change,
        review: {
          typeLabel: 'Official Scoring Change',
          reason: '',
          inningLabel: change.inningLabel,
          description: 'Initial call: ' + (change.from.description || '') + ' → Final: ' + (change.to.description || ''),
          batter: { name: change.batter },
          pitcher: { name: '' },
          outcome: 'Reclassified',
          isABS: false,
          isBoundary: false,
          runsAtRiskCount: 0,
          family: 'scoring',
        },
        stateBefore: beforeSnap,
        stateAfter: afterSnap,
        capturedAt: result.observedAt,
      });
      if (isNewChange && state.soundOn && claimAlert(changeId)) chime('scoring');
      if (state.log) {
        state.log.grace = state.log.grace || {};
        state.log.grace[game.gamePk] = Date.now();
      }
    });

    diff.edits.forEach(function (edit) {
      noteIrregularity(game.gamePk, 'Play ' + edit.atBatIndex + ' edited without reclassification (' +
        edit.inningLabel + ') — flagged, not corrected.');
      /* A payload edit that is not a reclassification is still an official
       * change to the record of the play, so it is logged (never alerted). */
      ScoringLog.upsert({
        id: game.gamePk + ':' + edit.atBatIndex + ':scoring-edit',
        kind: 'change',
        date: expectedDate || state.date,
        gamePk: game.gamePk,
        matchup: UI.abbr(teams.away) + ' @ ' + UI.abbr(teams.home),
        atBatIndex: edit.atBatIndex,
        inning: edit.inningLabel,
        batter: edit.batter,
        eventType: edit.after ? edit.after.eventType : null,
        before: edit.before ? edit.before.description : null,
        after: edit.after ? edit.after.description : null,
        stateBefore: beforeSnap,
        stateAfter: afterSnap,
        firstObservedAt: result.observedAt || Date.now(),
        lastObservedAt: result.observedAt || Date.now(),
        observedLive: !firstObservation,
        source: 'Payload edit observed between two polls (no reclassification).',
        notes: [edit.note || 'Payload edited without reclassification.'],
      });
    });
    diff.vanished.forEach(function (gone) {
      noteIrregularity(game.gamePk, 'Play ' + gone.atBatIndex + ' (' + gone.inningLabel +
        ') disappeared from the payload after being observed — flagged, not corrected.');
    });

    /* ---- counter regressions & official MGR / ABS counters */
    state.counterCache = state.counterCache || Object.create(null);
    var prevCached = state.counterCache[game.gamePk] || null;
    var gdCounters = (result.countersPayload && result.countersPayload.gameData) || null;
    var rawMgr = (gdCounters && gdCounters.review) || result.payload.review || (game.review || null);
    var rawAbs = (gdCounters && gdCounters.absChallenges) || result.payload.absChallenges || null;
    var reviewCounters = Reviews.managerCounters(rawMgr) || (prevCached && prevCached.manager) || null;
    var absCounters = Reviews.absCounters(rawAbs) || (prevCached && prevCached.abs) || null;
    state.absFetchedRevCount[game.gamePk] = reviews.length;

    var regression = Reviews.counterRegression(prevCached, {
      manager: reviewCounters, abs: absCounters,
    });
    if (regression) {
      regression.forEach(function (note) {
        noteIrregularity(game.gamePk, 'Official counter ' + note + ' — flagged, not corrected.');
      });
    }
    state.counterCache[game.gamePk] = {
      manager: reviewCounters,
      abs: absCounters,
      awayAbbr: UI.abbr(teams.away),
      homeAbbr: UI.abbr(teams.home),
    };

    /* Remember how far this game has been ingested; used to tell "we watched
     * this arrive" apart from "we adopted an already-resolved event". */
    var highest = -1;
    plays.forEach(function (pl) {
      var idx = Number(pl && pl.about && pl.about.atBatIndex);
      if (isFinite(idx) && idx > highest) highest = idx;
    });
    state.coveredUpTo[game.gamePk] = highest;
    state.resyncDue[game.gamePk] = (result.mode === 'resync')
      ? Date.now() + RESYNC_MS
      : (state.resyncDue[game.gamePk] || 0);
  }

  /**
   * scheduleFor(date) — the slate for a date, memoized for SCHEDULE_TTL_MS.
   *
   * The scan used to re-request the schedule on every 250 ms tick (15 games =
   * ~4 requests/s of a document that changes once an inning).  Reusing it for
   * 400 ms frees that budget for the per-game feeds — the requests that
   * actually carry the play-by-play — and the 125 ms status sweep still sees a
   * review the instant MLB flips one.
   */
  function scheduleFor(date) {
    var now = Date.now();
    if (state.schedule.payload && state.schedule.date === date && now - state.schedule.at < SCHEDULE_TTL_MS) {
      state.servedFromScheduleCache += 1;
      return Promise.resolve(state.schedule.payload);
    }
    if (state.schedule.promise && state.schedule.date === date) return state.schedule.promise;
    var promise = MLB.schedule(date, { ttl: 0, retries: 0, bust: true, timeout: 6000 })
      .then(function (payload) {
        state.schedule = { at: Date.now(), payload: payload, promise: null, date: date };
        return payload;
      })
      .catch(function (err) {
        state.schedule.promise = null;
        throw err;
      });
    state.schedule = { at: state.schedule.at, payload: state.schedule.payload, promise: promise, date: date };
    return promise;
  }

  function scan() {
    if (state.scanning) return;
    if (document.hidden && !state.background) { scheduleScan(1000); return; }
    var scanSeq = state.dateSeq;
    var scanDate = state.date;
    state.scanning = true;
    state.scanStartedAt = Date.now();
    state.nextScanAt = state.scanStartedAt + SCAN_MS;

    scheduleFor(scanDate)
      .then(function (payload) {
        if (scanSeq !== state.dateSeq || scanDate !== state.date) return null;
        state.games = flattenGames(payload);
        state.scheduleLoaded = true;
        state.inReviewCount = state.entries.filter(function (e) { return e.review && e.review.inProgress; }).length;
        var now = Date.now();
        var due = state.games.filter(function (g) { return shouldFetch(g, now); });
        state.scanError = null;
        if (!due.length) {
          updateChrome();
          renderIfChanged();
          return null;
        }
        return runLimited(due, FETCH_CONCURRENCY, function (game) {
          if (scanSeq !== state.dateSeq || scanDate !== state.date) return Promise.resolve();
          /* Ingest + render the moment THIS game's response lands: a review that
           * arrives at 80 ms must not wait for a 900 ms sibling. */
          return requestGame(game, 'scan').then(function (result) {
            if (!result || scanSeq !== state.dateSeq || scanDate !== state.date) return;
            ingestGame(result, scanSeq, scanDate);
            persist(scanSeq, scanDate);
            renderSoon();
          });
        }).then(function () {
          if (scanSeq !== state.dateSeq || scanDate !== state.date) return;
          persist(scanSeq, scanDate);
          renderIfChanged();
          updateChrome();
        });
      })
      .catch(function (err) {
        if (scanSeq !== state.dateSeq || scanDate !== state.date) return;
        state.scanError = err;
        updateChrome();
      })
      .then(function () {
        if (scanSeq !== state.dateSeq || scanDate !== state.date) return;
        state.scanning = false;
        scheduleScan(nextScanDelay());
      });
  }

  /* Coalesce re-renders to one per frame: five games landing inside the same
   * millisecond must cost one DOM write, not five. */
  function renderSoon() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    clearTimeout(state.timers.render);
    state.timers.render = setTimeout(function () {
      state.renderQueued = false;
      renderIfChanged();
      updateChrome();
    }, RENDER_COALESCE_MS);
  }

  /**
   * resyncTick() — every second, any live game whose projected feed/live resync
   * is due gets one.  This is the safety net under the lean play-by-play scan:
   * it carries MLB's own `metaData.timeStamp` for the captured state, the full
   * currentPlay (batter / pitcher / on-deck), and any field a `fields`
   * projection happened to drop.
   */
  function resyncTick() {
    if (document.hidden && !state.background) return;
    if (!state.games.length) return;
    var now = Date.now();
    state.games.forEach(function (game) {
      if (!game || (game.status && game.status.abstractGameState) !== 'Live') return;
      var pk = game.gamePk;
      if (state.inFlight[pk]) return;
      if (now < (state.resyncDue[pk] || 0)) return;
      resyncGame(game);
    });
  }

  function resyncGame(game) {
    var pk = game.gamePk;
    state.resyncDue[pk] = Date.now() + RESYNC_MS;
    var seq = state.dateSeq;
    var date = state.date;
    requestGame(game, 'resync').then(function (result) {
      if (!result || !result.payload || seq !== state.dateSeq || date !== state.date) return;
      ingestGame(result, seq, date);
      persist(seq, date);
      renderSoon();
    });
  }

  /* Live games keep the 250 ms scan cadence; Preview, Final-grace, and
   * offseason/idle slates back off to match README etiquette. */
  function nextScanDelay() {
    var now = Date.now();
    var hasLive = state.games.some(function (g) {
      return g.status && g.status.abstractGameState === 'Live';
    });
    if (hasLive) return SCAN_MS;
    var hasInGraceFinal = state.games.some(function (g) {
      if (!g.status || g.status.abstractGameState !== 'Final') return false;
      var first = state.finalSeen[g.gamePk];
      return !first || (now - first) <= FINAL_GRACE_MS;
    });
    if (hasInGraceFinal) return 1000;
    var hasPreview = state.games.some(function (g) {
      return g.status && g.status.abstractGameState === 'Preview';
    });
    if (hasPreview) return 15000;
    return 30000;
  }

  function scheduleScan(delay) {
    clearTimeout(state.timers.scan);
    state.nextScanAt = Date.now() + delay;
    state.timers.scan = setTimeout(scan, delay);
  }

  /* 125 ms official status sweep: catches a review the moment MLB flips it. */
  function sweep() {
    if (document.hidden) return;
    var sweepSeq = state.dateSeq;
    var sweepDate = state.date;
    if (!state.games.some(function (g) { return g.status && g.status.abstractGameState === 'Live'; })) return;
    MLB.slateStatus(sweepDate).then(function (payload) {
      if (sweepSeq !== state.dateSeq || sweepDate !== state.date) return;
      var games = flattenGames(payload);
      games.forEach(function (g) {
        var review = Reviews.statusReview(g.status);
        var prev = state.statusByPk[g.gamePk];
        var nextKey = review ? review.code + '|' + review.reason : '';
        if (prev !== nextKey) {
          state.statusByPk[g.gamePk] = nextKey;
          if (review) {
            /* Out-of-band fetch the moment MLB flips the status: this does not
             * wait for the scan, and it also marks the game as due for the fast
             * 200 ms in-review probe until the review resolves. */
            if (state.inFlight[g.gamePk]) return;
            state.nextDue[g.gamePk] = 0;
            requestGame(g, 'scan').then(function (result) {
              if (!result || sweepSeq !== state.dateSeq || sweepDate !== state.date) return;
              ingestGame(result, sweepSeq, sweepDate);
              persist(sweepSeq, sweepDate);
              state.inReviewCount = state.entries.filter(function (e) { return e.review && e.review.inProgress; }).length;
              renderSoon();
            });
          }
        }
      });
    }).catch(function () { /* the scan owns error reporting */ });
  }

  /* ------------------------------------------------------------- sound/notify
   *
   * The tone itself lives in alert-sound.js: one shared audio graph, a ~3 s
   * raindrop shower, a motif per event type, and a persistent ledger of what has
   * already rung.  This page only decides *when* to ask for a sound, and every
   * call is guarded by the ledger (claimAlert) so nothing ever rings twice.
   */

  /* 0/1/unset preference — separate from the boolean-only savePref below so the
   * alert-mode selector can remember a named option. */
  function loadMode() {
    try {
      var raw = global.localStorage.getItem('mlbp.pref.alertMode');
      if (raw === 'alerts' || raw === 'scoring' || raw === 'off') return raw;
      /* Back-compatible: an older visit only stored the on/off flag. */
      var legacy = global.localStorage.getItem('mlbp.pref.sound');
      if (legacy === '1') return 'alerts';
      if (legacy === '0') return 'off';
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveMode(mode) {
    /* Both keys: `sound` is the historical on/off flag other pages and tests
     * read, `alertMode` remembers which of the three states was chosen. */
    savePref('sound', mode !== 'off');
    try { global.localStorage.setItem('mlbp.pref.alertMode', mode); } catch (e) { /* ignore */ }
  }

  var ALERT_FOR = {
    review: 'review',
    risk: 'risk',
    pending: 'pending',
    scoring: 'scoring',
    preview: 'review',
  };

  function chime(kind) {
    if (!state.soundOn) return null;
    /* lastChimeAt = the last moment an alert was *issued* (whether or not a
     * Web Audio context existed), which is what the page reports. */
    state.lastChimeAt = Date.now();
    if (!AlertSound) return null;
    return AlertSound.play(ALERT_FOR[kind] || 'review');
  }

  /** Claim the right to alert for an event id — exactly once per date. */
  function claimAlert(id) {
    if (!AlertSound || !id) return true;
    var date = state.date;
    if (AlertSound.has(date, id)) return false;
    return AlertSound.claim(date, id);
  }

  function notifyRunAtRisk(review, teams) {
    if (!state.notifyOn) return;
    if (typeof global.Notification !== 'function') return;
    if (global.Notification.permission !== 'granted') return;
    try {
      var title = '⚠️ Run at risk — ' + UI.abbr(teams.away) + ' @ ' + UI.abbr(teams.home);
      var body = review.typeLabel + (review.reason ? ' (' + review.reason + ')' : '') +
        ' · ' + review.inningLabel + ' — ' + review.runsAtRiskCount + ' run(s) credited to the reviewed play.';
      new global.Notification(title, { body: body, tag: review.id });
    } catch (e) { /* ignore */ }
  }

  function loadPref(key, fallback) {
    try {
      var raw = global.localStorage.getItem('mlbp.pref.' + key);
      return raw === null ? fallback : raw === '1';
    } catch (e) { return fallback; }
  }

  function savePref(key, value) {
    try { global.localStorage.setItem('mlbp.pref.' + key, value ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ render */

  function entryMatches(entry, filter) {
    if (!entry) return false;
    if (filter === 'all') return (entry.kind === 'review' || entry.kind === 'pending' || entry.kind === 'scoring_change') && !(entry.review && entry.review.isABS);
    if (filter === 'abs') return entry.review && entry.review.isABS;
    if (filter === 'challenges') return entry.review && entry.review.family === 'manager';
    if (filter === 'reviews') return entry.review && (entry.review.family === 'umpire' || entry.review.family === 'replay');
    if (filter === 'boundary') return entry.review && entry.review.isBoundary;
    if (filter === 'under') return entry.review && entry.review.inProgress;
    if (filter === 'risk') return entry.review && entry.review.runsAtRiskCount > 0;
    if (filter === 'scoring') return entry.kind === 'scoring_change';
    return true;
  }

  function visibleEntries() {
    return state.entries.filter(function (e) { return entryMatches(e, state.filter); })
      .sort(function (a, b) { return (b.lastSeen || 0) - (a.lastSeen || 0); });
  }

  function statsFor() {
    var s = { total: 0, manager: 0, umpire: 0, abs: 0, boundary: 0, under: 0, risk: 0, scoring: 0 };
    state.entries.forEach(function (e) {
      if (e.kind === 'scoring_change') { s.scoring += 1; return; }
      if (e.kind !== 'review') return;
      var r = e.review;
      if (!r) return;
      if (r.isABS) s.abs += 1; else s.total += 1;
      if (r.family === 'manager') s.manager += 1;
      if (r.family === 'umpire' || r.family === 'replay') s.umpire += 1;
      if (r.isBoundary) s.boundary += 1;
      if (r.inProgress) s.under += 1;
      if (r.runsAtRiskCount > 0) s.risk += 1;
    });
    return s;
  }

  function renderTabs() {
    var nav = $('feed-tabs');
    if (!nav) return;
    nav.innerHTML = FILTERS.map(function (f) {
      var count = state.entries.filter(function (e) { return entryMatches(e, f.id); }).length;
      return '<button class="tab-btn' + (state.filter === f.id ? ' tab-on' : '') + '" data-filter="' + f.id + '">' +
        UI.esc(f.label) + (count ? ' <span class="tab-badge">' + count + '</span>' : '') + '</button>';
    }).join('');
  }

  function renderStats() {
    var el = $('feed-stats');
    if (!el) return;
    var s = statsFor();
    var lat = latencyStats();
    var scoringStats = ScoringLog ? ScoringLog.stats() : { pending: 0, changes: 0 };
    var liveGames = state.games.filter(function (g) { return g.status && g.status.abstractGameState === 'Live'; }).length;
    var tiles = [
      { n: s.total, label: 'Reviews', cls: '' },
      { n: s.manager, label: 'Challenges', cls: '' },
      { n: s.umpire, label: 'Umpire reviews', cls: '' },
      { n: s.abs, label: 'ABS challenges', cls: '' },
      { n: s.boundary, label: 'Boundary calls', cls: '' },
      { n: s.under, label: 'Under review', cls: '' },
      { n: s.risk, label: 'Runs at risk', cls: 'is-risk' },
      { n: s.scoring, label: 'Scoring changes', cls: '' },
      { n: liveGames, label: 'Live games', cls: 'is-live' },
      { n: scoringStats.pending, label: 'Rulings pending', cls: scoringStats.pending ? 'is-pending' : '' },
      { n: lat.count, label: 'Polls measured', cls: '' },
      { n: lat.median === null ? '—' : (lat.median / 1000).toFixed(2) + 's', label: 'Median response', cls: '' },
      { n: lat.p95 === null ? '—' : (lat.p95 / 1000).toFixed(2) + 's', label: 'P95 response', cls: '' },
      { n: state.inReviewCount, label: 'Fast probes', cls: '' },
    ];
    el.innerHTML = tiles.map(function (t) {
      return '<div class="stat-tile ' + t.cls + '"><div class="stat-num">' + UI.esc(t.n) + '</div>' +
        '<div class="stat-label">' + UI.esc(t.label) + '</div></div>';
    }).join('');
  }

  function renderBanner() {
    var el = $('banner');
    if (!el) return;
    var atRisk = state.entries.filter(function (e) {
      return e.review && e.review.inProgress && e.review.runsAtRiskCount > 0;
    });
    if (!atRisk.length) { el.innerHTML = ''; return; }
    el.innerHTML = atRisk.map(function (e) {
      var r = e.review;
      return '<div class="banner-item">' +
        '⚠️ <strong>' + UI.esc(r.runsAtRiskCount + ' run' + (r.runsAtRiskCount === 1 ? '' : 's') + ' at risk') + '</strong>' +
        ' — <a class="banner-link" href="game.html?gamePk=' + encodeURIComponent(e.gamePk) + '&date=' + encodeURIComponent(state.date) + '">' +
        UI.esc(e.matchupLabel || '') + '</a> · ' + UI.esc(r.typeLabel + (r.reason ? ': ' + r.reason : '')) +
        (r.inningLabel ? ' (' + UI.esc(r.inningLabel) + ')' : '') +
      '</div>';
    }).join('');
  }

  function renderActiveStrip() {
    var el = $('active-strip');
    if (!el) return;
    var active = state.entries.filter(function (e) { return e.review && e.review.inProgress; });
    if (!active.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="active-strip"><h3>Under review</h3><div class="active-items">' +
      active.map(function (e) {
        var r = e.review;
        var cached = state.counterCache && state.counterCache[e.gamePk];
        var bothSummary = cached ? Reviews.countersSummary(cached) : '';
        return '<div class="active-item">' +
          '<a href="game.html?gamePk=' + encodeURIComponent(e.gamePk) + '&date=' + encodeURIComponent(state.date) + '"><b>' + UI.esc(e.matchupLabel || '') + '</b></a>' +
          UI.chip(r.typeLabel + (r.reason ? ': ' + r.reason : ''), r.isABS ? 'chip-abs' : 'chip-review') +
          '<span>' + UI.esc(r.inningLabel || '') + '</span>' +
          (r.runsAtRiskCount ? UI.chip('⚠️ ' + r.runsAtRiskCount + ' run(s) at risk', 'chip-danger') : '') +
          (bothSummary ? '<span class="counter-note">' + UI.esc(bothSummary) + '</span>' : '') +
          '</div>';
      }).join('') + '</div></div>';
  }

  function scoreLine(label, score) {
    if (!score) return '';
    return '<dt>' + UI.esc(label) + '</dt><dd>' + UI.esc(score.away) + '–' + UI.esc(score.home) + '</dd>';
  }

  /* -------------------------------------------------- captured state panels */

  /* "Score 4–1 · Bot 6 · 1 out · 2-1 · Bleday vs Walker · P 78"
   * with the exact observation clock underneath.  Used for the before/after
   * pair on every reviewed play, pending ruling and scoring change. */
  function stateBlock(label, snap, opts) {
    if (!snap) {
      return '<div class="state-block is-empty"><div class="state-label">' + UI.esc(label) + '</div>' +
        '<div class="state-line">Not observed — the page opened after this event (nothing is inferred).</div></div>';
    }
    var chips = [];
    if (snap.inning) chips.push(snap.inning);
    if (snap.outs !== null && snap.outs !== undefined) chips.push(snap.outs + ' out' + (snap.outs === 1 ? '' : 's'));
    if (snap.count && (snap.count.balls !== null || snap.count.strikes !== null)) {
      chips.push((snap.count.balls === null ? '—' : snap.count.balls) + '-' + (snap.count.strikes === null ? '—' : snap.count.strikes));
    }
    if (snap.pitchCount && snap.pitchCount.game !== null && snap.pitchCount.game !== undefined) chips.push('P ' + snap.pitchCount.game);
    var timecode = snap.timecode && snap.timecode.timeStamp
      ? '<span class="state-timecode" title="MLB metaData.timeStamp — the official provenance of this state">MLB ' + UI.esc(snap.timecode.timeStamp) + '</span>'
      : '';
    return '<div class="state-block' + (opts && opts.cls ? ' ' + opts.cls : '') + '">' +
      '<div class="state-label">' + UI.esc(label) + '</div>' +
      '<div class="state-line"><b>' + UI.esc(snap.score ? (snap.score.away === null ? '—' : snap.score.away) + '–' + (snap.score.home === null ? '—' : snap.score.home) : '—') + '</b>' +
        (chips.length ? ' · ' + UI.esc(chips.join(' · ')) : '') + '</div>' +
      (snap.batter || snap.pitcher
        ? '<div class="state-line">' + UI.esc(snap.batter || '—') + (snap.pitcher ? ' vs ' + UI.esc(snap.pitcher) : '') + '</div>' : '') +
      '<div class="state-stamp">Observed ' + UI.esc(snap.stamp || '') + ' local · ' + UI.esc(snap.utc || '') + ' ' + timecode + '</div>' +
      '</div>';
  }

  /* Before → after pair plus the exact official wording on both sides. */
  function beforeAfterHtml(entry) {
    if (!entry || (!entry.stateBefore && !entry.stateAfter && !entry.officialBefore && !entry.officialAfter)) return '';
    var wording = '';
    if (entry.officialBefore || entry.officialAfter) {
      wording = '<div class="official-pair">' +
        (entry.officialBefore ? '<div class="official-row"><span>Before</span><p>' + UI.esc(entry.officialBefore) + '</p></div>' : '') +
        (entry.officialAfter ? '<div class="official-row"><span>After</span><p>' + UI.esc(entry.officialAfter) + '</p></div>' : '') +
        '</div>';
    }
    /* When both halves came from the same poll (the event was already there on
     * the first observation of this game) the two blocks would be identical —
     * say that once instead of printing the same line twice. */
    var samePoll = entry.stateBefore && entry.stateAfter &&
      entry.stateBefore.at && entry.stateAfter.at &&
      Math.abs(entry.stateAfter.at - entry.stateBefore.at) < 50;
    var unchanged = samePoll || (entry.stateBefore && entry.stateAfter &&
      entry.stateBefore.summary === entry.stateAfter.summary);
    if (unchanged && entry.stateAfter) {
      return '<div class="before-after is-single">' +
        stateBlock('State when observed', entry.stateAfter, { cls: 'is-wide' }) +
        '<div class="ba-note">' + (samePoll
          ? 'First observation of this event — there is no earlier poll to compare, so nothing is inferred about the state before it.'
          : 'The captured state was unchanged across the two observations either side of this event.') +
        '</div></div>' + wording;
    }
    return '<div class="before-after">' +
      stateBlock('Before', entry.stateBefore) +
      '<div class="ba-arrow">→</div>' +
      stateBlock('After', entry.stateAfter) +
      '</div>' + wording;
  }

  /* The live board: one row per game, straight from the captured state. */
  function renderLiveState() {
    var el = $('live-state');
    if (!el) return;
    var games = state.games.filter(function (g) { return g.status && g.status.abstractGameState === 'Live'; });
    if (!games.length) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var rows = games.map(function (g) {
      var st = state.liveState[g.gamePk];
      var lat = gameLatency(g.gamePk);
      var review = state.entries.filter(function (e) {
        return String(e.gamePk) === String(g.gamePk) && e.review && e.review.inProgress;
      })[0];
      var counters = state.counterCache && state.counterCache[g.gamePk];
      if (!st) {
        return '<div class="live-row"><a class="live-teams" href="game.html?gamePk=' + encodeURIComponent(g.gamePk) + '&date=' + encodeURIComponent(state.date) + '">' +
          UI.esc(UI.abbr((g.teams && g.teams.away && g.teams.away.team) || {}) + ' @ ' + UI.abbr((g.teams && g.teams.home && g.teams.home.team) || {})) +
          '</a><span class="live-note">capturing…</span></div>';
      }
      var score = GameState.scoreText(st);
      var half = GameState.halfLabel(st);
      var count = GameState.countText(st);
      return '<div class="live-row' + (review ? ' is-review' : '') + '">' +
        '<a class="live-teams" href="game.html?gamePk=' + encodeURIComponent(g.gamePk) + '&date=' + encodeURIComponent(state.date) + '">' +
          UI.esc((st.teams.away ? UI.abbr(st.teams.away) : '') + ' @ ' + (st.teams.home ? UI.abbr(st.teams.home) : '')) + '</a>' +
        '<b class="live-score">' + UI.esc(score) + '</b>' +
        '<span class="live-meta">' + UI.esc([half,
          st.outs === null || st.outs === undefined ? '' : st.outs + ' out',
          count ? 'count ' + count : '',
          st.batter && st.batter.name ? st.batter.name : '',
          st.pitcher && st.pitcher.name ? 'vs ' + st.pitcher.name : '',
          st.pitchCount && st.pitchCount.game !== null ? 'P ' + st.pitchCount.game : ''].filter(Boolean).join(' · ')) + '</span>' +
        '<span class="live-clock" title="Captured to the second — local time">' + UI.esc(GameState.clock(st.observedAt)) + '</span>' +
        (st.timecode && st.timecode.timeStamp
          ? '<span class="live-timecode" title="MLB metaData.timeStamp for this state">' + UI.esc(st.timecode.timeStamp) + '</span>'
          : '<span class="live-timecode" title="The official feed/live timecode is fetched by the 10 s resync">—</span>') +
        (lat !== null ? '<span class="live-latency" title="Round trip of the most recent poll for this game">' + (lat / 1000).toFixed(2) + 's</span>' : '<span class="live-latency">—</span>') +
        (review ? UI.chip(review.review.typeLabel + (review.review.reason ? ': ' + review.review.reason : ''), 'chip-danger') : '') +
        (review ? '<button class="btn btn-mini" onclick="ReplayFeed.replayAlert(\'review\')" title="Play the alert tone for a review, without touching the alert ledger">🔔</button>' : '') +
        (counters ? '<span class="live-counters" title="' + UI.esc(Reviews.countersSummary(counters)) + '">' + UI.esc(Reviews.countersSummary(counters)) + '</span>' : '') +
        '</div>';
    }).join('');
    el.innerHTML = '<div class="live-board"><h3>Live game state <span class="live-board-sub">captured to the second · ' +
      UI.esc(latencyStats().count ? ('median response ' + (latencyStats().median / 1000).toFixed(2) + 's') : 'measuring…') + '</span></h3>' +
      '<div class="live-rows">' + rows + '</div></div>';
  }

  /**
   * renderScoringSection() — the OFFICIAL SCORING book, rendered from
   * ScoringLog (never from the feed rows).  It is its own section with its own
   * tabs and its own storage, so a change to the alert system cannot disturb it
   * and vice versa.
   */
  function renderScoringSection() {
    var el = $('scoring-section');
    if (!el) return;
    if (!ScoringLog) { el.innerHTML = ''; return; }
    var view = state.scoringView || 'all';
    var stats = ScoringLog.stats();
    var records = ScoringLog.all().filter(function (r) {
      if (view === 'pending') return r.kind === 'pending' && !r.resolvedAt;
      if (view === 'resolved') return r.kind === 'pending' && r.resolvedAt;
      if (view === 'changes') return r.kind === 'change';
      return true;
    });
    var tabs = [
      { id: 'all', label: 'All records' },
      { id: 'pending', label: 'Pending' },
      { id: 'resolved', label: 'Resolved pending' },
      { id: 'changes', label: 'Scoring changes' },
    ];
    var head = '<div class="scoring-head">' +
      '<h2>Official scoring log <span class="scoring-sub">separate record book · persistent through refreshes · never touched by the alert system</span></h2>' +
      '<div class="scoring-stats">' +
        '<span><b>' + stats.total + '</b> records</span>' +
        '<span><b>' + stats.pending + '</b> pending</span>' +
        '<span><b>' + stats.changes + '</b> changes</span>' +
        '<span><b>' + stats.games + '</b> games</span>' +
        '<span><b>' + stats.live + '</b> observed live</span>' +
        '<span><b>' + stats.adopted + '</b> adopted from the store</span>' +
        '<span class="scoring-store" title="Where this book lives">' +
          UI.esc(ScoringLog.apiState.available ? 'browser + shared server store' : 'browser store (survives refreshes)') + '</span>' +
      '</div>' +
      '<div class="scoring-actions">' +
        tabs.map(function (t) {
          return '<button class="tab-btn' + (view === t.id ? ' tab-on' : '') + '" onclick="ReplayFeed.setScoringView(\'' + t.id + '\')">' + UI.esc(t.label) + '</button>';
        }).join('') +
        '<button class="btn btn-mini" onclick="ReplayFeed.downloadScoringLog()" title="Download the official scoring log for this date as text">⬇ Export</button>' +
      '</div>' +
      '</div>';

    var body;
    if (!records.length) {
      body = '<div class="feed-empty">No official-scoring records for ' + UI.esc(MLB.formatDateLabel(state.date)) +
        ' yet. A pending ruling appears here the moment the official payload carries ' +
        '<code>os_ruling_pending_primary</code> / <code>os_ruling_pending_prior</code>, and a scoring change ' +
        'the moment two consecutive polls disagree about a completed play. Both are stored before anything is alerted.</div>';
    } else {
      body = records.map(renderScoringRecord).join('');
    }
    el.innerHTML = '<section class="scoring-section-inner">' + head + '<div class="scoring-list">' + body + '</div></section>';
  }

  function renderScoringRecord(rec) {
    var isPending = rec.kind === 'pending';
    var state0 = rec.stateBefore;
    var state1 = rec.stateAfter;
    var changeList = (rec.changes || []).map(function (c) {
      return '<div class="scoring-change-line"><span>' + UI.esc(c.label || c.field) + '</span> ' +
        UI.esc(c.from) + ' → <b>' + UI.esc(c.to) + '</b></div>';
    }).join('');
    return '<article class="scoring-record' + (isPending && !rec.resolvedAt ? ' is-open' : '') + '">' +
      '<div class="scoring-record-top">' +
        '<span class="scoring-kind">' + (isPending ? (rec.resolvedAt ? '📝 Resolved pending' : '📝 Pending') : '✏️ Change') + '</span>' +
        (rec.gamePk !== null ? '<a href="game.html?gamePk=' + encodeURIComponent(rec.gamePk) + '&date=' + encodeURIComponent(state.date) + '">' + UI.esc(rec.matchup || ('game ' + rec.gamePk)) + '</a>' : '') +
        (rec.inning ? '<span>' + UI.esc(rec.inning) + '</span>' : '') +
        (rec.atBatIndex !== null && rec.atBatIndex !== undefined ? '<span>atBatIndex ' + UI.esc(rec.atBatIndex) + '</span>' : '') +
        '<span class="scoring-when" title="First / last observation (local, to the second)">' +
          UI.esc(rec.firstObservedAt ? GameState.stamp(rec.firstObservedAt) : '—') +
          (rec.lastObservedAt && rec.lastObservedAt !== rec.firstObservedAt ? ' → ' + UI.esc(GameState.stamp(rec.lastObservedAt)) : '') +
        '</span>' +
        UI.chip(rec.observedLive ? 'observed live' : 'adopted from store', rec.observedLive ? 'chip-ok' : 'chip-warn') +
      '</div>' +
      '<div class="scoring-body">' +
        '<div class="scoring-official">' +
          (rec.before ? '<div class="official-row"><span>Official wording before</span><p>' + UI.esc(rec.before) + '</p></div>' : '') +
          (rec.after ? '<div class="official-row"><span>Official wording after</span><p>' + UI.esc(rec.after) + '</p></div>' : '') +
          (rec.eventType ? '<div class="official-row"><span>eventType</span><p><code>' + UI.esc(rec.eventType) + '</code></p></div>' : '') +
          (changeList ? '<div class="scoring-changes-block">' + changeList + '</div>' : '') +
        '</div>' +
        '<div class="before-after">' +
          stateBlock('State before', state0) +
          '<div class="ba-arrow">→</div>' +
          stateBlock('State after', state1) +
        '</div>' +
        ((rec.notes && rec.notes.length) ? '<div class="scoring-notes">' + rec.notes.map(function (n) {
          return '<div>' + UI.esc(n) + '</div>';
        }).join('') + '</div>' : '') +
        ((rec.revisions && rec.revisions.length) ? '<div class="scoring-revisions">' + rec.revisions.map(function (v) {
          return '<div><span>' + UI.esc(GameState.stamp(v.at)) + '</span> ' + UI.esc(v.note) + '</div>';
        }).join('') + '</div>' : '') +
        (rec.source ? '<div class="scoring-source">Source: ' + UI.esc(rec.source) + '</div>' : '') +
      '</div>' +
      '</article>';
  }

  function renderRow(entry) {
    var r = entry.review || {};
    var tracker = entry.scoreTracker || {};
    var cls = 'feed-row';
    if (r.inProgress) cls += ' is-live';
    if (r.runsAtRiskCount) cls += ' is-at-risk';

    var avatar = r.isABS ? '🎯' : r.isBoundary ? '📏' : entry.kind === 'scoring_change' ? '✏️' : entry.kind === 'pending' ? '📝' : '🚨';

    var chips = [];
    chips.push(UI.chip(r.typeLabel || 'Review', r.isABS ? 'chip-abs' : 'chip-review'));
    if (r.reason) chips.push(UI.chip(r.reason, 'chip-review'));
    if (r.isBoundary) chips.push(UI.chip('Boundary call', 'chip-warn'));
    if (r.inProgress) chips.push(UI.chip('Under review', 'chip-warn'));
    else if (r.outcome) chips.push(UI.chip(r.outcome, r.outcome === 'Overturned' ? 'chip-ok' : ''));
    if (r.runsAtRiskCount) chips.push(UI.chip('⚠️ ' + r.runsAtRiskCount + ' run(s) at risk', 'chip-danger'));

    var trackerHtml = '';
    if (entry.kind === 'review' && (tracker.before || tracker.possible || tracker.actual)) {
      trackerHtml = '<dl class="score-track">' +
        (tracker.before ? scoreLine('Before review', tracker.before) : '<dt>Before review</dt><dd>— (not observed before ruling)</dd>') +
        (tracker.possible ? scoreLine('Possible after (conditional)', tracker.possible)
          : (r.isBoundary && !(r.runsAtRiskCount > 0)
            /* README: "A boundary review with no currently credited run says
             * 'score impact pending' and does not invent an alternate score." */
            ? '<dt>Possible after (conditional)</dt><dd>score impact pending</dd>'
            : (r.runsAtRiskCount > 0
              ? '<dt>Possible after (conditional)</dt><dd>— (not observed before ruling)</dd>'
              : ''))) +
        scoreLine('Actual after (official)', tracker.actual) +
        '</dl>';
    }

    var absLine = '';
    if (r.isABS && r.absCountBefore) {
      absLine = '<div class="feed-sub">Pitch ' + UI.esc(r.absPitchNumber) +
        ' · count before ' + r.absCountBefore.balls + '-' + r.absCountBefore.strikes +
        (r.absCountAfter ? ' · after ' + r.absCountAfter.balls + '-' + r.absCountAfter.strikes : '') + '</div>';
    }

    var counterText = '';
    var counterSummaryTitle = '';
    var cached = state.counterCache && state.counterCache[entry.gamePk];
    /* README counter examples prefix the challenging team's abbreviation
     * ("CIN: 2 ABS challenges left now (…)" / "PIT: 1 manager challenge left
     * now (0 used)"). */
    var challengerLabel = (r.challengerSide && entry.teams && entry.teams[r.challengerSide])
      ? UI.abbr(entry.teams[r.challengerSide]) : '';
    if (cached) {
      counterSummaryTitle = Reviews.countersSummary(cached);
      if (r.family === 'manager' && r.challengerSide && cached.manager && cached.manager[r.challengerSide]) {
        counterText = Reviews.counterLine({ manager: cached.manager, side: r.challengerSide, label: challengerLabel });
      }
      if (r.isABS && r.challengerSide && cached.abs && cached.abs[r.challengerSide]) {
        counterText = Reviews.counterLine({ abs: cached.abs, side: r.challengerSide, label: challengerLabel });
      }
      if (!counterText && counterSummaryTitle) {
        counterText = counterSummaryTitle;
      }
    }

    /* Exact official state before/after plus the official wording on both
     * sides — the same pair the separate official-scoring book stores. */
    var capture = beforeAfterHtml({
      stateBefore: entry.stateBefore,
      stateAfter: entry.stateAfter,
      officialBefore: entry.kind === 'scoring_change' && entry.change && entry.change.from
        ? entry.change.from.description : (entry.kind === 'pending' && entry.pending ? entry.pending.description : null),
      officialAfter: entry.kind === 'scoring_change' && entry.change && entry.change.to
        ? entry.change.to.description : null,
    });

    var changeHtml = '';
    if (entry.kind === 'scoring_change' && entry.change) {
      changeHtml = '<div class="feed-sub">Initial call: ' + UI.esc(entry.change.from && entry.change.from.description ? entry.change.from.description : '') +
        '</div><div class="feed-sub">Final ruling: ' + UI.esc(entry.change.to && entry.change.to.description ? entry.change.to.description : '') + '</div>' +
        (entry.change.scoreAfter ? '<div class="feed-sub">Official score after the play: ' +
          UI.esc(entry.change.scoreAfter.away) + '–' + UI.esc(entry.change.scoreAfter.home) + '</div>' : '') +
        '<div class="feed-irregular">Attribution: ' + UI.esc(entry.change.attribution || '') + '</div>';
    }

    var pendingHtml = '';
    if (entry.kind === 'pending' && entry.pending) {
      pendingHtml = '<div class="feed-sub">' + UI.esc(entry.pending.description || '') + '</div>' +
        '<div class="feed-irregular">Source: ' + UI.esc(entry.pending.source || '') + '</div>';
    }

    /* Irregularity notes that name this entry's id belong on this row only —
     * never repeat a game's first note on every row. Game-level notes (no
     * entry id) render once as flagged rows in renderList. */
    var irregularity = '';
    (state.irregularities[entry.gamePk] || []).some(function (n) {
      if (entry.id && n.indexOf(entry.id) !== -1) { irregularity = n; return true; }
      return false;
    });

    return '<div class="' + cls + '">' +
      '<div class="feed-avatar">' + avatar + '</div>' +
      '<div class="feed-body">' +
        '<div class="feed-top">' +
          '<a href="game.html?gamePk=' + encodeURIComponent(entry.gamePk) + '&date=' + encodeURIComponent(state.date) + '"><b>' + UI.esc(entry.matchupLabel || '') + '</b></a>' +
          '<span>' + UI.esc(r.inningLabel || '') + '</span>' +
          (r.challengerSide && r.challengerSide !== 'unknown' && r.challenger
            ? '<span>Challenged by ' + UI.esc(r.challenger) + (r.challengerRole ? ' (' + UI.esc(r.challengerRole) + ')' : '') + '</span>' : '') +
          '<span>' + new Date(entry.lastSeen || Date.now()).toLocaleTimeString() + '</span>' +
          '<a href="https://statsapi.mlb.com/api/v1/game/' + encodeURIComponent(entry.gamePk) + '/playByPlay" target="_blank" rel="noopener" title="Official MLB StatsAPI play-by-play source">MLB API ↗</a>' +
        '</div>' +
        '<div class="feed-title">' + UI.esc((r.batter && r.batter.name) || '') +
          (r.pitcher && r.pitcher.name ? ' vs ' + UI.esc(r.pitcher.name) : '') + '</div>' +
        (r.description ? '<div class="feed-sub">' + UI.esc(r.description) + '</div>' : '') +
        absLine + changeHtml + pendingHtml +
        capture +
        (trackerHtml ? trackerHtml : '') +
        (counterText ? '<div class="counter-note"' + (counterSummaryTitle ? ' title="' + UI.esc(counterSummaryTitle) + '"' : '') + '>' + UI.esc(counterText) + '</div>' : '') +
        (irregularity ? '<div class="feed-irregular">⚠️ ' + UI.esc(irregularity) + '</div>' : '') +
        '<div class="feed-chips">' + chips.join('') + '</div>' +
      '</div>' +
    '</div>';
  }

  /* Same idea as the scoreboard: only touch the DOM when the tracked data
   * actually changed, so a 250 ms scan does not re-create identical rows. */
  function offerRecentDate() {
    if (state.lastGameDate !== undefined || state.lookingForRecent) return;
    state.lookingForRecent = true;
    var reqSeq = state.dateSeq;
    var reqDate = state.date;
    var from = MLB.shiftISODate(reqDate, -180);
    var to = MLB.shiftISODate(reqDate, 180);
    MLB.scheduleRange(from, to)
      .then(function (payload) {
        if (reqSeq !== state.dateSeq || reqDate !== state.date) return;
        var dates = ((payload && payload.dates) || []).filter(function (d) {
          return d && d.date && d.totalGames > 0;
        });
        var past = dates.filter(function (d) { return d.date <= reqDate; });
        var upcoming = dates.filter(function (d) { return d.date > reqDate; });
        state.lastGameDate = past.length ? past[past.length - 1].date : null;
        state.nextGameDate = upcoming.length ? upcoming[0].date : null;
      })
      .catch(function () {
        if (reqSeq === state.dateSeq && reqDate === state.date) {
          state.lastGameDate = null;
          state.nextGameDate = null;
        }
      })
      .then(function () {
        if (reqSeq !== state.dateSeq || reqDate !== state.date) return;
        state.lookingForRecent = false;
        if (state.lastGameDate || state.nextGameDate) render();
      });
  }

  function entriesSignature() {
    var scoringSig = '';
    if (ScoringLog) {
      scoringSig = (state.scoringView || 'all') + ':' + ScoringLog.state.records.length + ':' +
        ScoringLog.state.records.map(function (r) {
          return r.id + ',' + r.lastObservedAt + ',' + (r.resolvedAt || '');
        }).join('|');
    }
    var liveSig = state.games.map(function (g) {
      var st = state.liveState[g.gamePk];
      return g.gamePk + ':' + (g.status && g.status.abstractGameState) + ':' + (st ? stateSignature(st) : '');
    }).join('|');
    var lat = latencyStats();
    return state.filter + '|' + (state.scheduleLoaded ? '1' : '0') + '|' + state.games.length + '|' + (state.lastGameDate || '') + '|' + (state.nextGameDate || '') + '|' +
      lat.count + ':' + lat.median + '|' + liveSig + '|' + scoringSig + '|' + state.entries.map(function (e) {
      return [e.id, e.lastSeen, e.review && e.review.outcome, e.review && e.review.inProgress,
        e.stateAfter ? e.stateAfter.at : '',
        e.scoreTracker && e.scoreTracker.actual ? e.scoreTracker.actual.away + '-' + e.scoreTracker.actual.home : '',
        e.scoreTracker && e.scoreTracker.before ? e.scoreTracker.before.away + '-' + e.scoreTracker.before.home : ''].join(':');
    }).join('|');
  }

  function renderIfChanged() {
    var sig = entriesSignature();
    if (sig === state.lastRenderSignature) return;
    state.lastRenderSignature = sig;
    render();
  }

  /* One flagged row for a game-level irregularity (a note that names no
   * entry). Rendered once per note above the entry rows: flagged for review,
   * never corrected or hidden (uploaded reviews.html footer). */
  function flaggedRowHtml(entry, note) {
    return '<div class="feed-row flagged-row">' +
      '<div class="feed-avatar">🚩</div>' +
      '<div class="feed-body">' +
        '<div class="feed-top">' +
          '<a href="game.html?gamePk=' + encodeURIComponent(entry.gamePk) + '&date=' + encodeURIComponent(state.date) + '"><b>' + UI.esc(entry.matchupLabel || '') + '</b></a>' +
          '<span>Flagged for review</span>' +
          '<a href="https://statsapi.mlb.com/api/v1/game/' + encodeURIComponent(entry.gamePk) + '/playByPlay" target="_blank" rel="noopener" title="Official MLB StatsAPI play-by-play source">MLB API ↗</a>' +
        '</div>' +
        '<div class="feed-irregular">⚠️ ' + UI.esc(note) + '</div>' +
        '<div class="feed-chips">' + UI.chip('Irregularity', 'chip-warn') + UI.chip('Source data', 'chip-review') + '</div>' +
      '</div>' +
    '</div>';
  }

  function render() {
    renderBanner();
    renderTabs();
    renderStats();
    renderActiveStrip();
    renderLiveState();
    renderScoringSection();
    var list = $('feed-list');
    if (!list) return;
    var rows = visibleEntries();
    if (!rows.length) {
      var emptyNote = 'No tracked events for this date and filter yet. New challenges, reviews, boundary calls, ABS challenges, official-scorer pending rulings and official scoring changes appear here live.';
      if (!state.scheduleLoaded && !state.entries.length) {
        list.innerHTML = '<div class="feed-empty">Scanning games for ' + UI.esc(MLB.formatDateLabel(state.date)) + '…</div>';
      } else if (!state.games.length && !state.entries.length) {
        list.innerHTML = '<div class="panel" style="text-align:center;color:var(--muted)">' +
          'No games scheduled for ' + UI.esc(MLB.formatDateLabel(state.date)) + '.' +
          '<div class="feed-empty">' + UI.esc(emptyNote) + '</div>' +
          (state.lastGameDate
            ? '<div style="margin-top:10px">Most recent date with games: ' +
              UI.esc(MLB.formatDateLabel(state.lastGameDate)) + ' ' +
              '<button class="btn" onclick="ReplayFeed.setDate(\'' + state.lastGameDate + '\')">Show it</button></div>'
            : '') +
          (state.nextGameDate
            ? '<div style="margin-top:8px">Next scheduled game day: ' +
              UI.esc(MLB.formatDateLabel(state.nextGameDate)) + ' ' +
              '<button class="btn" onclick="ReplayFeed.setDate(\'' + state.nextGameDate + '\')">Show it</button></div>'
            : '') +
          '</div>';
        offerRecentDate();
      } else {
        list.innerHTML = '<div class="feed-empty">' + UI.esc(emptyNote) + '</div>';
      }
      return;
    }
    var flagged = [];
    var seenGames = Object.create(null);
    rows.forEach(function (e) {
      if (!e || seenGames[e.gamePk]) return;
      seenGames[e.gamePk] = true;
      (state.irregularities[e.gamePk] || []).forEach(function (n) {
        var namesEntry = state.entries.some(function (x) {
          return x && x.gamePk === e.gamePk && x.id && n.indexOf(x.id) !== -1;
        });
        if (!namesEntry) flagged.push(flaggedRowHtml(e, n));
      });
    });
    list.innerHTML = flagged.join('') + rows.map(renderRow).join('');
  }

  function updateChrome() {
    var label = $('countdown');
    if (label) {
      var left = Math.max(0, state.nextScanAt - Date.now());
      label.textContent = document.hidden ? 'paused' : (left / 1000).toFixed(1) + 's';
    }
    var dot = $('live-dot');
    if (dot) dot.style.opacity = state.scanError ? '0.3' : '1';
    if (state.scanError) {
      statusLine('Scan problem: ' + (state.scanError.message || 'network error') + ' — retrying.', true);
    } else {
      var live = state.games.filter(function (g) { return g.status && g.status.abstractGameState === 'Live'; }).length;
      statusLine(state.games.length + ' game(s) on ' + MLB.formatDateLabel(state.date) +
        ' · ' + live + ' live · ' + state.entries.length + ' tracked entr' + (state.entries.length === 1 ? 'y' : 'ies') +
        ' · scanned ' + new Date(state.lastScanAt || Date.now()).toLocaleTimeString() +
        (FeedLog.state.available ? ' · shared log connected' : ' · local log only'));
    }
  }

  /* -------------------------------------------------------------------- nav */

  function setDate(date) {
    var clean = MLB.isValidISODate(date) ? date : MLB.todayISO();
    if (clean === state.date) return;
    state.dateSeq += 1;
    var seq = state.dateSeq;
    clearTimeout(state.timers.scan);
    state.scanning = false;
    state.date = clean;
    state.scheduleLoaded = false;
    state.games = [];
    state.entries = [];
    state.snapshots = Object.create(null);
    state.irregularities = Object.create(null);
    state.finalSeen = Object.create(null);
    state.nextDue = Object.create(null);
    state.statusByPk = Object.create(null);
    state.counterCache = Object.create(null);
    state.absFetchedRevCount = Object.create(null);
    state.lastGameDate = undefined;
    state.nextGameDate = undefined;
    state.lookingForRecent = false;
    state.log = null;
    state.lastRenderSignature = '';
    /* latency / capture caches belong to the old date */
    state.inFlight = Object.create(null);
    state.lastFetchAt = Object.create(null);
    state.liveState = Object.create(null);
    state.prevState = Object.create(null);
    state.stateHistory = Object.create(null);
    state.stateSignatureByPk = Object.create(null);
    state.coveredUpTo = Object.create(null);
    state.resyncDue = Object.create(null);
    state.latencySamples = [];
    state.schedule = { at: 0, payload: null, promise: null };
    state.inReviewCount = 0;
    syncNav();
    render();
    FeedLog.closeStream();
    if (ScoringLog) {
      ScoringLog.setDate(clean);
      ScoringLog.state.records = [];
      ScoringLog.load(clean).then(function () {
        if (seq !== state.dateSeq || state.date !== clean) return;
        renderScoringSection();
      });
    }
    FeedLog.load(clean).then(function (log) {
      if (seq !== state.dateSeq || state.date !== clean) return;
      adoptLog(log);
      render();
      FeedLog.openStream(clean);
      scan();
    });
  }

  function setFilter(filter) { state.filter = filter; render(); }
  function setScoringView(view) { state.scoringView = view; render(); }

  /* ----------------------------------------------------------- alert controls */

  /* One control, three states, remembered per browser:
   *   off      silent
   *   alerts   every tracked event except ABS pitch challenges
   *   scoring  only pending rulings and official scoring changes
   * ABS challenges get their own switch because they fire many times a game. */
  function alertMode() {
    if (!state.soundOn) return 'off';
    return state.scoringOnly ? 'scoring' : 'alerts';
  }

  function syncAlertControls() {
    var btn = $('sound-toggle-btn');
    var mode = alertMode();
    state.soundOn = mode !== 'off';
    state.scoringOnly = mode === 'scoring';
    if (btn) {
      btn.textContent = mode === 'off' ? '🔇 Alerts Off'
        : mode === 'scoring' ? '✏️ Scoring Alerts'
        : '🔊 Alerts On';
      btn.classList.toggle('btn-on', mode !== 'off');
      btn.setAttribute('aria-pressed', mode !== 'off' ? 'true' : 'false');
    }
    var absBtn = $('abs-toggle-btn');
    if (absBtn) {
      absBtn.textContent = state.absAlerts ? '🎯 ABS Alerts On' : '🎯 ABS Alerts Off';
      absBtn.classList.toggle('btn-on', state.absAlerts);
    }
    var bgBtn = $('background-toggle-btn');
    if (bgBtn) {
      bgBtn.textContent = state.background ? '🌙 Background On' : '🌙 Background Off';
      bgBtn.classList.toggle('btn-on', state.background);
    }
  }

  function cycleSound() {
    var mode = alertMode();
    var next = mode === 'off' ? 'alerts' : mode === 'alerts' ? 'scoring' : 'off';
    state.soundOn = next !== 'off';
    state.scoringOnly = next === 'scoring';
    saveMode(next);
    syncAlertControls();
    if (next !== 'off') {
      /* A toggle the operator can hear: switching alerts on proves the path
       * works, on the same audio graph every real alert uses. */
      if (AlertSound) AlertSound.preview(next === 'scoring' ? 'scoring' : 'review');
    }
  }

  /* Backwards-compatible on/off entry point (tests and any old bookmarklet). */
  function toggleSound() {
    state.soundOn = !state.soundOn;
    if (!state.soundOn) state.scoringOnly = false;
    saveMode(alertMode());
    syncAlertControls();
    if (state.soundOn) chime('preview');
  }

  function toggleAbsAlerts() {
    state.absAlerts = !state.absAlerts;
    savePref('absAlerts', state.absAlerts);
    syncAlertControls();
    if (state.absAlerts) {
      claimAlert('abs-preview:' + Date.now());
      chime('review');
    }
  }

  function toggleBackground() {
    state.background = !state.background;
    savePref('background', state.background);
    syncAlertControls();
    if (state.background) {
      state.nextScanAt = Date.now();
      scan();
    }
  }

  /** Test the alert path end to end — ignores the cooldown, never the toggle. */
  function testAlert() {
    if (!AlertSound) return { ok: false, reason: 'no-module' };
    var result = AlertSound.test();
    var note = $('alert-test-note');
    if (note) {
      if (result.ok) {
        note.textContent = 'Test tone played — ' + (state.soundOn ? 'alerts are ON' : 'alerts are OFF, so live events stay silent');
        note.className = 'alert-note ' + (state.soundOn ? 'is-ok' : 'is-warn');
      } else if (result.reason === 'no-webaudio') {
        note.textContent = 'This browser has no Web Audio support, so no tone can play.';
        note.className = 'alert-note is-error';
      } else {
        note.textContent = 'The browser blocked audio — click anywhere on the page, then press Test again.';
        note.className = 'alert-note is-error';
      }
    }
    return result;
  }

  /** Replay the tone for a kind without claiming it in the ledger. */
  function replayAlert(kind) {
    return AlertSound ? AlertSound.preview(kind || 'review') : false;
  }

  function downloadScoringLog() {
    if (!ScoringLog) return false;
    try {
      var text = ScoringLog.exportText();
      var blob = new global.Blob([text], { type: 'text/plain;charset=utf-8' });
      var url = global.URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'official-scoring-log-' + state.date + '.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { global.URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) {
      return false;
    }
  }

  function toggleNotify() {
    state.notifyOn = !state.notifyOn;
    savePref('notify', state.notifyOn);
    var btn = $('notify-toggle-btn');
    if (btn) {
      btn.textContent = state.notifyOn ? '🔴 Run Alerts On' : '⚪ Run Alerts Off';
      btn.classList.toggle('btn-on', state.notifyOn);
    }
    if (state.notifyOn && typeof global.Notification === 'function' &&
      global.Notification.permission === 'default') {
      global.Notification.requestPermission();
    }
  }

  function init() {
    state.date = urlDate() || parseDate();
    syncNav();
    var savedMode = loadMode();
    if (savedMode === null) {
      /* First visit: keep the historical default (silent) but honour it. */
      state.soundOn = loadPref('sound', false);
      state.scoringOnly = false;
    } else {
      state.soundOn = savedMode !== 'off';
      state.scoringOnly = savedMode === 'scoring';
    }
    state.absAlerts = loadPref('absAlerts', false);
    state.background = loadPref('background', false);
    state.notifyOn = loadPref('notify', false);
    state.scoringView = state.scoringView || 'all';

    FeedLog.onChange(function (pushed) {
      if (pushed && pushed.date === state.date) {
        adoptLog(FeedLog.mergePayloads(state.log, pushed, state.date));
        render();
      }
    });

    syncAlertControls();

    var soundBtn = $('sound-toggle-btn');
    if (soundBtn) soundBtn.addEventListener('click', cycleSound);
    var testBtn = $('alert-test-btn');
    if (testBtn) testBtn.addEventListener('click', function () { testAlert(); });
    var absBtn = $('abs-toggle-btn');
    if (absBtn) absBtn.addEventListener('click', toggleAbsAlerts);
    var bgBtn = $('background-toggle-btn');
    if (bgBtn) bgBtn.addEventListener('click', toggleBackground);
    var notifyBtn = $('notify-toggle-btn');
    if (notifyBtn) {
      notifyBtn.textContent = state.notifyOn ? '🔴 Run Alerts On' : '⚪ Run Alerts Off';
      notifyBtn.classList.toggle('btn-on', state.notifyOn);
      notifyBtn.addEventListener('click', toggleNotify);
    }
    var refreshBtn = $('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { scan(); });
    var clearScanBtn = $('clear-ledger-btn');
    if (clearScanBtn) {
      clearScanBtn.addEventListener('click', function () {
        if (AlertSound) AlertSound.forget(state.date);
        statusLine('Alert ledger cleared for ' + MLB.formatDateLabel(state.date) +
          ' — the next scan can alert for the events already on the page. The official scoring log was not touched.', false);
      });
    }
    var exportBtn = $('export-scoring-btn');
    if (exportBtn) exportBtn.addEventListener('click', downloadScoringLog);

    var tabs = $('feed-tabs');
    if (tabs) {
      tabs.addEventListener('click', function (evt) {
        var btn = evt.target.closest('[data-filter]');
        if (btn) setFilter(btn.getAttribute('data-filter'));
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        /* Catch up immediately after a background tab — the pause is a network
         * budget measure, and a returning tab must not stay stale. */
        state.nextDue = Object.create(null);
        state.lastRenderSignature = '';
        state.schedule = { at: 0, payload: null, promise: null };
        scan();
        sweep();
      }
    });

    /* The first user gesture unlocks Web Audio for the whole session. */
    var unlock = function () {
      if (AlertSound) AlertSound.unlock();
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    Reviews.loadRegistry();

    var initSeq = state.dateSeq;
    var initDate = state.date;

    if (ScoringLog) {
      ScoringLog.setDate(initDate);
      ScoringLog.load(initDate).then(function () {
        if (initSeq !== state.dateSeq || state.date !== initDate) return;
        renderScoringSection();
      });
    }

    FeedLog.load(initDate).then(function (log) {
      if (initSeq !== state.dateSeq || state.date !== initDate) return;
      adoptLog(log);
      render();
      FeedLog.openStream(initDate);
      scan();
    });

    state.timers.sweep = setInterval(sweep, STATUS_SWEEP_MS);
    state.timers.resync = setInterval(resyncTick, RESYNC_TICK_MS);
    state.timers.countdown = setInterval(updateChrome, 200);
  }

  global.ReplayFeed = {
    init: init,
    prevDay: function () { setDate(MLB.shiftISODate(state.date, -1)); },
    nextDay: function () { setDate(MLB.shiftISODate(state.date, 1)); },
    today: function () { setDate(MLB.todayISO()); },
    pickDate: function () {
      /* The picker is the user's own choice; a ?date= deep link seeds the first
       * view but must not override a later pick. */
      var input = $('date-picker');
      var value = input && input.value;
      setDate(MLB.isValidISODate(value) ? value : state.date);
    },
    setDate: setDate,
    setFilter: setFilter,
    setScoringView: setScoringView,
    toggleSound: toggleSound,
    cycleSound: cycleSound,
    toggleAbsAlerts: toggleAbsAlerts,
    toggleBackground: toggleBackground,
    toggleNotify: toggleNotify,
    testAlert: testAlert,
    replayAlert: replayAlert,
    downloadScoringLog: downloadScoringLog,
    scan: scan,
    resyncGame: resyncGame,
    latencyStats: latencyStats,
    gameLatency: gameLatency,
    state: state,
    SCAN_MS: SCAN_MS,
    REVIEW_PROBE_MS: REVIEW_PROBE_MS,
    REVIEW_PROBE_MAX_GAMES: REVIEW_PROBE_MAX_GAMES,
    RESYNC_MS: RESYNC_MS,
    SCHEDULE_TTL_MS: SCHEDULE_TTL_MS,
    STATUS_SWEEP_MS: STATUS_SWEEP_MS,
    FETCH_CONCURRENCY: FETCH_CONCURRENCY,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(window));
