/**
 * Shared pieces of the cross-device checks: a test account, the events its Blobbi needs, the local relay's control
 * API, and independent browser contexts (each its own cookies and storage: a separate "device") with the socket guard.
 */
import { chromium } from 'playwright';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { bytesToHex } from 'nostr-tools/utils';
import { buildEggTags, getCanonicalBlobbonautD } from '../../packages/blobbi-core/dist/index.js';
import { RELAY_MAP, wsGuardScript } from './ws-guard.mjs';

export const RELAY_PORT = Number(process.env.RELAY_PORT ?? 7777);
export const CONTROL = `http://127.0.0.1:${RELAY_PORT}`;
export const HOME_URL = process.env.HOME_URL ?? 'http://127.0.0.1:8080/';
export const PIXEL_URL = process.env.PIXEL_URL ?? 'http://127.0.0.1:5177/';
export const TRAVEL_RELAYS = ['ditto', 'primal'];

export function account(name = 'Bambu', petId = '0a1b2c3d4e') {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const now = Math.floor(Date.now() / 1000) - 3600;
  const tags = buildEggTags(pk, petId, now, name, { visualGeneration: 'v3' }).map((t) => (t[0] === 'stage' ? ['stage', 'adult'] : t));
  const d = tags.find((t) => t[0] === 'd')[1];
  const blobbi = finalizeEvent({ kind: 31124, created_at: now, tags, content: '' }, sk);
  const profile = finalizeEvent(
    { kind: 11125, created_at: now, tags: [['d', getCanonicalBlobbonautD(pk)], ['b', 'blobbi:ecosystem:v1'], ['name', 'Tester'], ['has', d], ['current_companion', d]], content: '' },
    sk,
  );
  return { sk, skHex: bytesToHex(sk), pk, nsec: nsecEncode(sk), d, name, blobbi, profile, sign: (t) => finalizeEvent(t, sk) };
}

export async function control(path, body) {
  const res = await fetch(`${CONTROL}${path}`, { method: body === undefined && !path.startsWith('/reset') && !path.startsWith('/drop') && !path.startsWith('/refuse') && !path.startsWith('/delay') ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  return res.json();
}
export const reset = () => control('/reset');
export async function seed(events) {
  for (const name of Object.values(RELAY_MAP)) await control(`/seed?relay=${name}`, events);
}
export const relayLog = () => control('/log');
export const stored = (relay) => control(`/events?relay=${relay}`);

let browser;
export async function launch() {
  browser ??= await chromium.launch({ headless: process.env.HEADED ? false : true });
  return browser;
}
export async function closeAll() {
  await browser?.close();
  browser = undefined;
}

/**
 * A device: its own context (cookies, localStorage, IndexedDB), the socket guard, the world-travel dev switch, and
 * either an nsec login (Standalone: a silent signer) or a NIP-07 shim whose signatures are counted (Pixel: a signer
 * that may prompt). `signs` lists every template the shim was asked to sign.
 */
export async function device({ acct, app, extension = false, presence = false, label }) {
  const b = await launch();
  const context = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const signs = [];
  /** `refuse`: the shim's signer says no (the player declined). */
  const dev = { signs, refuse: false };
  await context.addInitScript(wsGuardScript({ relayPort: RELAY_PORT, map: RELAY_MAP }));
  await context.addInitScript(
    ({ app, pk, nsec, extension, presence }) => {
      try {
        if (sessionStorage.getItem('__seeded')) return;
        sessionStorage.setItem('__seeded', '1');
        localStorage.setItem('blobbi:world-travel:v1', 'nostr');
        if (presence) localStorage.setItem(`blobbi:active-presence:v1:${pk}`, 'on');
        if (app === 'home') {
          localStorage.setItem('blobbi:home:3d-intro:v1', 'seen');
          const login = extension
            ? { id: `extension:${pk}`, type: 'extension', pubkey: pk, createdAt: new Date().toISOString(), data: null }
            : { id: `nsec:${pk}`, type: 'nsec', pubkey: pk, createdAt: new Date().toISOString(), data: { nsec } };
          localStorage.setItem('nostr:login', JSON.stringify([login]));
        } else {
          localStorage.setItem('blobbi-pixel-lab:account', JSON.stringify({ version: 1, pubkey: pk, method: 'nip07', connectedAt: Date.now(), profile: null }));
        }
      } catch {
        /* storage refused: the test will see it */
      }
    },
    { app, pk: acct.pk, nsec: acct.nsec, extension, presence },
  );
  if (app === 'pixel' || extension) {
    await context.exposeFunction('__e2eSign', (tpl) => {
      signs.push(tpl);
      if (dev.refuse) throw new Error('user rejected');
      return acct.sign(tpl);
    });
    await context.addInitScript((pk) => {
      window.nostr = {
        getPublicKey: async () => pk,
        signEvent: async (tpl) => window.__e2eSign(tpl),
      };
    }, acct.pk);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  dev.context = context;
  dev.page = page;
  dev.errors = errors;
  dev.label = label ?? app;
  return dev;
}

export async function wsLog(page) {
  return page.evaluate(() => window.__wsLog ?? []);
}

/** Poll until `fn` returns truthy (or throw with `what`). */
export async function until(fn, what, timeoutMs = 20_000, everyMs = 150) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`timed out waiting for ${what} (last: ${typeof last === 'object' ? JSON.stringify(last) : last})`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
