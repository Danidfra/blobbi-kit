/**
 * M16 CROSS-DEVICE WORLD TRAVEL, in real browsers. Two independent browser contexts (separate cookies, localStorage,
 * IndexedDB: two "devices") run Blobbi Standalone (dev server, nsec login: a silent signer) and Blobbi Pixel (dev
 * server, a NIP-07 shim whose every signature is counted), both with Nostr world travel switched on, against the
 * LOCAL relay (relay.mjs). Every socket to anything else is refused in the page (ws-guard.mjs), and the run fails if
 * one was even attempted.
 *
 * Prerequisites (README.md): `node relay.mjs 7777`, the Standalone on :8080 and Pixel on :5177 (`npx vite --port …`).
 * Run: `node cross-device.mjs` (HEADED=1 to watch). Exit code 0 only when every check passed.
 */
import { account, closeAll, control, device, HOME_URL, PIXEL_URL, relayLog, reset, seed, sleep, until, wsLog } from './lib.mjs';

const results = [];
let failed = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? '  ok ' : '  FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
async function step(name, fn) {
  console.log(`\n# ${name}`);
  try {
    await fn();
  } catch (e) {
    check(`${name}: completed`, false, String(e?.message ?? e).slice(0, 300));
  }
}

// ─── Reading each app ───

const homeStatus = (h) => h.page.locator('[data-testid="world-travel-status"]').evaluate((e) => ({ ...e.dataset }));
const homeActor = (h) => h.page.locator('[data-testid="blobbi-actor"]').getAttribute('data-presence');
const pixel = (p) =>
  p.page.evaluate(() => {
    const t = window.__blobbiWorldTravel;
    const s = t?.snapshot();
    return s ? { status: s.status, resolution: s.resolution, follow: s.follow, place: s.place, here: s.here, phase: s.travel.phase, reason: s.travel.reason ?? null, at: s.travel.at ?? null, formAt: s.travel.formAt ?? null, change: s.change, location: s.location?.id ?? null, presence: s.presence.status, there: s.presence.there?.world ?? null, shown: t.shown(), looking: t.looking?.() ?? null, coming: t.coming?.() ?? null } : null;
  });
/** Distinct presses, 1.2 s apart (the kit counts inputs less than 1 s apart once), until `done()` or `max` presses. */
async function presses(press, done, max = 5) {
  for (let i = 1; i <= max; i++) {
    await press(i);
    await sleep(1_200);
    if (await done()) return i;
  }
  return max + 1;
}
/** In-page record of Pixel's travel view, shown state and arrival schedule (every 20 ms, changes only). */
async function installPixelRecorder(p) {
  await p.context.addInitScript(() => {
    window.__rec = [];
    window.__arrivals = [];
    setInterval(() => {
      const t = window.__blobbiWorldTravel;
      const s = t?.snapshot?.();
      if (!s) return;
      const r = { place: s.place, view: s.resolution === 'pending' ? 'looking' : s.here ? 'here' : s.place === 'blobbi-pixel' ? 'coming' : 'away', shown: t.shown?.() ?? null };
      const last = window.__rec.at(-1);
      if (!last || last.place !== r.place || last.view !== r.view || last.shown !== r.shown) window.__rec.push(r);
      if (s.travel.phase === 'arriving' && !window.__arrivals.some((a) => a.formAt === s.travel.formAt)) window.__arrivals.push({ seenAt: Date.now(), at: s.travel.at, formAt: s.travel.formAt });
    }, 20);
  });
}
const KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft'];
/** Keep playing in Pixel until Bambu has come over; returns how many presses it took. */
async function followPixel(p, max = 5) {
  await p.page.bringToFront();
  return presses((i) => p.page.keyboard.press(KEYS[i % KEYS.length]), async () => (await pixel(p)).place === 'blobbi-pixel', max);
}
/** Keep playing in the Standalone (presses on the room floor, away from any control) until Bambu has come home. */
async function followHome(h, max = 5) {
  await h.page.bringToFront();
  return presses((i) => h.page.mouse.click(40 + i * 7, 40), async () => (await homeStatus(h)).travelPlace === 'blobbi-home', max);
}
const locationsLogged = async () => (await relayLog()).filter((e) => e.kind === 31126);
const distinct = (xs) => [...new Set(xs.map((x) => x.id))];

