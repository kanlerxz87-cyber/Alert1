/* ============================================================================
 * json-patch.js — RFC 6902 JSON Patch (the format Gameday's diffPatch uses)
 *
 *   Gumbo.applyPatch(target, ops)  -> {ok, value, error}
 *   Gumbo.parsePointer(pointer)    -> ['liveData', 'plays', ...]
 *
 * Why this file exists
 * --------------------
 * MLB's Gameday clients do not re-download the whole live feed to see a new
 * pitch. They hold a copy of the feed and ask
 *   GET /api/v1.1/game/{gamePk}/feed/live/diffPatch?startTimecode=...
 * for the RFC 6902 operations that turn the copy they hold into the current
 * state. That response is a few hundred bytes instead of several hundred
 * kilobytes, so the same poll interval delivers a new play far sooner.
 *
 * Verified against the official endpoint on 2026-11-27, e.g.
 *   https://statsapi.mlb.com/api/v1.1/game/745111/feed/live/diffPatch
 *     ?startTimecode=20240403_011327&endTimecode=20240403_011340
 * which returned ops of type replace / add / remove / copy — including
 * `replace` used where `add` would be spec-legal (MLB replaces
 * `/metaData/gameEvents/0` against a shorter array).  Both are handled.
 *
 * Rules that matter for correctness:
 *   - a patch is applied to a COPY of the tree; on any error the caller keeps
 *     its previous (stale but correct) feed instead of a half-patched one;
 *   - `add` at exactly one past the end appends (MLB does this, RFC 6902 says
 *     the index must exist);
 *   - `replace` on a missing array slot at index <= length appends;
 *   - `copy`/`move` read the `from` pointer in the same document;
 *   - pointer tokens unescape `~1` -> `/` and `~0` -> `~` (RFC 6901).
 * ==========================================================================*/
