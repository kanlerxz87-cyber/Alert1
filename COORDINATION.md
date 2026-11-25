# Coordination board

| Task | Status | Owner | File scope |
|---|---|---|---|
| Copy LIVPBP, verify sources and integrate/deploy | needs review | arena-db1b5438 | Repository-wide, including site, workflows, documentation and this board |

## Log
- 2026-11-25: Claimed initial integration; repository contained only README.md and no board. Other sessions should coordinate before touching this scope.
- 2026-11-25: Copied upstream [LIVPBP commit 5c02527d3c7a56ea66c698cfabff80a407b6dfd3](https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3), preserving its MIT license and historical coordination log in `audit/upstream-coordination.md`.
- Verification: `npm ci`, `npm test` (64 passed), `node tests/run-all.mjs` (syntax, 41 local links, contracts, 47 fixture render checks), `node tools/restoration-check.mjs`, and `node tests/props-provenance-test.mjs` (5 passed). These use offline fixtures, not a live MLB check.
- Needs review: Sandbox cannot connect to [official MLB schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26) or the [reference deployment](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26); live responses, CORS, parity, upcoming game days and inherited row-by-row verification remain unverified. Disclosed on `flagged.html`. Upstream model constants and reconstructed assets also remain flagged there. The optional feed-log server is not provided by static Pages.
- Integration PR: https://github.com/kanlerxz87-cyber/Alert1/pull/1 (merge and deployment pending).
- The upstream published-delivery workflow failed on the PR before initial deployment: it checks the existing Pages revision, which predates this site. Removed its PR trigger; it remains enabled after Pages deployment and on manual dispatch.
- Preserved from `arena/db1b5438-alert1` post-merge commit [`b5ccffd`](https://github.com/kanlerxz87-cyber/Alert1/commit/b5ccffd990495eb173329975e78473b2ffed929e): PR #1 merged at commit [`6b0e47cc`](https://github.com/kanlerxz87-cyber/Alert1/commit/6b0e47ccbf02cbba548e201800a23952a97df047); GitHub [Pages build/deploy](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45697413860) and [published delivery check](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45697485397) succeeded.

---

# Session `arena/fae80285-alert1` — Live MLB StatsAPI Verification, Upcoming Game Days Readiness & Line-by-Line Audit (`2026-11-25`)

- **Session ID:** `fae80285` · **Branch (fixed by Arena sandbox):** `arena/fae80285-alert1` (fast-forwarded onto `main` @ [`6b0e47c`](https://github.com/kanlerxz87-cyber/Alert1/commit/6b0e47ccbf02cbba548e201800a23952a97df047)).
- **Branch-naming note:** Arena locks each session to its assigned branch (`arena/fae80285-alert1`) and forbids creating/pushing other branches, so the brief's `session-<id>/<task>` branch convention cannot be followed literally; logged as an irregularity on `flagged.html` (same as upstream `F-001`).
- **Parallel-session coordination check (`2026-11-25T20:45Z`):**
  - `arena-db1b5438` merged initial upstream copy via [PR #1](https://github.com/kanlerxz87-cyber/Alert1/pull/1) (`6b0e47c`) and marked its board row `needs review` (non-blocking per coordination rules), specifically noting that live `statsapi.mlb.com` and reference `snapquast73-boop.github.io/LIVPBP` verification remained open.
  - Active sibling branch `arena/c394a038-alert1` is working in parallel from `66015a0`; before opening/merging our PR we will `git pull --rebase origin main` (or merge-preserve `origin/main`) so zero work from any parallel session is ever overwritten or discarded.

## Task Board (`arena/fae80285-alert1`)

| Task ID | Task | Status | Owning Session | File Scope | Official Source |
|---|---|---|---|---|---|
| `FAE-1` | Line-by-line review of all repository files + **live verification** against official `statsapi.mlb.com` endpoints (`2026-08-26`, `2026-08-28`, `2026-10-28`, and upcoming 2027 game days `2027-02-19` / `2027-03-25`) and live reference [`LIVPBP/reviews.html?date=2026-08-26`](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26) | `in progress` | `fae80285` | `audit/alert1-live-verification-2026-11-25.md`, `COORDINATION.md` | [MLB `schedule?date=2026-08-26`](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26&hydrate=probablePitcher,linescore,decisions,review) · [MLB 2027 schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-11-25&endDate=2027-04-05&fields=dates,date,totalGames) |
| `FAE-2` | Upcoming game days readiness & `Alert1` repo-path adaptation: fix hardcoded `/LIVPBP/` base path in `404.html`, back off idle Replay Feed schedule polling on upcoming `Preview` / zero-game slates per README etiquette, surface official next scheduled game day alongside most recent game day on empty slates, and update repo metadata/demo links | `in progress` | `fae80285` | `404.html`, `assets/js/scoreboard.js`, `assets/js/reviews-feed.js`, `README.md`, `package.json` | [GitHub Pages API (`Alert1`)](https://api.github.com/repos/kanlerxz87-cyber/Alert1/pages) · [MLB 2027 Opening Day schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&hydrate=probablePitcher,linescore,decisions,review) |
| `FAE-3` | Line-by-line table & provenance audit across all HTML/Markdown tables (`flagged.html`, `README.md`, `docs/*.md`, `audit/*.md`, `tests/README.md`); ensure every row carries an official `https://` source link, leave unconfirmed values blank & flagged, publish `AL1-*` irregularities on `flagged.html`, and add regression suite `tests/alert1-upcoming-and-provenance.mjs` | `in progress` | `fae80285` | `flagged.html`, `docs/verification-report.md`, `tests/alert1-upcoming-and-provenance.mjs`, `tests/run-all.mjs` | [MLB `gameStatus`](https://statsapi.mlb.com/api/v1/gameStatus) · [MLB `game/823180/playByPlay`](https://statsapi.mlb.com/api/v1/game/823180/playByPlay) |
| `FAE-4` | Final integration: merge-preserve any parallel `main` updates, re-verify combined data line by line, run all test & link suites, open & merge PR to `main`, confirm GitHub Pages deploy + live [`Alert1/reviews.html?date=2026-08-26`](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26) and upcoming game-day rendering | `in progress` | `fae80285` | `COORDINATION.md` | [GitHub Pages (`Alert1`)](https://kanlerxz87-cyber.github.io/Alert1/) |