/** Every value the classic actor's `data-presence` takes, recorded in the page (a journey is a few hundred ms). */
const TRAIL = () => {
  window.__trail = [];
  const seen = () => {
    const a = document.querySelector('[data-testid="blobbi-actor"]');
    const v = a?.getAttribute('data-presence') ?? 'none';
    if (window.__trail.at(-1) !== v) window.__trail.push(v);
  };
  new MutationObserver(seen).observe(document, { subtree: true, attributes: true, childList: true, attributeFilter: ['data-presence'] });
  setInterval(seen, 50);
};
const trail = (h) => h.page.evaluate(() => window.__trail ?? []);
const clearTrail = (h) => h.page.evaluate(() => (window.__trail = []));

/** Open Pixel and go through its title into play (each step a real key press); returns the signatures before play. */
async function enterPixelPlay(p, { reload = false } = {}) {
  if (reload) await p.page.reload();
  else await p.page.goto(`${PIXEL_URL}#world-travel=nostr`);
  await until(async () => (await pixel(p))?.status ?? (await pixel(p))?.place, 'Pixel session');
  await sleep(1_500);
  p.signsBeforePlay = p.signs.length;
  await p.page.bringToFront();
  for (let i = 0; i < 40; i++) {
    if ((await pixel(p))?.shown) return;
    await p.page.keyboard.press('Enter');
    await sleep(1_500);
  }
  throw new Error('Pixel never reached play');
}

// ─── The run ───

const acct = account('Bambu');
await reset();
await seed([acct.blobbi, acct.profile]);
const laptop = await device({ acct, app: 'home', label: 'laptop (Standalone, nsec)' });
await laptop.context.addInitScript(TRAIL);
const phone = await device({ acct, app: 'pixel', label: 'phone (Pixel, NIP-07)' });

await step('1. Loading signs nothing, writes nothing, and shows the Blobbi where it is (home)', async () => {
  await laptop.page.goto(HOME_URL);
  await until(async () => (await homeStatus(laptop)).travelStatus === 'ready', 'Standalone ready');
  const h = await homeStatus(laptop);
  check('Standalone: place blobbi-home, here', h.travelPlace === 'blobbi-home' && h.travelHere === 'true', JSON.stringify(h));
  await phone.page.goto(`${PIXEL_URL}#world-travel=nostr`);
  await until(async () => (await pixel(phone))?.status === 'ready', 'Pixel ready');
  await sleep(3_000);
  const p = await pixel(phone);
  check('Pixel (title, loaded): place blobbi-home, not here', p.place === 'blobbi-home' && !p.here, JSON.stringify(p));
  check('loading Pixel signed nothing', phone.signs.length === 0, `signs=${phone.signs.length}`);
  check('no World Location published by loading', (await locationsLogged()).length === 0);
});

