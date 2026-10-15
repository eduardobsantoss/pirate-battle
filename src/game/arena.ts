import type { Rect, Vec2 } from './math';

/** Size of one tile in the tile sheet, in world px. */
export const TILE_SIZE = 64;

export type IslandStyle = 'sand' | 'grass';

export interface IslandDef {
  style: IslandStyle;
  /** Top-left tile column / row. */
  col: number;
  row: number;
  /** Size in tiles. Grass islands are always 4×4 (fixed artwork). */
  cols: number;
  rows: number;
  /** Decorations drawn on top of the island, in tile offsets. */
  props?: { tile: number; dx: number; dy: number; scale?: number }[];
}

export interface ArenaDef {
  cols: number;
  rows: number;
  width: number;
  height: number;
  playerSpawn: Vec2;
  islands: IslandDef[];
}

/**
 * Inset applied to an island's tile bounds for collisions: the artwork has
 * soft, transparent borders, so the solid part is slightly smaller.
 */
const COLLIDER_INSET = 10;

const COLS = 21;
const ROWS = 12;

export const ARENA: ArenaDef = {
  cols: COLS,
  rows: ROWS,
  width: COLS * TILE_SIZE,
  height: ROWS * TILE_SIZE,
  playerSpawn: { x: (COLS * TILE_SIZE) / 2, y: (ROWS * TILE_SIZE) / 2 },
  islands: [
    {
      style: 'grass',
      col: 2,
      row: 1,
      cols: 4,
      rows: 4,
      props: [
        { tile: 70, dx: 1.5, dy: 1.3 },
        { tile: 72, dx: 2.4, dy: 2.2, scale: 0.8 },
      ],
    },
    { style: 'sand', col: 14, row: 1, cols: 3, rows: 2, props: [{ tile: 50, dx: 1.6, dy: 0.9 }] },
    {
      style: 'grass',
      col: 15,
      row: 7,
      cols: 4,
      rows: 4,
      props: [
        { tile: 71, dx: 1.6, dy: 1.5 },
        { tile: 66, dx: 2.5, dy: 2.4, scale: 0.8 },
      ],
    },
    { style: 'sand', col: 4, row: 8, cols: 2, rows: 3, props: [{ tile: 49, dx: 1, dy: 1.6 }] },
    { style: 'sand', col: 9, row: 9, cols: 2, rows: 2, props: [{ tile: 72, dx: 1, dy: 1, scale: 0.7 }] },
  ],
};

export function islandBounds(island: IslandDef): Rect {
  return {
    x: island.col * TILE_SIZE,
    y: island.row * TILE_SIZE,
    width: island.cols * TILE_SIZE,
    height: island.rows * TILE_SIZE,
  };
}

export function islandCollider(island: IslandDef): Rect {
  const b = islandBounds(island);
  return {
    x: b.x + COLLIDER_INSET,
    y: b.y + COLLIDER_INSET,
    width: b.width - COLLIDER_INSET * 2,
    height: b.height - COLLIDER_INSET * 2,
  };
}

/**
 * Tile numbers (1-based, row-major in a 16-column sheet) for each cell of an
 * island. Sand islands are 9-sliced so they can be any size ≥ 2×2.
 */
export function islandTiles(island: IslandDef): number[][] {
  if (island.style === 'grass') {
    return [
      [6, 7, 8, 9],
      [22, 23, 24, 25],
      [38, 39, 40, 41],
      [54, 55, 56, 57],
    ];
  }
  const rows: number[][] = [];
  for (let r = 0; r < island.rows; r++) {
    const top = r === 0;
    const bottom = r === island.rows - 1;
    const row: number[] = [];
    for (let c = 0; c < island.cols; c++) {
      const left = c === 0;
      const right = c === island.cols - 1;
      const base = top ? 1 : bottom ? 33 : 17;
      row.push(base + (left ? 0 : right ? 2 : 1));
    }
    rows.push(row);
  }
  return rows;
}

export const WATER_TILE = 73;
