import type { Cat, WorldRect } from "./types";

const AXES = ["x", "y"] as const;

// Sweep the cat's top-left point against a Minkowski-expanded target.
// This catches a thin obstacle/reward even when one step crosses its whole width.
export function sweptCatIntersects(cat: Readonly<Cat>, rect: Readonly<WorldRect>): boolean {
  let enter = 0;
  let exit = 1;
  for (const axis of AXES) {
    const start = axis === "x" ? cat.previousX : cat.previousY;
    const end = cat[axis];
    const size = axis === "x" ? cat.width : cat.height;
    const targetSize = axis === "x" ? rect.width : rect.height;
    const minimum = rect[axis] - size;
    const maximum = rect[axis] + targetSize;
    const movement = end - start;
    if (movement === 0) {
      if (start < minimum || start > maximum) return false;
      continue;
    }
    const first = (minimum - start) / movement;
    const second = (maximum - start) / movement;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (enter > exit) return false;
  }
  return true;
}
