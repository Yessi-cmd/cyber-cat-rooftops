import { PHYSICS } from "../../src/game/config";
import { descendingFlightTime, doubleJumpFlightTime } from "../../src/game/platform-generator";
import type { Platform, WorldRect, WorldSnapshot } from "../../src/game/types";

// The box a held jump must clear on this roof, if any. Moving enemies are
// reduced to a conservative static box (see docs/POWERS_AND_ENEMIES.md).
function obstacleOf(roof: Platform): WorldRect | null {
  const hazard = roof.hazard;
  if (hazard && !hazard.broken && hazard.popup?.phase !== "hidden") return hazard;
  const enemy = roof.enemy;
  if (!enemy || enemy.broken) return null;
  switch (enemy.kind) {
    case "robot":
      return { x: enemy.x - 20, y: enemy.y, width: enemy.width + 40, height: enemy.height };
    case "laser":
      return enemy;
    case "pot":
      return { x: enemy.anchorX - 15, y: roof.y - 12, width: 30, height: 12 };
    case "crow":
      // Danger only while the centres are within ~17px: the cat must be >= 36px up then.
      return { x: enemy.anchorX - 6, y: roof.y - 36, width: 12, height: 36 };
  }
}

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
    // Use at most the normal double jump; a feather's extra jump stays in reserve.
    const airJumps = cat.jumpsRemaining - (snapshot.powers.feather > 0 ? 1 : 0);
    if (airJumps < 1) return false;
    const landingAhead = platforms.some(p => {
      const time = heldLandingTime(cat.vy, p.y - cat.y - cat.height);
      if (time === null) return false;
      const x = cat.x + cat.vx * time;
      return x + cat.width > p.x + 4 && x < p.x + p.width - 4;
    });
    if (landingAhead) return false;
    // Jump once a fresh held arc from here lands on a roof — or, with two air
    // jumps left (e.g. after a stomp bounce), once a fresh double arc does.
    const lands = (flight: (yOffset: number) => number | null): boolean => platforms.some(p => {
      const time = flight(p.y - cat.y - cat.height);
      if (time === null) return false;
      const x = cat.x + cat.vx * time;
      return x + cat.width > p.x + 4 && x < p.x + p.width - 4;
    });
    return lands(descendingFlightTime) || (airJumps >= 2 && lands(doubleJumpFlightTime));
  }
  const current = platforms.find(p => p.id === cat.platformId);
  const next = platforms.find(p => p.id === cat.platformId! + 1);
  if (!current || !next) return false;
  const hazard = obstacleOf(current);
  // Only obstacles still ahead: a patrolling robot behind the cat may stretch past it.
  if (hazard && hazard.x + hazard.width / 2 > cat.x + cat.width / 2) {
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
