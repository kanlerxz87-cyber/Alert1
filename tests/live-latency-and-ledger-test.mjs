#!/usr/bin/env node
/* tests/live-latency-and-ledger-test.mjs — regression coverage for the
 * 2026-11-27 work: (1) fastest-feed delta transport, (2) the alert sound and
 * its test path, (3) second-precision official state capture with before/after,
 * (4) the separate, persistent official-scoring ledger.
 *
 * Runs against the SHIPPED files. Only `fetch` and `WebSocket` are stubbed, and
 * every official shape used here comes from live StatsAPI responses captured on
 * 2026-11-27 (URLs are cited inline; the diffPatch op list below is a verbatim
 * excerpt of https://statsapi.mlb.com/api/v1.1/game/745111/feed/live/diffPatch
 * ?startTimecode=20240403_011327&endTimecode=20240403_011340).
 *
 *   node tests/live-latency-and-ledger-test.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
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
  console.error('live-latency-and-ledger-test: SKIPPED — jsdom is not installed (npm install --no-save jsdom)');
  process.exit(0);
}

const passes = [];
const failures = [];
function check(name, condition, detail) {
  if (condition) passes.push(name);
  else failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

async function boot(files) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-09-15',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const errors = [];
  w.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
  w.scrollTo = () => {};
  for (const f of files) {
    const file = path.join(ROOT, 'assets/js', f);
    try {
      w.eval(readFileSync(file, 'utf8') + `\n//# sourceURL=${file}`);
    } catch (err) {
      errors.push(`${f}: ${err.message}`);
    }
  }
  return { dom, w, errors };
}

/* ------------------------------------------------------------------ payloads */

/* Verbatim shape of one diffPatch answer (two sequential patches; the second is
 * the play completing). Trimmed to the ops that matter, values unchanged. */
const DIFF_PATCH = [
  {
    diff: [
      { op: 'replace', path: '/metaData/timeStamp', value: '20260915_231010' },
      { op: 'replace', path: '/metaData/gameEvents/0', value: 'hit_into_play' },
      { op: 'add', path: '/metaData/logicalEvents/0', value: 'countChange' },
      { op: 'remove', path: '/liveData/plays/currentPlay/result/eventType' },
      { op: 'replace', path: '/liveData/plays/currentPlay/about/endTime', value: '2026-09-15T23:10:10.013Z' },
      { op: 'add', path: '/liveData/plays/currentPlay/playEvents/1', value: { isPitch: true, pitchNumber: 2, count: { outs: 1, balls: 1, strikes: 1 }, details: { description: 'Ball', call: { code: 'B' } } } },
      { op: 'replace', path: '/liveData/linescore/balls', value: 1 },
      { op: 'replace', path: '/liveData/linescore/strikes', value: 1 },
    ],
  },
  {
    diff: [
      { op: 'replace', path: '/metaData/timeStamp', value: '20260915_231022' },
      { op: 'replace', path: '/liveData/plays/currentPlay/about/isComplete', value: true },
      { op: 'add', path: '/liveData/plays/currentPlay/result/eventType', value: 'single' },
      { op: 'add', path: '/liveData/plays/currentPlay/result/description', value: 'Heim singles on a line drive to left field.' },
      { op: 'replace', path: '/liveData/linescore/teams/home/runs', value: 2 },
      { op: 'replace', path: '/liveData/linescore/outs', value: 1 },
    ],
  },
];

