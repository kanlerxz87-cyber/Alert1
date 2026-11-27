# Live state, latency, alert sound and the official-scoring ledger

Session `ccfa803c` · 2026-11-27 · branch `arena/ccfa803c-alert1`

This document records **what was built, what was verified against the official
MLB StatsAPI, and exactly how fast the feed can be** — including the parts that
are not instant, because a latency claim that ignores its own floor is worthless
for something that has to alert correctly for a whole season.

Files touched:

| File | Role |
| --- | --- |
| `assets/js/json-patch.js` | RFC 6902 patch engine (the format `diffPatch` uses) |
| `assets/js/delta-feed.js` | Per-game transport: Gameday websocket push → `diffPatch` deltas → full-feed seed/recovery |
| `assets/js/live-state.js` | Official state snapshot, second-precision timestamps, before → after diff |
| `assets/js/scoring-ledger.js` | Separate, persistent audit ledger (localStorage + local server + export) |
| `assets/js/state-panel.js` | Renders the *Live game state* and *Official scoring ledger* sections |
| `assets/js/alertsound.js` | The ~3 s raindrop, one shared AudioContext, honest test path |
| `assets/js/reviews-feed.js` | Event detection now runs on accepted deltas instead of a timer sweep |
| `reviews.html`, `assets/css/style.css` | The two new sections, the sound toggle + test control |
| `server.mjs` | `/api/scoring-ledger[/stream]`, its own file namespace |
| `tests/live-latency-and-ledger-test.mjs` | 101 checks over all of the above |

---

## 1. Latency: what the feed actually does now

### 1.1 The three official transports

| # | Transport | Endpoint | When it is used |
| --- | --- | --- | --- |
| 1 | **Push** | `wss://ws.statsapi.mlb.com/api/v1/game/push/subscribe/gameday/{gamePk}` | Preferred. MLB tells the page a game changed; the page pulls the delta in the same tick. No polling interval between the play and the alert. |
| 2 | **Delta** | `GET /api/v1.1/game/{pk}/feed/live/diffPatch?startTimecode=…[&pushUpdateId=…]` | The backstop for transport 1 (a dropped socket frame is otherwise invisible) and the primary transport whenever the socket cannot open. Returns RFC 6902 ops against the copy already held. |
| 3 | **Full** | `GET /api/v1.1/game/{pk}/feed/live` | Seed only, plus recovery whenever a patch cannot be applied. Never silently mixed with a patched tree. |

Verified live on 2026-11-27:

- `GET /api/v1.1/game/745111/feed/live/diffPatch?startTimecode=20240403_011327&endTimecode=20240403_011340`
  → `[{ "diff": [ {op:replace, path:"/metaData/timeStamp", …}, {op:add, path:"/liveData/plays/allPlays/69/playEvents/1", …}, … ] }, …]`
  (four patches, 93 chunks of payload — i.e. a whole game's worth of changes,
  requested as a single delta).
- The same call with **no** `endTimecode` and with an **invalid** timecode both
  answered with a **full feed object** instead of a patch — so "full feed
  instead of patch" is a normal answer, and the engine treats it as a seed, not
  an error.
- `GET /api/v1.1/game/745111/feed/live/timestamps` → 553 timecodes for one game,
  several per pitch, confirming the official update cadence is sub-10-second
  during play.
- `metaData.wait` in the feed is MLB's own suggested wait (10 s for a live
  game). The UI shows it and reports the cadence we actually use.

### 1.2 Poll/wake cadence as shipped

| What | Cadence | Why |
| --- | --- | --- |
| Delta poll per **live** game | **250 ms**, tightened to **150 ms** while the official status is a review (`M*`/`N*`/`IH`) | The delta is a few hundred bytes; the review window is exactly when seconds matter |
| Schedule sweep (whole slate, ~2 KB) | 250 ms while anything is live — it is how a game is *discovered* to have gone live | Without it a newly started game is invisible |
| Gameday socket | event-driven | Zero latency contribution of our own |
| Official status sweep | 4 s (was 125 ms) | A live game's deltas already carry its status; the sweep is now belt-and-braces and no longer competes for the connection budget |
| Post-final ruling window | 1 s for the first 2 min, 2.5 s to 5 min, then 15 s, for 30 min after the final out | Late official rulings are precisely the thing to catch |
| Hidden tab | ops paused; everything resumes on focus and immediately polls every live game | A background tab must not burn a season's worth of requests |

The per-game full-feed fetch of the old design (750 ms–1.5 s by the end of a
game, ~15 games × every 250 ms) is gone from the live path.

### 1.3 What makes the first alert of a review happen sooner

Four separate things, because a review can become visible in four ways:

1. **Socket frame** → delta pull in the same tick (no timer).
2. **Delta carrying `gameData.status.statusCode`** → the flip is in the same
   payload as the play, so it is detected on the update that caused it.
3. **Official status sweep** (4 s) as a safety net if a game is live but has no
   open stream.
