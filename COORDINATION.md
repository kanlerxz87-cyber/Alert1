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
- PR #1 merged at commit [6b0e47cc](https://github.com/kanlerxz87-cyber/Alert1/commit/6b0e47ccbf02cbba548e201800a23952a97df047). GitHub [Pages build/deploy](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45697413860) and [published delivery check](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45697485397) succeeded. The live MLB/API and data verification limitations above remain open. This post-merge log entry is on the session branch, not the merged main revision.