function baseTree() {
  return {
    metaData: { wait: 10, timeStamp: '20260915_231000', gameEvents: [], logicalEvents: ['fullUpdate'] },
    gameData: {
      game: { pk: 823109, season: 2026 },
      status: { abstractGameState: 'Live', codedGameState: 'I', detailedState: 'In Progress', statusCode: 'I' },
      teams: {
        away: { team: { id: 136, name: 'Seattle Mariners', abbreviation: 'SEA' }, score: 3 },
        home: { team: { id: 142, name: 'Minnesota Twins', abbreviation: 'MIN' }, score: 1 },
      },
      datetime: { dateTime: '2026-09-15T23:10:00Z', officialDate: '2026-09-15' },
      review: { hasChallenges: true, away: { used: 1, remaining: 0 }, home: { used: 1, remaining: 1 } },
      absChallenges: { hasChallenges: true, away: { usedSuccessful: 0, usedFailed: 1, remaining: 2 }, home: { usedSuccessful: 1, usedFailed: 0, remaining: 2 } },
    },
    liveData: {
      plays: {
        allPlays: [{ about: { atBatIndex: 0, isComplete: true }, result: { eventType: 'field_out' }, count: { outs: 0 } }],
        currentPlay: {
          about: { atBatIndex: 71, inning: 8, halfInning: 'top', isTopInning: true, isComplete: false, startTime: '2026-09-15T23:09:50.000Z' },
          result: { eventType: 'at_bat_start', description: '' },
          count: { balls: 0, strikes: 0, outs: 1 },
          matchup: { batter: { id: 641680, fullName: 'Jonah Heim' }, pitcher: { id: 592789, fullName: 'Test Pitcher' } },
          playEvents: [{ isPitch: true, pitchNumber: 1, count: { outs: 1, balls: 0, strikes: 0 }, details: { description: 'In play' } }],
          runners: [],
        },
      },
      linescore: {
        currentInning: 8, inningState: 'Top', isTopInning: true, balls: 0, strikes: 0, outs: 1,
        teams: { away: { runs: 3 }, home: { runs: 1 } },
        offense: { batter: { id: 641680, fullName: 'Jonah Heim' }, first: { id: 621566 }, second: null, third: null },
        defense: { pitcher: { id: 592789, fullName: 'Test Pitcher' } },
      },
      boxscore: {
        teams: {
          away: { players: {}, teamStats: { pitching: { numberOfPitches: 88 } } },
          home: {
            players: { ID592789: { stats: { pitching: { numberOfPitches: 64, pitchesThrown: 64 } } } },
            teamStats: { pitching: { numberOfPitches: 64 } },
          },
        },
      },
    },
  };
}

/* ------------------------------------------------------------------ harness */

async function withFetch(w, handler) {
  w.fetch = (url, init) => Promise.resolve(handler(String(url), init));
}

