# Discount Demolition 2

A browser game: a stickman wrecks a website with nine weapons while a zombie horde chases him.
Everything is original: art, sounds (all synthesised with Web Audio) and copy.

## Run it

Phase 1 needs no build step and no server. Open `index.html` in a browser, or serve the folder:

    python3 -m http.server 8080      # then open http://localhost:8080

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

## Code layout

    index.html, css/style.css
    js/core.js            shared namespace, constants, global state
    js/audio.js           Web Audio synthesis
    js/site-megasave.js   the built-in parody page, drawn with canvas calls
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

## Tests

Headless Playwright scripts live in `tests/` (they need `playwright` installed):

    node tests/smoke.cjs        load, start, one rocket, console errors
    node tests/gallery.cjs      explosion timeline and every weapon
    node tests/scenes.cjs       zombies, barrel chain, end cards, mobile, reduced motion, audio
    node tests/playthrough.cjs 45 god    bot plays in real time and logs FPS
    node tests/stress.cjs       many blasts at once

Screenshots land in `tests/out/`.
