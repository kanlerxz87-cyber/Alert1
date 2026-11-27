/* ============================================================================
 * scoring-ledger.js — the separate, persistent official-scoring ledger
 *
 * Deliberately independent of the alert path (reviews-feed.js / feed-log.js):
 * its own storage namespace, its own records, its own write timing. A bug, a
 * quota overflow or a schema change here cannot stop a chime or a feed row from
 * landing, and a change to the alert feed cannot lose a logged ruling.
 *
 * What it records — the two things asked for, kept apart from everything else:
 *   1. PENDING   an at-bat that is complete in the official feed but has no
 *                official result yet (the API's own
 *                `os_ruling_pending_primary` / `os_ruling_pending_prior` event
 *                types, or a completed play whose `result.eventType` is not yet
 *                published).  Recorded the second it is first observed, with a
 *                full before-state and the official wording.
 *   2. CHANGE    a completed play whose official classification moved between
 *                two observations (hit ↔ error, out ↔ hit, single ↔ double,
 *                RBI / outs / score movement).
 *                Each record holds the before-state, the after-state, both
 *                official descriptions and the field-by-field diff.
 *
 * Persistence:
 *   localStorage  'mlbp.scoringledger.v1.<date>'   (always: survives refresh)
 *   server        POST/GET /api/scoring-ledger     (server.mjs: survives a
 *                 browser cache clear and is shared across browsers)
 *   export        download JSON/CSV from the page at any time
 *
 * Every record keeps `capturedAtSec` (ISO, second precision) and
 * `capturedAtMs` so a review can line a ruling up against the game clock.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var VERSION = 1;
  var KEY_PREFIX = 'mlbp.scoringledger.v1.';
  var INDEX_KEY = 'mlbp.scoringledger.index';
  var KEEP_DATES = 14;
  var MAX_RECORDS = 1500;
  var WRITE_COALESCE_MS = 1500;

  var apiState = { checked: false, available: false, lastError: null };
  var saveTimers = Object.create(null);
  var pending = Object.create(null);
  var listeners = [];

  function now() { return Date.now(); }

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
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeIndex(dates) {
    var sorted = dates.filter(Boolean).sort();
    while (sorted.length > KEEP_DATES) {
      var drop = sorted.shift();
      try { global.localStorage.removeItem(KEY_PREFIX + drop); } catch (e) { /* ignore */ }
    }
    storageSet(INDEX_KEY, JSON.stringify(sorted));
  }

  function emptyLedger(date) {
    return {
      v: VERSION,
      date: date,
      savedAt: now(),
      records: [],
      seen: {},        // recordId -> firstSeen (dedupe across reloads and browsers)
      notes: [],
      stats: { pending: 0, changes: 0, scored: 0 },
    };
  }

  function normalize(payload, date) {
    if (!payload || typeof payload !== 'object') return emptyLedger(date);
    var records = Array.isArray(payload.records) ? payload.records.filter(Boolean) : [];
    var seen = {};
    if (payload.seen && typeof payload.seen === 'object') {
      Object.keys(payload.seen).forEach(function (k) { seen[k] = Number(payload.seen[k]) || 0; });
    }
    records.forEach(function (r) {
      if (r && r.id && !seen[r.id]) seen[r.id] = Number(r.firstSeen) || Number(r.capturedAtMs) || now();
    });
    return {
      v: VERSION,
      date: date,
      savedAt: Number(payload.savedAt) || now(),
      records: records.sort(function (a, b) { return (Number(b.capturedAtMs) || 0) - (Number(a.capturedAtMs) || 0); }).slice(0, MAX_RECORDS),
      seen: seen,
      notes: Array.isArray(payload.notes) ? payload.notes.filter(Boolean).slice(-200) : [],
      stats: {
        pending: records.filter(function (r) { return r.kind === 'pending'; }).length,
        changes: records.filter(function (r) { return r.kind === 'change'; }).length,
        scored: records.filter(function (r) { return r.kind === 'pending' && r.resolvedAtMs; }).length,
      },
    };
  }

  /* Merge without ever losing a record or an update time. Newest record wins on
   * a shared id, except that an already-resolved pending record keeps its
   * resolution when the other side has not seen it yet. */
  function merge(a, b, date) {
    var base = normalize(a, date);
    var add = normalize(b, date);
    var byId = Object.create(null);
    base.records.concat(add.records).forEach(function (rec) {
      if (!rec || !rec.id) return;
      var prev = byId[rec.id];
      if (!prev) { byId[rec.id] = rec; return; }
      var merged = Object.assign({}, prev, rec);
      merged.firstSeen = Math.min(Number(prev.firstSeen) || Infinity, Number(rec.firstSeen) || Infinity) || now();
      merged.capturedAtMs = Math.min(Number(prev.capturedAtMs) || Infinity, Number(rec.capturedAtMs) || Infinity) || now();
      /* The ms and the rendered ISO string must describe the same observation. */
      var prevMs = Number(prev.capturedAtMs);
      var recMs = Number(rec.capturedAtMs);
      if (isFinite(prevMs) && (!isFinite(recMs) || prevMs <= recMs) && prev.capturedAtSec) {
        merged.capturedAtSec = prev.capturedAtSec;
      }
      if (prev.resolvedAtMs && !rec.resolvedAtMs) {
        merged.resolvedAtMs = prev.resolvedAtMs;
        merged.resolvedAtSec = prev.resolvedAtSec;
        merged.after = prev.after || rec.after;
      }
      if (prev.updatedAtMs && rec.updatedAtMs && prev.updatedAtMs > rec.updatedAtMs) {
        merged.updatedAtMs = prev.updatedAtMs;
        merged.after = prev.after || merged.after;
      }
      byId[rec.id] = merged;
    });
    var records = Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (x, y) { return (Number(y.capturedAtMs) || 0) - (Number(x.capturedAtMs) || 0); })
      .slice(0, MAX_RECORDS);
    var seen = Object.assign({}, base.seen, add.seen);
    var notes = base.notes.slice();
    add.notes.forEach(function (n) { if (notes.indexOf(n) === -1) notes.push(n); });
    return normalize({
      v: VERSION, date: date, savedAt: now(), records: records, seen: seen, notes: notes.slice(-200),
    }, date);
  }

  function loadLocal(date) {
    var raw = storageGet(KEY_PREFIX + date);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== VERSION) return null;
      return normalize(parsed, date);
    } catch (e) {
      global.console && global.console.warn && global.console.warn('[scoring-ledger] dropping malformed local ledger for ' + date);
      return null;
    }
  }

  function saveLocal(date, ledger) {
    var ok = writeLocal(date, ledger);
    if (ok) {
      var index = readIndex();
      if (index.indexOf(date) === -1) index.push(date);
      writeIndex(index);
    }
    return ok;
  }

  function writeLocal(date, ledger) {
    return storageSet(KEY_PREFIX + date, JSON.stringify(ledger));
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

  function loadServer(date) {
    if (isStaticHost()) {
      apiState.checked = true; apiState.available = false;
      return Promise.resolve(null);
    }
    if (apiState.checked && !apiState.available) return Promise.resolve(null);
    return serverFetch('/api/scoring-ledger?date=' + encodeURIComponent(date))
      .then(function (data) {
        apiState.checked = true; apiState.available = true;
        return normalize(data, date);
      })
      .catch(function (err) {
        apiState.checked = true; apiState.available = false; apiState.lastError = err;
        return null;
      });
  }

  function postNow(date) {
    var ledger = pending[date];
    if (!ledger) return Promise.resolve(null);
    pending[date] = null;
    if (isStaticHost() || (apiState.checked && !apiState.available)) return Promise.resolve(null);
    return serverFetch('/api/scoring-ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ledger),
    }).then(function (res) {
      apiState.available = true;
      return res;
    }).catch(function (err) {
      apiState.available = false; apiState.lastError = err;
      return null;
    });
  }

  /* load(date) = merge(server, local); both sides are kept. */
  function load(date) {
    var local = loadLocal(date);
    return loadServer(date).then(function (remote) {
      if (!remote && !local) return emptyLedger(date);
      if (!remote) return local;
      if (!local) { saveLocal(date, remote); return remote; }
      var merged = merge(local, remote, date);
      saveLocal(date, merged);
      return merged;
    });
  }

  function save(date, ledger) {
    var normalized = normalize(ledger, date);
    var ok = writeLocal(date, normalized);
    if (ok) {
      var index = readIndex();
      if (index.indexOf(date) === -1) { index.push(date); writeIndex(index); }
    } else if (global.console) {
      /* Quota or private mode: the server store (if present) still gets it. */
      global.console.warn && global.console.warn('[scoring-ledger] local write failed for ' + date + ' — trying the server store');
    }
    pending[date] = normalized;
    if (saveTimers[date]) return;
    saveTimers[date] = setTimeout(function () {
      saveTimers[date] = null;
      postNow(date);
    }, WRITE_COALESCE_MS);
    return normalized;
  }

  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  /* Live push from the local server (when one is running): another browser's
   * ruling shows up here without waiting for a reload. Absent on static
   * hosting — the localStorage copy is the source of truth there. */
  var stream = null;

  function closeStream() {
    if (stream) {
      try { stream.close(); } catch (e) { /* ignore */ }
      stream = null;
    }
  }

  function openStream(date) {
    closeStream();
    if (isStaticHost()) return null;
    if (typeof global.EventSource !== 'function') return null;
    if (apiState.checked && !apiState.available) return null;
    try {
      stream = new global.EventSource('/api/scoring-ledger/stream?date=' + encodeURIComponent(date));
    } catch (e) {
      return null;
    }
    stream.addEventListener('scoring-ledger', function (evt) {
      var payload;
      try { payload = JSON.parse(evt.data); } catch (e) { return; }
      if (!payload || payload.date !== date) return;
      emit(normalize(payload, date));
    });
    return stream;
  }

  function emit(ledger) {
    listeners.forEach(function (fn) {
      try { fn(ledger); } catch (e) {
        global.console && global.console.warn && global.console.warn('[scoring-ledger] listener failed', e);
      }
    });
  }

  /* ---------------------------------------------------------------- records */

  /**
   * addPending(ledger, record)
   *   record: { id, gamePk, matchup, officialDate, atBatIndex, inningLabel,
   *             batter, pitcher, eventType, description, before, wording,
   *             reason, source }
   * Returns { added: bool, record }.
   */
  function addPending(ledger, record) {
    if (!ledger || !record || !record.id) return { added: false, record: null };
    var existing = ledger.records.filter(function (r) { return r.id === record.id; })[0];
    var at = record.capturedAtMs || now();
    if (existing) {
      /* Never overwrite the first observation — it is the audit trail. */
      return { added: false, record: existing };
    }
    var rec = Object.assign({
      v: VERSION,
      kind: 'pending',
      firstSeen: at,
      capturedAtMs: at,
      capturedAtSec: isoSecond(at),
      updatedAtMs: at,
    }, record, {
      capturedAtMs: at,
      capturedAtSec: record.capturedAtSec || isoSecond(at),
    });
    ledger.records.unshift(rec);
    ledger.seen[rec.id] = at;
    ledger.records = ledger.records.slice(0, MAX_RECORDS);
    ledger.stats = recount(ledger);
    return { added: true, record: rec };
  }

  /** resolvePending(ledger, id, after, wording) — the at-bat got its ruling. */
  function resolvePending(ledger, id, after, wording) {
    if (!ledger || !id) return null;
    var rec = ledger.records.filter(function (r) { return r.id === id; })[0];
    if (!rec) return null;
    if (rec.resolvedAtMs) return rec;
    var at = now();
    rec.resolvedAtMs = at;
    rec.resolvedAtSec = isoSecond(at);
    rec.updatedAtMs = at;
    rec.after = after || null;
    rec.afterWording = wording || '';
    ledger.stats = recount(ledger);
    return rec;
  }

  /**
   * addChange(ledger, record) — a play's official classification moved.
   * record: { id, gamePk, matchup, officialDate, atBatIndex, inningLabel,
   *           batter, from, to, before, after, fromWording, toWording, source }
   */
  function addChange(ledger, record) {
    if (!ledger || !record || !record.id) return { added: false, record: null };
    var existing = ledger.records.filter(function (r) { return r.id === record.id; })[0];
    var at = record.capturedAtMs || now();
    if (existing) {
      /* A play can be re-scored more than once. Keep the first record intact and
       * let the newest ruling replace only the after side, with its own time —
       * the whole chain stays readable because `after` is versioned in
       * `revisions`. */
      existing.revisions = existing.revisions || [];
      var last = existing.revisions[existing.revisions.length - 1];
      var tag = (record.to && (record.to.eventType + '|' + record.to.isOut + '|' + record.to.description)) || '';
      if (last && last.tag === tag) return { added: false, record: existing };
      existing.revisions.push({
        atMs: at, atSec: isoSecond(at), tag: tag,
        after: record.after || null, to: record.to || null, toWording: record.toWording || '',
      });
      existing.after = record.after || existing.after;
      existing.to = record.to || existing.to;
      existing.toWording = record.toWording || existing.toWording;
      existing.updatedAtMs = at;
      ledger.stats = recount(ledger);
      return { added: true, record: existing, revision: true };
    }
    var rec = Object.assign({
      v: VERSION,
      kind: 'change',
      firstSeen: at,
      capturedAtMs: at,
      capturedAtSec: isoSecond(at),
      updatedAtMs: at,
      revisions: [],
    }, record, { capturedAtMs: at, capturedAtSec: record.capturedAtSec || isoSecond(at) });
    var firstTag = (rec.to && (rec.to.eventType + '|' + rec.to.isOut + '|' + rec.to.description)) || '';
    if (firstTag) rec.revisions.push({ atMs: at, atSec: rec.capturedAtSec, tag: firstTag, after: rec.after || null, to: rec.to || null, toWording: rec.toWording || '' });
    ledger.records.unshift(rec);
    ledger.seen[rec.id] = at;
    ledger.records = ledger.records.slice(0, MAX_RECORDS);
    ledger.stats = recount(ledger);
    return { added: true, record: rec };
  }

  function note(ledger, text) {
    if (!ledger || !text) return;
    if (ledger.notes.indexOf(text) === -1) {
      ledger.notes.push(text);
      ledger.notes = ledger.notes.slice(-200);
    }
  }

  function recount(ledger) {
    var records = (ledger && ledger.records) || [];
    return {
      pending: records.filter(function (r) { return r.kind === 'pending'; }).length,
      changes: records.filter(function (r) { return r.kind === 'change'; }).length,
      scored: records.filter(function (r) { return r.kind === 'pending' && r.resolvedAtMs; }).length,
    };
  }

  function isoSecond(ms) {
    var d = new Date(ms || now());
    return isNaN(d.getTime()) ? '' : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function recordsOf(ledger, kind) {
    var records = (ledger && ledger.records) || [];
    if (!kind || kind === 'all') return records.slice();
    if (kind === 'open') return records.filter(function (r) { return r.kind === 'pending' && !r.resolvedAtMs; });
    return records.filter(function (r) { return r.kind === kind; });
  }

  /* ------------------------------------------------------------ export */

  function csvField(v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(ledger) {
    var rows = [[
      'kind', 'captured_at_utc', 'resolved_at_utc', 'game', 'game_pk', 'inning', 'at_bat',
      'batter', 'from_event_type', 'to_event_type', 'from_description', 'to_description',
      'score_before', 'score_after', 'outs_before', 'outs_after', 'timecode', 'source',
    ]];
    recordsOf(ledger).slice().reverse().forEach(function (r) {
      var before = r.before || {};
      var after = r.after || {};
      rows.push([
        r.kind, r.capturedAtSec || '', r.resolvedAtSec || '', r.matchup || '', r.gamePk || '',
        r.inningLabel || '', r.atBatIndex === undefined ? '' : r.atBatIndex, r.batter || '',
        (r.from && r.from.eventType) || r.eventType || (before.currentPlay && before.currentPlay.eventType) || '',
        (r.to && r.to.eventType) || (after.currentPlay && after.currentPlay.eventType) || '',
        (r.from && r.from.description) || r.wording || (before.currentPlay && before.currentPlay.description) || '',
        (r.to && r.to.description) || r.toWording || r.afterWording ||
          (after.currentPlay && after.currentPlay.description) || (r.resolvedAtMs ? '' : 'ruling pending'),
        before.score ? (before.score.away + '-' + before.score.home) : '',
        after.score ? (after.score.away + '-' + after.score.home) : '',
        before.outs === undefined || before.outs === null ? '' : before.outs,
        after.outs === undefined || after.outs === null ? '' : after.outs,
        r.timecode || before.gamedayTimecode || '',
        r.source || '',
      ]);
    });
    return rows.map(function (row) { return row.map(csvField).join(','); }).join('\n');
  }

  function toJSON(ledger) {
    return JSON.stringify(ledger, null, 2);
  }

  global.ScoringLedger = {
    VERSION: VERSION,
    load: load,
    save: save,
    merge: merge,
    emptyLedger: emptyLedger,
    addPending: addPending,
    resolvePending: resolvePending,
    addChange: addChange,
    note: note,
    recordsOf: recordsOf,
    recount: recount,
    toCSV: toCSV,
    toJSON: toJSON,
    onChange: onChange,
    emit: emit,
    openStream: openStream,
    closeStream: closeStream,
    isoSecond: isoSecond,
    state: apiState,
    KEY_PREFIX: KEY_PREFIX,
    readIndex: readIndex,
  };
}(typeof window !== 'undefined' ? window : globalThis));