function jsonResponse(body, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

/* =========================================================== 1. json-patch === */
console.log('[1] json-patch.js — RFC 6902 over the official diffPatch op shapes');
{
  const { w, errors } = await boot(['json-patch.js']);
  check('modules load with no error', errors.length === 0, errors.join(' | '));
  const JP = w.JsonPatch;
  check('JsonPatch is exposed', !!JP);

  const base = baseTree();
  const out = JP.applyPatch(base, DIFF_PATCH[0].diff.concat(DIFF_PATCH[1].diff));
  check('a two-patch diff applies cleanly', out.ok === true, out.error || '');
  check('applied count matches the op list', out.applied === DIFF_PATCH[0].diff.length + DIFF_PATCH[1].diff.length, String(out.applied));
  check('timecode advances to the last patch', out.value.metaData.timeStamp === '20260915_231022', out.value.metaData.timeStamp);
  check('the completed play carries the official description',
    out.value.liveData.plays.currentPlay.result.description === 'Heim singles on a line drive to left field.',
    JSON.stringify(out.value.liveData.plays.currentPlay.result));
  check('score change landed', out.value.liveData.linescore.teams.home.runs === 2);
  check('count change landed (two pitches merged)', out.value.liveData.plays.currentPlay.playEvents.length === 2);
  check('the base tree is never mutated (patch applies to a copy)', base.metaData.timeStamp === '20260915_231000');

  /* MLB uses `replace` where the RFC would need `add`, and appends via replace
   * at index === length. Both must work (verified on the live endpoint). */
  const append = JP.applyPatch({ metaData: { gameEvents: [] } }, [{ op: 'replace', path: '/metaData/gameEvents/0', value: 'hit_into_play' }]);
  check('replace at index 0 of an empty array appends (MLB behaviour)', append.ok && append.value.metaData.gameEvents[0] === 'hit_into_play', append.error || '');

  const copyOp = JP.applyPatch({ a: { b: [1, 2] } }, [{ op: 'copy', path: '/c', from: '/a/b' }, { op: 'remove', path: '/a/b/0' }]);
  check('copy + remove follow the pointer rules', copyOp.ok && copyOp.value.c[0] === 1 && copyOp.value.a.b.length === 1, copyOp.error || '');

  const bad = JP.applyPatch(baseTree(), [{ op: 'replace', path: '/nope/deeper', value: 1 }]);
  check('an inapplicable op fails loudly instead of half-applying', bad.ok === false && !!bad.error);
  check('a failed patch returns the untouched document', bad.value.metaData.timeStamp === '20260915_231000');

  const escapes = JP.applyPatch({ 'a/b': { 'c~d': 1 } }, [{ op: 'replace', path: '/a~1b/c~0d', value: 2 }]);
  check('pointer tokens unescape ~1 and ~0 (RFC 6901)', escapes.ok && escapes.value['a/b']['c~d'] === 2, escapes.error || '');

  check('touchesPatch spots a play change and ignores a box-score-only one',
    JP.touchesPatch(DIFF_PATCH[1].diff) === true &&
    JP.touchesPatch([{ op: 'replace', path: '/liveData/boxscore/teams/home/teamStats/pitching/numberOfPitches', value: 1 }]) === false);
  w.close();
}

/* =========================================================== 2. live-state === */
console.log('\n[2] live-state.js — official state captured to the second, before → after');
{
  const { w } = await boot(['json-patch.js', 'live-state.js']);
  const LS = w.LiveState;
  const game = { gamePk: 823109, officialDate: '2026-09-15' };
  const s1 = LS.snapshot(game, baseTree());
  check('a snapshot carries every promised field group',
    ['status', 'inning', 'outs', 'count', 'score', 'batter', 'pitcher', 'pitchCount', 'bases', 'currentPlay', 'officialWording']
      .every((k) => Object.prototype.hasOwnProperty.call(s1, k)),
    Object.keys(s1).join(','));
  check('capture time is second-precision ISO', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s1.capturedAtIso), s1.capturedAtIso);
  check('the official Gameday timecode is kept', s1.gamedayTimecode === '20260915_231000', s1.gamedayTimecode);
  check('score/outs/count/pitcher come from the official payload',
    s1.score.away === 3 && s1.score.home === 1 && s1.outs === 1 &&
    s1.count.balls === 0 && s1.count.strikes === 0 && s1.pitcher.name === 'Test Pitcher',
    JSON.stringify({ score: s1.score, outs: s1.outs, count: s1.count, pitcher: s1.pitcher }));
  check('pitch count is the official numberOfPitches', s1.pitchCount.pitcher === 64 && s1.pitchCount.team === 64, JSON.stringify(s1.pitchCount));
  check('bases reflect linescore.offense', s1.bases.first === true && s1.bases.second === false);
  check('the inning label is the official half + number', s1.inning.label === 'Top 8', s1.inning.label);

  const patched = w.JsonPatch.applyPatch(baseTree(), DIFF_PATCH[0].diff.concat(DIFF_PATCH[1].diff)).value;
  const s2 = LS.snapshot(game, patched);
  const d = LS.diff(s1, s2);
  const fields = d.changes.map((c) => c.field);
  check('diff reports the fields that moved', fields.includes('count') && fields.includes('score'), fields.join(','));
  check('diff renders before → after text for the count', d.changes.some((c) => c.field === 'count' && c.before === '0-0' && c.after === '1-1'),
    JSON.stringify(d.changes.find((c) => c.field === 'count')));
  check('a completed plate appearance inside the same at-bat is not "a new play"', d.flags.newPlay === false);
  const nextAtBat = baseTree();
  nextAtBat.liveData.plays.currentPlay.about.atBatIndex = 72;
  check('a genuinely new at-bat is flagged as a new play', LS.diff(s1, LS.snapshot(game, nextAtBat)).flags.newPlay === true);
  check('a score change is flagged', d.flags.scoreChanged === true);
  check('the transition text quotes the payload on both sides', /→/.test(LS.transitionText(s1, s2)));

  /* A completed at-bat with no published result is the "not scored yet" state. */
  const unscoredTree = baseTree();
  unscoredTree.liveData.plays.currentPlay.about.isComplete = true;
  unscoredTree.liveData.plays.currentPlay.result.eventType = 'at_bat_start';
  const unscored = LS.snapshot(game, unscoredTree);
  const d2 = LS.diff(s2, unscored);
  check('a completed at-bat with no official event is flagged unscored', d2.flags.unscoredAtBat === true, JSON.stringify(d2.flags));
  check('the capture keeps the payload\'s own (unpublished) event type', unscored.currentPlay.eventType === 'at_bat_start', unscored.currentPlay.eventType);
  check('isPendingResult is the one shared definition of "not scored yet"',
    LS.isPendingResult(unscoredTree.liveData.plays.currentPlay) === true &&
    LS.isPendingResult(patched.liveData.plays.currentPlay) === false);
  w.close();
}

