# Boost Ball

A browser car-soccer game: rocket-powered cars, a big bouncy ball, an enclosed arena with two goals,
bots, replays and goal explosions. Three.js draws it, Rapier (WebAssembly) handles collisions, and the
car handling is a port of RocketSim's numbers (an MIT-licensed open simulator of the original game's
physics, github.com/ZealanL/RocketSim).

## Play

- Hosted: open the published artifact link.
- Offline: open `boost-ball.html` (the single-file build) in Chrome. It needs no server.
- From source (needs Node 18+):

```
npm install
npm run dev      # dev server with hot reload
npm run build    # single self-contained file in dist/index.html
npm test         # physics checks against reference numbers
```

## What's in it

- Home screen with your car on a platform out on the pitch of the chosen arena: big Play button, Garage (studio view), Arenas, Settings, Controls, quick match and free play tiles, and a player card with your name, level and record (saved on this device). Esc goes back.
- 10 cars, each on one of the six hitbox shapes of the original game (Standard, Long, Flat, Wedge,
  Hybrid, Tall). Same engine for all; the hitbox changes how a car hits, turns and lands.
- 15 goal explosions to pick in the Garage (click one to preview it): Classic, Fireworks, Supernova, Shockwave,
  Inferno, Frost, Lightning, Black Hole, Confetti, Geyser, Rainbow, Voxel, Starburst, Meteor, Vortex.
  Bots get a random one each match.
- Accounts: log in with your claude.ai sign-in when the game is opened from its claude.ai link (progress
  saved online in your private folder of the artifact's database), or play as a guest (saved in this
  browser). The offline file always plays as a guest.
- Quests (three at a time) and Sport Drops: finish a quest or level up to get a drop. Drops hold 75
  items: 8 anthems, 6 cars, 6 goal explosions, 8 boosts, 7 ball skins, 6 paint colors, 6 paint finishes, 7 decals,
  7 player icons, 7 banners and 7 titles, in four rarities. Equip them in the Garage.
- Player anthems: a short tune that plays when you score, with its name in the corner. Kickoff Fanfare
  is free; 8 more come from Sport Drops (Neon Drive, Chip Champion, Drumline, Bass Drop, Victory Lap,
  Midnight Run, Overdrive, Golden Hour). All are synthesized in the browser from notes in
  src/audio/anthems.js. You can also upload your own song (Garage > Anthem): the game picks the
  loudest part, you move it and set the length (3-12 s), then save it. Uploads stay in this browser
  (IndexedDB), max 12 songs, 30 MB per file. Anthem volume is in Settings.
- Free play shows a goal replay too (skip it with jump). Training shots (1-4) start a fresh replay.
- Sky Field (home screen tile): free roam on a flat floor that never ends, under an open sky, with
  unlimited boost (toggle it with the usual key) and one ball. The scoreboard shows how far you are
  from the start. Keys 1-4 set up the ball like in Training; a ball left more than 1.2 km behind comes
  back to you. How it goes forever: every time the car gets 1 km from the middle, the game moves car,
  ball and camera back by whole kilometers (a "floating origin"). The floor pattern repeats every
  kilometer, so you cannot see the jump, and the numbers stay small enough for 32-bit physics.
- Goals are rounded inside: every inside edge and the back corners curve with a 1.5 m radius, so the
  ball rolls around the inside instead of dying in a corner. The rounding grows from zero at the goal
  line over the first 3 m, so the mouth stays a clean rectangle with no lip by the posts.
- The arena ceiling is drawn as hex glass with ribs every 12 m, and it glows where your car or the
  ball gets close.
- Online (home screen > Online): play other people who have the game open from its claude.ai link.
  Needs an online profile. Quick play (a queue per mode), create a match and share its 5-letter code,
  or join an open match from the list. 1v1, 2v2, 3v3; empty places are bots. How it works: every
  player's page runs its own car and shares its state about 30 times a second through the artifact's
  live "room"; the host's page runs the ball, the bots, the score and the clock and shares those.
  Other pages put each shared car where it should be now (moved forward by its age) and pull their
  ball toward the host's. If a player leaves, a bot takes over their car; if the host leaves, the
  match ends. Code: src/net/ (online.js lobby/queue/rooms, netplay.js match sync, codec.js).
- Players page (website): leaderboard by play time, goals or wins, name search, and each player's
  profile card (banner, icon, title, level), stats and last 25 matches. Supabase tables: `profiles`
  (public stats columns, readable by everyone, writable only by the owner) and `matches` (one row
  per finished match, readable by everyone, each player adds only their own).
- Goal replays show the scorer's banner card: name, title, icon, banner, level and shot speed.
- 5 arenas with the same field and physics: Aurora Arena (night), Solstice Park (day),
  Neon District (city night), Frostbite Bowl (snow), Dune Canyon (sunset).
- 1v1, 2v2, 3v3 against bots (Easy, Medium, Hard) or free play.
- Graphics presets from Lowest (for weak laptops) to High, plus Auto.
- Camera like the original's: ball cam turns to keep the ball ahead of the car, keeps the horizon
  level on walls, lets high balls ride up the frame and swings under the car for them, and eases in
  and out when toggled. Settings: FOV, distance, height, angle, stiffness, transition speed.

## Achievement items

These never come from Sport Drops. Stats count in finished matches (bots or online), not free play.