await step('2. Home to Pixel across devices: NEW ADVENTURE WITH BAMBU (its birth intro) calls Bambu at once; the laptop sees it leave', async () => {
  await clearTrail(laptop);
  await installPixelRecorder(phone);
  await enterPixelPlay(phone, { reload: true });
  check('nothing signed before the press that started play', phone.signsBeforePlay === 0, `signs=${phone.signsBeforePlay}`);
  await until(async () => (await pixel(phone)).here, 'Pixel here', 15_000);
  await until(async () => ['present', 'arriving'].includes((await pixel(phone)).shown), 'Pixel Blobbi shown', 20_000).catch(() => null);
  const p = await pixel(phone);
  check('Pixel: place blobbi-pixel, here, arrival shown', p.place === 'blobbi-pixel' && (p.shown === 'present' || p.shown === 'arriving'), JSON.stringify(p));
  const rec = await phone.page.evaluate(() => window.__rec ?? []);
  const shownWhileAway = rec.filter((r) => r.place !== 'blobbi-pixel' && r.view === 'away' && (r.shown === 'present' || r.shown === 'arriving'));
  check('the birth intro never shows Bambu while it is known away (no appear-and-vanish)', shownWhileAway.length === 0 && !rec.some((r, i) => i > 0 && rec[i - 1].shown === 'present' && r.shown === 'absent'), rec.map((r) => `${r.view}/${r.shown}`).join(' , ').slice(0, 400));
  check('Pixel asked its signer exactly once, for kind 31126', phone.signs.length === 1 && phone.signs[0].kind === 31126, JSON.stringify(phone.signs.map((s) => s.kind)));
  const logged = await locationsLogged();
  check('one World Location event, accepted by both travel relays', distinct(logged).length === 1 && new Set(logged.filter((e) => e.ok).map((e) => e.relay)).size === 2, JSON.stringify(logged.map((e) => [e.relay, e.ok])));
  await until(async () => (await homeStatus(laptop)).travelPlace === 'blobbi-pixel', 'laptop sees the move', 15_000);
  const h = await homeStatus(laptop);
  check('Standalone learns it live (stream), not here', h.travelHere === 'false' && h.travelChange.startsWith('live'), JSON.stringify(h));
  await until(async () => (await homeActor(laptop)) === 'absent', 'laptop actor absent', 10_000);
  const t = await trail(laptop);
  check('Standalone plays the departure (present → depart → absent)', t.includes('depart') && t.at(-1) === 'absent', t.join(' → '));
  check('away card shows Blobbi Pixel', (await laptop.page.locator('[data-testid="world-presence-away"]').getAttribute('data-place')) === 'blobbi-pixel');
});

await step('3. Already here: more presses in Pixel publish nothing', async () => {
  const before = distinct(await locationsLogged()).length;
  for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowDown']) await phone.page.keyboard.press(k);
  await sleep(1_500);
  check('no new World Location', distinct(await locationsLogged()).length === before);
  check('no new signature', phone.signs.length === 1, `signs=${phone.signs.length}`);
});

await step('4. Pixel to Home: "Call Bambu home" on the laptop; the phone sees it leave', async () => {
  await sleep(5_200); // past the 5 s min-stay (an explicit call would not need it; checked in 7)
  await clearTrail(laptop);
  await laptop.page.bringToFront();
  await laptop.page.locator('[data-testid="world-presence-call-home"]').click();
  await until(async () => (await homeStatus(laptop)).travelHere === 'true', 'laptop here', 15_000);
  await until(async () => (await homeActor(laptop)) === 'present', 'laptop actor present', 10_000);
  const t = await trail(laptop);
  check('Standalone plays the arrival (absent → arrive → present)', t.includes('arrive') && t.at(-1) === 'present', t.join(' → '));
  await until(async () => (await pixel(phone)).place === 'blobbi-home', 'phone sees the move', 15_000);
  await until(async () => (await pixel(phone)).shown === 'absent', 'phone Blobbi gone', 15_000);
  const p = await pixel(phone);
  check('Pixel: live change, Blobbi departed', p.change.kind === 'live' && !p.here, JSON.stringify(p));
  check('two World Locations in all, each replacing the last', distinct(await locationsLogged()).length === 2);
  check('the phone did not sign anything for the departure', phone.signs.length === 1, `signs=${phone.signs.length}`);
});