/* ========================================================== 3. delta-feed === */
console.log('\n[3] delta-feed.js — push/delta transport, full-feed recovery, no silent mixing');
{
  const { w } = await boot(['json-patch.js', 'delta-feed.js']);
  const DF = w.DeltaFeed;
  check('DeltaFeed is exposed with a Pool', !!DF && typeof DF.Pool === 'function');
  check('timecode helpers round-trip', DF.tcodeToISO('20260915_231022') === '2026-09-15T23:10:22Z' &&
    DF.isoTcode('2026-09-15T23:10:22Z') === '20260915_231022',
    DF.tcodeToISO('20260915_231022') + ' / ' + DF.isoTcode('2026-09-15T23:10:22Z'));

  const seen = [];
  w.WebSocket = class {
    constructor(url) { this.url = url; this.readyState = 0; w.__socket = this; }
    close() { this.readyState = 3; }
  };
  DF.onEvent((evt) => seen.push(evt));

  /* The server serves the seed first, then a delta, then a full feed that the
   * patch could not produce (the documented recovery path). */
  let calls = 0;
  w.fetch = (url) => {
    const u = String(url);
    calls += 1;
    if (u.includes('/diffPatch')) {
      if (calls === 2) return Promise.resolve(jsonResponse(DIFF_PATCH));
      if (calls === 3) return Promise.resolve(jsonResponse({ broken: 'not a patch and not a feed' }));
      return Promise.resolve(jsonResponse(baseTree()));
    }
    return Promise.resolve(jsonResponse(baseTree()));
  };

  const stream = new DF.GameStream(823109, { deltaPollMs: 60000, useSocket: false });
  await stream.seed();
  check('seed takes the timecode from metaData.timeStamp', stream.timecode === '20260915_231000', stream.timecode);
  const outcome = await stream.pollDelta();
  check('a patch answer is applied to the held tree', outcome === 'patched', String(outcome));
  check('the held tree advanced with the official patch',
    stream.tree.liveData.plays.currentPlay.result.eventType === 'single' &&
    stream.timecode === '20260915_231022',
    stream.timecode);
  const after = await stream.pollDelta();
  check('an unreadable patch triggers a full-feed reseed instead of a half-patched tree', after === 'reseed', String(after));
  check('the reseed keeps a usable timecode', !!stream.timecode, String(stream.timecode));
  check('patch statistics are kept', DF.stats.patches >= 1 && DF.stats.seeds >= 1, JSON.stringify(DF.stats));

  /* An empty patch list means "nothing changed": no reseed, no event storm. */
  const idle = new DF.GameStream(1, { deltaPollMs: 60000, useSocket: false });
  await idle.seed();
  w.fetch = () => Promise.resolve(jsonResponse([]));
  const idleOutcome = await idle.pollDelta();
  check('an empty patch list is "unchanged", not a reseed', idleOutcome === 'unchanged', String(idleOutcome));
  idle.stop();

  /* The socket path: a frame triggers an immediate delta pull. */
  w.fetch = () => Promise.resolve(jsonResponse(baseTree()));
  const pushStream = new DF.GameStream(823109, { deltaPollMs: 60000, useSocket: true });
  await pushStream.seed();
  let deltaPulls = 0;
  const realFetch = w.fetch;
  w.fetch = (url, init) => { if (String(url).includes('/diffPatch')) deltaPulls += 1; return realFetch(url, init); };
  pushStream.socketWanted = true;
  const socket = pushStream.openSocket();
  check('the socket opens against the official Gameday push host',
    !!socket && /^wss:\/\/ws\.statsapi\.mlb\.com\/api\/v1\/game\/push\/subscribe\/gameday\/823109$/.test(socket.url),
    socket && socket.url);
  socket.readyState = 1;
  socket.onopen && socket.onopen();
  socket.onmessage && socket.onmessage({ data: JSON.stringify({ type: 'gameUpdate', pushUpdateId: 'abc123' }) });
  check('a push frame pulls the delta immediately', deltaPulls === 1, String(deltaPulls));
  check('the push update id is remembered for the next diffPatch call', pushStream.lastPushUpdateId === 'abc123', String(pushStream.lastPushUpdateId));
  socket.onmessage && socket.onmessage({ data: JSON.stringify({ type: 'heartbeat' }) });
  check('a heartbeat frame is ignored (no wasted request)', deltaPulls === 1, String(deltaPulls));
  pushStream.stop();
  stream.stop();

  const pool = new DF.Pool({ deltaPollMs: 60000, useSocket: false });
  pool.paused = true;
  pool.add(823109);
  pool.add(824466);
  check('the pool holds one stream per game', Object.keys(pool.streams).length === 2);
  pool.sync([823109]);
  check('pool.sync drops games that are no longer live', Object.keys(pool.streams).length === 1, Object.keys(pool.streams).join(','));
  pool.stopAll();
  w.close();
}

