# Alert1 Independent Line-by-Line Verification (`arena/15b89941-alert1`, 2026-11-25)

Independent verification performed on **2026-11-25 UTC** by session **`15b89941`** against:
- Upstream reference repository [`snapquast73-boop/LIVPBP`](https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3) (`5c02527d3c7a56ea66c698cfabff80a407b6dfd3`) and live deployment [`snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26`](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26)
- Official MLB StatsAPI (`statsapi.mlb.com`) endpoints for `2026-08-26`, `2027-02-19`, `2027-03-25`, `game/823180`, `game/854131`, and `game/868575`
- Live `kanlerxz87-cyber/Alert1` GitHub Pages deployment at [`kanlerxz87-cyber.github.io/Alert1/`](https://kanlerxz87-cyber.github.io/Alert1/)

Every table row links directly to an official or primary source URL; no values are inferred.

---

## 1. Reference Parity & Live Replay Feed (`2026-08-26`)

| Metric / Item | Reference (`snapquast73-boop.github.io/LIVPBP`) | Alert1 (`kanlerxz87-cyber.github.io/Alert1`) | Status | Official Source |
|---|---|---|---|---|
| `reviews.html?date=2026-08-26` summary tiles | `10` Reviews · `8` Challenges · `2` Umpire reviews · `68` ABS challenges · `1` Boundary calls · `0` Under review · `1` Runs at risk · `0` Scoring changes | `10` Reviews · `8` Challenges · `2` Umpire reviews · `68` ABS challenges · `1` Boundary calls · `0` Under review · `1` Runs at risk · `0` Scoring changes | Exact parity | [`snapquast73-boop/LIVPBP` live](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26) · [`statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26`](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26&hydrate=review) |
| `reviews.html?date=2026-08-26` footer counts | `15 game(s) on Wed Aug 26, 2026 · 0 live · 78 tracked entries · local log only` | `15 game(s) on Wed Aug 26, 2026 · 0 live · 78 tracked entries · local log only` | Exact parity | [`kanlerxz87-cyber/Alert1` live](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26) |
| `game.html?gamePk=823180&date=2026-08-26` (`CIN @ SF`) | Final `10–9`, 9-inning linescore (`CIN` 10R/15H/0E, `SF` 9R/12H/2E), Top 9 dual umpire review `NF`, Top 7 `MA` `1 run(s) at risk` | Final `10–9`, 9-inning linescore (`CIN` 10R/15H/0E, `SF` 9R/12H/2E), Top 9 dual umpire review `NF`, Top 7 `MA` `1 run(s) at risk`, per-row `source` links | Verified | [`v1.1/game/823180/feed/live`](https://statsapi.mlb.com/api/v1.1/game/823180/feed/live) |

---

## 2. Upcoming Game Days (`2026-11-25` Offseason → `2027-02-19` & `2027-03-25`)

| Check | Official MLB StatsAPI Payload | Live Alert1 Verification | Status | Official Source |
|---|---|---|---|---|
| Offseason default (`2026-11-25`) | `0` games on `2026-11-25`; range query surfaces `2026-10-28` (most recent) and `2027-02-19` (next scheduled) | Displays `No games scheduled for Wed Nov 25, 2026` plus `Show it` jump buttons for `Wed Oct 28, 2026` and `Fri Feb 19, 2027` | Verified | [`kanlerxz87-cyber.github.io/Alert1/?date=2026-11-25`](https://kanlerxz87-cyber.github.io/Alert1/?date=2026-11-25) · [`schedule?sportId=1&startDate=2026-05-29&endDate=2027-05-24`](https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-05-29&endDate=2027-05-24&fields=dates,date,totalGames) |
| Spring Training Opener (`2027-02-19`) | `17` Scheduled games including `868573` (`TOR @ PIT`, `18:05:00Z`), `868575` (`Northeastern Huskies` id `343` `NEU` @ `Boston Red Sox` id `111` `BOS`, `startTimeTBD: true`), `868344` (`CLE @ CIN`, `startTimeTBD: true`) | `reviews.html?date=2027-02-19` renders `17 game(s) on Fri Feb 19, 2027 · 0 live · 0 tracked entries`; `game.html?gamePk=868573` renders `TOR @ PIT · 1:05 PM · LECOM Park`; `UI.abbr` fixed (`S15-1`) to honor official `NEU` abbreviation on non-MLB opponents | Verified & fixed | [`schedule?sportId=1&date=2027-02-19`](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-02-19) · [`v1.1/game/868575/feed/live`](https://statsapi.mlb.com/api/v1.1/game/868575/feed/live) |
| Regular Season Opening Day (`2027-03-25`) | `14` Scheduled games (`11` with confirmed times, `3` with `startTimeTBD: true`: `854131` CLE @ CHC, `852663` COL @ SF, `853388` ATL @ LAD); `game/854131/feed/live` carries `review` (`1` remaining) and `absChallenges` (`2` remaining) | `index.html?date=2027-03-25` renders all `14` cards with `TBD` on the 3 TBD matchups; `game.html?gamePk=854131` renders `Scheduled · TBD · Wrigley Field · Start time TBD` | Verified | [`schedule?sportId=1&date=2027-03-25`](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25) · [`v1.1/game/854131/feed/live`](https://statsapi.mlb.com/api/v1.1/game/854131/feed/live) |

---

## 3. Code Audit Findings & Fixes (`session 15b89941`)

| # | Finding | Impact | Action Taken | Official Source |
|---|---|---|---|---|
| S15-1 | `UI.abbr(team)` in `assets/js/ui.js` fell back to slicing the first 3 letters of `team.name` whenever `id` was outside the 30-team MLB `TEAM_ABBR` map, ignoring `team.abbreviation` | Non-MLB Spring Training exhibition opponents such as `Northeastern Huskies` (`id: 343`, official `abbreviation: "NEU"` on `2027-02-19`) would fall back to `"NOR"` instead of `"NEU"` | Updated `UI.abbr(team)` to check `TEAM_ABBR[id]`, then `team.abbreviation` / `team.team.abbreviation`, and slice `team.name` only when no official abbreviation is present | [`v1.1/game/868575/feed/live`](https://statsapi.mlb.com/api/v1.1/game/868575/feed/live?fields=gameData,teams,away,home,id,name,abbreviation,teamName) · [`assets/js/ui.js`](https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/ui.js) |
| S15-2 | `scoreboard.js`: `sweepStatus()` and `loadLog()` lacked `dateSeq` / `date` staleness guards, and `init()` / `setDate()` triggered a duplicate `fetchSchedule()` via `schedulePoll(LIVE_POLL_MS)` / `schedulePoll(0)` | Rapid date switching during a live slate could apply a stale sweep or log payload, and initial load on upcoming/offseason slates fired two schedule fetches 500 ms apart | Added `dateSeq` / `date` guards to `sweepStatus()` and `loadLog()`, and routed `init()` / `setDate()` through `tick()` for a single initial fetch with proper backoff (`30s` Preview / `120s` future idle) | [`assets/js/scoreboard.js`](https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/scoreboard.js) |
| S15-3 | Historical archive `audit/upstream-coordination.md` preserves upstream `COORDINATION.md` rows verbatim (91 rows without `https://` links), and Arena restricts each session to one fixed branch (`arena/15b89941-alert1`) | `audit/upstream-coordination.md` is a historical snapshot from `snapquast73-boop/LIVPBP@5c02527`; all active `Alert1` Markdown/HTML tables carry 100% official `https://` source links | Flagged on [`flagged.html`](https://kanlerxz87-cyber.github.io/Alert1/flagged.html) (§18); enforced in CI by `tests/alert1-feedlog-and-provenance-test.mjs` | [`snapquast73-boop/LIVPBP` `COORDINATION.md`](https://github.com/snapquast73-boop/LIVPBP/blob/5c02527d3c7a56ea66c698cfabff80a407b6dfd3/COORDINATION.md) · [`COORDINATION.md`](https://github.com/kanlerxz87-cyber/Alert1/blob/main/COORDINATION.md) |
