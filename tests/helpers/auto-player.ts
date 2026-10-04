import { PHYSICS } from "../../src/game/config";
import { descendingFlightTime } from "../../src/game/platform-generator";
import type { WorldSnapshot } from "../../src/game/types";

// Seconds until a held arc with vertical speed `vy` descends `drop` px below now.
function heldLandingTime(vy: number, drop: number): number | null {
  const riseTime = Math.max(0, -vy) / PHYSICS.gravity;
  const riseHeight = Math.max(0, -vy) ** 2 / (2 * PHYSICS.gravity);
  const fallSpeed = Math.max(0, vy);
  const fallDistance = drop + riseHeight;
  if (fallDistance < 0) return null;
  return riseTime +
    (-fallSpeed + Math.sqrt(fallSpeed ** 2 + 2 * PHYSICS.fallGravity * fallDistance)) / PHYSICS.fallGravity;
}

// Test player reacts only to visible terrain/hazards and projects its held-jump landing.
export function shouldJump(snapshot: WorldSnapshot): boolean {
  const { cat, platforms } = snapshot;
  if (!cat.grounded) {
    if (cat.jumpsRemaining !== 1) return false;
    const landingAhead = platforms.some(p => {
      const time = heldLandingTime(cat.vy, p.y - cat.y - cat.height);
      if (time === null) return false;
      const x = cat.x + cat.vx * time;
      return x + cat.width > p.x + 4 && x < p.x + p.width - 4;
    });
    if (landingAhead) return false;
    // Double-jump only once a fresh held arc from here lands on a roof.
    return platforms.some(p => {
      const time = descendingFlightTime(p.y - cat.y - cat.height);
      if (time === null) return false;
      const x = cat.x + cat.vx * time;
      return x + cat.width > p.x + 4 && x < p.x + p.width - 4;
    });
  }
  const current = platforms.find(p => p.id === cat.platformId);
  const next = platforms.find(p => p.id === cat.platformId! + 1);
  if (!current || !next) return false;
  const hazard = current.hazard;
  if (hazard && hazard.popup?.phase !== "hidden" && cat.x < hazard.x + hazard.width) {
    // Launch so the held arc is centred over the obstacle's clearance window.
    const [rise, fall] = clearanceWindow(hazard.height);
    const front = hazard.x - cat.width - cat.vx * rise;
    const back = hazard.x + hazard.width - cat.vx * fall;
    return cat.x >= (front + back) / 2;
  }
  const flight = descendingFlightTime(next.y - current.y)!;
  const launch = Math.min(current.x + current.width - 20, next.x - cat.width + 8 - cat.vx * flight);
  return cat.x >= launch;
}

// Seconds after a held take-off when the cat's bottom is above `height`.
function clearanceWindow(height: number): [number, number] {
  const v = -PHYSICS.jumpVelocity;
  const rise = (v - Math.sqrt(v ** 2 - 2 * PHYSICS.gravity * height)) / PHYSICS.gravity;
  const apexTime = v / PHYSICS.gravity;
  const apexHeight = v ** 2 / (2 * PHYSICS.gravity);
  return [rise, apexTime + Math.sqrt((2 * (apexHeight - height)) / PHYSICS.fallGravity)];
}
