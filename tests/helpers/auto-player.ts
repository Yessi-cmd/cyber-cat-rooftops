import { PHYSICS } from "../../src/game/config";
import type { WorldSnapshot } from "../../src/game/types";

// Test player reacts only to visible terrain/hazards and projects its single-jump landing.
export function shouldJump(snapshot: WorldSnapshot): boolean {
  const { cat, platforms } = snapshot;
  if (!cat.grounded) {
    if (cat.jumpsRemaining !== 1 || cat.vy < 0) return false;
    const landingAhead = platforms.some(p => {
      const height = p.y - cat.y - cat.height;
      if (height < 0) return false;
      const time = (-cat.vy + Math.sqrt(cat.vy ** 2 + 2 * PHYSICS.gravity * height)) / PHYSICS.gravity;
      const x = cat.x + cat.vx * time;
      return x + cat.width > p.x + 4 && x < p.x + p.width - 4;
    });
    return !landingAhead;
  }
  const current = platforms.find(p => p.id === cat.platformId);
  const next = platforms.find(p => p.id === cat.platformId! + 1);
  if (!current || !next) return false;
  if (current.hazard && current.hazard.popup?.phase !== "hidden" && cat.x < current.hazard.x + current.hazard.width) {
    return cat.x >= current.hazard.x - cat.width - cat.vx * 0.11;
  }
  const flight = (-PHYSICS.jumpVelocity + Math.sqrt(PHYSICS.jumpVelocity ** 2 + 2 * PHYSICS.gravity * (next.y - current.y))) / PHYSICS.gravity;
  const launch = Math.min(current.x + current.width - 20, next.x - cat.width + 8 - cat.vx * flight);
  return cat.x >= launch;
}
