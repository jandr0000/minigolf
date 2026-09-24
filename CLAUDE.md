# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run preview` — serve the production build

There is no test runner, linter, or type checker configured. Verify changes by running the dev server and playing the game.

[vite.config.js](vite.config.js) sets `base: './'`, so the build uses relative paths and runs from any sub-path. Files in `public/` are copied next to `index.html`; reference them through `import.meta.env.BASE_URL` (as `LETTER_URL` does), never with a leading `/`.

Deployment: [.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds on every push to `main` and publishes `dist/` to GitHub Pages. Everything in the repo, including `public/letter.pdf`, is then public.

Line endings are mixed, file by file: `main.js`, `holes.js`, `warzone.js`, `helicopter.js`, `effects.js`, `style.css` and this file are CRLF; the other `src/` files and `index.html` are LF. Keep each file's own endings, especially with multi-line find/replace scripts (a bare `\n` won't match in a CRLF file). In Git Bash, `grep -c $'\r$'` counts every line as CRLF and `sed -i` drops the CR from the lines it edits, so check with Python (`open(f, 'rb').read().count(b'\r\n')`) instead.

## Overview

"Mini Golf": a browser mini-golf game on two islands, a Spain-shaped island (holes 1-3) and a United Kingdom-shaped island (holes 4-7), built with vanilla JS (ES modules), Babylon.js (`@babylonjs/core`, tree-shaken named imports) and Vite. `earcut` is used for polygon triangulation. All geometry, textures and sounds are generated procedurally in code; there are no asset files.

## Architecture

**[src/main.js](src/main.js)** is the composition root and owns everything stateful: Babylon engine/scene/lights/post-processing, the ocean, both islands, the kid, the ball mesh, aim visuals, camera, HUD/DOM wiring, input, and the game loop. Other modules are factories that take `scene` and return plain objects. UI markup lives in [index.html](index.html) and is driven by id via `$('...')`; its styles are in [src/style.css](src/style.css).

- **Game state machine** (`game.state` in main.js): `overview → flying → aiming ⇄ dragging → rolling → sinking | holing → complete`. On the helicopter hole `holing` continues into `battle` before `complete`, and winning it lets `complete` continue into `transit` (the flight to the UK island) and back to `overview`. On the windmill hole `holing` continues into `brawl` (the ogre fight and, if won, the victory cinematic), then `letter` (the picture), then `complete`. Input handlers and `update()` branch on this; when adding behaviour, gate it on state.
- **Islands**: `game.island` (1 = Spain, 2 = United Kingdom) decides which overview is shown, which hole labels are visible and which island's shadow casters are used; `islands = {1: spain, 2: uk}` in main.js gives each island's `center`, `halfW`/`halfD`, `casters`, `kidSpot` and `update(t)`. `ISLANDS` holds each island's name, first hole and title text; `setTitle()`, `switchIsland()` and `toOverview()` keep the title panel in step. Island 2 unlocks when hole 3 is won (`unlockUk()`, stored in `localStorage` as `minigolf.uk`). The kid lives in `game.kidAt` (`'spain'` until the flight delivers him, then `'uk'`, stored as `minigolf.kid`); `placeKid(at)` puts him at that island's `kidSpot`.
- **Camera** is a `FreeCamera` with inputs cleared; `viewFor(mode)` computes a goal (`'overview'` for the current island, `'hole'`, the side-on `'battle'` view, `'follow'` which trails the friendly helicopter during the flight, or `'cinema'` which follows `brawl.shot` during the ogre-fight victory scene and only pulls back enough to fit `shot.halfW` on narrow screens) and `flyTo` tweens `camNow` toward it. Fog distance scales with camera distance in `applyView` so the far UK overview isn't washed out. `setShadowMode` swaps the shadow-caster list per mode (only the active hole's casters in hole view, only the current island in overview) for performance.
- **Hole 3 difficulty**: starting hole 3 (`startHole(h)` without a level) opens the `#difficulty` panel; picking Easy/Medium/Hard calls `startHole(h, level)`, which passes the level to `warzone.begin(level)` and shows it in the HUD.