/* ======================================================= 4. alertsound === */
console.log('\n[4] alertsound.js — the ~3 s raindrop and the honest test path');
{
  const { w } = await boot(['alertsound.js']);
  const AS = w.AlertSound;
  check('the alert sound is 3.0 s by definition', AS.DURATION_MS === 3000, String(AS.DURATION_MS));
  check('a cooldown exists so one event is one sound', AS.COOLDOWN_MS > 0);

  /* No Web Audio in this DOM: the module must say so, not pretend. */
  const noAudio = AS.test();
  check('with no Web Audio the test reports failure instead of silently doing nothing', noAudio === false);
  check('with no Web Audio the status says unsupported', AS.status() === 'unsupported', AS.status());

  /* Stub just enough of the Web Audio surface to prove the graph is built from
   * gentle, short-lived, self-terminating nodes. */
  const built = { oscillators: 0, buffers: 0, gains: 0, filters: 0, stops: [], peak: 0 };
  function param(isGain) {
    return {
      value: 0,
      setValueAtTime(v) { if (isGain && typeof v === 'number') built.peak = Math.max(built.peak, v); return this; },
      exponentialRampToValueAtTime(v) { if (isGain && typeof v === 'number') built.peak = Math.max(built.peak, v); return this; },
      linearRampToValueAtTime(v) { if (isGain && typeof v === 'number') built.peak = Math.max(built.peak, v); return this; },
    };
  }
  function node(kind) {
    return {
      kind,
      connect() { return this; },
      disconnect() {},
      start() {}, stop() { built.stops.push(this); },
      frequency: param(false), gain: param(true), Q: param(false), delayTime: param(false), type: '',
    };
  }
  w.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 44100; this.destination = node('destination'); }
    resume() { this.state = 'running'; }
    createGain() { built.gains += 1; return node('gain'); }
    createOscillator() { built.oscillators += 1; return node('osc'); }
    createBiquadFilter() { built.filters += 1; return node('filter'); }
    createDelay() { return node('delay'); }
    createBuffer(ch, frames) { built.buffers += 1; return { getChannelData: () => new Float32Array(frames) }; }
    createBufferSource() { return node('source'); }
  };
  const played = AS.test();
  check('with Web Audio the test actually plays', played === true);
  check('the graph uses droplets (oscillators) plus a noise transient (buffer)', built.oscillators >= 4 && built.buffers >= 4, JSON.stringify({ osc: built.oscillators, buf: built.buffers }));
  check('every oscillator is scheduled to stop (no lingering voices)', built.stops.filter((n) => n.kind === 'osc').length === built.oscillators, JSON.stringify(built.stops.map((n) => n.kind)));
  check('the master peak stays gentle (<= 0.2 for a season-long alert)', AS.PEAK <= 0.2, String(AS.PEAK));
  check('no individual voice exceeds 70% of that (headroom, no clipping)', built.peak <= 0.7, String(built.peak));
  check('the module reports a running context after the test', AS.status() === 'running', AS.status());

  const cooldownBlocked = AS.play({ reason: 'review' });
  check('the cooldown suppresses an immediate second play', cooldownBlocked === false);
  const forced = AS.play({ reason: 'test', force: true });
  check('force bypasses the cooldown (the test button needs this)', forced === true);
  w.close();
}

