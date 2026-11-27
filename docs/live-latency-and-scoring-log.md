# Live latency, live state capture and the official-scoring log

Session `3b986e1e` · 2026-11-27 · branch `arena/3b986e1e-alert1`

This note explains, against the **official MLB StatsAPI**, how the Replay Feed
gets its data as fast as the public API allows, what it captures about a live
game, and how the official-scoring record book is kept separate from the alert
system. Every endpoint named here is a public, keyless, CORS-enabled MLB
StatsAPI route — the same data MLB.com's own Gameday consumes.

Sources used for this page:

- Live game feed (what this site polls): <https://statsapi.mlb.com/api/v1.1/game/824638/feed/live>
- Lean full play-by-play: <https://statsapi.mlb.com/api/v1/game/823180/playByPlay>
- Schedule for a date: <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-26&hydrate=review>
- Official status wording registry: <https://statsapi.mlb.com/api/v1/gameStatus>
- Official event types (`os_ruling_pending_*`): <https://statsapi.mlb.com/api/v1/eventTypes>
- Incremental-update endpoint (documented, not used yet — see §3): <https://github.com/toddrob99/MLB-StatsAPI/wiki/Endpoints>

---

## 1. There is no push feed. Latency is decided by how fast we poll.

The StatsAPI is **pull-only**: there is no public webhook, no public streaming
endpoint, and no documented "notify me when a challenge starts" call. Gameday
itself pairs a WebSocket push channel with the documented
`/feed/live/diffPatch` endpoint, but the socket route
(`wss://ws.statsapi.mlb.com/api/v1/game/push/subscribe/gameday/<gamePk>`) is
undocumented, unversioned and unauthenticated-by-design; relying on it for an
"as fast as possible, all season" alerting system would mean betting the whole
alert path on an interface MLB has never published or supported.

So the honest statement of what this site can promise is:

> **An event is alerted within one poll interval of the moment it becomes
> visible in the official payload.**

Everything below is about shrinking that interval and about making the interval
*measurable*, instead of guessing at it.

## 2. What the shipped latency path does

| Layer | Cadence | Why |
| --- | --- | --- |
| Lean play-by-play scan (`/api/v1/game/<pk>/playByPlay?fields=…`) | **250 ms** per live game | The smallest payload that fully describes a play, its review block and its scoring movements. |
| Fast in-review probe | **200 ms** per game, at most 4 games at once | While a review is actually open, that game is what matters; the cap keeps a 15-game slate inside the request budget. |
| Status sweep (`/api/v1/schedule?fields=…status…`) | **125 ms** | Sees `statusCode` flip to `MA`/`NA`/`AB` the moment MLB publishes the review, then fetches that game out of band immediately. |
| Projected full-feed resync (`/api/v1.1/game/<pk>/feed/live?fields=…`) | **10 s** per live game | Safety net: recovers any field a `fields` projection dropped, carries `currentPlay` (batter/pitcher/on-deck) and MLB's own `metaData.timeStamp`. |
| Schedule for the page | reused for **400 ms** | 15 games no longer cost ~4 schedule requests/s; that budget goes to the feeds that actually move. |
| Post-Final grace | 1 s → 2.5 s → 15 s, for 30 min | Late official-scoring rulings land after the last out. |

Latency-specific details that matter:

- **`cache: 'no-store'` + a unique `_=` query parameter on every poll.** A CDN
  edge or a mis-configured proxy can answer a GET from its own cache even when
  the request says not to; a unique URL makes a replayed response impossible.
- **6 s per-request timeout.** One slow response can no longer hold up a scan.
- **Per-game ingest.** Each game's response is ingested and rendered the moment
  it lands (`renderSoon()`, coalesced to one DOM write per ~16 ms), so an
  event that arrives at 90 ms is on screen at 90 ms instead of waiting for the
  slowest sibling in the batch.
- **One request in flight per game**, newest response wins — no queue of stale
  responses to walk the page backwards.
- **The measurement is on the page.** The summary bar reports the number of
  polls measured, the **median** and **p95** round trip, and each live game
  shows its own last round trip. "Fast" is a number, not a claim.

### Request budget (15-game slate, single client)

