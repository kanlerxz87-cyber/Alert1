# COORDINATION.md — shared task board

Repo: `kanlerxz87-cyber/Alert1` · Site: https://kanlerxz87-cyber.github.io/Alert1/
Reference: https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26
Copied source: https://github.com/snapquast73-boop/LIVPBP @ `5c02527d3c7a56ea66c698cfabff80a407b6dfd3`

Updated 2026-11-25 by session **`da098af9`** (branch `arena/da098af9-alert1`, branched from `origin/main` @ `e22ec1d`) preserving all prior parallel sessions (`db1b5438`, `c394a038`, `8c1d3368`, `df7b58c1`, `fae80285`).

## Branch note (Arena sandbox restriction)

Arena fixes each session to one branch and forbids creating/pushing other branches, so the
brief's `session-<id>/<task>` branch convention cannot be followed literally. Each session's
work stays on its assigned branch only (`arena/db1b5438-alert1`, `arena/c394a038-alert1`,
`arena/8c1d3368-alert1`, `arena/df7b58c1-alert1`, `arena/fae80285-alert1`, `arena/da098af9-alert1`); integration is a pull request from that branch
into `main`. The deviation is published on [`flagged.html`](https://kanlerxz87-cyber.github.io/Alert1/flagged.html) (C-7 / A1-9 / F-5).

## Active task board — session `da098af9` (2026-11-25)

| ID | Task | Status | Owner | File scope | Notes / Official Source |
|---|---|---|---|---|---|
| DA-1 | Line-by-line review of all repository code, HTML, workflows, and upstream copy (`snapquast73-boop/LIVPBP` @ `5c02527`) + official MLB StatsAPI verification of `2026-08-26` and upcoming `2027` game days (`2027-02-19`, `2027-03-25`, `2027-04-01`, offseason `2026-11-25`) | `in progress` | `da098af9` | `audit/da098af9-verification-2026-11-25.md`, `COORDINATION.md` | Upstream commit: https://github.com/snapquast73-boop/LIVPBP/commit/5c02527d3c7a56ea66c698cfabff80a407b6dfd3 ; reference feed: https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26 ; official API: https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26 |
| DA-2 | Inspect and fix any confirmed upcoming-game-day or parity defects (only if needed after line-by-line review) + add scoped regression test | `unclaimed` | `da098af9` | `tests/da098af9-upcoming-and-parity-test.mjs` (plus targeted JS/HTML only if defect confirmed; coordinate on `COORDINATION.md` if overlapping) | Official upcoming schedule: https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25 |
| DA-3 | Verify 100% official `https://` source-link coverage across every HTML/Markdown table row; leave any unconfirmed value blank and publish flagged items on `flagged.html` | `unclaimed` | `da098af9` | `audit/da098af9-verification-2026-11-25.md`, `flagged.html` (integrate cleanly with `origin/main`) | Flagged page: https://kanlerxz87-cyber.github.io/Alert1/flagged.html |
| DA-4 | Final integration: merge `origin/main` cleanly preserving all parallel sessions' work, run full test/link/provenance suites, open PR `arena/da098af9-alert1` → `main`, merge autonomously, verify live GitHub Pages deployment, and record PR + merge result | `unclaimed` | `da098af9` | `COORDINATION.md` | Live deployment: https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26 |

## Preserved board — session `fae80285` (2026-11-25)

| ID | Task | Status | Owner | File scope | Notes / Official Source |
|---|---|---|---|---|---|
| F-1 | Line-by-line audit + live official MLB StatsAPI & GitHub Pages verification of all 10 non-ABS review rows on `2026-08-26` + upcoming `2027-02-19` / `2027-03-25` slates | `done` | `fae80285` | `audit/alert1-live-verification-2026-11-25.md`, `flagged.html` | Verified all 10 `2026-08-26` non-ABS review plays verbatim + flagged 3 upstream MLB StatsAPI `reviewDetails` schema irregularities (`823506:56:0:MA` `"Pickoff Attempt 1B"`, `823506:19:5:NH` `"Foul"`, `823180:84:p:NF` dual-call crew review): https://statsapi.mlb.com/api/v1/game/823506/playByPlay |
| F-2 | Static-host `FeedLog.openStream` / `postNow` guard on `*.github.io` + upcoming-game-day jump button (`Next scheduled game day: Fri Feb 19, 2027`) on empty offseason slates | `done` | `fae80285` | `assets/js/feed-log.js`, `assets/js/scoreboard.js`, `assets/js/reviews-feed.js` | `isStaticHost()` prevents failing `/api/feed-log/stream` SSE & `POST /api/feed-log` calls on GitHub Pages; single `[-180d, +180d]` `scheduleRange` call surfaces both recent (`2026-10-28`) and next (`2027-02-19`) game days: https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-05-29&endDate=2027-05-24&fields=dates,date,totalGames |
| F-3 | Enforce 100% official `https://` source links across all HTML/Markdown table rows + add `tests/alert1-feedlog-and-provenance-test.mjs` to CI | `done` | `fae80285` | `audit/reference-parity-2026-11-22.md`, `flagged.html`, `tests/alert1-feedlog-and-provenance-test.mjs`, `.github/workflows/site-check.yml` | All suites pass (`npm test` 69/69, `run-all.mjs` 50 local refs / 8 bindings / 47 jsdom, `props-provenance-test.mjs` 5/5, `alert1-feedlog-and-provenance-test.mjs` 4/4, `restoration-check.mjs` PASS): https://github.com/kanlerxz87-cyber/Alert1/blob/main/.github/workflows/site-check.yml |
| F-4 | Run all checks, open PR from `arena/fae80285-alert1` → `main`, merge autonomously, verify live GitHub Pages deployment, and record PR/merge result | `done` | `fae80285` | `COORDINATION.md` | PR #7 merged (`d99fada`); `Site checks` (`45701125867` / `45701271491`), `pages build and deployment` (`45701272090`), and `Published Pages delivery` (`45701380313`) all `success`; live Pages verified at https://kanlerxz87-cyber.github.io/Alert1/ (`?v=d99fada` offering both `2026-10-28` & `2027-02-19`, `?date=2027-03-25`, `reviews.html?date=2027-03-25`, `reviews.html?date=2026-08-26`, `flagged.html` §17) — https://github.com/kanlerxz87-cyber/Alert1/pull/7 |

## Preserved board — session `df7b58c1` (PR #5 @ `4369903` & PR #6 @ `a332f09`)

| ID | Task | Status | Owner | File scope | Notes / Verification |
|---|---|---|---|---|---|
| D-1 | Full 15-game `2026-08-26` (all 7 `hasChallenges` games, all 10 non-ABS + 68 ABS = 78 entries) & upcoming `2027` schedule (`2027-02-19` Spring Training, `2027-03-25` Opening Day) live StatsAPI verification | `done` | `df7b58c1` | `COORDINATION.md`, `flagged.html`, `docs/verification-report.md` | Verified all 15 games on `2026-08-26`, all 7 challenge games (`823180`, `823096`, `822692`, `823506`, `824555`, `823015`, `824963`), postseason end (`2026-10-28`), Spring Training (`2027-02-19`, 17 games), Opening Day (`2027-03-25`, 14 games including `startTimeTBD: true` on `854131`, `852663`, `853388`), all 30 teams, `gameStatus`, and `eventTypes` — https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25 |
| D-2 | Fix live-audited JS defects for upcoming game days & provenance (`startTimeTBD: true` rendering `TBD` instead of MLB's dummy `:33 AM` timestamps; `numOrNull(null/'')` non-zero-fill guard; `scheduleLoaded` guard eliminating premature `offerRecentDate()` mid-scan partial renders; non-live `reviews-feed.js` / `game.js` polling backoff; `officialDate` stamping on ingested entries) | `done` | `df7b58c1` | `assets/js/reviews.js`, `assets/js/scoreboard.js`, `assets/js/game.js`, `assets/js/reviews-feed.js` | Implemented and regression-tested (`tools/smoke-test.mjs` §[14]: 69 passed, 0 failed) — https://github.com/kanlerxz87-cyber/Alert1/pull/5 |
| D-3 | Update stale upstream test URLs (`tests/*`), expand CI (`site-check.yml`), publish `df7b58c1` live verification + flagged irregularities (`A1-1`..`A1-9`) in `flagged.html` §16 & `docs/verification-report.md` §9, and verify every table row carries an official source link | `done` | `df7b58c1` | `tests/*`, `tools/smoke-test.mjs`, `.github/workflows/site-check.yml`, `README.md`, `flagged.html`, `docs/verification-report.md` | Verified 123/123 `flagged.html` rows & 84/84 `docs/verification-report.md` data rows carry official HTTPS source links; `run-all.mjs` (48 local refs, 8 bindings, 47 jsdom), `props-provenance-test.mjs` (5/5), and `restoration-check.mjs` all pass — https://github.com/kanlerxz87-cyber/Alert1/pull/5 |
| D-4 | Run all checks, open PR from `arena/df7b58c1-alert1` → `main`, merge autonomously, verify live Pages deployment (`2026-08-26`, `2027-03-25`, offseason, `game.html`, `flagged.html`, `404.html`), and record PR/merge/deploy evidence | `done` | `df7b58c1` | `COORDINATION.md` | PR #5 merged (`4369903`); `Site checks` (`45700146829`), `pages build and deployment` (`45700146423`), and `Published Pages delivery` (`45700231433`) all succeeded; verified live `reviews.html?date=2026-08-26`, `/?date=2027-03-25`, `game.html?gamePk=854131`, `game.html?gamePk=823180`, and `flagged.html` §16 — https://github.com/kanlerxz87-cyber/Alert1/pull/6 |

## Parallel-session conflict resolution log

- **2026-11-25 (`fae80285`):** Branched `arena/fae80285-alert1` from `6b0e47c` (PR #1), pushed initial `COORDINATION.md` claim (`8ad81d0`), and restricted initial implementation commits strictly to non-overlapping files (`assets/js/feed-log.js`, `audit/alert1-live-verification-2026-11-25.md`, `audit/reference-parity-2026-11-22.md`, `tests/alert1-feedlog-and-provenance-test.mjs`) while parallel sessions `c394a038` (PR #2, PR #4), `8c1d3368` (PR #3), and `df7b58c1` (PR #5, PR #6) completed and merged to `main` (`a332f09`). Merged `origin/main` cleanly via `git merge --no-ff origin/main` (no force-push); conflicts in `COORDINATION.md` were resolved by preserving 100% of all four sessions' boards and deployment logs verbatim alongside `fae80285`'s active board.
- **2026-11-25 (`df7b58c1`, merge #2):** Before opening PR from `arena/df7b58c1-alert1`, `origin/main` advanced to `a519cf1` via PR #3 (`arena-8c1d3368`, verification log) and PR #4 (`c394a038`, post-deploy verification §8.4 and closing out C-6). Merged `origin/main` cleanly with `git merge --no-ff origin/main` (no force-push). Conflicts in `COORDINATION.md`, `docs/verification-report.md`, and `flagged.html` were resolved by preserving 100% of `8c1d3368`'s log, `c394a038`'s §8.4 / integration record, and `df7b58c1`'s §9 / §16 side-by-side.
- **2026-11-25 (`df7b58c1`, merge #1):** While session `df7b58c1` was pushing its `COORDINATION.md` claim and JS fixes (branched from `6b0e47c`), parallel session `c394a038` merged PR #2 (`630dae2`) into `main`. Merged `origin/main` cleanly with `git merge --no-ff origin/main` (no force-push, no history rewritten). Conflicts in `404.html` and `COORDINATION.md` were resolved by keeping `c394a038`'s DOM-based `document.createElement('base')` `/Alert1/` fix in `404.html` and preserving 100% of both `arena-db1b5438` (PR #1) and `c394a038` (PR #2) records verbatim alongside `df7b58c1`'s follow-up board below.
- **2026-11-25 (`c394a038`):** Session `arena-db1b5438` claimed a repository-wide integration task and pushed it as PR #1 (merged into `main` as `6b0e47c`) while session `c394a038` was preparing its copy. Both sessions read the same source revision and produced overlapping file sets. Session `c394a038` did **not** overwrite the other session's work: `git merge --no-ff origin/main` was used, with conflicts in `.github/workflows/pages-delivery.yml`, `404.html`, `COORDINATION.md`, `README.md`, `docs/verification-report.md` and `flagged.html`. Resolution: `db1b5438`'s deliberate removal of the Pages-delivery PR trigger was kept; `c394a038`'s 404 base-path fix, live verification section, Flagged §15, README source links and board entries were added on top. The duplicated upstream board was deduplicated in favour of `audit/upstream-coordination.md` (`docs/upstream-COORDINATION.md` was removed, not its content). No force-push was used; no other session's commit was rewritten.

---

## Preserved board — session `c394a038` (verbatim from PR #2 @ `630dae2` & PR #4 @ `a519cf1`)

| Task | Status | Session | File scope | Notes |
|---|---|---|---|---|
| C-1 Create board, claim work, push claim | done | `c394a038` | `COORDINATION.md` | Claim pushed before any site files were copied — https://github.com/kanlerxz87-cyber/Alert1/pull/2 |
| C-2 Copy upstream source repo | done | `c394a038` | all site files | Source tree: https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/5c02527d3c7a56ea66c698cfabff80a407b6dfd3?recursive=1 |
| C-3 Line-by-line review vs official sources | done | `c394a038` | `assets/js/*.js`, HTML pages, `server.mjs`, workflows | Report §8.1: https://github.com/kanlerxz87-cyber/Alert1/blob/main/docs/verification-report.md |
| C-4 Verify table rows' source links; blank + flag unverified values | done | `c394a038` | `flagged.html`, `docs/verification-report.md` | 106 data rows §§1–14 + 8 new rows §15 checked; 0 without a source link — https://kanlerxz87-cyber.github.io/Alert1/flagged.html |
| C-5 Make Pages deployment work for upcoming game days | done | `c394a038` | `404.html`, `package.json`, README, workflows | Base path `/LIVPBP/` → `/Alert1/`; other deployment fixes kept from PR #1 — https://github.com/kanlerxz87-cyber/Alert1/pull/2 |
| C-6 Full checks, live pages, PR → merge → Pages deploy | done | `c394a038` | repo root | PR #2 merged; Pages `built`; live pages and upcoming game day verified — https://github.com/kanlerxz87-cyber/Alert1/pull/4 |

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

| Task | Status | Owner | File scope | Official Source |
|---|---|---|---|---|
| Copy LIVPBP, verify sources and integrate/deploy | needs review (superseded for live checks by PR #2/#4 & `df7b58c1`) | arena-db1b5438 | Repository-wide, including site, workflows, documentation and this board | https://github.com/kanlerxz87-cyber/Alert1/pull/1 |
| Verify copy, tests, deployment, and upcoming-date readiness | needs review (superseded for live checks by PR #2/#4 & `df7b58c1`) | arena-8c1d3368 | Verification, COORDINATION.md, no functional code changes | https://github.com/kanlerxz87-cyber/Alert1/pull/3 |

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
| [#6](https://github.com/kanlerxz87-cyber/Alert1/pull/6) | `df7b58c1` / `arena/df7b58c1-alert1` | `a332f09` | `built` | Recorded PR #5 merge & live Pages deployment verification in `COORDINATION.md` |
| [#7](https://github.com/kanlerxz87-cyber/Alert1/pull/7) | `fae80285` / `arena/fae80285-alert1` | `d99fada` | `built` (`Site checks` [`45701271491`](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45701271491), `pages build` [`45701272090`](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45701272090), `Published Pages delivery` [`45701380313`](https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45701380313) all `success`) | Static-host `FeedLog` guard (`openStream`/`postNow`), offseason upcoming-date jump (`Next scheduled game day: Fri Feb 19, 2027`), play-level `2026-08-26` official verification (`audit/alert1-live-verification-2026-11-25.md` + `flagged.html` §17 `F-1`..`F-5`), and 100% official `https://` table-row provenance enforcement (`tests/alert1-feedlog-and-provenance-test.mjs`) |
