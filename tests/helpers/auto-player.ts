import type { WorldSnapshot } from "../../src/game/types";

// Independent player observes edges and vertical velocity, not generator reach formulas.
export function shouldJump(snapshot: WorldSnapshot): boolean {
  const { cat, platforms } = snapshot;
  if (!cat.grounded) {
    const roofBelow = platforms.find(p => cat.x < p.x + p.width && cat.x + cat.width > p.x);
    return cat.jumpsRemaining === 1 && cat.vy >= 0 && !roofBelow;
  }
  const current = platforms.find(p => p.id === cat.platformId);
  if (!current) return false;
  if (current.hazard && cat.x < current.hazard.x + current.hazard.width) {
    return cat.x >= current.hazard.x - cat.width - cat.vx * 0.11;
  }
  return cat.x >= current.x + current.width - 20;
}
