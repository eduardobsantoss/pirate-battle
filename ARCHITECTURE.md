# Architecture

This document describes how Pirate Battle is put together and why. Paths are relative to `src/`.

## 1. Layers and responsibilities

```
┌───────────────────────────── React (ui/) ─────────────────────────────┐
│ Menu · Options · Result · HUD · Pause dialog · Touch buttons          │
│        ▲ useSyncExternalStore (low-frequency snapshot)                │
└────────┼──────────────────────────────────────────────▲───────────────┘
         │                                              │ InputState.set()
┌────────┴──────────── GameController (game/) ─────────┴───────────────┐
│ Pixi Application · fixed-step loop · pause/blur · resize · lifecycle  │
│      │ step(dt, controls)            │ sync(sim, alpha)               │
│ ┌────▼──────────────┐         ┌──────▼──────────────┐  ┌───────────┐ │
│ │ Simulation (sim/) │ events ▶│ GameRenderer        │  │ Input     │ │
│ │ pure TS, seeded   │────────▶│ (render/) Pixi only │  │ (input/)  │ │
│ └───────────────────┘         └─────────────────────┘  └───────────┘ │
└───────────────────────────────────────────────────────────────────────┘
┌──────────── api/ (TanStack Query + Axios) ────────────┐  ┌──── mocks/ (MSW) ────┐
│ contracts · client · queries · submission outbox      │─▶│ handlers · db · sc.  │
└───────────────────────────────────────────────────────┘  └──────────────────────┘
```

| Concern | Where | Depends on |
|---|---|---|
| Game rules, AI, collisions, scoring, timers | `game/sim/*` | config, math, rng only |
| Rendering, effects, textures | `game/render/*` | Pixi, reads the simulation |
| Input (keyboard / touch) | `game/input/*`, `ui/game/TouchControls.tsx` | — |
| Match orchestration and lifecycle | `game/GameController.ts` | all of the above |
| Interface state (screens, forms, dialogs) | `ui/*`, `App.tsx` | React |
| Remote state | `api/*` | TanStack Query, Axios |
| Mock backend | `mocks/*` | MSW |

The simulation never imports Pixi, React or the DOM. That's why it can be unit-tested in Node (`sim/Simulation.test.ts`) and replayed deterministically from a seed.

## 2. React ↔ PixiJS integration

- `ui/game/GameScreen.tsx` loads textures first, then mounts `<Match>`. Its effect creates a `GameController`, calls `mount(host)` and returns `destroy()`.
- **Strict Mode safe.** React mounts, unmounts and remounts effects in development. `mount()` is async (`Application.init`), so `destroy()` can run before `init` resolves. The controller records `destroyed = true`, and when `init` finishes it destroys the fresh application immediately instead of attaching it. Every match also creates its own controller, so remounts never share state. Restart and *Play Again* simply re-key `GameScreen`.
- **No React render per frame.** The continuous state (positions, projectiles, cooldowns) lives in the simulation. The controller publishes a small `GameSnapshot` (phase, score, health, whole seconds left, end reason) to a `Store` only when a field changes. React subscribes with `useSyncExternalStore`, so the HUD re-renders about once per second and on score or health changes.
- **Input without React state.** Touch buttons and keyboard listeners write directly into `InputState` (a set of pressed controls per source). The simulation reads one merged `ShipControls` snapshot per step.
- **Canvas sizing.** `Application` uses `resizeTo: host`, `autoDensity: true` and `resolution = min(devicePixelRatio, 2)`. On each resize, `layout()` scales the world container uniformly to fit the arena and letterboxes it. The world aspect ratio and the arena limits never change, and game coordinates stay in world units regardless of screen size. On-screen controls are DOM buttons, so there is no screen→world input mapping to get wrong.

## 3. Simulation loop

