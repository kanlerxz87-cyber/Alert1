# Session `36284656` — published Pages delivery and upcoming-game-day verification

Date: 2026-11-25 (UTC) · Branch: `arena/36284656-alert1` (base `e22ec1d`) · [Claim on the shared task board](https://github.com/kanlerxz87-cyber/Alert1/blob/main/COORDINATION.md)

Scope: H-1..H-3 only. This session did **not** edit site code, shared table data, navigation,
`flagged.html`, `docs/`, or `tests/`. It only adds this audit record and its own board entries.
Every value below was either read from the official source linked in the same row, or left blank
and flagged. Nothing is inferred.

## H-1 — Published revision, pages, assets and links

| # | Check | Observed value | Result | Source |
|---|---|---|---|---|
| H1-1 | GitHub Pages configuration | Source branch `main`, status `built`, URL `https://kanlerxz87-cyber.github.io/Alert1/` | PASS | [GitHub Pages API](https://api.github.com/repos/kanlerxz87-cyber/Alert1/pages) |
| H1-2 | Published build at time of check | Commit `e22ec1d7a308adcb92acc36faa1e88eb8bdb8bb8`, status `built` | PASS | [Latest Pages build API](https://api.github.com/repos/kanlerxz87-cyber/Alert1/pages/builds/latest) |
| H1-3 | Pages workflow for that commit | `pages build and deployment` run `45701664560` and `Published Pages delivery` run `45701737919` both `success`; `Site checks` run `45701665499` `success` | PASS | [Workflow runs](https://github.com/kanlerxz87-cyber/Alert1/actions) |
| H1-4 | Local static-reference integrity | 50 local `href`/`src` references resolved at first check; 52 after integrating PR #11; no broken local links | PASS | [Link checker](https://github.com/kanlerxz87-cyber/Alert1/blob/main/tests/link-check.mjs) |
| H1-5 | Published scoreboard page | Renders offseason empty state with “Most recent date with games: Wed Oct 28, 2026” and “Next scheduled game day: Fri Feb 19, 2027” | PASS | [Live scoreboard](https://kanlerxz87-cyber.github.io/Alert1/?verify=36284656) |
| H1-6 | Published replay feed page | `reviews.html?date=2026-08-26` renders 10 Reviews / 8 Challenges / 2 Umpire reviews / 68 ABS / 1 Boundary / 0 Under review / 1 Runs at risk / 0 Scoring changes, 15 games, 78 tracked entries | PASS | [Live replay feed](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26&verify=36284656) |
| H1-7 | Published game page | `game.html?gamePk=823180` renders the official Final 10–9 header and linescore rows with their source links | PASS | [Live game page](https://kanlerxz87-cyber.github.io/Alert1/game.html?gamePk=823180&verify=36284656) |
| H1-8 | Published Flagged for Review page | Renders with its source links (no missing asset or script) | PASS | [Live flagged page](https://kanlerxz87-cyber.github.io/Alert1/flagged.html?verify=36284656) |
| H1-9 | Published script asset | `assets/js/api.js` is served and readable from the published site | PASS | [Live api.js](https://kanlerxz87-cyber.github.io/Alert1/assets/js/api.js?verify=36284656) |
| H1-10 | Offline suite results | `npm test` 69/69, `tests/run-all.mjs` (50 local refs at first check, 52 after PR #11 / 8 bindings / 47 jsdom checks), `props-provenance-test.mjs` 5/5, `alert1-feedlog-and-provenance-test.mjs` 4/4, `tools/restoration-check.mjs` ALL CHECKS PASSED | PASS | [CI definition](https://github.com/kanlerxz87-cyber/Alert1/blob/main/.github/workflows/site-check.yml) |

## H-2 — Upcoming game days against the official schedule

| # | Date | Site value | Official MLB value | Result | Official source |
|---|---|---|---|---|---|
| H2-1 | `2026-11-25` (today) | “No games scheduled for Wed Nov 25, 2026” | Absent from the official date list; first listed date is `2027-02-19` | PASS | [Official schedule range](https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-11-25&endDate=2027-05-24&fields=dates,date,totalGames) |
| H2-2 | `2027-02-19` | 17 games on the live scoreboard; “Next scheduled game day” button opens this date | `totalGames: 17` | PASS | [Official schedule 2027-02-19](https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2027-02-19&endDate=2027-02-19&fields=dates,date,totalGames) |
| H2-3 | `2027-03-25` | 14 games on the live replay feed | `totalGames: 14` | PASS | [Official schedule 2027-03-25](https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2027-03-25&endDate=2027-03-25&fields=dates,date,totalGames) |
| H2-4 | `2026-08-26` reference vs copy | Both pages show 15 games, 10 Reviews, 8 Challenges, 2 Umpire reviews, 68 ABS, 1 Boundary, 0 Under review, 1 Runs at risk, 0 Scoring changes, 78 tracked entries | Identical counts on the reference replay page | PASS | [Reference replay page](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26&verify=36284656) · [Copy replay page](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26&verify=36284656) |

### Play-level score check for the 10 non-ABS replay rows

The replay page's “Actual after (official)” value was checked against `allPlays[].result.awayScore`
and `.homeScore` at the replay key's `atBatIndex` in the official StatsAPI `playByPlay` payload.
Only the after-score is recorded here; the “Before review” cell remains blank in the UI because
that score was not observed before the ruling (see irregularities).

| # | Replay key | Page value (away–home) | Official `awayScore`–`homeScore` | Result | Official source |
|---|---|---|---|---|---|
| H2-5 | `824963:34:p:MF` | 3–2 | 3–2 (`atBatIndex` 34) | PASS | [MLB StatsAPI game 824963](https://statsapi.mlb.com/api/v1/game/824963/playByPlay) |
| H2-6 | `823015:34:p:MF` | 7–1 | 7–1 (`atBatIndex` 34) | PASS | [MLB StatsAPI game 823015](https://statsapi.mlb.com/api/v1/game/823015/playByPlay) |
| H2-7 | `824555:2:7:MA` | 0–0 | 0–0 (`atBatIndex` 2) | PASS | [MLB StatsAPI game 824555](https://statsapi.mlb.com/api/v1/game/824555/playByPlay) |
| H2-8 | `822692:47:4:MA` | 4–1 | 4–1 (`atBatIndex` 47) | PASS | [MLB StatsAPI game 822692](https://statsapi.mlb.com/api/v1/game/822692/playByPlay) |
| H2-9 | `823506:19:5:NH` | 1–2 | 1–2 (`atBatIndex` 19) | PASS | [MLB StatsAPI game 823506](https://statsapi.mlb.com/api/v1/game/823506/playByPlay) |
| H2-10 | `823506:46:4:MA` | 2–3 | 2–3 (`atBatIndex` 46) | PASS | [MLB StatsAPI game 823506](https://statsapi.mlb.com/api/v1/game/823506/playByPlay) |
| H2-11 | `823506:56:0:MA` | 3–3 | 3–3 (`atBatIndex` 56) | PASS | [MLB StatsAPI game 823506](https://statsapi.mlb.com/api/v1/game/823506/playByPlay) |
| H2-12 | `823096:36:p:MF` | 6–0 | 6–0 (`atBatIndex` 36) | PASS | [MLB StatsAPI game 823096](https://statsapi.mlb.com/api/v1/game/823096/playByPlay) |
| H2-13 | `823180:57:p:MA` | 3–6 | 3–6 (`atBatIndex` 57) | PASS | [MLB StatsAPI game 823180](https://statsapi.mlb.com/api/v1/game/823180/playByPlay) |
| H2-14 | `823180:84:p:NF` | 10–9 | 10–9 (`atBatIndex` 84) | PASS | [MLB StatsAPI game 823180](https://statsapi.mlb.com/api/v1/game/823180/playByPlay) |

Field-projected requests (same official endpoint) used for the score checks:
[824963](https://statsapi.mlb.com/api/v1/game/824963/playByPlay?fields=allPlays,atBatIndex,result,description,awayScore,homeScore) ·
[823015](https://statsapi.mlb.com/api/v1/game/823015/playByPlay?fields=allPlays,atBatIndex,result,description,awayScore,homeScore) ·
[823506](https://statsapi.mlb.com/api/v1/game/823506/playByPlay?fields=allPlays,atBatIndex,result,description,awayScore,homeScore) ·
[823180](https://statsapi.mlb.com/api/v1/game/823180/playByPlay?fields=allPlays,atBatIndex,result,description,awayScore,homeScore).

## Irregularities / items for review (none block deployment)

| # | Irregularity | Handling | Official source |
|---|---|---|---|
| IR-1 | “Before review” score was not observed for the 10 replay rows because the pages were opened after the rulings. | Left blank (`— (not observed before ruling)`) on the site; no value inferred. Already published on the Flagged for Review page (§17, F-1..F-5). | [MLB StatsAPI game 823506 play-by-play](https://statsapi.mlb.com/api/v1/game/823506/playByPlay) |
| IR-2 | The reference and copy feeds list some simultaneous `4:58:56 PM` rows in a different order (e.g. `MIN @ ATH` vs `BAL @ STL` first). All row values and counts match. | Logged as an ordering/observation-timing difference, not a data discrepancy; no change made. | [Reference replay page](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26&verify=36284656) |
| IR-3 | This sandbox's shell cannot open `*.github.io` with `curl` (TLS connect fails); the page-rendering tool reached the same URLs successfully. | Environment limitation only; live pages verified through the working tool. No site change. | [Live scoreboard](https://kanlerxz87-cyber.github.io/Alert1/?verify=36284656) |
| IR-4 | Arena fixes each session to one branch, so the brief's `session-<id>/<task>` branch convention cannot be used literally. | Already published on the Flagged for Review page (C-7 / A1-9 / F-5); this session uses `arena/36284656-alert1` only. | [Task board](https://github.com/kanlerxz87-cyber/Alert1/blob/main/COORDINATION.md) |

## H-3 — Integration record

PR [#15](https://github.com/kanlerxz87-cyber/Alert1/pull/15) was opened from `arena/36284656-alert1`,
merged autonomously into `main` as `ac588dd9fa153452711fd556cf37a9bac0e639f1` at 2026-11-25T22:08:59Z,
and the site was re-verified after deployment.

| # | Integration check | Result | Source |
|---|---|---|---|
| H3-1 | Pre-merge PR checks | `Site checks` run `45710381054` (`test` + `dom-smoke`) `success`; mergeable state `clean` | [PR #15](https://github.com/kanlerxz87-cyber/Alert1/pull/15) · [Check run](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45710381054) |
| H3-2 | Merge result | PR #15 `MERGED` at `ac588dd`; `COORDINATION.md` + this audit were the only files authored by this session | [PR #15](https://github.com/kanlerxz87-cyber/Alert1/pull/15) |
| H3-3 | Final Pages build | Latest Pages build `c792cc7179490ae1e9aa8a9f50a0246855922c96`, status `built` | [Pages builds API](https://api.github.com/repos/kanlerxz87-cyber/Alert1/pages/builds/latest) |
| H3-4 | Final deployment workflows | `pages build and deployment` run `45710722731` `success`; `Published Pages delivery` run `45710862856` `success` | [Check run](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45710722731) · [Check run](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45710862856) |
| H3-5 | Published audit file after deploy | This audit is served at the published URL | [Published audit](https://kanlerxz87-cyber.github.io/Alert1/audit/36284656-pages-delivery-verification.md?v=c792cc7) |
| H3-6 | Published replay feed after deploy | Still 15 games / 78 tracked entries with the same 10 rows and official source links | [Published replay feed](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26&v=c792cc7) |
| H3-7 | Published upcoming scoreboard after deploy | Still 17 games for `2027-02-19` with no manual input | [Published scoreboard](https://kanlerxz87-cyber.github.io/Alert1/?date=2027-02-19&v=c792cc7) |

All suites were also run locally after each parallel merge (restoration, 69 smoke checks,
`run-all.mjs`, both provenance suites); all passed. No site defect was introduced by this session.
