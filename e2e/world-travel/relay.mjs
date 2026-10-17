/**
 * A LOCAL NIP-01 RELAY for the M16 cross-device checks. Never public: it binds 127.0.0.1 only.
 *
 * Each URL path is its own relay (`ws://127.0.0.1:7777/ditto`, `/primal`, ...), with its own store, so a test can make
 * relays disagree. Storage follows NIP-01: replaceable (0, 3, 10000–19999) and addressable (30000–39999) keep the
 * newest per address (higher created_at, then lower id); ephemeral (20000–29999) is forwarded, never stored; NIP-40
 * expired events are refused and never served. Every event's id and signature are checked (nostr-tools).
 *
 * HTTP control (same port):
 *   GET  /log                       every EVENT received, per relay ({ relay, kind, id, ok, reason, at })
 *   GET  /events?relay=ditto        what that relay stores
 *   POST /seed?relay=ditto          a JSON array of signed events, stored as if published
 *   POST /reset                     forget everything
 *   POST /drop?relay=ditto&ms=3000  close every socket of that relay and refuse connections for ms
 *   POST /refuse?relay=ditto&on=1   answer every EVENT with OK false ("blocked:")
 *   POST /delay?relay=ditto&ms=2500 answer every REQ (stored events and EOSE) this late (a slow relay; 0 turns it off)
 *
 * Usage: node relay.mjs [port]   (default 7777)
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { verifyEvent } from 'nostr-tools/pure';

const PORT = Number(process.argv[2] ?? process.env.RELAY_PORT ?? 7777);

/** name -> { stored: Map<id, event>, sockets: Set<ws>, downUntil, refuse } */
const relays = new Map();
const log = [];
const relayOf = (name) => {
  if (!relays.has(name)) relays.set(name, { stored: new Map(), sockets: new Set(), downUntil: 0, refuse: false, reqDelay: 0 });
  return relays.get(name);
};

const isReplaceable = (k) => k === 0 || k === 3 || (k >= 10000 && k < 20000);
const isAddressable = (k) => k >= 30000 && k < 40000;
const isEphemeral = (k) => k >= 20000 && k < 30000;
const dOf = (e) => e.tags.find((t) => t[0] === 'd')?.[1] ?? '';
const addressOf = (e) => (isAddressable(e.kind) ? `${e.kind}:${e.pubkey}:${dOf(e)}` : `${e.kind}:${e.pubkey}`);
const expired = (e, now = Math.floor(Date.now() / 1000)) => {
  const exp = e.tags.find((t) => t[0] === 'expiration')?.[1];
  return exp !== undefined && Number(exp) <= now;
};
const newer = (a, b) => a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);

function matches(e, f) {
  if (f.ids && !f.ids.includes(e.id)) return false;
  if (f.authors && !f.authors.includes(e.pubkey)) return false;
  if (f.kinds && !f.kinds.includes(e.kind)) return false;
  if (f.since !== undefined && e.created_at < f.since) return false;
  if (f.until !== undefined && e.created_at > f.until) return false;
  for (const [k, v] of Object.entries(f)) {
    if (k[0] !== '#' || !Array.isArray(v)) continue;
    if (!e.tags.some((t) => t[0] === k.slice(1) && v.includes(t[1]))) return false;
  }
  return true;
}

/** Store (when it should be) and say what to answer. */
function accept(r, e) {
  if (!e || typeof e !== 'object' || !verifyEvent(e)) return { ok: false, reason: 'invalid: bad id or signature' };
  if (expired(e)) return { ok: false, reason: 'invalid: event is expired' };
  if (r.stored.has(e.id)) return { ok: true, reason: 'duplicate: already have it', fresh: false };
  if (isEphemeral(e.kind)) return { ok: true, reason: '', fresh: true };
  if (isReplaceable(e.kind) || isAddressable(e.kind)) {
    const addr = addressOf(e);
    const old = [...r.stored.values()].find((x) => (isReplaceable(x.kind) || isAddressable(x.kind)) && addressOf(x) === addr);
    if (old && !newer(e, old)) return { ok: true, reason: 'duplicate: have a newer version', fresh: false };
    if (old) r.stored.delete(old.id);
  }
  r.stored.set(e.id, e);
  return { ok: true, reason: '', fresh: true };
}

