# COORDINATION.md — shared task board

Repo: `kanlerxz87-cyber/Alert1` · Site: https://kanlerxz87-cyber.github.io/Alert1/
Reference: https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26
Copied source: https://github.com/snapquast73-boop/LIVPBP @ `5c02527d3c7a56ea66c698cfabff80a407b6dfd3`

Updated 2026-11-25 by session **`c394a038`** (branch `arena/c394a038-alert1`, from `main` @ `66015a0`).

## Branch note (Arena sandbox restriction)

Arena fixes each session to one branch and forbids creating/pushing other branches, so the
brief's `session-<id>/<task>` branch convention cannot be followed literally. This session's
work is on the assigned branch only; integration is a pull request from it into `main`.
The deviation is published as C-7 on the Flagged for Review page.

## Task board (session `c394a038`)

| Task | Status | Session | File scope | Notes |
|---|---|---|---|---|
| C-1 Create board, claim work, push claim | done | `c394a038` | `COORDINATION.md` | Claim pushed before any site files were copied |
| C-2 Copy upstream source repo | done | `c394a038` | all site files | Source tree: https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/5c02527d3c7a56ea66c698cfabff80a407b6dfd3?recursive=1 |
| C-3 Line-by-line review vs official sources | done | `c394a038` | `assets/js/*.js`, HTML pages, `server.mjs`, workflows | Report §8.1: https://github.com/kanlerxz87-cyber/Alert1/blob/arena/c394a038-alert1/docs/verification-report.md |
| C-4 Verify table rows' source links; blank + flag unverified values | done | `c394a038` | `flagged.html`, `docs/verification-report.md` | 106 data rows §§1–14 + 8 new rows §15 checked; 0 without a source link |
| C-5 Make Pages deployment work for upcoming game days | done | `c394a038` | `404.html`, `package.json`, README, workflows | Base path `/LIVPBP/` → `/Alert1/`; other deployment fixes kept from PR #1 |
| C-6 Full checks, live pages, PR → merge → Pages deploy | done | `c394a038` | repo root | PR #2 merged; Pages `built`; live pages and upcoming game day verified |

## Verification performed by `c394a038`

- Official schedule for the reference date (15 games, 823096/823180 game keys):
  https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26
- Official review payloads matching the three reference rows (MF, MA, NF):
  https://statsapi.mlb.com/api/v1/game/823096/playByPlay and
  https://statsapi.mlb.com/api/v1/game/823180/playByPlay
- Official CIN 10–9 SF line score and challenge/ABS counters:
  https://statsapi.mlb.com/api/v1/game/823180/linescore and
  https://statsapi.mlb.com/api/v1.1/game/823180/feed/live?fields=gameData,review,absChallenges,hasChallenges,away,home,used,remaining,usedSuccessful,usedFailed
- Official review-code wording and 30 club abbreviations:
  https://statsapi.mlb.com/api/v1/gameStatus and
  https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,name,abbreviation&season=2026
- Reference page compared: https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26
- Checks: `npm ci`, `npm test` (64 passed, 0 failed), `node tests/run-all.mjs`
  (syntax, 46 local refs, 8 bindings, 47 jsdom checks), `node tools/restoration-check.mjs`
  (ALL CHECKS PASSED), `node tests/props-provenance-test.mjs` (5 passed).
- Unconfirmed values were left blank and flagged (C-8 on `flagged.html`); nothing was inferred.
- Full table-by-table record: [`docs/verification-report.md` §8](docs/verification-report.md) and
  [`flagged.html` §15](flagged.html).

## Parallel-session coordination / conflict resolution

- 2026-11-25 — Session `arena-db1b5438` claimed a repository-wide integration task and pushed it
  as PR #1 (merged into `main` as `6b0e47c`) while this session was preparing its copy. Both
  sessions read the same source revision and produced overlapping file sets. This session did
  **not** overwrite the other session's work: `git merge --no-ff origin/main` was used, with
  conflicts in `.github/workflows/pages-delivery.yml`, `404.html`, `COORDINATION.md`, `README.md`,
  `docs/verification-report.md` and `flagged.html`.
- Resolution: the other session's deliberate removal of the Pages-delivery PR trigger was kept;
  this session's 404 base-path fix, live verification section, Flagged §15, README source links and
  board entries were added on top. The duplicated upstream board was deduplicated in favour of
  their `audit/upstream-coordination.md` (our `docs/upstream-COORDINATION.md` was removed, not its
  content). No force-push was used; no other session's commit was rewritten.
- The other session's board is preserved verbatim below. It describes live API access as
  unavailable in its sandbox; this session could reach the official endpoints and the reference
  page, so C-1…C-14 of §8 supersede that limitation without deleting the disclosure.

## Preserved board — session `arena-db1b5438` (verbatim from PR #1)

| Task | Status | Owner | File scope |
|---|---|---|---|
| Copy LIVPBP, verify sources and integrate/deploy | needs review | arena-db1b5438 | Repository-wide, including site, workflows, documentation and this board |
| Verify copy, tests, deployment, and upcoming-date readiness | needs review | arena-8c1d3368 | Verification, COORDINATION.md, no functional code changes |

## Log (preserved)

