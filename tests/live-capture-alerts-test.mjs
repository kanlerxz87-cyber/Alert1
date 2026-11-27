#!/usr/bin/env node
/* ============================================================================
 * tests/live-capture-alerts-test.mjs — regressions for session 3b986e1e
 *
 * Covers, against the SHIPPED files (no mocks of the app itself):
 *
 *   L-1 latency       cache-busted polls, the fast in-review probe, the
 *                     projected feed/live resync, the schedule TTL, and the
 *                     per-game latency badge numbers
 *   L-2 alert sound   ~3 s raindrop shower, one motif per tracked event, a
 *                     Test alert button, the three-state toggle, and the
 *                     persistent "already alerted" ledger (no replay on refresh)
 *   L-3 capture       official state captured to the second (score, outs,
 *                     count, inning, batter, pitcher, pitch count) plus MLB's
 *                     own metaData.timeStamp, and a before/after pair on every
 *                     reviewed play, pending ruling and scoring change
 *   L-4 separation    the official-scoring book is its own store with its own
 *                     merge, survives a reload, and is never touched by the
 *                     alert system
 *
 * Fixtures are the official payloads already in tests/fixtures/ (values copied
 * verbatim from statsapi.mlb.com on 2026-11-20 — see docs/verification-report.md).
 *
 *   node tests/live-capture-alerts-test.mjs
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let JSDOM;
for (const candidate of [process.env.JSDOM_PATH, 'jsdom', path.join(ROOT, 'node_modules/jsdom/lib/api.js')]) {
  if (!candidate) continue;
  try {
    const mod = await import(candidate);
    JSDOM = mod.JSDOM || (mod.default && mod.default.JSDOM);
    if (JSDOM) break;
  } catch { /* next */ }
}
if (!JSDOM) {
  console.error('live-capture-alerts-test: SKIPPED — jsdom is not installed (npm install --no-save jsdom)');
  process.exit(0);
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const FIX = (n) => JSON.parse(read(path.join('tests', 'fixtures', n)));

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    const out = fn();
    if (out instanceof Promise) throw new Error('use checkAsync');
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (err) {
    failures.push(name + ' — ' + (err && err.message));
    console.log('  ✗ ' + name + ' — ' + (err && err.message));
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (err) {
    failures.push(name + ' — ' + (err && err.message));
    console.log('  ✗ ' + name + ' — ' + (err && err.message));
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

/* ----------------------------------------------------- static source checks */
function sourceOf(rel) { return read(rel); }

console.log('\n[L-1] lowest-latency feed');

check('every polling path is cache-busted and never served from a cache', () => {
  const api = sourceOf('assets/js/api.js');
  assert(/opts\.bust/.test(api), 'getJSON must support bust');
  assert(/'_=' \+ now\(\)/.test(api.replace(/\s+/g, ' ')), 'bust must append a unique token');
  assert(/cache: 'no-store'/.test(api), 'fetch must keep cache: no-store');
  const feed = sourceOf('assets/js/reviews-feed.js');
  assert(/bust: true/.test(feed), 'the replay feed must bust its play-by-play polls');
  assert(/gameFeedState/.test(feed), 'the resync must use the projected feed/live helper');
});

check('the fast in-review probe and the resync are configured, bounded and exported', () => {
  const feed = sourceOf('assets/js/reviews-feed.js');
  assert(/REVIEW_PROBE_MS = 200/.test(feed), 'a 200 ms in-review probe is expected');
  assert(/REVIEW_PROBE_MAX_GAMES = 4/.test(feed), 'the fast probe must be bounded');
  assert(/RESYNC_MS = 10000/.test(feed), 'a full-feed resync cadence is expected');
  assert(/resyncTick/.test(feed) && /setInterval\(resyncTick/.test(feed), 'the resync ticker must be wired');
  assert(/SCHEDULE_TTL_MS = 400/.test(feed), 'the schedule must be reused briefly instead of re-polled each tick');
  assert(/'scan'\)/.test(feed) && /'resync'\)/.test(feed), 'both request modes must be used');
});

check('a game is ingested and rendered the moment its response lands', () => {
  const feed = sourceOf('assets/js/reviews-feed.js');
  const runLimitedBlock = feed.slice(feed.indexOf('return runLimited(due'), feed.indexOf('}).then(function () {', feed.indexOf('return runLimited(due')));
  assert(/ingestGame\(result, scanSeq, scanDate\)/.test(runLimitedBlock),
    'the per-game worker must ingest immediately, not after the whole batch');
  assert(/renderSoon\(\)/.test(runLimitedBlock), 'the per-game worker must schedule a render immediately');
  assert(/RENDER_COALESCE_MS/.test(feed), 'renders must be coalesced to one per frame');
});

await checkAsync('latency instrumentation reports median/p95 and a per-game figure', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = () => Promise.resolve({ ok: false, status: 404, json: async () => null });
  w.eval(read('assets/js/api.js'));
  w.eval(read('assets/js/ui.js'));
  w.eval(read('assets/js/reviews.js'));
  w.eval(read('assets/js/feed-log.js'));
  w.eval(read('assets/js/alert-sound.js'));
  w.eval(read('assets/js/game-state.js'));
  w.eval(read('assets/js/scoring-log.js'));
  w.eval(read('assets/js/reviews-feed.js'));
  await new Promise((r) => setTimeout(r, 200));
  const st = w.ReplayFeed.state;
  st.latencySamples = [];
  [120, 300, 90, 800, 240].forEach((ms) => { st.latencySamples.push({ ms, at: Date.now(), gamePk: 823109 }); });
  const stats = w.ReplayFeed.latencyStats();
  assert(stats.count === 5, 'expected 5 samples, got ' + stats.count);
  assert(stats.median === 240, 'median should be 240, got ' + stats.median);
  assert(stats.worst === 800, 'worst should be 800, got ' + stats.worst);
  assert(w.ReplayFeed.gameLatency(823109) === 90, 'per-game fastest should be 90, got ' + w.ReplayFeed.gameLatency(823109));
  dom.window.close();
});

console.log('\n[L-2] the alert sound');

check('one shared audio graph, a ~3 s shower, and a motif per tracked event', () => {
  const src = sourceOf('assets/js/alert-sound.js');
  assert(/3\.0/.test(src), 'the master envelope must end at ~3 s');
  assert(/createOscillator/.test(src) && /createBuffer/.test(src), 'rain = oscillators + a noise bed');
  ['review', 'pending', 'scoring', 'risk', 'test'].forEach((kind) => {
    assert(new RegExp("\\b" + kind + ": \\{").test(src), 'motif missing for ' + kind);
  });
  assert(/COOLDOWN_MS = 900/.test(src), 'a short cooldown must prevent stacking');
  const html = sourceOf('reviews.html');
  assert(/id="alert-test-btn"/.test(html), 'the Test alert button must exist');
  assert(/id="sound-toggle-btn"/.test(html), 'the on/off toggle must exist');
  assert(/id="abs-toggle-btn"/.test(html), 'ABS alerts must have their own switch');
  assert(/assets\/js\/alert-sound\.js/.test(html), 'alert-sound.js must be loaded');
});

await checkAsync('the ledger claims an event exactly once, per date, across page loads', async () => {
  const boot = () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html', runScripts: 'outside-only' });
    dom.window.localStorage.clear();
    dom.window.eval(read('assets/js/alert-sound.js'));
    return dom;
  };
  const first = boot();
  const A = first.window.AlertSound;
  assert(A.has('2026-08-28', 'evt-1') === false, 'nothing claimed yet');
  assert(A.claim('2026-08-28', 'evt-1') === true, 'first claim must succeed');
  assert(A.claim('2026-08-28', 'evt-1') === false, 'second claim must be refused');
  assert(A.has('2026-08-28', 'evt-1') === true, 'the claim must be visible');
  assert(A.claim('2026-08-29', 'evt-1') === true, 'a different date is a different ledger');
  assert(A.count('2026-08-28') === 1, 'exactly one id for the date');
  const persisted = first.window.localStorage.getItem('mlbp.alerts.2026-08-28');
  assert(!!persisted, 'the ledger must be written to localStorage');
  /* "Refresh": a brand new page with the same storage must not re-alert. */
  const second = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://kanlerxz97-cyber.github.io/x', runScripts: 'outside-only' });
  second.window.localStorage.clear();
  second.window.localStorage.setItem('mlbp.alerts.2026-08-28', persisted);
  second.window.eval(read('assets/js/alert-sound.js'));
  const B = second.window.AlertSound;
  assert(B.has('2026-08-28', 'evt-1') === true, 'a reloaded page must remember the alert');
  assert(B.claim('2026-08-28', 'evt-1') === false, 'a reloaded page must not re-alert');
  assert(B.claim('2026-08-28', 'evt-2') === true, 'a genuinely new event still alerts');
  first.window.close();
  second.window.close();
});