function broadcast(r, e) {
  for (const ws of r.sockets) {
    for (const [subId, filters] of ws.subs) if (filters.some((f) => matches(e, f))) ws.send(JSON.stringify(['EVENT', subId, e]));
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const body = await new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => resolve(s));
  });
  const json = (status, v) => {
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(v));
  };
  const name = url.searchParams.get('relay') ?? 'ditto';
  if (req.method === 'GET' && url.pathname === '/log') return json(200, log);
  if (req.method === 'GET' && url.pathname === '/events') return json(200, [...relayOf(name).stored.values()].filter((e) => !expired(e)));
  if (req.method === 'POST' && url.pathname === '/seed') {
    const out = (JSON.parse(body || '[]') ?? []).map((e) => accept(relayOf(name), e));
    return json(200, out);
  }
  if (req.method === 'POST' && url.pathname === '/reset') {
    for (const r of relays.values()) {
      r.stored.clear();
      r.refuse = false;
      r.downUntil = 0;
      r.reqDelay = 0;
    }
    log.length = 0;
    return json(200, { ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/drop') {
    const r = relayOf(name);
    r.downUntil = Date.now() + Number(url.searchParams.get('ms') ?? 3000);
    for (const ws of r.sockets) ws.terminate();
    return json(200, { ok: true, until: r.downUntil });
  }
  if (req.method === 'POST' && url.pathname === '/delay') {
    relayOf(name).reqDelay = Number(url.searchParams.get('ms') ?? 0);
    return json(200, { ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/refuse') {
    relayOf(name).refuse = url.searchParams.get('on') === '1';
    relayOf(name).refuseReason = url.searchParams.get('reason') ?? 'blocked: refusing writes (test)';
    return json(200, { ok: true });
  }
  json(404, { error: 'not found' });
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const name = new URL(req.url, 'http://x').pathname.replace(/^\/+|\/+$/g, '') || 'ditto';
  const r = relayOf(name);
  if (Date.now() < r.downUntil) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.subs = new Map();
    r.sockets.add(ws);
    ws.on('close', () => r.sockets.delete(ws));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return ws.send(JSON.stringify(['NOTICE', 'invalid: not JSON']));
      }
      if (msg[0] === 'EVENT') {
        const e = msg[1];
        const out = r.refuse ? { ok: false, reason: r.refuseReason ?? 'blocked: refusing writes (test)' } : accept(r, e);
        log.push({ relay: name, kind: e?.kind, id: e?.id, pubkey: e?.pubkey, ok: out.ok, reason: out.reason, at: Date.now() });
        ws.send(JSON.stringify(['OK', e?.id ?? '', out.ok, out.reason]));
        if (out.ok && out.fresh) broadcast(r, e);
      } else if (msg[0] === 'REQ') {
        const [, subId, ...filters] = msg;
        const answer = () => {
          if (ws.readyState !== ws.OPEN) return;
          ws.subs.set(subId, filters);
          const now = Math.floor(Date.now() / 1000);
          for (const f of filters) {
            const hits = [...r.stored.values()].filter((e) => !expired(e, now) && matches(e, f)).sort((a, b) => b.created_at - a.created_at);
            for (const e of hits.slice(0, f.limit ?? 500)) ws.send(JSON.stringify(['EVENT', subId, e]));
          }
          ws.send(JSON.stringify(['EOSE', subId]));
        };
        if (r.reqDelay) setTimeout(answer, r.reqDelay);
        else answer();
      } else if (msg[0] === 'CLOSE') {
        ws.subs.delete(msg[1]);
      } else if (msg[0] === 'AUTH') {
        ws.send(JSON.stringify(['NOTICE', 'auth not supported']));
      }
    });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`local relay on ws://127.0.0.1:${PORT}/<name> (control http://127.0.0.1:${PORT})`));
