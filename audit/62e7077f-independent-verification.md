# Independent verification — session `62e7077f` (2026-11-25 UTC)

Scope: independent re-check of the `kanlerxz87-cyber/Alert1` copy of
[`snapquast73-boop/LIVPBP` @ `5c02527`](https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3),
against the [reference deployment](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26&cachebust=62e7077f),
the [live copy](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26&verify=62e7077f)
and **official** MLB StatsAPI / GitHub endpoints. Every table row below carries a clickable official
source link. No value that could not be read from an official payload was filled in; unobserved
values stay blank and are listed as flagged in §4.

---

## 1. File-by-file review of the copy

The upstream source tree was cloned at the exact commit named in `COORDINATION.md` and compared
with the working tree file by file. `sha256sum` prefixes below were computed locally from that
clone and the working tree; the authoritative upstream revision is linked in every row.

| File(s) | Result of line-by-line comparison | Status | Official source |
| --- | --- | --- | --- |
| `index.html`, `reviews.html`, `game.html`, `assets/css/style.css` | Byte-identical to upstream (`2bed352d6136`, `22b6d2e2722b`, `a1be09f04b54`, `2d38d6ce360f`) — no local divergence in markup or styling | Verified | [upstream tree @ 5c02527](https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3) |
| `assets/js/api.js`, `assets/js/ui.js`, `assets/js/props.js`, `server.mjs` | Byte-identical to upstream (`c41debeef0cf`, `4765f96fd65d`, `f705d725eb70`, `36ae67824a4c`) — every browser data request in `api.js` still targets `https://statsapi.mlb.com/api` | Verified | [upstream `assets/js/api.js`](https://github.com/snapquast73-boop/LIVPBP/blob/5c02527d3c7a56ea66c698cfabff80a407b6dfd3/assets/js/api.js) |
| `.nojekyll`, `LICENSE`, `package-lock.json`, `tools/restoration-check.mjs`, `tests/contract-check.mjs`, three JSON fixtures | Byte-identical to upstream; MIT license and upstream fixtures preserved | Verified | [upstream repository](https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3) |
| `assets/js/{feed-log,game,reviews-feed,reviews,scoreboard}.js` | Full unified diff reviewed line by line: only the previously documented Alert1 changes are present (static-host `FeedLog` guard, `startTimeTBD` handling, non-live polling backoff, `officialDate` stamping, `numOrNull` null guard, empty-slate `scheduleLoaded` guard and upcoming-date jump). No new functional defect found in this pass | Verified; prior-session changes retained | [Alert1 `assets/js/`](https://github.com/kanlerxz87-cyber/Alert1/tree/main/assets/js) |
| `.github/workflows/{site-check,pages-delivery}.yml`, `404.html`, `package.json`, `tests/*`, `tools/smoke-test.mjs`, docs/audit files | Differences are the documented `/Alert1/` base-path / URL changes, expanded CI checks and verification records; no hardcoded game dates or StatsAPI values introduced | Verified | [Alert1 workflow](https://github.com/kanlerxz87-cyber/Alert1/blob/main/.github/workflows/site-check.yml) |
| `COORDINATION.md` (this session's claim) | First CI run failed because the new S-3/S-4 board rows had no source URL; the rows were amended with official links and the provenance suite then passed 4/4. No other file was changed for the claim | Fixed & tested | [provenance test](https://github.com/kanlerxz87-cyber/Alert1/blob/main/tests/alert1-feedlog-and-provenance-test.mjs) |

---

## 2. Replay rows — official payload re-check (`2026-08-26`)

For each row the official `playByPlay` payload was read with leaf projections
(`allPlays,about,atBatIndex,inning,result,description,awayScore,homeScore,reviewDetails,
isOverturned,inProgress,reviewType,challengeTeamId,playEvents,index,details`). `reviewDetails`
is resolved from the play **or** from the cited `playEvents[index]`, exactly where MLB put it.
"Actual after" is MLB's `result.awayScore`/`result.homeScore` on that same play — **not** the final
score. "Before review" was never observed before the ruling and remains blank on the site.

| Review ID | Reference row (inning, type, ruling) and official payload | Actual after (official `awayScore`/`homeScore`) | Official source |
| --- | --- | --- | --- |
| `824963:34:p:MF` | Top 5, `MF`, `isOverturned:true`, `challengeTeamId:133`; `"Athletics challenged (play at 1st), call on the field was overturned: Alan Roden grounds out, shortstop Alika Williams to first baseman Tommy White."` | `3–2` | [game 824963 playByPlay](https://statsapi.mlb.com/api/v1/game/824963/playByPlay?fields=allPlays,about,atBatIndex,result,description,awayScore,homeScore,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `823015:34:p:MF` | Top 4, `MF`, `isOverturned:false`, `challengeTeamId:138`; `"Cardinals challenged (play at 1st), call on the field was upheld: Samuel Basallo singles on a ground ball to third baseman Nolan Gorman."` | `7–1` | [game 823015 playByPlay](https://statsapi.mlb.com/api/v1/game/823015/playByPlay?fields=allPlays,about,atBatIndex,result,description,awayScore,homeScore,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `824555:2:7:MA` | Top 1, `MA`, `isOverturned:true`, `challengeTeamId:145`, `playEvents[7]`; `"White Sox challenged (tag play), call on the field was overturned: pitcher Sean Burke picks off Corey Seager at 1st on throw to first baseman Munetaka Murakami."` | `0–0` | [game 824555 playByPlay](https://statsapi.mlb.com/api/v1/game/824555/playByPlay?fields=allPlays,about,atBatIndex,playEvents,index,details,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `822692:47:4:MA` | Top 6, `MA`, `isOverturned:false`, `challengeTeamId:120`, `playEvents[4]`; `"Nationals challenged (tag play), call on the field was upheld: Ezequiel Tovar steals (6) 2nd base."` | `4–1` | [game 822692 playByPlay](https://statsapi.mlb.com/api/v1/game/822692/playByPlay?fields=allPlays,about,atBatIndex,playEvents,index,details,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `823506:19:5:NH` | Bot 2, `NH`, `isOverturned:false`, `playEvents[5]` pitch description `"Foul"`, PA ends `"Luis García Jr. flies out to left fielder Taylor Trammell."` — upstream schema irregularity (F-2) | `1–2` | [game 823506 playByPlay](https://statsapi.mlb.com/api/v1/game/823506/playByPlay?fields=allPlays,about,atBatIndex,playEvents,index,details,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `823506:46:4:MA` | Bot 6, `MA`, `isOverturned:false`, `challengeTeamId:147`, `playEvents[4]`; `"Yankees challenged (tag play), call on the field was upheld: Jazz Chisholm Jr. caught stealing 2nd base, catcher Christian Vázquez to shortstop Jeremy Peña."` | `2–3` | [game 823506 playByPlay](https://statsapi.mlb.com/api/v1/game/823506/playByPlay?fields=allPlays,about,atBatIndex,playEvents,index,details,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `823506:56:0:MA` | Bot 7, `MA`, `isOverturned:false`, `challengeTeamId:117`, `playEvents[0]` description `"Pickoff Attempt 1B"` — upstream schema irregularity (F-1) | `3–3` | [game 823506 playByPlay](https://statsapi.mlb.com/api/v1/game/823506/playByPlay?fields=allPlays,about,atBatIndex,playEvents,index,details,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `823096:36:p:MF` | Bot 5, `MF`, `isOverturned:false`, `challengeTeamId:136`; `"Mariners challenged (play at 1st), call on the field was upheld: J.P. Crawford grounds out sharply, shortstop Trea Turner to first baseman Alec Bohm."` | `6–0` | [game 823096 playByPlay](https://statsapi.mlb.com/api/v1/game/823096/playByPlay?fields=allPlays,about,atBatIndex,result,description,awayScore,homeScore,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `823180:57:p:MA` | Top 7, `MA`, `isOverturned:false`, `challengeTeamId:137`; `"Giants challenged (tag play), call on the field was upheld: Sal Stewart out on a sacrifice fly to center fielder Jonah Cox. Ke'Bryan Hayes scores. Héctor Rodríguez to 3rd. Elly De La Cruz to 2nd."` | `3–6` | [game 823180 playByPlay](https://statsapi.mlb.com/api/v1/game/823180/playByPlay?fields=allPlays,about,atBatIndex,result,description,awayScore,homeScore,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `823180:84:p:NF` | Top 9, `NF`, `isOverturned:false`; `"Umpire reviewed (play at 1st), call on the field was upheld: Umpire reviewed (slide interference), call on the field was upheld: Héctor Rodríguez grounds into a force out, pitcher Reiver Sanmartin to shortstop Christian Koss. Ivan Johnson out at 2nd. Héctor Rodríguez to 1st."` — dual-call irregularity (F-3) | `10–9` | [game 823180 playByPlay](https://statsapi.mlb.com/api/v1/game/823180/playByPlay?fields=allPlays,about,atBatIndex,result,description,awayScore,homeScore,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |

### Challenge counters re-read from official `gameData` (examples)

| Row | Official `review` / `absChallenges` values | Site rendering | Official source |
| --- | --- | --- | --- |
| `824963:34:p:MF` | `review.home: {used:1, remaining:1}` (ATH is home) | `ATH: 1 manager challenge left now (1 used)` | [game 824963 feed/live projection](https://statsapi.mlb.com/api/v1.1/game/824963/feed/live?fields=gameData,review,absChallenges,hasChallenges,away,home,used,remaining,usedSuccessful,usedFailed) |
| `823180:57:p:MA` and `823180:84:p:NF` | `review.away:{used:0,remaining:1}`, `review.home:{used:1,remaining:0}`, `absChallenges.away.remaining:2`, `absChallenges.home.remaining:1` | `SF: 0 … (1 used)` and `Challenges left: CIN 1 MGR · 2 ABS — SF 0 MGR · 1 ABS` | [game 823180 feed/live projection](https://statsapi.mlb.com/api/v1.1/game/823180/feed/live?fields=gameData,review,absChallenges,hasChallenges,away,home,used,remaining,usedSuccessful,usedFailed) |
| `823096:36:p:MF` | `review.home:{used:1,remaining:0}` (SEA is home) | `SEA: 0 manager challenges left now (1 used)` | [game 823096 feed/live projection](https://statsapi.mlb.com/api/v1.1/game/823096/feed/live?fields=gameData,review,absChallenges,hasChallenges,away,home,used,remaining,usedSuccessful,usedFailed) |

---

## 3. Upcoming game days — no manual input

| Check | Official payload | Observed site behavior | Official / live source |
| --- | --- | --- | --- |
| Today's offseason slate (`2026-11-25`) | Official range `2026-05-29`..`2027-05-24` reports `totalGames: 2926`; last prior date with games `2026-10-28` (`1`), next date with games `2027-02-19` (`17`) | Both empty-state panels show `Most recent date with games: Wed Oct 28, 2026` and `Next scheduled game day: Fri Feb 19, 2027` with jump buttons, with no manual input | [official range](https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-05-29&endDate=2027-05-24&fields=dates,date,totalGames) · [live scoreboard](https://kanlerxz87-cyber.github.io/Alert1/?date=2026-11-25&verify=62e7077f) |
| 2027 Spring Training opener | `2027-02-19` reports `totalGames: 17` (e.g. `868573` TOR @ PIT) | Live scoreboard renders 17 scheduled cards and game links carrying `?date=2027-02-19` | [official schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-02-19&fields=dates,games,gamePk,gameDate,status,teams,team,name) · [live scoreboard](https://kanlerxz87-cyber.github.io/Alert1/?date=2027-02-19&verify=62e7077f) |
| 2027 Opening Day | `2027-03-25` reports `totalGames: 14` | Live replay feed reports `14 game(s) on Thu Mar 25, 2027`, with 0 tracked events (no reviews yet published by MLB) | [official schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&fields=dates,date,totalGames,games,gamePk,gameDate,status,startTimeTBD) · [live feed](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2027-03-25&verify=62e7077f) |
| Reference parity, cache-busted | Reference and copy both report 15 games, 10 reviews, 8 challenges, 2 umpire reviews, 68 ABS, 1 boundary call, 1 run at risk and 78 tracked entries for `2026-08-26`; the ten non-ABS rows have identical text and IDs | Local copy matches the reference; only the scan time and row ordering differ between polls | [reference feed](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26&cachebust=62e7077f) · [local feed](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26&verify=62e7077f) |
| Checks run locally | `npm test` 69/69; `node tests/run-all.mjs` (syntax, 50 local refs, 8 bindings, 47 jsdom checks); `node tests/props-provenance-test.mjs` 5/5; `node tests/alert1-feedlog-and-provenance-test.mjs` 4/4; `node tools/restoration-check.mjs` ALL PASSED | No broken local references, no failing contract/render checks | [CI workflow](https://github.com/kanlerxz87-cyber/Alert1/blob/main/.github/workflows/site-check.yml) |

---

## 4. Flagged / unverified — deliberately left blank

| Item | What is actually in the official payload | Disposition | Official source |
| --- | --- | --- | --- |
| Before-review score on all ten `2026-08-26` rows | No pre-ruling observation is present in the fetched payloads; the app opened after the rulings | Left blank on the site (`— (not observed before ruling)`), never inferred from the after-score | [game 824963 playByPlay](https://statsapi.mlb.com/api/v1/game/824963/playByPlay) |
| `823506:56:0:MA` F-1 | `playEvents[0].details.description` is `"Pickoff Attempt 1B"`; no challenge prose, though `reviewDetails.challengeTeamId:117` is present | Preserved verbatim; challenger/type/ruling come only from structured fields | [game 823506 playByPlay](https://statsapi.mlb.com/api/v1/game/823506/playByPlay?fields=allPlays,about,atBatIndex,playEvents,index,details,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `823506:19:5:NH` F-2 | `reviewDetails` is attached to a `"Foul"` pitch event (`playEvents[5]`) with `reviewType:"NH"` | Preserved verbatim; classified from the official `reviewType`, pitch text not rewritten | [game 823506 playByPlay](https://statsapi.mlb.com/api/v1/game/823506/playByPlay?fields=allPlays,about,atBatIndex,playEvents,index,details,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| `823180:84:p:NF` F-3 | One `reviewDetails` object (`"NF"`) despite two "Umpire reviewed …" clauses in the official result description | Both official clauses preserved on the row; no second review ID invented | [game 823180 playByPlay](https://statsapi.mlb.com/api/v1/game/823180/playByPlay?fields=allPlays,about,atBatIndex,result,description,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) |
| ABS count `68` and scoring-change count `0` on the reference date | Carried forward from the earlier official-source audit (`audit/reference-parity-2026-11-22.md`, `docs/verification-report.md`); not re-derived row by row again in this session | Displayed for parity with the reference; re-verification performed on the ten non-ABS rows only | [prior official-source audit](https://github.com/kanlerxz87-cyber/Alert1/blob/main/audit/reference-parity-2026-11-22.md) |
| Club colours, forecast model constants, cross-browser synchronized log | Not published by the official endpoints used by this static site | Values remain blank/unimplemented and are published on `flagged.html` (carried items U-1/U-2/U-9/U-11) | [official teams payload](https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,name,abbreviation&season=2026) |
