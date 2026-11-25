# COORDINATION.md — shared task board

Repo: `kanlerxz87-cyber/Alert1` · Site: https://kanlerxz87-cyber.github.io/Alert1/
Reference: https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26
Copied source: https://github.com/snapquast73-boop/LIVPBP @ `5c02527d3c7a56ea66c698cfabff80a407b6dfd3`

Updated 2026-11-25 by session **`df7b58c1`** (branch `arena/df7b58c1-alert1`, merged with `origin/main` @ `630dae2`).

## Branch note (Arena sandbox restriction)

Arena fixes each session to one branch and forbids creating/pushing other branches, so the
brief's `session-<id>/<task>` branch convention cannot be followed literally. Each session's
work stays on its assigned branch only (`arena/db1b5438-alert1`, `arena/c394a038-alert1`,
`arena/df7b58c1-alert1`); integration is a pull request from that branch into `main`.
The deviation is published on [`flagged.html`](flagged.html) (C-7 / A1-9).

## Active task board — session `df7b58c1` (2026-11-25)

| ID | Task | Status | Owner | File scope | Notes / Verification |
|---|---|---|---|---|---|
| D-1 | Full 15-game `2026-08-26` (all 7 `hasChallenges` games, all 10 non-ABS + 68 ABS = 78 entries) & upcoming `2027` schedule (`2027-02-19` Spring Training, `2027-03-25` Opening Day) live StatsAPI verification | `done` | `df7b58c1` | `COORDINATION.md`, `flagged.html`, `docs/verification-report.md` | Verified all 15 games on `2026-08-26`, all 7 challenge games (`823180`, `823096`, `822692`, `823506`, `824555`, `823015`, `824963`), postseason end (`2026-10-28`), Spring Training (`2027-02-19`, 17 games), Opening Day (`2027-03-25`, 14 games including `startTimeTBD: true` on `854131`, `852663`, `853388`), all 30 teams, `gameStatus`, and `eventTypes`. |
| D-2 | Fix live-audited JS defects for upcoming game days & provenance (`startTimeTBD: true` rendering `TBD` instead of MLB's dummy `:33 AM` timestamps; `numOrNull(null/'')` non-zero-fill guard; `scheduleLoaded` guard eliminating premature `offerRecentDate()` mid-scan partial renders; non-live `reviews-feed.js` / `game.js` polling backoff; `officialDate` stamping on ingested entries) | `done` | `df7b58c1` | `assets/js/reviews.js`, `assets/js/scoreboard.js`, `assets/js/game.js`, `assets/js/reviews-feed.js` | Implemented and regression-tested (`tools/smoke-test.mjs` §[14]: 69 passed, 0 failed). |
| D-3 | Update stale upstream test URLs (`tests/*`), expand CI (`site-check.yml`), publish `df7b58c1` live verification + flagged irregularities (`A1-1`..`A1-9`) in `flagged.html` §16 & `docs/verification-report.md` §9, and verify every table row carries an official source link | `done` | `df7b58c1` | `tests/*`, `tools/smoke-test.mjs`, `.github/workflows/site-check.yml`, `README.md`, `flagged.html`, `docs/verification-report.md` | Verified 123/123 `flagged.html` rows & 78/78 `docs/verification-report.md` data rows carry official HTTPS source links; `run-all.mjs` (48 local refs, 8 bindings, 47 jsdom), `props-provenance-test.mjs` (5/5), and `restoration-check.mjs` all pass. |
| D-4 | Run all checks, open PR from `arena/df7b58c1-alert1` → `main`, merge autonomously, verify live Pages deployment (`2026-08-26`, `2027-03-25`, offseason, `game.html`, `flagged.html`, `404.html`), and record PR/merge/deploy evidence | `in progress` | `df7b58c1` | `COORDINATION.md` | Opening PR from `arena/df7b58c1-alert1` → `main` now. |

## Parallel-session conflict resolution log

- **2026-11-25 (`df7b58c1`):** While session `df7b58c1` was pushing its `COORDINATION.md` claim and JS fixes (branched from `6b0e47c`), parallel session `c394a038` merged PR #2 (`630dae2`) into `main`. Merged `origin/main` cleanly with `git merge --no-ff origin/main` (no force-push, no history rewritten). Conflicts in `404.html` and `COORDINATION.md` were resolved by keeping `c394a038`'s DOM-based `document.createElement('base')` `/Alert1/` fix in `404.html` and preserving 100% of both `arena-db1b5438` (PR #1) and `c394a038` (PR #2) records verbatim alongside `df7b58c1`'s follow-up board below.
- **2026-11-25 (`c394a038`):** Session `arena-db1b5438` claimed a repository-wide integration task and pushed it as PR #1 (merged into `main` as `6b0e47c`) while session `c394a038` was preparing its copy. Both sessions read the same source revision and produced overlapping file sets. Session `c394a038` did **not** overwrite the other session's work: `git merge --no-ff origin/main` was used, with conflicts in `.github/workflows/pages-delivery.yml`, `404.html`, `COORDINATION.md`, `README.md`, `docs/verification-report.md` and `flagged.html`. Resolution: `db1b5438`'s deliberate removal of the Pages-delivery PR trigger was kept; `c394a038`'s 404 base-path fix, live verification section, Flagged §15, README source links and board entries were added on top. The duplicated upstream board was deduplicated in favour of `audit/upstream-coordination.md` (`docs/upstream-COORDINATION.md` was removed, not its content). No force-push was used; no other session's commit was rewritten.

---

## Preserved board — session `c394a038` (verbatim from PR #2 @ `630dae2`)

| Task | Status | Session | File scope | Notes |
|---|---|---|---|---|
| C-1 Create board, claim work, push claim | done | `c394a038` | `COORDINATION.md` | Claim pushed before any site files were copied |
| C-2 Copy upstream source repo | done | `c394a038` | all site files | Source tree: https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/5c02527d3c7a56ea66c698cfabff80a407b6dfd3?recursive=1 |
| C-3 Line-by-line review vs official sources | done | `c394a038` | `assets/js/*.js`, HTML pages, `server.mjs`, workflows | Report §8.1: https://github.com/kanlerxz87-cyber/Alert1/blob/main/docs/verification-report.md |
| C-4 Verify table rows' source links; blank + flag unverified values | done | `c394a038` | `flagged.html`, `docs/verification-report.md` | 106 data rows §§1–14 + 8 new rows §15 checked; 0 without a source link |
| C-5 Make Pages deployment work for upcoming game days | done | `c394a038` | `404.html`, `package.json`, README, workflows | Base path `/LIVPBP/` → `/Alert1/`; other deployment fixes kept from PR #1 |
| C-6 Full checks, live pages, PR → merge → Pages deploy | done (merged via PR #2 @ `630dae2`) | `c394a038` | repo root | PR #2 merged into `main` at `630dae2`. |

### Verification performed by `c394a038`

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

---

## Preserved board — session `arena-db1b5438` (verbatim from PR #1 @ `6b0e47c`)

| Task | Status | Owner | File scope |
|---|---|---|---|
| Copy LIVPBP, verify sources and integrate/deploy | needs review (superseded by live checks in PR #2 & `df7b58c1`) | arena-db1b5438 | Repository-wide, including site, workflows, documentation and this board |

### Log (preserved)

- 2026-11-25: Claimed initial integration; repository contained only README.md and no board. Other sessions should coordinate before touching this scope.
- 2026-11-25: Copied upstream [LIVPBP commit 5c02527d3c7a56ea66c698cfabff80a407b6dfd3](https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3), preserving its MIT license and historical coordination log in `audit/upstream-coordination.md`.
- Verification: `npm ci`, `npm test` (64 passed), `node tests/run-all.mjs` (syntax, 41 local links, contracts, 47 fixture render checks), `node tools/restoration-check.mjs`, and `node tests/props-provenance-test.mjs` (5 passed). These use offline fixtures, not a live MLB check.
- Needs review: Sandbox cannot connect to [official MLB schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26) or the [reference deployment](https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26); live responses, CORS, parity, upcoming game days and inherited row-by-row verification remain unverified. Disclosed on `flagged.html`. Upstream model constants and reconstructed assets also remain flagged there. The optional feed-log server is not provided by static Pages.
- Integration PR: https://github.com/kanlerxz87-cyber/Alert1/pull/1 (merged at `6b0e47c`; Pages built and published at `https://kanlerxz87-cyber.github.io/Alert1/`, `Published Pages delivery` run `45697485397` succeeded).
- The upstream published-delivery workflow failed on the PR before initial deployment: it checks the existing Pages revision, which predates this site. Removed its PR trigger; it remains enabled after Pages deployment and on manual dispatch.

---

## Pull Requests & Deployment Log

| PR | Session / Branch | Merge Commit | GitHub Pages Status | Verification |
|---|---|---|---|---|
| [#1](https://github.com/kanlerxz87-cyber/Alert1/pull/1) | `arena-db1b5438` / `arena/db1b5438-alert1` | `6b0e47c` | `built` (`Published Pages delivery` run `45697485397` succeeded) | Offline fixture suites passed; live MLB verification marked `needs review` |
| [#2](https://github.com/kanlerxz87-cyber/Alert1/pull/2) | `c394a038` / `arena/c394a038-alert1` | `630dae2` | `built` | Fixed `404.html` `/Alert1/` base path + live `2026-08-26` verification |
| _(pending)_ | `df7b58c1` / `arena/df7b58c1-alert1` | _(pending)_ | _(pending)_ | Upcoming 2027 game-day `startTimeTBD` fix, `numOrNull` guard, `scheduleLoaded` mid-scan fix, non-live polling backoff, `officialDate` stamping, full 15-game `2026-08-26` + `2027` live verification |