4. **Cached full-feed copy** → the official counters (`gameData.review`,
   `gameData.absChallenges`) come from the tree already held, so the
   challenges-remaining line never lags the row it is printed on.

### 1.4 The honest floor (read this before trusting a stopwatch)

- **MLB's publication cadence is the dominant term.** We can only be as early as
  the official feed is: if Gameday publishes a review 8 seconds after the umpire
  announces it, no transport shortens that. The deltas + socket remove *our*
  contribution (polling interval, payload size, parse time), not MLB's.
- **The browser is not a terminal.** A background tab, a sleeping laptop or a
  throttled timer can delay any poll. The page pauses when hidden on purpose
  (request etiquette) and catches up the moment it is focused.
- **No push subscription in every environment.** If the websocket cannot open,
  the delta poll is the transport and the latency floor is one poll interval
  (≤ 250 ms, ≤ 150 ms in a review) plus network time.
- **The fallback full-feed path still exists**, for a browser without
  `fetch`/`WebSocket` support or a feed whose patches cannot be applied. It is
  slower (a whole feed per game) — and it is the reason the site still works
  when everything else is unavailable.

---

## 2. Official state captured live, before and after

Every accepted update becomes one `LiveState.snapshot()` record, with:

| Field | Source |
| --- | --- |
| `capturedAtMs` / `capturedAtIso` | local clock at capture, **second precision** (`…T23:10:22Z`) |
| `gamedayTimecode` | `metaData.timeStamp` of the state described |
| `status.abstract / coded / detailed / code / reason` | `gameData.status` |
| `inning.num / half / label` | `liveData.linescore.currentInning` + `inningState` |
| `outs`, `count.balls`, `count.strikes` | `liveData.linescore` (falling back to the current play's count) |
| `score.away / score.home` | `liveData.linescore.teams`, falling back to `result.awayScore/homeScore` |
| `batter.id / name`, `pitcher.id / name` | `linescore.offense.batter`, `linescore.defense.pitcher` (falling back to the play's matchup) |
| `pitchCount.pitcher / team` | `liveData.boxscore … stats.pitching.numberOfPitches`, matched to the **actual pitcher** (a team total is only reported when there is exactly one candidate team) |
| `bases.first / second / third` | `liveData.linescore.offense` |
| `currentPlay.atBatIndex / isComplete / hasReview / eventType / description / startTime / endTime / rbi` | the current play |
| `officialWording` | the payload's own `detailedState` + `reason` + play description, concatenated verbatim |

Diffing two snapshots produces the before → after record the feed rows show:
`Status`, `Inning`, `Outs`, `Count`, `Score`, `At bat`, `Pitcher`, `Pitch count`,
`Runners`, `Play event`, `Play description`, each with the observed value on both
sides. The row also prints the payload's own wording **before** and **after**,
and the Gameday timecode it came from.

Flags computed on each diff: `reviewStarted`, `reviewEnded`, `newPitch`,
`newPlay` (a genuinely new at-bat), `scoreChanged`, `pendingScored`, and
`unscoredAtBat` — a plate appearance that is **complete in the official feed
with no published result**. That last state is the "at-bat not scored yet" case;
it is defined once, in `LiveState.isPendingResult()`, and is treated exactly like
the API's own `os_ruling_pending_primary` / `os_ruling_pending_prior` types.

---

## 3. The official-scoring ledger (separate by construction)

**Requirement:** pending rulings and official scoring changes must be logged and
kept in their own section, survive a refresh, and must not be able to disturb
the alert system.

How that separation is enforced:

| Concern | Alert path | Ledger path |
| --- | --- | --- |
| Module | `reviews-feed.js`, `feed-log.js` | `scoring-ledger.js`, `state-panel.js` |
| Storage key | `mlbp.feedlog.<date>` | **`mlbp.scoringledger.v1.<date>`** |
| Server route | `/api/feed-log`, `/api/feed-log/stream` | **`/api/scoring-ledger`, `/api/scoring-ledger/stream`** |
| Server file | `data/feed-log-<date>.json` | **`data/scoring-ledger-<date>.json`** |
| SSE client set | `sseClients` | **`ledgerSseClients`** (separate, so a slow stream on one cannot delay the other) |
| Failure mode | — | every ledger write is wrapped; a ledger error is logged and the alert still fires and the row still renders |

What is recorded:

- **Pending** — first observation of a pending ruling (or a completed-but-unscored
  plate appearance), with the full before-state, the official wording, the
  Gameday timecode and a second-precision timestamp. Re-observing it never
  overwrites the first capture (the audit trail is the first capture).
- **Resolved** — when the official result is published, the record is closed with
  the after-state and its own timestamp.
- **Change** — a reclassification, with both official descriptions
  (`from`/`to`), the score/outs at capture, and an attribution note. A play
  re-scored more than once keeps **every** ruling in a `revisions[]` chain.

Persistence, in order:

1. `localStorage` (always, written synchronously on every record — a refresh
   cannot lose a row; 14 dates kept, 1 500 records per date);
2. the local server (`POST /api/scoring-ledger`, merged by record id: earliest
   capture wins, latest ruling survives, revisions union);
3. live SSE push from that server to every open page;
4. **JSON / CSV export** from the section itself, so the log can be taken out of
   the browser entirely.

### Suggestions for running this through the season

1. **Run `node server.mjs` on a small always-on box.** Static GitHub Pages has no
   server, so on Pages the ledger lives in `localStorage` only — which survives a
   refresh but not a cache clear or a different browser. With the server running,
   the ledger is a file on disk, shared across browsers and exportable.
2. **Export weekly.** `⭳ JSON` / `⭳ CSV` in the ledger section is the only copy
   that is not tied to a browser. CSV opens directly in a spreadsheet for review.
3. **Leave the archive alone.** `data/` is git-ignored by design; the ledger is
   runtime data, not source.
4. **The audit log and the alert system are intentionally not the same store.** If
   a ruling arrives while the tab is closed, the ledger cannot invent it — the
   "first observed" time is honestly the first time *this deployment* saw it.
   Running the server (or keeping a tab open on the box) is what makes that
   time close to the official one.

---

## 4. Alert sound

- One ~3.0 s raindrop: four filtered droplets (a band-passed noise "plip" over a
  falling sine body) landing on a warm D5/A5 chime, an echo tail, a low-pass
  across the whole graph. Master peak **0.16** — deliberately gentle, because it
  has to be listened to all season. No sharp transients.
- **One shared `AudioContext`** for the page (browsers limit how many a page may
  create; the old code created one per sound).
- **Toggle on/off** in the header; the preference is remembered per browser.
  Turning it **on** immediately plays the sound (from the click that unlocked
  audio), which doubles as the first proof that the path works.
- **🔔 Test** button: bypasses the 2.2 s de-duplication cooldown and reports the
  outcome in the header — including the honest failure case, *"blocked until you
  interact with the page"*, instead of pretending it played.
- It fires for **every event that lands on the feed** — manager challenges,
  umpire/crew-chief reviews, boundary calls, official-scorer pending rulings,
  unscored at-bats and official scoring changes — and for a run-at-risk review,
  with one extra low pulse so the risk case is distinguishable by feel. Routine
  ABS pitch challenges stay silent (documented, pre-existing behaviour).
- 2.2 s de-duplication: two events in the same second are one sound, not two
  overlapping ones.

---

## 5. Verification record

| Check | Result |
| --- | --- |
| `node tests/live-latency-and-ledger-test.mjs` | **101/101** — patch engine (incl. MLB's `replace`-as-append and `~0`/`~1` pointers), state capture, diff flags, delta apply/reseed/empty-patch, push-frame → delta pull, sound graph (droplets, self-terminating voices, gentle peak), ledger record/merge/export rules, page wiring |
| `node tools/smoke-test.mjs` | **69/69** |
| `node tests/run-all.mjs` | PASS (link-check 74 refs, contract-check 8 bindings, jsdom-render-test 47 checks) |
| `node tests/props-provenance-test.mjs` | 5/5 |
| `node tests/alert1-feedlog-and-provenance-test.mjs` | 6/6 |
| `node tests/da098af9-upcoming-and-parity-test.mjs` | 2/2 |
| `node tools/restoration-check.mjs` | ALL CHECKS PASSED — now also round-trips `/api/scoring-ledger` and proves the ledger file is **separate** from the feed-log file and that a merge keeps the first capture time with its own timestamp |
| Live server | `GET /reviews.html` 200; `POST /api/scoring-ledger` → `{ok:true, records:1}`; `GET` returns the record; `GET /api/scoring-ledger/stream` opens an SSE stream |

Two real defects were found by these checks and fixed rather than papered over:

1. **A worker that threw silently stalled `runLimited`** — one bad payload would
   have frozen the whole feed with no error shown. Slots are now always released
   and the error is surfaced on the status line.
2. **A ledger merge could date a record wrongly**: it kept the earliest
   `capturedAtMs` but the latest `capturedAtSec`, so a record could display a
   time that never happened. Client and server now keep the ms and the ISO string
   of the *same* observation.

### Still true, and stated rather than implied

- No alert can precede MLB's own publication. The work above removes our
  contribution to the delay; it cannot remove MLB's.
- On static GitHub Pages the ledger is `localStorage`-only (no server). The
  refresh requirement is met; cross-browser/disk persistence needs `server.mjs`.
- The websocket message format is read defensively (any frame that names an
  update id or a change type triggers a delta pull). It is verified here against
  a stubbed socket, not against a live in-progress game — no MLB game is in
  progress on 2026-11-27 (offseason).
- Fixtures for the delta/state tests are shape-faithful to the official
  responses cited in §1.1, trimmed to the fields under test.
