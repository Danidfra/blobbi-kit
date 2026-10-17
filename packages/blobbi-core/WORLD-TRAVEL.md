# World travel (M16): World Location and Active Presence

**Status: EXPERIMENTAL, released in `@blobbi-kit/core` /
`@blobbi-kit/react` 0.11.0.** Kinds 31126 and 21124 are the experimental
identifiers of the Blobbi World Travel protocol
(`WORLD_TRAVEL_KINDS_STATUS = 'experimental'`). They were chosen after a
collision search (§7). They are **not** a NIP and have **not** been
standardized or registered by the Nostr community. The schema is versioned
(`["v", "1"]`) and may change in a later minor version. The apps keep live
publication behind a switch that is off by default.

**In short (0.11.0):**
- **World Location (31126) is persistent.** The Blobbi stays in its last World
  when the player disconnects, closes the app or goes offline.
- **Active Presence (21124) is optional and ephemeral.** When it expires, the
  Blobbi does not move, is not removed and stays valid.
- **A location is owner-authorized.** Only the owner's key signs it, on the
  player's act. **Autonomous Blobbi travel is not implemented** (§10).
- **Clients must handle disagreement.** Relays may disagree or be unreachable
  (§8). A relay pinned by a future-dated location may need an explicit
  recovery (§7b).

A Blobbi belongs to a Nostr account and can travel between **Worlds**. Worlds
are Blobbi-compatible experiences: Blobbi Standalone (`blobbi-home`), Blobbi
Pixel (`blobbi-pixel`), and later Island, Nostr Farm, Rumble. The protocol
answers two different questions with two different events:

| | World Location | Active Presence |
|---|---|---|
| Question | Where was this Blobbi last? | Is it being played there right now? |
| Kind | **31126** (addressable) | **21124** (ephemeral) |
| Lifetime | Never expires, never renewed | NIP-40 `expiration`, 120 s |
| Written | Once per move, on the player's act | Optional, at most once a minute while played |
| Authority | Canonical | A hint only; never moves the Blobbi |

Code: `src/world-travel.ts` (pure rules), `src/world-travel-session.ts` (the
operations, with relays, signer, store and lock injected),
`src/world-travel-sync.ts` (the on-screen Blobbi), `src/world-travel-follow.ts`
(the interaction count, M16.1), and in `@blobbi-kit/react` `useWorldTravel`,
`useWorldTravelSync` and `poolWorldTravelRelays`.

## 0. The product model: a Blobbi persists, a session does not

A Blobbi is a persistent entity in the ecosystem. Its owner may leave a
World, close the browser or go offline. The Blobbi does not cease to exist:
it stays associated with the last World it was moved to.

- **World Location (31126) is where the Blobbi is.** It is the last known
  World. It persists after the player disconnects. It does not need renewing
  and it never expires. Nothing changes it except a new World Location (a
  move): not a browser closing, not a tab hiding, not a presence expiring.
- **Active Presence (21124) is recent activity, nothing more.** It says "the
  owner's session was recently playing this Blobbi in this World". It is
  ephemeral and optional. It does not decide the location. It does not decide
  whether the Blobbi exists, and it does not mean the Blobbi is alive or dead.
  When it expires, the Blobbi does **not** return home and does not move at
  all.
- **A missing Active Presence means "activity unknown".** It does not mean
  the Blobbi has disappeared, or that nobody is playing. Presence is opt-in,
  relays do not store it, and it may be dropped. A World therefore uses it
  only for presentation: whether a departure window is worth waiting for (§5),
  and "being played there now" in its away notice.

## 1. World identifiers

