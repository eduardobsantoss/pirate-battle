# Credits & licenses

## Game assets

All artwork and sound effects in [`public/assets/`](public/assets/) (ships, ship parts, tiles, effects, UI sprites and atlases, sound effects and ambient loops) were **provided by Jungle Gaming** as part of the challenge and are used unmodified. The ship, tile and effect sprites appear to be derived from Kenney's *Pirate Pack* ([kenney.nl](https://kenney.nl), CC0 1.0); the UI pack and sounds were supplied with the challenge.

No assets were converted, optimized or added. Health bars are cropped at runtime using the `fill_rect` metadata from `ui_sheet.json`.

## Fonts

Loaded from Google Fonts, both under the [SIL Open Font License 1.1](https://openfontlicense.org):

- **Lilita One** by Juan Montoreano: titles, buttons, HUD counters.
- **Nunito** by Vernon Adams, Cyreal and Jacques Le Bailly: body text.

The UI falls back to system fonts if Google Fonts is unreachable.

## Libraries

Runtime and development dependencies are listed in `package.json`, with exact versions pinned in `package-lock.json`. All are open source: React (MIT), PixiJS (MIT), TanStack Query (MIT), Axios (MIT), MSW (MIT), Playwright (Apache-2.0), Vite (MIT), Vitest (MIT), TypeScript (Apache-2.0), ESLint (MIT).
