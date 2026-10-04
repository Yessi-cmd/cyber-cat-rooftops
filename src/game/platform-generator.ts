import {
  GAP_RANGES,
  MAX_ROOF_RISE,
  MIN_ROOF_WORLD_Y,
  PHYSICS,
  POWERS,
  ROOF_FEATURES,
  getDifficulty,
  hazardOffsetAt,
} from "./config";
import { SeededRandom } from "./random";
import { addRoofFeatures, hasHazardRoof } from "./roof-features";
import type { GapKind, Platform, PowerKind, RoofFeatureKind } from "./types";

// First appearances are fixed so each obstacle is introduced alone.
const INTRODUCED_FEATURES: Readonly<Record<number, RoofFeatureKind>> = { 3: "barrier", 7: "tower", 11: "eagle" };

const REACH_SAFETY = 14;

// Analytic routes assume the jump key is held through each rise (the longest
// arc); releasing early only shortens flight, so this bounds what is reachable.
const RISE_TIME = -PHYSICS.jumpVelocity / PHYSICS.gravity;
const RISE_HEIGHT = PHYSICS.jumpVelocity ** 2 / (2 * PHYSICS.gravity);

export function fallTime(drop: number): number | null {
  return drop < 0 ? null : Math.sqrt((2 * drop) / PHYSICS.fallGravity);
}

// Single held jump landing `yOffset` px below the take-off height.
export function descendingFlightTime(yOffset: number): number | null {
  const fall = fallTime(RISE_HEIGHT + yOffset);
  return fall === null ? null : RISE_TIME + fall;
}

// Conservative route: second press at the first apex, not late fall.
export function doubleJumpFlightTime(yOffset: number): number | null {
  const fall = fallTime(2 * RISE_HEIGHT + yOffset);
  return fall === null ? null : 2 * RISE_TIME + fall;
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
  const stepOffReach = runSpeed * fallTime(yOffset)! + PHYSICS.catWidth;
  return gap <= stepOffReach + 4;
}

export class PlatformGenerator {
  private readonly random: SeededRandom;
  private nextId = 1;
  private gapBag: GapKind[] = ["near"];
  private deepestY = 0;
  private lastPowerId = Number.NEGATIVE_INFINITY;

  constructor(seed: number) {
    this.random = new SeededRandom(seed);
  }

  next(previous: Platform, score: number): Platform {
    const difficulty = getDifficulty(score);
    this.deepestY = Math.max(this.deepestY, previous.y);
    const highestY = Math.max(MIN_ROOF_WORLD_Y, this.deepestY - MAX_ROOF_RISE);
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
    const feature = hazardRoof ? this.pickFeature(this.nextId) : null;
    const popup = feature === "barrier" && (this.nextId === 3 || this.random.next() < 0.55);
    // Faster runs land deeper into the roof, so the hazard and roof shift right together.
    const hazardOffset = hazardOffsetAt(difficulty.runSpeed);
    const hazardRoofWidth = ROOF_FEATURES.hazardPlatformWidth + hazardOffset - ROOF_FEATURES.hazardOffset;

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const gap = Math.round(this.random.between(minGap, maxGap));
      const yOffset = Math.round(
        this.random.between(difficulty.minYOffset, difficulty.maxYOffset),
      );
      const candidate: Platform = {
        id: this.nextId,
        gapKind,
        x: previous.x + previous.width + gap,
        y: Math.max(highestY, previous.y + yOffset),
        width: hazardRoof
          ? hazardRoofWidth
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
        return this.addPower(addRoofFeatures(previous, candidate, feature, popup, hazardOffset));
      }
    }

    const fallback: Platform = {
      id: this.nextId,
      gapKind,
      x: previous.x + previous.width + minGap,
      y: previous.y,
      width: hazardRoof ? hazardRoofWidth : difficulty.maxWidth,
      height: 36,
    };
    this.nextId += 1;
    return this.addPower(addRoofFeatures(previous, fallback, feature, popup, hazardOffset));
  }

  // Power-ups only float over plain roofs, centred, never two close together.
  private addPower(platform: Platform): Platform {
    if (
      platform.hazard !== undefined || platform.eagle !== undefined ||
      platform.id < POWERS.firstRoofId || platform.id - this.lastPowerId < POWERS.minRoofSpacing
    ) {
      return platform;
    }
    if (this.random.next() >= POWERS.chance) return platform;
    const entries = Object.entries(POWERS.weights) as [PowerKind, number][];
    let roll = this.random.next() * entries.reduce((sum, [, weight]) => sum + weight, 0);
    let kind = entries[0]![0];
    for (const [candidate, weight] of entries) {
      kind = candidate;
      roll -= weight;
      if (roll < 0) break;
    }
    this.lastPowerId = platform.id;
    platform.power = {
      kind,
      x: Math.round(platform.x + platform.width / 2 - POWERS.itemSize / 2),
      y: Math.round(platform.y - POWERS.itemLift - POWERS.itemSize / 2),
      width: POWERS.itemSize,
      height: POWERS.itemSize,
      collected: false,
    };
    return platform;
  }

  private pickFeature(id: number): RoofFeatureKind {
    const introduced = INTRODUCED_FEATURES[id];
    if (introduced !== undefined) return introduced;
    if (id < 11) return "barrier";
    const roll = this.random.next();
    return roll < 0.4 ? "barrier" : roll < 0.7 ? "tower" : "eagle";
  }
}