**Render/perf choices** are deliberate: hardware scaling capped at 1.5× DPR, no MSAA, low-quality PCF shadows at 1024, FXAA + ACES tone mapping. The scene has two big islands, so the per-frame cost is dominated by how many meshes Babylon has to walk and draw:
- Only the island being viewed is enabled (`syncVisibility()` in main.js; both while flying between them). `setIslandEnabled` toggles the island root, each hole's `root` and `hole.nodes` (standalone roots such as bulls, palms and the Osborne plinth). Hidden islands and holes skip their `update()`.
- The overview shadow pass only uses `hole.overviewCasters` (structures, not trees or animals).
- Static scenery is merged with `mergeByMaterial` (geometry.js): the scattered palms/pines, the trees around each hole, the windmill's tower, the sheep's wool.
- When adding scenery, prefer a few merged meshes over many small ones, and make sure anything that should hide with an island is parented to its root or listed in `hole.nodes`.

**Holes are data-driven** in `HOLE_DEFS` ([src/holes.js](src/holes.js)). Each def uses local coordinates (x = tee→green, z = across) shifted by `origin` into world space.
- **Outline**: either `outline` (Catmull-Rom control points) or `outlinePoly()` (e.g. `roundedRectOutline`, or `ellipsePolygon` for the round bullring).
- **Optional fields (Spain)**: `ponds`, `palms`, `osborne` (static bull silhouette), `bulls` (moving), `wallColor`, `warzone` (marks the helicopter hole, see below), `surface: 'sand'` (bullring floor instead of striped grass), `arena: { tiers }` (builds stands, facade and spectators around a round outline via `buildArena`) with `extent` (how far the surroundings reach beyond the outline, used to keep scenery and camera framing clear).
- **Optional fields (UK)**: `island: 2`, `region`, `pines`, `dryWalls` (axis-aligned stone walls along z, given as `{x, z1, z2}`; no hole uses them now), `stones` (Stonehenge ring), `sheep` (same rig and AI as bulls, `species: 'sheep'`; no hole uses them now), `stadium: { home, away, tryX, postHalf, tiers }` (the rugby stadium around the outline, see below) with `players: [{ team, x, z, seed, carrier }]` (rugby players, each running across the pitch in the lane at its `x`), `windmill: { x, z }` (the Lytham mill: a solid circle on the fairway, see below), `brawl: { kidSpot, helperSpot }` (where the two kids wait, local coordinates) and `frame: { halfD, dz }` (overrides the hole camera framing so tall props stay in view).
- `flagStyle` picks the flag texture: `'spain'` (default) or `'uk'`. `playable: false` holes appear on the overview as "coming soon" (every def currently sets `playable: true`).
- **Placement**: Spain hole origins are plain world coordinates around the island centre; UK hole origins are computed with `at(lon, lat)` from [src/uk-shape.js](src/uk-shape.js). If you move a hole, check it still sits on land with a margin from the coast and does not overlap another (the footprint includes `extent`).
- `buildHole` builds all meshes and returns the hole object that main.js and physics consume: `outline`, `ponds` (polygons), `segs`, `circles`, `tee`, `cup`, `casters`, `waterMats`, `island`, `region`, `extent`, and `update(t, dt)`.

**Physics is 2D** on the x/z plane ([src/physics.js](src/physics.js)); the ball is `{x, z, vx, vz}` and y is purely cosmetic (`FAIRWAY_TOP`). `stepBall(ball, hole, dt)` substeps at 240 Hz, applies friction, cup pull, and collisions, and returns `null | 'cup' | 'water' | 'stopped'`.
- Static collision = `hole.segs`, line segments `[x1,z1,x2,z2]`, built from the outline plus obstacle footprints (e.g. the Osborne plinth).
- Moving collision = `hole.circles`, each `{x, z, r, vx, vz, kind, onHit}`; bulls expose these and update them each frame. A resting ball is still tested against circles so it can be bumped, and `update()` in main.js only steps a stationary ball when a circle is nearby.
- Water = point-in-polygon against `hole.ponds`. The cup is a hole cut into the grass/slab polygons (`polygonMesh(..., holes)`) and detected by distance.
- Physics tuning constants (friction, restitution, `MAX_SPEED`) live at the top of physics.js. Ball radius and cup radius are shared with geometry via `BALL_R` / `CUP_R`.