| Request | Count | Rate |
| --- | --- | --- |
| Play-by-play scan, live games | 15 | 60/s |
| Fast in-review probe (when reviews are open) | ≤ 4 extra polls | +20/s worst case |
| Status sweep | 1 | 8/s |
| Projected resync | 15 | 1.5/s |
| Schedule | 1 | 2.5/s |

Worst case ≈ **92 requests/s** for one open tab on a full slate, and the tab
stops entirely when hidden unless you switch **Background** on. This is a
personal, non-commercial project; see the terms discussion already recorded on
[`flagged.html`](../flagged.html).

## 3. The fastest option that is actually public: `feed/live/diffPatch`

MLB publishes an incremental endpoint:

```
GET https://statsapi.mlb.com/api/v1.1/game/<gamePk>/feed/live/diffPatch?startTimecode=<t>&endTimecode=<t>
```

It returns the *changes* between two of MLB's own timecodes instead of the whole
document, which is the cheapest possible way to stay current — but it has three
properties that make it a poor foundation for the alert path today:

1. **The response is not always a patch.** It sometimes returns a whole
   `feed/live` document and sometimes signals a full refresh, so the client needs
   the full-feed path anyway.
2. **Patch paths address fields typed clients never decode**, so they must be
   applied to a raw JSON tree; applying them to a decoded model corrupts it.
3. **It still needs a timecode to start from**, which only the full feed
   provides (`metaData.timeStamp`).

The shipped design therefore *captures* the timecode on every resync (so the
provenance of each state is official), while the alert path keeps the lean
play-by-play scan. Turning the resync into a `diffPatch` poll is the single
biggest remaining bandwidth win and needs no change to the record format — the
capability is documented here, not guessed at, and it can be added behind the
existing `MLB.gameFeedState()` seam.

## 4. What "capture the state of the game" means here

Every poll turns the official payload into one state record
(`assets/js/game-state.js`) and stores it, with **two clocks that are never
confused**:

| Field | Source |
| --- | --- |
| `observedAt` | our own `Date.now()` when the response landed (ms) |
| `timecode.timeStamp` | MLB's own `metaData.timeStamp` from `feed/live`, verbatim |

The record carries: score (with hits and errors), inning number/half/state,
outs, ball–strike count, runners on base, the batter at the plate, the pitcher,
on-deck and in-the-hole hitters, the pitch count (game total from
`playEvents[].isPitch`, this plate appearance, and the pitcher's own official
`numberOfPitches` when the payload carries a boxscore), the plate-appearance
index, the last completed play's wording and classification, the official
manager-challenge and ABS counters, and the game status.

Nothing is inferred: a field the payload does not carry is `null` and renders as
"—". The page shows the state **to the second** in a live board (`renderLiveState`)
for every live game, and it keeps a bounded per-game history that only grows when
something material actually moved — so 250 ms polling cannot flood the log.

### Before / after on every event

Every tracked event stores the state captured a moment **before** it and the
state captured **after** it (`stateBefore` / `stateAfter`), each with its own
`stamp` (local, to the second), `utc` and — when the resync supplied one — the
official `timeStamp`. The row renders both blocks side by side:

```
Before                                  After
10–8 · Bot 6 · 1 out · 2-1 · P 78     10–8 · Bot 6 · 2 outs · 0-0 · P 81
Observed 2026-08-28 17:31:52 local      Observed 2026-08-28 17:31:53 local
```

This is what makes "the exact official information and wording before and
after" checkable rather than asserted: the wording comes from
`result.description` / `runners[].details`, and the numbers come from the
official linescore and count blocks.

## 5. The two event families this is built for

### a. Challenges, manager challenges, reviews, umpire reviews