- 2026-11-25: Claimed initial integration; repository contained only README.md and no board. Other sessions should coordinate before touching this scope.
- 2026-11-25: Copied upstream [LIVPBP commit 5c02527d3c7a56ea66c698cfabff80a407b6dfd3](https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3), preserving its MIT license and historical coordination log in `audit/upstream-coordination.md`.
- Verification: `npm ci`, `npm test` (64 passed), `node tests/run-all.mjs` (syntax, 41 local links, contracts, 47 fixture render checks), `node tools/restoration-check.mjs`, and `node tests/props-provenance-test.mjs` (5 passed). These use offline fixtures, not a live MLB check.
- Needs review: Sandbox cannot connect to [official MLB schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26) or the [reference deployment](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26); live responses, CORS, parity, upcoming game days and inherited row-by-row verification remain unverified. Disclosed on `flagged.html`. Upstream model constants and reconstructed assets also remain flagged there. The optional feed-log server is not provided by static Pages.
- Integration PR: https://github.com/kanlerxz87-cyber/Alert1/pull/1 (merge and deployment pending).
- The upstream published-delivery workflow failed on the PR before initial deployment: it checks the existing Pages revision, which predates this site. Removed its PR trigger; it remains enabled after Pages deployment and on manual dispatch.
- 2026-11-25 (arena-8c1d3368): Verified working copy on branch `arena/8c1d3368-alert1`. Confirmed upstream source is `snapquast73-boop/LIVPBP` main @ `5c02527d3c7a56ea66c698cfabff80a407b6dfd3` (GitHub API); core site files (`assets/js/*.js`, `index.html`, `game.html`, `reviews.html`) are byte-identical to upstream; `flagged.html` differs only by inherited copy/disclosure additions. Installed deps (`npm ci`) and ran: `npm test` / `node tools/smoke-test.mjs` (64 passed, 0 failed), `node tests/run-all.mjs` (syntax, 41 local links, 8 contract bindings, 47 jsdom render checks all PASS), `node tools/restoration-check.mjs` (ALL CHECKS PASSED including server/route checks), `node tests/props-provenance-test.mjs` (5 passed, 0 failed). Confirmed GitHub Pages is built/enforced at https://kanlerxz87-cyber.github.io/Alert1/ (build `6b0e47cc`, status built). Fetched live deployed `reviews.html?date=2026-08-26` via page renderer: page rendered review feed content for 2026-08-26 (10 reviews, 8 challenges, 2 umpire, 68 ABS, 1 boundary, 0 under review, 1 runs at risk, 15 games, 78 tracked entries; source links to official MLB StatsAPI play-by-play). Date handling is query-param/local-calendar driven (`MLB.todayISO`, `MLB.isValidISODate`, `shiftISODate`) with no hardcoded game dates in JS, so upcoming game days are handled by selecting/landing on the target date. **Not verified in this sandbox:** live MLB StatsAPI reachability from sandbox (statsapi.mlb.com not in sandbox allowlist), end-to-end live browser polling against MLB, and exact parity of rendered counts against the reference deployment at the same instant (fetch_page render contexts differ; reference sample showed 3 reviews/27 ABS/76 entries at a different scan time). No functional code changes made. Merged `origin/main` (630dae2, PR #2) into this branch to resolve COORDINATION.md conflict; no other-session work discarded.

## Integration record (session `c394a038`)

**PR [#2](https://github.com/kanlerxz87-cyber/Alert1/pull/2) — MERGED** (`gh pr merge 2 --merge`) into `main` as merge commit
[`630dae2`](https://github.com/kanlerxz87-cyber/Alert1/commit/630dae226c1f9e956ef1775daeea6bb1c48e314d).

- Pre-merge checks on the PR head: `Site checks` runs `test` (pass) and `dom-smoke` (pass) —
  https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45698193565.
- Pages: [`pages/builds/latest`](https://api.github.com/repos/kanlerxz87-cyber/Alert1/pages/builds/latest)
  → commit `630dae2`, status **built**; [`Published Pages delivery`](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45698402504)
  → **success**; [`Site checks` on main](https://github.com/kanlerxz87-cyber/Alert1/actions/45698402499) → success.
- Live pages: [`/reviews.html?date=2026-08-26`](https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26&verify=final)
  matches the [cache-busted reference](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26&cachebust=c394a038)
  (15 games, 10 Reviews, 8 Challenges, 2 Umpire reviews, 68 ABS, 1 boundary, 1 run at risk, 78 entries);
  [`/` scoreboard](https://kanlerxz87-cyber.github.io/Alert1/?date=2026-08-26&verify=final),
  [`/game.html?gamePk=823180`](https://kanlerxz87-cyber.github.io/Alert1/game.html?gamePk=823180&verify=final)
  and [`/flagged.html` §15](https://kanlerxz87-cyber.github.io/Alert1/flagged.html?verify=final) all render.
- Upcoming game day: `2027-04-01` renders 8 scheduled games on the scoreboard and feed, matching
  https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-04-01&fields=dates,date,totalGames,games,gamePk,officialDate,status,teams,team,name
  — no manual input.
- Verification caveat: the first fetch of the reference replay URL was a stale cached snapshot
  (3 rows, `3:38:33 PM`); a cache-busted fetch matched the live deployment. Recorded as C-25.
- All flagged/unverified items do not block the merge; they remain published on
  https://kanlerxz87-cyber.github.io/Alert1/flagged.html.