| Item | Type | How to get it |
| --- | --- | --- |
| Titan | Car | Win 50 1v1 matches |
| Phantom | Car | Score 500 goals |
| Monarch | Car | Win 100 matches |
| Hotshot | Car | Be #1 on any Players leaderboard (website); you keep it after dropping to #2 |
| Eclipse | Goal explosion | Make 150 saves |
| Thunderdome | Goal explosion | Demolish 100 cars |
| Afterburner | Boost | Play for 10 hours |
| Champion | Ball | Be the MVP 50 times |
| Molten | Paint | Win 25 2v2 matches |
| Spectrum Chrome | Finish | Win 25 3v3 matches |
| Hex Core | Decal | Get 100 assists |
| Trophy | Icon | Reach level 20 |
| Hall of Fame | Banner | Play 250 matches |
| Champion | Title | Win 50 matches |
| Goal Hunter | Title | Score 250 goals |
| Hat Trick Heroes | Anthem | Score 10 hat tricks |

Reset (R / Back) only works in free play and the Sky Field. Unlimited boost (B) works in free play, the Sky Field and online practice matches.

On the website, stats, achievement items and ratings are decided by the database (`supabase/002_server_stats.sql`): a match against bots is only saved if 285+ seconds passed since it started, per-match numbers are capped (goals can't be more than your team's score), achievement items you haven't earned are removed when your profile is saved, and nobody can write the stats tables directly.

## Ranked, practice and quick chat

- **Ranked** (website): quick play and normal online matches. Elo rating per mode, everyone starts at 1000, K = 32 (team average vs team average). Every player reports the final score; the score most reports agree on counts, a tie between different scores voids the match. Leaving early counts as a loss. Tiers: Bronze, Silver (900), Gold (1050), Platinum (1200), Diamond (1350), Champion (1500).
- **Practice**: the host picks it in the match lobby. Nothing counts (no rating, stats, XP or quests), unlimited boost allowed.
- **Quick chat** in online matches: 1 Nice shot!, 2 What a save!, 3 Great pass!, 4 Thanks!, 5 Sorry!, 6 gg (at most 3 messages per 5 s).

## Controls

Every keyboard and mouse control can be changed in Controls: click a box, then press a key or mouse
button (Esc cancels, Backspace clears). Two keys per action. Defaults:

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Drive | W A S D or arrows | Left stick, RT / LT |
| Jump, double jump, flip | Space or right mouse | A |
| Boost | Left Shift or left mouse | B |
| Powerslide | hold X | X |
| Air roll (hold: steer keys roll the car, like Q / E) | hold X | X |
| Air roll left / right | Q / E | LB / RB |
| Ball cam | C | Y |
| Unlimited boost | B | |
| Reset car | R | Back |
| Pause | P (Esc always) | Start |
| Fullscreen | F | |
| Free play: ball on hood / in front / shot at you / straight up | 1 / 2 / 3 / 4 | |

## Website

The game is one HTML file: `docs/index.html` is the built game, served by GitHub Pages
(Settings > Pages > Deploy from a branch > `main` / `docs`). To change it: edit `src/`, run
`npm install` and `npm run build`, then copy `dist/index.html` to `docs/index.html`.

On the website, profiles and online play use Supabase (project `boost-ball`, settings in
`src/net/backend-config.js`; the publishable key there is meant to be public). The database has one
table, `profiles` (id, name, data, updated_at), with row level security: each logged-in player can
read and change only their own row. Online play uses Supabase Realtime: Presence for who is in a
lobby or match, Broadcast for car and ball updates (12 a second per player, because the free plan
allows 100 Realtime messages a second for the whole project).

Opened as a claude.ai artifact, the same file uses claude.ai instead (artifact database and room).

## Code map

```
src/config.js            every tuning value (physics, camera, bots, arena, pads)
src/physics/             world setup, arena mesh, car (suspension, jumps, flips, air control, boost), ball, match sim
src/render/              renderer and quality presets, Sky Field (skyField.js), goal explosions (goalExplosions.js), stadium and arena themes, car kit and the 10 car designs,
                         showroom (home screen), ball, pads, effects, camera rig
src/net/                 online play: lobby, queue, match rooms, sync
src/meta/                items, quests, the account (online or guest), uploaded anthem storage
src/game/                game loop and match flow, bots, ball prediction, roles, replay buffer
src/input/, src/audio/, src/ui/   keyboard/gamepad, procedural sound, HUD, home screen and menus
tests/physics.test.mjs   50 checks: speeds, jump heights, flips, ball bounce, hits, demos, flip resets, all hitboxes
tests/meta.test.mjs      26 checks: item catalog, drop odds, no duplicates, quests, levels, saves
tests/flick.test.mjs     4 checks: musty flick (and its timing window) and a front flick launch the ball
tests/wall.test.mjs      4 checks: a ball rolled into the wall rides up it and stays on it
tests/goal.test.mjs      19 checks: shots into every part of the goal score and stay inside, rounded edges, no lip
tests/camera.test.mjs    34 camera checks: framing, floor clearance, turn rates, wall roll, toggle timing
tests/botmatch.mjs       headless bot-vs-bot match with stats: node tests/botmatch.mjs 2v2 medium hard 3
```

Physics runs at a fixed 120 ticks per second like the original; rendering interpolates between ticks.

## Credits

Made by Edvards Macs. Beta testers: Johannes Trædal and Adrian Naustvåg.