Read from `reviewDetails` (play level and pitch level) and from the schedule's
`statusCode` (`MA` = manager challenge, `NA` = umpire review, `IH` = instant
replay, plus the whole `M*`/`N*` families). Type wording comes from
[`/api/v1/gameStatus`](https://statsapi.mlb.com/api/v1/gameStatus), the API's own
registry — never from wording we invented. A review that is open
(`reviewDetails.inProgress === true`) also starts the 200 ms fast probe for that
game and appears in the Under Review strip and the red banner.

### b. Official-scorer pending rulings and scoring changes

- **Pending** rulings are the API's own event types
  `os_ruling_pending_primary` / `os_ruling_pending_prior`, description
  "Official Scorer Ruling Pending"
  ([`/api/v1/eventTypes`](https://statsapi.mlb.com/api/v1/eventTypes)). They are
  logged *before* anything is alerted, and are closed in the book — with the
  exact wording last observed and the state at resolution — when the payload
  stops carrying the pending type. The book never guesses what the ruling became;
  the scoring-change diff reports that separately, with its own before/after.
- **Scoring changes** are detected by diffing each completed play's official
  classification (`result.eventType`, `result.isOut`, `count.outs`,
  `result.description`) between two observations, because **the payload carries
  no scoring-change marker**. A reclassification is a change; a description /
  RBI / score edit with the same classification is logged as an edit and flagged,
  never silently corrected.

## 6. Why the scoring log is a separate system

The requirement was explicit: *"This work should stay separate from the alert
system so any changes do not disrupt the alert system."* The implementation
takes that literally:

| | Alerts | Official-scoring book |
| --- | --- | --- |
| Module | `assets/js/alert-sound.js` (+ the feed's `chime`) | `assets/js/scoring-log.js` |
| Storage | `mlbp.alerts.<date>` (an "already rung" ledger) | `mlbp.scoringlog.<date>` (the records) |
| Server | none (client-side only) | `GET/POST /api/scoring-log`, `data/scoring-log-<date>.json` |
| Can lose data? | Losing it only means a tone may ring again | Records are append-only and merged, never overwritten |
| Failure isolation | Audio unavailable ⇒ silent, page unaffected | Store unavailable ⇒ browser store keeps working |

Concretely: resetting the alert ledger (`Clear alert ledger` in the page, or
`AlertSound.forget(date)`) cannot touch a record, because the two never share a
key; turning alerts off cannot stop the book from being written, because
`ScoringLog.upsert()` is called *before* the alert decision; and a corrupt
ledger is dropped with a console warning while the book keeps loading. The book
also survives a refresh in two ways — the browser store (always) and the shared
server store (when `node server.mjs` is running), and it renders from
`ScoringLog` itself, never from the feed rows.

The book is on the page as its own section (**Official scoring log**) with its
own views (All records · Pending · Resolved pending · Scoring changes), its own
counts, and a text export. It is deliberately *not* driven by the feed's filter
tabs, so a UI change to the alert feed cannot hide a record.

## 7. Alert sound: pleasant for a whole season, and testable

`assets/js/alert-sound.js` synthesizes a **~3 second rain-drop shower** with
WebAudio: soft sine droplets with a fast attack and a long exponential tail, a
band-limited noise bed that reads as rain on a window, a short shared echo, and
a warm two-note chime underneath. There is no audio file — nothing to download,
decode or cache on the alert path, and no binary in the repository.

Each tracked event gets a motif (same texture, different droplet pattern and
chime interval) so the ear can tell them apart: review, pending ruling, scoring
change, runs at risk. A 900 ms cooldown and a 3 s master fade mean six games
changing at once produce one pleasant shower, never a pile-up.

Controls, all in the header:

- **Alerts Off / Alerts On / Scoring Alerts only** — one button, three states,
  remembered per browser. Switching them on plays the tone, so the toggle
  itself is the proof the path works.
- **▶ Test alert** — plays the full demo shower, ignores the cooldown, and
  reports *why* nothing played if the browser blocked audio.
- **🎯 ABS Alerts** — ABS pitch challenges are frequent; silent unless enabled.
- **🌙 Background** — keep polling (and alerting) while the tab is hidden.
- **Clear alert ledger** — re-arm alerts for events already on the page.

Every alert is claimed once in the ledger, keyed by event id and date, so a
refresh or a second tab never replays a sound for something already heard.

## 8. Limits, stated plainly

- The StatsAPI is **unofficial and may change without notice**. The client is
  written defensively, but a breaking change is possible.
- **The floor on latency is MLB's own publish delay**, which is not documented
  and varies. This site minimizes only the delay *after* publication.
- A review that has already resolved by the time the page opens is reported as
  observed-after-resolution; the before-side is left explicitly unobserved
  rather than inferred.
- The initial state of a page that opens mid-game adopts the current state; the
  before/after pair on an event is only exact when both observations happened
  while the page was open (the rows say which, via `observed live` /
  `adopted from store`).
- Alerts are per browser tab. Closing the page stops the alerts; `server.mjs`
  keeps the *records* shared, not the audio.