await step('5. Reload during nothing: a reloaded page shows the Blobbi as it is, no journey replayed', async () => {
  await sleep(5_200);
  const before5 = distinct(await locationsLogged()).length;
  const n = await followPixel(phone);
  check('Pixel (CONTINUE, in play): Bambu came over on the third interaction, with one World Location', n === 3 && distinct(await locationsLogged()).length === before5 + 1, `presses=${n}`);
  await until(async () => (await homeStatus(laptop)).travelPlace === 'blobbi-pixel', 'moved to Pixel', 15_000);
  await sleep(1_500);
  await laptop.page.reload();
  await until(async () => (await homeStatus(laptop)).travelStatus === 'ready', 'reloaded ready');
  await until(async () => (await homeActor(laptop)) === 'absent', 'absent after reload', 10_000);
  const t = await trail(laptop);
  const h = await homeStatus(laptop);
  check('after reload: historical, away, and never "depart"', h.travelChange.startsWith('historical') && !t.includes('depart'), `${h.travelChange} trail=${t.join(' → ')}`);
  const pBefore = phone.signs.length;
  await enterPixelPlay(phone, { reload: true });
  const p = await pixel(phone);
  check('Pixel reload: here (historical), nothing signed by reloading or by starting play (already here)', p.here && p.change.kind === 'historical' && phone.signs.length === pBefore, JSON.stringify(p));
});

await step('6. A relay drops: the move still reaches the other device through the other relay, and reconnects', async () => {
  await sleep(5_200);
  await control('/drop?relay=ditto&ms=15000');
  await laptop.page.bringToFront();
  await laptop.page.locator('[data-testid="world-presence-call-home"]').click();
  await until(async () => (await homeStatus(laptop)).travelHere === 'true', 'laptop here with ditto down', 15_000);
  await until(async () => (await pixel(phone)).place === 'blobbi-home', 'phone hears via primal', 15_000);
  check('the phone learned the move with relay.ditto.pub down', true);
  const ditto = await control('/events?relay=ditto');
  const latestHome = (await homeStatus(laptop)).travelLocation;
  check('ditto missed it (it was down): relays now disagree', !ditto.some((e) => e.id === latestHome), `ditto has ${ditto.filter((e) => e.kind === 31126).map((e) => e.id.slice(0, 8))}`);
  // A fresh device reading both relays still resolves the newest (primal's)
  const tablet = await device({ acct, app: 'home', label: 'tablet' });
  await tablet.page.goto(HOME_URL);
  await until(async () => (await homeStatus(tablet)).travelStatus === 'ready', 'tablet ready');
  const t = await homeStatus(tablet);
  check('a third device resolves the newest location despite the disagreeing relays', t.travelLocation === latestHome && t.travelPlace === 'blobbi-home', JSON.stringify(t));
  await tablet.context.close();
  await sleep(12_000); // ditto back; both devices reconnect
});

await step('7. Both devices move Bambu at the same moment: one NIP-01 winner, both agree, no ping-pong', async () => {
  await sleep(5_200);
  // The phone casually (its third interaction) and the laptop explicitly, within the same instant
  await phone.page.bringToFront();
  await phone.page.keyboard.press('ArrowLeft');
  await sleep(1_200);
  await phone.page.keyboard.press('ArrowUp');
  await sleep(1_200);
  const a = phone.page.keyboard.press('ArrowRight');
  const b = laptop.page.evaluate(() => document.querySelector('[data-testid="world-presence-call-home"]')?.click());
  await Promise.all([a, b]);
  await sleep(6_000);
  const h = await homeStatus(laptop);
  const p = await pixel(phone);
  check('both devices show the same location event', h.travelLocation === p.location, `${h.travelLocation?.slice(0, 8)} vs ${p.location?.slice(0, 8)}`);
  const n = distinct(await locationsLogged()).length;
  await sleep(10_000);
  check('nothing republished afterwards (no fight back)', distinct(await locationsLogged()).length === n);
  check('exactly one device holds it', (h.travelHere === 'true') !== p.here, `home here=${h.travelHere} pixel here=${p.here}`);
});