`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, 3–32 characters (`isWorldId`). A World id is
a name. It is not a URL, a host or an application identity, and nothing
navigates to it or trusts it. `registerWorld({ id, name })` gives a World a
display name. The rules never depend on the registry: any valid id is a
place, and an unknown one is shown as "another Blobbi world". With no World
Location at all, a Blobbi is at `DEFAULT_WORLD` = `blobbi-home`.

## 2. World Location (kind 31126)

One addressable event per owner and Blobbi, at `31126:<owner>:<d>`, signed by
the owner (the Blobbi's 31124 author).

```json
{
  "kind": 31126,
  "pubkey": "<owner>",
  "created_at": 1800000060,
  "content": "",
  "tags": [
    ["d", "blobbi-<owner12>-<petId10>"],
    ["a", "31124:<owner>:blobbi-<owner12>-<petId10>"],
    ["v", "1"],
    ["world", "blobbi-home"],
    ["from", "blobbi-pixel"],
    ["arrival_after", "1800000063"],
    ["prev", "<id of the World Location this one replaces>"],
    ["b", "blobbi:ecosystem:v1"],
    ["alt", "Blobbi world location: this Blobbi is now in Blobbi Home"]
  ]
}
```

| Tag | Required | Meaning |
|---|---|---|
| `d` | yes, once | The Blobbi's own `d` (the same `d` as its 31124). A canonical `d` must carry the author's pubkey prefix. A legacy `d` must be printable (`[A-Za-z0-9._-]`, at most 100 characters). |
| `a` | yes, once | Exactly `31124:<author>:<d>`. |
| `v` | yes, once | `1`. Any other version is ignored, not guessed at. |
| `world` | yes, once | Where the Blobbi is now. A valid World id. |
| `from` | no | Where it came from. A valid World id other than `world`. |
| `arrival_after` | no | Unix seconds: the earliest intended arrival. A visual hint only (§5). It is clamped to `[created_at, created_at + 6]`. |
| `prev` | no | The id of the World Location this one replaced (an audit trail). |
| `b`, `alt` | written | The ecosystem marker and the NIP-31 description. Never required on read. |

Unknown tags, such as a host's `client` and `published_at`, are ignored. The
content is empty. A reader trusts an event because its signature verifies
(`verify` is injected and always required by `resolveWorldLocation`), never
because of the relay it came from.

**Order.** NIP-01: the higher `created_at` wins, and on a tie the lower id
wins (`replacesLocation`, `resolveWorldLocation`). Events from many relays,
the local store and the live stream are merged into one total order, so every
reader picks the same event. A writer stamps
`created_at = max(now, latest.created_at + 1)`. Its event replaces the one it
read even when its own clock is behind.

**One move, one event.** A World publishes only to move the Blobbi to itself,
and only when the canonical location names another World. If it already names
this World, nothing is written. No timer, focus, load, subscription or
re-render writes a location.

## 3. Active Presence (kind 21124)

Ephemeral. Relays forward it and do not store it.

```json
{
  "kind": 21124,
  "pubkey": "<owner>",
  "created_at": 1800000100,
  "content": "",
  "tags": [
    ["a", "31124:<owner>:<d>"],
    ["v", "1"],
    ["world", "blobbi-pixel"],
    ["expiration", "1800000220"],
    ["b", "blobbi:ecosystem:v1"],
    ["alt", "Blobbi active presence: this Blobbi was recently played in Blobbi Pixel"]
  ]
}
```

- **Valid** when it is version 1, `a` names a Blobbi of the author, `world` is
  valid, and `expiration` comes after `created_at` by at most 300 s.
- **Fresh** while `expiration > now` and `created_at <= now + 60 s`, so a
  presence dated far ahead of the reader's clock is not believed.
- **Counts only for the World that holds the Blobbi** (`presenceSupports`). A
  presence for any other World, such as an old device still renewing or a
  delayed event, is ignored. A presence never changes the location and never
  revives an old one.
- **No presence means "unknown"**, never "offline". Presence is optional, and
  relays may drop or delay it.

## 4. Transfer rules

`planTransfer` plus the session's `travel()`:

1. **On load**, the World reads the location (relays, stream and store) and
   publishes nothing. If the Blobbi is elsewhere, it is shown away at once,
   with no departure replayed.
2. **The Blobbi follows its owner** (M16.1). In a World that does not hold
   the Blobbi, each meaningful interaction is passed to `session.interact()`.
   The **third** interaction within a rolling **20 s** window starts a move,
   so one stray press never pulls the Blobbi out of the World it was just
   moved to, and a player who keeps playing here is followed without clicking
   anything (`world-travel-follow.ts`):
   - what is meaningful is each World's business: a trusted press or key in a
     visible, focused page, a distinct burst of movement. Never a load, a
     timer, a re-render, a script's (synthetic) event, programmatic focus or a
     visibility change;
   - an auto-repeat of a held key (`repeat: true`) never counts. Inputs closer
     than **1 s** to the last counted one are the same gesture (a pointerdown
     with its keydown, frames of one movement) and count once, so three
     interactions take at least 2 s;
   - the count starts over after a move (whatever it came to), when the
     Blobbi's place changes, and with a new session (another account, Blobbi
     or World). Nothing is counted while the place is still unknown
     (`resolution: 'pending'`), while the Blobbi is here or already on its
     way, or with no signer;
   - a **refusal suspends** following for the session: further interactions
     ask the signer nothing until an explicit request succeeds;
   - the threshold and window are options (`followAfter`, `followWindowMs`),
     not a player setting.

   An **explicit request** (a "Call home" / "Call here" button) skips the
   count and moves at once. Either way, the move is `travel()`:
   1. re-read every relay; if none answers, stop (`unreachable`, nothing signed);
   2. if the location already names this World, stop (`already-here`);
   3. if it moved less than 5 s ago and the request is not explicit, stop
      (`contended`): a casual press never undoes a move just made elsewhere;
   4. otherwise sign one World Location (the signer may prompt), and check the
      signer answered for the owner;
   5. if signing was slow (more than 2 s), re-read the relays. If a newer
      location appeared meanwhile, nothing is sent (`stale`). The player sees
      where the Blobbi is and may ask again;
   6. store the signed event, publish it to every relay, and count acceptances;
   7. if at least one relay accepted (`moved`), wait the departure window
      (§5), then arrive, and re-read 2 s later to follow any simultaneous
      winner;
   8. if no relay accepted (`unreachable`), send the same signed event once
      more after 5 s, automatically and with no new signature. A reload within
      30 s sends it again. After 30 s, or once a newer location exists, it is
      dropped and never sent.
3. **A refusal or a failure** silences casual requests for 60 s, so there are
   no repeated prompts. An explicit request is always allowed.
4. **The previous World** needs to do nothing. The new event is its notice: it
   departs when its stream (or its next look) brings the event. It may be
   closed or offline.
5. **Protected moments** belong to the World. A departure waits while the
   World is busy (care, bath, medicine, ceremonies, Pixel's timed actions). An
   arrival never waits. Eggs and sleepers do not travel (each World decides
   who travels).

## 5. Travel animation timing

The Nostr event decides the World; the animation only shows the change. The
location never waits for, or depends on, an animation.

- The destination asks for a **departure window** in `arrival_after`: **2 s**
  (3 s before M16.1) when the previous World shows fresh Active Presence
  (someone may be watching the Blobbi leave there), 0 s otherwise. 2 s covers
  the origin's stream latency (well under a second) and its departure until
  the body has dissolved. The origin is never asked to acknowledge anything.
- **One consistent sequence** (M16.1, a UX target, not protocol). The
  session schedules the arrival from the player's act (`travel.arriving` =
  `{ at, formAt }`):
  - `formAt`, when the Blobbi has formed here, is the latest of: the end of
    the departure window, `minTravelMs` after the act (default
    `MIN_TRAVEL_MS` = 1.5 s, so a move from a World nobody plays still reads
    as a journey, not a pop), and the World's own `arrivalLeadMs` from now;
  - `at`, when the World starts its arrival (`here` turns true), is
    `formAt − arrivalLeadMs`: the World's "incoming" effect overlaps the wait
    instead of adding to it;
  - from the act until `at`, `travelView` says `coming`, and a World shows a
    short "calling" cue at the Blobbi's spot;
  - a move proceeds on the **first** relay acceptance; a slow relay does not
    hold the arrival back.

  In normal conditions the Blobbi forms 1.5 s (origin idle) to about 2.5 s
  (origin active) after the act.
- The origin's departure and the destination's arrival may overlap by a
  moment (dissolving there, forming here). The Blobbi is never `present` in
  both: the destination is `arriving` until its animation ends.
- **Loading** (M16.1): until the first look answers (`resolution:
  'pending'`, only on a device that kept no signed location), `syncTravel`
  asks nothing of the Blobbi, and a World shows a small "looking for it" cue
  (`travelView` = `looking`), never the Blobbi standing here. The first look
  ends within the relay timeout: then `confirmed`, or `unreachable` (the kept
  location, or the default World, stands, and a World may say the relays
  could not be reached).
- The destination measures the wait on its own clock, from its own
  `created_at`. It wrote both, so there is no clock skew. The wait is never
  more than 6 s.
- The previous World departs on receipt. The hint never authorises anything
  and never delays a correct state.
- **Historical or live** (`transitionKind`): a change met on a page's first
  look is historical (shown as it is, no journey). Later changes brought by
  the stream or a refresh are live (a journey), unless they are more than
  10 minutes older than the reader's clock. Arrival order decides, not
  `created_at`, so a writer's skewed clock never turns a fresh move into
  history.
- A hidden page waits until it is seen. A page that has just become visible
  waits 1.5 s before anything leaves.

## 6. Signing

- `WorldTravelSigner.mode` is `'silent'` (a key the app holds: an nsec login,
  Pixel's key vault) or `'prompt'` (a NIP-07 extension or a NIP-46 remote
  signer: it may ask the player). The protocol never assumes per-kind
  permissions exist, and a kind-scoped extension permission is not delegation.
- **World Location**: only `travel()` signs, and only on the player's act.
- **Active Presence** is off by default and is the player's choice
  (`setPresenceEnabled`). It is signed only while enabled, the Blobbi is here,
  and the World is played now (visible, a real input within 2 minutes), at
  most once a minute.
  - With a prompting signer, the first presence of a session waits for a real
    input, never a timer.
  - A signature that took longer than 1.5 s probably asked the player: presence
    pauses for the session (`paused-prompting`).
  - A refusal stops it for the session (`declined`).
  - Turning it on again is a new try. Nothing is ever retried behind the
    player's back.
- Nothing signs on load, on a subscription, on focus, on a re-render or on
  unmount. No key is stored anywhere new, and no delegation is introduced.

## 7. Kinds: inventory and collision research (2026-10-17)

**Blobbi ecosystem kinds** (repos under `~/Developer`):

| Kind | Use | Defined in |
|---|---|---|
| 31124 | pet state | kit |
| 11125 | owner profile | kit |
| 31125 | legacy owner profile | kit |
| 1124 | interaction | kit |
| 14919 | legacy interaction | kit |
| 31632 / 31633 / 31634 / 1416 / 1417 | items, inventory, placement, spend, fold | `@nostr-games/inventory` |
| 31415 / 31416 / 31417 | world, map, slot | Nostr Farm |
| 31950 | Island presence | Island |
| 21201 | Island communication | Island |
| 31951 / 21951 | shared playback session / command | Island |

- 31634 (item placement) is **not** reused: its spec rules out live state.
- 31950 is Island's own (a position inside an Island room, addressable with
  expiration). Reusing it would change its meaning for Island's readers.

**Candidates.** For the addressable range, 31126, next to 31124/31125. For the
ephemeral range, 21124, the 1124/31124 family. Fallbacks: 31127/31128 and
21125/21126.

**Evidence that they are unused:**

- No NIP or README entry (nostr-protocol/nips `master`, fetched 2026-10-17).
- No entry on nostrbook.dev.
- No public code found (GitHub code search, before its rate limit).
- No stored 31126/31127/31128 events on relay.ditto.pub, relay.primal.net,
  relay.damus.io, relay.dreamith.to or offchain.pub.
- No live 21124/21125/21126 events during a 25 s subscription.
- A control query for 31124 returned events, so the probe worked.

nos.lol and relay.nostr.band could not be reached. The probes were read-only
(REQ/CLOSE only). This is evidence, not a registry: zero events does not prove
a kind is unused.

## 7a. Timestamps (reviewed for M16.1)

- **Ordering** is NIP-01 for addressable events (`replacesLocation`): the
  higher `created_at`, then the lower id. It is a total order, so every reader
  picks the same winner from the same events, whatever the relay.
- **`created_at` is the writer's claim, not trusted time.** A move is dated
  `max(now, latest.created_at + 1)`, so a writer whose clock is behind still
  replaces what it read.
- **Future-dated locations.** A location dated more than
  `MAX_LOCATION_SKEW_S` (900 s, the bound strfry applies by default) ahead of
  the reader's clock is ignored when resolving with a clock, which the
  session always does (`isFutureLocation`). It stays known and counts once
  the clock reaches it. So:
  - a device whose clock is years ahead can never pin the Blobbi, or force
    every later move to be dated after it;
  - timestamp inflation is bounded: `latest` is at most 900 s ahead, so a move
    is at most 901 s ahead;
  - the remaining limit, and its recovery, are in §7b.
- **The stay** ("just moved", `MIN_STAY_MS`) is measured from the earlier of
  `created_at` and when this session first saw the location (`observedAt`).
  A location dated a few minutes ahead therefore cannot stretch the no-reclaim
  rule beyond 5 s.
- **Malformed timestamps** (negative, fractional, beyond safe integers) make
  the event invalid. `arrival_after` is clamped to `[created_at, created_at +
  6 s]`.
- **Replay.** A replayed old location is older than the newest, so it never
  wins. Replaying the newest changes nothing (same id). A replay cannot move a
  Blobbi.
- **Active Presence**: fresh only while `expiration` is after the reader's
  clock and `created_at` is at most 60 s ahead (`MAX_CLOCK_SKEW_S`). A life
  longer than 300 s is malformed. Expired presence is dropped. Presence is
  never a location.
- **Stable?** No further change to the event formats is needed for the kinds
  to be considered stable: everything above is reader- and writer-side logic,
  and old events stay valid. The only wire-visible change in M16.1 is the
  shorter default window (`arrival_after` = `created_at + 2`), which readers
  only honour.

## 7b. A relay pinned by a future-dated location (reviewed for M16.2)

**The problem.**
- NIP-01: "for each combination of `kind`, `pubkey` and the `d` tag value,
  only the latest event MUST be stored by relays".
- A relay that once accepted a location dated far ahead (a device whose clock
  was years ahead) therefore keeps that event. It drops every later real move
  for the address, because those are older by `created_at`, until real time
  passes that date. The relay is **pinned**.
- Readers ignore the event (§7a), so they never show the wrong place. But such
  a relay cannot carry a new move to another device.

**How likely it is.** Many relays refuse such events on arrival. strfry's
default `rejectEventsNewerThanSeconds = 900`, and NIP-01 itself shows the
rejection "invalid: event creation date is too far off from the current
time". So it takes an owner's device with a badly wrong clock *and* a relay
without that check. Only the owner's key can write the address, so a third
party cannot cause it.

**What clients cannot do.**
- **Outrank it without inflating timestamps.** A move dated after the bad
  event would itself be far-future: readers would ignore it, and careful
  relays would reject it.
- **Delete it by address.** NIP-09: for an `a` deletion, relays "delete all
  versions … up to the `created_at` timestamp" *of the request*. A request
  dated now can never reach an event dated in 2100, and it would delete the
  real current location instead.
- **Be sure of anything.** NIP-09 deletion is a SHOULD. "It is impossible to
  delete events from all relays", and relays "should not be treated as
  authoritative".

**What M16.2 does (deterministic parts, automatic):**
1. Readers ignore any location beyond the skew (§7a), so the place shown is
   always the newest *believable* one, the same on every reader whose clock is
   right.
2. Every relay answer is checked. A relay whose newest stored location is
   future-dated is reported in `snapshot.diagnostics.pinnedRelays`, and the
   event id in `diagnostics.futureLocations`.
3. Other devices still learn moves through every non-pinned relay. The device
   that made a move also keeps its signed copy (§8).

**The explicit recovery** (`session.repairFutureLocations()`, never
automatic):
- **When:** only on a person's deliberate request (a diagnostic button, or an
  operator acting for the owner). No World calls it by itself. It signs one
  event.
- **Steps:**
  1. Look again; with no future-dated location known, sign nothing
     (`nothing`).
  2. Sign one NIP-09 deletion request **by id**: `["e", <id>]` for each
     future location, plus `["k", "31126"]`. It has no `a` tag.
  3. Send it to every travel relay.
  4. Resend the current location as it was signed (no second signature), so
     a relay that dropped the bad event takes the real one.
  5. Look again, and report `stillPinned`: the relays that ignored the request.
- **If relays still pin** after this, the manual procedure is:
  1. fix the device clock that produced the event;
  2. ask that relay's operator to delete the event id, or drop the relay from
     the travel set;
  3. otherwise wait for real time to pass its date;
  4. meanwhile the other relays carry the truth.

**Compatibility.** No event format or kind changed. Kind 5 is plain NIP-09,
used only by this explicit recovery.

## 8. Concurrency and its limits

- **Account-scoped.** Sessions are per owner + Blobbi + World. Every
  asynchronous step re-checks the account (before signing, after signing,
  before sending). A signer answering for another key is refused.
- **Per Blobbi.** There is one move at a time in a page (`busy`). With
  `lock`, such as Web Locks, there is one at a time across tabs, and the
  second tab finds `already-here`.
- **No ping-pong.** Casual input within 5 s of a move does not reclaim. No
  automatic path signs a location, and an old device never republishes to
  take the Blobbi back.
- **Not atomic.** Two devices that read the same location and both publish
  produce two events. NIP-01 orders them identically everywhere, both
  sessions re-read and follow the same winner, and the loser shows the Blobbi
  away. The checks before and after signing make this rare. They cannot make
  it impossible: no Nostr mechanism provides a global compare-and-swap.
- **Relays differ.** No single relay is authoritative. The newest valid event
  from any relay, the stream or the store wins. A relay that lags behind can
  never undo a newer event this device has seen, because the store keeps the
  signed event.
- **Slow relays** (M16.2). A relay slower than the timeout is still listened
  to, for up to 3 timeouts. Its late answer is learned when it comes, and
  shown as history if no relay had answered before it. After a look that no
  relay answered, the next one comes 5 s later, then 10, 20, 40 and 60 s,
  rather than at the next minute's refresh. `pending` still ends within one
  timeout, and `unreachable` turns into `confirmed` by itself once a relay
  answers.
- **Reconnection.** A dropped stream is subscribed again with backoff, and the
  session looks again. Periodic looks run every 60 s while visible (5 minutes
  while hidden), and on `online` and on visibility.

## 9. Privacy

A World Location is a public, durable fact ("this Blobbi was last in Blobbi
Pixel"), written only by the player's act. Active Presence is a recent
activity signal: it is opt-in, short-lived and never stored by relays, and it
names a World, never a position or a room.

## 10. Future autonomy (design compatibility only; nothing implemented)

Some Blobbis may one day have their own Nostr identity, act while their
owner is offline, travel by themselves, meet other Blobbis and stay
observable in persistent multiplayer Worlds. M16 does not implement this, and
it adds no agents, servers or kinds for it. What M16 deliberately leaves
open:

- **Nothing assumes a click.** `travel()` is "a move by an authorised actor";
  `explicit` only says the actor asked deliberately. Interaction counting
  (`interact`) is one host policy for when a casual move starts, not a
  protocol rule. The event carries no "clicked" claim.
- **The location is a fact about the Blobbi, not about a session.** It
  persists offline and never expires, which is exactly what an autonomous
  Blobbi in a persistent World needs.
- **Presence is decoupled.** A future Blobbi-run session could publish its
  own activity without touching ownership.

What autonomy would need, safely, before any implementation:

1. **An identity for the Blobbi.** For example, a key the Blobbi uses,
   announced by the owner in a signed, revocable authorisation event. It
   would name the Blobbi's 31124 address, the allowed kinds (31126 only, for
   that `d`), an expiry, and optionally the allowed Worlds.
2. **Readers that accept two authors.** Addressable replacement is per
   pubkey, so an owner's 31126 and an agent's 31126 are two addresses.
   Resolution would merge both by `created_at` and id, accepting the agent's
   only while its authorisation is valid at the event's time. The owner must
   always be able to override and revoke.
3. **No key custody in the apps.** The agent's key lives with the agent: a
   remote signer (NIP-46) or a server the owner runs. It is never in a Blobbi
   app's storage, and there is no unrestricted delegated signing (NIP-26 is
   deprecated and too broad).
4. **Rate and loop limits** on agent moves (a minimum stay, a daily budget),
   enforced by readers, so a runaway agent cannot thrash a Blobbi's location.
5. **A new `v` or a new tag** for agent-authored moves. Today's readers would
   ignore them (they check the author), so this would be an additive change.

Until then, the security model is unchanged: only the owner's own key writes
a World Location, readers check the author, the `d` and the `a`, and every
signature is verified.

## 11. Future Worlds (documentation only; those repositories are untouched)

Planned next integrations, in order. None is implemented, and none of these
repositories was modified for M16/M16.1.

1. **Blobbi Island.** It needs a separate, comprehensive audit first: Island
   is well behind the current ecosystem. The audit must cover:
   - legacy Nostr kinds (31950 presence, 21201 communication, 31951/21951
     playback; see §7), which must not be reused or reinterpreted;
   - compatibility with the current blobbi-kit, and its Blobbi lifecycle;
   - companion identity (`current_companion`) and inventory interoperability
     (`@nostr-games/inventory`);
   - hardcoded functionality and logic duplicated from the kit;
   - visual rendering and state persistence;
   - World Travel: a World id (for example `blobbi-island`), its own
     protected moments, and how its room presence (31950) relates to Active
     Presence (they stay separate kinds with separate meanings).
2. **Nostr Farm** (31415/31416/31417 world/map/slot). A World id (for example
   `nostr-farm`), `registerWorld` for its name, and its own input policy for
   `interact`.
3. **Blobbi Rumble.** Its 3D Blobbi (`@blobbi-kit/3d`, Babylon.js) is a
   different model from the Standalone's miniature room Blobbi (three.js).
   Travel effects would need a Babylon adapter of the teleport (see the
   Standalone's `src/features/teleport/KIT_EXTRACTION.md`), not the room's.
   Fights and rounds are protected moments.

Each new World needs: a valid World id; its own trusted-input detection fed
to `interact`; its explicit "call here"; `settle` / `enter` / `leave` on its
own Blobbi; an `arrivalLeadMs` for its arrival; and the shared travel relays
(`BLOBBI_WORLD_TRAVEL_RELAYS`).

## 12. Shared travel effects: what is in the kit, what is not (M16.1 review)

Standalone draws its teleport with a 2D canvas and three.js; Pixel draws its
own on a pixel canvas. They share no renderer.

**In the kit**, the parts with no renderer in them:
- the phases: `ShownState` (present, departing, absent, arriving);
- `TravelViewKind` (looking, here, away, coming);
- the reconciliation rules (`reconcileTravel`, `syncTravel`);
- the timing (`arrival_after`, the departure window, `MIN_TRAVEL_MS`,
  `arrivalLeadMs`, `travel.arriving.formAt`).

**Not in the kit**:
- the teleport timelines, particles, masks and shaders: each app keeps its
  own;
- particle parameters: Standalone and Pixel tune theirs for very different
  pixel densities, so a shared table would be a coincidence, not a reuse.

There is no new renderer package. `@blobbi-kit/core` stays free of the DOM,
Canvas, WebGL and three.js.

**Future extraction**: the Standalone's teleport (timeline, motes, presence
controller) is already engine-free, and its own plan proposes a
`@blobbi-kit/teleport` package with per-engine adapters
(`src/features/teleport/KIT_EXTRACTION.md`). That is worth doing when a third
World (Rumble, on Babylon.js) needs the same journey. It is out of M16.1's
scope.

## 13. Security considerations (0.11.0)

- **Trust comes from signatures, never from a relay.**
  - `resolveWorldLocation` and `freshPresence` require a `verify` function.
  - `parseWorldLocation` and `parseActivePresence` check the signature only
    when given one, so do not use them on untrusted input without it.
  - A verifier that throws counts as "invalid".
- **Ownership.**
  - A location counts only for its author and its `d`.
  - A canonical `d` must carry the author's own pubkey prefix, and the `a` tag
    must be exactly the author's 31124 address. Nobody else can move, or
    claim, another account's Blobbi.
  - The session refuses a signed location for another key, Blobbi or World
    (`wrong-account`). It refuses a signed presence for another key or World,
    and a deletion request for another key or with an invalid signature.
- **Signing is always the player's act** (§6):
  - a location is signed only by `travel()`;
  - presence is signed only when the player enabled it;
  - a deletion request is signed only by `repairFutureLocations()`;
  - nothing signs on load, on a subscription, on focus, on a re-render or on
    a timer;
  - no key is stored, and no delegation is introduced.
- **Timestamps** (§7a):
  - a location more than `MAX_LOCATION_SKEW_S` (900 s) ahead of the reader's
    clock is ignored;
  - a presence more than `MAX_CLOCK_SKEW_S` (60 s) ahead is not fresh;
  - `arrival_after` is a visual hint, clamped to `MAX_TRANSITION_S`.
- **Abuse limits.** One move at a time per Blobbi (`busy`, and `lock` across
  tabs). A casual input never undoes a move younger than `MIN_STAY_MS`.
  After a refusal, following is suspended for the session.
- **Privacy** (§9). A location is public and durable, and it names a World,
  never a position. Presence is opt-in.

## 14. Known limitations (0.11.0)

- **Experimental kinds.** They are not standardized, and a later version may
  change the schema (readers ignore any other `v`).
- **No global compare-and-swap.** Two devices moving the same Blobbi at the
  same moment both publish. Every reader converges on the same NIP-01 winner
  (§8).
- **Relays can disagree, lag or be unreachable.** The newest valid event from
  any source wins. `snapshot.resolution` tells a World how much it knows
  (`pending`, `cached`, `confirmed`, `unreachable`).
- **A pinned relay** keeps a far-future location and drops real moves. The
  reader is protected automatically. The relay itself is repaired only by the
  owner's explicit `repairFutureLocations()`. NIP-09 deletion is a request
  that relays may ignore (`stillPinned`) (§7b).
- **Presence is best effort.** Relays do not store it and may drop it. Its
  absence means "activity unknown".
- **`useWorldTravel` returns `snapshot: null` on its first render.** The
  session is created in an effect, so the host shows "looking" for that
  render.
- **`interact()` returns `'ignored'` while `pending`.** A host that wants the
  press counted must queue it itself.
- **Not validated:**
  - no physical-device run;
  - no real NIP-07 extension or NIP-46 bunker (the browser checks use a NIP-07
    shim);
  - no public relay used for writing.
