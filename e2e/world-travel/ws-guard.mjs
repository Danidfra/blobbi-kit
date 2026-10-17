/**
 * The page-side guard every browser context gets (Playwright `addInitScript`), before any app code runs:
 *
 *   - the relay URLs the apps know (`wss://relay.ditto.pub`, ...) are redirected to the LOCAL relay
 *     (`ws://127.0.0.1:<port>/<name>`), one logical relay per host;
 *   - the dev server's own socket (Vite's HMR, same origin) passes;
 *   - EVERY other socket is refused: it never opens, and the attempt is recorded. A test fails if any was refused,
 *     so nothing can reach a public relay by accident.
 *
 * `window.__wsLog` lists every socket asked for: { asked, opened, blocked }.
 */
export function wsGuardScript({ relayPort, map }) {
  return `(() => {
    const MAP = ${JSON.stringify(map)};
    const PORT = ${JSON.stringify(relayPort)};
    const Real = window.WebSocket;
    const log = (window.__wsLog = []);
    const canon = (u) => { try { const x = new URL(u); return x.protocol + '//' + x.host + x.pathname.replace(/\\/+$/, ''); } catch { return String(u); } };
    function Guarded(url, protocols) {
      const asked = canon(url);
      const name = MAP[asked];
      const sameOrigin = (() => { try { const x = new URL(url); return x.hostname === location.hostname && x.port === location.port; } catch { return false; } })();
      if (name) {
        const target = 'ws://127.0.0.1:' + PORT + '/' + name;
        log.push({ asked, opened: target, blocked: false });
        return protocols === undefined ? new Real(target) : new Real(target, protocols);
      }
      if (sameOrigin) {
        log.push({ asked, opened: asked, blocked: false });
        return protocols === undefined ? new Real(url) : new Real(url, protocols);
      }
      log.push({ asked, opened: null, blocked: true });
      // A socket that fails at once, as an unreachable relay does
      return new Real('ws://127.0.0.1:9/blocked');
    }
    Guarded.prototype = Real.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Guarded[k] = Real[k];
    window.WebSocket = Guarded;
  })();`;
}

/** The relay hosts the two apps know, each its own local relay. */
export const RELAY_MAP = {
  'wss://relay.ditto.pub': 'ditto',
  'wss://relay.primal.net': 'primal',
  'wss://relay.nostr.band': 'band',
  'wss://relay.dreamith.to': 'dreamith',
};
