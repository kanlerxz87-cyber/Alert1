# Alert1 copy + live verification — session 0d7dbc14 (2026-11-25)

**Branch:** `arena/0d7dbc14-alert1` (branched from `e22ec1d7a308adcb92acc36faa1e88eb8bdb8bb8`, merged `origin/main` @ `594f46bf3d506cc6f6da584064528fb0814a0310`)  
**Repo:** https://github.com/kanlerxz87-cyber/Alert1  
**Live site:** https://kanlerxz87-cyber.github.io/Alert1/  
**Reference:** https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26  
**Upstream source:** https://github.com/snapquast73-boop/LIVPBP @ `5c02527d3c7a56ea66c698cfabff80a407b6dfd3`

## Scope

Verify the copied Alert1 repo is working like the LIVPBP reference for upcoming game days, with no manual input required. Verification only; no functional code changes were needed.

## Official sources checked (2026-11-25)

| Check | Official source | Result |
|---|---|---|
| 2026-08-26 schedule (15 games, Final) | https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26&fields=dates,date,totalGames,games,gamePk,officialDate,status,detailedState,teams,away,home,team,name,score | Verified via `fetch_page`: 15 games returned; scores/status match live pages. |
| 2027-02-19 Spring Training schedule (17 games, 2 startTimeTBD) | https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-02-19&fields=dates,date,totalGames,games,gamePk,officialDate,status,detailedState,abstractGameState,startTimeTBD,teams,away,home,team,name | Verified 17 games including `868344` CLE@CIN `startTimeTBD:true`, `868575` Northeastern@BOS `startTimeTBD:true`. |
| 2027-03-25 Opening Day schedule (14 games, 3 startTimeTBD) | https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&hydrate=review,flags,probablePitcher,decisions,linescore&fields=dates,date,totalGames,games,gamePk,officialDate,status,detailedState,abstractGameState,startTimeTBD,teams,away,home,team,name,id,score,leagueRecord,review,hasChallenges,absChallenges,flags,probablePitcher,fullName,decisions,winner,loser,save | Verified 14 games; `854131` CLE@CHC, `852663` COL@SF, `853388` ATL@LAD `startTimeTBD:true`. |
| MLB gameStatus registry | https://statsapi.mlb.com/api/v1/gameStatus | Referenced by existing code/tests; no code change. |
| Live deployed Alert1 reviews (2026-08-26) | https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26 | Renders 10 Reviews, 8 Challenges, 2 Umpire reviews, 68 ABS, 1 Boundary, 0 Under review, 1 Run at risk, 0 Scoring changes, 15 games, 78 tracked entries. |
| Reference LIVPBP reviews (2026-08-26) | https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26 | Same summary counts/content as Alert1 (row order may differ by scan timing; entries match). |
| Live deployed Alert1 scoreboard 2027-03-25 | https://kanlerxz87-cyber.github.io/Alert1/?date=2027-03-25 | 14 games rendered; TBD displayed for startTimeTBD games. |
| Live deployed Alert1 scoreboard 2027-02-19 | https://kanlerxz87-cyber.github.io/Alert1/?date=2027-02-19 | 17 games rendered; TBD displayed for startTimeTBD games. |
| Live deployed Alert1 game page TBD | https://kanlerxz87-cyber.github.io/Alert1/game.html?gamePk=854131&date=2027-03-25 | Shows "Scheduled — first pitch TBD" / "Start time TBD"; no dummy time. |
| Live deployed Alert1 empty date | https://kanlerxz87-cyber.github.io/Alert1/?date=2026-12-01 | Shows "No games scheduled for Tue Dec 1, 2026." |

## Local checks run

| Command | Result |
|---|---|
| `npm ci --ignore-scripts` | OK (0 vulnerabilities) |
| `npm test` (`node tools/smoke-test.mjs`) | **69 passed, 0 failed** |
| `node tests/run-all.mjs` | **PASS** (syntax, 50 local refs, 8 contract bindings, 47 jsdom checks) |
| `node tests/props-provenance-test.mjs` | **5 passed, 0 failed** |
| `node tests/alert1-feedlog-and-provenance-test.mjs` | **4 passed, 0 failed** |
| `node tools/restoration-check.mjs` | **ALL CHECKS PASSED** |

## Findings

- No functional code changes required. The copy already matches the reference behavior for the verified 2026-08-26 replay feed and renders upcoming 2027-02-19 / 2027-03-25 game days correctly, including `startTimeTBD` handling.
- Upstream core files (`index.html`, `game.html`, `reviews.html`, `server.mjs`, `assets/js/api.js`, `assets/js/ui.js`, `assets/js/props.js`, `assets/css/style.css`) match upstream LIVPBP `5c02527` blob SHAs; Alert1-specific adaptations (`404.html` base path, `package.json` metadata/homepage, flagged/coordination/docs, and the df7b58c1/fae80285 JS fixes) are present as documented.
- Irregularities/unverified items remain published on https://kanlerxz87-cyber.github.io/Alert1/flagged.html and do not block deployment.
