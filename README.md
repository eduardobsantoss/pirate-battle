# Pirate Battle

A top-down 2D naval shooter built with **React**, **TypeScript (strict)** and **PixiJS**. Sail between islands, sink enemy ships and climb the ranking before the clock runs out.

**▶ Live demo: https://pirate-battle-flame.vercel.app**

| | |
|---|---|
| Rendering | PixiJS 8 (WebGL) |
| UI | React 19 |
| Remote state (ranking / history) | TanStack Query 5 + Axios |
| Mock backend | MSW 3 (also in the published build) |
| Tests | Playwright (E2E + visual regression), Vitest (simulation unit tests) |
| Build | Vite 8 |

The original challenge statement is in [docs/CHALLENGE.md](docs/CHALLENGE.md). Architecture and design decisions are in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Setup

Requirements: **Node.js ≥ 20** (developed with Node 22) and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:5173. No environment variables or external services are required. The ranking/history API is mocked by MSW in the browser.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with HMR |
| `npm run build` | Type-check (`tsc -b`) and production build to `dist/` |
| `npm run preview` | Serve the production build on http://localhost:4173 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript project references, no emit |
| `npm run test:unit` | Vitest unit tests for the simulation |
| `npx playwright install chromium` | One-time browser download for Playwright |
| `npm run test:e2e` | Playwright suite (builds + previews automatically) |
| `npm run test:e2e:update` | Re-generate visual baselines |
| `npm run test:e2e:report` | Open the last HTML report (`reports/playwright/`) |
| `npm run perf` | 3-minute profiling run + memory cycles → `reports/performance.md` |

### Environment variables

