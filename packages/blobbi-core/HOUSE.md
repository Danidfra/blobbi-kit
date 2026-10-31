# The Blobbi house (P2.1): kind 31127

**Status: EXPERIMENTAL, not yet released.** Kind 31127 is the experimental
identifier of the Blobbi house protocol (`HOUSE_KIND_STATUS = 'experimental'`).
It was chosen after a collision search (§2). It is **not** a NIP and has
**not** been standardized or registered by the Nostr community. The schema is
versioned (`"v": 1`) and may change in a later minor version.

One persistent house that Blobbi Home, Ditto and any other Nostr game can read
and draw. The house is **logical**: rooms are tile grids, pieces have stable
ids, namespaced types, a surface and a position in tiles. How it looks (2D,
3D, pixel art, which models or sprites) is each client's business.

The code is `src/house.ts` (schema, validation, parsing, serialization,
events), `src/house-ops.ts` (edits), `src/house-catalog.ts` (the shared
furniture catalog), `src/house-template.ts` (the Blobbi starting house) and
`src/house-ditto.ts` (Ditto's 11125 rooms). All of it is pure: no relay, no
signer, no clock.

In this document **MUST**, **SHOULD** and **MAY** are protocol requirements
that every client follows. Sections marked *application* describe what the
Blobbi apps do; other games may do otherwise.

## 1. What is in the protocol, and what is not

| Protocol (every client) | Application (each client decides) |
|---|---|
| The event: kind, tags, content schema, version | Which rooms a new house starts with (`house-template.ts` is Blobbi's) |
| Rooms of any number and size, their walls, finishes, links | How rooms are unlocked, bought or earned |
| Pieces: id, type, surface, position, turn, scale | Which types it can draw, and how they look |
| Coordinates in tiles, room-local | Camera, zoom, projection, art style |
| Validation, security limits, preservation of the unknown | Pieces per room (Blobbi: 20), overlap rules |
| The shared catalog's sizes and footprint rule (for official types) | Labels, translations, sounds, interactions |

## 2. Kind 31127

- **Addressable** (30000–39999): the latest event per `(kind, pubkey, d)`
  stands. On equal `created_at`, the lower event id wins (`replacesHouse`).
- `KIND_BLOBBI_HOUSE = 31127`, next to 31124 (pet state), 31125 (legacy
  profile) and 31126 (World Location).

**Collision search, 2026-10-24:**

| Check | 31127 |
|---|---|
| nostr-protocol/nips `master` (`d47a2ec`, 2026-10-22) README | not listed |
| NIPs pull requests and issues | none |
| GitHub code search (`kind: 31127`, `kinds: [31127`, `= 31127`) | no Nostr code |
| Stored events: relay.damus.io, nos.lol, relay.primal.net, relay.ditto.pub, nostr.wine | none (control kind 31124 found on all) |

The alternative, 31129, **is in use**: about 8 stored events from two unrelated
apps (a napplet handler list, and a 2025 testing-group app), and it was named
as an alternative in a closed NIP pull request (#2128). 31128 was also empty on
every relay and is the fallback. The probes were read-only (REQ/CLOSE). This is
evidence, not a registry: zero events does not prove a kind is unused.

## 3. The event

```json
{
  "kind": 31127,
  "pubkey": "<owner>",
  "created_at": 1792900000,
  "tags": [
    ["d", "main"],
    ["v", "1"],
    ["b", "blobbi:ecosystem:v1"],
    ["alt", "Blobbi house: Home"]
  ],
  "content": "<the house document, JSON>",
  "id": "…",
  "sig": "…"
}
```

- `d` (**required**, exactly one): the house id (§5). The address is
  `31127:<pubkey>:<d>` (`houseAddress`).
- `v`: the schema version, `"1"`. The content's `v` is authoritative; a
  disagreeing tag is reported and ignored.
- `b`: `blobbi:ecosystem:v1`, as on every Blobbi event.
- `alt` (NIP-31): a short human-readable summary.
- Other tags MAY be added. Writers MUST keep tags they do not manage when they
  republish (`buildHouseTemplate` does, from `previous.tags`), with one
  exception: a NIP-40 `expiration` tag MUST NOT be carried over. A house is
  persistent, and an expiration copied from an old version would have relays
  delete the new one. `buildHouseTemplate` drops it.
- **The content is authoritative; the tags are only an index.**
- **The owner is the event author.** Nothing in the content can name or change
  the owner; an `owner` field there is ignored (and reported).

## 4. The house document (content)

### 4.1 Schema

```text
House {
  v: 1                          required
  name: string                  required, 1–120 characters
  app?: token                   the application that created it (metadata only)
  category?: token              "house", "apartment", … (free)
  rooms: Room[]                 required, in display order
  ext?: { <namespace>: any }
  …any other field              kept
}

Room {
  id: id                        required, unique in the house, stable
  type?: token                  "kitchen", "bedroom", … (Blobbi: Ditto's room id)
  name?: string                 ≤ 120 characters
  size: { w, d, h }             required, whole tiles: w, d 1–64; h 1–32
  walls: Wall[]                 required, distinct; any of west, north, east, south
  wall?: Material               the finish of every wall
  floor?: Material
  items: Item[]                 required
  links?: { room: id, … }[]     ways to other rooms (advisory)
  ext?: { <namespace>: any }
  …any other field              kept
}

Item {
  id: id                        required, unique in the HOUSE, stable for the piece's life
  type: type                    required, namespaced: official:bed-single, sno:<naddr>, mygame:throne
  surface: "floor" | "wall"     required
  wall?: Wall                   wall pieces: which wall (one the room has)
  x?, z?: number                floor: the centre, in tiles; wall: the position along it (§6)
  y?: number                    wall pieces only: the height of the centre
  rot?: 0 | 1 | 2 | 3           floor pieces only: quarter turns
  scale?: number                0.5–2; absent is 1
  variant?: token               a visual variant its renderers understand
  content?: { imageUrl?: https URL, … }   per-piece data
  ext?: { <namespace>: any }
  …any other field              kept
}

Material {                      Ditto's room_layouts surface, unchanged
  style: word                   Ditto: wall solid|stripes|dots|gradient; floor solid|wood|tile|carpet
  palette: hex[]                1–4 of #rgb, #rrggbb, #rrggbbaa
  variant?: word                Ditto: soft|medium|bold|wide|narrow
  angle?: 0–359                 whole degrees
}

id    = /^[a-z0-9][a-z0-9._-]*$/, ≤ 64
type  = /^[a-z][a-z0-9]*:[a-z][a-z0-9-]*$/, ≤ 256   (Ditto's furniture id format)
token = /^[a-z0-9][a-z0-9._:-]*$/, ≤ 64
word  = /^[a-z][a-z0-9-]*$/, ≤ 32
```

### 4.2 A complete example event

The JSON block below is checked by the test suite: it must parse as a valid
house.

<!-- house-example:start -->
```json
{
  "kind": 31127,
  "pubkey": "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853b0e2f53bda5e9",
  "created_at": 1792900000,
  "tags": [
    ["d", "main"],
    ["v", "1"],
    ["b", "blobbi:ecosystem:v1"],
    ["alt", "Blobbi house: Home"]
  ],
  "content": "{\"v\":1,\"name\":\"Home\",\"app\":\"blobbi-home\",\"category\":\"house\",\"rooms\":[{\"id\":\"home\",\"type\":\"home\",\"size\":{\"w\":8,\"d\":8,\"h\":5},\"walls\":[\"west\",\"north\"],\"wall\":{\"style\":\"gradient\",\"palette\":[\"#fef9ef\",\"#fef3c7\"]},\"floor\":{\"style\":\"wood\",\"palette\":[\"#b45309\",\"#78350f\"],\"variant\":\"wide\"},\"items\":[{\"id\":\"home-1\",\"type\":\"official:rug-round\",\"surface\":\"floor\",\"x\":4.5,\"z\":4.5},{\"id\":\"home-2\",\"type\":\"official:table-side\",\"surface\":\"floor\",\"x\":0.5,\"z\":4.5,\"rot\":3},{\"id\":\"home-3\",\"type\":\"official:lamp-table\",\"surface\":\"floor\",\"x\":0.5,\"z\":4.5,\"rot\":3},{\"id\":\"home-4\",\"type\":\"official:shelf-wall\",\"surface\":\"wall\",\"wall\":\"west\",\"y\":3,\"z\":5.5,\"scale\":1.4},{\"id\":\"k3v9q2m7xa\",\"type\":\"official:picture-frame\",\"surface\":\"wall\",\"wall\":\"north\",\"x\":5.5,\"y\":3,\"content\":{\"imageUrl\":\"https://blossom.example/abc.jpg\"}},{\"id\":\"p8d2w4n1zc\",\"type\":\"mygame:throne\",\"surface\":\"floor\",\"x\":6,\"z\":6,\"variant\":\"gold\"}],\"links\":[{\"room\":\"rest\"}]},{\"id\":\"rest\",\"type\":\"rest\",\"size\":{\"w\":8,\"d\":8,\"h\":5},\"walls\":[\"west\",\"north\"],\"items\":[{\"id\":\"rest-1\",\"type\":\"official:bed-single\",\"surface\":\"floor\",\"x\":1.5,\"z\":3}],\"links\":[{\"room\":\"home\"}],\"ext\":{\"some-game\":{\"unlockedAt\":\"chapter-2\"}}}]}",
  "id": "<event id>",
  "sig": "<signature>"
}
```
<!-- house-example:end -->

The content, readable:

```json
{
  "v": 1,
  "name": "Home",
  "app": "blobbi-home",
  "category": "house",
  "rooms": [
    {
      "id": "home",
      "type": "home",
      "size": { "w": 8, "d": 8, "h": 5 },
      "walls": ["west", "north"],
      "wall": { "style": "gradient", "palette": ["#fef9ef", "#fef3c7"] },
      "floor": { "style": "wood", "palette": ["#b45309", "#78350f"], "variant": "wide" },
      "items": [
        { "id": "home-1", "type": "official:rug-round", "surface": "floor", "x": 4.5, "z": 4.5 },
        { "id": "home-2", "type": "official:table-side", "surface": "floor", "x": 0.5, "z": 4.5, "rot": 3 },
        { "id": "home-3", "type": "official:lamp-table", "surface": "floor", "x": 0.5, "z": 4.5, "rot": 3 },
        { "id": "home-4", "type": "official:shelf-wall", "surface": "wall", "wall": "west", "y": 3, "z": 5.5, "scale": 1.4 },
        { "id": "k3v9q2m7xa", "type": "official:picture-frame", "surface": "wall", "wall": "north", "x": 5.5, "y": 3,
          "content": { "imageUrl": "https://blossom.example/abc.jpg" } },
        { "id": "p8d2w4n1zc", "type": "mygame:throne", "surface": "floor", "x": 6, "z": 6, "variant": "gold" }
      ],
      "links": [{ "room": "rest" }]
    },
    {
      "id": "rest",
      "type": "rest",
      "size": { "w": 8, "d": 8, "h": 5 },
      "walls": ["west", "north"],
      "items": [{ "id": "rest-1", "type": "official:bed-single", "surface": "floor", "x": 1.5, "z": 3 }],
      "links": [{ "room": "home" }],
      "ext": { "some-game": { "unlockedAt": "chapter-2" } }
    }
  ]
}
```

Here the table lamp stands on the side table (a `small` piece over a
`surface` piece, worked out, not stored). The throne is another game's piece:
Blobbi clients skip drawing it and keep it. The `rest` room carries another
game's unlock note, which Blobbi clients keep without reading. The rest room
has no finishes, so each client uses its own.

## 5. Identity

- **House**: the `d` tag. A player MAY own any number of houses, each its own
  address. House ids are stable for the house's life.
- **The first house**: a client creating a player's first house SHOULD use
  `d = "main"` (`MAIN_HOUSE_ID`), so two devices creating it at the same time
  create one house, not two. Later houses use random ids. `main` means
  "created first", **never** "preferred" (§9).
- **Room**: `id`, unique in the house, never reused for another room. Order in
  `rooms` is the display order.
- **Piece**: `id`, unique in the **house** (not just the room), stable for the
  piece's whole life: moving it, turning it, moving it to another room keep
  the id. Several pieces of the same type are distinct pieces. New ids SHOULD
  be random (`createItemId`: 10 base-36 characters); deterministic ids are
  used where the input is deterministic (the starting house, Ditto imports,
  §10).
- **App** (`app`) is metadata: which application created the house. It is
  never a restriction. Any client may read and edit any house of the player.
  There is no list of authorized games.

## 6. Coordinates

Every room has its own frame, in **tiles** (a tile is 30 cm for official
models):

```text
        north wall (z = 0)
   (0,0) ───────────── x → (w,0)
     │                    │
west │       floor        │ east
wall │                    │ wall
(x=0)│                    │(x=w)
     ↓ z                  │
   (0,d) ─────────────── (w,d)
        south wall (z = d)          y is up, 0 … h
```

- **Floor pieces**: `x` ∈ [0, w], `z` ∈ [0, d], the centre of the footprint.
  No `y`: how high a piece stands (on the floor, or on a table) is worked out,
  never stored. `rot` is quarter turns clockwise seen from above. At `rot: 0`
  the piece's front faces +z (south), so the default Blobbi view from the open
  south-east corner sees it.
- **Wall pieces**: `wall` names the wall. The position along it is `z` on the
  west and east walls and `x` on the north and south walls, in [0, length];
  `y` ∈ [0, h] is the height of the piece's centre. The other horizontal
  coordinate is fixed by the wall and is never stored. Wall pieces face into
  the room and have no `rot`.
- **Where a piece is drawn**: the stored centre is the requested one. A
  renderer snaps it to the grid and keeps it inside the room (`itemRect`):
  floor footprints sit on whole tiles (odd widths on tile centres, even widths
  on tile edges), wall pieces in half tiles. This is Ditto's and Blobbi Home's
  rule, so every client draws a piece in the same place. Stored values are
  never rewritten to the snapped ones. A piece larger than its floor or wall
  is drawn at the floor's or wall's size, never past its edges.
- **Never stored**: screen pixels, camera, zoom, viewport, projection,
  renderer geometry, engine state.

**One house, three renderers:**

| | Floor (x, z) | Wall |
|---|---|---|
| 3D | world (x, height, z), turn `-rot × 90°` about y | west: (0, y, z); north: (x, y, 0) |
| 2D isometric, from the open corner (w, d) | screen `((x − z)·u, (x + z)·u/2)` | west: `(−z·u, z·u/2 − y·u)`; north: `(x·u, x·u/2 − y·u)` |
| Pixel, top-down | grid cell (⌊x⌋, ⌊z⌋), north at the top | drawn on the top (north) or left (west) edge |

## 7. The shared furniture catalog

`OFFICIAL_HOUSE_FURNITURE` holds Ditto's 44 official types, ids unchanged,
with:

- `mount`: `floor`, `rug` (lies under other pieces) or `wall`. Floor and rug
  pieces have `surface: "floor"` in a house.
- `small` (stands on a `surface` piece) and `surface` (small pieces may stand
  on it);
- `rooms` (the room types the Blobbi catalog offers it in: advisory);
- `interaction` (`bed`, `fridge`, `bath`, `toys`) and `picture` (a frame whose
  `content.imageUrl` is the picture);
- `sizeCm`: the model's bounding box at scale 1 (width x, height y, depth z).

The sizes were **measured once** from the official models, which Ditto and
Blobbi Home share line for line (`official-models.ts`; Ditto origin/main and
Blobbi Home `feat/blobbi-v3`, 2026-10-24). If a model changes, its size must be
measured again.

**Footprints** (`footprint`, `itemFootprint`):

- Size in tiles = `sizeCm × ((1 / 30) × scale)`.
- A floor side covers `max(1, ⌈side − 0.2⌉)` tiles, capped at the room's side.
  An odd `rot` swaps width and depth.
- Wall pieces cover their real width and height.
- Network objects (`sno:`) are fitted to 2 tiles in Ditto. Without the model,
  a client assumes a 2 × 2 footprint (`assumed: true`).
- These are Ditto's and Blobbi Home's rules, so a footprint computed here is
  the footprint those rooms draw. Rounding the sizes to 0.01 cm changes no
  footprint at any scale step of 0.01 from 0.5 to 2 (checked for all 44
  types).

**Constraints**: a known type MUST be on its mount's surface
(`placementProblem`). Overlaps are a client rule, not a protocol rule
(`rectsOverlap` helps). A piece of an unknown type is never refused.

**Differences found between the sources (2026-10-24), and how they were settled:**

| Type | Ditto | Blobbi Home 3D | Blobbi Home 2D (dormant) | In the catalog |
|---|---|---|---|---|
| all 44 `official:*` | – | identical to Ditto (mount, small, surface, rooms, interaction) | – | as Ditto |
| `official:shelf-books` | floor | floor | wall (`back` layer) | **floor** (approved) |
| rugs (4) | `rug` | `rug` | floor layer, no rug concept | `rug` (compatible: a rug is a floor piece drawn underneath) |
| `home:bed-pet`, `home:tub` | absent | absent | care-moment props | **not in the catalog** (approved: props, not decoration) |
| 19 types (fridge, bathtub, frames, clocks, …) | present | present | no 2D art | in the catalog; 2D art is application work |
| `sno:<naddr>` | supported | dropped | absent | a type namespace; 2 × 2 assumed |
| Default rooms, finishes, furniture | – | identical to Ditto | – | the starting house |
| Room order | kitchen, home, care, rest (closet hidden) | care, kitchen, home, rest, closet | – | Ditto's, without the closet (approved) |

## 8. Compatibility levels

A client can be compatible with a house at four distinct levels. Parsing is
only the first.

1. **Protocol**: it reads kind 31127 v1 and validates it. Every client MUST
   reach this level before writing.
2. **Structural**: it can represent the rooms. Their sizes, the walls they
   have, links. A client that can only draw 8 × 8 rooms with two walls (Ditto
   today) is structurally partial for other houses.
3. **Furniture support**: it can draw the piece types. `houseSupport(doc,
   supports)` lists the pieces a client must skip.
4. **Visual fidelity**: how close its drawing is to another client's (art,
   proportions, lighting). The protocol says nothing about it, and a house
   never claims it.

**Preservation rules (MUST):**

- Unknown fields, at every level (house, room, size, material, item, content,
  `ext`), are kept through parsing, editing and serialization.
- Pieces of unsupported types are skipped when drawing, **never deleted**.
  Editing other pieces keeps them.
- A client MUST NOT write back a house it read as `invalid` or
  `unsupported-version`. It may show the valid parts (`doc`), read-only.
- `ext` is the place for application data: `{ "<namespace>": … }`, one key
  per application or game, so applications never collide. Readers keep
  namespaces they do not know.

## 9. Preferred houses

A player may own several houses and choose which one each app opens. The
choice is a **mutable preference that points at a stable house address**. It
is never a property of a house. A house carries no "primary" flag: several
houses could claim it at once, and choosing a house would mean rewriting
houses. Switching the preferred house changes one small preference event and
no house.

**Design (approved 2026-10-24; implemented with synchronization in a later phase, not in P2.1):**

- **Global preferred house**: a NIP-78 application-data event (kind 30078,
  addressable) of the player, `d = "blobbi:preferences"`, shared by every
  Blobbi app:

  ```json
  {
    "kind": 30078,
    "tags": [["d", "blobbi:preferences"], ["alt", "Blobbi preferences"]],
    "content": "{\"v\":1,\"house\":\"31127:<pubkey>:<house id>\"}"
  }
  ```

  - `v` is the preferences schema version; `house` is a 31127 address.
  - Other global Blobbi preferences may join it later as new keys.
  - Writers keep keys they do not know.
- **Per-application preference**: optional, overrides the global choice in
  that app only. It is kept locally for one device, or across devices in a
  NIP-78 event of the app's own (`d = "<app>:preferences"`, same content shape).
- **Not in kind 11125.** The Blobbonaut profile is a legacy shared profile and
  compatibility layer, not a growing store (§15). Several of its writers can
  replace it whole after a bad read, so a pointer there could be reset
  silently. No existing writer touches the `blobbi:*` NIP-78 keys.
- **Readers MUST** check that `house` is a 31127 address whose pubkey is the
  preference event's author, and treat anything else as no preference.
- **Resolution**, in an app:
  1. its own preference;
  2. else the global one;
  3. else `main`, if it exists;
  4. else the newest house;
  5. else the app offers to create `main`.

  A preference naming a house that no longer exists, or one this client
  cannot read, falls through to the next step. Losing a preference is harmless:
  resolution still finds a house.
- **Concurrency**: a preference event is replaced whole. Writers read the
  newest version first and date theirs after it, as for houses (§14).

## 10. Rooms that come later

Houses grow. `addRoom` appends a room (or inserts it at a position) without
touching any existing room, piece or finish. `removeRoom` removes only an
**empty** room (moving or removing its pieces is the caller's decision,
never a side effect), along with links to it. `reorderRooms` takes a full
permutation.

- A house lists only the rooms that exist. A room that is "locked" in some
  game is simply not in the house yet.
- How a room is earned is each game's business. A game MAY note it in the
  room's `ext` (`{ "some-game": { "unlockedAt": "chapter-2" } }`); other
  clients keep it and do not read it.
- **A house event is signed by its owner, so it proves nothing about how a
  room was earned.** A game that needs a trusted unlock MUST verify an
  external authorization or attestation (an event signed by the game's own
  key, say), never a flag in the house.

## 11. Versioning and forward compatibility

- `v` is the schema version. This module reads and writes 1.
- A higher integer `v` is `unsupported-version`. Clients MUST NOT write over
  it, and MAY say "made by a newer version". Anything else is `malformed`.
- New optional fields MAY appear in v1 at any level. Old clients keep them.
- A change that old clients would misread (a new meaning for an existing
  field, a required field) needs `v: 2`.
- Reserved for later, not validated in v1: `item` on a piece (a
  `31632:<issuer>:<d>` inventory item address, §13), `residents` / `a` tags
  naming the Blobbis (31124) living in a house.

## 12. Security

- **Untrusted input**: content is parsed defensively, never trusted
  (`parseHouseEvent`, `validateHouse`, which never throw). Signatures are
  checked when a verifier is given (core depends on no Nostr library).
- **Ownership**: the event author is the owner. A client MUST NOT draw or edit
  a house as someone's other than its author's.
- **Limits** — three kinds, kept apart:

  | Kind | Values | Effect |
  |---|---|---|
  | Security (`HOUSE_LIMITS`) | content ≤ 256 KiB; ≤ 64 rooms; ≤ 256 pieces in a room; ≤ 1024 in a house; ≤ 16 links in a room; sides ≤ 64, height ≤ 32; ids ≤ 64; types ≤ 256; names ≤ 120 | past any: refused (`malformed`) |
  | Recommended (`HOUSE_RECOMMENDED_CONTENT_BYTES`) | ≤ 16 KiB of content | above: valid, with a warning; strict relays (the NIP-11 example limit is 16 KiB) may refuse it |
  | Application | Blobbi: ≤ 20 pieces in a room (`BLOBBI_MAX_ITEMS_PER_ROOM`, Ditto's cap) | enforced by the app, never by validation |

  A piece is about 85 bytes. The Blobbi starting house (4 rooms, 35 pieces)
  is about 4 KB, so 16 KiB fits about 150–190 pieces. The security limits
  leave room for houses ten times larger.
- **Pictures**: `content.imageUrl` MUST be https; clients load it as an
  untrusted image.
- **Network objects** (`sno:`): their models come from other authors and are
  untrusted. Clients SHOULD bound what they fetch.
- **Stale and replayed versions**: addressable semantics keep only the newest.
  A writer dates a new version after the one it replaces
  (`buildHouseTemplate`: `created_at = max(now, previous + 1)`).
- **Visitors** only read. Whatever a visitor does (care, play) is its own
  events, never a change to the house.
- **Decoration is not ownership**: in v1 any piece may be placed. An inventory
  link (§13) will be verified separately and never implied by placement.

## 13. Inventory, later

A piece MAY later carry `item: "31632:<issuer>:<d>"`, the inventory item it
stands for. A client would then show it as owned only after checking the
inventory (`@nostr-games/inventory`: the owner's 31633 balance, spends and
folds, items from trusted issuers). Placing never consumes inventory.
Pieces without `item` stay plain decoration. Kind 31634 (item placement) is
not used for houses: its entries must name 31632 items, it has one reference
frame per document, and it has no walls.

## 14. Concurrency

An addressable event is replaced **whole**: two devices that edit the same
house and publish without seeing each other's version lose one edit, even
when they changed different rooms. P2.1 does not resolve this. Its operations
are deterministic, and `buildHouseTemplate` dates a version after the one it
replaces.

**What P2.2 (synchronization) needs:**

- A complete read of the newest version from the required relays before every
  write.
- A three-way merge per room and per piece id. The base is what the editor
  opened, merged against the newest and the draft. Stable piece ids make it
  exact: added on either side is kept, removed on either side is removed, and
  the newer edit wins for a piece both changed.
- A read-back after publishing.
- Healing relays that missed the newest version (republish the same signed
  event).
- Never writing over an `invalid` or `unsupported-version` house.
- Offline edits kept with their base and merged when back online.
- The Ditto mirror (below).

## 15. Ditto and migration

**Kind 11125, decided 2026-10-24.**

- The Blobbonaut profile is a **legacy shared profile and compatibility
  layer**. It keeps `current_companion`, xp, level and the daily missions for
  backward compatibility.
- No new domain state goes into it: houses are 31127, preferences are NIP-78
  (§9).
- Writers keep every tag and content key they do not manage.
- The slot is shared with Ditto-based deployments that write 11125 under other
  `b` namespaces (`pets:ecosystem:v1`, `globie:ecosystem:v1`). Their data is
  never read as Blobbi data and never deleted.

Ditto keeps rooms in the content of the player's kind 11125: `room_furniture_v2`
(`v: 2`, current), the legacy `room_furniture` (`v: 1`) and `room_layouts`
(`v: 1`). `houseFromDittoProfile` reads them exactly as Ditto does. That
means:

- the same version rules (a newer `room_furniture_v2` is refused);
- the same clamps;
- the same conversion of version 1 rooms, including the room piece Ditto adds.

The result is the house Ditto shows: rooms never saved come from the starting
house. `dittoRoomsFromHouse` gives the two keys back.

**Results.** The import never throws and never returns part of a house:

| `status` | `doc` | Meaning |
|---|---|---|
| `converted` | the house | `notes` lists recoverable findings (`lossy: true` for anything that did not survive); `failures` is empty |
| `too-new` | null | `room_furniture_v2` above version 2; nothing is converted (`failures`: `too-new`) |
| `failed` | null | no valid house can be made; `failures` says why |

Failures, all fatal (each has a `code`, a `message`, often a `room`, and the
schema `issues` where there are any):

- `room-incompatible`: Ditto pieces would land in a room of the given
  starting house that is not Ditto's frame (8 × 8 floor, 5-tile walls, west
  and north walls; `dittoFrameProblem`). Ditto's coordinates mean nothing
  there, so the pieces are neither squeezed in nor dropped. Every such room is
  reported. A room for which Ditto saved no pieces (an empty list, or only
  finishes) may have any shape.
- `starter-invalid`: the given starting house is not a valid house.
- `invalid-result`: a last guard, for example an imported id that another
  room of the given starting house already uses.

The default starting house is Ditto's frame throughout, so these failures
come only from a host's own `starter`.

**Mapping**:

| Ditto | House |
|---|---|
| `at: floor`, `(x, y)` | floor, `x = x`, `z = y` |
| `at: left`, `(x, y)` | wall `west`, `z = x`, `y = y` |
| `at: right`, `(x, y)` | wall `north`, `x = x`, `y = y` |
| `rot`, `scale`, `content.imageUrl` | unchanged |

Ditto → house → Ditto gives back what Ditto stored (tested), as does
house → Ditto → house for the starting house.

**What cannot survive (reported as `lossy` notes, never silently):**

- Ditto keeps **no piece ids**. Imported pieces get `<room>-<n>` in stored
  order (`dittoItemId`). A room id too long to leave space for the number is
  shortened to its first 40 characters plus an 8-hex digest of the whole id,
  so ids stay unique and within 64 characters. These ids are deterministic but
  positional: they name "the n-th stored piece of this room", not one piece
  across Ditto edits. Exporting drops ids, so a later import may number pieces
  differently.
- Ditto data past the house's security limits (more than 64 rooms, more than
  1024 pieces) is left out and noted, never turned into an invalid house.
- Into Ditto:
  - rooms other than Ditto's five ids, or not 8 × 8 × 5 with west and north
    walls;
  - pieces on east or south walls;
  - pieces past 20 in a room;
  - `variant`, `ext` and unknown fields;
  - house and room names, `app`, `category`, links;
  - finishes in styles Ditto does not draw.
- From Ditto:
  - placements Ditto itself skips (invalid ids, wrong surfaces, no position);
  - clamped positions and scales (each note gives the stored and the shown
    position);
  - version 1 positions (approximate) and mirroring;
  - Ditto fields whose names mean something else in a house;
  - a legacy `room_furniture` of a version Ditto does not read, when there is
    no readable `room_furniture_v2` (`legacy-unreadable`).
- Not noted: a finish `angle` is read as Ditto reads it, rounded to whole
  degrees in 0–359 (45.6 → 46, 405 → 45). Ditto draws the rounded angle, so
  nothing Ditto shows is lost.
- Fields a newer Ditto wrote on a piece are **kept** on the house piece. A
  room key Ditto does not know becomes a house room.

**Migration rules** (for P2.2; nothing is migrated in P2.1):

- Import only from a profile whose `b` is `blobbi:ecosystem:v1`.
- Some writers can replace the whole profile after a failed read (Ditto's kit
  0.4.0 daily-XP award; Island's companion and background writers; the
  Phase 0 profile-write hardening audit of 2026-10-24). So the newest
  profile may have lost its rooms while a lagging relay still holds a
  decorated version. Before migrating, read several relays and offer to
  recover from the newest profile that still has room keys.
- That hardening (Phase 0) should land before P2.2
  starts mirroring rooms into 11125.
- A conversion with lossy notes MUST NOT replace a canonical house, or the
  11125 rooms, without the player's say.
- The first house is built from the 11125 rooms when Ditto has any, else from
  the device's Blobbi Home rooms. If both exist and differ, the player
  chooses.
- A room is imported whole (replace, never append), so pieces are never
  doubled.
- Blobbi Home's local rooms belong to one Blobbi (`blobbi:room3d:<pubkey>:<d>`)
  while a house belongs to the player. The current companion's rooms are the
  ones offered; the others stay on the device.
- While Ditto reads only 11125, writers mirror each saved room into
  `room_furniture_v2` / `room_layouts` with Ditto's per-room merge, keeping
  every other key and tag.
- Never bump Ditto's versions: Ditto shows defaults and refuses to save
  `room_furniture_v2` above 2, and overwrites `room_layouts` that is not 1.

## 16. Known limitations

- The kind is experimental and evidence-based, not registered (§2).
- Footprints of official types depend on the current models. Network objects
  are assumed 2 × 2 without their models.
- Rooms are rectangles with up to four straight walls. There are no
  multi-level houses, outdoor terrain, door positions or non-rectangular
  rooms. These would be new optional fields, or v2.
- Pieces stand on the floor, on a wall, or (worked out) on a `surface` piece.
  There is no free 3D placement and no free rotation.
- No synchronization, merging or preference storage yet (§9, §14).
- Ditto can show only part of a house that uses more than Ditto's rooms
  (§15).
