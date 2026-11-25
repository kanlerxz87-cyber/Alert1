# Verification report — MLB Live PBP rebuild

Date: 2026-11-20 · Session: `arena-f7276bda` · Branch: `arena/f7276bda-livpbp`
Published summary: [`flagged.html`](../flagged.html) (the same evidence, rendered on the site).
Independent field-by-field re-verification of the StatsAPI responses the site reads (and the one
rendering bug it found): [`docs/statsapi-field-map.md`](statsapi-field-map.md).

Every claim below was checked against a source fetched during this session. Where a value could
not be confirmed, the row is marked **Unverified** and the value is left blank — nothing is
inferred or filled in.

---

## 1. What the upload contained

`main` @ `aef1a74c40143a7fff9d24853418002e008b79b1` (“Add files via upload”):

```
.gitignore  404.html  LICENSE  README.md  game.html  index.html  reviews.html  server.mjs
```

Source: <https://github.com/snapquast73-boop/LIVPBP/commit/aef1a74c40143a7fff9d24853418002e008b79b1>

There is **no `assets/` directory**, although the three pages load:

| Page | Stylesheet | Scripts | Source |
|---|---|---|---|
| `index.html` | `assets/css/style.css` | `api.js`, `ui.js`, `reviews.js`, `feed-log.js`, `scoreboard.js` | <https://github.com/snapquast73-boop/LIVPBP/blob/aef1a74c40143a7fff9d24853418002e008b79b1/index.html> |
| `game.html` | `assets/css/style.css` | + `props.js`, `game.js` | <https://github.com/snapquast73-boop/LIVPBP/blob/aef1a74c40143a7fff9d24853418002e008b79b1/game.html> |
| `reviews.html` | `assets/css/style.css` | + `reviews-feed.js` | <https://github.com/snapquast73-boop/LIVPBP/blob/aef1a74c40143a7fff9d24853418002e008b79b1/reviews.html> |

Consequence, confirmed on the deployed site (<https://snapquast73-boop.github.io/LIVPBP/>): the
page renders its static shell only — no games, no styling, no polling.

## 2. Why the assets could not be restored

The README's live-demo repository is gone:

```
GET https://api.github.com/repos/buffedlizard55-lab/MLB-Live-PBP  ->  404 Not Found
GET https://api.github.com/search/repositories?q=MLB-Live-PBP    ->  total_count: 0
```

So the original code is not public any more. The assets were **reconstructed** against the
contract the pages and README define (globals and methods the HTML calls, element ids, classes,
endpoints, cadences, feature list). This is recorded as `U-6` on `flagged.html`.

## 3. API shapes — verified against the live StatsAPI (2026-11-20)

| # | Claim | Source |
|---|---|---|
| T-1 | `dates[].games[]` with `gamePk`, `gameDate`, `officialDate`, `status{…}`, `teams.home/away.team{id,name}`, `score`, `isWinner`, `venue.name` | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-09-15> |
| T-2 | Club abbreviations (LAD, CIN, AZ, ATH, CWS, NYY, MIL, …) | <https://statsapi.mlb.com/api/v1/teams?sportId=1> |
| T-3 | Review codes and their official wording: `MJ` “Player challenge: Pitch Result”, `NJ` “Umpire Challenge: Pitch Result”, `MA` “Manager challenge: Tag play”, `MD` “Manager challenge: Catch/drop in outfield”, `NA` “Umpire review: Tag play”, `NH` “Umpire review: Home run”, `IH` “Instant Replay” | <https://statsapi.mlb.com/api/v1/gameStatus> |
| T-4 | `reviewDetails = {isOverturned, inProgress, reviewType, challengeTeamId}`, on plays **and** on `playEvents[]` | <https://statsapi.mlb.com/api/v1/game/823109/playByPlay> |
| T-5 | `gameData.review{hasChallenges, away/home{used,remaining}}`; also via schedule `hydrate=review` | <https://statsapi.mlb.com/api/v1.1/game/824466/feed/live?fields=gameData,review,hasChallenges,away,home,used,remaining> · <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-01&hydrate=review&fields=dates,games,gamePk,review,hasChallenges,away,home,used,remaining> |
| T-6 | `gameData.absChallenges{hasChallenges, away/home{usedSuccessful,usedFailed,remaining}}` | <https://statsapi.mlb.com/api/v1.1/game/824466/feed/live?fields=gameData,absChallenges,hasChallenges,away,home,usedSuccessful,usedFailed,remaining> |
| T-7 | `os_ruling_pending_primary` / `os_ruling_pending_prior`, description “Official Scorer Ruling Pending” | <https://statsapi.mlb.com/api/v1/eventTypes> |
| T-8 | Run attribution: `runners[].details{isScoringEvent, playIndex}` where `playIndex` indexes `playEvents[]` | <https://statsapi.mlb.com/api/v1/game/824466/playByPlay> |
| T-9 | Team logos at `https://www.mlbstatic.com/team-logos/team-cap-on-dark/{teamId}.svg` | <https://www.mlbstatic.com/team-logos/team-cap-on-dark/119.svg> (URL documented in the README; host not reachable from the build sandbox) |
| T-10 | Official scoring changes are made by the Official Scorer / Elias / after club review | <https://www.mlb.com/official-information/scoring-changes> |
| T-11 | Pre-fix deployed site was an inert shell | <https://snapquast73-boop.github.io/LIVPBP/> |

Real review events observed in game `823109` on 2026-08-01 (used to shape the parser and the
test fixtures): `MJ` overturned, `MD` stands, `MA` overturned, `NA` stands.

## 4. Behaviour implemented and how it was verified

Network-free harness: `node tools/smoke-test.mjs` (jsdom + a local static server; only `fetch`
is stubbed, with payloads matching the shapes in §3). 40 assertions, all passing:

1. **reviews.js** — code → official label via the registry; ABS detection; boundary detection;
   pitch-level vs play-level extraction; run-at-risk attribution limited to the reviewed event;
   pending-ruling detection; scoring-change diff (reclassification vs payload edit); counter
   regression detection with no zero-filling.
2. **index.html** — three game cards with team names, scores, venue, records, probables,
   decisions; review chip from the official status code; filters; date label; no error state.
3. **game.html** — header (teams, status, venue, weather), at-bat module (count, outs, occupied
   bases, on-deck/in-the-hole), linescore (9 innings + R/H/E), play-by-play with pitch detail,
   review tab badge and cards, box score (batting + pitching), review banner.
4. **props.js** — forecast inside the documented clamp band, six drivers, tier, `≥1 hit in next N
   PAs` > per-PA rate, inputs read from the payload (not a guessed baseline), rendered headline.
5. **reviews.html** — all five tracked event types present; All tab excludes ABS; ABS tab isolates
   them; runs-at-risk row shows the official score tracker; summary tiles; localStorage
   persistence; sound/notification preferences.
6. **feed-log.js** — merge keeps both sides, is idempotent, accumulates irregularity notes.
7. **Static integrity** — every local `href`/`src` on `index.html`, `game.html`, `reviews.html`,
   `404.html`, `flagged.html` resolves to a file.
8. **Offseason paths** — an empty slate renders a message (not an error state) and one cached range
   query offers the most recent date that did have games.
9. **Parallel session's checker** — `node tools/restoration-check.mjs` (kept from the earlier
   restoration) also passes: local references, JS syntax, and the `server.mjs` API contract.
