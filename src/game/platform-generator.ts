import { PHYSICS, getDifficulty } from "./config";
import { SeededRandom } from "./random";
import type { Platform } from "./types";

const REACH_SAFETY = 14;

export function descendingFlightTime(yOffset: number): number | null {
  const discriminant = PHYSICS.jumpVelocity ** 2 + 2 * PHYSICS.gravity * yOffset;
  if (discriminant < 0) {
    return null;
  }

  return (-PHYSICS.jumpVelocity + Math.sqrt(discriminant)) / PHYSICS.gravity;
}

export function isPlatformReachable(from: Platform, to: Platform): boolean {
  return isPlatformReachableAtSpeed(from, to, PHYSICS.runSpeed);
}

export function isPlatformReachableAtSpeed(
  from: Platform,
  to: Platform,
  runSpeed: number,
): boolean {
  const time = descendingFlightTime(to.y - from.y);
  if (time === null) {
    return false;
  }

  const gap = to.x - (from.x + from.width);
  const horizontalReach = runSpeed * time;
  return gap >= 0 && gap + REACH_SAFETY <= horizontalReach;
}

export function isPlatformReachableWithoutJump(
  from: Platform,
  to: Platform,
  runSpeed: number,
): boolean {
  const yOffset = to.y - from.y;
  if (yOffset <= 0) {
    return false;
  }

  const gap = to.x - (from.x + from.width);
  const fallTime = Math.sqrt((2 * yOffset) / PHYSICS.gravity);
  const stepOffReach = runSpeed * fallTime + PHYSICS.catWidth;
  return gap <= stepOffReach + 4;
}

export class PlatformGenerator {
  private readonly random: SeededRandom;
  private nextId = 1;

  constructor(seed: number) {
    this.random = new SeededRandom(seed);
  }

  next(previous: Platform, score: number): Platform {
    const difficulty = getDifficulty(score);

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const gap = Math.round(this.random.between(difficulty.minGap, difficulty.maxGap));
      const yOffset = Math.round(
        this.random.between(difficulty.minYOffset, difficulty.maxYOffset),
      );
      const candidate: Platform = {
        id: this.nextId,
        x: previous.x + previous.width + gap,
        y: previous.y + yOffset,
        width: Math.round(this.random.between(difficulty.minWidth, difficulty.maxWidth)),
        height: 36,
      };

      if (
        isPlatformReachableAtSpeed(previous, candidate, difficulty.runSpeed) &&
        !isPlatformReachableWithoutJump(previous, candidate, difficulty.runSpeed)
      ) {
        this.nextId += 1;
        return candidate;
      }
    }

    const fallback: Platform = {
      id: this.nextId,
      x: previous.x + previous.width + difficulty.minGap,
      y: previous.y,
      width: difficulty.maxWidth,
      height: 36,
    };
    this.nextId += 1;
    return fallback;
  }
}
