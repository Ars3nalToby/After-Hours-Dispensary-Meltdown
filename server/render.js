'use strict';
/* render.js: turns a URL into { screenshot, boxes } with headless Chromium (Playwright).
 * One shared browser, one fresh isolated context + one filtering proxy per request.
 * Limits: total time, page height, bytes transferred, blocked schemes/resource types. */
const { chromium } = require('playwright');
const { parseTarget, resolvePublic, isPublicIp, GuardError } = require('./netguard');
const { SessionProxy } = require('./proxy');
const { inPage, sanitize } = require('./extract');

class RenderError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status || 502; } }

const VIEW = { width: 1280, height: 800 };
const DEFAULTS = {
  totalMs: 32000, navMs: 15000, loadMs: 7000, idleMs: 2500, scrollMs: 3500,
  maxHeight: 6000, maxPngBytes: 7 * 1024 * 1024, maxTotalBytes: 60 * 1024 * 1024, maxResponseBytes: 25 * 1024 * 1024,
};
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 DiscountDemolition/2';
const FREEZE_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}::-webkit-scrollbar{display:none}';

class Renderer {
  constructor(opts = {}) { this.o = Object.assign({}, DEFAULTS, opts); this.browser = null; this.launching = null; }

  async getBrowser() {
    if (this.browser && this.browser.isConnected()) return this.browser;
    if (!this.launching) {
      this.launching = chromium.launch({
        // The real proxy is set per context, so each render gets its own filter. '<-loopback>' removes Chromium's default
        // habit of skipping the proxy for 127.0.0.1/localhost, which would otherwise be a hole straight into this machine.
        proxy: { server: 'per-context', bypass: '<-loopback>' },
        args: [
          ...(process.env.CHROMIUM_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
          '--disable-dev-shm-usage', '--disable-quic', '--mute-audio', '--hide-scrollbars', '--disable-background-networking', '--disable-sync',
          '--no-first-run', '--disable-extensions', '--disable-features=Translate,MediaRouter', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
          '--webrtc-ip-handling-policy=disable_non_proxied_udp', '--disable-component-update',
          // Kill-switch: names are resolved by our proxy, never by Chromium. If a request ever bypasses the proxy, DNS fails.
          '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        ],
      }).then(b => { this.browser = b; b.on('disconnected', () => { if (this.browser === b) this.browser = null; }); return b; }).finally(() => { this.launching = null; });
    }
    return this.launching;
  }
  async close() { if (this.browser) { const b = this.browser; this.browser = null; await b.close().catch(() => {}); } }

  async render(rawUrl) {
    const o = this.o, t0 = Date.now();
    let u;
    try { u = parseTarget(rawUrl); } catch (e) { throw new RenderError(e.code || 'bad_url', e.message, 400); }
    const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
    try { await resolvePublic(u.hostname, o.lookup, o.allowIp, port); }   // fast, friendly failure before we start a browser
    catch (e) { if (e instanceof GuardError) throw new RenderError(e.code, e.message, e.code === 'dns' ? 502 : 400); throw e; }

    const proxy = new SessionProxy({ lookup: o.lookup, allowIp: o.allowIp, maxTotalBytes: o.maxTotalBytes, maxResponseBytes: o.maxResponseBytes });
    const pport = await proxy.start();
    let ctx = null, timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; if (ctx) ctx.close().catch(() => {}); }, o.totalMs);
    try {
      const browser = await this.getBrowser();
      ctx = await browser.newContext({
        viewport: VIEW, deviceScaleFactor: 1, userAgent: UA, locale: 'en-US', colorScheme: 'light', reducedMotion: 'reduce',
        proxy: { server: 'http://127.0.0.1:' + pport, bypass: '<-loopback>' },
        acceptDownloads: false, serviceWorkers: 'block', permissions: [], javaScriptEnabled: true, ignoreHTTPSErrors: o.ignoreHTTPSErrors === true,   // true only in tests with a self-signed fixture
      });
      // Only real web traffic. No file:, chrome:, ftp:, and no audio/video downloads.
      // Second line of defence next to the proxy: private IP literals and localhost names are refused before any network use.
      await ctx.route('**/*', route => {
        const r = route.request(), s = r.url();
        if (!/^(https?:|data:|blob:|about:blank)/i.test(s) || r.resourceType() === 'media') return route.abort('blockedbyclient');
        if (/^https?:/i.test(s)) {
          let h = ''; try { h = new URL(s).hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''); } catch { return route.abort('blockedbyclient'); }
          const literal = /^[0-9.]+$/.test(h) || h.includes(':');
          if (h === 'localhost' || h.endsWith('.localhost') || (literal && !isPublicIp(h) && !(o.allowIp && o.allowIp(h, Number(new URL(s).port) || (s[4] === 's' ? 443 : 80), h)))) { proxy.block(h, 'route'); return route.abort('blockedbyclient'); }
        }
        return route.continue();
      });
      const page = await ctx.newPage();
      page.on('popup', p => p.close().catch(() => {}));
      page.on('dialog', d => d.dismiss().catch(() => {}));
      page.on('download', d => d.cancel().catch(() => {}));

      let resp = null;
      try { resp = await page.goto(u.href, { waitUntil: 'domcontentloaded', timeout: o.navMs }); }
      catch (e) {
        if (timedOut) throw new RenderError('timeout', 'That site took too long to load.', 504);
        if (proxy.state.overBudget) throw new RenderError('too_big', 'That page is too big to load.', 413);
        if (proxy.state.blocked.length) throw new RenderError('blocked', 'That site tried to send us to a private or internal address, so it was blocked.', 400);
        throw new RenderError('load_failed', 'Could not load that site.', 502);
      }
      if (proxy.state.blocked.some(b => b.host === new URL(page.url()).hostname.toLowerCase())) throw new RenderError('blocked', 'That site redirected to a private or internal address, so it was blocked.', 400);
      if (resp && resp.status() >= 400 && resp.status() !== 404 && resp.status() !== 403) throw new RenderError('http_' + resp.status(), 'That site answered with an error (' + resp.status() + ').', 502);
      await page.waitForLoadState('load', { timeout: o.loadMs }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: o.idleMs }).catch(() => {});
      if (timedOut) throw new RenderError('timeout', 'That site took too long to load.', 504);
      await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});

      // Scroll once through the page so lazy images load, then return to the top.
      await page.evaluate(async ({ maxH, ms }) => {
        const end = Date.now() + ms, step = Math.floor(innerHeight * 0.8);
        for (let y = 0; y < Math.min(document.documentElement.scrollHeight, maxH) && Date.now() < end; y += step) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
        scrollTo(0, 0); if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 800))]);
        await new Promise(r => setTimeout(r, 250));
      }, { maxH: o.maxHeight, ms: o.scrollMs }).catch(() => {});
      if (timedOut) throw new RenderError('timeout', 'That site took too long to load.', 504);

      const raw = await page.evaluate(inPage).catch(() => null);
      const docH = Math.max(VIEW.height, Math.min(o.maxHeight, Math.round(raw && Number.isFinite(raw.docH) ? raw.docH : VIEW.height)));
      const clip = { x: 0, y: 0, width: VIEW.width, height: docH };
      let shot = await page.screenshot({ type: 'png', fullPage: true, clip, animations: 'disabled', timeout: 12000 });
      let mime = 'image/png';
      if (shot.length > o.maxPngBytes) { shot = await page.screenshot({ type: 'jpeg', quality: 85, fullPage: true, clip, animations: 'disabled', timeout: 12000 }); mime = 'image/jpeg'; }
      if (shot.length > 12 * 1024 * 1024) throw new RenderError('too_big', 'That page is too big to turn into a level.', 413);
      const clean = sanitize(raw, VIEW.width, docH);
      return {
        ok: true, url: page.url(), host: new URL(page.url()).hostname, title: clean.title, width: VIEW.width, height: docH, bg: clean.bg,
        truncated: !!(raw && raw.docH > docH), blockedRequests: proxy.state.blocked.length, proxied: proxy.state.requests, ms: Date.now() - t0,
        image: 'data:' + mime + ';base64,' + shot.toString('base64'), boxes: clean.boxes,
      };
    } catch (e) {
      if (e instanceof RenderError) throw e;
      if (timedOut) throw new RenderError('timeout', 'That site took too long to load.', 504);
      if (proxy.state.overBudget) throw new RenderError('too_big', 'That page is too big to load.', 413);
      if (/Target (page|closed)|browser has been closed|Browser closed/i.test(String(e && e.message))) { this.close(); }
      throw new RenderError('render_failed', 'Could not render that site.', 502);
    } finally {
      clearTimeout(deadline);
      if (ctx) await ctx.close().catch(() => {});
      proxy.close();
    }
  }
}
module.exports = { Renderer, RenderError, VIEW };