10. **Third-party cross-check** — session `7e3aaa61` added `tests/` with payloads captured verbatim
    from the live StatsAPI (`tests/fixtures/feed-824638-review.json`, `gamestatus.json`,
    `schedule-2026-08-28.json`). Running their independent suite against this implementation
    (`node tests/run-all.mjs`) gives **37 jsdom checks passed**, link-check OK (39 local refs),
    contract-check OK (8 bindings across 5 pages) and syntax OK — a second, separately written
    verification of the same pages.

## 5. Flagged for review (see `flagged.html` for the rendered table)

| # | Item |Confirmed official value | Why it is flagged / resolution | Official source |
|---|---|---|---|---|
| U-1 | `TEAM_COLORS` palette | | presentation only; the API publishes no club hex colours | <https://statsapi.mlb.com/api/v1/teams?sportId=1> |
| U-2 | Hit-model constants (count factors, clamps 13–62 / 10–78 %, tier cut-offs, weights) | | the README states the behaviour, but the derivation scripts were not uploaded | <https://statsapi.mlb.com/api/v1/people/660271/stats?stats=season,statSplits,gameLog,expectedStatistics&group=hitting&sitCodes=vl,vr> |
| U-3 | `server.mjs` crash + path-containment defects | HTTP 400 + `REPO_DIR + path.sep` | **fixed** (`try/catch` around `decodeURIComponent` + separator containment check) | <https://github.com/snapquast73-boop/LIVPBP/blob/main/server.mjs> |
| U-4 | `data/` not in `.gitignore` | `data/` | **fixed** in this change (no other ignore rule touched) | <https://github.com/snapquast73-boop/LIVPBP/blob/main/.gitignore> |
| U-5 | `v1.0.0-stable-checkpoint` tag | `5a06fef` | **resolved** — tagged on verified merge commit `5a06fef` | <https://github.com/snapquast73-boop/LIVPBP/releases/tag/v1.0.0-stable-checkpoint> |
| U-6 | Upstream repo / original assets | | 404; reconstructed, not restored | <https://api.github.com/repos/buffedlizard55-lab/MLB-Live-PBP> |
| U-7 | Original `docs/*` and `tools/*` | | not uploaded, not recoverable | <https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/aef1a74c40143a7fff9d24853418002e008b79b1?recursive=1> |
| U-8 | Headshot URL transformation | | README truncates it; host unreachable from the sandbox | <https://img.mlbstatic.com/mlb-photos/image/upload/v1/people/660271/headshot/67/current> |
| U-9 | Remaining-PA estimate for the `≥1 hit` projection | | estimate, not an official figure | <https://statsapi.mlb.com/api/v1.1/game/824638/feed/live?fields=liveData,linescore,currentInning,inningState> |
| U-10 | 500/250/125 ms polling cadence | | the StatsAPI publishes no numeric rate limit; cadence is a judgement call | <https://www.mlb.com/official-information/terms-of-use> |
| U-11 | Shared Feed Log across browsers | `localStorage` on Pages | Pages is static; cross-browser sharing needs `node server.mjs` | <https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#limits-on-use-of-github-pages> |
| I-8 | “Confirmed” outcome | `isOverturned` boolean | structured payload has only `isOverturned`, so “stands” vs “confirmed” is indistinguishable; MLB's free-text description (which may say “confirmed”) is displayed verbatim | <https://statsapi.mlb.com/api/v1.1/game/824466/feed/live> |
| L-1..L-4 | Live-StatsAPI field alignment (`expectedStatistics.avg`, `vsPlayerTotal`, `boxscore.seasonStats`, PA-ending `MJ` & `MF`) | `.277` (`stat.avg`) / `vsPlayerTotal` | **fixed & regression-tested** by session `1f908513` (44/44 checks in `tools/smoke-test.mjs`) | <https://statsapi.mlb.com/api/v1/people/682829/stats?stats=season,expectedStatistics&group=hitting&season=2026> |
| RR-01..RR-06 | Replay Feed comparison handoff (`dateSeq` guard, official `pitchNumber`, scoring changes in `All`, per-row MLB API links, smoke readiness) | `pitchNumber: 3` (play 54, game 823243) | **fixed & regression-tested** by session `1f908513`; `RR-05` audio cue left unverified (blank) | <https://statsapi.mlb.com/api/v1/game/823243/playByPlay?fields=allPlays,about,atBatIndex,playEvents,pitchNumber,reviewDetails,reviewType> |

---

## 6. Re-verification pass — session `d105b565` (2026-11-22)

Every value below was fetched again on **2026-11-22** from the official
`statsapi.mlb.com` (or read from the deployed Pages site) — nothing was carried over from an
earlier session's notes without re-fetching it. Blank cells mean the official payload does not
publish the value; no cell is inferred.

