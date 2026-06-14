/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk, 2000).
 * Pure, framework-free, dependency-free — given a list of weighted items and a
 * pixel box, returns each item's rectangle with near-1:1 aspect ratios.
 *
 * Used by the interactive Tree Map page to lay out one level of the
 * Corporation → Division → Sub-division → Ward hierarchy at a time.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tile<T> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Highest aspect ratio in a row of areas when packed against `side`. */
function worst(areas: number[], side: number): number {
  if (areas.length === 0 || side <= 0) return Infinity;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const a of areas) {
    sum += a;
    if (a > max) max = a;
    if (a < min) min = a;
  }
  const sum2 = sum * sum;
  if (sum2 === 0) return Infinity;
  const side2 = side * side;
  return Math.max((side2 * max) / sum2, sum2 / (side2 * min));
}

/**
 * Lay `input` items out inside `box`, sized proportionally to `value`.
 * Returns a tile per item with positive value (zero/negative are dropped).
 */
export function squarify<T>(
  input: { item: T; value: number }[],
  box: Box,
): Tile<T>[] {
  const tiles: Tile<T>[] = [];
  const totalValue = input.reduce((s, n) => s + Math.max(n.value, 0), 0);
  if (totalValue <= 0 || box.w <= 0 || box.h <= 0) return tiles;

  const totalArea = box.w * box.h;
  const nodes = input
    .filter((n) => n.value > 0)
    .map((n) => ({ item: n.item, area: (n.value / totalValue) * totalArea }))
    .sort((a, b) => b.area - a.area); // largest first → better squarification

  // Mutable free rectangle the remaining nodes are packed into.
  let { x, y, w, h } = box;
  let row: { item: T; area: number }[] = [];

  const commit = () => {
    const sum = row.reduce((s, r) => s + r.area, 0);
    if (sum <= 0) {
      row = [];
      return;
    }
    if (w >= h) {
      // Vertical strip down the left of the free rect.
      const stripW = sum / h;
      let oy = y;
      for (const r of row) {
        const cellH = r.area / stripW;
        tiles.push({ item: r.item, x, y: oy, w: stripW, h: cellH });
        oy += cellH;
      }
      x += stripW;
      w -= stripW;
    } else {
      // Horizontal strip across the top of the free rect.
      const stripH = sum / w;
      let ox = x;
      for (const r of row) {
        const cellW = r.area / stripH;
        tiles.push({ item: r.item, x: ox, y, w: cellW, h: stripH });
        ox += cellW;
      }
      y += stripH;
      h -= stripH;
    }
    row = [];
  };

  let i = 0;
  while (i < nodes.length) {
    const side = Math.min(w, h);
    const node = nodes[i]!;
    const current = row.map((r) => r.area);
    if (row.length === 0 || worst(current, side) >= worst([...current, node.area], side)) {
      row.push(node);
      i++;
    } else {
      commit();
    }
  }
  commit();

  return tiles;
}