**Geometry helpers** ([src/geometry.js](src/geometry.js)): polygon utilities (`ensureCCW`, `offsetPolygon`, `pointInPolygon`, `segmentsOf`) and mesh builders (`polygonMesh` via earcut, `bandMesh` for walls/lips, `plateMesh` for extruded silhouettes). Polygons are arrays of `{x, z}`; mesh builders expect CCW winding, so pass outlines through `ensureCCW`.

**Obstacles/props**: [src/bull.js](src/bull.js) is an animated wandering bull (or sheep, via `species`) with simple AI (uses a `world` object with `walkable`, `others`, `ball` supplied by `buildHole`; `walkable` avoids the `blockers` rectangles of the Osborne plinth and dry walls). Static stones use plain `hole.circles`, dry walls add segments to `hole.segs`. [src/rugby.js](src/rugby.js) is hole 5, a rugby stadium where The Saints (home, tee end) play The Leopards (away, cup end), both defined in `TEAMS`:
- `createStadium` builds the pitch lines, padded H posts on both try lines (their uprights are static `kind: 'post'` circles and player `blockers`), three tiers of stands with thin-instanced fans (home fans on the tee half) doing a Mexican wave in `update(t)`, four floodlights and a scoreboard above the far stand.
- `createRugbyPlayer` runs across the pitch between the touchlines in his lane, pauses, and runs back. It has the bull interface (`x`, `z`, `root`, `meshes`, `circles`, `update`), so `buildHole` puts players in `hole.bulls`. His circle is `kind: 'bull'`, `species: 'player'`, so main.js plays `sfx.oof()` when the ball hits him. Kit colours are vertex colours on one shared material, so a player is five meshes.
- Hole 5 has six players, three a side. In a headless simulation a perfect full-power straight putt from the tee was knocked off line 58% of the time with six players and 36% with four. [src/osborne.js](src/osborne.js) extrudes the SVG-path silhouettes in [src/osborne-shape.js](src/osborne-shape.js) into a static plate; `pathToPolygon` only supports `M`, `L`, `C`, `Z` path commands. [src/palm.js](src/palm.js) builds animated palms.

