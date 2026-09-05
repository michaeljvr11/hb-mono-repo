#!/usr/bin/env node
// Screenshot evidence for the storefront overhaul (PLAN §4 verification recipe).
//
// Drives a headless Chrome over the DevTools Protocol — no Playwright/Puppeteer dependency —
// and captures each route at 360/768/1280/1440/1920 in light and in dark
// (both pinned via `document.documentElement.dataset.theme`, so the host OS's
// `prefers-color-scheme` cannot leak in). Also asserts there is no horizontal
// overflow (`scrollWidth <= innerWidth`) at every width and prints a summary table.
//
// Usage (from repo root, web dev server already running on :4200):
//   node docs/design/redesign/evidence/capture.mjs phase-1 [home discover cart products/abc ...]
//
// Routes are given WITHOUT a leading slash (`home` = `/`). Git Bash on Windows rewrites a
// bare `/discover` argument into `C:/Program Files/Git/discover` before Node sees it; if you
// must pass leading slashes, prefix the command with `MSYS_NO_PATHCONV=1`.
//
// Guarded routes take `!auth` (`cart!auth checkout!auth`), which signs in with
// HB_CAPTURE_EMAIL / HB_CAPTURE_PASSWORD and puts one product in the cart first.
//
// A route may carry a `!flyout` modifier (`discover!flyout`): after load, the header's
// "All categories" trigger is clicked (where present, i.e. ≥1024px) before the capture, so
// the open flyout is recorded. Phase 2 added it; other modifiers can follow the same shape.
//
// `!loading` (Phase 3) captures a route's skeletons. Blocking the API and reloading does
// NOT work: the SSR pass fetches server-side, so the HTML already contains the products and
// the client has nothing left to request. Instead the capture seeds a real page, then holds
// every listing request open (CDP `Fetch`, never continued) and enters the target route by
// *client-side* navigation, which is what actually issues the blocked fetch. See
// LOADING_SEED / LOADING_ENTRY below.
//
// Screenshots land in docs/design/redesign/evidence/<phase>/<route>-<width>-<theme>.png.
// Requires Node ≥ 22 (global WebSocket) and Chrome or Edge installed.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.HB_WEB_URL ?? 'http://localhost:4200';
const WIDTHS = [360, 768, 1280, 1440, 1920];
const THEMES = ['light', 'dark'];
const HEIGHT = 1000;
const PORT = 9333;