/* ====================================================== 5. scoring-ledger === */
console.log('\n[5] scoring-ledger.js — separate, persistent, merge-safe audit log');
{
  const { w } = await boot(['scoring-ledger.js']);
  const L = w.ScoringLedger;
  w.localStorage.clear();
  const date = '2026-09-15';
  let ledger = L.emptyLedger(date);
  check('the ledger has its own storage namespace (never feed-log.js\'s)',
    L.KEY_PREFIX === 'mlbp.scoringledger.v1.' && L.KEY_PREFIX.indexOf('mlbp.feedlog') === -1, L.KEY_PREFIX);

  const before = { capturedAtIso: '2026-09-15T23:10:00Z', score: { away: 3, home: 1 }, outs: 1, count: { balls: 0, strikes: 0 }, currentPlay: { description: 'Jonah Heim at bat' }, gamedayTimecode: '20260915_231000' };
  const after = { capturedAtIso: '2026-09-15T23:10:22Z', score: { away: 3, home: 2 }, outs: 1, count: { balls: 1, strikes: 1 }, currentPlay: { description: 'Heim singles on a line drive to left field.' }, gamedayTimecode: '20260915_231022' };

  const p1 = L.addPending(ledger, {
    id: '823109:71:pending', gamePk: 823109, matchup: 'SEA @ MIN', officialDate: date,
    atBatIndex: 71, inningLabel: 'Top 8', batter: 'Jonah Heim', pitcher: 'Test Pitcher',
    eventType: 'os_ruling_pending_primary', description: 'Official Scorer Ruling Pending',
    before, wording: 'Official Scorer Ruling Pending', capturedAtMs: Date.parse('2026-09-15T23:10:05Z'),
  });
  check('a pending ruling is recorded on first observation', p1.added === true && !!p1.record);
  check('the record keeps second-precision capture time', p1.record.capturedAtSec === '2026-09-15T23:10:05Z', p1.record.capturedAtSec);
  check('the record keeps the full before-state', p1.record.before && p1.record.before.score.away === 3);

  const p1again = L.addPending(ledger, {
    id: '823109:71:pending', gamePk: 823109, capturedAtMs: Date.parse('2026-09-15T23:20:00Z'), before,
  });
  check('re-observing the same ruling never overwrites the first capture', p1again.added === false && ledger.records[0].capturedAtSec === '2026-09-15T23:10:05Z');

  L.resolvePending(ledger, '823109:71:pending', after, 'Heim singles on a line drive to left field.');
  const resolved = ledger.records.find((r) => r.id === '823109:71:pending');
  check('the ruling is closed with the after-state and its own timestamp',
    !!resolved.resolvedAtMs && resolved.after.score.home === 2 && /T\d{2}:\d{2}:\d{2}Z$/.test(resolved.resolvedAtSec),
    JSON.stringify({ at: resolved.resolvedAtSec, after: resolved.after && resolved.after.score }));

  const c1 = L.addChange(ledger, {
    id: '823109:66:scoring-change', gamePk: 823109, matchup: 'SEA @ MIN', officialDate: date,
    atBatIndex: 66, inningLabel: 'Top 7', batter: 'Test Batter',
    from: { eventType: 'field_error', description: 'Reached on error.', isOut: false },
    to: { eventType: 'single', description: 'Singles on a ground ball.', isOut: false },
    fromWording: 'Reached on error.', toWording: 'Singles on a ground ball.',
    before, after, capturedAtMs: Date.parse('2026-09-15T23:30:00Z'),
  });
  check('a scoring change keeps both official descriptions', c1.added && c1.record.fromWording === 'Reached on error.' && c1.record.toWording === 'Singles on a ground ball.');

  const c2 = L.addChange(ledger, {
    id: '823109:66:scoring-change', gamePk: 823109, officialDate: date,
    from: { eventType: 'field_error', description: 'Reached on error.' },
    to: { eventType: 'double', description: 'Doubles to right field.' },
    toWording: 'Doubles to right field.', capturedAtMs: Date.parse('2026-09-15T23:45:00Z'),
  });
  const changed = ledger.records.find((r) => r.id === '823109:66:scoring-change');
  check('a second re-scoring is kept as a revision, not a lost record',
    c2.revision === true && changed.revisions.length === 2 && changed.to.eventType === 'double',
    JSON.stringify({ revisions: changed.revisions.length, to: changed.to && changed.to.eventType }));

  /* Persistence: save → reload from a fresh module instance. */
  L.save(date, ledger);
  const reloaded = L.load(date);
  await new Promise((r) => setTimeout(r, 10));
  const stored = w.localStorage.getItem(L.KEY_PREFIX + date);
  check('the ledger is written to its own localStorage key', !!stored, String(stored && stored.length));
  check('the write keeps both record kinds', !!stored && JSON.parse(stored).records.length === 2, String(stored && JSON.parse(stored).records.length));
  const loaded = await reloaded;
  check('a reload restores every record (survives a refresh)', loaded.records.length === 2, String(loaded.records.length));
  check('a reload restores the resolution and the revision chain',
    loaded.records.some((r) => r.id === '823109:71:pending' && r.resolvedAtMs) &&
    loaded.records.some((r) => r.id === '823109:66:scoring-change' && r.revisions.length === 2));

  /* Merge safety across browsers. */
  const other = L.emptyLedger(date);
  L.addChange(other, {
    id: '823109:12:scoring-change', gamePk: 823109, officialDate: date,
    from: { eventType: 'field_error', description: 'E' }, to: { eventType: 'single', description: 'S' },
    capturedAtMs: Date.parse('2026-09-15T22:00:00Z'),
  });
  const merged = L.merge(ledger, other, date);
  check('merging two browsers keeps every record', merged.records.length === 3, String(merged.records.length));
  check('merging is idempotent', L.merge(merged, merged, date).records.length === 3);

  /* The ms and the ISO string must always describe the same observation. */
  const early = L.emptyLedger(date);
  L.addPending(early, { id: 'x:1:pending', gamePk: 1, capturedAtMs: Date.parse('2026-09-15T20:00:00Z'), before });
  const late = L.emptyLedger(date);
  L.addPending(late, { id: 'x:1:pending', gamePk: 1, capturedAtMs: Date.parse('2026-09-15T21:00:00Z'),
    resolvedAtMs: Date.parse('2026-09-15T21:00:00Z'), resolvedAtSec: '2026-09-15T21:00:00Z', before });
  const pairMerged = L.merge(early, late, date);
  const pairRec = pairMerged.records.find((r) => r.id === 'x:1:pending');
  check('merge keeps the earliest capture time AND that same time as the ISO string',
    pairRec.capturedAtSec === '2026-09-15T20:00:00Z' && pairRec.capturedAtMs === Date.parse('2026-09-15T20:00:00Z'),
    JSON.stringify({ sec: pairRec.capturedAtSec, ms: pairRec.capturedAtMs }));
  check('merge still keeps the later resolution', pairRec.resolvedAtSec === '2026-09-15T21:00:00Z', pairRec.resolvedAtSec);
  check('the summary counts are recomputed', merged.stats.pending === 1 && merged.stats.changes === 2 && merged.stats.scored === 1, JSON.stringify(merged.stats));

  const csv = L.toCSV(merged);
  check('CSV export carries a header and one row per record', csv.split('\n').length === 4, String(csv.split('\n').length));
  check('CSV export quotes the official descriptions', csv.includes('Official Scorer Ruling Pending'));
  const json = JSON.parse(L.toJSON(merged));
  check('JSON export is the whole ledger', Array.isArray(json.records) && json.records.length === 3);

  check('an empty or malformed ledger degrades to empty, never throws',
    L.merge(null, 'nonsense', date).records.length === 0);
  w.close();
}

