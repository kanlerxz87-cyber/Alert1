# Independent re-verification — session `5e124cc4` (2026-11-25)

Scope: independent check of the `kanlerxz87-cyber/Alert1` copy of
[`snapquast73-boop/LIVPBP` at commit `5c02527`](https://api.github.com/repos/snapquast73-boop/LIVPBP/commits/5c02527d3c7a56ea66c698cfabff80a407b6dfd3)
against the [reference replay page](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26),
the [official MLB StatsAPI](https://statsapi.mlb.com), and the [GitHub API](https://api.github.com/repos/kanlerxz87-cyber/Alert1).
No value below was inferred: where an official payload did not publish a value, it is left blank.
This record supplements (does not overwrite) the earlier session reports linked from
[`flagged.html`](https://kanlerxz87-cyber.github.io/Alert1/flagged.html).

---

## 1. Source-tree parity

| Check | Verified result | Official source |
| --- | --- | --- |
| Upstream source revision | `5c02527d3c7a56ea66c698cfabff80a407b6dfd3` (`main`) is the copied revision named on the shared board. | [GitHub commit API](https://api.github.com/repos/snapquast73-boop/LIVPBP/commits/5c02527d3c7a56ea66c698cfabff80a407b6dfd3) |
| Local integration base | `e22ec1d7a308adcb92acc36faa1e88eb8bdb8bb8` (merge of PR #8), the branch point of `arena/5e124cc4-alert1`. | [GitHub commit API](https://api.github.com/repos/kanlerxz87-cyber/Alert1/commits/e22ec1d7a308adcb92acc36faa1e88eb8bdb8bb8) |
| Blob-level comparison (GitHub tree vs `git ls-tree`) | 40 upstream blobs, 43 local blobs; **21 byte-identical**, **19 modified**, **3 local-only**. No copied source file is missing. | [upstream recursive tree](https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/5c02527d3c7a56ea66c698cfabff80a407b6dfd3?recursive=1) · [local tree at base](https://api.github.com/repos/kanlerxz87-cyber/Alert1/git/trees/e22ec1d7a308adcb92acc36faa1e88eb8bdb8bb8?recursive=1) |
| Modified files reviewed line by line | JS changes are limited to `startTimeTBD` handling, null-counter guards, one-shot/`scheduleLoaded` guards, non-live polling backoff, `officialDate` stamping and static-host `FeedLog` guards. HTML/CSS, `api.js`, `props.js` and `ui.js` are byte-identical to upstream where listed as identical. | [upstream `assets/js`](https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/5c02527d3c7a56ea66c698cfabff80a407b6dfd3?recursive=1) · [local `assets/js`](https://github.com/kanlerxz87-cyber/Alert1/tree/main/assets/js) |
| Local-only files | `audit/alert1-live-verification-2026-11-25.md`, `audit/upstream-coordination.md`, `tests/alert1-feedlog-and-provenance-test.mjs` — all are verification/archival artifacts disclosed on the Flagged page. | [local tree](https://api.github.com/repos/kanlerxz87-cyber/Alert1/git/trees/e22ec1d7a308adcb92acc36faa1e88eb8bdb8bb8?recursive=1) · [flagged.html](https://kanlerxz87-cyber.github.io/Alert1/flagged.html) |

## 2. Reference-date replay rows (`2026-08-26`) re-read from official play-by-play

Each row below was read from the named official endpoint in this session using a `fields`
projection that includes `reviewDetails`, `reviewType`, `isOverturned` and `challengeTeamId`.
`p` refers to a review object on the plate appearance; a numeric event index refers to
`playEvents[n]`. No prose was filled in where the official API did not publish it.

| Review ID | Game | Official `reviewType` | `challengeTeamId` | `isOverturned` | Official source |
| --- | --- | --- | --- | --- | --- |
| `824963:34:p:MF` | MIN @ ATH (`824963`) | `MF` | `133` | `true` | [game/824963/playByPlay](https://statsapi.mlb.com/api/v1/game/824963/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |
| `823015:34:p:MF` | BAL @ STL (`823015`) | `MF` | `138` | `false` | [game/823015/playByPlay](https://statsapi.mlb.com/api/v1/game/823015/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |
| `824555:2:7:MA` | TEX @ CWS (`824555`) | `MA` | `145` | `true` | [game/824555/playByPlay](https://statsapi.mlb.com/api/v1/game/824555/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |
| `823506:19:5:NH` | HOU @ NYY (`823506`) | `NH` |  | `false` | [game/823506/playByPlay](https://statsapi.mlb.com/api/v1/game/823506/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |
| `823506:46:4:MA` | HOU @ NYY (`823506`) | `MA` | `147` | `false` | [game/823506/playByPlay](https://statsapi.mlb.com/api/v1/game/823506/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |
| `823506:56:0:MA` | HOU @ NYY (`823506`) | `MA` | `117` | `false` | [game/823506/playByPlay](https://statsapi.mlb.com/api/v1/game/823506/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |
| `822692:47:4:MA` | COL @ WSH (`822692`) | `MA` | `120` | `false` | [game/822692/playByPlay](https://statsapi.mlb.com/api/v1/game/822692/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |
| `823096:36:p:MF` | PHI @ SEA (`823096`) | `MF` | `136` | `false` | [game/823096/playByPlay](https://statsapi.mlb.com/api/v1/game/823096/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |
| `823180:57:p:MA` | CIN @ SF (`823180`) | `MA` | `137` | `false` | [game/823180/playByPlay](https://statsapi.mlb.com/api/v1/game/823180/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |
| `823180:84:p:NF` | CIN @ SF (`823180`) | `NF` |  | `false` | [game/823180/playByPlay](https://statsapi.mlb.com/api/v1/game/823180/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |

Blank `challengeTeamId` cells are intentional: the official objects for the two umpire reviews do
not carry that field. The two known upstream-data irregularities already published as F-1/F-2/F-3
were re-observed verbatim: `823506:56:0:MA` has `details.description: "Pickoff Attempt 1B"`,
`823506:19:5:NH` has `details.description: "Foul"`, and `823180:84:p:NF` carries a single `NF`
object while its official result text describes two reviewed calls.

| Rendered parity | Verified result | Official / first-party source |
| --- | --- | --- |
| Replay counts | Reference and this deployment both render 10 Reviews, 8 Challenges, 2 Umpire reviews, 68 ABS challenges, 1 Boundary call, 0 Under review, 1 Runs at risk, 0 Scoring changes, 15 games and 78 tracked entries. | [reference replay](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26) · [Alert1 replay](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26) |
| Row source links | Every rendered replay row links to `https://statsapi.mlb.com/api/v1/game/{gamePk}/playByPlay` built from the official `gamePk`. | [official schedule 2026-08-26](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26) · [Alert1 replay](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26) |

## 3. Upcoming game days (no manual input)

| Check | Official value observed | Live site behavior | Official source |
| --- | --- | --- | --- |
| Offseason date `2026-11-25` | No games on that date; next date with games is `2027-02-19` (17 games) and most recent prior date is `2026-10-28` (1 game). | Scoreboard and replay feed offer **Next scheduled game day: Fri Feb 19, 2027 Show it** and **Most recent date with games: Wed Oct 28, 2026 Show it**. | [360-day schedule range](https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-11-25&endDate=2027-05-24&fields=dates,date,totalGames) · [live scoreboard](https://kanlerxz87-cyber.github.io/Alert1/?date=2026-11-25) |
| Spring Training opener `2027-02-19` | `totalGames: 17`; first listed game `868573` `18:05:00Z`, `gameType: "S"`, `Preview` / `Scheduled`. | Scoreboard renders 17 cards with official MLB team logos and links; no review events are invented on the replay feed. | [schedule 2027-02-19](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-02-19&fields=dates,date,totalGames,games,gamePk,gameDate,gameType,status,abstractGameState,detailedState) · [live scoreboard](https://kanlerxz87-cyber.github.io/Alert1/?date=2027-02-19) |
| Opening Day `2027-03-25` | `totalGames: 14`; games `854131`, `852663` and `853388` have `startTimeTBD: true` with placeholder `08:33Z` / `10:33Z` timestamps. | Replay feed reports 14 games and 0 tracked entries; the three TBD games render `TBD`, not an invented local `:33 AM` time. | [schedule 2027-03-25](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&fields=dates,date,totalGames,games,gamePk,gameDate,officialDate,gameType,status,abstractGameState,detailedState,statusCode,startTimeTBD,teams,team,id,abbreviation) · [live replay feed](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2027-03-25) |
| Upcoming game `854131` detail | `feed/live` reports `statusCode: "S"`, `abstractGameState: "Preview"`, `startTimeTBD: true`. | `game.html?gamePk=854131&date=2027-03-25` shows `Scheduled`, `TBD`, `Start time TBD`, `Scheduled — first pitch TBD` and `No plays yet`. | [feed/live 854131](https://statsapi.mlb.com/api/v1.1/game/854131/feed/live) · [live game page](https://kanlerxz87-cyber.github.io/Alert1/game.html?gamePk=854131&date=2027-03-25) |

## 4. Checks executed on this branch

| Command | Result | Source |
| --- | --- | --- |
| `npm ci` | Dependencies installed successfully (Node v22.22.3, npm 10.9.8). | [package-lock.json](https://github.com/kanlerxz87-cyber/Alert1/blob/main/package-lock.json) |
| `npm test` | 69 passed, 0 failed. | [tools/smoke-test.mjs](https://github.com/kanlerxz87-cyber/Alert1/blob/main/tools/smoke-test.mjs) |
| `node tests/run-all.mjs` | Syntax OK; 50 local references; 8 name/id bindings; 47/47 jsdom render checks. | [tests/run-all.mjs](https://github.com/kanlerxz87-cyber/Alert1/blob/main/tests/run-all.mjs) |
| `node tests/props-provenance-test.mjs` | 5 passed, 0 failed; every driver-table row has an official HTTPS link. | [tests/props-provenance-test.mjs](https://github.com/kanlerxz87-cyber/Alert1/blob/main/tests/props-provenance-test.mjs) |
| `node tests/alert1-feedlog-and-provenance-test.mjs` | 4 passed, 0 failed; static-host guard, upcoming-date jump and table-row provenance. | [tests/alert1-feedlog-and-provenance-test.mjs](https://github.com/kanlerxz87-cyber/Alert1/blob/main/tests/alert1-feedlog-and-provenance-test.mjs) |
| `node tools/restoration-check.mjs` | ALL CHECKS PASSED, including server routes and `.git` 403. | [tools/restoration-check.mjs](https://github.com/kanlerxz87-cyber/Alert1/blob/main/tools/restoration-check.mjs) |

## 5. Irregularities and caveats (none block publication)

| ID | Irregularity / caveat | Disposition | Official source |
| --- | --- | --- | --- |
| V-1 | Upstream MLB `reviewDetails` prose/schema anomalies F-1..F-3 were re-observed; the original descriptions are preserved verbatim rather than rewritten. | Already published as Flagged; no site code change. | [game/823506/playByPlay](https://statsapi.mlb.com/api/v1/game/823506/playByPlay) · [game/823180/playByPlay](https://statsapi.mlb.com/api/v1/game/823180/playByPlay) · [flagged.html §17](https://kanlerxz87-cyber.github.io/Alert1/flagged.html) |
| V-2 | Arena fixes this session to `arena/5e124cc4-alert1`; the brief's `session-<id>/<task>` branch convention cannot be followed. | Documented on the shared board and Flagged page; no other branch created. | [GitHub branch API](https://api.github.com/repos/kanlerxz87-cyber/Alert1/branches/arena/5e124cc4-alert1) · [COORDINATION.md](https://github.com/kanlerxz87-cyber/Alert1/blob/main/COORDINATION.md) |
| V-3 | StatsAPI `fields` projection of `reviewDetails` without its child keys returns `{}`; this is a query-projection artifact, not missing official data. | Re-queried with `reviewType,isOverturned,challengeTeamId` included; values in §2 come from those complete projections. | [game/823506/playByPlay projected](https://statsapi.mlb.com/api/v1/game/823506/playByPlay?fields=allPlays,atBatIndex,about,playEvents,reviewDetails,reviewType,isOverturned,challengeTeamId) |
| V-4 | GitHub Pages is static-only, so the optional same-origin feed-log API is intentionally unavailable on the deployed site. | `FeedLog.isStaticHost()` guard prevents failing `/api/feed-log*` calls; local `node server.mjs` retains the API. | [Pages API](https://api.github.com/repos/kanlerxz87-cyber/Alert1/pages) · [feed-log.js](https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/feed-log.js) |
| V-5 | Before-review scores for the `2026-08-26` rows were not observed because the pages were opened after the rulings. | Rendered as **not observed before ruling**; no before-score was inferred. | [reference replay](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26) · [Alert1 replay](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26) |
| V-6 | No new functional defect was found in this pass; all 19 upstream file differences are prior-session fixes documented in `COORDINATION.md` and `flagged.html`. | No functional code change made by this session. | [upstream tree](https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/5c02527d3c7a56ea66c698cfabff80a407b6dfd3?recursive=1) · [COORDINATION.md](https://github.com/kanlerxz87-cyber/Alert1/blob/main/COORDINATION.md) |
