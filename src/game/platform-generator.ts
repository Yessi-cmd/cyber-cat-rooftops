import { GAP_RANGES, MIN_ROOF_WORLD_Y, PHYSICS, ROOF_FEATURES, getDifficulty } from "./config";
import { SeededRandom } from "./random";
import { addRoofFeatures, hasHazardRoof } from "./roof-features";
import type { GapKind, Platform } from "./types";

const REACH_SAFETY = 14;

export function descendingFlightTime(yOffset: number): number | null {
  const discriminant = PHYSICS.jumpVelocity ** 2 + 2 * PHYSICS.gravity * yOffset;
  if (discriminant < 0) {
    return null;
  }

  return (-PHYSICS.jumpVelocity + Math.sqrt(discriminant)) / PHYSICS.gravity;
}

// Conservative route: second press at the first apex, not late fall.
export function doubleJumpFlightTime(yOffset: number): number | null {
  const apexTime = -PHYSICS.jumpVelocity / PHYSICS.gravity;
  const apexOffset = -(PHYSICS.jumpVelocity ** 2) / (2 * PHYSICS.gravity);
  const secondFlight = descendingFlightTime(yOffset - apexOffset);
  return secondFlight === null ? null : apexTime + secondFlight;
}

export function isPlatformReachable(from: Platform, to: Platform): boolean {
  return isPlatformReachableAtSpeed(from, to, PHYSICS.runSpeed);
}

export function isPlatformReachableAtSpeed(
  from: Platform,
  to: Platform,
  runSpeed: number,
): boolean {
  const time = doubleJumpFlightTime(to.y - from.y);
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
  private gapBag: GapKind[] = ["near"];

  constructor(seed: number) {
    this.random = new SeededRandom(seed);
  }

  next(previous: Platform, score: number): Platform {
    const difficulty = getDifficulty(score);
    const hazardRoof = hasHazardRoof(this.nextId, score);
    if (this.gapBag.length === 0) {
      this.gapBag = ["near", "medium", "far"];
      for (let index = this.gapBag.length - 1; index > 0; index -= 1) {
        const other = Math.floor(this.random.next() * (index + 1));
        [this.gapBag[index], this.gapBag[other]] = [this.gapBag[other]!, this.gapBag[index]!];
      }
    }
    const gapKind = this.gapBag.pop()!;
    const minGap = gapKind === "far" ? difficulty.minGap : Math.round(GAP_RANGES[gapKind][0] * difficulty.runSpeed);
    const maxGap = gapKind === "far" ? difficulty.maxGap : Math.round(GAP_RANGES[gapKind][1] * difficulty.runSpeed);
    const popup = hazardRoof && (this.nextId === 3 || this.random.next() < 0.55);

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const gap = Math.round(this.random.between(minGap, maxGap));
      const yOffset = Math.round(
        this.random.between(difficulty.minYOffset, difficulty.maxYOffset),
      );
      const candidate: Platform = {
        id: this.nextId,
        gapKind,
        x: previous.x + previous.width + gap,
        y: Math.max(MIN_ROOF_WORLD_Y, previous.y + yOffset),
        width: hazardRoof
          ? ROOF_FEATURES.hazardPlatformWidth
          : Math.round(this.random.between(difficulty.minWidth, difficulty.maxWidth)),
        height: 36,
      };

      if (
        // Progress is estimated at the departure roof, independently of lookahead.
        isPlatformReachableAtSpeed(previous, candidate, difficulty.runSpeed) &&
        (gapKind === "far" || (descendingFlightTime(candidate.y - previous.y) ?? 0) * difficulty.runSpeed >= gap + REACH_SAFETY) &&
        !isPlatformReachableWithoutJump(previous, candidate, difficulty.runSpeed)
      ) {
        this.nextId += 1;
        return addRoofFeatures(previous, candidate, hazardRoof, popup);
      }
    }

    const fallback: Platform = {
      id: this.nextId,
      gapKind,
      x: previous.x + previous.width + minGap,
      y: previous.y,
      width: hazardRoof ? ROOF_FEATURES.hazardPlatformWidth : difficulty.maxWidth,
      height: 36,
    };
    this.nextId += 1;
    return addRoofFeatures(previous, fallback, hazardRoof, popup);
  }
}