- **Fixed timestep** of `STEP_MS = 1000/60` with an accumulator (`GameController.onTick`). Frame time is clamped to 100 ms, so a long stall never makes a burst of steps. Movement, cooldowns, projectile travel, spawn timers and the match clock all use `dt`, so behaviour is independent of the display rate.
- **Interpolation.** Each entity keeps its previous pose, and the renderer interpolates with `alpha = accumulator / STEP_MS`. Motion stays smooth at 120/144 Hz without changing the rules.
- **Step order** (`Simulation.step`): store previous poses → match clock → player movement → enemy AI and movement → cooldowns → player weapons → shooter fire → ship collisions (chaser rams, separation) → projectiles (hits, islands, range, bounds) → spawner → remove dead → end check.
- **End of match.** When health reaches 0 (`death`) or time runs out (`time`), the status becomes `ended` and `step()` returns early from then on. Movement, attacks, damage, spawns and scoring all stop. Remaining projectiles are cleared, and a player killed mid-step stops projectile processing for the rest of that step, so no points are awarded after death.
- **Pause** stops stepping and resets the accumulator. Input is disabled and cleared on pause and re-enabled on resume, so keys held or pressed during the pause have no effect. Resuming needs an explicit action (button, `P`/`Esc`). Auto-pause triggers on `window.blur` and `visibilitychange → hidden`.
- **Determinism.** All gameplay randomness (spawn type after the opening sequence, spawn positions) comes from a seeded mulberry32 RNG (`game/rng.ts`). Cosmetic randomness, like picking a sound variant, uses `Math.random`, which never affects gameplay.
- **Test clock.** With `?clock=manual`, the ticker is stopped and `advance(ms)` runs the same `stepOnce()` and renders one frame. Tests control time but go through the real rules, input and rendering.

## 4. Gameplay systems

- **Player.** Forward thrust with acceleration and deceleration, rotation in both directions, a front cannon (1 ball) and two independent broadsides (3 parallel balls, spread along the hull). Each weapon slot has its own cooldown.
- **Enemies.**
  - *Chaser*: always steers towards the player. On contact it damages the player and is destroyed, without scoring.
  - *Shooter*: approaches until `preferredDistance`, then holds position and keeps turning to aim. It fires when within `attackRange` and its heading is within `aimTolerance` of the target.
  - Both share the same physics (turn rate, acceleration, island collision) and take damage from player projectiles.
- **Obstacle avoidance.** For the desired heading, the AI probes a fan of angular offsets (0, ±0.4, ±0.8 … rad) with two look-ahead points. It picks the first heading whose probes don't hit an island or the arena edge, which handles going around islands cheaply.
- **Spawner.** The first spawn waits `initialDelaySec`, then one spawn happens every `intervalSec` until the match ends. The first spawns follow `openingSequence` (`chaser`, `shooter`), so both types appear in every match; after that, spawns use the configured weights. Spawn points are chosen near the arena edges. A point is rejected if it's inside or near an island, overlaps another ship, or is closer than `minDistanceFromPlayer`; the distance is relaxed to 75% and then 50% if nothing fits after 40 attempts. If even that fails, the spawn is skipped rather than placed unfairly. `maxAlive` caps simultaneous enemies.

## 5. Collisions

- **Shapes.** Ships are circles. Islands are axis-aligned rectangles taken from their tile bounds, inset by 10 px because the art has soft transparent borders. The arena is the world rectangle.
- **Ship vs island/arena.** `Obstacles.resolve` pushes the circle out along the shortest separation vector, in two passes for corner cases, then clamps it inside the arena. Scraping an island bleeds 10% speed.
- **Ship vs ship.** Overlapping circles are separated symmetrically. Chaser vs player is a special case: contact means damage, then the chaser explodes.
- **Projectile vs ship.** A circle-vs-circle check against the opposing team. The projectile is marked dead on its first hit, so damage applies exactly once.
- **Projectile removal.** A projectile is also removed when it hits an island, leaves the arena or exceeds its range. Dead entities are filtered out at the end of the step and never collide, shoot or deal damage again.
- **Tunnelling.** At 60 Hz the fastest ball moves ~9 px per step, against a minimum combined hit radius of ~27 px, so no swept tests are needed.

## 6. Rendering and resource management

