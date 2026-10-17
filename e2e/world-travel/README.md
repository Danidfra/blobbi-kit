# Cross-device world travel checks (M16)

These checks drive real browsers through world travel with the real apps. The
travel layer is `@blobbi-kit/core` 0.11.0-m16.4, installed from local
tarballs. The two apps each run on their own dev server. A local relay stands
in for the public ones.

- **Two independent browser contexts.** Each context has its own cookies,
  localStorage and IndexedDB, so each one is a separate device:
  - a "laptop" running Blobbi Standalone, signed in with an nsec (a silent
    signer);
  - a "phone" running Blobbi Pixel, with a NIP-07 shim that counts every
    signature it is asked for.
- **Extra devices.** Later checks open a third and fourth context: a tablet, a
  desk with Active Presence on, and a laptop with an extension signer.
- **A local NIP-01 relay** (`relay.mjs`). It binds only to 127.0.0.1, and each
  path is its own relay (`/ditto`, `/primal`, `/band`, `/dreamith`). It checks
  every signature and follows NIP-01 storage rules (replaceable, addressable,
  ephemeral, NIP-40). Over HTTP it can:
  - seed events;
  - show its log;
  - drop a relay;
  - refuse writes;
  - answer every REQ late (`/delay`, a slow relay).
- **An in-page socket guard** (`ws-guard.mjs`), installed before any app code
  runs. It sends the apps' relay hosts to the local relay, lets Vite's own
  socket through, and refuses every other socket. The run fails if any other
  socket was even attempted, so nothing can reach a public relay.

## Run it

```sh
# 0. Once: the kit built, and the tarballs the apps install
cd ~/Developer/blobbi-kit-world-travel && npm ci && npm run build
(cd packages/blobbi-core && npm pack --pack-destination ~/Developer/blobbi-kit-m16-packs)
(cd packages/blobbi-react && npm pack --pack-destination ~/Developer/blobbi-kit-m16-packs)
# The apps then install from file:../blobbi-kit-m16-packs/… (npm install in each worktree)

# 1. The harness's own dependencies (Playwright 1.64.1 uses Chromium revision 1248)
cd e2e/world-travel && npm install    # npx playwright install chromium, if the browser is missing

# 2. Three terminals
node relay.mjs 7777
(cd ~/Developer/nostr-pet-world-presence && npx vite --port 8080 --strictPort --host 127.0.0.1)
(cd ~/Developer/blobbi-pixel-world-presence && npx vite --port 5177 --strictPort --host 127.0.0.1)

# 3. The checks (HEADED=1 to watch them)
node cross-device.mjs                  # exit 0 only if every check passed; details in last-run.json
```

Nostr world travel is off by default in both apps. The harness switches it on
the way a developer would, which only works on a dev server:

- `localStorage['blobbi:world-travel:v1'] = 'nostr'`;
- in Pixel, `#world-travel=nostr` also works.

A build switches it on with `VITE_BLOBBI_WORLD_TRAVEL=nostr`.

## What it checks (68 checks)

1. **Loading:** loading either World signs nothing and publishes nothing.
2. **Home to Pixel:** NEW ADVENTURE WITH BAMBU starts a birth intro that
   shows Bambu, so its press is an explicit call. It moves Bambu at once, with
   one signature and one 31126 event, which both travel relays accept. The
   intro never shows Bambu while it is known away. The laptop sees the move
   live and plays the departure (`present → depart → absent`).
3. **Already here:** more presses in Pixel publish nothing.
4. **Pixel to Home:** "Call Bambu home" on the laptop plays the arrival
   (`absent → arrive → present`). The phone departs live and signs nothing.
5. **Three interactions in Pixel (CONTINUE, in play):** Bambu comes over on
   the third press, with one World Location. **Reloads:** a reloaded page
   shows Bambu as it is, with no journey replayed.
6. **A relay drops:** with relay.ditto.pub down, the move reaches the other
   device through relay.primal.net, and the relays now disagree. A third
   device still resolves the newest location.
7. **Simultaneous moves:** both devices move Bambu at the same instant. Both
   end on the same event, exactly one holds Bambu, and nothing is republished.
8. **Failed publication:** with every relay refusing, the move fails as
   `unreachable`. Once the relays are back, the very same signed event is
   resent, with no new signature.
9. **Active Presence:**
   - It is off by default.
   - When turned on, it publishes 21124 while the Blobbi is played, and the
     other World sees it.
   - A move from a recently active World forms the Blobbi at the end of the
     2 s departure window. Pixel's 1.9 s fall overlaps that wait.
   - Presence stops once the Blobbi is elsewhere (none for 70 s), and it never
     moves the location.
10. **Extension signer:** the Standalone with a NIP-07 extension signs nothing
    on load. Three interactions ask the extension once. After the refusal,
    following is suspended and six more presses ask nothing. "Try again" asks
    once more and moves Bambu.
11. **Loading (M16.1):** relays answer 2.5 s late.
    - A fresh laptop shows the "looking" cue. Bambu is never shown present
      and never departs. It ends away within the delay, and nothing is
      signed.
    - A fresh phone with the same 2.5 s relays never enters or shows Bambu
      while its place is unknown, and walks the account's own Bambu, never a
      new local Blobbi (M16.2: an empty relay no longer cuts the slow ones
      off).
    - A screen reader hears where Bambu is, through one polite live region
      that has no `aria-hidden` ancestor (M16.2).
12. **Three interactions on the Standalone (M16.1):**
    - Synthetic events and held-key repeats never count.
    - The third interaction shows the calling cue and publishes one World
      Location.
    - The Blobbi forms 1.5 s after the act.
    - There is exactly one arrival, and dropping both relays replays
      nothing.
13. **Relays slower than the timeout (M16.2):** relays answer 6 s late.
    - The page shows unreachable first, then confirmed by the late answer.
    - The real place is shown as history, with no journey.
    - Nothing is signed.

**Safety checks:**

- No socket to anything but the local relay.
- The phone signed only World Locations.
- The account published no other kinds.
- No page errors.