await checkAsync('the alert path survives a browser with no Web Audio, and reports it', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html', runScripts: 'outside-only' });
  const w = dom.window;
  assert(typeof w.AudioContext === 'undefined', 'jsdom has no Web Audio — that is the case under test');
  w.eval(read('assets/js/alert-sound.js'));
  assert(w.AlertSound.audioAvailable() === false, 'audioAvailable must be honest');
  const result = w.AlertSound.test();
  assert(result.ok === false && result.reason === 'no-webaudio', 'test() must report the reason, not throw');
  assert(w.AlertSound.play('review') === false, 'play() must return false rather than throw');
  assert(w.AlertSound.preview('scoring') === false, 'preview() must return false rather than throw');
  dom.window.close();
});

await checkAsync('every Web Audio node the alert needs is exercised (fake AudioContext)', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html', runScripts: 'outside-only' });
  const w = dom.window;
  const created = { osc: 0, buffer: 0, gain: 0, filter: 0, delay: 0 };
  function param() {
    return {
      value: 0,
      setValueAtTime() { return this; },
      linearRampToValueAtTime() { return this; },
      exponentialRampToValueAtTime() { return this; },
    };
  }
  function node(extra) {
    return Object.assign({
      connect() { return this; },
      disconnect() {},
      start() {},
      stop() {},
    }, extra || {});
  }
  w.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() {
      created.osc += 1;
      return node({ type: 'sine', frequency: param(), detune: param() });
    }
    createGain() { created.gain += 1; return node({ gain: param() }); }
    createBiquadFilter() { created.filter += 1; return node({ type: '', frequency: param(), Q: param() }); }
    createDelay() { created.delay += 1; return node({ delayTime: param() }); }
    createBuffer() {
      created.buffer += 1;
      const data = new Float32Array(8);
      return { getChannelData: () => data, length: 8 };
    }
    createBufferSource() { return node({ buffer: null }); }
  };
  w.eval(read('assets/js/alert-sound.js'));
  assert(w.AlertSound.audioAvailable() === true, 'the fake context should be detected');
  const ok = w.AlertSound.play('review', { force: true });
  assert(ok === true, 'play() should report success');
  assert(created.osc >= 5, 'the raindrop shower must schedule several droplets, got ' + created.osc);
  assert(created.buffer === 1, 'the rain bed must create one noise buffer, got ' + created.buffer);
  assert(created.filter === 1, 'the rain bed must be band-limited, got ' + created.filter);
  assert(created.delay === 1, 'the shower must share one echo, got ' + created.delay);
  const blocked = w.AlertSound.play('review');
  assert(blocked === false, 'a second tone inside the cooldown must be dropped');
  const test = w.AlertSound.test();
  assert(test.ok === true, 'the Test button must ignore the cooldown');
  dom.window.close();
});

