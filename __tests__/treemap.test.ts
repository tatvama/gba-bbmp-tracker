import { describe, it, expect } from "vitest";
import { squarify } from "@/lib/treemap";

const BOX = { x: 0, y: 0, w: 1000, h: 600 };

function tilesFor(values: number[]) {
  return squarify(
    values.map((value, i) => ({ item: i, value })),
    BOX,
  );
}

describe("squarify", () => {
  it("returns one tile per positive-valued item", () => {
    const tiles = tilesFor([10, 5, 5, 20]);
    expect(tiles).toHaveLength(4);
  });

  it("drops zero / negative values", () => {
    const tiles = tilesFor([10, 0, -3, 7]);
    expect(tiles).toHaveLength(2);
  });

  it("returns nothing for an empty or all-zero input", () => {
    expect(tilesFor([])).toHaveLength(0);
    expect(tilesFor([0, 0])).toHaveLength(0);
  });

  it("keeps every tile inside the box", () => {
    const tiles = tilesFor([63, 50, 112, 72, 72]); // the real GBA corp counts
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-6);
      expect(t.y).toBeGreaterThanOrEqual(-1e-6);
      expect(t.x + t.w).toBeLessThanOrEqual(BOX.w + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(BOX.h + 1e-6);
    }
  });

  it("fills the whole box (areas sum to box area)", () => {
    const tiles = tilesFor([63, 50, 112, 72, 72]);
    const covered = tiles.reduce((s, t) => s + t.w * t.h, 0);
    expect(covered).toBeCloseTo(BOX.w * BOX.h, 2);
  });

  it("sizes tiles proportionally to value", () => {
    const tiles = tilesFor([100, 50, 50]); // areas should be 2:1:1
    const area = (i: number) => {
      const t = tiles.find((x) => x.item === i)!;
      return t.w * t.h;
    };
    expect(area(0) / area(1)).toBeCloseTo(2, 4);
    expect(area(1) / area(2)).toBeCloseTo(1, 4);
  });

  it("does not overlap tiles", () => {
    const tiles = tilesFor([30, 25, 20, 15, 10, 5]);
    const overlaps = (a: (typeof tiles)[number], b: (typeof tiles)[number]) =>
      a.x < b.x + b.w - 1e-6 &&
      a.x + a.w > b.x + 1e-6 &&
      a.y < b.y + b.h - 1e-6 &&
      a.y + a.h > b.y + 1e-6;
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        expect(overlaps(tiles[i]!, tiles[j]!)).toBe(false);
      }
    }
  });
});