- **Textures.** `render/assets.ts` loads every texture the match needs once (ships for 3 colours × 4 damage stages, tiles, cannon ball, effects, health bars) through `Assets.load`, with progress reporting. The *retina* variant is used when `devicePixelRatio ≥ 1.5`, with the texture resolution set to 2. Textures are cached for the session and reused by every match. On failure the promise rejects, and the loading screen shows an error with a **Retry** button. Retries cache-bust the URLs because Pixi memoizes failed requests. Combat never starts with missing assets.
- **Main-thread decoding.** `loadTextures.config.preferWorkers = false` makes every asset request go through the page, which keeps failures observable through MSW and in tests. The cost is a one-off decode of ~40 small PNGs at load time.
- **Health bars** use the UI atlas `fill_rect` metadata. The fill is a cropped sub-texture, quantized to 40 steps and cached, so no textures are created per frame.
- **Damage visuals.** The ship sprite swaps by damage stage (>66%, >33%, below). Fire sprites flicker on damaged hulls, the hull flashes red on a hit, and a sinking wreck plus an explosion sequence plays on destruction. Muzzle flashes, impact bursts and splash rings are short-lived effects in `render/effects.ts`.
- **Pooling.** Projectile sprites are pooled (hidden and reused). Ship views are created and destroyed per entity, which is low frequency.
- **Teardown** (`GameController.destroy`, idempotent): remove the keyboard, blur, visibility and resize listeners, clear input, remove the ticker callback, destroy the renderer's display tree and effects, then `app.destroy(removeView, { children: true, texture: false })`. That frees the WebGL context and canvas. Shared textures are kept on purpose. Pending result timers are cleared by the React effect. The profiling run checks that no canvas is left after each cycle.

## 7. Local persistence

All keys are prefixed `pirate-battle:` (`storage/local.ts`). Every read and write is wrapped in `try/catch`, so blocked storage only disables persistence.

| Key | Content |
|---|---|
| `options` | Player options (sanitized on read) |
| `player` | Local player id + display name |
| `last-result` | Last **completed** match (shown on menu and after refresh) |
| `pending-submissions` | Outbox of completed matches not yet confirmed |
| `confirmed-submissions` | Recently confirmed match ids |
| `mock-db`, `mock-scenario`, `mock-asset-failure` | Mock backend state (MSW) |

A match in progress is never persisted. Reloading or leaving the match screen abandons it, and an abandoned match never reaches the ranking or history. The result screen is restored after a refresh through a per-tab `sessionStorage` flag.

## 8. Ranking & match history integration