(function (global) {
  'use strict';

  function parsePointer(pointer) {
    var p = String(pointer === undefined || pointer === null ? '' : pointer);
    if (p === '') return [];
    if (p.charAt(0) !== '/') throw new Error('JSON pointer must start with "/": ' + p);
    return p.slice(1).split('/').map(function (token) {
      return token.replace(/~1/g, '/').replace(/~0/g, '~');
    });
  }

  function isArrayIndex(token) {
    return token === '-' || /^(?:0|[1-9][0-9]*)$/.test(token);
  }

  /* Resolve the parent container of a pointer + the last token. */
  function resolveParent(root, tokens) {
    var node = root;
    for (var i = 0; i < tokens.length - 1; i += 1) {
      var token = tokens[i];
      if (node === null || typeof node !== 'object') {
        throw new Error('path not found at "/' + tokens.slice(0, i + 1).join('/') + '"');
      }
      if (Array.isArray(node)) {
        var idx = token === '-' ? node.length : Number(token);
        if (!isFinite(idx) || idx < 0 || idx >= node.length) {
          throw new Error('array index out of range: ' + token);
        }
        node = node[idx];
      } else {
        if (!Object.prototype.hasOwnProperty.call(node, token)) {
          throw new Error('missing key "' + token + '"');
        }
        node = node[token];
      }
    }
    if (node === null || typeof node !== 'object') throw new Error('parent is not a container');
    return { parent: node, last: tokens.length ? tokens[tokens.length - 1] : '' };
  }

  function getAt(root, tokens) {
    var node = root;
    for (var i = 0; i < tokens.length; i += 1) {
      if (node === null || typeof node !== 'object') throw new Error('path not found');
      if (Array.isArray(node)) {
        var idx = Number(tokens[i]);
        if (!isFinite(idx) || idx < 0 || idx >= node.length) throw new Error('index out of range');
        node = node[idx];
      } else {
        if (!Object.prototype.hasOwnProperty.call(node, tokens[i])) throw new Error('missing key');
        node = node[tokens[i]];
      }
    }
    return node;
  }

  /* `add` semantics, tolerant of MLB's one-past-the-end and replace-as-add. */
  function addAt(root, tokens, value) {
    if (!tokens.length) return value; // whole document
    var slot = resolveParent(root, tokens);
    if (Array.isArray(slot.parent)) {
      var idx;
      if (slot.last === '-') idx = slot.parent.length;
      else idx = Number(slot.last);
      if (!isFinite(idx) || idx < 0) throw new Error('bad array index for add: ' + slot.last);
      if (idx > slot.parent.length) throw new Error('add index beyond end: ' + idx);
      slot.parent.splice(idx, 0, value);
      return root;
    }
    slot.parent[slot.last] = value;
    return root;
  }

  function removeAt(root, tokens) {
    if (!tokens.length) return undefined;
    var slot = resolveParent(root, tokens);
    if (Array.isArray(slot.parent)) {
      var idx = Number(slot.last);
      if (!isFinite(idx) || idx < 0 || idx >= slot.parent.length) throw new Error('remove index out of range');
      slot.parent.splice(idx, 1);
      return root;
    }
    if (!Object.prototype.hasOwnProperty.call(slot.parent, slot.last)) throw new Error('remove of a missing key');
    delete slot.parent[slot.last];
    return root;
  }

  function replaceAt(root, tokens, value) {
    if (!tokens.length) return value;
    var slot = resolveParent(root, tokens);
    if (Array.isArray(slot.parent)) {
      var idx = slot.last === '-' ? slot.parent.length : Number(slot.last);
      if (!isFinite(idx) || idx < 0) throw new Error('bad replace index');
      if (idx === slot.parent.length) { slot.parent.push(value); return root; } // MLB appends here
      if (idx > slot.parent.length) throw new Error('replace index beyond end: ' + idx);
      slot.parent[idx] = value;
      return root;
    }
    slot.parent[slot.last] = value; // replace may create (MLB does this)
    return root;
  }

  /**
   * applyPatch(target, ops)
   * Applies on a deep copy. Returns { ok, value, error, applied }.
   * `value` is the patched copy when ok, or the untouched input when not.
   */
  function applyPatch(target, ops) {
    if (!Array.isArray(ops)) return { ok: false, value: target, error: 'patch is not an array', applied: 0 };
    var clone;
    try {
      clone = JSON.parse(JSON.stringify(target));
    } catch (e) {
      return { ok: false, value: target, error: 'base document is not serializable', applied: 0 };
    }
    var applied = 0;
    for (var i = 0; i < ops.length; i += 1) {
      var op = ops[i] || {};
      var kind = String(op.op || '');
      try {
        var tokens = parsePointer(op.path);
        if (kind === 'add') {
          clone = addAt(clone, tokens, op.value);
        } else if (kind === 'replace') {
          clone = replaceAt(clone, tokens, op.value);
        } else if (kind === 'remove') {
          clone = removeAt(clone, tokens);
        } else if (kind === 'copy') {
          var fromTokens = parsePointer(op.from);
          var copied = JSON.parse(JSON.stringify(getAt(clone, fromTokens)));
          clone = addAt(clone, tokens, copied);
        } else if (kind === 'move') {
          var moveTokens = parsePointer(op.from);
          var moved = getAt(clone, moveTokens);
          clone = removeAt(clone, moveTokens);
          clone = addAt(clone, parsePointer(op.path), moved);
        } else if (kind === 'test') {
          var actual = getAt(clone, tokens);
          if (JSON.stringify(actual) !== JSON.stringify(op.value)) {
            throw new Error('test op failed at ' + op.path);
          }
        } else {
          throw new Error('unsupported op "' + kind + '"');
        }
        applied += 1;
      } catch (err) {
        return { ok: false, value: target, error: (err && err.message ? err.message : 'patch failed') + ' (op #' + i + (op.path ? ' ' + op.op + ' ' + op.path : '') + ')', applied: applied };
      }
    }
    return { ok: true, value: clone, error: null, applied: applied };
  }

  /* Does this patch list touch anything we track? Lets a poll skip all
   * downstream parsing when the only changes were box-score pitch counters. */
  function touchesPatch(ops, needles) {
    if (!Array.isArray(ops) || !ops.length) return false;
    var list = needles || ['/liveData/plays', '/gameData/status', '/liveData/linescore', '/metaData/timeStamp'];
    for (var i = 0; i < ops.length; i += 1) {
      var path = String((ops[i] && ops[i].path) || '') + ' ' + String((ops[i] && ops[i].from) || '');
      for (var n = 0; n < list.length; n += 1) {
        if (path.indexOf(list[n]) !== -1) return true;
      }
    }
    return false;
  }

  global.JsonPatch = {
    applyPatch: applyPatch,
    parsePointer: parsePointer,
    touchesPatch: touchesPatch,
  };
}(typeof window !== 'undefined' ? window : globalThis));