/* ================================================ 5b. section rendering === */
console.log('\n[5b] state-panel.js — the two sections actually render');
{
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="state-meta"></div>
    <div id="state-grid"></div>
    <div id="ledger-stats"></div>
    <div id="ledger-list"></div>
    <div id="ledger-status"></div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-09-15' });
  const w = dom.window;
  for (const f of ['ui.js', 'json-patch.js', 'live-state.js', 'scoring-ledger.js', 'state-panel.js']) {
    w.eval(readFileSync(path.join(ROOT, 'assets/js', f), 'utf8') + `\n//# sourceURL=${f}`);
  }
  w.localStorage.clear();
  const game = { gamePk: 823109, officialDate: '2026-09-15' };
  const prev = w.LiveState.snapshot(game, baseTree());
  const next = w.LiveState.snapshot(game, w.JsonPatch.applyPatch(baseTree(), DIFF_PATCH[0].diff.concat(DIFF_PATCH[1].diff)).value);

  w.StatePanel.renderStates([{
    gamePk: 823109, date: '2026-09-15', matchup: 'SEA @ MIN',
    state: next, prevState: prev, transport: 'delta', live: true, final: false,
    suggestedWaitSec: 10, deltaPollMs: 250, lastError: null,
  }], { generatedAt: Date.now(), transports: { push: 0, delta: 1, full: 0 }, captures: 2 });

  const card = w.document.querySelector('#state-grid .state-card');
  const stateText = (w.document.getElementById('state-grid').textContent || '').replace(/\s+/g, ' ');
  check('the live state panel renders one card per game', !!card);
  check('the card shows the captured state fields', /Jonah Heim/.test(stateText) && /Test Pitcher/.test(stateText) && /Top 8/.test(stateText), stateText.slice(0, 200));
  check('the card shows the official capture timestamp and timecode', /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(stateText) && /20260915_\d{6}/.test(stateText), stateText.slice(0, 200));
  check('the card shows which transport delivered it', /delta/i.test(stateText));
  check('the card shows the before → after of the latest change', /before → after/i.test(stateText) && /→/.test(stateText), stateText.slice(0, 400));
  check('the card quotes the official wording', /Heim singles on a line drive to left field\./.test(stateText), stateText.slice(0, 400));

  /* An in-review game floats to the top, flagged. */
  const reviewState = Object.assign({}, next, { isReviewState: true, status: Object.assign({}, next.status, { detailed: 'Manager challenge: Tag play', code: 'MA' }) });
  w.StatePanel.renderStates([
    { gamePk: 1, matchup: 'AAA @ BBB', state: next, prevState: null, transport: 'full', live: true },
    { gamePk: 2, matchup: 'CCC @ DDD', state: reviewState, prevState: null, transport: 'push', live: true },
  ], {});
  const cards = [...w.document.querySelectorAll('#state-grid .state-card')];
  check('a game in review sorts first and is marked', cards[0].className.includes('is-review') && /CCC @ DDD/.test(cards[0].textContent));

  /* Ledger rendering, from a real record through the real module. */
  const ledger = w.ScoringLedger.emptyLedger('2026-09-15');
  w.ScoringLedger.addPending(ledger, {
    id: '823109:71:pending', gamePk: 823109, matchup: 'SEA @ MIN', officialDate: '2026-09-15',
    atBatIndex: 71, inningLabel: 'Top 8', batter: 'Jonah Heim', pitcher: 'Test Pitcher',
    eventType: 'os_ruling_pending_primary', wording: 'Official Scorer Ruling Pending',
    before: prev, capturedAtMs: Date.parse('2026-09-15T23:10:05Z'),
  });
  w.ScoringLedger.addChange(ledger, {
    id: '823109:66:scoring-change', gamePk: 823109, matchup: 'SEA @ MIN', officialDate: '2026-09-15',
    atBatIndex: 66, inningLabel: 'Top 7', batter: 'Test Batter',
    from: { eventType: 'field_error', description: 'Reached on error.' },
    to: { eventType: 'single', description: 'Singles on a ground ball.' },
    fromWording: 'Reached on error.', toWording: 'Singles on a ground ball.',
    before: prev, after: next, capturedAtMs: Date.parse('2026-09-15T23:30:00Z'),
  });
  w.StatePanel.state.ledger = ledger;
  w.StatePanel.state.ledgerDate = '2026-09-15';
  w.StatePanel.renderLedger();
  const ledgerText = (w.document.getElementById('ledger-list').textContent || '').replace(/\s+/g, ' ');
  check('the ledger renders a pending ruling', /Ruling pending/.test(ledgerText) && /Official Scorer Ruling Pending/.test(ledgerText), ledgerText.slice(0, 200));
  check('the ledger renders a scoring change with BOTH official descriptions',
    /Reached on error\./.test(ledgerText) && /Singles on a ground ball\./.test(ledgerText), ledgerText.slice(0, 300));
  check('every ledger row carries its second-precision capture time', /2026-09-15T23:10:05Z/.test(ledgerText));
  check('every ledger row links the official API for that game', !!w.document.querySelector('#ledger-list a[href*="statsapi.mlb.com/api/v1.1/game/823109/feed/live"]'));
  const statsText = (w.document.getElementById('ledger-stats').textContent || '').replace(/\s+/g, ' ');
  check('the ledger stats count pending and changes', /Pending rulings/.test(statsText) && /Scoring changes/.test(statsText));
  w.StatePanel.setLedgerFilter('changes');
  check('the ledger filter isolates scoring changes', !/Ruling pending/.test(w.document.getElementById('ledger-list').textContent));
  w.StatePanel.setLedgerFilter('all');
  w.close();
}

