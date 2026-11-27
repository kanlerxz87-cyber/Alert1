/* ============================================================================
 * game-state.js — official live game state, captured as it happens
 *
 * Every poll turns the official StatsAPI payload into one *state record*:
 * score (with hits and errors), inning (number, half, state), outs, ball/strike
 * count, runners on base, the batter at the plate, the pitcher, on-deck and
 * in-the-hole hitters, the pitch count (game total, this plate appearance and
 * the current pitcher's own count where the payload carries it), the plate
 * appearance itself (index, last play wording and classification), the official
 * challenge counters, the game status, and — crucially — *when* we saw it.
 *
 * Two clocks are kept, never confused:
 *   observedAt   our own Date.now() when the response landed  (ms since epoch)
 *   timecode     MLB's own `metaData.timeStamp` / `metaData.wait` from feed/live,
 *                stored verbatim as the official provenance of that state
 *
 * Nothing here is inferred: a field the payload does not carry is left `null`
 * and rendered as "—".  `diff()` and `summary()` are pure functions so the
 * Replay Feed can attach an exact before/after pair to every reviewed play,
 * pending ruling and scoring change.
 * ==========================================================================*/
(function (global) {
  'use strict';

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function person(p) {
    if (!p) return null;
    var id = num(p.id !== undefined ? p.id : (p.person && p.person.id));
    var name = p.fullName || (p.person && p.person.fullName) || p.name || null;
    if (id === null && !name) return null;
    return { id: id, name: name };
  }

  function playsOf(feed) {
    if (!feed) return [];
    if (feed.liveData && feed.liveData.plays && feed.liveData.plays.allPlays) {
      return feed.liveData.plays.allPlays;
    }
    return feed.allPlays || [];
  }

  function currentPlayOf(feed) {
    if (!feed) return null;
    if (feed.liveData && feed.liveData.plays && feed.liveData.plays.currentPlay) {
      return feed.liveData.plays.currentPlay;
    }
    return feed.currentPlay || null;
  }

  function linescoreOf(feed) {
    if (!feed) return null;
    if (feed.liveData && feed.liveData.linescore) return feed.liveData.linescore;
    return feed.linescore || null;
  }

  /* Pitches are play events with `isPitch: true` — the API's own marker.  Used
   * for the game total and the current plate appearance; a pitcher's official
   * per-game count lives in the box score (`stats.pitching.numberOfPitches`),
   * which this feed does not poll, so it is only filled when the payload
   * happens to carry it (feed/live `boxscore`). */
  function countPitches(play) {
    var n = 0;
    ((play && play.playEvents) || []).forEach(function (ev) {
      if (ev && ev.isPitch === true) n += 1;
    });
    return n;
  }

  function payloadTimecode(feed) {
    var meta = (feed && (feed.metaData || (feed.gameData && feed.gameData.metaData))) || null;
    if (!meta) return null;
    return {
      timeStamp: meta.timeStamp || null,
      wait: num(meta.wait),
      gameEvents: meta.gameEvents || null,
      logicalEvents: meta.logicalEvents || null,
    };
  }

  function teamOf(game, side) {
    var t = game && game.teams && game.teams[side];
    if (!t) return null;
    var team = t.team || t;
    return {
      id: num(team.id),
      name: team.name || team.teamName || null,
      abbreviation: team.abbreviation || null,
      score: num(t.score),
      isWinner: t.isWinner === true,
    };
  }

  /**
   * capture(input) -> state record
   *   input = {
   *     game,             schedule game (teams/status/gameDate) — optional
   *     feed,             feed/live OR playByPlay payload
   *     countersPayload,  feed/live projection carrying gameData.review etc.
   *     observedAt,       Date.now() when the response landed (default: now)
   *   }
   */
  function capture(input) {
    input = input || {};
    var game = input.game || null;
    var feed = input.feed || null;
    var counters = input.countersPayload || null;
    var observedAt = Number(input.observedAt) || Date.now();

    var plays = playsOf(feed);
    var currentPlay = currentPlayOf(feed);
    var ls = linescoreOf(feed) || linescoreOf(counters) || null;
    /* the last *completed* play is the anchor for score/outs/count when no
     * linescore came back with this response */
    var lastComplete = null;
    for (var i = plays.length - 1; i >= 0; i -= 1) {
      var p = plays[i];
      if (p && p.about && p.about.isComplete !== false) { lastComplete = p; break; }
    }
    var anchor = lastComplete || plays[plays.length - 1] || null;

    var gameData = (feed && feed.gameData) || (counters && counters.gameData) || null;
    var statusSrc = (game && game.status) || (gameData && gameData.status) || null;

    var lsTeams = (ls && ls.teams) || null;
    var awayTeam = teamOf(game, 'away');
    var homeTeam = teamOf(game, 'home');
    if ((!awayTeam || !homeTeam) && gameData && gameData.teams) {
      awayTeam = awayTeam || { id: num(gameData.teams.away && gameData.teams.away.id), name: (gameData.teams.away && gameData.teams.away.name) || null, abbreviation: (gameData.teams.away && gameData.teams.away.abbreviation) || null, score: null };
      homeTeam = homeTeam || { id: num(gameData.teams.home && gameData.teams.home.id), name: (gameData.teams.home && gameData.teams.home.name) || null, abbreviation: (gameData.teams.home && gameData.teams.home.abbreviation) || null, score: null };
    }

    var scoreAway = (lsTeams && lsTeams.away && num(lsTeams.away.runs) !== null) ? num(lsTeams.away.runs)
      : (anchor && anchor.result && num(anchor.result.awayScore) !== null ? num(anchor.result.awayScore) : (awayTeam && awayTeam.score));
    var scoreHome = (lsTeams && lsTeams.home && num(lsTeams.home.runs) !== null) ? num(lsTeams.home.runs)
      : (anchor && anchor.result && num(anchor.result.homeScore) !== null ? num(anchor.result.homeScore) : (homeTeam && homeTeam.score));

    var countSrc = (ls && (num(ls.balls) !== null || num(ls.outs) !== null)) ? ls : ((anchor && anchor.count) || null);
    var batter = person((currentPlay && currentPlay.matchup && currentPlay.matchup.batter) ||
      (anchor && anchor.matchup && anchor.matchup.batter));
    var pitcher = person((currentPlay && currentPlay.matchup && currentPlay.matchup.pitcher) ||
      (anchor && anchor.matchup && anchor.matchup.pitcher));

    var totalPitches = 0;
    plays.forEach(function (pl) { totalPitches += countPitches(pl); });

    var gdCounters = (counters && counters.gameData) || gameData || null;
    var managerReview = (gdCounters && gdCounters.review) || (game && game.review) || null;
    var absChallenges = (gdCounters && gdCounters.absChallenges) || null;

    var boxPitching = feed && feed.liveData && feed.liveData.boxscore &&
      feed.liveData.boxscore.teams;
    var pitcherPitches = null;
    if (boxPitching && pitcher && pitcher.id !== null) {
      ['away', 'home'].some(function (side) {
        var players = (boxPitching[side] && boxPitching[side].players) || {};
        var hit = players['ID' + pitcher.id];
        var n = hit && hit.stats && hit.stats.pitching && num(hit.stats.pitching.numberOfPitches);
        if (n !== null) { pitcherPitches = n; return true; }
        return false;
      });
    }

    return {
      gamePk: num((game && game.gamePk) || (feed && feed.gamePk) || (gameData && gameData.game && gameData.game.pk)),
      gameDate: (game && game.gameDate) || (gameData && gameData.datetime && gameData.datetime.dateTime) || null,
      observedAt: observedAt,
      status: statusSrc ? {
        abstract: statusSrc.abstractGameState || null,
        detailed: statusSrc.detailedState || null,
        code: statusSrc.statusCode || null,
        reason: statusSrc.reason || null,
      } : null,
      teams: { away: awayTeam, home: homeTeam },
      score: { away: scoreAway, home: scoreHome },
      hits: {
        away: (lsTeams && lsTeams.away && num(lsTeams.away.hits) !== undefined) ? num(lsTeams.away.hits) : null,
        home: (lsTeams && lsTeams.home && num(lsTeams.home.hits) !== undefined) ? num(lsTeams.home.hits) : null,
      },
      errors: {
        away: (lsTeams && lsTeams.away && num(lsTeams.away.errors) !== undefined) ? num(lsTeams.away.errors) : null,
        home: (lsTeams && lsTeams.home && num(lsTeams.home.errors) !== undefined) ? num(lsTeams.home.errors) : null,
      },
      inning: ls ? {
        num: num(ls.currentInning),
        ordinal: ls.currentInningOrdinal || null,
        half: ls.inningHalf || ls.inningState || null,
        state: ls.inningState || null,
        scheduled: num(ls.scheduledInnings),
        isTop: ls.isTopInning === true ? true : (ls.isTopInning === false ? false : null),
      } : null,
      outs: countSrc ? num(countSrc.outs) : null,
      count: countSrc ? { balls: num(countSrc.balls), strikes: num(countSrc.strikes) } : null,
      bases: (ls && ls.offense) ? {
        first: person(ls.offense.first),
        second: person(ls.offense.second),
        third: person(ls.offense.third),
      } : null,
      batter: batter,
      pitcher: pitcher,
      onDeck: person(currentPlay && currentPlay.matchup && currentPlay.matchup.onDeck),
      inHole: person(currentPlay && currentPlay.matchup && currentPlay.matchup.inHole),
      atBat: {
        index: num((currentPlay && currentPlay.about && currentPlay.about.atBatIndex !== undefined)
          ? currentPlay.about.atBatIndex
          : (anchor && anchor.about ? anchor.about.atBatIndex : undefined)),
        isComplete: currentPlay && currentPlay.about && typeof currentPlay.about.isComplete === 'boolean'
          ? currentPlay.about.isComplete : null,
        pitches: currentPlay ? countPitches(currentPlay) : null,
        lastPlay: anchor ? {
          atBatIndex: num(anchor.about && anchor.about.atBatIndex),
          description: (anchor.result && anchor.result.description) || null,
          eventType: (anchor.result && anchor.result.eventType) || null,
          isScoringPlay: (anchor.about && anchor.about.isScoringPlay) === true ||
            (anchor.result && anchor.result.isScoringPlay) === true,
          awayScore: num(anchor.result && anchor.result.awayScore),
          homeScore: num(anchor.result && anchor.result.homeScore),
        } : null,
      },
      pitchCount: {
        game: totalPitches || null,
        thisAtBat: currentPlay ? countPitches(currentPlay) : null,
        pitcher: pitcherPitches,
      },
      challenges: (managerReview || absChallenges) ? {
        manager: managerReview ? {
          hasChallenges: managerReview.hasChallenges === true,
          away: managerReview.away ? { used: num(managerReview.away.used), remaining: num(managerReview.away.remaining) } : null,
          home: managerReview.home ? { used: num(managerReview.home.used), remaining: num(managerReview.home.remaining) } : null,
        } : null,
        abs: absChallenges ? {
          hasChallenges: absChallenges.hasChallenges === true,
          away: absChallenges.away ? {
            usedSuccessful: num(absChallenges.away.usedSuccessful),
            usedFailed: num(absChallenges.away.usedFailed),
            remaining: num(absChallenges.away.remaining),
          } : null,
          home: absChallenges.home ? {
            usedSuccessful: num(absChallenges.home.usedSuccessful),
            usedFailed: num(absChallenges.home.usedFailed),
            remaining: num(absChallenges.home.remaining),
          } : null,
        } : null,
      } : null,
      timecode: payloadTimecode(feed) || payloadTimecode(counters) || null,
    };
  }

  /* ------------------------------------------------------------- rendering */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** Local clock, always to the second: "2026-08-28 14:31:52". */
  function stamp(ms) {
    var d = new Date(Number(ms) || Date.now());
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  /** Local clock only: "14:31:52". */
  function clock(ms) {
    var d = new Date(Number(ms) || Date.now());
    if (isNaN(d.getTime())) return '';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  /** UTC clock to the second (the same frame MLB's payload timestamps use). */
  function utc(ms) {
    var d = new Date(Number(ms) || Date.now());
    if (isNaN(d.getTime())) return '';
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + ' ' +
      pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()) + 'Z';
  }

  function scoreText(state) {
    if (!state || !state.score || (state.score.away === null && state.score.home === null)) return '—';
    return (state.score.away === null ? '—' : state.score.away) + '–' +
      (state.score.home === null ? '—' : state.score.home);
  }

  function halfLabel(state) {
    if (!state || !state.inning || state.inning.num === null) return '';
    var half = String(state.inning.half || '').toLowerCase();
    var word = half.indexOf('top') === 0 ? 'Top' : half.indexOf('bot') === 0 ? 'Bot' : (state.inning.isTop === false ? 'Bot' : 'Top');
    return word + ' ' + state.inning.num;
  }

  function countText(state) {
    if (!state || !state.count || (state.count.balls === null && state.count.strikes === null)) return '';
    return (state.count.balls === null ? '—' : state.count.balls) + '-' +
      (state.count.strikes === null ? '—' : state.count.strikes);
  }

  /** One-line human summary of a captured state. */
  function summary(state) {
    if (!state) return '';
    var bits = [];
    var awayName = (state.teams && state.teams.away && (state.teams.away.abbreviation || state.teams.away.name)) || 'Away';
    var homeName = (state.teams && state.teams.home && (state.teams.home.abbreviation || state.teams.home.name)) || 'Home';
    bits.push(awayName + ' ' + scoreText(state) + ' ' + homeName);
    var half = halfLabel(state);
    if (half) bits.push(half);
    if (state.outs !== null && state.outs !== undefined) bits.push(state.outs + ' out' + (state.outs === 1 ? '' : 's'));
    var ct = countText(state);
    if (ct) bits.push(ct);
    if (state.batter && state.batter.name) bits.push(state.batter.name);
    if (state.pitcher && state.pitcher.name) bits.push('vs ' + state.pitcher.name);
    if (state.pitchCount && state.pitchCount.game !== null && state.pitchCount.game !== undefined) {
      bits.push('P ' + state.pitchCount.game);
    }
    return bits.join(' · ');
  }

  /* Fields compared between two observations.  Ordered by how interesting a
   * change in that field is to a replay / scoring alert. */
  var COMPARED = [
    { key: 'score', label: 'Score' },
    { key: 'outs', label: 'Outs' },
    { key: 'count', label: 'Count' },
    { key: 'inning', label: 'Inning' },
    { key: 'batter', label: 'Batter' },
    { key: 'pitcher', label: 'Pitcher' },
    { key: 'pitchCount', label: 'Pitch count' },
    { key: 'status', label: 'Status' },
    { key: 'hits', label: 'Hits' },
    { key: 'errors', label: 'Errors' },
  ];

  function fieldText(field, state) {
    if (!state) return '—';
    switch (field.key) {
      case 'score': return scoreText(state);
      case 'outs': return state.outs === null || state.outs === undefined ? '—' : String(state.outs);
      case 'count': return countText(state) || '—';
      case 'inning': return halfLabel(state) || '—';
      case 'batter': return (state.batter && state.batter.name) || '—';
      case 'pitcher': return (state.pitcher && state.pitcher.name) || '—';
      case 'pitchCount':
        if (!state.pitchCount) return '—';
        return state.pitchCount.game === null || state.pitchCount.game === undefined ? '—' : String(state.pitchCount.game);
      case 'status': return (state.status && (state.status.detailed || state.status.abstract)) || '—';
      case 'hits': return state.hits && (state.hits.away !== null || state.hits.home !== null)
        ? state.hits.away + '–' + state.hits.home : '—';
      case 'errors': return state.errors && (state.errors.away !== null || state.errors.home !== null)
        ? state.errors.away + '–' + state.errors.home : '—';
      default: return '—';
    }
  }

  /**
   * diff(before, after) -> [ { field, label, from, to } ]
   * Only fields whose rendered value actually changed are returned, so a row
   * can say exactly what moved between the two observations.
   */
  function diff(before, after) {
    var out = [];
    if (!before || !after) return out;
    COMPARED.forEach(function (field) {
      var from = fieldText(field, before);
      var to = fieldText(field, after);
      if (from === to) return;
      if (from === '—' && to === '—') return;
      out.push({ field: field.key, label: field.label, from: from, to: to });
    });
    return out;
  }

  /* Compact, stable text for a whole before/after pair (used for signatures
   * and for the audit notes). */
  function pairText(before, after) {
    var changes = diff(before, after);
    if (!changes.length) return 'no material change';
    return changes.map(function (c) { return c.label + ': ' + c.from + ' → ' + c.to; }).join('; ');
  }

  /**
   * equivalent(a, b) — same material state?  Used to avoid storing a state
   * observation when nothing but the clock moved.
   */
  function equivalent(a, b) {
    if (!a || !b) return false;
    return diff(a, b).length === 0;
  }

  global.GameState = {
    capture: capture,
    diff: diff,
    pairText: pairText,
    equivalent: equivalent,
    summary: summary,
    scoreText: scoreText,
    halfLabel: halfLabel,
    countText: countText,
    fieldText: fieldText,
    stamp: stamp,
    clock: clock,
    utc: utc,
    playsOf: playsOf,
    currentPlayOf: currentPlayOf,
    linescoreOf: linescoreOf,
    countPitches: countPitches,
    COMPARED: COMPARED,
  };
}(window));