| # | Claim | Value read from the official response | Official source | Status |
|---|---|---|---|---|
| R-1 | `UI.TEAM_ABBR` (30 clubs) = official `abbreviation` | all 30 match (incl. `AZ` 109, `ATH` 133, `CWS` 145, `KC` 118, `SD` 135, `TB` 139, `WSH` 120) | <https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,name,abbreviation,teamName&season=2026> | Verified |
| R-2 | `FALLBACK_REASONS` in `assets/js/reviews.js` matches the API wording for every `M*`/`N*` code | `MA…MV`, `NA…NW`, `MJ`/`NJ` “Pitch Result”, `MF` “Close play at 1st”, `IH` reason “Review” / detailedState “Instant Replay”; `MX`/`NX` publish no `reason` and the code adds none | <https://statsapi.mlb.com/api/v1/gameStatus> | Verified |
| R-3 | Hydrated schedule card fields used by `scoreboard.js` | game 849799: MIL 4 / TB 1, `leagueRecord` 4-1 & 1-4, W Misiorowski, L Rasmussen, Tropicana Field, game 5 of 7 | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-10-28&hydrate=probablePitcher,linescore,decisions,review> | Verified |
| R-4 | `expectedStatistics` publishes xBA in `stat.avg` | `{"avg":".285","slg":".549","woba":".393"}` (player 660271, 2026); no `xba` key | <https://statsapi.mlb.com/api/v1/people/660271/stats?stats=expectedStatistics&group=hitting&season=2026> | Verified |
| R-5 | H2H is `vsPlayerTotal` (career) + `vsPlayer` (per season) | Chourio vs Rasmussen: 0-for-3 career, 0-for-3 in 2025 | <https://statsapi.mlb.com/api/v1/people/694192/stats?stats=vsPlayer&group=hitting&opposingPlayerId=656876> | Verified |
| R-6 | Season lines at `boxscore.teams.<side>.players.ID<id>.seasonStats` | `ID806198.seasonStats.batting = {hits:17, avg:".354", atBats:48}` | <https://statsapi.mlb.com/api/v1/game/849799/boxscore> | Verified |
| R-7 | `os_ruling_pending_primary` / `_prior` are real event types | both present, description “Official Scorer Ruling Pending” | <https://statsapi.mlb.com/api/v1/eventTypes> | Verified |
| R-8 | ABS / manager challenge counters for game 849799 | `absChallenges.away/home = {usedSuccessful:1, usedFailed:0, remaining:2}`, `review.away/home = {used:0, remaining:2}` — matches the two overturned ABS chips the page printed | <https://statsapi.mlb.com/api/v1.1/game/849799/feed/live?fields=gameData,absChallenges,hasChallenges,away,home,usedSuccessful,usedFailed,remaining,review,used> | Verified |
| R-9 | Deployed game page reproduces the official linescore for game 849799 | MIL `0 1 0 0 1 2 0 0 0 · 4 8 2`, TB `0 0 0 0 0 0 0 0 1 · 1 4 0` — identical | <https://statsapi.mlb.com/api/v1/game/849799/linescore> · <https://snapquast73-boop.github.io/LIVPBP/game.html?gamePk=849799> | Verified |
| R-10 | Deployed scoreboard / replay feed / flagged page execute and render | offseason slate: scoreboard offers `Wed Oct 28, 2026`; feed renders 8 summary tiles + scan line | <https://snapquast73-boop.github.io/LIVPBP/> · <https://snapquast73-boop.github.io/LIVPBP/reviews.html> | Verified |
| R-11 | `?date=YYYY-MM-DD` deep links on the scoreboard and the replay feed | added this pass; URL follows the selected date; 3 new checks in `tools/smoke-test.mjs` §[11] | <https://github.com/snapquast73-boop/LIVPBP/blob/main/tools/smoke-test.mjs> | Verified |

### Irregularities opened in this pass

