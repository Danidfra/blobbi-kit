# World travel (M16): World Location and Active Presence

**Status: implemented in `@blobbi-kit/core` / `@blobbi-kit/react`, kinds
PROVISIONAL.** The two kinds below were chosen after a collision search
(§7), and they stay provisional until the owner approves them. The apps keep
live publication behind a switch that is off by default.

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
`src/world-travel-sync.ts` (the on-screen Blobbi), and in `@blobbi-kit/react`
`useWorldTravel`, `useWorldTravelSync` and `poolWorldTravelRelays`.

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
2. **On the player's first meaningful act** in a World that does not hold the
   Blobbi (a trusted press or key in a visible, focused page, or a "call home"
   button):
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

- The destination asks for a **departure window** in `arrival_after`: 3 s
  when the previous World shows fresh Active Presence (someone may be watching
  the Blobbi leave there), 0 s otherwise. The arrival itself is always the
  World's own short animation.
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
- **Reconnection.** A dropped stream is subscribed again with backoff, and the
  session looks again. Periodic looks run every 60 s while visible (5 minutes
  while hidden), and on `online` and on visibility.

## 9. Privacy

A World Location is a public, durable fact ("this Blobbi was last in Blobbi
Pixel"), written only by the player's act. Active Presence is a recent
activity signal: it is opt-in, short-lived and never stored by relays, and it
names a World, never a position or a room.
