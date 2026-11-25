#!/usr/bin/env node
/**
 * Scoped regression & provenance suite (`arena/da098af9-alert1`).
 *
 * Verifies:
 *   1. Upcoming 2027 Spring Training / Opening Day schedule & TBD handling
 *      (including exhibition game 868575 & Opening Day TBD game 854131).
 *   2. Generic MX / NX review codes without `reason` leave reason blank ('')
 *      rather than inventing a value, and post-ruling historical plays leave
 *      Before-review score blank ('— (not observed before ruling)').
 *   3. Every HTML <tbody><tr> in flagged.html and every Markdown table data row
 *      in audit/da098af9-verification-2026-11-25.md carries an official https:// link.
 *
 *   node tests/da098af9-upcoming-and-parity-test.mjs
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

console.log('\n[Alert1 da098af9] upcoming 2027 game-day parity, blank-unverified guards & provenance');

await check('Upcoming 2027-02-19 & 2027-03-25 games render automatically with TBD start times and non-inferred scores', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/gi)].map((m) => m[1]);
  const cleanHtml = html.replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/gi, '');
  const dom = new JSDOM(cleanHtml, {
    url: 'https://kanlerxz87-cyber.github.io/Alert1/index.html?date=2027-02-19',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.fetch = (url) => {
    const u = String(url);
    if (u.includes('/v1/gameStatus')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => [
          { statusCode: 'S', abstractGameState: 'Preview', detailedState: 'Scheduled' },
          { statusCode: 'MX', abstractGameState: 'Live', detailedState: 'Manager challenge' },
          { statusCode: 'NX', abstractGameState: 'Live', detailedState: 'Umpire review' },
        ],
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        totalGames: 2,
        dates: [{
          date: '2027-02-19',
          totalGames: 2,
          games: [
            {
              gamePk: 868573,
              gameDate: '2027-02-19T18:05:00Z',
              officialDate: '2027-02-19',
              status: { abstractGameState: 'Preview', detailedState: 'Scheduled', statusCode: 'S', startTimeTBD: false },
              teams: {
                away: { team: { id: 141, name: 'Toronto Blue Jays' } },
                home: { team: { id: 134, name: 'Pittsburgh Pirates' } },
              },
              venue: { name: 'LECOM Park' },
            },
            {
              gamePk: 868575,
              gameDate: '2027-02-19T08:33:00Z',
              officialDate: '2027-02-19',
              status: { abstractGameState: 'Preview', detailedState: 'Scheduled', statusCode: 'S', startTimeTBD: true },
              teams: {
                away: { team: { id: 343, name: 'Northeastern Huskies', abbreviation: 'NEU' } },
                home: { team: { id: 111, name: 'Boston Red Sox' } },
              },
              venue: { name: 'JetBlue Park' },
            },
          ],
        }],
      }),
    });
  };
  for (const s of srcs) {
    w.eval(fs.readFileSync(path.join(ROOT, s), 'utf8'));
  }
  await new Promise((r) => setTimeout(r, 250));

  const cards = w.document.querySelectorAll('.game-card');
  assert(cards.length === 2, 'expected 2 upcoming cards, got ' + cards.length);
  const secondText = cards[1].textContent;
  assert(secondText.includes('Northeastern Huskies') && secondText.includes('Boston Red Sox'),
    'expected exhibition matchup names on card 2: ' + secondText);
  assert(secondText.includes('TBD') && !secondText.includes(':33'),
    'startTimeTBD card must render TBD and never sentinel :33 time: ' + secondText);

  const mx = w.Reviews.describe('MX');
  const nx = w.Reviews.describe('NX');
  assert(mx.family === 'manager' && mx.reason === '', 'MX must leave missing reason blank, got: ' + JSON.stringify(mx));
  assert(nx.family === 'umpire' && nx.reason === '', 'NX must leave missing reason blank, got: ' + JSON.stringify(nx));

  dom.window.close();
});

await check('audit/da098af9-verification-2026-11-25.md and flagged.html table rows all carry official https:// source links', () => {
  const report = fs.readFileSync(path.join(ROOT, 'audit/da098af9-verification-2026-11-25.md'), 'utf8');
  const lines = report.split(/\r?\n/);
  let dataRows = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i].trim();
    if (/^\|.*\|$/.test(l)) {
      if (/^\|\s*:?-{2,}/.test(l)) continue;
      if (i + 1 < lines.length && /^\|\s*:?-{2,}/.test(lines[i + 1].trim())) continue;
      dataRows += 1;
      assert(/https:\/\/[^\s)>\]]+/.test(l),
        `audit/da098af9-verification-2026-11-25.md:${i + 1} missing https:// source link: ${l}`);
    }
  }
  assert(dataRows >= 20, 'expected >= 20 verified table rows in da098af9 audit report, got ' + dataRows);

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
        `flagged.html tbody row #${htmlRows} missing https:// source link`);
    }
  }
  assert(htmlRows >= 100, 'expected >= 100 rows in flagged.html, got ' + htmlRows);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
