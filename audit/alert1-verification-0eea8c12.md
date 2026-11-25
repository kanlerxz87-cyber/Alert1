# Alert1 independent verification — session `0eea8c12` (2026-11-25)

Independent re-verification of the copy of [LIVPBP @ `5c02527`](https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3)
running at https://kanlerxz87-cyber.github.io/Alert1/ against the reference
https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26 and the
official MLB StatsAPI. Every table row below carries its official source link;
values that could not be confirmed are left blank and flagged in §6.

## 1. Upstream copy parity (byte-level, git blob hashes)

Upstream HEAD is still `5c02527` (no newer upstream commit to copy):
https://github.com/snapquast73-boop/LIVPBP/commits — so this repo is already at
the latest upstream revision. File-by-file blob comparison against the upstream
tree https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3 :

| File | Upstream blob | Alert1 blob | Verdict | Official source |
|---|---|---|---|---|
| `index.html`, `game.html`, `reviews.html`, `assets/css/style.css`, `assets/js/api.js`, `assets/js/ui.js`, `assets/js/props.js`, `server.mjs`, `LICENSE`, `.gitignore`, `.nojekyll`, `docs/statsapi-field-map.md`, `audit/reference-replay-comparison.md`, `tests/contract-check.mjs`, `tests/run-all.mjs`, `tests/pages-delivery.mjs`, `tools/restoration-check.mjs`, `package-lock.json`, `tests/fixtures/*` (19 files) | — | — | IDENTICAL to upstream `5c02527` | https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3 |
| `assets/js/reviews.js` | `54ced642` | `3814f860` | DIFFERS — `numOrNull` null/empty guard (session `df7b58c1`, §14) | https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/reviews.js |
| `assets/js/feed-log.js` | `230a191e` | `734114bc` | DIFFERS — static-host `isStaticHost()` guard (session `fae80285`) | https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/feed-log.js |
| `assets/js/scoreboard.js` | `60243cb6` | `1822d5fc` | DIFFERS — `startTimeTBD`→`TBD`, `scheduleLoaded`, upcoming-date jump (sessions `df7b58c1`, `fae80285`) | https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/scoreboard.js |
| `assets/js/game.js` | `1684d781` | `f7ac4109` | DIFFERS — `startTimeTBD`→`TBD`, Live-only 125 ms watcher (session `df7b58c1`) | https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/game.js |
| `assets/js/reviews-feed.js` | `416d423e` | `fef29481` | DIFFERS — `officialDate` stamping, non-live scan backoff, upcoming-date jump (sessions `df7b58c1`, `fae80285`) | https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/reviews-feed.js |
| `404.html` | `8a85d3ec` | `103dcab1` | DIFFERS — `/LIVPBP/`→`/Alert1/` base path; `document.write`→`createElement('base')` | https://github.com/kanlerxz87-cyber/Alert1/blob/main/404.html |
| `.github/workflows/site-check.yml` | `0707a74b` | `245944e8` | DIFFERS — adds `run-all.mjs`, `props-provenance-test.mjs`, `alert1-feedlog-and-provenance-test.mjs` steps | https://github.com/kanlerxz87-cyber/Alert1/blob/main/.github/workflows/site-check.yml |
| `.github/workflows/pages-delivery.yml` | `f4be98f4` | `0981b3e5` | DIFFERS — removes pre-deployment `pull_request` trigger (failed before initial Pages deploy) | https://github.com/kanlerxz87-cyber/Alert1/blob/main/.github/workflows/pages-delivery.yml |
| `tests/jsdom-render-test.mjs`, `tests/link-check.mjs`, `tests/props-provenance-test.mjs`, `package.json`, `tests/README.md` | — | — | DIFFERS — only `LIVPBP`→`Alert1` URL updates | https://github.com/kanlerxz87-cyber/Alert1/blob/main/package.json |
| `flagged.html`, `README.md`, `docs/verification-report.md`, `COORDINATION.md`, `audit/reference-parity-2026-11-22.md`, `tools/smoke-test.mjs` | — | — | DIFFERS — verification records, flagged irregularities, regression tests (§§8–9, §12–14) | https://github.com/kanlerxz87-cyber/Alert1/blob/main/flagged.html |
| `audit/alert1-live-verification-2026-11-25.md`, `audit/upstream-coordination.md`, `tests/alert1-feedlog-and-provenance-test.mjs` | — | — | ADDED in Alert1 (prior sessions) | https://github.com/kanlerxz87-cyber/Alert1/blob/main/audit/alert1-live-verification-2026-11-25.md |

No file is missing from the upstream tree, and no upstream file was deleted.
The five differing JS files contain only the previously verified fixes; no new
JS defects were found in this pass, so no JS was changed.

## 2. Live reference parity — `reviews.html?date=2026-08-26`

Fetched both deployments live on 2026-11-25 (reference first, then Alert1):

| Check | Reference (LIVPBP) | Alert1 | Official source |
|---|---|---|---|
| Feed summary counts | 10 Reviews · 8 Challenges · 2 Umpire · 68 ABS · 1 Boundary · 0 Under review · 1 Runs at risk · 0 Scoring changes | identical | https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26 |
| Slate size / tracked entries | 15 games · 78 tracked entries | identical (15 games · 78 tracked entries) | https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26 |
| All 10 non-ABS rows (matchup, inning, challenger, outcome, Actual-after score) | MIN@ATH 3–2, BAL@STL 7–1, TEX@CWS 0–0, COL@WSH 4–1, HOU@NYY 1–2 / 2–3 / 3–3, PHI@SEA 6–0, CIN@SF 3–6 / 10–9 | identical, row-for-row | https://statsapi.mlb.com/api/v1/game/823180/playByPlay |
| Every feed row links to official StatsAPI play-by-play | yes (`MLB API ↗` per row) | yes (same links) | https://statsapi.mlb.com/api/v1/game/823506/playByPlay |
| `game.html?gamePk=823180` (CIN@SF final) | — | Final 10–9, linescore + full PBP + review badges render | https://kanlerxz87-cyber.github.io/Alert1/game.html?gamePk=823180&date=2026-08-26 |

