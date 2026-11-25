# Coordination board

| Task | Status | Owner | File scope |
|---|---|---|---|
| Copy LIVPBP, verify sources and integrate/deploy | needs review | arena-db1b5438 | Repository-wide, including site, workflows, documentation and this board (completed via PR #1 @ `6b0e47c`; flagged `needs review` for live MLB StatsAPI, reference parity & upcoming game day checks) |
| Live StatsAPI + reference parity verification (`2026-08-26` & `2027` upcoming dates), fix `404.html` `/Alert1/` base path, fix `startTimeTBD` / `numOrNull` / `scheduleLoaded` / non-live polling backoff / `officialDate` stamping, update `README.md` / `tests/*` / `flagged.html` & verify deployed Pages | in progress | arena-df7b58c1 | `404.html`, `assets/js/reviews.js`, `assets/js/scoreboard.js`, `assets/js/reviews-feed.js`, `assets/js/game.js`, `README.md`, `flagged.html`, `docs/verification-report.md`, `tests/*`, `tools/smoke-test.mjs`, `.github/workflows/site-check.yml`, `COORDINATION.md` |

## Branch policy note
- Session `arena-df7b58c1` works strictly on Arena fixed working branch `arena/df7b58c1-alert1` (based on `origin/main` @ `6b0e47c`) rather than creating `session-<id>/<task>`, per platform branch policy.

## Log
- 2026-11-25 (`arena-db1b5438`): Claimed initial integration; repository contained only README.md and no board. Other sessions should coordinate before touching this scope.
- 2026-11-25 (`arena-db1b5438`): Copied upstream [LIVPBP commit 5c02527d3c7a56ea66c698cfabff80a407b6dfd3](https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3), preserving its MIT license and historical coordination log in `audit/upstream-coordination.md`.
- 2026-11-25 (`arena-db1b5438`): Verification: `npm ci`, `npm test` (64 passed), `node tests/run-all.mjs` (syntax, 41 local links, contracts, 47 fixture render checks), `node tools/restoration-check.mjs`, and `node tests/props-provenance-test.mjs` (5 passed). These use offline fixtures, not a live MLB check.
- 2026-11-25 (`arena-db1b5438`): Needs review: Sandbox cannot connect to [official MLB schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26) or the [reference deployment](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26); live responses, CORS, parity, upcoming game days and inherited row-by-row verification remain unverified. Disclosed on `flagged.html`. Upstream model constants and reconstructed assets also remain flagged there. The optional feed-log server is not provided by static Pages.
- 2026-11-25 (`arena-db1b5438`): Integration PR: https://github.com/kanlerxz87-cyber/Alert1/pull/1 (merged at `6b0e47c`; Pages built and published at `https://kanlerxz87-cyber.github.io/Alert1/`, `Published Pages delivery` run `45697485397` succeeded).
- 2026-11-25 (`arena-db1b5438`): The upstream published-delivery workflow failed on the PR before initial deployment: it checks the existing Pages revision, which predates this site. Removed its PR trigger; it remains enabled after Pages deployment and on manual dispatch.
- 2026-11-25 (`arena-df7b58c1`): Picked up `needs review` follow-up after PR #1 merged (`6b0e47c`). Completed live verification against `statsapi.mlb.com` (`2026-08-26` all 15 games + all 7 challenge games, `2026-10-28` last 2026 game, `2027-02-19` Spring Training, `2027-03-25` Opening Day, `teams?sportId=1`, `gameStatus`, `eventTypes`) and live rendered parity checks against both `snapquast73-boop.github.io/LIVPBP` and `kanlerxz87-cyber.github.io/Alert1`. Claimed targeted fixes and documentation/verification updates above.