console.log('\n[L-3] official live state capture');

const STATE_FEED = (() => {
  const feed = FIX('feed-824638-review.json');
  /* metaData is part of every real feed/live response; the fixture trims it, so
   * add the documented shape (the field names are the API's own). */
  feed.metaData = { wait: 10, timeStamp: '20260828_213512', gameEvents: ['abc'], logicalEvents: ['def'] };
  return feed;
})();

await checkAsync('capture() reads every official field, with both observation clocks', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html', runScripts: 'outside-only' });
  dom.window.eval(read('assets/js/game-state.js'));
  const GS = dom.window.GameState;
  const at = new Date('2026-08-28T21:35:52Z').getTime();
  const st = GS.capture({
    game: { gamePk: 824638, gameDate: '2026-08-28T18:20:00Z', status: { abstractGameState: 'Final', detailedState: 'Final', statusCode: 'F' } },
    feed: STATE_FEED,
    countersPayload: STATE_FEED,
    observedAt: at,
  });
  assert(st.gamePk === 824638, 'gamePk');
  assert(st.observedAt === at, 'observedAt must be the injected observation time');
  assert(st.timecode && st.timecode.timeStamp === '20260828_213512',
    'MLB metaData.timeStamp must be captured verbatim: ' + JSON.stringify(st.timecode));
  assert(st.score.away === 10 && st.score.home === 8, 'score from the official linescore, got ' + JSON.stringify(st.score));
  assert(st.inning.num === 9, 'inning');
  assert(st.outs === 3, 'outs');
  assert(st.count.balls === 1 && st.count.strikes === 1, 'count');
  assert(GS.halfLabel(st) === 'Bot 9', 'half-inning label, got ' + GS.halfLabel(st));
  assert(st.pitchCount.game === 0 || st.pitchCount.game === null,
    'a trimmed play-by-play has no playEvents, so no pitch total may be invented');
  assert(st.challenges && st.challenges.manager && st.challenges.manager.home.used === 1,
    'official manager-challenge counters must be read as-is');
  assert(st.challenges.abs.away.remaining === 2, 'official ABS counters must be read as-is');
  assert(/^2026-08-28 21:35:52Z$/.test(GS.utc(at)), 'UTC stamp to the second, got ' + GS.utc(at));
  assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(GS.stamp(at)), 'local stamp to the second, got ' + GS.stamp(at));
  assert(/10–8/.test(GS.summary(st)), 'the one-line summary must carry the score: ' + GS.summary(st));
  dom.window.close();
});