const [phase = 'phase-x', ...routeArgs] = process.argv.slice(2);
const normaliseRoute = (arg) => {
  // Undo MSYS path conversion (`C:/Program Files/Git/discover` → `discover`) and accept
  // either `home`/`` or a path with or without its leading slash. A trailing `!modifier`
  // is split off and kept alongside the route.
  const [rawPath, ...modifiers] = arg.split('!');
  const tail = rawPath.replace(/^[A-Za-z]:\/.*?\/Git\//, '').replace(/^\/+/, '');
  return { path: tail === '' || tail === 'home' ? '/' : `/${tail}`, modifiers };
};
const routes = routeArgs.length ? routeArgs.map(normaliseRoute) : [{ path: '/', modifiers: [] }];

const MODIFIER_SCRIPTS = {
  flyout: `(async () => {
    const trigger = document.querySelector('.category-nav__trigger');
    if (!trigger) return 'no-trigger';
    trigger.click();
    await new Promise((r) => setTimeout(r, 700));
    return 'open';
  })()`,
  // Nothing to run per theme: `!loading` is set up once per width (see LOADING_ENTRY).
  loading: `'held'`,
  refreshing: `'held'`,
  // Nothing per theme: `!auth` is set up once per width, before the route loads.
  auth: `'signed-in'`,
  // Brings the checkout's payment-security block into frame (it sits below the
  // address form, so a top-of-page capture never shows it).
  security: `(() => {
    const el = document.querySelector('.checkout__security');
    if (!el) return 'no-security-block';
    el.scrollIntoView({ block: 'center' });
    return 'scrolled';
  })()`,
};

/** The route a `!loading` capture loads for real before entering the target route in-app. */
const LOADING_SEED = '/discover';

/**
 * How to reach each `!loading` target by client-side navigation from LOADING_SEED. Each
 * script clicks a control that exists at every width, waits for the route to settle and
 * returns `'ok'` only once a skeleton is actually on the page — so a capture can never
 * silently record a loaded screen.
 */
const LOADING_ENTRY = {
  '/': `(async () => {
    const brand = document.querySelector('a.nav-bar__brand');
    if (!brand) return 'no-brand-link';
    brand.click();
    await new Promise((r) => setTimeout(r, 1500));
    // The storefront's skeletons are below the hero, so bring them into the capture.
    document.getElementById('new-in-namibia')?.scrollIntoView({ block: 'start' });
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelector('app-product-card-skeleton') ? 'ok' : 'no-skeleton at ' + location.pathname;
  })()`,
  // Phase 4 note: this used to click a category chip *within* /discover, which no
  // longer produces skeletons — a filter change on a populated grid now takes the
  // fade-through path (see `!refreshing` below). Reaching discover's skeletons means
  // entering the route fresh, so the entry leaves via the brand link and comes back
  // through a storefront category tile.
  '/discover': `(async () => {
    const brand = document.querySelector('a.nav-bar__brand');
    if (!brand) return 'no-brand-link';
    brand.click();
    await new Promise((r) => setTimeout(r, 1200));
    const tile = document.querySelector('.category-card');
    if (!tile) return 'no-category-tile at ' + location.pathname;
    tile.click();
    await new Promise((r) => setTimeout(r, 1500));
    return document.querySelector('app-product-card-skeleton') ? 'ok' : 'no-skeleton at ' + location.pathname;
  })()`,
};

/**
 * `!refreshing` (Phase 4): the fade-through. A filter change on a grid that already
 * has results keeps the grid mounted and dims it rather than collapsing it into
 * skeletons. Same request-holding plumbing as `!loading`, but it asserts the *opposite*
 * — a dimmed grid and no skeletons.
 */
const REFRESHING_ENTRY = `(async () => {
  const chips = [...document.querySelectorAll('.discover__controls .category-chips__chip')];
  const chip = chips.find((c) => !c.classList.contains('category-chips__chip--active'));
  if (!chip) return 'no-chip';
  chip.click();
  await new Promise((r) => setTimeout(r, 800));
  const grid = document.querySelector('.discover__grid');
  if (!grid) return 'no-grid at ' + location.pathname;
  if (document.querySelector('app-product-card-skeleton')) return 'unexpected-skeleton';
  return grid.classList.contains('discover__grid--refreshing') ? 'ok' : 'not-dimmed';
})()`;

/**
 * `!auth` (Phase 4): `/cart` and `/checkout` are behind the auth guard, so without this
 * they capture the login screen (Phase 1 hit exactly that). The web app keeps a bearer
 * token in `localStorage.access_token`, so signing in is: POST the API's login endpoint,
 * seed that key on the :4200 origin, reload.
 *
 * Credentials come from `HB_CAPTURE_EMAIL` / `HB_CAPTURE_PASSWORD` — never hard-coded
 * here. For a local database seeded by `apps/api/src/database/seed.ts`, use the dev
 * credential that file prints when it runs.
 */
const API = process.env.HB_API_URL ?? 'http://localhost:3000/api';

async function signIn() {
  const email = process.env.HB_CAPTURE_EMAIL;
  const password = process.env.HB_CAPTURE_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'The !auth modifier needs HB_CAPTURE_EMAIL and HB_CAPTURE_PASSWORD in the environment.',
    );
  }
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`!auth login failed: ${res.status} ${await res.text()}`);
  const { access_token: token } = await res.json();
  if (!token) throw new Error('!auth login returned no access_token');
  return token;
}

/** Puts one product in the signed-in user's cart so /cart and /checkout have content. */
async function seedCart(token) {
  const list = await (await fetch(`${API}/products?limit=20`)).json();
  const product = list.items.find((p) => !p.sizes?.length && p.stockQuantity > 0);
  if (!product) throw new Error('!auth: no unsized in-stock product to seed the cart with');
  const res = await fetch(`${API}/cart/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ productId: product.id, quantity: 1 }),
  });
  // 409/400 usually means "already in the cart" — fine, the cart just needs to be non-empty.
  if (!res.ok && res.status !== 409 && res.status !== 400) {
    throw new Error(`!auth cart seed failed: ${res.status} ${await res.text()}`);
  }
}

/** Holds every listing request open so the page stays in its loading state. */
async function holdListingRequests(cdp) {
  await cdp.send('Fetch.enable', {
    patterns: [
      { urlPattern: '*/api/products*', requestStage: 'Request' },
      { urlPattern: '*/api/vendors/directory*', requestStage: 'Request' },
    ],
  });
  // Paused requests are never continued or failed — they simply never resolve.
  return () => cdp.send('Fetch.disable');
}
const outDir = join(HERE, phase);
mkdirSync(outDir, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error('No Chrome/Edge found. Set CHROME_PATH.');
  process.exit(1);
}

const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    `--user-data-dir=${join(outDir, '.chrome-profile')}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
process.on('exit', () => chrome.kill());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return res.json();
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error('Chrome did not expose the DevTools endpoint.');
}

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();
  #listeners = new Map();

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const c = new Cdp();
    c.#ws = ws;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && c.#pending.has(msg.id)) {
        const { resolve, reject } = c.#pending.get(msg.id);
        c.#pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        (c.#listeners.get(msg.method) ?? []).forEach((fn) => fn(msg.params));
      }
    });
    return c;
  }

  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
  }

  once(method) {
    return new Promise((resolve) => {
      const fn = (p) => {
        this.#listeners.set(method, (this.#listeners.get(method) ?? []).filter((f) => f !== fn));
        resolve(p);
      };
      this.#listeners.set(method, [...(this.#listeners.get(method) ?? []), fn]);
    });
  }

  close() {
    this.#ws.close();
  }
}