**Helicopter hole (hole 3)** is driven by [src/warzone.js](src/warzone.js), created once in main.js for the hole whose def has `warzone: { hatch: [x, z] }`. It owns a phase machine `idle → arrive → patrol → intro → fight → won | lost → done` and talks to main.js only through callbacks (`onBlast`, `onShake`, `onMessage`, `onEnd`), a `hud` object and a mutable `input`. main.js calls `warzone.begin()` from `startHole`, `warzone.update()` every frame (with `canBomb` true only while aiming/dragging/rolling), `warzone.startBattle()` when the ball drops, and `warzone.reset()` on `startHole` and `toOverview`.
- **Difficulty** (`DIFFICULTY` in warzone.js: `easy`/`medium`/`hard`) only changes the bombing run: first-bomb delay, interval between bombs, red-marker warning time, slide speed, bomb gravity (fall speed), max bombs in the air and how often targets lean on the ball-to-cup line. `begin(level)` selects it.
- **Bombing**: during golf the enemy hovers and drops bombs: a red marker warns first, then the bomb lands, spawns a crater and shoves a nearby ball via `blast()`. Craters are pushed onto `hole.circles` (`kind: 'crater'`) so the normal circle physics bounces the ball off them.
- **Battle**: after the cup, a trap door opens and the friendly helicopter rises. The fight is a 2D side-scroller in the vertical plane `z = hole.center.z`; the camera switches to the `'battle'` view. Controls: arrows/WASD or pointer drag to move, Space (or the on-screen Fire button) to shoot. Enemy win ends in `failBattle()`, and "Restart hole" simply calls `startHole` again.
- **Victory flight**: after the win (`phase === 'done'`), `depart(route)` runs `transit`, a list of legs (`approach → land → board → lift` when the kid still waits in Spain, then `cruise → land → spool → deplane`).
  - `route = { pickup, kid, pad, kidSpot, onLanded }`; `pickup` is null once the kid is already in the UK.
  - Legs are plain objects (`to`, `dur`, `hold`, `tick`, `until`, `rotor`, `landK`, `focusDx`...) driven by `updateTransit`.
  - The kid boards by walking to a door point, hopping into `ally.cabin` (a node exported by helicopter.js); `deplane` reverses it. The phase then becomes `parked` and `onLanded` fires.
  - The parked helicopter is left in place (main.js only calls `warzone.reset()` when the phase isn't `parked`, or when hole 3 starts again).
  - `allyPos` (with `focusDx`) and `landK` feed the `'follow'` camera.
- [src/helicopter.js](src/helicopter.js) builds the gunship (`livery: 'enemy' | 'ally'`), merging rigid parts by material; local +x is the nose. Tuning constants (HP, damage) sit at the top of warzone.js.

**Islands.** Both are built from coastline polygons by [src/island-map.js](src/island-map.js) (`createLandmasses`: painted map texture with coloured zones and a beach ring, sandy body, blurred turquoise shallows plane).
- **Spain** ([src/spain-island.js](src/spain-island.js), data in [src/spain-shape.js](src/spain-shape.js)) is centred on the world origin (about 13 km per unit; the Portuguese border is drawn as coast) and scatters palms; `KID_SPOT` and `LANDING_SPOT` are where the kid waits and the helicopter lands.
- **United Kingdom** ([src/uk-island.js](src/uk-island.js), [src/uk-shape.js](src/uk-shape.js)) uses rough lon/lat points scaled by `KX`/`KZ` and smoothed with `chaikin` (Northern Ireland and two small isles included). It sits at world x≈170-265, z≈-66-75, east of Spain, so the helicopter flies east along the fight plane. `ukWorld(lon, lat)` converts map coordinates to world x/z; `UK_PAD` is the helipad, just north of Lytham St Annes (derived from hole 7's position, clear of its pines).
- [src/uk-props.js](src/uk-props.js) has `createPine`, `createStoneRing`, `createDryWall` and `createHelipad` (exposes `x`, `z`, `top` for landing).
- [src/kid.js](src/kid.js) is the kid (idle wave, walk cycle, `hop`, `sit`/`unseat`, `reset`).

**Windmill hole (hole 7, Lytham St Annes)** is played like any hole (the mill is a static circle in `hole.circles`), but sinking the ball starts an ogre fight.
- **Models**: [src/windmill.js](src/windmill.js) builds the Lytham-style mill (white tapered tower, black cap, lattice sails facing the camera, a door whose leaves open with `windmill.door.open(k)`); [src/ogre.js](src/ogre.js) is the ogre model, driven by plain properties (`walk`, `armTarget`, `roar`, `dead`, `hurtT`, `heading`).
- **Fight**: [src/brawl.js](src/brawl.js), created once in main.js like the warzone. It runs top-down on the fairway (same hole camera): phases `idle → intro → fight → dying → gather → cheer → look → hug → done | lost`.
  - The player kid is steered with arrows/WASD or pointer drag and swings his golf club with Space (or the on-screen Swing button, which is the Fire button relabelled through `battleHud.setLabels`); a second kid (`helper`, blond) runs in over the wall and throws stones on his own.
  - The ogre telegraphs every attack with a red marker (club slam circle, charge lane) and is more vulnerable after them.
  - Swing hit timing and the helper's throws are timed inside `brawl.update` (not by the render-frame animations), so the fight can be fast-forwarded.
- **Victory cinematic**: after `dying`, brawl.js calls `onCinema()` and main.js flies to the `'cinema'` camera, which follows `brawl.shot`. brawl.js eases the shot toward a goal set with `aim()` in each phase. The kids walk round the mill to a spot in front of its door (`gather`), face the camera and jump with their arms up (`cheer`, names on the chest in view), turn round and point at the door (`look`, names on the back), then hug (`hug`). There are no hearts in the hug. Timings and hug reach are constants at the top of brawl.js.
- **Ending**: after the hug main.js shows the `#letter` overlay, an `<iframe>` showing the PDF `public/letter.pdf` (currently a generated placeholder with an "open the PDF" fallback link; replace the file with the real letter; `LETTER_URL` in main.js); "Continue" then calls `finishHole`. Losing shows the fail panel via `failBattle(title, sub)` and "Restart hole" calls `startHole` again, which re-stages everything.
- **Staging**: the main kid and the helper are staged next to the fairway when hole 7 starts and put back by `unstageBrawl()` when the hole is left.
- **Kids**: [src/kid.js](src/kid.js) takes options (`label`, `hair`, `shirt`, `shorts`, `weapon`, `height`). The story kid is Hector (brown hair, red shirt) and the helper is Tate (yellow hair, green shirt, `height: 1.22`, a head taller). Each has his name printed on the shirt by curved cylinder-arc decals textured in `nameMaterial`: the bigger decal (y 0.84) is on the back, the smaller (y 0.94) on the chest. `NAME_TURN` is a measured correction that centres both, so re-check front and back on screen if you change the arcs. There is no balloon. Poses: `setCombat`, `swing`, `hurt`, `setHug(on, reach)`, `setDown`, `setPose('cheer' | 'point' | null)`.

**Materials/effects/audio**: [src/materials.js](src/materials.js) has procedural canvas textures (`DynamicTexture`) and a custom water `ShaderMaterial`; water materials need `time` and `camPos` set every frame (main.js does this for the ocean and each `hole.waterMats`). [src/effects.js](src/effects.js) is particles (splash, confetti, explosion, sparks, puff). [src/audio.js](src/audio.js) synthesizes sfx with WebAudio; `unlockAudio()` must be called from a user gesture. `sfx.rotor(volume, rate)` is a looping rotor sound, `volume` 0 stops it.

## Debugging

`window.__mg` exposes `scene`, `camera`, `game`, `ball`, `holes`, `startHole`, `toOverview`, `launch`, `speedOf`, `hole`, `warzone`, `blast`, `flyTo`, `sfx`, `spain`, `uk`, `islands`, `kid`, `helper`, `ogre`, `brawl`, `brawlHole`, `showLetter`, `unlockUk`, `switchIsland`, `startTransit`, `DIFFICULTY` and `snap()` (skips the camera tween).

Shortcuts:
- `__mg.unlockUk(); __mg.switchIsland()` jumps to the UK island.
- `__mg.startHole(__mg.holes[2], 'hard')` starts hole 3 at a level without the panel.
- `__mg.warzone.winNow()` (during the fight) destroys the gunship so the victory flight can be tried. To watch the flight in a slow headless browser, fast-forward with `__mg.warzone.update(0.05, t, { ball: __mg.ball, canBomb: false })` in a loop.
- Ogre fight: start it with `__mg.startHole(__mg.brawlHole)` then `__mg.game.state = 'brawl'; __mg.brawl.start()`; fast-forward with `__mg.brawl.update(0.05, t)`; `__mg.brawl.winNow()` wins it; `__mg.brawl.debug` exposes the kid, helper and ogre state.
- The unlock and the kid's location are stored in `localStorage` (`minigolf.uk`, `minigolf.kid`), so clear them to test a fresh game.
