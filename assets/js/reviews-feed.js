/* ============================================================================
 * reviews-feed.js — the all-games Replay Feed (reviews.html)
 *
 * Fast path (latency work, 2026-11-27)
 * ------------------------------------
 * Event detection is event-driven, not scan-driven. delta-feed.js holds one
 * cheap, official copy of every live game's feed and updates it the moment MLB
 * publishes a change:
 *   - Gameday websocket push (wss://ws.statsapi.mlb.com/.../push/subscribe/gameday/{pk})
 *   - else GET /api/v1.1/game/{pk}/feed/live/diffPatch?startTimecode=… (RFC 6902
 *     delta: hundreds of bytes, not hundreds of KB)
 *   - the full feed only to seed, or to recover when a patch cannot be applied
 * Every accepted update runs ingestGame() on the held tree, so nothing waits
 * for a 250 ms sweep to notice. A slow full-feed poll remains as a last-resort
 * fallback and for the 30-minute post-final ruling window.
 *
 * What is detected (all from the official payload, none inferred):
 *   - manager challenges (M*), umpire/crew-chief reviews (N*), instant replay
 *     (IH), boundary calls (umpire-side home run / fair-foul / stadium-boundary
 *     reviews; charged manager challenges of those plays stay challenges)
 *   - ABS pitch challenges (MJ/NJ) with count before/after
 *   - official-scorer pending rulings (os_ruling_pending_*)
 *   - official scoring changes, detected by diffing each completed play's
 *     classification between observations
 *   - an at-bat that is complete in the official feed but still has no
 *     published result (a "pending" state the event-type vocabulary does not
 *     cover yet)
 *
 * Every accepted update is captured as a timestamped official state snapshot
 * (live-state.js) and diffed against the previous one, so the feed can show the
 * exact before → after wording of a review, a pending ruling or a scoring
 * change rather than only the final value.
 *
 * Alerts: one shared, gentle ~3 s raindrop (alertsound.js) for every event that
 * lands on the feed; toggled on/off in the header with a test button.
 * The official-scoring log lives in its own namespace (scoring-ledger.js) and
 * is rendered by state-panel.js — deliberately separate from this alert path.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var MLB = global.MLB;
  var UI = global.UI;
  var Reviews = global.Reviews;
  var FeedLog = global.FeedLog;
  var DeltaFeed = global.DeltaFeed;
  var LiveState = global.LiveState;
  var Ledger = global.ScoringLedger;
  var StatePanel = global.StatePanel;
  var AlertSound = global.AlertSound;

  /* Delta polling of live games. The payload per poll is a few hundred bytes,
   * so this is cheap enough to run at the same cadence the old status sweep
   * used — and it carries the whole play-by-play, not just a status code. */
  var DELTA_POLL_MS = 250;
  /* Fallback full-feed scan: no delta engine (old browser / blocked socket and
   * a rejected delta path) or the post-final ruling window. */
  var SCAN_MS = 250;
  var STATUS_SWEEP_MS = 4000;
  var FETCH_CONCURRENCY = 6;
  var FINAL_GRACE_MS = 30 * 60 * 1000;
  var FINAL_RESCAN_MIN_MS = 30000;
  var CAPTURES_PER_GAME = 240;
  var SOUND_COOLDOWN_MS = 2200;

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
    notifyOn: false,
    lastChimeAt: 0,
    lastScanAt: 0,
    timers: { scan: null, sweep: null, countdown: null, flush: null },
    nextScanAt: 0,
    lastRenderSignature: '',
    counterCache: Object.create(null),
    absFetchedRevCount: Object.create(null),
    lastGameDate: undefined,
    nextGameDate: undefined,
    lookingForRecent: false,
    /* ---- live-state capture + delta transport ---- */
    gamesByPk: Object.create(null),
    liveStateByPk: Object.create(null),      // gamePk -> latest LiveState snapshot
    prevStateByPk: Object.create(null),      // gamePk -> snapshot before the latest one
    capturesByPk: Object.create(null),       // gamePk -> bounded list of snapshots
    transportByPk: Object.create(null),
    seenEntryIds: Object.create(null),       // restore-time chime suppression
    ledger: null,
    ledgerSeq: 0,
    deltaPool: null,
    deltaEvents: { seeds: 0, patches: 0, patchFailures: 0, socketMessages: 0 },
    soundTesting: false,
    soundProbe: null,                        // last test result, shown in the header
  };

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------ chime plumbing */

  /* One sound for the whole page, from alertsound.js. Kept behind this small
   * wrapper so the call sites read the same as they always have and so a sound
   * failure can never break an ingest. `state.lastChimeAt` is still stamped:
   * the existing tests (and the debug panel) read it as "an alert fired". */
  function chime(reason) {
    if (!state.soundOn) return false;
    var at = Date.now();
    if (at - state.lastChimeAt < SOUND_COOLDOWN_MS) return false;
    state.lastChimeAt = at;
    try {
      if (AlertSound) return AlertSound.play({ reason: reason });
    } catch (e) { /* audio is a nicety, never a failure path */ }
    return false;
  }

  /* ---------------------------------------------------------- state capture */

  function captureState(game, tree, transport) {
    if (!LiveState || !tree) return null;
    var snap;
    try {
      snap = LiveState.snapshot(game, tree);
    } catch (e) {
      noteIrregularity(game.gamePk, 'State capture failed: ' + (e && e.message));
      return null;
    }
    if (!snap) return null;
    var pk = String(game.gamePk);
    var prev = state.liveStateByPk[pk] || null;
    if (prev && prev.capturedAt === snap.capturedAt) return prev;
    state.prevStateByPk[pk] = prev;
    state.liveStateByPk[pk] = snap;
    var list = state.capturesByPk[pk] || [];
    list.push(snap);
    state.capturesByPk[pk] = list.slice(-CAPTURES_PER_GAME);
    state.transportByPk[pk] = transport || (state.deltaPool && state.deltaPool.get(game.gamePk)
      ? (state.deltaPool.get(game.gamePk).socket && state.deltaPool.get(game.gamePk).socket.readyState === 1 ? 'push' : 'delta')
      : 'full');
    return snap;
  }

  function stateDiff(gamePk) {
    var pk = String(gamePk);
    var prev = state.prevStateByPk[pk] || null;
    var next = state.liveStateByPk[pk] || null;
    if (!LiveState || !next) return { changes: [], flags: {} };
    return LiveState.diff(prev, next);
  }

  /* Official wording + before/after for a tracked entry, from the capture
   * pair that bracketed it. Rows show the payload's own words on both sides. */
  function attachTransition(entry, gamePk) {
    var d = stateDiff(gamePk);
    if (!d || !d.changes || !d.changes.length) return entry;
    entry.transition = {
      at: (state.liveStateByPk[String(gamePk)] || {}).capturedAtIso || '',
      timecode: (state.liveStateByPk[String(gamePk)] || {}).gamedayTimecode || '',
      changes: d.changes,
      beforeWording: (state.prevStateByPk[String(gamePk)] || {}).officialWording || '',
      afterWording: (state.liveStateByPk[String(gamePk)] || {}).officialWording || '',
    };
    return entry;
  }

  /* ------------------------------------------------------------ ledger writes */

  /* The scoring ledger is written here but stored and rendered by its own
   * module. Everything is wrapped: a ledger problem must never reach the alert
   * path or the feed render. */
  var ledgerFlushTimer = null;

  function ledgerWrite(fn) {
    if (!Ledger || !state.ledger) return null;
    try {
      var out = fn(state.ledger);
      if (out && out.added) {
        Ledger.save(state.date, state.ledger);
        /* Rendering and saving on every write is fine at review frequency, but
         * a scoring sweep can produce several at once: coalesce the repaint. */
        clearTimeout(ledgerFlushTimer);
        ledgerFlushTimer = setTimeout(function () {
          ledgerFlushTimer = null;
          if (StatePanel) StatePanel.renderLedger();
        }, 120);
      }
      return out;
    } catch (e) {
      global.console && global.console.warn && global.console.warn('[reviews-feed] ledger write failed', e);
      return null;
    }
  }

  function ledgerRecordFor(game, teams, teamsLabel) {
    return {
      gamePk: game.gamePk,
      matchup: teamsLabel,
      officialDate: state.date,
      source: 'MLB StatsAPI live feed (playByPlay result / reviewDetails)',
      timecode: (state.liveStateByPk[String(game.gamePk)] || {}).gamedayTimecode || null,
    };
  }

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
    if (elapsed < 2 * 60 * 1000) return 1000;   // late rulings land here most of the time
    if (elapsed < 5 * 60 * 1000) return 2500;
    return 15000;                              // then settle into a slow re-check
  }

  function shouldFetch(game, now) {
    var status = (game.status && game.status.abstractGameState) || '';
    var pk = game.gamePk;
    if (status === 'Live') {
      state.nextDue[pk] = now + SCAN_MS;
      return true;
    }
    if (status === 'Final') {
      if (!state.finalSeen[pk]) state.finalSeen[pk] = now;
      var elapsed = now - state.finalSeen[pk];
      if (elapsed > FINAL_GRACE_MS) return false;
      var due = state.nextDue[pk] || 0;
      if (now < due) return false;
      state.nextDue[pk] = now + finalGraceDelay(state.finalSeen[pk], elapsed);
      return true;
    }
    return false;
  }

  function fetchGame(game) {
    var prevCount = state.absFetchedRevCount[game.gamePk];
    var status = (game.status && game.status.abstractGameState) || '';
    var pbpPromise = MLB.playByPlay(game.gamePk, { fields: PLAYBYPLAY_FIELDS, retries: 0 });
    var countersPromise = (prevCount === undefined || status === 'Live')
      ? MLB.gameFeed(game.gamePk, { fields: COUNTERS_FIELDS, retries: 0 }).catch(function () { return null; })
      : Promise.resolve(null);
    return Promise.all([pbpPromise, countersPromise])
      .then(function (parts) {
        return { game: game, payload: parts[0], countersPayload: parts[1] };
      })
      .catch(function (err) {
        return { game: game, payload: null, countersPayload: null, error: err };
      });
  }

  /* Run at most `limit` workers at once. A worker that rejects must still free
   * its slot — otherwise one bad payload would silently stall the whole feed
   * (which is exactly what a hang looks like from the outside). */
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
          Promise.resolve().then(function () { return worker(item); })
            .catch(function (err) {
              state.scanError = err;
              global.console && global.console.warn && global.console.warn('[reviews-feed] worker failed', err);
            })
            .then(function () {
              active -= 1;
              next();
            });
        }
      }
      next();
    });
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
    var teamsLabel = UI.abbr(teams.away) + ' @ ' + UI.abbr(teams.home);

    /* Capture the official state this update describes (second-precision) and
     * diff it against the previous capture BEFORE any row is built, so every
     * row below can carry the exact before → after wording of this update. */
    captureState(game, result.payload, result.transport);
    var transition = stateDiff(game.gamePk);

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
      };

      var isNew = upsertEntry(entry);
      /* Always operate on the stored entry: upsertEntry merges into the
       * existing object, so flags like `warned` live there. */
      entry = state.entries.find(function (e) { return e.id === entry.id; }) || entry;

      /* Uploaded reviews.html button title (aef1a74c L39): "a gentle raindrop
       * chime for new challenges/reviews/boundary calls, official-scorer
       * pending rulings and official scoring changes (not ABS), and the same
       * chime whenever an active review could remove a run already on the
       * scoreboard". */
      if (isNew && !state.seenEntryIds[review.id] && !review.isABS) chime('review');
      attachTransition(entry, game.gamePk);
      if (review.runsAtRiskCount > 0 && !entry.warned) {
        /* "whenever an active review could remove a run" — chime the moment
         * the condition first becomes visible (including mid-review), then
         * mark the entry so it never re-chimes. Restored rows are pre-marked
         * in adoptLog (not observed live). */
        entry.warned = true;
        chime('risk');
        notifyRunAtRisk(review, teams);
      }
    });

    /* ---- official-scorer pending rulings */
    var pending = Reviews.pendingRulings(plays, meta);
    pending.forEach(function (row) {
      var observedState = state.liveStateByPk[String(game.gamePk)] || null;
      var isNewPending = upsertEntry({
        id: row.id,
        kind: 'pending',
        observedAtSec: (observedState && observedState.capturedAtIso) || LiveState.isoSeconds(Date.now()),
        officialDate: expectedDate || state.date,
        gamePk: game.gamePk,
        matchupLabel: UI.abbr(teams.away) + ' @ ' + UI.abbr(teams.home),
        teams: teams,
        pending: Object.assign({}, row, {
          observedAtSec: (state.liveStateByPk[String(game.gamePk)] || {}).capturedAtIso || '',
        }),
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
      });
      if (isNewPending && !state.seenEntryIds[row.id]) chime('pending');
      var pendingEntry = state.entries.find(function (e) { return e.id === row.id; });
      if (pendingEntry) attachTransition(pendingEntry, game.gamePk);

      /* Separate audit ledger: the pending ruling as first observed, with the
       * official state around it. Its own storage, its own failure mode. */
      ledgerWrite(function (ledger) {
        var rec = ledgerRecordFor(game, teams, teamsLabel);
        rec.id = row.id;
        rec.atBatIndex = row.atBatIndex;
        rec.inningLabel = row.inningLabel;
        rec.batter = row.batter;
        rec.pitcher = row.pitcher;
        rec.eventType = row.eventType;
        rec.description = row.description;
        rec.wording = row.description;
        rec.capturedAtMs = row.observedAt || Date.now();
        rec.before = state.prevStateByPk[String(game.gamePk)] || state.liveStateByPk[String(game.gamePk)] || null;
        return Ledger.addPending(ledger, rec);
      });
    });

    /* A completed at-bat with no official result yet — the "not scored yet"
     * case the API's event-type vocabulary does not label. Recorded the second
     * it is observed, with the official state around it. */
    var currentPlay = (result.payload.liveData && result.payload.liveData.plays &&
      result.payload.liveData.plays.currentPlay) || null;
    if (LiveState && LiveState.isPendingResult(currentPlay)) {
      var atBatIndex = Number(currentPlay.about && currentPlay.about.atBatIndex);
      var pendingId = game.gamePk + ':' + atBatIndex + ':unscored';
      ledgerWrite(function (ledger) {
        var rec = ledgerRecordFor(game, teams, teamsLabel);
        rec.id = pendingId;
        rec.atBatIndex = atBatIndex;
        rec.inningLabel = (state.liveStateByPk[String(game.gamePk)] || {}).inning
          ? (state.liveStateByPk[String(game.gamePk)]).inning.label : '';
        rec.batter = (currentPlay.matchup && currentPlay.matchup.batter && currentPlay.matchup.batter.fullName) || '';
        rec.pitcher = (currentPlay.matchup && currentPlay.matchup.pitcher && currentPlay.matchup.pitcher.fullName) || '';
        rec.eventType = (currentPlay.result && currentPlay.result.eventType) || '';
        rec.description = (currentPlay.result && currentPlay.result.description) || '';
        rec.wording = 'Plate appearance complete — official result not yet published';
        rec.capturedAtMs = Date.now();
        rec.before = state.prevStateByPk[String(game.gamePk)] || state.liveStateByPk[String(game.gamePk)] || null;
        rec.source = 'MLB StatsAPI live feed — completed play with no published result.eventType';
        return Ledger.addPending(ledger, rec);
      });
    }

    /* A pending at-bat whose official result has now been published: close the
     * ledger record with the after-state. This is the "the ruling came in"
     * half of the audit trail. */
    ledgerWrite(function (ledger) {
      var changed = false;
      Ledger.recordsOf(ledger, 'pending').forEach(function (rec) {
        if (rec.gamePk !== game.gamePk || rec.resolvedAtMs) return;
        var scored = plays.some(function (play) {
          var about = play && play.about;
          if (!about || Number(about.atBatIndex) !== Number(rec.atBatIndex)) return false;
          var type = (play.result && play.result.eventType) || '';
          return !!type && !Reviews.isPendingRuling(play);
        });
        if (scored) {
          var after = state.liveStateByPk[String(game.gamePk)] || null;
          Ledger.resolvePending(ledger, rec.id, after, (after && after.officialWording) || '');
          changed = true;
        }
        /* The "complete but unscored" variant of the same record. */
        var scoredNow = plays.some(function (play) {
          var about = play && play.about;
          if (!about || Number(about.atBatIndex) !== Number(rec.atBatIndex)) return false;
          return about.isComplete === true && !LiveState.isPendingResult(play);
        });
        if (scoredNow) {
          var afterState = state.liveStateByPk[String(game.gamePk)] || null;
          Ledger.resolvePending(ledger, rec.id, afterState, (afterState && afterState.officialWording) || '');
          changed = true;
        }
      });
      return { added: changed };
    });

    /* ---- official scoring changes */
    var snapshot = Reviews.snapshotPlays(plays);
    var previous = state.snapshots[game.gamePk];
    var diff = Reviews.diffSnapshots(previous, snapshot);
    state.snapshots[game.gamePk] = snapshot;

    diff.changes.forEach(function (change) {
      var isNewChange = upsertEntry({
        id: game.gamePk + ':' + change.atBatIndex + ':scoring-change',
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
      });
      var changeId = game.gamePk + ':' + change.atBatIndex + ':scoring-change';
      if (isNewChange && !state.seenEntryIds[changeId]) chime('scoring');
      var changeEntry = state.entries.find(function (e) { return e.id === changeId; });
      if (changeEntry) attachTransition(changeEntry, game.gamePk);
      if (state.log) {
        state.log.grace = state.log.grace || {};
        state.log.grace[game.gamePk] = Date.now();
      }

      /* Separate audit ledger: the reclassification with both official
       * descriptions and the before/after state around it. */
      ledgerWrite(function (ledger) {
        var rec = ledgerRecordFor(game, teams, teamsLabel);
        rec.id = changeId;
        rec.atBatIndex = change.atBatIndex;
        rec.inningLabel = change.inningLabel;
        rec.batter = change.batter;
        rec.from = change.from;
        rec.to = change.to;
        rec.fromWording = (change.from && change.from.description) || '';
        rec.toWording = (change.to && change.to.description) || '';
        rec.before = state.prevStateByPk[String(game.gamePk)] || null;
        rec.after = state.liveStateByPk[String(game.gamePk)] || null;
        rec.capturedAtMs = Date.now();
        rec.attribution = change.attribution;
        return Ledger.addChange(ledger, rec);
      });
    });

    diff.edits.forEach(function (edit) {
      noteIrregularity(game.gamePk, 'Play ' + edit.atBatIndex + ' edited without reclassification (' +
        edit.inningLabel + ') — flagged, not corrected.');
    });
    diff.vanished.forEach(function (gone) {
      noteIrregularity(game.gamePk, 'Play ' + gone.atBatIndex + ' (' + gone.inningLabel +
        ') disappeared from the payload after being observed — flagged, not corrected.');
    });

    /* ---- counter regressions & official MGR / ABS counters */
    state.counterCache = state.counterCache || Object.create(null);
    var prevCached = state.counterCache[game.gamePk] || null;
    /* The delta engine holds the whole official feed, so the official counters
     * (gameData.review / gameData.absChallenges) are already in hand — no second
     * request, and no window where the counters lag the play. */
    var gdCounters = (result.countersPayload && result.countersPayload.gameData) ||
      (result.payload && result.payload.gameData) || null;
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
  }

  /* ------------------------------------------------------- live delta engine */

  function liveGamesOf(games) {
    return (games || []).filter(function (g) {
      return g && g.status && g.status.abstractGameState === 'Live';
    });
  }

  function ensurePool() {
    if (state.deltaPool || !DeltaFeed) return state.deltaPool;
    state.deltaPool = new DeltaFeed.Pool({
      deltaPollMs: DELTA_POLL_MS,
      useSocket: true,
      verbose: false,
    });
    return state.deltaPool;
  }

  /* Every accepted delta (or a socket frame) lands here. This is the fast path:
   * no timer, no status sweep, no waiting for a scan to finish. */
  function onDeltaEvent(evt) {
    if (!evt || !evt.gamePk) return;
    var game = state.gamesByPk[evt.gamePk] || state.gamesByPk[String(evt.gamePk)] || null;

    if (evt.type === 'patch' || evt.type === 'seed') {
      state.deltaEvents[evt.type === 'patch' ? 'patches' : 'seeds'] += 1;
      if (!game) {
        /* A game we no longer track (date changed mid-flight). */
        if (state.deltaPool) state.deltaPool.remove(evt.gamePk);
        return;
      }
      state.deltaEvents.socketMessages = (DeltaFeed && DeltaFeed.stats) ? DeltaFeed.stats.socketMessages : 0;
      var result = {
        game: game,
        payload: evt.tree,
        countersPayload: null,
        transport: evt.type === 'patch' ? (evt.via === 'push' ? 'push' : 'delta') : 'full',
      };
      ingestGame(result, state.dateSeq, state.date);
      scheduleFlush();
      return;
    }
    if (evt.type === 'patch-failed') {
      state.deltaEvents.patchFailures += 1;
      return;
    }
    if (evt.type === 'socket-message') {
      state.deltaEvents.socketMessages += 1;
      return;
    }
    if (evt.type === 'error' && evt.error && game) {
      /* Transport hiccup: never fatal — the pool reseeds on its own and the
       * full-feed fallback below still covers the slate. */
      state.scanError = evt.error;
      updateChrome();
    }
  }

  /* Deltas can land several at a time (15 live games, sub-10-second updates).
   * Ingest is per-update — nothing is batched or delayed — but the *repaint* and
   * the log write are coalesced, so a busy slate does not repaint and re-serialize
   * the log fifteen times a second. */
  function scheduleFlush() {
    if (state.timers.flush) return;
    state.timers.flush = setTimeout(function () {
      state.timers.flush = null;
      persist(state.dateSeq, state.date);
      renderIfChanged();
      updateChrome();
    }, 120);
  }

  /* Point the delta pool at exactly the games that are live right now. */
  function syncDeltaPool() {
    var pool = ensurePool();
    if (!pool) return false;
    var live = liveGamesOf(state.games);
    pool.sync(live.map(function (g) { return g.gamePk; }));
    return live.length > 0;
  }

  function stopDeltaPool() {
    if (state.deltaPool) state.deltaPool.stopAll();
    state.deltaPool = null;
  }

  /* The schedule is the only thing that still needs polling: it is how a game
   * is discovered to have gone live (and how the scoreboard stays honest).
   * It is ~2 KB, so it runs on the same 250 ms beat while anything is live. */
  /* scan({force:true}) — the Refresh button and an explicit call: fetch even if
   * this game's next-due window has not opened yet (a user asking for fresh
   * data should never be told to wait). Internal ticks call scan() with no
   * options and keep the backoff. */
  function scan(opts) {
    var force = !!(opts && opts.force);
    if (force) {
      state.nextDue = Object.create(null);
      state.finalSeen = state.finalSeen || Object.create(null);
    }
    if (state.scanning) return;
    if (document.hidden && !force) { scheduleScan(1000); return; }
    var scanSeq = state.dateSeq;
    var scanDate = state.date;
    state.scanning = true;
    state.nextScanAt = Date.now() + (liveGamesOf(state.games).length ? DELTA_POLL_MS : SCAN_MS);

    MLB.schedule(scanDate, { ttl: 0, retries: 0 })
      .then(function (payload) {
        if (scanSeq !== state.dateSeq || scanDate !== state.date) return null;
        state.games = flattenGames(payload);
        state.gamesByPk = Object.create(null);
        state.games.forEach(function (g) { if (g && g.gamePk) state.gamesByPk[g.gamePk] = g; });
        state.scheduleLoaded = true;
        state.scanError = null;

        var usingDelta = syncDeltaPool();
        if (force && state.deltaPool) {
          /* An explicit refresh must reach live games too, even though their
           * deltas are normally on their own cadence. */
          state.deltaPool.forEach(function (stream) { stream.pollDelta(); });
        }
        var now = Date.now();
        /* Games that must still be read from the full feed: the post-final
         * ruling window (finals are not in the delta pool), plus everything
         * when the delta engine could not be used at all. */
        var due = state.games.filter(function (g) {
          if (shouldFetch(g, now)) {
            if (usingDelta && g.status && g.status.abstractGameState === 'Live') return false;
            return true;
          }
          return false;
        });

        if (!due.length) {
          updateChrome();
          renderIfChanged();
          return null;
        }
        return runLimited(due, FETCH_CONCURRENCY, function (game) {
          if (scanSeq !== state.dateSeq || scanDate !== state.date) return Promise.resolve();
          return fetchGame(game).then(function (result) {
            if (result) result.transport = 'full';
            ingestGame(result, scanSeq, scanDate);
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
        state.lastScanAt = Date.now();
        scheduleScan(nextScanDelay());
      });
  }

  /* Live games: the schedule beat stays tight because the delta pool does the
   * real work. Finals: at most every FINAL_RESCAN_MIN_MS for the 30-minute
   * ruling window. Preview/offseason: README backoff. */
  function nextScanDelay() {
    var now = Date.now();
    var hasLive = state.games.some(function (g) {
      return g.status && g.status.abstractGameState === 'Live';
    });
    if (hasLive) return DELTA_POLL_MS;
    var hasInGraceFinal = state.games.some(function (g) {
      if (!g.status || g.status.abstractGameState !== 'Final') return false;
      var first = state.finalSeen[g.gamePk];
      return !first || (now - first) <= FINAL_GRACE_MS;
    });
    if (hasInGraceFinal) {
      /* Late official rulings are the reason this window exists: check often
       * right after the final out, then back off. */
      var soonest = Infinity;
      state.games.forEach(function (g) {
        if (!g.status || g.status.abstractGameState !== 'Final') return;
        var first = state.finalSeen[g.gamePk];
        if (!first) return;
        if (now - first > FINAL_GRACE_MS) return;
        var dueAt = state.nextDue[g.gamePk] || 0;
        soonest = Math.min(soonest, Math.max(500, dueAt - now));
      });
      if (!isFinite(soonest)) return 2000;
      return Math.max(500, Math.min(FINAL_RESCAN_MIN_MS, soonest));
    }
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

  /* Official status sweep. Kept as a belt-and-braces path (a status code is the
   * cheapest possible signal), but at a cadence that does not compete with the
   * delta poll for the same connection budget: a live game's deltas already
   * carry its status, and a stream that dies is caught by the delta poll. */
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
            /* The delta pool owns this game, so ask it to poll right now rather
             * than fetching a whole feed out of band. */
            var stream = state.deltaPool && state.deltaPool.get(g.gamePk);
            if (stream) {
              stream.pollDelta();
            } else {
              fetchGame(g).then(function (result) {
                if (sweepSeq !== state.dateSeq || sweepDate !== state.date) return;
                if (result) result.transport = 'full';
                ingestGame(result, sweepSeq, sweepDate);
                persist(sweepSeq, sweepDate);
                renderIfChanged();
                updateChrome();
              });
            }
          }
        }
      });
    }).catch(function () { /* the scan owns error reporting */ });
  }

  /* ------------------------------------------------------------- sound/notify */

  /* The sound lives in alertsound.js (one shared context, ~3 s raindrop, works
   * with no user gesture once the page has been interacted with). Everything
   * here is about the toggle, the test, and being honest about whether it
   * actually played. */

  function soundStatusText() {
    if (!AlertSound) return 'sound unavailable';
    var st = AlertSound.status();
    if (st === 'unsupported') return 'Web Audio unavailable';
    if (st === 'suspended' || st === 'not-started') return 'click the page once to enable audio';
    return '';
  }

  function setSoundButtonState() {
    var btn = $('sound-toggle-btn');
    if (btn) {
      btn.textContent = state.soundOn ? '🔊 Alert sound on' : '🔇 Alert sound off';
      btn.classList.toggle('btn-on', state.soundOn);
      btn.setAttribute('aria-pressed', state.soundOn ? 'true' : 'false');
      var note = soundStatusText();
      btn.title = state.soundOn
        ? 'Alert sound is ON — a ~3 s raindrop plays for every event that lands on the feed. Click to turn it off.'
        : 'Alert sound is OFF. Click to turn it on, then use Test to hear it.' + (note ? ' (' + note + ')' : '');
    }
    var testBtn = $('sound-test-btn');
    if (testBtn) {
      testBtn.disabled = !state.soundOn;
      testBtn.title = state.soundOn
        ? 'Play the alert sound now to confirm the alert path is working'
        : 'Turn the alert sound on first';
    }
    var probe = $('sound-probe');
    if (probe) {
      var p = state.soundProbe;
      probe.textContent = p ? p.text : (state.soundOn ? 'sound ready — press Test' : 'sound off');
      probe.classList.toggle('is-error', !!(p && p.error));
      probe.classList.toggle('is-ok', !!(p && p.ok));
    }
  }

  /* The test button: guarantees an attempt (bypasses the cooldown) and reports
   * exactly what happened — played, or why not. */
  function testSound() {
    if (!state.soundOn) {
      state.soundProbe = { text: 'turn the alert sound on first', ok: false, error: true };
      setSoundButtonState();
      return false;
    }
    state.soundTesting = true;
    var played = false;
    var detail = '';
    try {
      if (AlertSound) {
        played = AlertSound.test({
          onResult: function (res) {
            if (res && res.played) {
              state.soundProbe = { text: '✓ played a 3.0 s raindrop at ' + new Date(res.at || Date.now()).toISOString().slice(11, 19) + 'Z', ok: true, error: false };
            } else {
              state.soundProbe = { text: '✗ ' + ((res && res.error) || 'the browser did not play it'), ok: false, error: true };
            }
            setSoundButtonState();
          },
        });
        if (!played) {
          var st = AlertSound.status();
          detail = st === 'unsupported' ? 'Web Audio is unavailable in this browser'
            : st === 'suspended' || st === 'not-started' ? 'blocked until you interact with the page — click anywhere, then Test again'
            : 'audio context state: ' + st;
        }
      } else {
        detail = 'sound module not loaded';
      }
    } catch (e) {
      detail = e && e.message ? e.message : 'audio error';
    }
    state.soundTesting = false;
    if (played) {
      state.soundProbe = { text: '✓ 3.0 s raindrop played just now', ok: true, error: false };
      state.lastChimeAt = Date.now();
    } else if (!state.soundProbe || !state.soundProbe.ok) {
      state.soundProbe = { text: '✗ ' + (detail || 'not played'), ok: false, error: true };
    }
    setSoundButtonState();
    return played;
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
    var tiles = [
      { n: s.total, label: 'Reviews', cls: '' },
      { n: s.manager, label: 'Challenges', cls: '' },
      { n: s.umpire, label: 'Umpire reviews', cls: '' },
      { n: s.abs, label: 'ABS challenges', cls: '' },
      { n: s.boundary, label: 'Boundary calls', cls: '' },
      { n: s.under, label: 'Under review', cls: '' },
      { n: s.risk, label: 'Runs at risk', cls: 'is-risk' },
      { n: s.scoring, label: 'Scoring changes', cls: '' },
    ];
    el.innerHTML = tiles.map(function (t) {
      return '<div class="stat-tile ' + t.cls + '"><div class="stat-num">' + t.n + '</div>' +
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
        (entry.pending.observedAtSec ? '<div class="feed-sub">Observed pending since ' + UI.esc(entry.pending.observedAtSec) + '</div>' : '') +
        '<div class="feed-irregular">Source: ' + UI.esc(entry.pending.source || '') + '</div>';
    }

    /* Before → after: the official state fields that moved in the update this
     * row came from, plus the payload's own wording on both sides. This is the
     * "exact official information, before and after" the feed is asked for. */
    var transitionHtml = '';
    var tr = entry.transition;
    if (tr && ((tr.changes && tr.changes.length) || tr.afterWording)) {
      var fields = (tr.changes || []).filter(function (c) {
        return c.field !== 'statusReason' && c.field !== 'playDescription' && c.field !== 'statusCode';
      }).slice(0, 6);
      transitionHtml = '<div class="feed-transition">' +
        '<div class="feed-transition-head">Official state — before → after' +
          (tr.at ? ' <span class="state-dim">· ' + UI.esc(tr.at) + '</span>' : '') +
          (tr.timecode ? ' <span class="state-dim">· ' + UI.esc(tr.timecode) + '</span>' : '') +
        '</div>' +
        (fields.length ? '<ul class="feed-transition-list">' + fields.map(function (c) {
          return '<li><span class="state-field">' + UI.esc(c.label) + '</span>' +
            '<span class="state-prev">' + UI.esc(c.before === null || c.before === '' || c.before === undefined ? '—' : c.before) + '</span>' +
            '<span class="state-arrow">→</span>' +
            '<span class="state-next">' + UI.esc(c.after === null || c.after === '' || c.after === undefined ? '—' : c.after) + '</span></li>';
        }).join('') + '</ul>' : '') +
        (tr.beforeWording && tr.beforeWording !== tr.afterWording
          ? '<div class="feed-sub">Before: “' + UI.esc(tr.beforeWording) + '”</div>' : '') +
        (tr.afterWording ? '<div class="feed-sub">After: “' + UI.esc(tr.afterWording) + '”</div>' : '') +
      '</div>';
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
        absLine + changeHtml + pendingHtml + transitionHtml +
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

  function statesSignature() {
    return (state.games || []).map(function (g) {
      var s = state.liveStateByPk[String(g.gamePk)];
      if (!s) return String(g.gamePk) + ':none';
      return String(g.gamePk) + ':' + (s.capturedAtIso || '') + ':' + (s.gamedayTimecode || '') +
        ':' + (s.score ? s.score.away + '-' + s.score.home : '') + ':' + (s.outs === null ? '' : s.outs) +
        ':' + (s.count ? s.count.balls + '-' + s.count.strikes : '') + ':' + (s.status && s.status.code);
    }).join(',') + '|' + (state.transportByPk ? Object.keys(state.transportByPk).length : 0);
  }

  function entriesSignature() {
    return state.filter + '|' + (state.scheduleLoaded ? '1' : '0') + '|' + state.games.length + '|' + (state.lastGameDate || '') + '|' + (state.nextGameDate || '') + '|' + statesSignature() + '|' + state.entries.map(function (e) {
      return [e.id, e.lastSeen, e.review && e.review.outcome, e.review && e.review.inProgress,
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
    renderStates();
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
      var transport = 'full-feed fallback';
      if (state.deltaPool) {
        var push = 0, delta = 0, streams = 0;
        state.deltaPool.forEach(function (stream) {
          streams += 1;
          if (stream.socket && stream.socket.readyState === 1) push += 1;
          else if (stream.transport === 'delta') delta += 1;
        });
        transport = 'delta ' + streams + ' live game(s)' +
          (push ? ' · ' + push + ' on push' : '') +
          (delta ? ' · ' + delta + ' on delta' : '') +
          (state.deltaEvents.patchFailures ? ' · ' + state.deltaEvents.patchFailures + ' patch failure(s) reseeded' : '');
      }
      statusLine(state.games.length + ' game(s) on ' + MLB.formatDateLabel(state.date) +
        ' · ' + live + ' live · ' + state.entries.length + ' tracked entr' + (state.entries.length === 1 ? 'y' : 'ies') +
        ' · ' + transport +
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
    clearTimeout(state.timers.flush);
    state.timers.flush = null;
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
    state.gamesByPk = Object.create(null);
    state.liveStateByPk = Object.create(null);
    state.prevStateByPk = Object.create(null);
    state.capturesByPk = Object.create(null);
    state.transportByPk = Object.create(null);
    state.ledger = null;
    state.ledgerSeq = seq;
    state.lastGameDate = undefined;
    state.nextGameDate = undefined;
    state.lookingForRecent = false;
    state.log = null;
    state.lastRenderSignature = '';
    stopDeltaPool();
    if (Ledger && Ledger.closeStream) Ledger.closeStream();
    syncNav();
    render();
    FeedLog.closeStream();
    var ledgerLoad = StatePanel ? StatePanel.loadLedger(clean, seq) : Promise.resolve(null);
    FeedLog.load(clean).then(function (log) {
      if (seq !== state.dateSeq || state.date !== clean) return;
      adoptLog(log);
      markRestored();
      render();
      FeedLog.openStream(clean);
      if (Ledger && Ledger.openStream) Ledger.openStream(clean);
      scan();
      return ledgerLoad;
    });
  }

  /* Entries restored from the log were already on the feed before this page
   * opened: they must never chime again. Marking their ids is cheaper and more
   * reliable than trying to reason about firstSeen at call time. */
  function markRestored() {
    state.seenEntryIds = Object.create(null);
    (state.entries || []).forEach(function (e) {
      if (e && e.id) state.seenEntryIds[e.id] = true;
    });
  }

  function setFilter(filter) { state.filter = filter; render(); }

  function toggleSound() {
    state.soundOn = !state.soundOn;
    savePref('sound', state.soundOn);
    if (state.soundOn) {
      /* Turning it on IS the proof: play the sound immediately (from the
       * click, so the audio context is unlocked by the gesture itself). */
      testSound();
    } else {
      state.soundProbe = null;
    }
    setSoundButtonState();
    return state.soundOn;
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
    setSoundButtonState();
    return state.notifyOn;
  }

  function init() {
    state.date = urlDate() || parseDate();
    syncNav();
    state.soundOn = loadPref('sound', false);
    state.notifyOn = loadPref('notify', false);

    FeedLog.onChange(function (pushed) {
      if (pushed && pushed.date === state.date) {
        adoptLog(FeedLog.mergePayloads(state.log, pushed, state.date));
        render();
      }
    });

    var soundBtn = $('sound-toggle-btn');
    if (soundBtn) soundBtn.addEventListener('click', toggleSound);

    var soundTestBtn = $('sound-test-btn');
    if (soundTestBtn) soundTestBtn.addEventListener('click', function () { testSound(); });

    /* Keep the toggle honest as the audio context changes state (e.g. a mobile
     * browser re-suspending it between alerts). */
    if (AlertSound && AlertSound.on) {
      AlertSound.on(function (evt) {
        if (!evt || !evt.played) return;
        state.lastAlertSound = { reason: evt.reason, at: evt.at, durationMs: evt.durationMs };
      });
    }
    setSoundButtonState();
    if (StatePanel) StatePanel.bind();
    if (DeltaFeed && DeltaFeed.onEvent) DeltaFeed.onEvent(onDeltaEvent);

    /* Another browser's ledger write arrives here (local server only). The
     * merge is idempotent, and adopting it never touches the alert feed. */
    if (Ledger && Ledger.onChange) {
      Ledger.onChange(function (pushed) {
        if (!pushed || pushed.date !== state.date || !state.ledger) return;
        try {
          state.ledger = Ledger.merge(state.ledger, pushed, state.date);
          if (StatePanel) StatePanel.renderLedger();
        } catch (e) { /* the ledger must never break the page */ }
      });
    }
    var notifyBtn = $('notify-toggle-btn');
    if (notifyBtn) {
      notifyBtn.textContent = state.notifyOn ? '🔴 Run Alerts On' : '⚪ Run Alerts Off';
      notifyBtn.classList.toggle('btn-on', state.notifyOn);
      notifyBtn.addEventListener('click', toggleNotify);
    }
    var refreshBtn = $('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { scan({ force: true }); });

    var tabs = $('feed-tabs');
    if (tabs) {
      tabs.addEventListener('click', function (evt) {
        var btn = evt.target.closest('[data-filter]');
        if (btn) setFilter(btn.getAttribute('data-filter'));
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { scan({ force: true }); }
    });

    Reviews.loadRegistry();

    var initSeq = state.dateSeq;
    var initDate = state.date;
    if (StatePanel) StatePanel.loadLedger(initDate, initSeq);
    FeedLog.load(initDate).then(function (log) {
      if (initSeq !== state.dateSeq || state.date !== initDate) return;
      adoptLog(log);
      markRestored();
      render();
      FeedLog.openStream(initDate);
      if (Ledger && Ledger.openStream) Ledger.openStream(initDate);
      scan();
    });

    state.timers.sweep = setInterval(sweep, STATUS_SWEEP_MS);
    state.timers.countdown = setInterval(updateChrome, 200);

    /* A whole day of baseball needs the page awake; wake it with a delta poll
     * of every live game rather than waiting out the schedule beat. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (state.deltaPool) state.deltaPool.forEach(function (stream) { stream.pollDelta(); });
    });
  }

  /* Repaint the live-state panel from the in-memory captures. */
  function renderStates() {
    if (!StatePanel) return;
    var list = (state.games || []).map(function (g) {
      var pk = String(g.gamePk);
      return {
        gamePk: g.gamePk,
        date: state.date,
        matchup: UI.abbr(teamsOf(g).away) + ' @ ' + UI.abbr(teamsOf(g).home),
        state: state.liveStateByPk[pk] || null,
        prevState: state.prevStateByPk[pk] || null,
        transport: state.transportByPk[pk] || 'full',
        live: !!(g.status && g.status.abstractGameState === 'Live'),
        final: !!(g.status && g.status.abstractGameState === 'Final'),
        lastError: (state.deltaPool && state.deltaPool.get(g.gamePk)) ? state.deltaPool.get(g.gamePk).lastError : null,
        suggestedWaitSec: (state.deltaPool && state.deltaPool.get(g.gamePk)) ? state.deltaPool.get(g.gamePk).suggestedWaitSec : null,
        deltaPollMs: DELTA_POLL_MS,
      };
    }).filter(function (row) { return !!row.state; });
    var transports = { push: 0, delta: 0, full: 0 };
    if (state.deltaPool) {
      state.deltaPool.forEach(function (stream) {
        var t = stream.socket && stream.socket.readyState === 1 ? 'push' : (stream.transport === 'delta' ? 'delta' : 'full');
        transports[t] += 1;
      });
    }
    StatePanel.renderStates(list, {
      generatedAt: Date.now(),
      transports: transports,
      captures: Object.keys(state.capturesByPk).reduce(function (n, pk) {
        return n + (state.capturesByPk[pk] || []).length;
      }, 0),
    });
  }

  global.ReplayFeed = {
    init: init,
    renderStates: renderStates,
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
    toggleSound: toggleSound,
    toggleNotify: toggleNotify,
    testSound: testSound,
    setSoundButtonState: setSoundButtonState,
    scan: scan,
    stateDiff: stateDiff,
    renderLedger: function () { if (StatePanel) StatePanel.renderLedger(); },
    state: state,
    SCAN_MS: SCAN_MS,
    DELTA_POLL_MS: DELTA_POLL_MS,
    STATUS_SWEEP_MS: STATUS_SWEEP_MS,
    FETCH_CONCURRENCY: FETCH_CONCURRENCY,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(window));