| # | Irregularity | Official evidence | Resolution | Status |
|---|---|---|---|---|
| D-1 | Two official endpoints disagree on errors for the same team: game 775296 home `errors` = **2** in `/api/v1/game/775296/linescore`, **3** in `/api/v1.1/game/775296/feed/live` | <https://statsapi.mlb.com/api/v1/game/775296/linescore> · <https://statsapi.mlb.com/api/v1.1/game/775296/feed/live> | Page renders the `feed/live` value (single request feeds the page); nothing corrected or guessed — flagged for the owner | Flagged |
| D-2 | Per-row “source” links opened `/linescore` and `/boxscore`, not the request the rows are rendered from, so for games like 775296 the link showed a different number than the row | same as D-1 (<https://statsapi.mlb.com/api/v1.1/game/775296/feed/live>) | **Fixed:** links now open `/api/v1.1/game/<pk>/feed/live` (`liveData.linescore` / `liveData.boxscore`) | Fixed |
| D-3 | Original client source still unavailable (reconstruction, not a restoration) | <https://api.github.com/repos/buffedlizard55-lab/MLB-Live-PBP> → 404 (re-checked 2026-11-22) | Behaviour verified against the official API instead; no byte-for-byte comparison is possible | Unverified (source missing) |
| D-4 | Club hex colours and hit-model constants | | | Unverified — presentation/model tuning, no official value exists; carried from U-1/U-2 · <https://statsapi.mlb.com/api/v1/teams?sportId=1> |

### Checks run on this pass

```text
npm ci && npm test              -> 47 passed, 0 failed   (was 44; +3 deep-link checks)
node tests/run-all.mjs          -> syntax OK, 40 local refs OK, 8 bindings OK, 37/37 jsdom
node tools/restoration-check.mjs-> ALL CHECKS PASSED
```

---

## 7. Line-by-line functional & provenance parity pass — session `af75fbfd` (2026-11-22)

Every item below was uncovered during a line-by-line audit of all HTML pages, JS modules, `server.mjs`, `README.md`, and live reference deployments (`LIVPBP2`, `POSTSSNALRT`) against official `statsapi.mlb.com` responses on 2026-11-22. Where an official source does not publish a value, the confirmed-value cell is left blank and never inferred.

| # | Item | Confirmed official value | Resolution | Official source | Status |
|---|---|---|---|---|---|
| AF-1 | Replay Feed ABS challenge counters (`usedSuccessful`, `usedFailed`, `remaining`) & both-teams summary (`Challenges left: AWAY X MGR · Y ABS — HOME …`) | `absChallenges.away: {usedSuccessful:3, usedFailed:0, remaining:2}`, `home: {usedSuccessful:5, usedFailed:0, remaining:2}` (game 824638) | **Fixed:** `reviews-feed.js` now fetches leaf-projected `feed/live?fields=gameData,review,absChallenges,…` alongside `playByPlay` (`COUNTERS_FIELDS`, ~300 B) and renders both per-team counter lines and hover/live-strip both-teams summaries via `Reviews.countersSummary`. | <https://statsapi.mlb.com/api/v1.1/game/824638/feed/live?fields=gameData,review,absChallenges,hasChallenges,away,home,used,remaining,usedSuccessful,usedFailed> | Fixed & regression-tested |
| AF-2 | Counter-regression detector (`Reviews.counterRegression`) ignored nested `{manager, abs}` snapshots | `away/home.{used,remaining,usedSuccessful,usedFailed}` | **Fixed:** `Reviews.counterRegression` now inspects both flat `{away, home}` and nested `{manager, abs}` snapshots so backwards-moving official counters are flagged instead of silently ignored. | <https://statsapi.mlb.com/api/v1.1/game/849799/feed/live?fields=gameData,review,absChallenges,hasChallenges,away,home,used,remaining,usedSuccessful,usedFailed> | Fixed & regression-tested |
| AF-3 | Pre-ruling `Before review` score inferred on already-resolved `runsAtRiskCount === 0` reviews | | **Fixed (inference removed):** `reviews-feed.js` no longer sets `scoreTracker.before = review.scoreAfter` when a page opens after resolution; unobserved pre-ruling scores stay `null` (`— (not observed before ruling)`), while observed `Actual after (official)` scores still render. | <https://statsapi.mlb.com/api/v1/game/824638/playByPlay> | Fixed & regression-tested |
| AF-4 | Persistent red `#banner` for active `runsAtRiskCount > 0` reviews on `reviews.html`, offseason recent-date jump on `reviews.html`, and cross-page `?date=` links (`index.html` ↔ `reviews.html` ↔ `game.html`) | `2026-10-28` (`totalGames: 1`, game 849799) | **Fixed:** `reviews-feed.js` renders `#banner` while any review with runs at risk is in progress, offers the cached 45-day `scheduleRange` jump button on empty offseason slates, and preserves `?date=` across topbar/card links. | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-10-01&endDate=2026-11-22&fields=dates,date,totalGames> | Fixed & regression-tested |
| AF-5 | Official ABS challenger role (`batter` / `catcher` / `pitcher`), `playEvents[].index` alignment for `runsForEvent`, `isPitch`-only pitch counts, strict calendar `isValidISODate`, non-zero-filled `UI.countDots`/`outsDots`, and `gameFeed` 404 fallback bundle | `"Jonah Heim challenged (pitch result)…"` (`challengeTeamId: 133`, game 824960 play 34) | **Fixed:** `reviews.js`, `game.js`, `ui.js`, and `api.js` derive challenger role strictly from official play descriptions / `battingSide` vs `challengerSide`, pass `events[playIndex].index` to `runsForEvent`, render `—` when count/outs are absent rather than zero-filling `0-0, 0 outs`, reject invalid calendar dates (e.g. `2026-02-31`), and wire the documented `/playByPlay` + `/boxscore` + `/linescore` 404 fallback. | <https://statsapi.mlb.com/api/v1/game/824960/playByPlay?fields=allPlays,about,atBatIndex,inning,halfInning,result,description,reviewDetails,reviewType,challengeTeamId> | Fixed & regression-tested |
| AF-6 | `server.mjs` & `feed-log.js` `atBatIndex === 0` falsy merge-key collision and `server.mjs` dotfile/symlink static serving | HTTP `403` on `/.git/HEAD`; distinct key `gamePk:0` | **Fixed:** `entryKey()` and `makeKey()` check `!== undefined && !== null && !== ''` so `atBatIndex: 0` never collapses to `""`, `server.mjs` preserves top-level entry fields during merges, and `server.mjs` blocks hidden dotfile paths (except `.nojekyll`) and symlinks (`fs.lstat`). | <https://github.com/snapquast73-boop/LIVPBP/blob/main/server.mjs> | Fixed & regression-tested |
| AF-7 | Game `824960` (`2026-08-08`, BAL @ ATH, `atBatIndex: 80` Bot 10) carries `reviewDetails: {reviewType: "MJ", challengeTeamId: 110, isOverturned: false}` on a pitch event, yet `result.description` omits challenge wording | `reviewType: "MJ"`, `challengeTeamId: 110` | **Flagged for review:** structured `reviewDetails` and `result.description` differ in verbosity on mid-PA ABS challenges; the app reads structured `reviewDetails` + `challengeTeamId` without inventing missing prose. | <https://statsapi.mlb.com/api/v1/game/824960/playByPlay?fields=allPlays,about,atBatIndex,inning,halfInning,result,description,playEvents,index,details,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId> | Flagged |

---

## 8. Copy of the working site into `kanlerxz87-cyber/Alert1` — session `c394a038` (2026-11-25)

The public source repository was read from GitHub and copied with all tracked files intact. All
entries below were re-checked against the linked source during this session; a value that the
source does not publish is left blank, not inferred.

**Source revision:** <https://github.com/snapquast73-boop/LIVPBP/commit/5c02527d3c7a56ea66c698cfabff80a407b6dfd3>
**Reference page:** <https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26>
**Copy source tree at this revision:** <https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/5c02527d3c7a56ea66c698cfabff80a407b6dfd3?recursive=1>
**Upstream board preserved verbatim:** [`audit/upstream-coordination.md`](../audit/upstream-coordination.md)

### 8.1 File-by-file inspection and official endpoints

| # | File(s) inspected line by line | Data-bearing contract checked | Official / first-party source | Result |
|---|---|---|---|---|
| C-1 | `index.html`, `game.html`, `reviews.html`, `404.html` | Script and stylesheet bindings; every ID used by the JS; `?date=YYYY-MM-DD` deep links; Flagged-for-Review links. `404.html`'s project base was `/LIVPBP/` upstream — changed to `/Alert1/` for this repository; no other HTML logic changed. | <https://github.com/snapquast73-boop/LIVPBP/blob/5c02527d3c7a56ea66c698cfabff80a407b6dfd3/index.html> · <https://github.com/snapquast73-boop/LIVPBP/blob/5c02527d3c7a56ea66c698cfabff80a407b6dfd3/404.html> · <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26> | Verified; local `link-check` and `contract-check` pass |
| C-2 | `assets/js/api.js` | One client for all network calls: `/api/v1/schedule` (`sportId=1`, `date`, `hydrate`, `fields`), `/api/v1.1/game/{pk}/feed/live` with v1 and `/playByPlay`+`/boxscore`+`/linescore` fallbacks, `/api/v1/game/{pk}/playByPlay`, `/api/v1/gameStatus`, `/api/v1/people/{id}/stats`, 429 `Retry-After` backoff. No key or hard-coded game values. | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26> · <https://statsapi.mlb.com/api/v1.1/game/823180/feed/live> · <https://statsapi.mlb.com/api/v1/game/823180/playByPlay> · <https://statsapi.mlb.com/api/v1/gameStatus> | Verified |
| C-3 | `assets/js/ui.js` | All 30 `TEAM_ABBR` entries and logo/headshot hosts; team palette is presentation-only and remains flagged (U-1). | <https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,name,abbreviation&season=2026> | Verified: all 30 id→abbreviation pairs match the official response |
| C-4 | `assets/js/reviews.js` | Review categories resolved from the official `gameStatus` registry; `isOverturned` / `challengeTeamId` / `reviewType` read from structured `reviewDetails` without inventing a verdict; counter regression only flags. | <https://statsapi.mlb.com/api/v1/gameStatus> · <https://statsapi.mlb.com/api/v1/game/823096/playByPlay?fields=allPlays,about,inning,result,description,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId> | Verified |
| C-5 | `assets/js/reviews-feed.js`, `assets/js/feed-log.js` | All-games scan reads official schedule + `playByPlay`; manager/ABS counters read from official schedule `hydrate=review` and `feed/live gameData`; unobserved Before scores stay blank; local log stores only observed data. | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26&hydrate=review> · <https://statsapi.mlb.com/api/v1.1/game/823180/feed/live?fields=gameData,review,absChallenges,hasChallenges,away,home,used,remaining,usedSuccessful,usedFailed> · <https://statsapi.mlb.com/api/v1/game/823180/playByPlay> | Verified |
| C-6 | `assets/js/game.js`, `assets/js/props.js` | Game page reads `feed/live`, `linescore`, `boxscore`, `people/{id}/stats`; per-row source links point at the official request; model constants are flagged (U-2/U-9), not presented as official values. | <https://statsapi.mlb.com/api/v1.1/game/823180/feed/live> · <https://statsapi.mlb.com/api/v1/game/823180/linescore> · <https://statsapi.mlb.com/api/v1/game/823180/boxscore> · <https://www.mlb.com/official-information/scoring-changes> | Verified; constants remain flagged |
| C-7 | `assets/js/scoreboard.js` | Date navigation, status polling and offseason recent-date hint use the official schedule payload; no schedule values are hard-coded. | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26> · <https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-10-01&endDate=2026-11-25&fields=dates,date,totalGames> | Verified |
| C-8 | `server.mjs`, `.github/workflows/site-check.yml`, `.github/workflows/pages-delivery.yml`, `package.json` | Local-only feed-log API and static server; CI runs `restoration-check` + `npm test`; Pages delivery checker compares the published site to the deployed commit. `homepage` updated to this site. | <https://github.com/snapquast73-boop/LIVPBP/blob/5c02527d3c7a56ea66c698cfabff80a407b6dfd3/server.mjs> · <https://docs.github.com/en/actions> · <https://api.github.com/repos/kanlerxz87-cyber/Alert1/pages> | Verified; checks pass locally |
| C-9 | `tests/*`, `tools/*`, `docs/*`, `audit/*`, `flagged.html`, `COORDINATION.md` | Test suites, field map and previously flagged items copied intact; upstream board archived as `audit/upstream-coordination.md`; local board created. Every data row of `flagged.html` §§1–14 retains its source link (106 data rows checked; the 12 linkless `<tr>` elements are table headers). | <https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/5c02527d3c7a56ea66c698cfabff80a407b6dfd3?recursive=1> · <https://github.com/snapquast73-boop/LIVPBP/blob/5c02527d3c7a56ea66c698cfabff80a407b6dfd3/flagged.html> | Verified |

### 8.2 Reference-page rows re-checked against the official API

| # | Reference row / value | Official value read back | Official source | Result |
|---|---|---|---|---|
| C-10 | `PHI @ SEA`, Bot 5, `MF` close play at 1st, call upheld — J.P. Crawford grounds out sharply, Trea Turner to Alec Bohm | `reviewDetails: {isOverturned:false, inProgress:false, reviewType:"MF", challengeTeamId:136}` and the same play description; schedule gives PHI 6, SEA 0 | <https://statsapi.mlb.com/api/v1/game/823096/playByPlay?fields=allPlays,about,inning,result,description,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId> · <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26> | Verified; no Before score inferred (the reference marks it unobserved) |
| C-11 | `CIN @ SF`, Top 7, `MA` tag play, call upheld — Sal Stewart out on sacrifice fly, Ke'Bryan Hayes scores | `reviewDetails: {isOverturned:false, inProgress:false, reviewType:"MA", challengeTeamId:137}` with the same description and runners | <https://statsapi.mlb.com/api/v1/game/823180/playByPlay?fields=allPlays,about,inning,result,description,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId> | Verified |
| C-12 | `CIN @ SF`, Top 9, umpire review `NF` play at 1st / slide interference, call upheld — Héctor Rodríguez force out | `reviewDetails: {isOverturned:false, inProgress:false, reviewType:"NF"}` with the same nested description | <https://statsapi.mlb.com/api/v1/game/823180/playByPlay?fields=allPlays,about,inning,result,description,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId> | Verified |
| C-13 | CIN–SF final 10–9; SEA challenge counters 0 left (1 used); SF manager counters 0 left (1 used) | Line score `away.runs:10`, `home.runs:9`; `review.home:{used:1,remaining:0}`; `review.away:{used:0,remaining:1}`; ABS counters also present | <https://statsapi.mlb.com/api/v1/game/823180/linescore> · <https://statsapi.mlb.com/api/v1.1/game/823180/feed/live?fields=gameData,review,absChallenges,hasChallenges,away,home,used,remaining,usedSuccessful,usedFailed> · <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26&hydrate=review> | Verified |
| C-14 | 15 games on 2026-08-26; every row's MLB API link opens that game's official `playByPlay` | `totalGames:15`; the renderer builds `https://statsapi.mlb.com/api/v1/game/{gamePk}/playByPlay` from the official `gamePk` | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26> · <https://github.com/snapquast73-boop/LIVPBP/blob/5c02527d3c7a56ea66c698cfabff80a407b6dfd3/assets/js/reviews-feed.js> | Verified |

### 8.3 Irregularities opened on this copy

| # | Irregularity | Official / first-party evidence | Resolution | Source | Status |
|---|---|---|---|---|---|
| C-15 | The brief requires `session-<id>/<task>` branches, but Arena fixes this session to `arena/c394a038-alert1`; no other branch was created. | The only branch used is the assigned one; the shared board records the deviation. | Documented, not changed — changing branches would break Arena session tracking. | <https://api.github.com/repos/kanlerxz87-cyber/Alert1/branches/arena/c394a038-alert1> | Flagged |
| C-16 | Upstream's `404.html` hard-coded `/LIVPBP/`; on this Pages site the 404 stylesheet/base would resolve against the wrong path. | Upstream file contains `/LIVPBP/`; GitHub Pages serves this repository under `/Alert1/`. | Changed only that base expression to `/Alert1/` with a local-root fallback; verified by link check and live 404 request. | <https://github.com/snapquast73-boop/LIVPBP/blob/5c02527d3c7a56ea66c698cfabff80a407b6dfd3/404.html> · <https://api.github.com/repos/kanlerxz87-cyber/Alert1/pages> | Fixed |
| C-17 | README still quotes the upstream checkpoint tag `v1.0.0-stable-checkpoint` and the historical restoration notice; this repository has no such tag. | Upstream tag exists; this repository's tag list does not (checked 2026-11-25). | Copy note added to README explaining the history; tag deliberately not invented. | <https://api.github.com/repos/snapquast73-boop/LIVPBP/tags> · <https://api.github.com/repos/kanlerxz87-cyber/Alert1/tags> | Flagged |
| C-18 | `flagged.html` §§1–14 and `docs/verification-report.md` §§1–7 are upstream historical records referring to the upstream deployment and its source repository; they are not new claims about this deployment. | Upstream published page and source tree at the copied commit. | Preserved verbatim for provenance; this section adds the copy-specific verification. No old claim was silently re-labelled as verified here. | <https://snapquast73-boop.github.io/LIVPBP/flagged.html> · <https://api.github.com/repos/snapquast73-boop/LIVPBP/git/trees/5c02527d3c7a56ea66c698cfabff80a407b6dfd3?recursive=1> | Flagged |
| C-19 | Values the official API does not publish (club hex colours, forecast model constants, exact wording of a lost original, cross-browser log sharing) remain blank in the source tables. | Official teams payload has no club colours; StatsAPI publishes no forecast constants. | Left blank and carried forward as U-1/U-2/U-9/U-11 — no inferred values added. | <https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,name,abbreviation&season=2026> · <https://statsapi.mlb.com/api/v1/game/823180/playByPlay> | Unverified (flag retained) |

### 8.4 Live deployment verification (after PR #2 merge, 2026-11-25)

| # | Check | Value observed on the published site | Source | Result |
|---|---|---|---|---|
| C-20 | GitHub Pages deploy | Build `630dae226c1f9e956ef1775daeea6bb1c48e314d` status `built`; `pages-delivery` check run 4 and `Site checks` run 6 both `success` | <https://api.github.com/repos/kanlerxz87-cyber/Alert1/pages/builds/630dae226c1f9e956ef1775daeea6bb1c48e314d> · <https://github.com/kanlerxz87-cyber/Alert1/actions/runs/45698402504> | Verified |
| C-21 | Reference-date replay feed parity | Both the reference (cache-busted) and this deployment render `15 game(s)`, `10 Reviews`, `8 Challenges`, `2 Umpire reviews`, `68 ABS challenges`, `1 Boundary call`, `1 Runs at risk`, `78 tracked entries`; the MF/MA/NF rows and scores match. | <https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26&cachebust=c394a038> · <https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26&verify=final> | Verified |
| C-22 | Scoreboard and game page | Scoreboard renders all 15 games for 2026-08-26 (CIN 10 – SF 9); game 823180 renders header, linescore with per-row official source links, and play-by-play with review chips. | <https://kanlerxz87-cyber.github.io/Alert1/?date=2026-08-26&verify=final> · <https://kanlerxz87-cyber.github.io/Alert1/game.html?gamePk=823180&verify=final> · <https://statsapi.mlb.com/api/v1/game/823180/linescore> | Verified |
| C-23 | Upcoming game day | `2027-04-01` shows 8 scheduled games on both the scoreboard and replay feed; the official schedule reports `totalGames: 8` with the same gamePks. No manual input was used. | <https://kanlerxz87-cyber.github.io/Alert1/?date=2027-04-01&verify=final> · <https://kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2027-04-01&verify=final> · <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-04-01&fields=dates,date,totalGames,games,gamePk,officialDate,status,teams,team,name> | Verified |
| C-24 | Flagged page live | §15 is published with all eight rows carrying source links; the earlier session's unverified notice is preserved and explicitly marked as superseded for live data/parity. | <https://kanlerxz87-cyber.github.io/Alert1/flagged.html?verify=final> | Verified |
| C-25 | Verification-caveat: page-fetch caching | The first fetch of the reference URL returned a stale 3-row snapshot stamped `3:38:33 PM`; a cache-busted fetch returned the full 10-row/78-entry feed matching this site. This is a fetch-tool cache, not a site discrepancy; it is recorded so the earlier snapshot is not mistaken for a parity failure. | <https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26> · <https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26&cachebust=c394a038> | Flagged (tool cache) |

---

## 9. Full 15-game `2026-08-26` + upcoming `2027` verification & audited fixes — session `df7b58c1` (2026-11-25)

Session `df7b58c1` completed a full line-by-line audit of every file copied from `snapquast73-boop/LIVPBP` (`5c02527`), re-verified all 15 MLB games on `2026-08-26` (all 7 `hasChallenges` games and all 78 tracked Replay Feed entries), verified the offseason end date (`2026-10-28`) and upcoming 2027 schedule (`2027-02-19` Spring Training, `2027-03-25` Opening Day), and fixed six client/test defects surfaced by the live responses. Where no official source publishes a value, the confirmed-value cell is left blank and never inferred.

| # | Item / finding | Confirmed official value | Resolution / why it is flagged | Official source | Status |
|---|---|---|---|---|---|
| A1-1 | Full 15-game `2026-08-26` Replay Feed parity (`10` Reviews: `8` Challenges, `2` Umpire reviews; `68` ABS challenges; `1` Boundary call; `0` Under review; `1` Runs at risk; `0` Scoring changes; `78` tracked entries) | `totalGames: 15`; 7 `hasChallenges: true` games (`823180`, `823096`, `822692`, `823506`, `824555`, `823015`, `824963`); verified `NH` home-run boundary (`823506:19:5`), `MA` tag (`824555:2:7`, `823180:57`), `NF` umpire (`823180:84`), `MJ` ABS | **Verified live:** `kanlerxz87-cyber.github.io/Alert1/reviews.html?date=2026-08-26` renders the identical 10 non-ABS rows and 78 total tracked entries as `snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26`. | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26&hydrate=probablePitcher,linescore,decisions,review> · <https://statsapi.mlb.com/api/v1/game/823506/playByPlay> · <https://statsapi.mlb.com/api/v1/game/824555/playByPlay> · <https://statsapi.mlb.com/api/v1/game/823180/playByPlay> | Verified |
| A1-2 | Offseason empty date (`2026-11-25`) and upcoming 2027 MLB schedule (`2027-02-19` Spring Training, `2027-03-25` Opening Day) | Last 2026 game `2026-10-28`; `2026-11-25` = `0` games; `2027-02-19` = `17` games; `2027-03-25` = `14` scheduled `Preview` games (`review: {away:{}, home:{}}`) | **Verified live:** `index.html`, `reviews.html`, and `game.html` load upcoming 2027 Preview slates cleanly and offer `Wed Oct 28, 2026` during the offseason. | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-10-20&endDate=2026-11-25&fields=dates,date,totalGames> · <https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2027-02-15&endDate=2027-04-05&fields=dates,date,totalGames> · <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&hydrate=probablePitcher,linescore,decisions,review> | Verified |
| A1-3 | Upcoming `2027-03-25` games with `status.startTimeTBD: true` carry dummy `:33Z` placeholder timestamps (`08:33Z`, `10:33Z`) | `854131` (CLE @ CHC, `2027-03-25T08:33:00Z`), `852663` (COL @ SF, `10:33:00Z`), `853388` (ATL @ LAD, `10:33:00Z`), all `startTimeTBD: true` | **Bug found & fixed:** upstream `scoreboard.js` and `game.js` ignored `startTimeTBD` and rendered bogus `"4:33 AM"` / `"6:33 AM"` start times. Both pages now render `"TBD"` whenever `status.startTimeTBD === true` (regression-tested in `tools/smoke-test.mjs` §[14]). | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&fields=dates,games,gamePk,gameDate,status,startTimeTBD,detailedState,teams,away,home,team,name> | Fixed & regression-tested |
| A1-4 | `Reviews.numOrNull(v)` coerced `null` and `""` to `0` (`Number(null) === 0`) | Absent counters are omitted (`{away:{}, home:{}}` on 2027 Preview games) and must never be zero-filled | **Bug found & fixed:** `assets/js/reviews.js` now returns `null` for `v === null \|\| v === undefined \|\| v === ''` before `Number(v)` (regression-tested in `tools/smoke-test.mjs` §[14]). | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&hydrate=review> · <https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/reviews.js> | Fixed & regression-tested |
| A1-5 | Premature `"No games scheduled"` render and unnecessary 180-day `scheduleRange` fetch before the initial schedule call resolved | `totalGames: 15` on `2026-08-26` | **Bug found & fixed:** `scoreboard.js` and `reviews-feed.js` invoked `offerRecentDate()` on initial `render()` while `state.games` was still `[]`, firing a wasted range fetch and triggering a partial mid-scan render (30 vs 78 entries) on `2026-08-26`. Added `state.scheduleLoaded` guard so `offerRecentDate()` only fires after a schedule response confirms `0` games. | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26> · <https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/reviews-feed.js> | Fixed & regression-tested |
| A1-6 | Unconditional 250 ms scan loop in `reviews-feed.js`, unconditional 125 ms `watchStatus` loop in `game.js`, and missing `officialDate` stamp on ingested Replay Feed entries | `abstractGameState`: `Live`, `Preview`, `Final` | **Fixed:** `reviews-feed.js` now backs off non-live slates (`250 ms` Live / `1 s` Final-grace / `15 s` Preview / `30 s` idle) and stamps `officialDate` on every ingested entry; `game.js` runs 125 ms `watchStatus()` only while a game is `Live` (regression-tested in `tools/smoke-test.mjs` §[14]). | <https://statsapi.mlb.com/api/v1/gameStatus> · <https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/reviews-feed.js> · <https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/game.js> | Fixed & regression-tested |
| A1-7 | Umpire/boundary rows on `reviews.html` (`823506:19:5:NH`, `823180:84:p:NF`) visibly print the both-teams summary (`Challenges left: …`) via `reviews-feed.js` fallback, whereas `README.md` / `R2-4` state those rows omit a visible counter line | `823180`: `review` CIN `0/1`, SF `1/0`; `absChallenges` CIN `4/0/2`, SF `2/1/1` | **Flagged (parity preserved):** kept identical to live `snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26` so visual parity with the reference site is preserved; owner's call whether to hide on umpire rows later. | <https://statsapi.mlb.com/api/v1.1/game/823180/feed/live?fields=gameData,review,absChallenges,hasChallenges,away,home,used,remaining,usedSuccessful,usedFailed> · <https://snapquast73-boop.github.io/LIVPBP/reviews.html?date=2026-08-26> | Flagged — owner's call |
| A1-8 | Documentation discrepancy in `AF-4`: states "45-day `scheduleRange`", whereas both `scoreboard.js` and `reviews-feed.js` query `-180` days | Last 2026 game `2026-10-28` (28 days before `2026-11-25`) | **Flagged:** 180-day window kept so offseason lookups continue reaching back to October throughout winter; discrepancy recorded rather than silently rewriting prior audit row `AF-4`. | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-10-20&endDate=2026-11-25&fields=dates,date,totalGames> · <https://github.com/kanlerxz87-cyber/Alert1/blob/main/assets/js/scoreboard.js> | Flagged |
| A1-9 | Arena fixed branch `arena/df7b58c1-alert1` used instead of `session-<id>/<task>`; `v1.0.0-stable-checkpoint` tag absent on `Alert1`; unconfirmed external constants (club colours, forecast weights, rate limit) | | Fixed branch documented in `COORDINATION.md`; tag not fabricated; unconfirmed values left blank and flagged (carried from `U-1`/`U-2`/`U-9`/`U-10`/`C-6`). | <https://api.github.com/repos/kanlerxz87-cyber/Alert1/tags> · <https://statsapi.mlb.com/api/v1/teams?sportId=1> | Flagged / Unverified |

### Checks run by `df7b58c1`

```text
npm test                         -> 69 passed, 0 failed  (+5 regressions in §[14])
node tests/run-all.mjs           -> syntax OK · 48 local refs OK · 8 bindings OK · 47/47 jsdom
node tests/props-provenance-test.mjs -> 5 passed, 0 failed
node tools/restoration-check.mjs -> ALL CHECKS PASSED
```

---

## 10. Independent copy-parity & upcoming-game-day verification — session `0eea8c12` (2026-11-25)

Session `0eea8c12` independently re-verified the copy of `snapquast73-boop/LIVPBP` (`5c02527`, still upstream HEAD) by git blob hashes, live reference parity, and fresh official MLB StatsAPI schedule fetches. No site code was changed in this pass: no JS defects were found. Full record: [`audit/alert1-verification-0eea8c12.md`](audit/alert1-verification-0eea8c12.md).

| # | Item / finding | Confirmed official value | Resolution / why it is flagged | Official source | Status |
|---|---|---|---|---|---|
| H-1 | Copy parity by git blob hashes: 19 files byte-identical to upstream `5c02527`; 5 JS files differ only by previously verified fixes; no file missing or deleted | Upstream HEAD still `5c02527d3c7a56ea66c698cfabff80a407b6dfd3`; live `reviews.html?date=2026-08-26` matches the reference row-for-row (10 Reviews · 8 Challenges · 2 Umpire · 68 ABS · 1 Boundary · 1 Runs at risk · 15 games · 78 tracked entries) | **Verified — no action:** the copy runs like the reference with no manual input. Upcoming slates confirmed: `2027-02-19` 17 games, `2027-03-25` 14 games, offseason `2026-11-25` offers both `2026-10-28` and `2027-02-19` jump buttons. | <https://github.com/snapquast73-boop/LIVPBP/tree/5c02527d3c7a56ea66c698cfabff80a407b6dfd3> · <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26&fields=dates,date,totalGames,games,gamePk,officialDate,status,teams,team,name> · <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&fields=dates,date,totalGames,games,gamePk,gameDate,status,startTimeTBD,detailedState,teams,away,home,team,name> | Verified |
| H-2 | `v1.0.0-stable-checkpoint` tag exists only on upstream (`ffceec3`); this repo has no tags, so README's `git reset --hard v1.0.0-stable-checkpoint` fails here | Upstream ref `refs/tags/v1.0.0-stable-checkpoint` → `ffceec3e9f24c870b160d40c40ec6d8144c0e47a`; Alert1 `git tag -l` and remote tags both empty | **Flagged for your decision:** README copy notice now states the tag is absent here and points to `flagged.html` §18. Tag not created/pushed (branch-only push rule). | <https://github.com/snapquast73-boop/LIVPBP/tree/v1.0.0-stable-checkpoint> · <https://github.com/kanlerxz87-cyber/Alert1/blob/main/README.md> | Flagged — needs your decision |
| H-3 | Reference renders bogus `4:33 AM`/`6:33 AM` for `startTimeTBD` games on `2027-03-25`; this copy renders `TBD` | Official payload: `854131` `2027-03-25T08:33:00Z`, `852663`/`853388` `2027-03-25T10:33:00Z`, all `startTimeTBD: true` | **Intentional improvement over the reference (live-verified):** recorded so the difference is not mistaken for a copy error. | <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2027-03-25&fields=dates,games,gamePk,gameDate,status,startTimeTBD> · <https://kanlerxz87-cyber.github.io/Alert1/?date=2027-03-25> | Verified improvement |
| H-4 | Arena branch convention deviation (`arena/0eea8c12-alert1` instead of `session-<id>/<task>`) — inherited | Session fixed to one branch; integration is a PR into `main` | **Flagged (no action):** published in `COORDINATION.md` branch note and `flagged.html` §18. Claim committed/pushed first (`89e4706`). | <https://github.com/kanlerxz87-cyber/Alert1/blob/main/COORDINATION.md> | Flagged — inherited |

### Checks run by `0eea8c12`

```text
npm test                                     -> 69 passed, 0 failed
node tests/run-all.mjs                       -> syntax OK · 50 local refs OK · 8 bindings OK · 47/47 jsdom
node tests/props-provenance-test.mjs         -> 5 passed, 0 failed
node tests/alert1-feedlog-and-provenance-test.mjs -> 4 passed, 0 failed
node tools/restoration-check.mjs             -> ALL CHECKS PASSED
live: reviews.html?date=2026-08-26           -> identical to reference (10/8/2/68/1/0/1, 15 games, 78 entries)
live: ?date=2027-03-25 / ?date=2027-02-19    -> 14 / 17 games, TBD on startTimeTBD games only
live: ?date=2026-11-25 (offseason)           -> empty slate + 2026-10-28 / 2027-02-19 jump buttons
```
