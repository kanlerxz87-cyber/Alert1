# COORDINATION.md — shared task board

Repo: `kanlerxz87-cyber/Alert1` · Target site: https://kanlerxz87-cyber.github.io/Alert1/
Reference: https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26
Source repo: https://github.com/snapquast73-boop/LIVPBP (commit recorded below)

Updated 2026-11-25 by session **`c394a038`** (branch `arena/c394a038-alert1`).

## Branch note (Arena sandbox restriction)

Arena fixes each session to one branch and forbids creating/pushing other branches, so the
brief's `session-<id>/<task>` branch convention cannot be followed literally. All tasks below
are therefore owned on `arena/c394a038-alert1`, branched from `main` @ `66015a0`. This is flagged
as an irregularity for review; no other session's work has been touched.

## Task board

| Task | Status | Session | File scope | Notes |
|---|---|---|---|---|
| C-1 Create board, claim work, push claim | done | `c394a038` | `COORDINATION.md` | This file |
| C-2 Copy upstream source repo verbatim (all tracked files except its board) | in progress | `c394a038` | all site files | Upstream `snapquast73-boop/LIVPBP`, verified via GitHub API/clone |
| C-3 Line-by-line review of copied source vs official MLB StatsAPI docs/endpoints | pending | `c394a038` | `assets/js/*.js`, `server.mjs`, `package.json`, workflows | Record official source links + irregularities |
| C-4 Verify every static/flag row has an official source link; blank + flag unverified values | pending | `c394a038` | `flagged.html`, `docs/verification-report.md` | Do not infer values |
| C-5 Make Pages deployment work for upcoming game days in this repo | pending | `c394a038` | `.github/workflows/*`, `404.html`, Pages config | No manual input |
| C-6 Run full checks; verify live pages + links; PR → merge → Pages deploy | pending | `c394a038` | repo root | Never merge a broken site |

## Log

- 2026-11-25 — Base repo contains only `README.md` (`# Alert1`); no site to review. Upstream public
  source repo identified from the reference URL and cloned for a verbatim copy.
