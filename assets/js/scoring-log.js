/* ============================================================================
 * scoring-log.js — the official-scoring record book
 *
 * Deliberately a SEPARATE module, with its OWN storage keys, from the replay
 * feed's alert path.  Two kinds of record live here:
 *
 *   pending  an official-scorer ruling is still undecided for a plate
 *            appearance (`os_ruling_pending_primary` / `os_ruling_pending_prior`)
 *   change   the official scorer changed the outcome of a play
 *            (hit↔error, out↔hit, extra bases, …) — detected by diffing each
 *            completed play's official classification between two observations
 *
 * Each record keeps the exact official wording *before* and *after*, the exact
 * official game state captured on both sides of the change (score, outs, count,
 * inning, batter, pitcher, pitch count — see game-state.js), when it was first
 * and last observed, and whether we watched it happen live or adopted it from a
 * stored log.  Records are append-only marks on an existing entry, so the
 * before-side of a change can never be overwritten by a later poll.
 *
 * Why the separation matters: the alert system can be toggled, its cooldown can
 * swallow a tone, and its ledger can be cleared — none of that may ever lose a
 * scoring record.  This module never touches `mlbp.alerts.*` and never reads
 * the alert ledger; the Replay Feed's alert code never writes here.
 *
 * Storage: `mlbp.scoringlog.<date>` in localStorage (always available, survives
 * every refresh), merged with `GET/POST /api/scoring-log` when server.mjs is
 * running so a second browser or a second machine sees the same book.  On the
 * static GitHub Pages deployment the API is absent and the browser store alone
 * carries it — exactly like feed-log.js.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var KEY_PREFIX = 'mlbp.scoringlog.';
  var INDEX_KEY = 'mlbp.scoringlog.index';
  var KEEP_DATES = 14;          /* longer than the feed log: it is the record */
  var MAX_RECORDS = 800;
  var WRITE_COALESCE_MS = 1000;

  var apiState = { checked: false, available: false, lastError: null };
  var state = {
    date: null,
    records: [],                 /* newest first */
    loaded: false,
    adoptedFromStore: 0,
    saveTimer: null,
    pendingPayload: null,
    listeners: [],
  };

  function now() { return Date.now(); }

  function emptyPayload(date) {
    return { v: 1, date: date, savedAt: now(), records: [] };
  }

  /* ------------------------------------------------------------- storage */

  function storageGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { global.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  function readIndex() {
    try {
      var raw = storageGet(INDEX_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }) : [];
    } catch (e) { return []; }
  }

  function writeIndex(dates) {
    var sorted = dates.slice().sort();
    while (sorted.length > KEEP_DATES) {
      var drop = sorted.shift();
      try { global.localStorage.removeItem(KEY_PREFIX + drop); } catch (e) { /* ignore */ }
    }
    storageSet(INDEX_KEY, JSON.stringify(sorted));
  }

  function normalizeRecord(rec) {
    if (!rec || typeof rec !== 'object') return null;
    if (!rec.id || rec.date === undefined) return null;
    if (rec.kind !== 'pending' && rec.kind !== 'change') return null;
    return {
      id: String(rec.id),
      kind: rec.kind,
      date: rec.date,
      gamePk: rec.gamePk === null || rec.gamePk === undefined ? null : Number(rec.gamePk),
      matchup: rec.matchup || null,
      atBatIndex: rec.atBatIndex === null || rec.atBatIndex === undefined ? null : Number(rec.atBatIndex),
      inning: rec.inning || null,
      batter: rec.batter || null,
      pitcher: rec.pitcher || null,
      eventType: rec.eventType || null,
      before: rec.before || null,
      after: rec.after || null,
      official: rec.official || null,
      stateBefore: rec.stateBefore || null,
      stateAfter: rec.stateAfter || null,
      firstObservedAt: Number(rec.firstObservedAt) || null,
      lastObservedAt: Number(rec.lastObservedAt) || null,
      resolvedAt: Number(rec.resolvedAt) || null,
      observedLive: rec.observedLive === true,
      source: rec.source || null,
      changes: Array.isArray(rec.changes) ? rec.changes.filter(Boolean) : [],
      notes: Array.isArray(rec.notes) ? rec.notes.filter(Boolean) : [],
      revisions: Array.isArray(rec.revisions) ? rec.revisions.filter(Boolean) : [],
    };
  }

  function normalizePayload(payload, date) {
    if (!payload || typeof payload !== 'object') return emptyPayload(date);
    var records = Array.isArray(payload.records) ? payload.records : [];
    return {
      v: 1,
      date: date,
      savedAt: Number(payload.savedAt) || now(),
      records: records.map(normalizeRecord).filter(Boolean),
    };
  }

  /* --------------------------------------------------------------- server */

  function isStaticHost() {
    var host = (global.location && global.location.hostname) || '';
    return /\.github\.io$/i.test(host);
  }

  function serverFetch(path, opts) {
    return fetch(path, Object.assign({ cache: 'no-store', credentials: 'same-origin' }, opts || {}))
      .then(function (res) {
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        return res.json();
      });
  }

  /**
   * loadServer(date) — the shared book, when there is one.
   *
   * A one-shot "is the endpoint there?" probe decides availability; after that
   * every load retries (only the POST gives up for the rest of the session).
   * Enabling, disabling and re-enabling the Replay Feed's alert system must
   * never be able to stop the scoring book from reading its server copy.
   */
  function loadServer(date) {
    if (isStaticHost()) {
      apiState.checked = true;
      apiState.available = false;
      return Promise.resolve(null);
    }
    return serverFetch('/api/scoring-log?date=' + encodeURIComponent(date))
      .then(function (data) {
        apiState.checked = true;
        apiState.available = true;
        return normalizePayload(data, date);
      })
      .catch(function (err) {
        apiState.checked = true;
        apiState.available = false;
        apiState.lastError = err;
        return null;
      });
  }

  function loadLocal(date) {
    var raw = storageGet(KEY_PREFIX + date);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 1) return null;
      return normalizePayload(parsed, date);
    } catch (e) {
      global.console && global.console.warn && global.console.warn('[scoring-log] dropping malformed local log for ' + date);
      return null;
    }
  }

  function saveLocal(date, payload) {
    var ok = storageSet(KEY_PREFIX + date, JSON.stringify(payload));
    if (ok) {
      var index = readIndex();
      if (index.indexOf(date) === -1) {
        index.push(date);
        writeIndex(index);
      }
    }
    return ok;
  }

  function postNow(date) {
    var payload = state.pendingPayload;
    if (!payload) return;
    state.pendingPayload = null;
    if (isStaticHost()) return;
    if (apiState.checked && !apiState.available) return;
    serverFetch('/api/scoring-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function () {
      apiState.available = true;
    }).catch(function (err) {
      apiState.available = false;
      apiState.lastError = err;
    });
  }

  /* ------------------------------------------------------------- merging  */

  /* Merge two records for the same id, keeping the earliest observations and
   * every revision.  The before-side of a change is never replaced by a later
   * poll: `before` is only taken from a record that already has one. */
  function mergeRecord(a, b) {
    if (!a) return b;
    if (!b) return a;
    var out = Object.assign({}, a);
    out.before = a.before || b.before || null;
    out.stateBefore = a.stateBefore || b.stateBefore || null;
    out.after = b.after || a.after || null;
    out.stateAfter = b.stateAfter || a.stateAfter || null;
    out.resolvedAt = b.resolvedAt || a.resolvedAt || null;
    out.firstObservedAt = Math.min(Number(a.firstObservedAt) || Infinity, Number(b.firstObservedAt) || Infinity) || null;
    out.lastObservedAt = Math.max(Number(a.lastObservedAt) || 0, Number(b.lastObservedAt) || 0) || null;
    /* live observation wins over an adopted one */
    out.observedLive = a.observedLive === true || b.observedLive === true;
    out.source = a.source || b.source || null;
    out.matchup = a.matchup || b.matchup || null;
    out.inning = a.inning || b.inning || null;
    out.batter = a.batter || b.batter || null;
    out.pitcher = a.pitcher || b.pitcher || null;
    out.eventType = b.eventType || a.eventType || null;
    out.official = b.official || a.official || null;

    var notes = [];
    (a.notes || []).concat(b.notes || []).forEach(function (n) {
      if (n && notes.indexOf(n) === -1) notes.push(n);
    });
    out.notes = notes;

    /* changes: union by "field:from:to" so a repeated detection is idempotent */
    var seen = Object.create(null);
    var changes = [];
    (a.changes || []).concat(b.changes || []).forEach(function (c) {
      if (!c) return;
      var key = c.field + '|' + c.from + '|' + c.to;
      if (seen[key]) return;
      seen[key] = true;
      changes.push(c);
    });
    out.changes = changes;

    var revSeen = Object.create(null);
    var revisions = [];
    (a.revisions || []).concat(b.revisions || []).forEach(function (r) {
      if (!r || !r.at) return;
      var key = r.at + '|' + (r.note || '');
      if (revSeen[key]) return;
      revSeen[key] = true;
      revisions.push(r);
    });
    out.revisions = revisions.sort(function (x, y) { return x.at - y.at; }).slice(-50);

    return out;
  }

  function mergePayloads(a, b, date) {
    var base = normalizePayload(a, date);
    var add = normalizePayload(b, date);
    var map = Object.create(null);
    base.records.concat(add.records).forEach(function (rec) {
      if (!rec) return;
      map[rec.id] = mergeRecord(map[rec.id], rec);
    });
    var records = Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (x, y) { return (y.lastObservedAt || 0) - (x.lastObservedAt || 0); })
      .slice(0, MAX_RECORDS);
    return { v: 1, date: date, savedAt: now(), records: records };
  }

  /**
   * load(date) — restore the book for a date before the first scan runs, so a
   * refreshed page shows the whole official-scoring history immediately.
   * The promise resolves with the merged payload the page should adopt.
   */
  function load(date) {
    var local = loadLocal(date);
    return loadServer(date).then(function (remote) {
      var merged;
      if (!remote && !local) merged = emptyPayload(date);
      else if (!remote) merged = local;
      else if (!local) merged = remote;
      else merged = mergePayloads(remote, local, date);
      state.date = date;
      state.records = merged.records.slice();
      state.loaded = true;
      state.adoptedFromStore = merged.records.length;
      if (!remote) saveLocal(date, merged);
      emit({ type: 'load', date: date, records: merged.records.length, fromServer: !!remote });
      return merged;
    });
  }

  function persist(date) {
    var payload = { v: 1, date: date, savedAt: now(), records: state.records.slice(0, MAX_RECORDS) };
    saveLocal(date, payload);
    state.pendingPayload = payload;
    if (state.saveTimer) return;
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      postNow(date);
    }, WRITE_COALESCE_MS);
  }

  /* --------------------------------------------------------------- upsert */

  function findIndex(id) {
    for (var i = 0; i < state.records.length; i += 1) {
      if (state.records[i].id === id) return i;
    }
    return -1;
  }

  function get(id) {
    var i = findIndex(id);
    return i === -1 ? null : state.records[i];
  }

  /**
   * upsert(record) — add or merge one record.
   * Returns { record, created, changed } so the caller can decide whether this
   * was new (which is when the replay feed logs it; the official-scoring book
   * itself never plays a sound).
   */
  function upsert(record) {
    var rec = normalizeRecord(record);
    if (!rec) return { record: null, created: false, changed: false };
    rec.firstObservedAt = rec.firstObservedAt || now();
    rec.lastObservedAt = rec.lastObservedAt || rec.firstObservedAt;
    var index = findIndex(rec.id);
    if (index === -1) {
      state.records.unshift(rec);
      state.records = state.records.slice(0, MAX_RECORDS);
      if (state.date) persist(state.date);
      return { record: rec, created: true, changed: true };
    }
    var prev = state.records[index];
    var merged = mergeRecord(prev, rec);
    var changed = JSON.stringify(merged) !== JSON.stringify(prev);
    state.records[index] = merged;
    if (changed && state.date) persist(state.date);
    return { record: merged, created: false, changed: changed };
  }

  /** Attach a note (a revision) to an existing record, e.g. "resolved". */
  function revise(id, note, extra) {
    var rec = get(id);
    if (!rec) return null;
    var at = (extra && extra.at) || now();
    rec.revisions = (rec.revisions || []).concat([{ at: at, note: note }]).slice(-50);
    if (extra) {
      if (extra.after) rec.after = extra.after;
      if (extra.stateAfter) rec.stateAfter = extra.stateAfter;
      if (extra.official) rec.official = extra.official;
      if (extra.resolvedAt) rec.resolvedAt = extra.resolvedAt;
    }
    rec.lastObservedAt = at;
    if (state.date) persist(state.date);
    return rec;
  }

  /* ------------------------------------------------------------- reading  */

  function all(kind) {
    return state.records.filter(function (r) { return !kind || r.kind === kind; });
  }

  function pending() {
    return state.records.filter(function (r) { return r.kind === 'pending' && !r.resolvedAt; });
  }

  function changes() {
    return state.records.filter(function (r) { return r.kind === 'change'; });
  }

  function stats() {
    var s = { total: state.records.length, pending: 0, resolvedPending: 0, changes: 0, games: 0, live: 0, adopted: 0 };
    var games = Object.create(null);
    state.records.forEach(function (r) {
      if (r.gamePk !== null) games[r.gamePk] = true;
      if (r.kind === 'change') s.changes += 1;
      if (r.kind === 'pending') { if (r.resolvedAt) s.resolvedPending += 1; else s.pending += 1; }
      if (r.observedLive) s.live += 1; else s.adopted += 1;
    });
    s.games = Object.keys(games).length;
    return s;
  }

  function exportText() {
    var lines = [];
    lines.push('# Official scoring log — ' + (state.date || ''));
    lines.push('');
    state.records.forEach(function (r) {
      lines.push('## ' + r.id);
      lines.push('- kind: ' + r.kind + (r.gamePk !== null ? (' · gamePk ' + r.gamePk) : '') + (r.matchup ? (' · ' + r.matchup) : ''));
      lines.push('- inning: ' + (r.inning || '—'));
      lines.push('- batter: ' + (r.batter || '—') + ' · pitcher: ' + (r.pitcher || '—'));
      lines.push('- first observed: ' + (r.firstObservedAt ? stampFor(r.firstObservedAt) : '—') +
        (r.lastObservedAt ? (' · last observed: ' + stampFor(r.lastObservedAt)) : '') +
        ' · ' + (r.observedLive ? 'observed live' : 'adopted from a stored log'));
      if (r.before) lines.push('- official wording before: ' + r.before);
      if (r.after) lines.push('- official wording after: ' + r.after);
      if (r.eventType) lines.push('- official eventType: ' + r.eventType);
      if (r.stateBefore) lines.push('- state before: ' + r.stateBefore.summary + ' @ ' + (r.stateBefore.stamp || '—'));
      if (r.stateAfter) lines.push('- state after: ' + r.stateAfter.summary + ' @ ' + (r.stateAfter.stamp || '—'));
      (r.changes || []).forEach(function (c) { lines.push('- change: ' + c.label + ': ' + c.from + ' → ' + c.to); });
      (r.notes || []).forEach(function (n) { lines.push('- note: ' + n); });
      (r.revisions || []).forEach(function (v) { lines.push('- revision ' + stampFor(v.at) + ': ' + v.note); });
      lines.push('- source: ' + (r.source || '—'));
      lines.push('');
    });
    return lines.join('\n');
  }

  function stampFor(ms) {
    if (global.GameState && global.GameState.stamp) return global.GameState.stamp(ms);
    return new Date(ms).toISOString();
  }

  /* ------------------------------------------------------------- observer */

  function onChange(fn) { if (typeof fn === 'function') state.listeners.push(fn); }
  function emit(payload) {
    state.listeners.forEach(function (fn) {
      try { fn(payload); } catch (e) { /* ignore */ }
    });
  }

  global.ScoringLog = {
    emptyPayload: emptyPayload,
    normalizePayload: normalizePayload,
    normalizeRecord: normalizeRecord,
    mergePayloads: mergePayloads,
    mergeRecord: mergeRecord,
    load: load,
    upsert: upsert,
    revise: revise,
    get: get,
    all: all,
    pending: pending,
    changes: changes,
    stats: stats,
    exportText: exportText,
    onChange: onChange,
    state: state,
    apiState: apiState,
    KEY_PREFIX: KEY_PREFIX,
    KEEP_DATES: KEEP_DATES,
    MAX_RECORDS: MAX_RECORDS,
    setDate: function (date) { state.date = date; },
  };
}(window));