await step('8. Publication fails everywhere: the move fails, then the same signed event is resent once the relays are back', async () => {
  await sleep(5_200);
  // Make sure Bambu is in Pixel first
  if ((await homeStatus(laptop)).travelPlace !== 'blobbi-pixel') {
    await followPixel(phone);
    await until(async () => (await pixel(phone)).here, 'in Pixel', 15_000);
    await sleep(5_200);
  }
  await until(async () => (await homeStatus(laptop)).travelPlace === 'blobbi-pixel', 'laptop sees Pixel', 15_000);
  await control('/refuse?relay=ditto&on=1');
  await control('/refuse?relay=primal&on=1');
  await laptop.page.bringToFront();
  await laptop.page.locator('[data-testid="world-presence-call-home"]').click();
  await until(async () => (await homeStatus(laptop)).travelPhase === 'failed', 'failed', 15_000);
  const h = await homeStatus(laptop);
  check('failed with reason unreachable; still away', h.travelReason === 'unreachable' && h.travelHere === 'false', JSON.stringify(h));
  const refused = (await relayLog()).filter((e) => e.kind === 31126 && !e.ok).map((e) => e.id);
  await control('/refuse?relay=ditto&on=0');
  await control('/refuse?relay=primal&on=0');
  await until(async () => (await homeStatus(laptop)).travelHere === 'true', 'resent and arrived', 15_000);
  const accepted = (await relayLog()).filter((e) => e.kind === 31126 && e.ok).map((e) => e.id);
  check('the resent event is the very event refused before (no new signature)', refused.length > 0 && accepted.includes(refused[0]), refused[0]?.slice(0, 8));
  await until(async () => (await pixel(phone)).place === 'blobbi-home', 'phone follows', 15_000);
});

await step('9. Active Presence: off by default; when on, a fresh presence gives the departure a moment before arrival', async () => {
  check('no 21124 sent so far (presence off by default)', (await relayLog()).filter((e) => e.kind === 21124).length === 0);
  // The laptop turns presence on (its silent signer may renew it while played)
  const desk = await device({ acct, app: 'home', presence: true, label: 'desk (presence on)' });
  await desk.context.addInitScript(TRAIL);
  await desk.page.goto(HOME_URL);
  await until(async () => (await homeStatus(desk)).travelStatus === 'ready', 'desk ready');
  await desk.page.bringToFront();
  await desk.page.mouse.click(40, 40); // a real input: the World is played now
  await until(async () => (await relayLog()).some((e) => e.kind === 21124 && e.ok), 'a 21124 presence', 20_000);
  const pres = (await relayLog()).filter((e) => e.kind === 21124);
  check('the desk sent Active Presence for blobbi-home', pres.length >= 1);
  await until(async () => (await pixel(phone)).there === null || (await pixel(phone)).there === 'blobbi-home', 'phone sees presence');
  const seen = await pixel(phone);
  check('the phone sees Bambu being played at home right now', seen.there === 'blobbi-home', JSON.stringify(seen));
  check('the location did not change because of presence', seen.place === 'blobbi-home');
  // The phone moves Bambu: with fresh presence at home, it asks for a departure window and waits
  await sleep(5_200);
  await clearTrail(desk);
  await phone.page.bringToFront();
  await phone.page.keyboard.press('ArrowLeft');
  await sleep(1_200);
  await phone.page.keyboard.press('ArrowUp');
  await sleep(1_200);
  const t0 = Date.now();
  await phone.page.keyboard.press('ArrowRight');
  await until(async () => (await pixel(phone)).place === 'blobbi-pixel', 'moved', 15_000);
  const arriving = await pixel(phone);
  await until(async () => (await pixel(phone)).here, 'arrived', 15_000);
  const arr = (await phone.page.evaluate(() => window.__arrivals ?? [])).filter((a) => a.formAt >= t0).at(0);
  const formIn = arr ? arr.formAt - t0 : null;
  check('Pixel: the Blobbi forms at the end of the 2 s departure window (its fall overlaps the wait)', arr && formIn >= 1_800 && formIn < 4_500, `formAt-act=${formIn}ms lead=${arr ? arr.formAt - arr.at : null}ms place=${arriving.place}`);
  await until(async () => (await homeActor(desk)) === 'absent', 'desk departs', 10_000);
  const t = await trail(desk);
  check('the desk departs at once on the event', t.includes('depart'), t.join(' → '));
  // Still "played" (a real input under two minutes ago) and presence on: a renewal would be due within 60 s if the
  // desk still held Bambu. It does not, so none may come. (No presses here: three would call Bambu home.)
  const n = (await relayLog()).filter((e) => e.kind === 21124).length;
  await sleep(70_000);
  check('the desk stops presence once Bambu is elsewhere (none for 70 s)', (await relayLog()).filter((e) => e.kind === 21124).length === n);
  check('Bambu is still in Pixel (presence never moved it)', (await pixel(phone)).place === 'blobbi-pixel');
  await desk.context.close();
});