async function evaluate(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result.value;
}

const results = [];

// One sign-in for the whole run, and only when something actually asks for it.
const authToken = routes.some((r) => r.modifiers.includes('auth')) ? await signIn() : null;
if (authToken) await seedCart(authToken);

try {
  await waitForDevtools();
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  // Chrome caches the dev server's hashed chunks across runs, so a re-capture after a
  // style change can silently record the *previous* build (Phase 4 chased exactly that
  // for twenty minutes). Evidence must come from the code as it stands.
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

  for (const { path: route, modifiers } of routes) {
    const base = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-');
    const slug = [base, ...modifiers].join('-');
    for (const width of WIDTHS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: HEIGHT,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      const isLoading = modifiers.includes('loading');
      const isRefreshing = modifiers.includes('refreshing');
      if (modifiers.includes('auth')) {
        // Land on the origin first so localStorage is writable for it, then reload
        // into the guarded route with the token in place.
        const blank = cdp.once('Page.loadEventFired');
        await cdp.send('Page.navigate', { url: `${BASE}/login` });
        await blank;
        await evaluate(cdp, `localStorage.setItem('access_token', ${JSON.stringify(authToken)})`);
      }
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', {
        url: BASE + (isLoading || isRefreshing ? LOADING_SEED : route),
      });
      await loaded;
      // Let hydration, fonts and any first fetches settle.
      await evaluate(cdp, 'document.fonts.ready.then(() => new Promise(r => setTimeout(r, 900)))');

      const cleanups = [];
      if (isLoading) {
        cleanups.push(await holdListingRequests(cdp));
        const entry = LOADING_ENTRY[route];
        if (!entry) throw new Error(`No !loading entry defined for route "${route}". Known: ${Object.keys(LOADING_ENTRY)}`);
        const outcome = await evaluate(cdp, entry);
        if (outcome !== 'ok') throw new Error(`!loading entry for "${route}" failed: ${outcome}`);
      }
      if (isRefreshing) {
        cleanups.push(await holdListingRequests(cdp));
        const outcome = await evaluate(cdp, REFRESHING_ENTRY);
        if (outcome !== 'ok') throw new Error(`!refreshing entry for "${route}" failed: ${outcome}`);
      }

      for (const theme of THEMES) {
        await evaluate(
          cdp,
          // Both themes are *pinned* via `data-theme`. Since Phase 4 flipped the
          // `prefers-color-scheme` block on, deleting the attribute no longer means
          // "light" — it means "whatever the host OS is set to", which made every
          // light capture come out dark on a dark-mode machine. `data-theme="light"`
          // wins over the media query by design (the `:not([data-theme='light'])`
          // guard), so pinning both directions is deterministic.
          `document.documentElement.dataset.theme = '${theme}'`,
        );
        for (const modifier of modifiers) {
          const script = MODIFIER_SCRIPTS[modifier];
          if (!script) throw new Error(`Unknown route modifier "!${modifier}". Known: ${Object.keys(MODIFIER_SCRIPTS)}`);
          await evaluate(cdp, script);
        }
        await sleep(150);
        const metrics = await evaluate(
          cdp,
          `({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
              bg: getComputedStyle(document.body).backgroundColor,
              fg: getComputedStyle(document.body).color })`,
        );
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const file = join(outDir, `${slug}-${width}-${theme}.png`);
        writeFileSync(file, Buffer.from(data, 'base64'));
        results.push({
          route,
          width,
          theme,
          overflow: metrics.scrollWidth > metrics.innerWidth ? `YES (${metrics.scrollWidth}>${metrics.innerWidth})` : 'no',
          bg: metrics.bg,
          fg: metrics.fg,
          file: file.replace(/\\/g, '/').split('/evidence/')[1],
        });
      }
      for (const cleanup of cleanups) await cleanup();
    }
  }
  cdp.close();
} finally {
  chrome.kill();
}

console.table(results);
const overflowing = results.filter((r) => r.overflow !== 'no');
if (overflowing.length) {
  console.error(`\n${overflowing.length} capture(s) have horizontal overflow.`);
  process.exitCode = 2;
} else {
  console.log(`\nAll ${results.length} captures free of horizontal overflow.`);
}
