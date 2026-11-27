# Session `3b986e1e` — latency, alert sound, live state capture and the official-scoring log

Branch `arena/3b986e1e-alert1` · base `cdf8b08` (`main`) · 2026-11-27

This is the verification record for the four pieces of work requested in this
session. Each claim below names the file it lives in and the check that proves
it, so it can be re-run rather than trusted.

**Environment note (important):** this sandbox has outbound access to
`github.com`, `api.github.com`, `registry.npmjs.org` and `pypi.org` only. Calls to
`statsapi.mlb.com` are blocked here (verified: `curl` fails with a connection
error), so every value used by the new code was taken from the **official
payloads already captured verbatim in `tests/fixtures/`** (originally fetched
from `statsapi.mlb.com` on 2026-11-20 and re-verified by the prior sessions
recorded in `COORDINATION.md`). No network value was invented, and no claim on
this page depends on a live call made in this session.

---

## 1. Files

| File | Status | Purpose |
| --- | --- | --- |
| `assets/js/alert-sound.js` | new | ~3 s synthesized rain-drop alert, per-event motifs, audio-graph management, "already alerted" ledger |
| `assets/js/game-state.js` | new | official live-state capture (score, outs, count, inning, batter, pitcher, pitch count, counters, timecode), before/after diff, second-resolution stamps |
| `assets/js/scoring-log.js` | new | the separate official-scoring record book (own storage, own merge, own export) |
| `assets/js/reviews-feed.js` | changed | latency path, per-game ingest, fast probe, resync, capture wiring, alert ledger, new renders |
| `assets/js/api.js` | changed | cache-busting + per-request timeout options, projected `feed/live` state helper |
| `assets/css/style.css` | changed (appended) | styles for the new surfaces only; nothing existing was altered |
| `reviews.html` | changed | the new controls and sections; the three new scripts |
| `server.mjs` | changed | `GET/POST /api/scoring-log` with its own file store and merge |
| `tests/live-capture-alerts-test.mjs` | new | 17 regressions for this session |
| `tools/smoke-test.mjs` | changed | one harness bug fixed (see §7) |
| `.github/workflows/site-check.yml` | changed | runs the new suite in CI |
| `docs/live-latency-and-scoring-log.md` | new | the explanation + the MLB API recommendations |
| `README.md`, `COORDINATION.md` | changed | documentation of the above |

## 2. Latency (L-1)

| Claim | Where | Proof |
| --- | --- | --- |
| Every poll is cache-busted and never revalidated from a cache | `api.js` `getJSON({ bust })`, `reviews-feed.js` `fetchGame()` | `live-capture-alerts-test` "every polling path is cache-busted" |
| Live games poll every 250 ms; a game under review every 200 ms (≤4 games) | `SCAN_MS`, `REVIEW_PROBE_MS`, `REVIEW_PROBE_MAX_GAMES`, `gameDelay()` | "the fast in-review probe … is configured" |
| A game is ingested + rendered the moment its own response lands | the `runLimited` worker now calls `ingestGame` + `renderSoon()` | "a game is ingested and rendered the moment its response lands" |
| The schedule is reused for 400 ms instead of re-polled every tick | `scheduleFor()`, `SCHEDULE_TTL_MS` | source assertions in the same test |
| A projected `feed/live` resync runs every 10 s per live game (safety net + official timecode) | `resyncTick()`, `resyncGame()`, `MLB.gameFeedState()` | "…and the resync are configured" |
| One request in flight per game; newest response wins | `requestGame()` / `state.inFlight` | source assertion + `race` guard in the worker |
| The measurement is on the page (median / p95 / per game) | `latencyStats()`, `gameLatency()`, the summary tiles and the live board | "latency instrumentation reports median/p95…" |

Request budget is documented in `docs/live-latency-and-scoring-log.md` §2
(worst case ≈ 92 requests/s for one visible tab on a 15-game slate, and the tab
pauses when hidden unless **Background** is switched on).

## 3. Alert sound (L-2)