await checkAsync('diff() reports exactly what moved between two observations', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html', runScripts: 'outside-only' });
  dom.window.eval(read('assets/js/game-state.js'));
  const GS = dom.window.GameState;
  const base = GS.capture({ game: { gamePk: 1 }, feed: STATE_FEED, countersPayload: STATE_FEED, observedAt: Date.now() });
  const later = JSON.parse(JSON.stringify(base));
  later.score.home = 9;
  later.outs = 0;
  later.count = { balls: 0, strikes: 2 };
  later.observedAt = base.observedAt + 250;
  const changes = GS.diff(base, later);
  const fields = changes.map((c) => c.field).sort().join(',');
  assert(fields === 'count,outs,score', 'expected score/outs/count to change, got ' + fields);
  const score = changes.find((c) => c.field === 'score');
  assert(score.from === '10–8' && score.to === '10–9', 'score diff must show both sides: ' + JSON.stringify(score));
  assert(GS.equivalent(base, base) === true, 'a state is equivalent to itself');
  assert(GS.equivalent(base, later) === false, 'materially different states must not compare equal');
  assert(/Score: 10–8 → 10–9/.test(GS.pairText(base, later)), 'pairText must spell the change out: ' + GS.pairText(base, later));
  dom.window.close();
});

await checkAsync('the feed stores a before/after pair on every captured event', () => {
  const feed = sourceOf('assets/js/reviews-feed.js');
  assert(/function captureState/.test(feed), 'captureState must exist');
  assert(/prevState\[pk\] = prior/.test(feed), 'the previous observation must be kept as the before-side');
  assert(/var beforeSnap = stateSnapshot\(prevCaptured\)/.test(feed), 'before snapshot');
  assert(/var afterSnap = stateSnapshot\(captured\)/.test(feed), 'after snapshot');
  ['review', 'pending', 'scoring_change'].forEach((kind) => {
    const idx = feed.indexOf("kind: '" + kind + "'");
    assert(idx !== -1, 'missing kind ' + kind);
    const block = feed.slice(idx, idx + 2600);
    assert(/stateBefore: beforeSnap/.test(block) && /stateAfter: afterSnap/.test(block),
      kind + ' entries must carry both captured states');
  });
  assert(/function stateBlock/.test(feed) && /function beforeAfterHtml/.test(feed), 'the pair must be rendered');
  assert(/Observed ' \+ UI\.esc\(snap\.stamp/.test(feed), 'the row must show when the state was observed');
  assert(/state-timecode/.test(feed), 'the row must show MLB timecode provenance when it exists');
});

await checkAsync('the live board renders the captured state for every live game', async () => {
  const html = sourceOf('reviews.html');
  assert(/id="live-state"/.test(html), 'the live board container must exist');
  const feed = sourceOf('assets/js/reviews-feed.js');
  assert(/function renderLiveState/.test(feed), 'renderLiveState must exist');
  ['live-score', 'live-meta', 'live-clock', 'live-timecode', 'live-latency'].forEach((cls) => {
    assert(feed.indexOf(cls) !== -1, 'the live board must render ' + cls);
  });
  assert(/renderLiveState\(\);/.test(feed.slice(feed.indexOf('function render()'))), 'render() must draw it');
});

console.log('\n[L-4] the separate official-scoring book');

await checkAsync('records merge without ever losing a before-side, and keep every revision', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html', runScripts: 'outside-only' });
  dom.window.eval(read('assets/js/game-state.js'));
  dom.window.eval(read('assets/js/scoring-log.js'));
  const SL = dom.window.ScoringLog;
  const beforeRec = {
    id: '824638:46:pending', kind: 'pending', date: '2026-08-28', gamePk: 824638,
    before: 'Bleday singles on a sharp line drive…', stateBefore: { stamp: 't0', summary: 's0' },
    firstObservedAt: 1000, lastObservedAt: 1000, observedLive: true,
  };
  const afterRec = {
    id: '824638:46:pending', kind: 'pending', date: '2026-08-28', gamePk: 824638,
    after: 'Bleday reaches on a fielder\'s choice.', stateAfter: { stamp: 't1', summary: 's1' },
    firstObservedAt: 2000, lastObservedAt: 2000, observedLive: false,
  };
  const merged = SL.mergeRecord(beforeRec, afterRec);
  assert(merged.before === beforeRec.before, 'the before wording must survive the merge');
  assert(merged.after === afterRec.after, 'the after wording must be kept');
  assert(merged.stateBefore.stamp === 't0' && merged.stateAfter.stamp === 't1', 'both states must survive');
  assert(merged.firstObservedAt === 1000, 'the earliest observation must win');
  assert(merged.lastObservedAt === 2000, 'the latest observation must win');
  assert(merged.observedLive === true, 'a live observation outranks an adopted one');
  const twice = SL.mergeRecord(merged, afterRec);
  assert(JSON.stringify(twice) === JSON.stringify(merged), 'merging twice must be idempotent');
  dom.window.close();
});

