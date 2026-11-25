#!/usr/bin/env node
/**
 * Alert1 static-host FeedLog guard, upcoming-game-day jump, and table-row
 * official-source provenance verification (`arena/fae80285-alert1`).
 *
 *   node tests/alert1-feedlog-and-provenance-test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed += 1;
    console.error('  ✗ ' + name + '\n    ' + (err && err.stack ? err.stack : err));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

console.log('\n[Alert1 fae80285] static-host FeedLog guard, upcoming-date jump & table provenance');

await check('FeedLog.openStream and FeedLog.save never hit /api/feed-log* on *.github.io', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://kanlerxz87-cyber.github.io/Alert1/index.html?date=2027-03-25',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  let eventSourceCalls = 0;
  let apiFetchCalls = 0;
  w.EventSource = function () {
    eventSourceCalls += 1;
    return { addEventListener() {}, close() {} };
  };
  w.fetch = (url) => {
    if (String(url).includes('/api/feed-log')) apiFetchCalls += 1;
    return Promise.resolve({ ok: false, status: 404, json: async () => null });
  };
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/js/feed-log.js'), 'utf8'));

  const stream = w.FeedLog.openStream('2027-03-25');
  assert(stream === null, 'openStream must return null on *.github.io');
  assert(eventSourceCalls === 0, 'EventSource must not be constructed on *.github.io');

  await w.FeedLog.load('2027-03-25');
  w.FeedLog.save('2027-03-25', { date: '2027-03-25', entries: [{ id: '854131:0:p:MA', firstSeen: 1, lastSeen: 1 }] });
  await new Promise((r) => setTimeout(r, 1150));
  assert(apiFetchCalls === 0, 'save/postNow must not POST /api/feed-log on *.github.io (got ' + apiFetchCalls + ')');
  dom.window.close();
});

await check('FeedLog.openStream still opens SSE when hosted on localhost (server.mjs)', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost:8000/index.html?date=2026-08-26',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  let openedUrl = null;
  w.EventSource = function (u) {
    openedUrl = u;
    return { addEventListener() {}, close() {} };
  };
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/js/feed-log.js'), 'utf8'));
  const stream = w.FeedLog.openStream('2026-08-26');
  assert(stream !== null && openedUrl === '/api/feed-log/stream?date=2026-08-26',
    'localhost must still open SSE stream, got ' + openedUrl);
  w.FeedLog.closeStream();
  dom.window.close();
});

await check('Offseason empty slate offers both Most recent date and Next scheduled game day (index.html & reviews.html)', async () => {
  const scriptsFor = (pageFile) => {
    const html = fs.readFileSync(path.join(ROOT, pageFile), 'utf8');
    const srcs = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/gi)].map((m) => m[1]);
    const cleanHtml = html.replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/gi, '');
    const dom = new JSDOM(cleanHtml, {
      url: `https://kanlerxz87-cyber.github.io/Alert1/${pageFile}?date=2026-11-25`,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const w = dom.window;
    w.EventSource = function () { throw new Error('EventSource should not fire on github.io'); };
    let rangeCalls = 0;
    w.fetch = (url) => {
      const u = String(url);
      if (u.includes('startDate=')) {
        rangeCalls += 1;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            dates: [
              { date: '2026-10-28', totalGames: 1 },
              { date: '2027-02-19', totalGames: 17 },
              { date: '2027-03-25', totalGames: 14 },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ totalGames: 0, dates: [] }),
      });
    };
    for (const s of srcs) {
      w.eval(fs.readFileSync(path.join(ROOT, s), 'utf8'));
    }
    return { dom, getRangeCalls: () => rangeCalls };
  };

  const sb = scriptsFor('index.html');
  await new Promise((r) => setTimeout(r, 350));
  assert(sb.getRangeCalls() === 1, 'index.html should issue exactly 1 scheduleRange query, got ' + sb.getRangeCalls());
  assert(sb.dom.window.Scoreboard.state.lastGameDate === '2026-10-28', 'expected lastGameDate 2026-10-28');
  assert(sb.dom.window.Scoreboard.state.nextGameDate === '2027-02-19', 'expected nextGameDate 2027-02-19');
  const sbText = sb.dom.window.document.getElementById('game-list').textContent;
  assert(/Most recent date with games/.test(sbText) && /Next scheduled game day/.test(sbText),
    'index.html must offer both recent and upcoming game days: ' + sbText);
  sb.dom.window.close();

  const rf = scriptsFor('reviews.html');
  await new Promise((r) => setTimeout(r, 350));
  assert(rf.getRangeCalls() === 1, 'reviews.html should issue exactly 1 scheduleRange query, got ' + rf.getRangeCalls());
  assert(rf.dom.window.ReplayFeed.state.lastGameDate === '2026-10-28', 'reviews.html expected lastGameDate 2026-10-28');
  assert(rf.dom.window.ReplayFeed.state.nextGameDate === '2027-02-19', 'reviews.html expected nextGameDate 2027-02-19');
  const rfText = rf.dom.window.document.getElementById('feed-list').textContent;
  assert(/Most recent date with games/.test(rfText) && /Next scheduled game day/.test(rfText),
    'reviews.html must offer both recent and upcoming game days: ' + rfText);
  rf.dom.window.close();
});

await check('Every table row in flagged.html and active Alert1 documentation/audit tables has an official https:// source link', () => {
  const flaggedHtml = fs.readFileSync(path.join(ROOT, 'flagged.html'), 'utf8');
  const tbodyRe = /<tbody[^>]*>([\s\S]*?)<\/tbody>/gi;
  let m;
  let htmlRows = 0;
  while ((m = tbodyRe.exec(flaggedHtml))) {
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(m[1]))) {
      htmlRows += 1;
      assert(/href="https:\/\/[^"]+"/i.test(tr[1]),
        `flagged.html tbody row #${htmlRows} is missing an https:// source link`);
    }
  }
  assert(htmlRows >= 100, 'expected >= 100 rows in flagged.html, got ' + htmlRows);

  const mdFiles = [
    'README.md',
    'COORDINATION.md',
    'docs/statsapi-field-map.md',
    'docs/verification-report.md',
    'tests/README.md',
    'audit/reference-replay-comparison.md',
    'audit/reference-parity-2026-11-22.md',
    'audit/alert1-live-verification-2026-11-25.md',
    'audit/alert1-reverify-2026-11-25-e9936287.md',
    'audit/alert1-verification-0eea8c12.md',
    'audit/36284656-pages-delivery-verification.md',
    'audit/62e7077f-independent-verification.md',
    'audit/alert1-session-15b89941-verification.md',
    'audit/alert1-copy-verification-2026-11-25-0d7dbc14.md',
    'audit/5e124cc4-verification.md',
    'audit/da098af9-verification-2026-11-25.md',
  ];
  for (const rel of mdFiles) {
    const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lines = txt.split(/\r?\n/);
    let inCode = false;
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i].trim();
      if (/^```/.test(l)) { inCode = !inCode; continue; }
      if (inCode) continue;
      if (/^\|.*\|$/.test(l)) {
        if (/^\|\s*:?-{2,}/.test(l)) continue;
        if (i + 1 < lines.length && /^\|\s*:?-{2,}/.test(lines[i + 1].trim())) continue;
        assert(/https:\/\/[^\s)>\]]+/.test(l),
          `${rel}:${i + 1} table data row is missing an official https:// source link: ${l}`);
      }
    }
  }
});

await check('UI.abbr preserves official abbreviation for non-MLB Spring Training opponents (868575 NEU @ BOS)', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://kanlerxz87-cyber.github.io/Alert1/index.html?date=2027-02-19',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/js/ui.js'), 'utf8'));
  assert(w.UI.abbr({ id: 343, name: 'Northeastern Huskies', abbreviation: 'NEU' }) === 'NEU',
    'non-MLB exhibition team with official abbreviation should resolve to NEU');
  assert(w.UI.abbr({ team: { id: 343, name: 'Northeastern Huskies', abbreviation: 'NEU' } }) === 'NEU',
    'nested schedule team object with official abbreviation should resolve to NEU');
  assert(w.UI.abbr({ id: 111, name: 'Boston Red Sox', abbreviation: 'IGN' }) === 'BOS',
    'MLB 30-club registry TEAM_ABBR must remain authoritative for MLB teams');
  assert(w.UI.abbr({ id: 999999, name: 'Mystery Team' }) === 'MYS',
    'unknown team without abbreviation falls back to 3-letter prefix');
  dom.window.close();
});

await check('Scoreboard.init issues a single initial schedule poll and ignores stale sweep responses across setDate', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/gi)].map((m) => m[1]);
  const cleanHtml = html.replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/gi, '');
  const dom = new JSDOM(cleanHtml, {
    url: 'https://kanlerxz87-cyber.github.io/Alert1/index.html?date=2027-02-19',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.EventSource = function () { throw new Error('EventSource should not fire on github.io'); };
  let schedCalls = 0;
  let resolveSweep = null;
  w.fetch = (url) => {
    const u = String(url);
    if (u.includes('fields=dates%2Cgames%2CgamePk')) {
      return new Promise((resolve) => {
        resolveSweep = () => resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            dates: [{
              date: '2026-08-26',
              games: [{ gamePk: 823180, status: { abstractGameState: 'Live', statusCode: 'MA', reason: 'Tag play' } }],
            }],
          }),
        });
      });
    }
    if (u.includes('date=2027-02-19')) {
      schedCalls += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          dates: [{
            date: '2027-02-19',
            games: [{
              gamePk: 868575,
              gameDate: '2027-02-19T18:05:00Z',
              status: { abstractGameState: 'Preview', detailedState: 'Scheduled', statusCode: 'S', startTimeTBD: false },
              teams: {
                away: { team: { id: 343, name: 'Northeastern Huskies', abbreviation: 'NEU' } },
                home: { team: { id: 111, name: 'Boston Red Sox' } },
              },
            }],
          }],
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        dates: [{
          date: '2026-08-26',
          games: [{
            gamePk: 823180,
            gameDate: '2026-08-26T19:45:00Z',
            status: { abstractGameState: 'Live', detailedState: 'In Progress', statusCode: 'I' },
            teams: {
              away: { team: { id: 113, name: 'Cincinnati Reds' } },
              home: { team: { id: 137, name: 'San Francisco Giants' } },
            },
          }],
        }],
      }),
    });
  };
  for (const s of srcs) {
    w.eval(fs.readFileSync(path.join(ROOT, s), 'utf8'));
  }
  await new Promise((r) => setTimeout(r, 650));
  assert(schedCalls === 1, 'initial Preview load must issue 1 schedule call within 650ms, got ' + schedCalls);

  // Switch to a live date, wait for sweep to start, then immediately switch back before sweep resolves.
  w.Scoreboard.setDate('2026-08-26');
  await new Promise((r) => setTimeout(r, 160));
  w.Scoreboard.setDate('2027-02-19');
  if (resolveSweep) resolveSweep();
  await new Promise((r) => setTimeout(r, 50));
  assert(!w.Scoreboard.state.reviewByPk[823180], 'stale sweep response must not pollute new date reviewByPk');
  dom.window.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