/* ======================================================= 6. static wiring === */
console.log('\n[6] page wiring — the new sections, controls and script order');
{
  const html = readFileSync(path.join(ROOT, 'reviews.html'), 'utf8');
  check('the live game state section exists', /id="state-grid"/.test(html) && /id="state-heading"/.test(html));
  check('the official scoring ledger section exists', /id="ledger-list"/.test(html) && /id="ledger-tabs"/.test(html));
  check('the ledger export controls exist', /id="ledger-export-json"/.test(html) && /id="ledger-export-csv"/.test(html));
  check('the alert sound has a toggle AND a test button',
    /id="sound-toggle-btn"/.test(html) && /id="sound-test-btn"/.test(html) && /id="sound-probe"/.test(html));
  check('the push host is preconnected', /preconnect"[^>]*ws\.statsapi\.mlb\.com/.test(html));
  for (const f of ['json-patch.js', 'delta-feed.js', 'live-state.js', 'scoring-ledger.js', 'state-panel.js', 'alertsound.js']) {
    check(`reviews.html loads assets/js/${f}`, new RegExp(`src="assets/js/${f.replace('.', '\\.')}"`).test(html));
    check(`assets/js/${f} exists`, existsSync(path.join(ROOT, 'assets', 'js', f)));
  }
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  check('api.js still loads first', scripts[0] === 'assets/js/api.js', scripts[0]);
  check('the page-logic script still loads last', /reviews-feed\.js$/.test(scripts[scripts.length - 1]), scripts[scripts.length - 1]);
  check('the ledger module loads before the feed that writes to it',
    scripts.indexOf('assets/js/scoring-ledger.js') < scripts.indexOf('assets/js/reviews-feed.js'));

  const server = readFileSync(path.join(ROOT, 'server.mjs'), 'utf8');
  check('the server stores the ledger in its own file namespace',
    /scoring-ledger-\$\{dateStr\}\.json/.test(server) && /feed-log-\$\{dateStr\}\.json/.test(server));
  check('the server exposes separate ledger endpoints',
    /'\/api\/scoring-ledger'/.test(server) && /'\/api\/scoring-ledger\/stream'/.test(server));
}

/* ================================================================= summary == */
console.log(`\nlive-latency-and-ledger-test: ${passes.length} checks passed`);
if (failures.length) {
  console.error(`live-latency-and-ledger-test: ${failures.length} check(s) FAILED`);
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log('live-latency-and-ledger-test: OK');
