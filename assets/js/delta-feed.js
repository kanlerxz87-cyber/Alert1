/* ============================================================================
 * delta-feed.js — the fastest official feed the browser can hold
 *
 * Three transports, in this order of preference, all official MLB StatsAPI:
 *
 *   1. PUSH   wss://ws.statsapi.mlb.com/api/v1/game/push/subscribe/gameday/{gamePk}
 *             Gameday's own socket. When a game changes, MLB tells us — no
 *             polling interval stands between the play and the alert.
 *   2. DELTA  GET /api/v1.1/game/{pk}/feed/live/diffPatch?startTimecode=...
 *             (optionally &pushUpdateId=... from the push event) — RFC 6902 ops
 *             against the copy we already hold: hundreds of bytes per update
 *             rather than the whole (hundreds of KB) live feed.
 *   3. FULL   GET /api/v1.1/game/{pk}/feed/live — the seed, and the recovery
 *             path whenever a patch fails. Never silently mixed: a failed
 *             patch discards the copy and reseeds from the full feed.
 *
 * Verified against the official hosts on 2026-11-27 (see docs/live-state.md):
 *   /feed/live/timestamps  -> the per-game timecode log
 *   /feed/live/diffPatch?startTimecode=&endTimecode= -> [{ diff: [ops...] }, ...]
 *   diffPatch with only startTimecode               -> a full feed object
 *   diffPatch with an invalid/too-far timecode      -> a full feed object
 *
 * The engine never invents data: a patched tree is only adopted when every op
 * applied, and the tree is re-seeded from the official full feed otherwise.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var API_ROOT = (global.MLB && global.MLB.API_ROOT) || 'https://statsapi.mlb.com/api';
  var WS_ROOT = 'wss://ws.statsapi.mlb.com/api';
  var REQUEST_TIMEOUT_MS = 12000;

  var DEFAULTS = {
    /* Fallback cadence when no socket is open. The delta poll is cheap, so it
     * runs on the same tight beat the status sweep uses. */
    deltaPollMs: 250,
    statusPollMs: 1000,
    fullSeedStaleMs: 60000,     // a seed older than this is refreshed if a patch fails
    maxSocketRetries: 6,
    socketBackoffMs: 1500,
    socketBackoffMaxMs: 30000,
    maxPatchFailuresPerMinute: 20,
  };

  var listeners = [];
  var stats = {
    seeds: 0, patches: 0, patchOps: 0, patchFailures: 0,
    socketOpen: 0, socketMessages: 0, socketCloses: 0, socketUnknownMessages: 0,
    fullBytes: 0, patchBytes: 0, lastUpdateAt: 0, startedAt: 0,
  };

  function emit(evt) {
    listeners.forEach(function (fn) {
      try { fn(evt); } catch (e) {
        global.console && global.console.warn && global.console.warn('[delta-feed] listener failed', e);
      }
    });
  }

  function now() { return Date.now(); }

  function byteLength(str) {
    if (typeof str !== 'string') return 0;
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
    return str.length;
  }

  /** Convert an ISO instant to Gameday's MMDDYYYY_HHMMSS timecode (UTC). */
  function isoTcode(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return null;
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    var stamp = '' + d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + '_' +
      p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds());
    return stamp;
  }

  /** Gameday timecode -> ISO 'YYYY-MM-DDTHH:MM:SSZ' (for the UI). */
  function tcodeToISO(tcode) {
    var m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(String(tcode || ''));
    if (!m) return null;
    return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + 'Z';
  }

  function fetchWithMeta(url, opts) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT_MS);
    var init = { method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' } };
    if (controller) init.signal = controller.signal;
    if (opts && opts.signal) {
      if (opts.signal.aborted && controller) controller.abort();
      else if (opts.signal.addEventListener) opts.signal.addEventListener('abort', function () { if (controller) controller.abort(); }, { once: true });
    }
    return fetch(url, init).then(function (res) {
      clearTimeout(timer);
      /* Read the body through whichever reader the environment provides: a
       * browser has both, and a stubbed fetch in a test may have only one. We
       * prefer text() so the delta's byte size can be reported honestly. */
      if (typeof res.text === 'function') {
        return res.text().then(function (text) {
          var json = null;
          try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
          return { ok: res.ok, status: res.status, json: json, bytes: byteLength(text) };
        });
      }
      if (typeof res.json === 'function') {
        return res.json().then(function (json) {
          var approx = '';
          try { approx = JSON.stringify(json); } catch (e) { approx = ''; }
          return { ok: res.ok, status: res.status, json: json || null, bytes: byteLength(approx) };
        });
      }
      return { ok: res.ok, status: res.status, json: null, bytes: 0 };
    }).then(function (out) {
      clearTimeout(timer);
      return out;
    }).catch(function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function deltaUrl(gamePk, startTcode, pushUpdateId) {
    var qs = 'startTimecode=' + encodeURIComponent(startTcode);
    if (pushUpdateId !== undefined && pushUpdateId !== null && pushUpdateId !== '') {
      qs += '&pushUpdateId=' + encodeURIComponent(pushUpdateId);
    }
    return API_ROOT + '/v1.1/game/' + gamePk + '/feed/live/diffPatch?' + qs;
  }

  function fullUrl(gamePk, fields) {
    var url = API_ROOT + '/v1.1/game/' + gamePk + '/feed/live';
    if (fields) url += '?fields=' + encodeURIComponent(fields);
    return url;
  }

  function GameStream(gamePk, opts) {
    this.gamePk = gamePk;
    this.opts = Object.assign({}, DEFAULTS, opts || {});
    this.tree = null;           // our copy of the official feed
    this.timecode = null;       // metaData.timeStamp of that copy
    this.seededAt = 0;
    this.fields = this.opts.fields || '';
    this.socket = null;
    this.socketRetries = 0;
    this.socketBackoff = this.opts.socketBackoffMs;
    this.socketWanted = false;
    this.closed = false;
    this.timers = { delta: null, status: null };
    this.inflight = false;
    this.patchFailures = [];
    this.lastPushUpdateId = null;
    this.lastEventAt = 0;
    this.transport = 'idle';   // 'push' | 'delta' | 'full'
    this.lastError = null;
  }

  GameStream.prototype.log = function (msg) {
    if (this.opts.verbose && global.console && global.console.info) {
      global.console.info('[delta-feed ' + this.gamePk + '] ' + msg);
    }
  };

  GameStream.prototype.isLiveStatus = function () {
    var gd = this.tree && this.tree.gameData;
    var st = gd && gd.status;
    return !!(st && st.abstractGameState === 'Live');
  };

  GameStream.prototype.updateStatsTimecode = function (tree, tcode) {
    if (!tcode) return;
    this.timecode = tcode;
  };

  /* ---------------------------------------------------------------- seeding */

  GameStream.prototype.seed = function () {
    var self = this;
    if (this.closed) return Promise.resolve(null);
    var url = fullUrl(this.gamePk, this.fields);
    return fetchWithMeta(url).then(function (res) {
      if (!res.ok || !res.json) {
        throw new Error('full feed HTTP ' + res.status + ' for game ' + self.gamePk);
      }
      var tree = res.json;
      var meta = tree.metaData || {};
      self.tree = tree;
      self.timecode = meta.timeStamp || null;
      self.seededAt = now();
      self.transport = 'full';
      self.lastError = null;
      stats.seeds += 1;
      stats.fullBytes += res.bytes;
      self.applyWait(meta.wait);
      emit({ type: 'seed', gamePk: self.gamePk, tree: tree, timecode: self.timecode, bytes: res.bytes, at: now() });
      return tree;
    }).catch(function (err) {
      self.lastError = err;
      emit({ type: 'error', gamePk: self.gamePk, error: err, at: now() });
      throw err;
    });
  };

  /* metaData.wait is MLB's own guidance on how long to wait between updates
   * for this game (usually 10s for a live game). We never sleep longer than
   * our own poll cadence when a socket is not open, because the delta request
   * is cheap and the point is to be early — but it is recorded and reported so
   * the pacing is visible in the UI. */
  GameStream.prototype.applyWait = function (wait) {
    this.suggestedWaitSec = typeof wait === 'number' && isFinite(wait) ? wait : null;
  };

  /* ---------------------------------------------------------------- patching */

  /* Apply the official diffPatch answer to our copy.
   * Returns 'patched' | 'unchanged' | 'reseed'. */
  GameStream.prototype.applyDeltaPayload = function (res) {
    var body = res.json;
    var self = this;

    /* The endpoint answers with the whole game object when it cannot produce a
     * diff (no change yet, invalid/too-old timecode, or MLB chose a full
     * refresh). That is a legitimate seed, not an error. */
    if (body && !Array.isArray(body)) {
      var meta = body.metaData || {};
      this.tree = body;
      this.timecode = meta.timeStamp || this.timecode;
      this.seededAt = now();
      this.transport = 'full';
      stats.seeds += 1;
      stats.fullBytes += res.bytes;
      this.applyWait(meta.wait);
      emit({ type: 'seed', gamePk: this.gamePk, tree: body, timecode: this.timecode, bytes: res.bytes, at: now(), reason: 'diffPatch-returned-full-feed' });
      return 'reseed';
    }

    if (!Array.isArray(body)) {
      emit({ type: 'error', gamePk: this.gamePk, error: new Error('unreadable diffPatch response'), at: now() });
      return 'reseed';
    }

    if (!body.length) {
      /* Empty patch list: nothing changed since our timecode. */
      this.transport = 'delta';
      return 'unchanged';
    }

    if (!this.tree) return 'reseed';

    var current = this.tree;
    var tcode = this.timecode;
    var merged = current;
    var opCount = 0;
    var failed = null;
    for (var i = 0; i < body.length; i += 1) {
      var entry = body[i] || {};
      var ops = entry.diff;
      if (!Array.isArray(ops)) continue;
      var out = global.JsonPatch.applyPatch(merged, ops);
      if (!out.ok) { failed = out.error; break; }
      merged = out.value;
      opCount += out.applied;
      var metaNow = merged && merged.metaData;
      if (metaNow && metaNow.timeStamp) tcode = metaNow.timeStamp;
    }

    if (failed) {
      this.notePatchFailure(failed);
      stats.patchFailures += 1;
      emit({ type: 'patch-failed', gamePk: this.gamePk, error: failed, at: now() });
      /* Drop the copy: a partially patched tree would be a lie. The caller
       * reseeds from the official full feed. */
      this.tree = null;
      return 'reseed';
    }

    this.tree = merged;
    this.timecode = tcode || this.timecode;
    this.transport = 'delta';
    this.lastError = null;
    stats.patches += 1;
    stats.patchOps += opCount;
    stats.patchBytes += res.bytes;
    emit({ type: 'patch', gamePk: this.gamePk, tree: merged, timecode: this.timecode, ops: opCount, bytes: res.bytes, patched: true, at: now() });
    return 'patched';
  };

  GameStream.prototype.notePatchFailure = function (reason) {
    var t = now();
    this.patchFailures.push(t);
    this.patchFailures = this.patchFailures.filter(function (at) { return t - at < 60000; });
    this.lastError = new Error(reason);
    if (this.patchFailures.length > this.opts.maxPatchFailuresPerMinute) {
      /* Something is structurally wrong with our copy (or with the feed).
       * Stop trusting deltas for a while and poll the full feed instead. */
      this.deltasDisabledUntil = t + 120000;
      emit({ type: 'delta-disabled', gamePk: this.gamePk, until: this.deltasDisabledUntil, at: t });
    }
  };

  /* One delta poll. Safe to call while a socket is open (it is the backstop
   * for a dropped socket frame — a lost socket event is otherwise invisible). */
  GameStream.prototype.pollDelta = function (pushUpdateId) {
    var self = this;
    if (this.closed || this.inflight) return Promise.resolve(null);
    if (!this.tree || !this.timecode) {
      return this.seed().then(function () { return null; }).catch(function () { return null; });
    }
    if (this.deltasDisabledUntil && now() < this.deltasDisabledUntil) {
      return this.reseedIfStale();
    }
    this.inflight = true;
    var url = deltaUrl(this.gamePk, this.timecode, pushUpdateId);
    return fetchWithMeta(url).then(function (res) {
      self.inflight = false;
      if (!res.ok) {
        if (res.status === 404) {
          self.tree = null;
          return self.seed().catch(function () { return null; });
        }
        throw new Error('diffPatch HTTP ' + res.status);
      }
      var outcome = self.applyDeltaPayload(res);
      if (outcome === 'reseed') {
        return self.seed().then(function () { return 'reseed'; }).catch(function () { return null; });
      }
      return outcome;
    }).catch(function (err) {
      self.inflight = false;
      self.lastError = err;
      emit({ type: 'error', gamePk: self.gamePk, error: err, at: now() });
      return null;
    });
  };

  GameStream.prototype.reseedIfStale = function () {
    var self = this;
    if (this.seededAt && now() - this.seededAt < this.opts.fullSeedStaleMs) return Promise.resolve(null);
    return this.seed().catch(function () { return null; });
  };

  /* ---------------------------------------------------------------- websocket */

  /* Gameday's push subscription. Optional by design: if the browser cannot
   * open it (blocked ws, offline, host change) the delta poll keeps running and
   * nothing else changes. Message types are read defensively — the payload is
   * only used to learn "something changed" and, when present, the update id. */
  GameStream.prototype.openSocket = function () {
    var self = this;
    if (this.closed || !this.socketWanted) return null;
    if (typeof global.WebSocket !== 'function') return null;
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) return this.socket;
    var url = WS_ROOT + '/v1/game/push/subscribe/gameday/' + this.gamePk;
    var socket;
    try {
      socket = new global.WebSocket(url);
    } catch (e) {
      this.scheduleSocketRetry();
      return null;
    }
    this.socket = socket;
    socket.onopen = function () {
      self.socketRetries = 0;
      self.socketBackoff = self.opts.socketBackoffMs;
      self.transport = 'push';
      stats.socketOpen += 1;
      emit({ type: 'socket-open', gamePk: self.gamePk, at: now() });
    };
    socket.onmessage = function (msg) {
      stats.socketMessages += 1;
      var data = msg && msg.data;
      var parsed = null;
      if (typeof data === 'string') {
        try { parsed = JSON.parse(data); } catch (e) { parsed = null; }
      } else if (data && typeof data === 'object') {
        parsed = data;
      }
      var updateId = parsed && (parsed.pushUpdateId || parsed.updateId ||
        (parsed.data && (parsed.data.pushUpdateId || parsed.data.updateId)));
      var kind = parsed && (parsed.type || parsed.eventType || (parsed.changeEvent && parsed.changeEvent.type));
      if (kind && /(heartbeat|ping|keepalive)/i.test(String(kind))) return;
      if (!updateId && !kind) stats.socketUnknownMessages += 1;
      self.lastPushUpdateId = updateId || null;
      self.lastEventAt = now();
      emit({ type: 'socket-message', gamePk: self.gamePk, kind: kind || '', updateId: updateId || null, raw: parsed, at: now() });
      /* Pull the delta immediately — this is the whole point of the socket. */
      self.pollDelta(updateId || undefined);
    };
    socket.onclose = function () {
      stats.socketCloses += 1;
      self.transport = self.tree ? 'delta' : 'full';
      emit({ type: 'socket-close', gamePk: self.gamePk, at: now() });
      self.scheduleSocketRetry();
    };
    socket.onerror = function () {
      emit({ type: 'socket-error', gamePk: self.gamePk, at: now() });
    };
    return socket;
  };

  GameStream.prototype.scheduleSocketRetry = function () {
    var self = this;
    if (this.closed || !this.socketWanted) return;
    if (this.socketRetries >= this.opts.maxSocketRetries) return;
    this.socketRetries += 1;
    var delay = Math.min(this.opts.socketBackoffMaxMs, this.socketBackoff * Math.pow(1.7, this.socketRetries - 1));
    clearTimeout(this.socketRetryTimer);
    this.socketRetryTimer = setTimeout(function () { self.openSocket(); }, delay);
  };

  GameStream.prototype.closeSocket = function () {
    this.socketWanted = false;
    clearTimeout(this.socketRetryTimer);
    if (this.socket) {
      try { this.socket.close(); } catch (e) { /* ignore */ }
      this.socket = null;
    }
  };

  /* ------------------------------------------------------------------- loops */

  GameStream.prototype.start = function () {
    var self = this;
    stats.startedAt = stats.startedAt || now();
    this.socketWanted = this.opts.useSocket !== false;
    var seeded;
    if (this.opts.seedPayload) {
      var seed = this.opts.seedPayload;
      this.tree = seed.tree || seed;
      var meta = this.tree && this.tree.metaData;
      this.timecode = (meta && meta.timeStamp) || this.opts.seedTimecode || null;
      this.seededAt = now();
      seeded = Promise.resolve(this.tree);
      emit({ type: 'seed', gamePk: this.gamePk, tree: this.tree, timecode: this.timecode, bytes: 0, at: now(), reason: 'shared-seed' });
    } else {
      seeded = this.seed();
    }
    return seeded.catch(function () { return null; }).then(function () {
      if (self.closed) return;
      self.openSocket();
      self.loopDelta();
    });
  };

  GameStream.prototype.loopDelta = function () {
    var self = this;
    clearTimeout(this.timers.delta);
    if (this.closed) return;
    var cadence = this.inReview() ? Math.max(120, Math.round(this.opts.deltaPollMs * 0.6)) : this.opts.deltaPollMs;
    this.timers.delta = setTimeout(function tick() {
      if (self.closed) return;
      if (global.document && global.document.hidden) {
        self.timers.delta = setTimeout(tick, Math.max(1000, self.opts.deltaPollMs));
        return;
      }
      self.pollDelta().then(function () {
        if (self.closed) return;
        var next = self.inReview() ? Math.max(120, Math.round(self.opts.deltaPollMs * 0.6)) : self.opts.deltaPollMs;
        self.timers.delta = setTimeout(tick, next);
      });
    }, cadence);
  };

  /* A review / pending ruling in flight is exactly when seconds matter, so the
   * delta cadence tightens further while the official status says so. */
  GameStream.prototype.inReview = function () {
    var st = this.tree && this.tree.gameData && this.tree.gameData.status;
    var code = String((st && st.statusCode) || '').toUpperCase();
    if (!code) return false;
    return /^[MN]/.test(code) || code === 'IH';
  };

  GameStream.prototype.stop = function () {
    this.closed = true;
    clearTimeout(this.timers.delta);
    clearTimeout(this.timers.status);
    this.closeSocket();
    emit({ type: 'stop', gamePk: this.gamePk, at: now() });
  };

  /* ------------------------------------------------------------ fan-out pool */

  /** Pool: one GameStream per live game, sharing a listener list. */
  function Pool(opts) {
    this.opts = Object.assign({}, DEFAULTS, opts || {});
    this.streams = Object.create(null);
    this.paused = false;
  }

  Pool.prototype.add = function (gamePk, opts) {
    var pk = String(gamePk);
    if (this.streams[pk]) return this.streams[pk];
    var streamOpts = Object.assign({}, this.opts, opts || {});
    var stream = new GameStream(gamePk, streamOpts);
    this.streams[pk] = stream;
    if (!this.paused) stream.start();
    return stream;
  };

  Pool.prototype.get = function (gamePk) { return this.streams[String(gamePk)] || null; };

  Pool.prototype.remove = function (gamePk) {
    var pk = String(gamePk);
    var stream = this.streams[pk];
    if (!stream) return;
    stream.stop();
    delete this.streams[pk];
  };

  /* Drop every stream whose game is no longer live (or no longer on the slate),
   * and start streams for games that just went live. */
  Pool.prototype.sync = function (liveGamePks, opts) {
    var self = this;
    var wanted = Object.create(null);
    (liveGamePks || []).forEach(function (pk) { wanted[String(pk)] = true; });
    Object.keys(this.streams).forEach(function (pk) {
      if (!wanted[pk]) self.remove(pk);
    });
    (liveGamePks || []).forEach(function (pk) {
      if (!self.streams[String(pk)]) {
        var stream = self.add(pk, opts);
        if (!self.paused) stream.start();
      }
    });
  };

  Pool.prototype.forEach = function (fn) {
    var self = this;
    Object.keys(this.streams).forEach(function (pk) { fn(self.streams[pk], pk); });
  };

  Pool.prototype.stopAll = function () {
    var self = this;
    this.forEach(function (s) { s.stop(); });
    this.streams = Object.create(null);
  };

  function onEvent(fn) { if (typeof fn === 'function') listeners.push(fn); }

  global.DeltaFeed = {
    Pool: Pool,
    GameStream: GameStream,
    onEvent: onEvent,
    stats: stats,
    isoTcode: isoTcode,
    tcodeToISO: tcodeToISO,
    deltaUrl: deltaUrl,
    fullUrl: fullUrl,
    byteLength: byteLength,
    DEFAULTS: DEFAULTS,
  };
}(typeof window !== 'undefined' ? window : globalThis));
