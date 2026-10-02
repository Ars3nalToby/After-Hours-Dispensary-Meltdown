# Discount Demolition 2

A browser game: a stickman wrecks a website with nine weapons while a zombie horde chases him.
Everything is original: art, sounds (all synthesised with Web Audio) and copy.

## Run it

Built-in sites and screenshot upload need no server: open `index.html`, or serve the folder (`python3 -m http.server 8080`).

"Wreck any website" needs the Node server, which renders pages with headless Chromium:

    npm install
    npx playwright install chromium     # once; downloads the browser
    npm start                           # http://localhost:3000

On Linux as root (containers, CI) also set `CHROMIUM_NO_SANDBOX=1`.

## Controls

| Action | Keys |
|---|---|
| Move | A / D or arrow keys |
| Jump, jetpack | Space or W (hold in the air for the jetpack) |
| Drop through the floor | S |
| Dash (brief invulnerability) | Shift |
| Aim, shoot | Mouse (hold to keep firing) |
| Grenade | Right click or G |
| Weapons | 1 to 9 or mouse wheel |
| Mute | M |
| Restart | R |

Weapons: pistol, SMG, shotgun, minigun (spins up), flamethrower (fire spreads and burns the page), railgun (charges, pierces),
rockets, airstrike (click to mark a target), black hole (rips the page apart, then collapses).

## Destroy any website

Paste a web address on the title card (or upload a screenshot). The server loads the page in headless Chromium at 1280x800,
scrolls it once so lazy images load, and returns a full-page screenshot plus the boxes of text blocks, images, buttons and cards.
The game turns that into a level:

- pixels that match the page background are air; everything else is solid, and each reported box is filled in as a platform
- big images and videos become **armour**: high HP, they crack under fire and shatter into pieces when they finally give way
- buttons and iframes (ads) become **explosive blocks** with a hazard frame, and they chain like the drums
- destroyed areas show a clean page background (the screenshot with its content painted out), with scorch marks on top

`POST /api/render` with `{"url":"https://example.com"}` returns `{ok, image (data URL), boxes, width, height, bg, title, host, url}`.
Errors come back as `{ok:false, error, message}` with 400 (bad or blocked address), 413 (too big), 429 (rate limit), 503 (busy), 504 (timeout), 502 (could not load).

### Security model

This server fetches addresses chosen by strangers, so the rules are strict and tested (`npm test`, `tests/e2e-site.cjs`):

| Threat | Defence |
|---|---|
| SSRF to internal addresses | Every request Chromium makes (document, redirects, images, scripts, XHR, iframes) goes through a per-render filtering proxy. It resolves the name once, refuses unless every address is public, and connects to that exact IP. Blocks loopback, private, link-local (cloud metadata), CGNAT, multicast, reserved, and IPv6 forms that smuggle IPv4 (mapped, NAT64, 6to4). |
| Redirects and subresources | Same proxy, so a public page that redirects to or embeds `http://169.254.169.254/` is blocked at that hop. Chromium is forced to proxy loopback too, a second route-level check refuses private IP literals, and a DNS kill-switch (`--host-resolver-rules`) makes any proxy bypass fail. |
| DNS rebinding | One lookup per host per render, pinned. A later private answer is never used. |
| Bad schemes and ports | Only `http` and `https`; no `user:pass@`; ports 80, 443 and 1024+ only; `file:`, `ftp:`, `chrome:`, `data:` navigation refused. |
| Resource abuse | Hard 32 s deadline, 15 s navigation cap, 6000 px page height cap, 60 MB total and 25 MB per response, no audio/video, 12 MB result cap, popups and downloads cancelled, service workers off. |
| Flooding | Per-IP limit (5 per minute, 30 per hour), global concurrency cap (2), 10 minute result cache. Behind a proxy set `TRUST_PROXY=1`. |
| Target scripts reaching players | Pages run only inside headless Chromium on the server. The game receives an image and sanitised numbers; no HTML or script from the target is ever sent to or run in the browser. The game page also ships a strict Content-Security-Policy. |

Environment variables: `PORT` (3000), `TRUST_PROXY` (0), `RENDER_CONCURRENCY` (2), `RATE_PER_MIN` (5), `RATE_PER_HOUR` (30), `CHROMIUM_NO_SANDBOX` (set to 1 in containers).
A `Dockerfile` is included; full deploy steps arrive with Phase 3.

## Code layout

    index.html, css/style.css
    js/core.js            shared namespace, constants, global state
    js/audio.js           Web Audio synthesis
    js/site-megasave.js   the MegaSave parody page, drawn with canvas calls
    js/sites.js           the other built-in sites (Chirpr, Daily Overshare, Tubeline) and the site list
    js/siteimport.js      screenshot + boxes -> level (air/solid mask, clean background, armour and explosive blocks)
    js/menu.js            site picker, URL form, screenshot upload
    js/level.js           destructible pixel grid, collision, carving, scorch marks
    js/fire.js            fire that spreads across the page
    js/fx.js              pooled particles, sprites, rings, smoke, popups
    js/boom.js            explosions, impacts, barrels, screen effects
    js/zombies.js         zombie types, AI, waves, medkits
    js/player.js          stickman movement, dash, damage
    js/weapons.js         weapons, projectiles, railgun, airstrike, black holes
    js/render.js          drawing, chromatic split, page dimming
    js/hud.js             DOM HUD, banners, end cards
    js/main.js            input, game state, frame loop, adaptive quality
    server/netguard.js    URL rules and the private-address block list
    server/proxy.js       per-render filtering proxy (DNS pinning, byte caps)
    server/render.js      Playwright renderer with hard limits
    server/extract.js     in-page box extraction and server-side sanitising
    server/index.js       Express app, rate limit, concurrency cap, cache

## Tests

    npm test                    server unit + integration tests (SSRF, redirects, limits, HTTPS tunnel, rebinding)
    node tests/e2e-site.cjs     real server + fixture site + the game: paste a URL, play it, upload, error cases

Headless Playwright scripts for the game itself live in `tests/`:

    node tests/smoke.cjs        load, start, one rocket, console errors
    node tests/gallery.cjs      explosion timeline and every weapon
    node tests/scenes.cjs       zombies, barrel chain, end cards, mobile, reduced motion, audio
    node tests/playthrough.cjs 45 god    bot plays in real time and logs FPS
    node tests/stress.cjs       many blasts at once

Screenshots land in `tests/out/`.
