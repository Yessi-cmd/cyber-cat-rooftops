import { ENEMIES, PHYSICS } from "./config";
import type { Cat, Enemy, EnemyKind, Platform } from "./types";

// Enemy motion is a pure function of cat progress (robot, crow, pot) or of
// simulation time (laser), so a seed plus inputs always replays identically
// and pausing freezes everything.

export function createEnemy(kind: EnemyKind, platform: Platform, anchorX: number): Enemy {
  const roofY = platform.y;
  switch (kind) {
    case "robot":
      return { kind, anchorX, roofY, x: anchorX, y: roofY - ENEMIES.robotHeight,
        width: ENEMIES.robotWidth, height: ENEMIES.robotHeight, active: true, phase: platform.id * 0.37 };
    case "laser":
      return { kind, anchorX, roofY, x: anchorX, y: roofY - ENEMIES.laserHeight,
        width: ENEMIES.laserWidth, height: ENEMIES.laserHeight, active: false, phase: (platform.id * 0.53) % 1 };
    case "crow":
      return { kind, anchorX, roofY, x: anchorX, y: roofY - 300,
        width: ENEMIES.crowWidth, height: ENEMIES.crowHeight, active: true, phase: 0 };
    case "pot":
      return { kind, anchorX, roofY, x: anchorX - ENEMIES.potWidth / 2, y: roofY - ENEMIES.potFallHeight,
        width: ENEMIES.potWidth, height: ENEMIES.potHeight, active: false, phase: 0 };
  }
}

function triangle(value: number, period: number): number {
  const t = ((value % period) + period) % period / period;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

// Updates position/state in place. `elapsed` is simulation seconds this run.
export function placeEnemy(enemy: Enemy, cat: Readonly<Cat>, elapsed: number): void {
  const catCenter = cat.x + cat.width / 2;
  switch (enemy.kind) {
    case "robot": {
      // Patrols [anchor - range, anchor + range] at a pace tied to the cat's progress.
      const sweep = triangle(catCenter * ENEMIES.robotPaceRatio + enemy.phase * ENEMIES.robotRange * 4, ENEMIES.robotRange * 4);
      enemy.x = enemy.anchorX - ENEMIES.robotRange + sweep * ENEMIES.robotRange * 2 - enemy.width / 2;
      enemy.y = enemy.roofY - enemy.height;
      return;
    }
    case "laser": {
      const cycle = ((elapsed / ENEMIES.laserPeriod + enemy.phase) % 1 + 1) % 1;
      enemy.active = cycle < ENEMIES.laserOnFraction;
      return;
    }
    case "crow": {
      // V-shaped dive: reaches the running line exactly where the centres meet.
      const distance = enemy.anchorX - catCenter;
      const centerX = enemy.anchorX + ENEMIES.crowSpeedRatio * distance;
      const runningCenterY = enemy.roofY - PHYSICS.catHeight / 2;
      const centerY = runningCenterY - Math.min(ENEMIES.crowMaxLift, ENEMIES.crowDiveSlope * Math.abs(distance));
      enemy.x = centerX - enemy.width / 2;
      enemy.y = centerY - enemy.height / 2;
      return;
    }
    case "pot": {
      const distance = enemy.anchorX - catCenter;
      const fall = (distance - ENEMIES.potLandDistance) / ENEMIES.potFallDistance;
      if (fall <= 0) {
        // Landed: a wide pile of shards that has to be hopped.
        enemy.active = true;
        enemy.width = ENEMIES.shardWidth;
        enemy.height = ENEMIES.shardHeight;
        enemy.x = enemy.anchorX - ENEMIES.shardWidth / 2;
        enemy.y = enemy.roofY - ENEMIES.shardHeight;
      } else {
        enemy.active = false;
        enemy.width = ENEMIES.potWidth;
        enemy.height = ENEMIES.potHeight;
        enemy.x = enemy.anchorX - ENEMIES.potWidth / 2;
        enemy.y = enemy.roofY - ENEMIES.potHeight - ENEMIES.potFallHeight * Math.min(1, fall);
      }
      return;
    }
  }
}

// Falling pots only hurt once landed; lasers only while lit.
export function enemyIsDangerous(enemy: Readonly<Enemy>): boolean {
  if (enemy.broken) return false;
  return enemy.kind === "laser" || enemy.kind === "pot" ? enemy.active : true;
}

// A stomp: falling onto the robot's top from above.
export function isStomp(enemy: Readonly<Enemy>, cat: Readonly<Cat>): boolean {
  return enemy.kind === "robot" && cat.vy > 0 &&
    cat.previousY + cat.height <= enemy.y + ENEMIES.stompTolerance;
}

export function enemyWarning(enemy: Readonly<Enemy>, cat: Readonly<Cat>): "crow" | "pot" | null {
  if (enemy.broken) return null;
  const ahead = enemy.anchorX - (cat.x + cat.width / 2);
  if (enemy.kind === "crow" && ahead > 0 && ahead <= ENEMIES.crowWarningDistance) return "crow";
  if (enemy.kind === "pot" && !enemy.active && ahead <= ENEMIES.potLandDistance + ENEMIES.potFallDistance + ENEMIES.potShadowLead) {
    return "pot";
  }
  return null;
}
