# COORDINATION.md — shared task board

Repo: `kanlerxz87-cyber/Alert1` · Site: https://kanlerxz87-cyber.github.io/Alert1/
Reference: https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26
Copied source: https://github.com/snapquast73-boop/LIVPBP @ `5c02527d3c7a56ea66c698cfabff80a407b6dfd3`

Updated 2026-11-25 by session **`df7b58c1`** (branch `arena/df7b58c1-alert1`, fast-forwarded to `origin/main` @ `4369903`).

## Branch note (Arena sandbox restriction)

Arena fixes each session to one branch and forbids creating/pushing other branches, so the
brief's `session-<id>/<task>` branch convention cannot be followed literally. Each session's
work stays on its assigned branch only (`arena/db1b5438-alert1`, `arena/c394a038-alert1`,
`arena/8c1d3368-alert1`, `arena/df7b58c1-alert1`); integration is a pull request from that branch
into `main`. The deviation is published on [`flagged.html`](flagged.html) (C-7 / A1-9).

## Active task board — session `df7b58c1` (2026-11-25)

| ID | Task | Status | Owner | File scope | Notes / Verification |
|---|---|---|---|---|---|
| D-1 | Full 15-game `2026-08-26` (all 7 `hasChallenges` games, all 10 non-ABS + 68 ABS = 78 entries) & upcoming `2027` schedule (`2027-02-19` Spring Training, `2027-03-25` Opening Day) live StatsAPI verification | `done` | `df7b58c1` | `COORDINATION.md`, `flagged.html`, `docs/verification-report.md` | Verified all 15 games on `2026-08-26`, all 7 challenge games (`823180`, `823096`, `822692`, `823506`, `824555`, `823015`, `824963`), postseason end (`2026-10-28`), Spring Training (`2027-02-19`, 17 games), Opening Day (`2027-03-25`, 14 games including `startTimeTBD: true` on `854131`, `852663`, `853388`), all 30 teams, `gameStatus`, and `eventTypes`. |
| D-2 | Fix live-audited JS defects for upcoming game days & provenance (`startTimeTBD: true` rendering `TBD` instead of MLB's dummy `:33 AM` timestamps; `numOrNull(null/'')` non-zero-fill guard; `scheduleLoaded` guard eliminating premature `offerRecentDate()` mid-scan partial renders; non-live `reviews-feed.js` / `game.js` polling backoff; `officialDate` stamping on ingested entries) | `done` | `df7b58c1` | `assets/js/reviews.js`, `assets/js/scoreboard.js`, `assets/js/game.js`, `assets/js/reviews-feed.js` | Implemented and regression-tested (`tools/smoke-test.mjs` §[14]: 69 passed, 0 failed). |
| D-3 | Update stale upstream test URLs (`tests/*`), expand CI (`site-check.yml`), publish `df7b58c1` live verification + flagged irregularities (`A1-1`..`A1-9`) in `flagged.html` §16 & `docs/verification-report.md` §9, and verify every table row carries an official source link | `done` | `df7b58c1` | `tests/*`, `tools/smoke-test.mjs`, `.github/workflows/site-check.yml`, `README.md`, `flagged.html`, `docs/verification-report.md` | Verified 123/123 `flagged.html` rows & 84/84 `docs/verification-report.md` data rows carry official HTTPS source links; `run-all.mjs` (48 local refs, 8 bindings, 47 jsdom), `props-provenance-test.mjs` (5/5), and `restoration-check.mjs` all pass. |
| D-4 | Run all checks, open PR from `arena/df7b58c1-alert1` → `main`, merge autonomously, verify live Pages deployment (`2026-08-26`, `2027-03-25`, offseason, `game.html`, `flagged.html`, `404.html`), and record PR/merge/deploy evidence | `done` | `df7b58c1` | `COORDINATION.md` | PR #5 merged (`4369903`); `Site checks` (`45700146829`), `pages build and deployment` (`45700146423`), and `Published Pages delivery` (`45700231433`) all succeeded; verified live `reviews.html?date=2026-08-26` (15 games / 10 Reviews / 68 ABS / 78 entries), `/?date=2027-03-25` & `game.html?gamePk=854131` (`TBD` rendered cleanly for `startTimeTBD: true`), `reviews.html?date=2027-03-25` (14 scheduled games), `/?v=4369903` (offseason jump to `Wed Oct 28, 2026`), `game.html?gamePk=823180`, and `flagged.html` §16. |

## Parallel-session conflict resolution log

- **2026-11-25 (`df7b58c1`, merge #2):** Before opening PR from `arena/df7b58c1-alert1`, `origin/main` advanced to `a519cf1` via PR #3 (`arena-8c1d3368`, verification log) and PR #4 (`c394a038`, post-deploy verification §8.4 and closing out C-6). Merged `origin/main` cleanly with `git merge --no-ff origin/main` (no force-push). Conflicts in `COORDINATION.md`, `docs/verification-report.md`, and `flagged.html` were resolved by preserving 100% of `8c1d3368`'s log, `c394a038`'s §8.4 / integration record, and `df7b58c1`'s §9 / §16 side-by-side.
- **2026-11-25 (`df7b58c1`, merge #1):** While session `df7b58c1` was pushing its `COORDINATION.md` claim and JS fixes (branched from `6b0e47c`), parallel session `c394a038` merged PR #2 (`630dae2`) into `main`. Merged `origin/main` cleanly with `git merge --no-ff origin/main` (no force-push, no history rewritten). Conflicts in `404.html` and `COORDINATION.md` were resolved by keeping `c394a038`'s DOM-based `document.createElement('base')` `/Alert1/` fix in `404.html` and preserving 100% of both `arena-db1b5438` (PR #1) and `c394a038` (PR #2) records verbatim alongside `df7b58c1`'s follow-up board below.
- **2026-11-25 (`c394a038`):** Session `arena-db1b5438` claimed a repository-wide integration task and pushed it as PR #1 (merged into `main` as `6b0e47c`) while session `c394a038` was preparing its copy. Both sessions read the same source revision and produced overlapping file sets. Session `c394a038` did **not** overwrite the other session's work: `git merge --no-ff origin/main` was used, with conflicts in `.github/workflows/pages-delivery.yml`, `404.html`, `COORDINATION.md`, `README.md`, `docs/verification-report.md` and `flagged.html`. Resolution: `db1b5438`'s deliberate removal of the Pages-delivery PR trigger was kept; `c394a038`'s 404 base-path fix, live verification section, Flagged §15, README source links and board entries were added on top. The duplicated upstream board was deduplicated in favour of `audit/upstream-coordination.md` (`docs/upstream-COORDINATION.md` was removed, not its content). No force-push was used; no other session's commit was rewritten.

---

## Preserved board — session `c394a038` (verbatim from PR #2 @ `630dae2` & PR #4 @ `a519cf1`)

| Task | Status | Session | File scope | Notes |
|---|---|---|---|---|
| C-1 Create board, claim work, push claim | done | `c394a038` | `COORDINATION.md` | Claim pushed before any site files were copied |
| C-2 Copy upstream source repo | done | `c394a038` | all site files | Source tree: https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/5c02527d3c7a56ea66c698cfabff80a407b6dfd3?recursive=1 |
| C-3 Line-by-line review vs official sources | done | `c394a038` | `assets/js/*.js`, HTML pages, `server.mjs`, workflows | Report §8.1: https://github.com/kanlerxz87-cyber/Alert1/blob/main/docs/verification-report.md |
| C-4 Verify table rows' source links; blank + flag unverified values | done | `c394a038` | `flagged.html`, `docs/verification-report.md` | 106 data rows §§1–14 + 8 new rows §15 checked; 0 without a source link |
| C-5 Make Pages deployment work for upcoming game days | done | `c394a038` | `404.html`, `package.json`, README, workflows | Base path `/LIVPBP/` → `/Alert1/`; other deployment fixes kept from PR #1 |
| C-6 Full checks, live pages, PR → merge → Pages deploy | done | `c394a038` | repo root | PR #2 merged; Pages `built`; live pages and upcoming game day verified |

### Integration record (session `c394a038`, verbatim)

**PR [#2](https://github.com/kanlerxz87-cyber/Alert1/pull/2) — MERGED** (`gh pr merge 2 --merge`) into `main` as merge commit
[`630dae2`](https://github.com/kanlerxz87-cyber/Alert1/commit/630dae226c1f9e956ef1775daeea6bb1c48e314d).

- Pre-merge checks on the PR head: `Site checks` runs `test` (pass) and `dom-smoke` (pass) —
  https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45698193565.
- Pages: [`pages/builds/latest`](https://api.github.com/repos/kanlerxz87-cyber/Alert1/pages/builds/latest)
  → commit `630dae2`, status **built**; [`Published Pages delivery`](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45698402504)
  → **success**; [`Site checks` on main](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45698402499) → success.
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

---

## Preserved boards — sessions `arena-db1b5438` (PR #1) & `arena-8c1d3368` (PR #3) (verbatim)

| Task | Status | Owner | File scope |
|---|---|---|---|
| Copy LIVPBP, verify sources and integrate/deploy | needs review (superseded for live checks by PR #2/#4 & `df7b58c1`) | arena-db1b5438 | Repository-wide, including site, workflows, documentation and this board |
| Verify copy, tests, deployment, and upcoming-date readiness | needs review (superseded for live checks by PR #2/#4 & `df7b58c1`) | arena-8c1d3368 | Verification, COORDINATION.md, no functional code changes |

### Log (preserved)

- 2026-11-25 (`arena-db1b5438`): Claimed initial integration; repository contained only README.md and no board. Other sessions should coordinate before touching this scope.
- 2026-11-25 (`arena-db1b5438`): Copied upstream [LIVPBP commit 5c02527d3c7a56ea66c698cfabff80a407b6dfd3](https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3), preserving its MIT license and historical coordination log in `audit/upstream-coordination.md`.
- 2026-11-25 (`arena-db1b5438`): Verification: `npm ci`, `npm test` (64 passed), `node tests/run-all.mjs` (syntax, 41 local links, contracts, 47 fixture render checks), `node tools/restoration-check.mjs`, and `node tests/props-provenance-test.mjs` (5 passed). These use offline fixtures, not a live MLB check.
- 2026-11-25 (`arena-db1b5438`): Needs review: Sandbox cannot connect to [official MLB schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26) or the [reference deployment](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26); live responses, CORS, parity, upcoming game days and inherited row-by-row verification remain unverified. Disclosed on `flagged.html`. Upstream model constants and reconstructed assets also remain flagged there. The optional feed-log server is not provided by static Pages.
- 2026-11-25 (`arena-db1b5438`): Integration PR: https://github.com/kanlerxz87-cyber/Alert1/pull/1 (merged at `6b0e47c`; Pages built and published at `https://kanlerxz87-cyber.github.io/Alert1/`, `Published Pages delivery` run `45697485397` succeeded).
- 2026-11-25 (`arena-db1b5438`): The upstream published-delivery workflow failed on the PR before initial deployment: it checks the existing Pages revision, which predates this site. Removed its PR trigger; it remains enabled after Pages deployment and on manual dispatch.
- 2026-11-25 (`arena-8c1d3368`): Verified working copy on branch `arena/8c1d3368-alert1` (merged via PR #3 @ `bd60a11`). Confirmed upstream source is `snapquast73-boop/LIVPBP` main @ `5c02527d3c7a56ea66c698cfabff80a407b6dfd3` (GitHub API); core site files (`assets/js/*.js`, `index.html`, `game.html`, `reviews.html`) are byte-identical to upstream; `flagged.html` differs only by inherited copy/disclosure additions. Installed deps (`npm ci`) and ran: `npm test` / `node tools/smoke-test.mjs` (64 passed, 0 failed), `node tests/run-all.mjs` (syntax, 41 local links, 8 contract bindings, 47 jsdom render checks all PASS), `node tools/restoration-check.mjs` (ALL CHECKS PASSED including server/route checks), `node tests/props-provenance-test.mjs` (5 passed, 0 failed). Confirmed GitHub Pages is built/enforced at https://kanlerxz87-cyber.github.io/Alert1/ (build `6b0e47cc`, status built). Fetched live deployed `reviews.html?date=2026-08-26` via page renderer: page rendered review feed content for 2026-08-26 (10 reviews, 8 challenges, 2 umpire, 68 ABS, 1 boundary, 0 under review, 1 runs at risk, 15 games, 78 tracked entries; source links to official MLB StatsAPI play-by-play). Date handling is query-param/local-calendar driven (`MLB.todayISO`, `MLB.isValidISODate`, `shiftISODate`) with no hardcoded game dates in JS, so upcoming game days are handled by selecting/landing on the target date. **Not verified in this sandbox:** live MLB StatsAPI reachability from sandbox (statsapi.mlb.com not in sandbox allowlist), end-to-end live browser polling against MLB, and exact parity of rendered counts against the reference deployment at the same instant. No functional code changes made. Merged `origin/main` (630dae2, PR #2) into this branch to resolve COORDINATION.md conflict; no other-session work discarded.

---

## Pull Requests & Deployment Log

| PR | Session / Branch | Merge Commit | GitHub Pages Status | Verification |
|---|---|---|---|---|
| [#1](https://github.com/kanlerxz87-cyber/Alert1/pull/1) | `arena-db1b5438` / `arena/db1b5438-alert1` | `6b0e47c` | `built` (`Published Pages delivery` run `45697485397` succeeded) | Offline fixture suites passed; live MLB verification marked `needs review` |
| [#2](https://github.com/kanlerxz87-cyber/Alert1/pull/2) | `c394a038` / `arena/c394a038-alert1` | `630dae2` | `built` (`Published Pages delivery` run `45698402504` succeeded) | Fixed `404.html` `/Alert1/` base path + live `2026-08-26` & `2027-04-01` verification |
| [#3](https://github.com/kanlerxz87-cyber/Alert1/pull/3) | `arena-8c1d3368` / `arena/8c1d3368-alert1` | `bd60a11` | `built` | Independent offline + live `reviews.html?date=2026-08-26` verification log |
| [#4](https://github.com/kanlerxz87-cyber/Alert1/pull/4) | `c394a038` / `arena/c394a038-alert1` | `a519cf1` | `built` | Recorded PR #2 live deployment verification (§8.4) and closed C-6 |
| [#5](https://github.com/kanlerxz87-cyber/Alert1/pull/5) | `df7b58c1` / `arena/df7b58c1-alert1` | `4369903` | `built` (`Site checks` run [`45700146829`](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45700146829), `pages build` [`45700146423`](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45700146423), `Published Pages delivery` [`45700231433`](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45700231433) all `success`) | Fixed upcoming 2027 `startTimeTBD` (`TBD` on `854131`/`852663`/`853388`), `numOrNull` null/empty guard, `scheduleLoaded` mid-scan fix, non-live polling backoff, `officialDate` stamping, §14 regressions (69 passed), CI expansion, §16 / §9 live verification; verified live on Pages (`2026-08-26`, `2027-03-25`, `854131`, `823180`, offseason, `flagged.html`) |