| Claim | Where | Proof |
| --- | --- | --- |
| A ~3 s rain-drop shower, synthesized (no audio asset) | `alert-sound.js` `playMotif()`, master fade ending at 3.0 s | "one shared audio graph, a ~3 s shower" + "every Web Audio node … is exercised" |
| A distinct motif per tracked event (review / pending / scoring / risk / test) | `MOTIFS` | same two checks |
| One tone at a time | `COOLDOWN_MS = 900` + the shared graph | "a second tone inside the cooldown must be dropped" |
| An on/off toggle that can be tested | `#sound-toggle-btn` (Off → On → Scoring only), `#alert-test-btn` | `alert-sound.test()` returns `{ ok }`/`{ ok:false, reason }` and the page reports it in `#alert-test-note` |
| Every event that shows up in the feed can alert | `chime()` is called for reviews, runs at risk, pending rulings, scoring changes and edits-to-the-record | `tools/smoke-test.mjs` G-3 group (5 checks) — passing |
| A refresh never replays a sound | `alert-sound.js` ledger (`mlbp.alerts.<date>`) + `claimAlert()` | "the ledger claims an event exactly once, per date, across page loads" |
| No Web Audio ⇒ silence, never an error | `audioAvailable()`, `play()` returns `false` | "the alert path survives a browser with no Web Audio" |

## 4. Live state capture, before and after (L-3)

| Claim | Where | Proof |
| --- | --- | --- |
| Every poll becomes a state record: score, hits/errors, inning, outs, count, bases, batter, pitcher, on-deck/in-hole, pitch count, plate appearance, last play, official counters, status | `game-state.js` `capture()` | "capture() reads every official field, with both observation clocks" |
| Two clocks, never confused: our `observedAt` and MLB's `metaData.timeStamp` | `capture()`, `stateBlock()` | same check asserts `timecode.timeStamp` verbatim |
| Every stamp is to the second | `stamp()`, `clock()`, `utc()` | same check |
| Every review / pending ruling / scoring change stores the state **before** and **after**, with the exact official wording on both sides | `ingestGame()` (`stateBefore` / `stateAfter` / `officialBefore` / `officialAfter`), `beforeAfterHtml()` | "the feed stores a before/after pair on every captured event" |
| All games are monitored; a live board shows each captured state | `renderLiveState()`, `#live-state` | "the live board renders the captured state for every live game" + the end-to-end page run in §8 |
| Nothing is inferred when the before-side was not observed | `stateBlock()` empty state, `stateTracker` rules from the earlier sessions preserved | "First observation of this event — nothing is inferred…" branch; the pre-existing "Before-review score was not observed" irregularity still fires |

## 5. The separate official-scoring section (L-4)

| Claim | Where | Proof |
| --- | --- | --- |
| Pending rulings (`os_ruling_pending_primary` / `_prior`) and scoring changes are recorded in their own book | `scoring-log.js`, called from `ingestGame()` **before** the alert decision | "the book persists through a refresh and stays independent of the alert ledger" |
| Own storage, own merge, own export | `mlbp.scoringlog.<date>`, `mergePayloads()` / `mergeRecord()`, `exportText()` | "records merge without ever losing a before-side" + "the book has its own server endpoints and its own storage merge" |
| Persistent through refreshes | browser store + `server.mjs` `data/scoring-log-<date>.json` | the same two checks; plus a live round trip against `server.mjs` (§8) |
| Separate from the alert system, both directions | no shared key, no shared code path; `AlertSound.forget()` leaves the book intact | "…stays independent of the alert ledger" |
| A ruled-on pending entry closes honestly | `ScoringLog.revise()` on the payload no longer carrying the pending type, **only from a lean scan that has advanced past that at-bat** | "the book records a resolved pending ruling without guessing the new call" |
| Its own on-page section, views and export | `renderScoringSection()`, `#scoring-section` | end-to-end run in §8 shows 4 view buttons, records, export |

## 6. MLB API recommendations (L-5)

Implemented and verified here: per-game polling at the lean endpoint, `fields`
projections, cache-busting, the status sweep, the projected full-feed resync
carrying `metaData.timeStamp`, and the 400 ms schedule TTL.

Documented but **not** implemented, with the reason: switching the resync to the
public `feed/live/diffPatch` endpoint (`startTimecode` / `endTimecode`). It
returns only the delta and is the single biggest remaining bandwidth win, but its
response is not always a patch (it can return a whole feed and signal a full
refresh), patches address fields typed clients do not decode, and it still needs
a timecode bootstrap. The seam for it is `MLB.gameFeedState()` in `api.js`. Full
detail in `docs/live-latency-and-scoring-log.md` §3.

Also documented as deliberate non-goals: the undocumented Gameday WebSocket push
channel (would put the whole alert path on an unpublished interface), and any
attempt to predict a ruling.

## 7. A harness bug found and fixed