## 3. Official MLB StatsAPI schedule verification (fetched live this session)

| Date | Official `totalGames` | Site renders | Official source |
|---|---|---|---|
| `2026-08-26` (reference day) | 15 (incl. `823180`, `823096`, `822692`, `823506`, `824555`, `823015`, `824963`) | 15 games, 78 tracked entries, 10 non-ABS + 68 ABS | https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26&fields=dates,date,totalGames,games,gamePk,officialDate,status,teams,team,name |
| `2027-02-19` (Spring Training) | 17, `startTimeTBD: true` on `868344` (CLE@CIN) & `868575` (Northeastern@BOS) | 17 games, `TBD` on exactly those two | https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-02-19&fields=dates,date,totalGames,games,gamePk,gameDate,status,startTimeTBD,detailedState,teams,away,home,team,name |
| `2027-03-25` (Opening Day) | 14, `startTimeTBD: true` on `854131` (CLE@CHC), `852663` (COL@SF), `853388` (ATL@LAD) with dummy `:33Z` timestamps | 14 games, `TBD` on exactly those three; feed shows 0 tracked entries (no games played yet) | https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&fields=dates,date,totalGames,games,gamePk,gameDate,status,startTimeTBD,detailedState,teams,away,home,team,name |
| `2026-11-25` (today, offseason) | 0 games scheduled | Empty slate + `Most recent date with games: Wed Oct 28, 2026` + `Next scheduled game day: Fri Feb 19, 2027` jump buttons — no manual input needed | https://kanlerxz87-cyber.github.io/Alert1/?date=2026-11-25 |

## 4. Upcoming-day improvement over the reference (live-verified this session)

| Check | Reference (upstream code) | Alert1 (this copy) | Official source |
|---|---|---|---|
| `?date=2027-03-25` start times for `startTimeTBD` games | Renders bogus `4:33 AM` (`854131`) / `6:33 AM` (`852663`, `853388`) from MLB's dummy `:33Z` timestamps | Renders `TBD` for exactly those three games | https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&fields=dates,games,gamePk,gameDate,status,startTimeTBD |
| Offseason empty slate | Only `Most recent date` jump (upstream `[-180d, 0]` range) | Both `Most recent date` and `Next scheduled game day` jumps (`[-180d, +180d]` range) | https://kanlerxz87-cyber.github.io/Alert1/?date=2026-11-25 |

## 5. Offline suites (run this session, before any edit)

| Suite | Result | Official source |
|---|---|---|
| `npm test` (`tools/smoke-test.mjs`) | 69 passed, 0 failed | https://github.com/kanlerxz87-cyber/Alert1/blob/main/tools/smoke-test.mjs |
| `node tests/run-all.mjs` (syntax, 50 local links, 8 contracts, 47 jsdom) | PASS | https://github.com/kanlerxz87-cyber/Alert1/blob/main/tests/run-all.mjs |
| `node tests/props-provenance-test.mjs` | 5 passed, 0 failed | https://github.com/kanlerxz87-cyber/Alert1/blob/main/tests/props-provenance-test.mjs |
| `node tests/alert1-feedlog-and-provenance-test.mjs` | 4 passed, 0 failed | https://github.com/kanlerxz87-cyber/Alert1/blob/main/tests/alert1-feedlog-and-provenance-test.mjs |
| `node tools/restoration-check.mjs` (incl. `server.mjs` routes) | ALL CHECKS PASSED | https://github.com/kanlerxz87-cyber/Alert1/blob/main/tools/restoration-check.mjs |
| GitHub Pages status | `built` @ `e22ec1d`; `Site checks`, `pages build`, `Published Pages delivery` all `success` | https://github.com/kanlerxz87-cyber/Alert1/actions |

## 6. Irregularities found in this pass

| # | Irregularity | Official evidence | Disposition | Official source |
|---|---|---|---|---|
| H-2 | `v1.0.0-stable-checkpoint` tag exists only on upstream (`ffceec3`); `git ls-remote --tags origin` in Alert1 is empty, so README's `git reset --hard v1.0.0-stable-checkpoint` fails in this repo. `flagged.html` §3 row claims "Resolved" via the upstream tag link. | Upstream tag ref `refs/tags/v1.0.0-stable-checkpoint` → `ffceec3e9f24c870b160d40c40ec6d8144c0e47a`; Alert1 has no tags | Record corrected in README copy notice + `flagged.html` §18; tag NOT created/pushed (branch-only push rule) — flagged for user decision | https://github.com/snapquast73-boop/LIVPBP/tree/v1.0.0-stable-checkpoint |
| H-4 | Arena branch convention deviation (`arena/0eea8c12-alert1` instead of `session-<id>/<task>`) — inherited, unchanged | Branch note in `COORDINATION.md` | No action; published on `flagged.html` §18 | https://github.com/kanlerxz87-cyber/Alert1/blob/main/COORDINATION.md |

No other irregularities were found. No JS defects were found, so no site code
was changed in this pass — the copy already runs like the reference (and
better on upcoming `startTimeTBD` game days) with no manual input.