await checkAsync('the book persists through a refresh and stays independent of the alert ledger', async () => {
  const page = () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html', runScripts: 'outside-only' });
    dom.window.fetch = () => Promise.resolve({ ok: false, status: 404, json: async () => null });
    dom.window.eval(read('assets/js/game-state.js'));
    dom.window.eval(read('assets/js/scoring-log.js'));
    dom.window.eval(read('assets/js/alert-sound.js'));
    return dom;
  };
  const first = page();
  first.window.localStorage.clear();
  const A = first.window.ScoringLog;
  A.setDate('2026-08-28');
  A.upsert({
    id: '824638:46:pending', kind: 'pending', date: '2026-08-28', gamePk: 824638,
    matchup: 'CIN @ CHC', inning: 'Bot 6', before: 'Official Scorer Ruling Pending',
    stateBefore: { stamp: 't0', summary: 'CIN 4–1 CHC' }, observedLive: true,
  });
  A.upsert({
    id: '824638:46:scoring-change', kind: 'change', date: '2026-08-28', gamePk: 824638,
    matchup: 'CIN @ CHC', inning: 'Bot 6', eventType: 'field_error',
    before: 'JJ Bleday singles', after: 'JJ Bleday reaches on a fielder\'s choice + error',
    stateBefore: { stamp: 't1', summary: 'CIN 4–1 CHC' }, stateAfter: { stamp: 't2', summary: 'CIN 4–2 CHC' },
  });
  assert(A.all().length === 2, 'both records must be in the book');
  const raw = first.window.localStorage.getItem('mlbp.scoringlog.2026-08-28');
  assert(!!raw, 'the book must be written to its own localStorage key');
  assert(!/mlbp\.alerts/.test(Object.keys(Object.fromEntries([[raw, 1]])).join('')), 'sanity');
  assert(first.window.localStorage.getItem('mlbp.alerts.2026-08-28') === null,
    'writing the book must never touch the alert ledger');

  /* Refresh: a new page with the same storage reads the whole book back. */
  const second = page();
  second.window.localStorage.setItem('mlbp.scoringlog.2026-08-28', raw);
  const B = second.window.ScoringLog;
  B.setDate('2026-08-28');
  await B.load('2026-08-28');
  assert(B.all().length === 2, 'a refreshed page must restore both records, got ' + B.all().length);
  const pendingRec = B.get('824638:46:pending');
  assert(pendingRec && pendingRec.before === 'Official Scorer Ruling Pending', 'the pending record must survive');
  assert(B.stats().pending === 1 && B.stats().changes === 1, 'stats must classify both kinds');
  assert(/Official scoring log/.test(B.exportText()), 'the export must be a readable log');

  /* The alert system going away must not disturb the book. */
  const alertsBefore = Object.keys(second.window.localStorage).filter((k) => k.startsWith('mlbp.alerts'));
  second.window.AlertSound.forget('2026-08-28');
  const alertsAfter = Object.keys(second.window.localStorage).filter((k) => k.startsWith('mlbp.alerts'));
  assert(alertsBefore.length === alertsAfter.length, 'alert keys changed');
  assert(B.all().length === 2, 'the book must be untouched by an alert-ledger reset');
  first.window.close();
  second.window.close();
});