None are required. Everything that changes runtime behaviour is controlled with URL parameters (see [Testing & failure reproduction](#testing--failure-reproduction)). `BASE_URL` from Vite is honoured if the app is served from a sub-path.

---

## How to play

Sink enemy ships to score **1 point each**. The match ends when the timer reaches zero or your ship is sunk.

| Action | Keyboard | Touch |
|---|---|---|
| Sail forward | `W` / `↑` | ⬆ button |
| Turn left / right | `A` / `←`, `D` / `→` | ↶ / ↷ buttons |
| Front cannon (1 ball) | `Space` | center fire button |
| Left broadside (3 balls) | `Q` | left fire button |
| Right broadside (3 balls) | `E` | right fire button |
| Pause / resume | `P` / `Esc` | ⏸ button |

You can sail, turn and fire at the same time, on both keyboard and touch (multi-touch). Game keys are only captured while a match is running and not paused.

**Enemies**
- **Chaser** (green sails): rams you and explodes on impact. A ram doesn't score.
- **Shooter** (red sails): closes in and fires when you're in range.

**Pause.** The game pauses automatically when the window loses focus or the tab is hidden. Resuming always takes a player action. While paused, the timer, cooldowns, spawns and the whole simulation are frozen, and inputs from that period are discarded.

**Mobile.** Landscape orientation is supported. In portrait, a "rotate your device" message is shown during matches. Menus work in both orientations.

---

## Gameplay configuration

All balancing lives in a single typed object, [`src/game/config.ts`](src/game/config.ts) (`DEFAULT_CONFIG`). Systems read only from it, so tuning never touches game logic:

- match duration;
- spawn interval, initial delay, minimum distance from the player, max alive enemies, chaser/shooter weights, opening sequence;
- per ship: health, speed, acceleration, turn rate, collision radius;
- per weapon: damage, projectile speed, range, cooldown, broadside count and spacing;
- Shooter attack range, preferred distance and aim tolerance;
- chaser contact damage.

The **Options** screen exposes two parameters. They are validated, stored in `localStorage` and survive a refresh.

| Option | Range | Step | Default |
|---|---|---|---|
| Game session time | 60–180 s | 10 s | 120 s |
| Enemy spawn time | 1–10 s | 0.5 s | 3 s |

Each match takes a frozen snapshot of the config when it starts (`createMatchConfig`). Changing options affects only the next match.

---

## Mock network scenarios

Ranking and match history are served by MSW handlers ([`src/mocks`](src/mocks)) backed by a mock database persisted in `localStorage` and seeded with deterministic fixtures of other captains.

**Selecting a scenario.** Use the **Network** button at the bottom-right of every menu screen, or the `?scenario=<id>` URL parameter. The choice is persisted until changed.

| Scenario id | Behaviour |
|---|---|
| `success` | Default. Normal latency (250 ms) |
| `empty` | Ranking and history return empty pages |
| `slow` | 2.5 s latency |
| `variable-latency` | Seeded random latency of 0.2–3 s |
| `out-of-order` | Alternating 2.5 s / 0.2 s delays, so later requests resolve first |
| `timeout` | Every request hangs until the client times out |
| `network-error` | Connection failure |
| `server-error` | HTTP 500 |
| `bad-request` | HTTP 400 |
| `ranking-error` | Only ranking fails (503) |
| `history-error` | Only history fails (503) |
| `submit-timeout` | The server **stores** the match but the response times out |
| `submit-unavailable` | Submitting a match fails with 503 |

The panel also has **Fail game asset loading**, which makes ship textures fail so you can see the load error and retry flow (URL: `?failAssets=ship_`).

**Reset.** *Network → Reset mock data & scenario* restores the fixtures, clears pending and confirmed submissions, and switches back to `success`.

---

## Testing & failure reproduction

```bash
npx playwright install chromium   # first time only
npm run test:e2e                  # desktop + mobile Chromium, HTML report in reports/playwright/
```

The suite runs against the **production build** (`vite build && vite preview`). Each test runs in a fresh browser context, with empty storage. Failures keep a trace, a video and a screenshot in `test-results/`. Open a trace with `npx playwright show-trace <trace.zip>`.

Test instrumentation is enabled by URL parameters, so it also works on the deployed build:

| Param | Effect |
|---|---|
| `e2e=1` | Exposes `window.__pirate` (read-only state snapshot, clock control) |
| `seed=<n>` | Deterministic match (spawn positions and types) |
| `clock=manual` | The simulation only advances through `__pirate.advance(ms)`. Rules, input, collisions and rendering run normally |
| `latency=<ms>` | Fixed mock latency (tests use `0`) |
| `apiTimeout=<ms>` | Axios timeout (default 8000; tests use 1000) |
| `scenario=<id>` | Mock network scenario |
| `failAssets=<text>` | Fail asset requests whose URL contains `<text>` |

**Reproducing failures by hand** (on the live URL or locally):

- *Ranking error and retry:* `/?scenario=ranking-error`, then switch to `success` in the Network panel and press **Try again**.
- *Pending submission recovered after refresh:* `/?scenario=submit-unavailable`, finish a match (result shows **Not saved yet**). Choose `success` and reload: the record is sent automatically and shows up once in Match History.
- *Timeout after the server saved the match:* `/?scenario=submit-timeout&apiTimeout=1500`, finish a match, wait for **Not saved yet**, switch to `success` and press **Retry**. The existing record is returned, with no duplicate.
- *Out-of-order responses:* `/?scenario=out-of-order`, then press **Next** twice quickly in Ranking.
- *Asset failure:* `/?failAssets=ship_`, press Play, untick the option (or remove the param) and press **Retry**.

Unit tests for the deterministic simulation: `npm run test:unit`.

---

## Reports

- **Playwright HTML report** of the delivered run (57 tests, desktop + mobile Chromium): [`reports/playwright/index.html`](reports/playwright/index.html). Open it with `npm run test:e2e:report`.
- **Performance report**: [`reports/performance.md`](reports/performance.md), with raw data in `performance.json`.

## Performance

**Summary** (Ryzen 5 5500, RTX 3050, Chromium 156, 1920×1080, production build): **60 FPS average, p95 frame time 16.7 ms**, no 1-second window below 59 FPS over 180 s of combat. No canvas or WebGL context leaks across 5 play cycles.

`npm run perf` plays a real-time 3-minute match on the production build with an autopilot, then runs 5 start → play → exit cycles. It records FPS, p95 frame time, entity counts and the JS heap after GC. The latest results and the reference environment are in [reports/performance.md](reports/performance.md).

---

## Deployment

The app is deployed on **Vercel** from `main`. Build command `npm run build`, output `dist/`. It's a static site: MSW's service worker (`public/mockServiceWorker.js`) serves the mocked API in production too.

---

## Project layout

```
src/
  game/            framework-agnostic game code
    sim/           deterministic simulation (rules, AI, collisions)  ← no Pixi, no DOM
    render/        PixiJS renderer, effects, texture loading
    input/         keyboard bindings + merged input state
    GameController.ts   owns one match: Pixi app, loop, pause, lifecycle
    config.ts      typed gameplay configuration
    arena.ts       arena layout & island colliders
  api/             contracts, Axios client, TanStack queries, submission outbox
  mocks/           MSW handlers, mock DB, fixtures, network scenarios
  ui/              React screens (menu, options, game HUD, result)
  storage/         localStorage persistence helpers
  testing/         URL-driven test instrumentation
e2e/               Playwright specs + visual baselines
perf/              profiling script
reports/           profiling results
```

## Credits & licenses

See [CREDITS.md](CREDITS.md).