await step('10. The Standalone with a browser extension (a signer that may prompt): never on load; a refusal is not asked again by casual presses', async () => {
  await sleep(5_200);
  const ext = await device({ acct, app: 'home', extension: true, label: 'extension laptop' });
  await ext.page.goto(HOME_URL);
  await until(async () => (await homeStatus(ext)).travelStatus === 'ready', 'extension laptop ready');
  await sleep(3_000);
  check('loading with an extension signed nothing', ext.signs.length === 0, `signs=${ext.signs.length}`);
  check('Bambu is away (in Pixel) on the extension laptop', (await homeStatus(ext)).travelPlace === 'blobbi-pixel');
  ext.refuse = true;
  await ext.page.bringToFront();
  // Playing here while away: the third interaction asks the extension once
  await presses((i) => ext.page.mouse.click(500 + i * 13, 300), async () => (await homeStatus(ext)).travelPhase === 'failed', 4);
  await until(async () => (await homeStatus(ext)).travelPhase === 'failed', 'declined', 15_000);
  check('the refusal: failed / declined, still away, after one signature request', (await homeStatus(ext)).travelReason === 'declined' && ext.signs.length === 1, JSON.stringify(await homeStatus(ext)));
  check('following is suspended after the refusal', (await homeStatus(ext)).followSuspended === 'true', (await homeStatus(ext)).followSuspended);
  await presses((i) => ext.page.mouse.click(500 + i * 13, 320), async () => false, 6);
  check('six more presses ask nothing (following suspended)', ext.signs.length === 1, `signs=${ext.signs.length}`);
  ext.refuse = false;
  // After a refusal the card offers "Try again" (an explicit request) in place of "Call home"
  await ext.page.locator('[data-testid="world-travel-retry"]').click();
  await until(async () => (await homeStatus(ext)).travelHere === 'true', 'explicit call home', 15_000);
  check('the explicit "Try again" asks again and moves Bambu (one more signature, kind 31126)', ext.signs.length === 2 && ext.signs.every((t) => t.kind === 31126), `signs=${ext.signs.map((t) => t.kind)}`);
  await until(async () => (await pixel(phone)).place === 'blobbi-home', 'phone follows', 15_000);
  check('no page errors on the extension laptop', ext.errors.length === 0, ext.errors.join(' | ').slice(0, 200));
  await ext.context.close();
});