### Contracts (`api/contracts.ts`)

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/ranking?page&pageSize&sessionDurationSec&spawnIntervalSec` | — | `Page<RankingEntry>` |
| `GET /api/players/:playerId/matches?page&pageSize` | — | `Page<MatchRecord>` (newest first) |
| `POST /api/matches` (`Idempotency-Key: matchId`) | `MatchRecordInput` | `201 {record, created:true}` or `200 {record, created:false}` |

Each record contains the match id (generated by the client), player id and name, date, score, effective duration (active time, pauses excluded), end reason and the config used.

**Ranking rules.** Only matches with the same `{sessionDurationSec, spawnIntervalSec}` are compared; the tab shows the player's current settings. Order: score ↓ → duration ↓ (survived longer) → `playedAt` ↑ (reached first) → `matchId` ↑. This is fully deterministic. Ranking and history are views of the same records, so they're always consistent.

### Client

- **Axios** (`api/client.ts`): a shared instance with a timeout (8 s, `?apiTimeout=` for tests). Errors are normalized into `ApiError` (`timeout`, `network`, `client`, `server`, `cancelled`) so the UI and retry policy don't depend on Axios internals.
- **TanStack Query** (`api/queries.ts`):
  - Each page and config has its own cache key (`['ranking', duration, interval, page]`, `['history', playerId, page]`).
  - `staleTime: 0` plus refetch on mount and window focus: showing a tab again revalidates it in the background while cached data stays on screen (an *Updating…* badge appears).
  - `keepPreviousData` avoids flicker while paginating.
  - Retries happen only for transient errors (timeout, network, 5xx, 429), twice, with exponential backoff. 4xx errors fail fast.
  - Loading, empty, error (with *Try again*) and "refresh failed, showing saved results" states are all handled.
- **Late responses.** Every query passes its `AbortSignal` to Axios, so superseded requests are aborted. Data is stored per key, and the pager follows the page the user requested, so a slow response for an older page can't replace newer data. The `out-of-order` scenario tests this.

### Submission outbox (`api/submissions.ts`)

1. When a match ends, the record is written to `last-result` and appended to the persisted **outbox** before any network call.
2. `SubmissionSync`, mounted once at the root, sends every due record through a TanStack **mutation**. That happens on startup (recovering records left after a refresh), whenever a record is queued, and on the `online` event.
3. `markInFlight(matchId)` makes repeated clicks or syncs no-ops while a request is in flight.
4. On success (201 or 200), the record leaves the outbox, its id is remembered as confirmed, and both `['ranking']` and `['history']` are invalidated, so both tabs refresh.
5. On final failure, the record stays in the outbox. The result screen shows **Not saved yet** + **Retry**, and Match History shows a pending banner with **Retry now**. Playing another match is never blocked.
6. **Idempotency.** The server deduplicates by `matchId`. If a request timed out after the server stored the record (`submit-timeout`), the retry gets `200 created:false` with the existing record. There is exactly one history entry and one ranking entry per match.

API failures never block the game. The mock API starts before React renders, but if it fails to start the app still renders and only the tabs show errors.

## 9. MSW

- `mocks/handlers.ts` defines the three endpoints plus the asset-failure passthrough.
- `mocks/db.ts` is the persisted mock database, with ranking and history queries and idempotent insert.
- `mocks/fixtures.ts` builds 54 deterministic records from 14 captains across three configs (seeded RNG, fixed dates).
- `mocks/scenarios.ts` holds the scenario registry, URL and panel selection, and the latency control.

The same handlers, fixtures and contracts are used in development, in the Playwright suite (against the production build) and on the deployed site. Gameplay randomness is seeded; mock latency is fixed with `?latency=` and the `variable-latency` scenario uses its own seeded RNG.

## 10. Accessibility

- Every menu is reachable by keyboard, with visible `:focus-visible` outlines. The tabs follow the WAI-ARIA pattern (arrow keys, `aria-selected`).
- Dialogs use native `<dialog>.showModal()` (focus contained, `Esc` handled, focus restored on close). The initial focus goes to the primary action.
- Form fields have labels, hints (`aria-describedby`) and `aria-invalid`. Errors use `role="alert"`, and on submit, focus moves to the first invalid field.
- A visually hidden *Match status* region exposes status, score, health and time as semantic text. A polite live region announces only meaningful events (pause and resume, score changes, 30 s and 10 s left, match over), never every frame or every second.
- The canvas is `aria-hidden` because all its information is mirrored in the semantic region. `prefers-reduced-motion` disables UI transitions.

## 11. Balancing decisions

- **Player.** 100 HP. The front cannon (20 dmg, 450 ms) is the main weapon. Broadsides (3 × 15 dmg, 1.4 s per side) reward positioning: a full broadside (45 damage) plus one front hit sinks a Shooter (50 HP).
- **Chasers** are fast and fragile (30 HP, 135 px/s): two front hits or one broadside. A ram costs the player 15 HP, so ignoring seven chasers is fatal.
- **Shooters** are slow (100 px/s) and tankier (50 HP). They deal 8 damage every 1.8 s from 400 px, so the player is pushed to keep moving or hunt them down.
- **Spawning.** Spawns keep at least 380 px from the player, and since chasers need about 2.5 s to arrive, there is always time to react. The default 3 s interval with `maxAlive = 8` keeps the arena busy without flooding it. These values were lowered after profiling showed an aim-only autopilot sinking in under 30 s with harder settings.
- The arena is 1344 × 768 world px (21 × 12 tiles of 64 px). It is always fully visible, and five islands create cover and choke points without blocking navigation.

## 12. Known limitations

- On small phones the whole arena is scaled down to stay fully visible (as the spec requires), so ships are small. There is no zoom or camera follow.
- Island colliders are rectangles. The rounded sand corners are approximated, so a ship can stop a few pixels away from the drawn shore at the corners.
- Obstacle avoidance is local (look-ahead probes, no path-finding). In rare cases an enemy can slide along an island for a moment before getting around it.
- Audio is optional feedback: sounds decode after the first user gesture, and a sound that hasn't loaded yet is simply skipped.
- Headless Chromium renders WebGL in software, so the E2E suite drives the clock manually. Real-time FPS figures come from `npm run perf` (see `reports/performance.md`).
- The mock backend lives in the browser's `localStorage`: "other players" are fixtures, and data is per browser.