await checkAsync('the book records a resolved pending ruling without guessing the new call', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html', runScripts: 'outside-only' });
  dom.window.eval(read('assets/js/game-state.js'));
  dom.window.eval(read('assets/js/scoring-log.js'));
  const SL = dom.window.ScoringLog;
  SL.setDate('2026-08-28');
  SL.upsert({ id: 'x:pending', kind: 'pending', date: '2026-08-28', gamePk: 9, eventType: 'os_ruling_pending_primary', before: 'Official Scorer Ruling Pending' });
  assert(SL.pending().length === 1, 'the ruling must start open');
  SL.revise('x:pending', 'Ruling no longer pending…', { resolvedAt: 1234, stateAfter: { stamp: 't9' } });
  assert(SL.pending().length === 0, 'the ruling must be closed');
  const rec = SL.get('x:pending');
  assert(rec.resolvedAt === 1234, 'resolvedAt must be stored');
  assert(rec.revisions.length === 1, 'the resolution must be kept as a revision');
  assert(rec.before === 'Official Scorer Ruling Pending', 'the original wording must not be rewritten');
  assert(rec.after === null || rec.after === undefined, 'the new classification must not be invented');
  dom.window.close();
});

check('the book has its own server endpoints and its own storage merge', () => {
  const server = sourceOf('server.mjs');
  assert(/scoring-log-\$\{dateStr\}\.json/.test(server), 'the server must store the book in its own files');
  assert(/\/api\/scoring-log/.test(server), 'the server must expose /api/scoring-log');
  assert(/mergeScoringPayloads/.test(server), 'the server must merge rather than overwrite');
  assert(/out\.before = a\.before \|\| b\.before/.test(server), 'the server must never drop a before-side');
  const client = sourceOf('assets/js/scoring-log.js');
  assert(/mlbp\.scoringlog\./.test(client), 'the client must use its own key namespace');
  const commentStripped = client.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(!/mlbp\.alerts/.test(commentStripped), 'the scoring book must not read or write the alert ledger');
  assert(/function exportText/.test(client), 'the book must be exportable');
});

console.log('\n[L-5] documentation');

check('the latency / scoring-log write-up exists and links the official endpoints', () => {
  const doc = sourceOf('docs/live-latency-and-scoring-log.md');
  assert(/diffPatch/.test(doc), 'the incremental endpoint must be documented');
  assert(/metaData\.timeStamp/.test(doc), 'the official timecode must be documented');
  assert(/api\/v1\/game\/\{\{?gamePk/.test(doc.replace(/\{/g, '{{')) || /statsapi\.mlb\.com/.test(doc), 'official links');
  assert(/pending/i.test(doc) && /scoring change/i.test(doc), 'both record kinds must be explained');
});

console.log('');
console.log(`live-capture-alerts-test: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
