import { PHYSICS, POWERS } from "./config";
import { fallTime } from "./platform-generator";
import type { Cat, Platform, PowerKind, PowerTimers } from "./types";

// Pure helpers for power-ups. All movement here is in world coordinates and
// simulation time, so seeds and inputs still fully determine a run.

export const POWER_KINDS: readonly PowerKind[] = ["shield", "feather", "rocket", "magnet", "double"];

export function emptyPowerTimers(): PowerTimers {
  return { shield: 0, feather: 0, rocket: 0, magnet: 0, double: 0 };
}

export function powerDuration(kind: PowerKind): number {
  switch (kind) {
    case "shield": return POWERS.shieldSeconds;
    case "feather": return POWERS.featherSeconds;
    case "rocket": return POWERS.rocketSeconds;
    case "magnet": return POWERS.magnetSeconds;
    case "double": return POWERS.doubleSeconds;
  }
}

// Magnet: visible fish within the radius glide toward the cat's centre.
export function pullRewards(platforms: readonly Platform[], cat: Readonly<Cat>, delta: number): void {
  const centerX = cat.x + cat.width / 2;
  const centerY = cat.y + cat.height / 2;
  const step = POWERS.magnetPullSpeed * delta;
  for (const platform of platforms) {
    const hiddenPopup = platform.hazard?.popup?.phase === "hidden";
    for (const reward of platform.rewards ?? []) {
      if (reward.collected || (hiddenPopup && !reward.gap)) continue;
      const dx = centerX - (reward.x + reward.width / 2);
      const dy = centerY - (reward.y + reward.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance > POWERS.magnetRadius || distance === 0) continue;
      const move = Math.min(step, distance);
      reward.x += (dx / distance) * move;
      reward.y += (dy / distance) * move;
    }
  }
}

// Rocket cruise height: the cat's top sits `rocketClearance` above the highest
// roof in the window ahead, so it never visually flies through a building.
export function rocketTargetY(platforms: readonly Platform[], cat: Readonly<Cat>): number {
  let highestRoof = Number.POSITIVE_INFINITY;
  const from = cat.x - 40;
  const to = cat.x + cat.width + POWERS.rocketLookahead;
  for (const platform of platforms) {
    if (platform.x + platform.width < from || platform.x > to) continue;
    highestRoof = Math.min(highestRoof, platform.y);
  }
  if (!Number.isFinite(highestRoof)) return cat.y;
  return highestRoof - POWERS.rocketClearance - cat.height;
}

// A plain roof the cat lands on if it drops right now at `runSpeed`.
export function rocketReleaseTarget(
  platforms: readonly Platform[],
  cat: Readonly<Cat>,
  runSpeed: number,
): Platform | null {
  const bottom = cat.y + cat.height;
  for (const platform of platforms) {
    if (platform.hazard !== undefined || platform.eagle !== undefined) continue;
    const drop = platform.y - bottom;
    if (drop <= 4) continue;
    const landX = cat.x + runSpeed * fallTime(drop)!;
    if (landX < cat.x) continue;
    if (landX >= platform.x + 6 && landX + cat.width <= platform.x + platform.width - 6) {
      // Any roof between here and the landing point would catch the cat first.
      const blocked = platforms.some(other =>
        other !== platform &&
        other.y < platform.y && other.y > bottom &&
        other.x < landX + cat.width && other.x + other.width > cat.x);
      if (!blocked) return platform;
    }
  }
  return null;
}

export function maxJumpsFor(timers: Readonly<PowerTimers>): number {
  return PHYSICS.maxJumps + (timers.feather > 0 ? 1 : 0);
}