await step('11. M16.1 loading: a fresh device with slow relays never shows Bambu in the wrong World first (both apps)', async () => {
  await sleep(5_200);
  if ((await pixel(phone)).place !== 'blobbi-pixel') await followPixel(phone);
  await until(async () => (await pixel(phone)).here, 'Bambu in Pixel', 15_000);
  for (const r of ['ditto', 'primal']) await control(`/delay?relay=${r}&ms=2500`);
  // A fresh laptop: no kept location, relays answer 2.5 s late
  const visitor = await device({ acct, app: 'home', label: 'fresh laptop' });
  await visitor.context.addInitScript(TRAIL);
  await visitor.context.addInitScript(() => {
    window.__res = [];
    setInterval(() => {
      const st = document.querySelector('[data-testid="world-travel-status"]');
      const a = document.querySelector('[data-testid="blobbi-actor"]');
      const looking = !!document.querySelector('[data-testid="world-travel-looking"]');
      const v = `${st?.getAttribute('data-travel-resolution') ?? 'none'}|${a?.getAttribute('data-presence') ?? 'none'}|${looking}`;
      if (window.__res.at(-1) !== v) window.__res.push(v);
    }, 30);
  });
  const t0 = Date.now();
  await visitor.page.goto(HOME_URL);
  await until(async () => (await homeStatus(visitor)).travelResolution === 'confirmed', 'fresh laptop resolved', 15_000);
  const resolvedIn = Date.now() - t0;
  await until(async () => (await homeActor(visitor)) === 'absent', 'fresh laptop: absent', 5_000).catch(() => null);
  const res = await visitor.page.evaluate(() => window.__res);
  const t = await trail(visitor);
  const pendingStates = res.filter((x) => x.startsWith('pending'));
  check('fresh laptop: pending first, with the "looking" cue', pendingStates.some((x) => x.endsWith('|true')), res.join(' , '));
  check('fresh laptop: Bambu never shown present before (or after) the answer: no flash, no departure', !t.includes('present') && !t.includes('depart') && !pendingStates.some((x) => x.includes('|present|')), `trail=${t.join(' → ')}`);
  check('fresh laptop: resolved within the slow relays’ delay plus a little, then away in Pixel', resolvedIn < 8_000 && (await homeStatus(visitor)).travelPlace === 'blobbi-pixel', `${resolvedIn}ms`);
  check('fresh laptop signed and published nothing while loading', (await locationsLogged()).filter((e) => e.at >= t0).length === 0);
  await visitor.context.close();

  // A fresh phone, Bambu already in Pixel: the entry waits for the answer, then Bambu arrives (never present, then gone)
  const phone2 = await device({ acct, app: 'pixel', label: 'fresh phone' });
  await phone2.context.addInitScript(() => {
    window.__res = [];
    setInterval(() => {
      const t = window.__blobbiWorldTravel;
      const s = t?.snapshot?.();
      const v = `${s?.resolution ?? 'none'}|${t?.shown?.() ?? 'none'}`;
      if (window.__res.at(-1) !== v) window.__res.push(v);
    }, 30);
  });
  // Pixel resolves the account's own Blobbi from the relays first (its own 6 s budget): slow, but within it
  for (const r of ['ditto', 'primal']) await control(`/delay?relay=${r}&ms=1200`);
  await enterPixelPlay(phone2);
  await sleep(1_500);
  await phone2.page.keyboard.press('Escape'); // skip the birth intro (any key does)
  await until(async () => (await pixel(phone2))?.here && (await pixel(phone2)).shown === 'present', 'fresh phone: Bambu present', 40_000);
  const r2 = await phone2.page.evaluate(() => window.__res);
  check('fresh phone: the Blobbi is never entered or present while the place is unknown', !r2.some((x) => (x.startsWith('pending') || x.startsWith('none')) && (x.endsWith('|present') || x.endsWith('|arriving'))), r2.join(' , '));
  check('fresh phone: nothing signed (Bambu was already here)', phone2.signs.length === 0, `signs=${phone2.signs.length}`);
  check('no page errors on the fresh devices', phone2.errors.length === 0, phone2.errors.join(' | ').slice(0, 200));
  await phone2.context.close();
  for (const r of ['ditto', 'primal']) await control(`/delay?relay=${r}&ms=0`);
});

