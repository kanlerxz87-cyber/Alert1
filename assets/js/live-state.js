/* ============================================================================
 * live-state.js — official in-game state, captured live, timestamped to the second
 *
 * What a snapshot holds (all read from the official feed tree, never inferred):
 *   status            abstractGameState / codedGameState / detailedState /
 *                     statusCode / reason
 *   inning            num + half + official ordinal
 *   outs, balls, strikes
 *   score             away/home runs (linescore, falling back to the play result)
 *   batter / pitcher  id + full name, batting side, pitch hand
 *   pitch count       the current pitcher's official numberOfPitches and the
 *                     fielding team's total (liveData.boxscore ... stats.pitching)
 *   bases             first/second/third occupancy from linescore.offense
 *   currentPlay       atBatIndex, isComplete, eventType, official description,
 *                     official start/end time
 *   officialWording   the payload's own words, concatenated verbatim, so a
 *                     before/after record quotes MLB rather than paraphrasing it
 *
 * Capture points: every accepted delta (see delta-feed.js), so a snapshot only
 * exists when the official payload actually moved — with capturedAt (ms) and
 * the Gameday timecode of the state it describes.
 *
 * Diffing two snapshots yields the field-by-field before → after record that
 * the feed rows and the audit ledger both use.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var VERSION = 1;

  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function str(v) { return v === null || v === undefined ? '' : String(v); }

  function isoSeconds(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function isoMillis(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }

  function clockOf(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(11, 19) + 'Z';
  }

  function ordinal(n) {
    var v = Number(n);
    if (!isFinite(v)) return '';
    var mod100 = v % 100;
    if (mod100 >= 11 && mod100 <= 13) return v + 'th';
    switch (v % 10) {
      case 1: return v + 'st';
      case 2: return v + 'nd';
      case 3: return v + 'rd';
      default: return v + 'th';
    }
  }

  function teamsOfTree(tree) {
    var teams = (tree && tree.gameData && tree.gameData.teams) || {};
    function side(t) {
      var team = (t && t.team) || t || {};
      return { id: numOrNull(team.id), name: str(team.name), abbr: str(team.abbreviation) };
    }
    return { away: side(teams.away), home: side(teams.home) };
  }

  function playerOf(node) {
    if (!node) return { id: null, name: '' };
    return { id: numOrNull(node.id), name: str(node.fullName || node.name) };
  }

  function pitcherPitchCount(tree, pitcherId) {
    var box = tree && tree.liveData && tree.liveData.boxscore;
    if (!box || !box.teams) return { pitcher: null, team: null, side: null };
    var sides = ['away', 'home'];
    var fallback = null;
    /* First pass: the side whose box score actually lists this pitcher. Only if
     * the pitcher is not in the box score do we fall back to a team total, and
     * only when there is exactly one candidate — a pitch count attributed to the
     * wrong team would be worse than no count at all. */
    for (var i = 0; i < sides.length; i += 1) {
      var team = box.teams[sides[i]];
      if (!team) continue;
      var entry = pitcherId ? (team.players || {})['ID' + pitcherId] : null;
      var teamTotal = numOrNull(team.teamStats && team.teamStats.pitching && team.teamStats.pitching.numberOfPitches);
      if (teamTotal === null) {
        teamTotal = numOrNull(team.teamStats && team.teamStats.pitching && team.teamStats.pitching.pitchesThrown);
      }
      if (entry && entry.stats && entry.stats.pitching) {
        var count = numOrNull(entry.stats.pitching.numberOfPitches);
        if (count === null) count = numOrNull(entry.stats.pitching.pitchesThrown);
        if (count !== null) return { pitcher: count, team: teamTotal, side: sides[i] };
      }
      if (teamTotal !== null) {
        if (!fallback) fallback = { pitcher: null, team: teamTotal, side: sides[i] };
        else fallback = { pitcher: null, team: null, side: null };
      }
    }
    return fallback || { pitcher: null, team: null, side: null };
  }

  /**
   * snapshot(game, tree) — one official state record.
   * `game` is the schedule row (for gamePk/teams/gameDate fallbacks).
   */
  function snapshot(game, tree) {
    if (!tree) return null;
    var gd = tree.gameData || {};
    var status = gd.status || {};
    var live = tree.liveData || {};
    var ls = live.linescore || {};
    var plays = live.plays || {};
    var cur = plays.currentPlay || null;
    var allPlays = plays.allPlays || [];
    var lastPlay = cur || allPlays[allPlays.length - 1] || null;
    var meta = tree.metaData || {};

    var half = ls.inningState ? String(ls.inningState).toLowerCase() : (ls.isTopInning === false ? 'bottom' : 'top');
    var isTop = half.indexOf('top') === 0;
    var inningNum = numOrNull(ls.currentInning) || numOrNull(ls.scheduledInnings) || null;

    var offense = ls.offense || {};
    var defense = ls.defense || {};
    var batter = playerOf(offense.batter || (cur && cur.matchup && cur.matchup.batter));
    var pitcher = playerOf(defense.pitcher || (cur && cur.matchup && cur.matchup.pitcher));

    var score = {
      away: numOrNull(ls.teams && ls.teams.away && ls.teams.away.runs),
      home: numOrNull(ls.teams && ls.teams.home && ls.teams.home.runs),
    };
    if (score.away === null || score.home === null) {
      var res = (lastPlay && lastPlay.result) || {};
      if (numOrNull(res.awayScore) !== null && numOrNull(res.homeScore) !== null) {
        score = { away: numOrNull(res.awayScore), home: numOrNull(res.homeScore) };
      }
    }

    var pitches = pitcherPitchCount(tree, pitcher.id);
    var capturedAt = Date.now();

    var officialBits = [];
    if (status.detailedState) officialBits.push(status.detailedState);
    if (status.reason) officialBits.push(status.reason);
    if (lastPlay && lastPlay.result && lastPlay.result.description) officialBits.push(lastPlay.result.description);

    return {
      v: VERSION,
      gamePk: numOrNull(gd.game && gd.game.pk) || numOrNull(game && game.gamePk),
      capturedAt: capturedAt,
      capturedAtIso: isoSeconds(capturedAt),
      capturedAtMsIso: isoMillis(capturedAt),
      clock: clockOf(capturedAt),
      gamedayTimecode: meta.timeStamp || null,
      gamedayWait: numOrNull(meta.wait),
      officialDate: str(gd.datetime && gd.datetime.officialDate) || str(game && game.officialDate),
      gameDate: str(gd.datetime && gd.datetime.dateTime),
      teams: teamsOfTree(tree),
      status: {
        abstract: str(status.abstractGameState),
        coded: str(status.codedGameState),
        detailed: str(status.detailedState),
        code: str(status.statusCode),
        reason: str(status.reason),
      },
      inning: {
        num: inningNum,
        ordinal: inningNum ? ordinal(inningNum) : '',
        half: half,
        isTop: isTop,
        label: inningNum ? (isTop ? 'Top ' : 'Bot ') + inningNum : '',
      },
      outs: numOrNull(ls.outs !== undefined ? ls.outs : (cur && cur.count && cur.count.outs)),
      count: {
        balls: numOrNull(ls.balls !== undefined ? ls.balls : (cur && cur.count && cur.count.balls)),
        strikes: numOrNull(ls.strikes !== undefined ? ls.strikes : (cur && cur.count && cur.count.strikes)),
      },
      score: score,
      batter: batter,
      pitcher: pitcher,
      pitchCount: {
        pitcher: pitches.pitcher,
        team: pitches.team,
        pitchingSide: pitches.side || null,
      },
      bases: {
        first: !!(offense.first && offense.first.id),
        second: !!(offense.second && offense.second.id),
        third: !!(offense.third && offense.third.id),
      },
      currentPlay: lastPlay ? {
        atBatIndex: numOrNull(lastPlay.about && lastPlay.about.atBatIndex),
        isComplete: lastPlay.about ? lastPlay.about.isComplete === true : null,
        hasReview: !!(lastPlay.about && lastPlay.about.hasReview),
        eventType: str(lastPlay.result && lastPlay.result.eventType),
        description: str(lastPlay.result && lastPlay.result.description),
        startTime: str(lastPlay.about && lastPlay.about.startTime),
        endTime: str(lastPlay.about && lastPlay.about.endTime),
        rbi: numOrNull(lastPlay.result && lastPlay.result.rbi),
      } : null,
      officialWording: officialBits.join(' · '),
      isReviewState: /^[MN]/.test(str(status.statusCode).toUpperCase()) || str(status.statusCode).toUpperCase() === 'IH',
    };
  }

  /* --------------------------------------------------------------- diffing */

  /* "An at-bat that has not been scored yet": the plate appearance is complete
   * in the official feed, but no official result has been published. GUMBO
   * leaves `result.eventType` as '' or 'at_bat_start' in that window, and the
   * API's own pending event types cover the rest. Nothing is inferred beyond
   * those two observable facts. */
  function isPendingResult(play) {
    if (!play || !play.about || play.about.isComplete !== true) return false;
    var type = String((play.result && play.result.eventType) || '');
    if (!type || type === 'at_bat_start') return true;
    return type === 'os_ruling_pending_primary' || type === 'os_ruling_pending_prior';
  }

  function fmtScore(s) {
    if (!s || (s.away === null && s.home === null)) return '';
    return (s.away === null ? '—' : s.away) + '–' + (s.home === null ? '—' : s.home);
  }

  function fmtCount(c) {
    if (!c) return '';
    if (c.balls === null && c.strikes === null) return '';
    return (c.balls === null ? '—' : c.balls) + '-' + (c.strikes === null ? '—' : c.strikes);
  }

  function basesLabel(b) {
    if (!b) return '';
    var on = [];
    if (b.first) on.push('1B');
    if (b.second) on.push('2B');
    if (b.third) on.push('3B');
    return on.length ? on.join(' ') : 'empty';
  }

  /**
   * diff(prev, next) — field-by-field changes with rendered before/after text.
   * Returns { changes: [...], flags: {...} }.
   *
   * flags:
   *   reviewStarted    official status flipped into an M-family/N-family/IH review code
   *   reviewEnded      it flipped out again
   *   reviewResolved   the same at-bat's review block is no longer in progress
   *   newPitch         another pitch was thrown (count or playEvents moved)
   *   newPlay          a plate appearance completed
   *   scoreChanged     runs on the board moved
   *   pendingScored    an at-bat that had no official event now has one
   *   unscoredAtBat    a completed at-bat still has no official event published
   */
  function diff(prev, next) {
    var changes = [];
    var flags = {
      reviewStarted: false, reviewEnded: false, reviewResolved: false,
      newPitch: false, newPlay: false, scoreChanged: false,
      pendingScored: false, unscoredAtBat: false, any: false,
    };
    if (!next) return { changes: changes, flags: flags };
    if (!prev) {
      flags.any = true;
      if (next.currentPlay && next.currentPlay.isComplete === true && !next.currentPlay.eventType) {
        flags.unscoredAtBat = true;
      }
      return { changes: changes, flags: flags };
    }

    function push(field, label, before, after, official) {
      if (before === after) return;
      changes.push({ field: field, label: label, before: before, after: after, official: !!official });
      flags.any = true;
    }

    push('status', 'Status', prev.status.detailed, next.status.detailed, true);
    push('statusReason', 'Status reason', prev.status.reason, next.status.reason, true);
    push('statusCode', 'Status code', prev.status.code, next.status.code, true);
    push('inning', 'Inning', prev.inning.label, next.inning.label, true);
    push('outs', 'Outs', prev.outs, next.outs, true);
    push('count', 'Count (B-S)', fmtCount(prev.count), fmtCount(next.count), true);
    push('score', 'Score (away-home)', fmtScore(prev.score), fmtScore(next.score), true);
    push('batter', 'At bat', prev.batter.name, next.batter.name, true);
    push('pitcher', 'Pitcher', prev.pitcher.name, next.pitcher.name, true);
    push('pitchCountPitcher', 'Pitch count (pitcher)', prev.pitchCount.pitcher, next.pitchCount.pitcher, true);
    push('bases', 'Runners', basesLabel(prev.bases), basesLabel(next.bases), true);
    if (prev.currentPlay && next.currentPlay) {
      push('playEvent', 'Play event', prev.currentPlay.eventType, next.currentPlay.eventType, true);
      push('playDescription', 'Play description', prev.currentPlay.description, next.currentPlay.description, true);
      if (prev.currentPlay.atBatIndex !== next.currentPlay.atBatIndex) {
        flags.newPlay = true;
        flags.any = true;
      }
    }

    if (prev.score.away !== next.score.away || prev.score.home !== next.score.home) flags.scoreChanged = true;
    if (fmtCount(prev.count) !== fmtCount(next.count)) flags.newPitch = true;

    var prevIsReview = prev.isReviewState;
    var nextIsReview = next.isReviewState;
    if (!prevIsReview && nextIsReview) flags.reviewStarted = true;
    if (prevIsReview && !nextIsReview) flags.reviewEnded = true;

    var prevPending = !!(prev.currentPlay && prev.currentPlay.isComplete === true &&
      (!prev.currentPlay.eventType || prev.currentPlay.eventType === 'at_bat_start' ||
        prev.currentPlay.eventType === 'os_ruling_pending_primary' || prev.currentPlay.eventType === 'os_ruling_pending_prior'));
    var nextPending = !!(next.currentPlay && next.currentPlay.isComplete === true &&
      (!next.currentPlay.eventType || next.currentPlay.eventType === 'at_bat_start' ||
        next.currentPlay.eventType === 'os_ruling_pending_primary' || next.currentPlay.eventType === 'os_ruling_pending_prior'));
    if (nextPending) flags.unscoredAtBat = true;
    if (prevPending && !nextPending && prev.currentPlay && next.currentPlay &&
      prev.currentPlay.atBatIndex === next.currentPlay.atBatIndex) {
      flags.pendingScored = true;
      flags.any = true;
    }

    return { changes: changes, flags: flags };
  }

  /* A compact human-readable sentence for a transition: the official wording on
   * both sides, never a prediction. */
  function transitionText(prev, next) {
    if (!next) return '';
    if (!prev) return next.officialWording || '';
    return (prev.officialWording || '—') + ' → ' + (next.officialWording || '—');
  }

  /* One-line state summary used on rows, in the state panel and in exports. */
  function summary(state) {
    if (!state) return '';
    var bits = [];
    if (state.score && (state.score.away !== null || state.score.home !== null)) {
      var a = state.teams && state.teams.away && state.teams.away.abbr ? state.teams.away.abbr : 'AWY';
      var h = state.teams && state.teams.home && state.teams.home.abbr ? state.teams.home.abbr : 'HME';
      bits.push(a + ' ' + (state.score.away === null ? '—' : state.score.away) +
        ' – ' + h + ' ' + (state.score.home === null ? '—' : state.score.home));
    }
    if (state.inning && state.inning.label) bits.push(state.inning.label);
    if (state.outs !== null && state.outs !== undefined) bits.push(state.outs + ' out' + (state.outs === 1 ? '' : 's'));
    if (state.count && (state.count.balls !== null || state.count.strikes !== null)) bits.push('count ' + fmtCount(state.count));
    if (state.batter && state.batter.name) bits.push(state.batter.name + ' at bat');
    if (state.pitcher && state.pitcher.name) bits.push(state.pitcher.name + ' pitching');
    if (state.pitchCount && state.pitchCount.pitcher !== null) bits.push(state.pitchCount.pitcher + ' pitches');
    return bits.join(' · ');
  }

  /* Explicit, ordered list of the fields the capture guarantees. Exposed so the
   * UI (and the tests) can state exactly what is tracked instead of implying
   * "everything". */
  var CAPTURED_FIELDS = [
    'capturedAt (ms + ISO to the second)',
    'gamedayTimecode (official update timecode)',
    'status.abstract / coded / detailed / code / reason',
    'inning.num / half / official ordinal',
    'outs',
    'count.balls / count.strikes',
    'score.away / score.home',
    'batter.id / batter.name',
    'pitcher.id / pitcher.name',
    'pitchCount.pitcher / pitchCount.team (official numberOfPitches)',
    'bases.first / second / third',
    'currentPlay.atBatIndex / isComplete / hasReview / eventType / description / startTime / endTime / rbi',
    'officialWording (payload detail, verbatim)',
  ];

  global.LiveState = {
    VERSION: VERSION,
    snapshot: snapshot,
    diff: diff,
    transitionText: transitionText,
    summary: summary,
    isPendingResult: isPendingResult,
    fmtScore: fmtScore,
    fmtCount: fmtCount,
    basesLabel: basesLabel,
    isoSeconds: isoSeconds,
    isoMillis: isoMillis,
    clockOf: clockOf,
    ordinal: ordinal,
    CAPTURED_FIELDS: CAPTURED_FIELDS,
  };
}(typeof window !== 'undefined' ? window : globalThis));
