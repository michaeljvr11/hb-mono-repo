#!/usr/bin/env node
// Screenshot evidence for the storefront overhaul (PLAN §4 verification recipe).
//
// Drives a headless Chrome over the DevTools Protocol — no Playwright/Puppeteer dependency —
// and captures each route at 360/768/1280/1440/1920 in light and in dark
// (`document.documentElement.dataset.theme = 'dark'`). Also asserts there is no horizontal
// overflow (`scrollWidth <= innerWidth`) at every width and prints a summary table.
//
// Usage (from repo root, web dev server already running on :4200):
//   node docs/design/redesign/evidence/capture.mjs phase-1 [home discover cart products/abc ...]
//
// Routes are given WITHOUT a leading slash (`home` = `/`). Git Bash on Windows rewrites a
// bare `/discover` argument into `C:/Program Files/Git/discover` before Node sees it; if you
// must pass leading slashes, prefix the command with `MSYS_NO_PATHCONV=1`.
//
// A route may carry a `!flyout` modifier (`discover!flyout`): after load, the header's
// "All categories" trigger is clicked (where present, i.e. ≥1024px) before the capture, so
// the open flyout is recorded. Phase 2 added it; other modifiers can follow the same shape.
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
};
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

try {
  await waitForDevtools();
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

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
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url: BASE + route });
      await loaded;
      // Let hydration, fonts and any first fetches settle.
      await evaluate(cdp, 'document.fonts.ready.then(() => new Promise(r => setTimeout(r, 900)))');

      for (const theme of THEMES) {
        await evaluate(
          cdp,
          theme === 'dark'
            ? "document.documentElement.dataset.theme = 'dark'"
            : 'delete document.documentElement.dataset.theme',
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
