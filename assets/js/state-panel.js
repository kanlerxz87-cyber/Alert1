/* ============================================================================
 * state-panel.js — "Live game state" + "Official scoring ledger" sections
 *
 * Two independent sections rendered above the replay feed on reviews.html:
 *
 *   1. LIVE GAME STATE — one card per live game: the official state as captured
 *      (score · inning · outs · count · batter · pitcher · pitch count ·
 *      runners), the capture timestamp to the second, the official timecode,
 *      which transport delivered it (push / delta / full), and — when the state
 *      moved while the page was open — the before → after list with MLB's own
 *      wording on both sides.
 *
 *   2. OFFICIAL SCORING LEDGER — the separate, persistent log of
 *      (a) at-bats with an official-scoring ruling pending and
 *      (b) official scoring changes (reclassifications),
 *      each with before/after state, official wording, second-precision
 *      timestamps, filters, and JSON/CSV export so a refresh (or a browser
 *      reset) cannot lose the record.
 *
 * Kept out of the alert path on purpose: nothing here can throw at
 * reviews-feed.js, and its storage is its own namespace (scoring-ledger.js).
 * ==========================================================================*/
(function (global) {
  'use strict';

  var UI = global.UI;
  var LiveState = global.LiveState;
  var Ledger = global.ScoringLedger;

  var state = {
    ledger: null,
    ledgerDate: null,
    filter: 'all',
    gameFilter: 'all',
    ledgerSeq: 0,
    lastRenderSig: '',
    showCaptured: false,
  };

  function $(id) { return document.getElementById(id); }

  function esc(v) { return UI ? UI.esc(v) : String(v === undefined || v === null ? '' : v); }

  function timeOf(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return esc(value);
    return d.toISOString().slice(11, 19) + 'Z';
  }

  function dateTimeOf(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return esc(value);
    return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
  }

  /* ------------------------------------------------------------ live states */

  /**
   * renderStates(list, opts)
   *   list: [{ gamePk, matchup, state (LiveState snapshot), prevState,
   *            transport, suggestedWaitSec, lastError, live, final }]
   *   opts: { generatedAt, transports: {...} }
   */
  function renderStates(list, opts) {
    var wrap = $('state-grid');
    var meta = $('state-meta');
    if (!wrap) return;
    opts = opts || {};
    var games = (list || []).slice().sort(function (a, b) {
      var ar = a.state && a.state.isReviewState ? 1 : 0;
      var br = b.state && b.state.isReviewState ? 1 : 0;
      if (ar !== br) return br - ar;      // a game in review floats to the top
      return String(a.matchup || '').localeCompare(String(b.matchup || ''));
    });

    var filtered = games.filter(function (g) {
      if (state.gameFilter === 'review') return g.state && g.state.isReviewState;
      if (state.gameFilter === 'live') return g.live;
      return true;
    });

    if (meta) {
      var t = opts.transports || {};
      meta.innerHTML =
        '<span class="state-chip">' + games.filter(function (g) { return g.live; }).length + ' live</span>' +
        '<span class="state-chip' + (t.push ? ' is-ok' : '') + '" title="Gameday websocket subscriptions open">push ' + (t.push || 0) + '</span>' +
        '<span class="state-chip' + (t.delta ? ' is-ok' : '') + '" title="Games updating from diffPatch deltas against a held feed copy">delta ' + (t.delta || 0) + '</span>' +
        '<span class="state-chip" title="Games on the full-feed path (seed / fallback)">full ' + (t.full || 0) + '</span>' +
        '<span class="state-chip" title="Captured official states kept in memory this session">captures ' + (opts.captures || 0) + '</span>' +
        (opts.generatedAt ? '<span class="state-chip is-dim">panel ' + timeOf(opts.generatedAt) + '</span>' : '');
    }

    if (!filtered.length) {
      wrap.innerHTML = '<div class="state-empty">No live games captured yet for this date. The panel fills the moment a game goes live — one card per game, timestamped to the second.</div>';
      return;
    }

    wrap.innerHTML = filtered.map(function (g) {
      var s = g.state || {};
      var before = g.prevState || null;
      var diff = before && s ? LiveState.diff(before, s) : { changes: [], flags: {} };
      var shown = diff.changes.filter(function (c) { return c.field !== 'statusReason' || c.after; });
      var transportLabel = g.transport === 'push' ? '⚡ push' : g.transport === 'delta' ? 'Δ delta' : 'full feed';
      return '<article class="state-card' + (s.isReviewState ? ' is-review' : '') + '">' +
        '<header class="state-head">' +
          '<a class="state-matchup" href="game.html?gamePk=' + encodeURIComponent(g.gamePk) + '&date=' + encodeURIComponent(g.date || '') + '">' + esc(g.matchup || '') + '</a>' +
          '<span class="state-status">' + esc(s.status && s.status.detailed || '—') + '</span>' +
          '<span class="state-transport" title="Which official transport delivered the state">' + esc(transportLabel) + '</span>' +
          '<span class="state-clock" title="Capture time (UTC, second precision) and the official Gameday timecode">' +
            esc(s.capturedAtIso || timeOf(s.capturedAt)) +
            (s.gamedayTimecode ? ' · ' + esc(s.gamedayTimecode) : '') +
          '</span>' +
        '</header>' +
        '<div class="state-line">' + esc(LiveState.summary(s) || '—') + '</div>' +
        '<dl class="state-fields">' +
          field('Score', s.score ? (esc(shortAbbr(s.teams, 'away')) + ' ' + (s.score.away === null ? '—' : s.score.away) +
            ' – ' + esc(shortAbbr(s.teams, 'home')) + ' ' + (s.score.home === null ? '—' : s.score.home)) : '—') +
          field('Inning', s.inning && s.inning.label ? esc(s.inning.label) : '—') +
          field('Outs', s.outs === null || s.outs === undefined ? '—' : esc(s.outs)) +
          field('Count', s.count ? esc(LiveState.fmtCount(s.count) || '—') : '—') +
          field('Batter', s.batter && s.batter.name ? esc(s.batter.name) : '—') +
          field('Pitcher', s.pitcher && s.pitcher.name ? esc(s.pitcher.name) : '—') +
          field('Pitch count', s.pitchCount && s.pitchCount.pitcher !== null && s.pitchCount.pitcher !== undefined
            ? esc(s.pitchCount.pitcher) + (s.pitchCount.team !== null && s.pitchCount.team !== undefined ? ' <span class="state-dim">(team ' + esc(s.pitchCount.team) + ')</span>' : '')
            : '—') +
          field('Runners', esc(LiveState.basesLabel(s.bases))) +
          field('At bat', s.currentPlay ? esc((s.currentPlay.atBatIndex === null ? '—' : '#' + s.currentPlay.atBatIndex) +
            (s.currentPlay.isComplete === true ? ' complete' : ' in progress')) : '—') +
          field('Official status', esc([s.status && s.status.abstract, s.status && s.status.code].filter(Boolean).join(' · ') || '—')) +
        '</dl>' +
        (s.officialWording ? '<div class="state-wording">“' + esc(s.officialWording) + '”</div>' : '') +
        (shown.length
          ? '<div class="state-before"><h5>Latest change (before → after)</h5><ul>' +
              shown.slice(0, 8).map(function (c) {
                return '<li><span class="state-field">' + esc(c.label) + '</span>' +
                  '<span class="state-prev">' + esc(c.before === null || c.before === '' ? '—' : c.before) + '</span>' +
                  '<span class="state-arrow">→</span>' +
                  '<span class="state-next">' + esc(c.after === null || c.after === '' ? '—' : c.after) + '</span></li>';
              }).join('') + '</ul></div>'
          : '') +
        (g.suggestedWaitSec ? '<div class="state-foot">MLB suggests ' + esc(g.suggestedWaitSec) + 's between updates for this game; this page polls the delta endpoint every ' +
          esc(Math.round((g.deltaPollMs || 250))) + 'ms and tightens further while a review is open.</div>' : '') +
        (g.lastError ? '<div class="state-foot is-error">Last transport error: ' + esc(g.lastError.message || g.lastError) + '</div>' : '') +
      '</article>';
    }).join('');
  }

  function shortAbbr(teams, side) {
    var t = teams && teams[side];
    if (!t) return side === 'away' ? 'AWY' : 'HME';
    return t.abbr || String(t.name || (side === 'away' ? 'AWY' : 'HME')).slice(0, 3).toUpperCase();
  }

  function field(label, valueHtml) {
    return '<div class="state-field-row"><dt>' + esc(label) + '</dt><dd>' + valueHtml + '</dd></div>';
  }

  function setGameFilter(mode) {
    state.gameFilter = mode;
    var wrap = $('state-filter');
    if (wrap) {
      Array.prototype.forEach.call(wrap.querySelectorAll('[data-state-filter]'), function (btn) {
        btn.classList.toggle('tab-on', btn.getAttribute('data-state-filter') === mode);
      });
    }
  }

  /* --------------------------------------------------------------- ledger */

  function loadLedger(date, seq) {
    if (!Ledger) return Promise.resolve(null);
    state.ledgerDate = date;
    state.ledgerSeq = seq;
    return Ledger.load(date).then(function (ledger) {
      if (seq !== state.ledgerSeq) return null;
      state.ledger = ledger;
      renderLedger();
      return ledger;
    }).catch(function (err) {
      if (global.console && global.console.warn) global.console.warn('[state-panel] ledger load failed', err);
      return null;
    });
  }

  function setLedgerFilter(filter) {
    state.filter = filter;
    var nav = $('ledger-tabs');
    if (nav) {
      Array.prototype.forEach.call(nav.querySelectorAll('[data-ledger-filter]'), function (btn) {
        btn.classList.toggle('tab-on', btn.getAttribute('data-ledger-filter') === filter);
      });
    }
    renderLedger();
  }

  function ledgerRows(ledger, filter) {
    if (!ledger) return [];
    if (filter === 'pending') return Ledger.recordsOf(ledger, 'pending').filter(function (r) { return !r.resolvedAtMs; });
    if (filter === 'resolved') return Ledger.recordsOf(ledger, 'pending').filter(function (r) { return !!r.resolvedAtMs; });
    if (filter === 'changes') return Ledger.recordsOf(ledger, 'change');
    return Ledger.recordsOf(ledger, 'all');
  }

  function ledgerRow(r) {
    var isPending = r.kind === 'pending';
    var resolved = isPending && !!r.resolvedAtMs;
    var before = r.before || null;
    var after = r.after || null;
    var fromDesc = (r.from && r.from.description) || (before && before.currentPlay && before.currentPlay.description) || '';
    var toDesc = r.toWording || (r.to && r.to.description) || (after && after.currentPlay && after.currentPlay.description) || '';
    var beforeEvent = (r.from && r.from.eventType) || (before && before.currentPlay && before.currentPlay.eventType) || '—';

    var chips = [];
    if (isPending) {
      chips.push(chip(resolved ? 'Ruling published' : 'Ruling pending', resolved ? 'chip-ok' : 'chip-warn'));
      if (r.eventType) chips.push(chip(r.eventType, 'chip-review'));
    } else {
      chips.push(chip('Scoring change', 'chip-scoring'));
      if (r.from && r.from.eventType) chips.push(chip(r.from.eventType, 'chip-review'));
      if (r.to && r.to.eventType) chips.push(chip(r.to.eventType, 'chip-ok'));
    }

    var revisions = Array.isArray(r.revisions) ? r.revisions : [];

    return '<article class="ledger-row' + (isPending && !resolved ? ' is-open' : '') + '">' +
      '<header class="ledger-head">' +
        '<a class="ledger-matchup" href="game.html?gamePk=' + encodeURIComponent(r.gamePk) + '&date=' + encodeURIComponent(r.officialDate || state.ledgerDate || '') + '">' + esc(r.matchup || ('Game ' + r.gamePk)) + '</a>' +
        '<span>' + esc(r.inningLabel || '') + '</span>' +
        (r.atBatIndex !== undefined && r.atBatIndex !== null ? '<span>at-bat #' + esc(r.atBatIndex) + '</span>' : '') +
        '<span class="ledger-time" title="First captured (UTC, second precision)">' + esc(r.capturedAtSec || timeOf(r.capturedAtMs)) + '</span>' +
        (resolved ? '<span class="ledger-time" title="Ruling published (UTC)">→ ' + esc(r.resolvedAtSec) + '</span>' : '') +
        '<a class="ledger-src" href="https://statsapi.mlb.com/api/v1.1/game/' + encodeURIComponent(r.gamePk) + '/feed/live" target="_blank" rel="noopener" title="Official MLB StatsAPI live feed">MLB API ↗</a>' +
      '</header>' +
      (r.batter ? '<div class="ledger-title">' + esc(r.batter) + (r.pitcher ? ' vs ' + esc(r.pitcher) : '') + '</div>' : '') +
      '<dl class="ledger-pair">' +
        '<dt>Before</dt><dd>' + esc(fromDesc || r.wording || '—') + (beforeEvent && beforeEvent !== '—' ? ' <span class="state-dim">(' + esc(beforeEvent) + ')</span>' : '') + '</dd>' +
        '<dt>After</dt><dd>' + esc(toDesc || (isPending && !resolved ? 'not yet published' : '—')) + '</dd>' +
        (before && before.score ? '<dt>Score at capture</dt><dd>' + esc(LiveState.fmtScore(before.score)) + '</dd>' : '') +
        (before && before.count ? '<dt>Count at capture</dt><dd>' + esc(LiveState.fmtCount(before.count) || '—') + ' · ' +
          esc(before.outs === null || before.outs === undefined ? '—' : before.outs) + ' out(s)</dd>' : '') +
        (r.timecode || (before && before.gamedayTimecode) ? '<dt>Timecode</dt><dd>' + esc(r.timecode || before.gamedayTimecode) + '</dd>' : '') +
        (r.source ? '<dt>Source</dt><dd>' + esc(r.source) + '</dd>' : '') +
      '</dl>' +
      (revisions.length > 1 ? '<div class="ledger-revisions"><h5>' + revisions.length + ' rulings recorded</h5><ul>' +
        revisions.map(function (rev) {
          return '<li><span class="ledger-time">' + esc(rev.atSec) + '</span> ' + esc(rev.toWording || (rev.to && rev.to.description) || '') + '</li>';
        }).join('') + '</ul></div>' : '') +
      '<div class="feed-chips">' + chips.join('') + '</div>' +
    '</article>';
  }

  function chip(text, cls) {
    return '<span class="chip' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>';
  }

  function renderLedger() {
    var list = $('ledger-list');
    var statsEl = $('ledger-stats');
    var statusEl = $('ledger-status');
    if (!list) return;
    var ledger = state.ledger;
    if (!ledger) {
      list.innerHTML = '<div class="feed-empty">Loading the official scoring ledger…</div>';
      return;
    }
    var counts = Ledger.recount(ledger);
    if (statsEl) {
      statsEl.innerHTML = [
        { n: counts.pending, label: 'Pending rulings' },
        { n: counts.scored, label: 'Rulings published' },
        { n: counts.changes, label: 'Scoring changes' },
        { n: ledger.records.length, label: 'Records kept' },
      ].map(function (t) {
        return '<div class="stat-tile"><div class="stat-num">' + t.n + '</div><div class="stat-label">' + esc(t.label) + '</div></div>';
      }).join('');
    }
    var rows = ledgerRows(ledger, state.filter);
    if (!rows.length) {
      list.innerHTML = '<div class="feed-empty">No official-scoring records for this date and filter yet. A pending ruling or a reclassification is logged here the second it is observed — separately from the alert feed — and stays after a refresh.</div>';
    } else {
      list.innerHTML = rows.map(ledgerRow).join('');
    }
    if (statusEl) {
      var storeLabel = Ledger.state && Ledger.state.available
        ? 'stored in this browser and on the local server'
        : 'stored in this browser (localStorage), survives a refresh';
      statusEl.textContent = 'Ledger: ' + ledger.records.length + ' record(s) for ' + (state.ledgerDate || '') +
        ' · ' + storeLabel + ' · last write ' + timeOf(ledger.savedAt) +
        (ledger.notes && ledger.notes.length ? ' · ' + ledger.notes.length + ' note(s)' : '');
    }
  }

  function exportJSON() {
    download('scoring-ledger-' + (state.ledgerDate || 'date') + '.json', Ledger.toJSON(state.ledger || Ledger.emptyLedger(state.ledgerDate)), 'application/json');
  }

  function exportCSV() {
    download('scoring-ledger-' + (state.ledgerDate || 'date') + '.csv', Ledger.toCSV(state.ledger || Ledger.emptyLedger(state.ledgerDate)), 'text/csv');
  }

  function download(filename, text, type) {
    try {
      var blob = new Blob([text], { type: type + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 0);
    } catch (e) {
      if (global.console && global.console.warn) global.console.warn('[state-panel] export failed', e);
    }
  }

  function bind() {
    var stateFilter = $('state-filter');
    if (stateFilter) {
      stateFilter.addEventListener('click', function (evt) {
        var btn = evt.target.closest ? evt.target.closest('[data-state-filter]') : null;
        if (btn) {
          setGameFilter(btn.getAttribute('data-state-filter'));
          if (global.ReplayFeed && global.ReplayFeed.renderStates) global.ReplayFeed.renderStates();
        }
      });
    }
    var ledgerTabs = $('ledger-tabs');
    if (ledgerTabs) {
      ledgerTabs.addEventListener('click', function (evt) {
        var btn = evt.target.closest ? evt.target.closest('[data-ledger-filter]') : null;
        if (btn) setLedgerFilter(btn.getAttribute('data-ledger-filter'));
      });
    }
    var j = $('ledger-export-json');
    if (j) j.addEventListener('click', exportJSON);
    var c = $('ledger-export-csv');
    if (c) c.addEventListener('click', exportCSV);
  }

  global.StatePanel = {
    renderStates: renderStates,
    loadLedger: loadLedger,
    renderLedger: renderLedger,
    setLedgerFilter: setLedgerFilter,
    setGameFilter: setGameFilter,
    exportJSON: exportJSON,
    exportCSV: exportCSV,
    bind: bind,
    state: state,
    timeOf: timeOf,
    dateTimeOf: dateTimeOf,
  };
}(typeof window !== 'undefined' ? window : globalThis));