await step('12. M16.1 three interactions on the Standalone: repeats and synthetic events never count; the third moves Bambu, with one consistent sequence', async () => {
  await sleep(5_200);
  await laptop.page.bringToFront();
  await until(async () => (await homeStatus(laptop)).travelPlace === 'blobbi-pixel', 'laptop sees Bambu in Pixel', 15_000);
  const before = distinct(await locationsLogged()).length;
  await clearTrail(laptop);
  await laptop.page.mouse.click(60, 40);
  await sleep(1_200);
  check('first interaction: counted, nothing published', (await homeStatus(laptop)).followCount === '1' && distinct(await locationsLogged()).length === before, JSON.stringify(await homeStatus(laptop)));
  // Synthetic events (a script's) are never the player's
  await laptop.page.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    }
  });
  await sleep(1_200);
  check('synthetic presses and keys: not counted', (await homeStatus(laptop)).followCount === '1', (await homeStatus(laptop)).followCount);
  // A held key: one interaction, however long the auto-repeat
  for (let i = 0; i < 20; i++) await laptop.page.keyboard.down('Shift');
  await laptop.page.keyboard.up('Shift');
  await sleep(1_200);
  const second = await homeStatus(laptop);
  check('a held key counts once (repeats never)', second.followCount === '2' && distinct(await locationsLogged()).length === before, second.followCount);
  await laptop.page.evaluate(() => {
    window.__formAt = null;
    const read = () => {
      const v = document.querySelector('[data-testid="world-travel-status"]')?.getAttribute('data-travel-form-at');
      if (v && window.__formAt === null) window.__formAt = Number(v);
    };
    new MutationObserver(read).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-travel-form-at'] });
  });
  const t0 = Date.now();
  await laptop.page.mouse.click(80, 40);
  const cue = await until(async () => laptop.page.locator('[data-testid="world-travel-coming"]').count(), 'the calling cue', 3_000, 30).catch(() => 0);
  check('the third interaction shows the calling cue at once', cue > 0);
  await until(async () => (await homeStatus(laptop)).travelPlace === 'blobbi-home', 'moved home', 15_000);
  const formAt = await until(() => laptop.page.evaluate(() => window.__formAt), 'formAt recorded', 3_000, 30).catch(() => null);
  const formIn = formAt ? formAt - t0 : null;
  check('one World Location published by the third interaction', distinct(await locationsLogged()).length === before + 1);
  check('the Blobbi forms 1.5–2.5 s after the act (phone idle: no departure window, MIN_TRAVEL_MS)', formIn !== null && formIn >= 1_300 && formIn <= 2_700, `formAt-act=${formIn}ms`);
  await until(async () => (await homeActor(laptop)) === 'present', 'present', 10_000);
  const t = await trail(laptop);
  check('one arrival: absent → arrive → present, nothing doubled', t.filter((x) => x === 'arrive').length === 1 && t.at(-1) === 'present', t.join(' → '));
  await until(async () => (await pixel(phone)).place === 'blobbi-home', 'phone follows', 15_000);
  // Reconnection replays nothing
  await control('/drop?relay=ditto&ms=2000');
  await control('/drop?relay=primal&ms=2000');
  await sleep(8_000);
  const t2 = await trail(laptop);
  check('relays dropping and reconnecting replay no animation', t2.filter((x) => x === 'arrive').length === 1 && t2.at(-1) === 'present', t2.join(' → '));
});

await step('Safety: nothing left the machine, nothing unexpected was signed, no page errors', async () => {
  const blocked = [...(await wsLog(laptop.page)), ...(await wsLog(phone.page))].filter((x) => x.blocked);
  check('no socket to anything but the local relay was even attempted', blocked.length === 0, JSON.stringify(blocked.slice(0, 5)));
  const kinds = new Set(phone.signs.map((s) => s.kind));
  check('the phone only ever signed World Locations', [...kinds].every((k) => k === 31126), JSON.stringify([...kinds]));
  const unexpected = (await relayLog()).filter((e) => ![31126, 21124].includes(e.kind) && e.pubkey === acct.pk);
  check('no other event by the account was published', unexpected.length === 0, JSON.stringify(unexpected.map((e) => e.kind)));
  check('no page errors', laptop.errors.length === 0 && phone.errors.length === 0, [...laptop.errors, ...phone.errors].join(' | ').slice(0, 300));
});

await closeAll();
console.log(`\n${results.length - failed}/${results.length} checks passed`);
const summary = { at: new Date().toISOString(), passed: results.length - failed, failed, results, worldLocations: distinct(await locationsLogged()).length };
await import('node:fs').then((fs) => fs.writeFileSync(new URL('./last-run.json', import.meta.url), JSON.stringify(summary, null, 1)));
process.exit(failed ? 1 : 0);