`tools/smoke-test.mjs` asserted `st.lastChimeAt > 0` after a rescan — but
`rescanAnd()` destructured that field into a local (`fn(st.lastChimeAt)`) at call
time, before the page could update it, so any sound the page produced afterwards
was invisible to the assertion. It passed before this session only because the
alert was emitted for *re-observed* rows on every scan. Now that the ledger
requires an event to be genuinely new (so a refresh cannot replay a sound), the
bug surfaced. The helper now reads `Number(st.lastChimeAt)` **after** the scan
settles, plus one extra tick. No product behaviour was changed to satisfy a
test; the test was corrected to measure what it claims to measure.

(Related, product-side: alerting is now gated on *newly tracked* events and then
claimed in the ledger, so a scan that re-reads an existing row cannot re-alert —
and a reload cannot either.)

## 8. Checks run in this session

| Check | Result |
| --- | --- |
| `node --check` on every changed script | pass |
| `node tests/run-all.mjs` (syntax, link-check 71 refs, contract-check, jsdom render 47 checks) | all PASS |
| `npm test` (`tools/smoke-test.mjs`, 69 checks incl. the G-3 alert group) | 69 passed, 0 failed |
| `node tests/live-capture-alerts-test.mjs` (new) | 17 passed, 0 failed |
| `node tests/alert1-feedlog-and-provenance-test.mjs` | 6 passed |
| `node tests/da098af9-upcoming-and-parity-test.mjs` | 2 passed |
| `node tests/props-provenance-test.mjs` | 5 passed |
| `node tools/restoration-check.mjs` (incl. server contract) | ALL CHECKS PASSED |
| End-to-end page run (`reviews.html` served over HTTP, jsdom, fixture-backed API) | live board, before/after blocks, live timestamps + timecode, alert controls, pending record, 4 scoring views, export all rendered |
| `server.mjs` `/api/scoring-log` round trip (POST ×2 then GET) | 200/200/200, before-side preserved, `firstObservedAt` min / `lastObservedAt` max merged, bad date → 400 |
| `GET /api/scoring-log?date=nope` | 400 |

Server round-trip detail (this is the merge rule the book depends on):

```
POST1 → {"ok":true,...,"recordsCount":1}   before: "wording before"
POST2 → {"ok":true,...,"recordsCount":1}   after:  "wording after"
GET   → {"id":"a:pending","before":"wording before","after":"wording after",
         "firstObservedAt":500,"lastObservedAt":2000}
```

## 9. Still flagged / limits

| # | Item | Disposition |
| --- | --- | --- |
| `3B-F1` | The sandbox cannot reach `statsapi.mlb.com`, so this session could not re-fetch live payloads. All values come from the official fixture captures in `tests/fixtures/` (2026-11-20) and the prior sessions' live verification. | **Disclosed.** Re-run `node tests/jsdom-render-test.mjs --live` from a networked machine to re-verify against the live API. |
| `3B-F2` | Latency is bounded by MLB's own publish delay, which is undocumented and varies. The page only minimizes the delay *after* publication, and reports the measured round trip. | **Documented** (`docs/live-latency-and-scoring-log.md` §8). No claim of a fixed end-to-end latency is made. |
| `3B-F3` | `feed/live/diffPatch` is documented but not wired in (see §6). | **Documented**, seam provided. |
| `3B-F4` | An event that was already resolved before the page opened has no observed before-side; the row says so instead of inferring one. | **By design**, carried over from the earlier sessions' rule. |
| `3B-F5` | Alerts are per tab. Closing the page stops the audio (the shared server store keeps records, not sound). | **Documented** in the README and the write-up. |
| `3B-F6` | Branch name is fixed by the platform to `arena/3b986e1e-alert1` rather than `session-<id>/<task>`. | **Disclosed**, same as every prior session. |

## 10. Official sources referenced

- Live game feed (state + `metaData.timeStamp`): <https://statsapi.mlb.com/api/v1.1/game/824638/feed/live>
- Lean play-by-play: <https://statsapi.mlb.com/api/v1/game/823180/playByPlay>
- Schedule for a date: <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26&hydrate=review>
- Review/status wording registry: <https://statsapi.mlb.com/api/v1/gameStatus>
- Official event types incl. `os_ruling_pending_primary` / `_prior`: <https://statsapi.mlb.com/api/v1/eventTypes>
- MLB's own scoring-change explanation: <https://www.mlb.com/official-information/scoring-changes>
- Incremental-update endpoint reference: <https://github.com/toddrob99/MLB-StatsAPI/wiki/Endpoints>
