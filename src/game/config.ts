export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;

export const PHYSICS = {
  catWidth: 24,
  catHeight: 28,
  // Logical px/s and px/s². Holding rises on `gravity` (77px apex); releasing
  // early rises on `releasedRiseGravity` for a short hop; every fall uses the
  // heavier `fallGravity` so landings feel snappy instead of floaty.
  runSpeed: 200,
  jumpVelocity: -480,
  maxJumps: 2,
  gravity: 1500,
  releasedRiseGravity: 4500,
  fallGravity: 2200,
  // Seconds: forgive near-landing presses and very late edge jumps.
  jumpBufferSeconds: 0.1,
  coyoteSeconds: 0.06,
  fixedStep: 1 / 120,
  maxFrameDelta: 0.1,
} as const;

// Keep early roofs below the HUD while the camera has not moved yet.
export const MIN_ROOF_WORLD_Y = 420;
// The camera only scrolls down, so roofs may climb at most this far (px)
// above the deepest roof generated so far.
export const MAX_ROOF_RISE = 110;

export const SCORE = {
  distancePixelsPerPoint: 15,
  landingBonus: 8,
  // Landing on a new roof after eating that gap's fish extends the combo;
  // every `comboStep` combo raises the landing multiplier, up to the max.
  comboStep: 4,
  maxMultiplier: 4,
} as const;

export function comboMultiplier(combo: number): number {
  return Math.min(SCORE.maxMultiplier, 1 + Math.floor(Math.max(0, combo) / SCORE.comboStep));
}

// Progress-score thresholds where stage 1 and stage 2 begin.
export const STAGE_SCORES = [150, 500] as const;

export function stageAt(progress: number): number {
  return STAGE_SCORES.filter(threshold => progress >= threshold).length;
}

export const ROOF_FEATURES = {
  firstHazardId: 3,
  popupTriggerDistance: 270, // px: at least 0.9s ahead at the capped run speed.
  popupWarningSeconds: 0.35,
  hazardPlatformWidth: 340,
  hazardWidth: 24,
  hazardHeight: 20,
  // Taller than a short hop (~40px apex) but well under a held jump (77px).
  towerWidth: 14,
  towerHeight: 44,
  // Eagle flies this many px above a running cat's head, so only a jump hits it.
  eagleWidth: 40,
  eagleHeight: 18,
  eagleClearance: 12,
  eagleSpeedRatio: 0.6, // eagle world speed toward the cat, relative to run speed
  eagleCrossOffset: 40, // px past the hazard offset where cat and eagle meet
  eagleWarningDistance: 360, // px between centres when the DOM warning appears
  hazardOffset: 120, // px minimum; grows with speed via hazardOffsetAt().
  hazardLandingSeconds: 0.62, // s of running between a fast landing point and the hazard.
  rewardWidth: 16,
  rewardHeight: 10,
  rewardPoints: 5,
} as const;

// Power-ups float above plain roofs; every duration runs on simulation time.
export const POWERS = {
  firstRoofId: 5,
  minRoofSpacing: 5,
  chance: 0.2, // per eligible plain roof
  weights: { shield: 25, feather: 20, rocket: 15, magnet: 20, double: 20 },
  itemSize: 18,
  itemLift: 44, // px from roof top to item centre: a running cat passes under, any hop takes it
  shieldSeconds: 15,
  shieldBreakBonus: 20,
  graceSeconds: 0.4, // invulnerable after the shield breaks or a rocket lands
  featherSeconds: 8,
  rocketSeconds: 3,
  rocketSpeedRatio: 1.5,
  rocketClearance: 50, // px between the cat and the highest roof top ahead
  rocketClimbSpeed: 320, // px/s while matching that altitude
  rocketLookahead: 420, // px of roofs ahead that set the altitude
  rocketSeekLimitSeconds: 4, // safety: release even without an ideal roof
  magnetSeconds: 8,
  magnetRadius: 120,
  magnetPullSpeed: 520,
  doubleSeconds: 8,
} as const;

export const CAMERA = {
  horizontalLead: 112,
  verticalLead: 520,
  baseScrollSpeed: 80,
} as const;

// Seconds of horizontal travel; far gaps retain the two-jump challenge ranges.
export const GAP_RANGES = { near: [0.32, 0.40], medium: [0.43, 0.49] } as const;

// (progress score, run speed px/s): speed ramps linearly between points so
// every stage keeps accelerating, and is capped after the last point.
export const SPEED_CURVE: readonly (readonly [number, number])[] = [
  [0, 200], // PHYSICS.runSpeed
  [150, 235],
  [500, 270],
  [1100, 300],
];

export const MAX_RUN_SPEED = SPEED_CURVE.at(-1)![1];

export function runSpeedAt(score: number): number {
  const progress = Math.max(0, score);
  for (let index = 1; index < SPEED_CURVE.length; index += 1) {
    const [toScore, toSpeed] = SPEED_CURVE[index]!;
    if (progress < toScore) {
      const [fromScore, fromSpeed] = SPEED_CURVE[index - 1]!;
      return fromSpeed + ((progress - fromScore) / (toScore - fromScore)) * (toSpeed - fromSpeed);
    }
  }
  return MAX_RUN_SPEED;
}

export function hazardOffsetAt(runSpeed: number): number {
  return Math.round(Math.max(ROOF_FEATURES.hazardOffset, runSpeed * ROOF_FEATURES.hazardLandingSeconds));
}

export interface Difficulty {
  // Far gap range; near/medium use the speed-scaled ranges above.
  minGap: number;
  maxGap: number;
  minYOffset: number;
  maxYOffset: number;
  minWidth: number;
  maxWidth: number;
  scrollSpeed: number;
  runSpeed: number;
}

export function getDifficulty(score: number): Difficulty {
  const stage = stageAt(score);
  if (stage === 0) {
    return {
      minGap: 150,
      maxGap: 175,
      minYOffset: -12,
      maxYOffset: 12,
      minWidth: 125,
      maxWidth: 180,
      scrollSpeed: CAMERA.baseScrollSpeed,
      runSpeed: runSpeedAt(score),
    };
  }

  if (stage === 1) {
    return {
      minGap: 180,
      maxGap: 206,
      minYOffset: -22,
      maxYOffset: 28,
      minWidth: 100,
      maxWidth: 150,
      scrollSpeed: 110,
      runSpeed: runSpeedAt(score),
    };
  }

  return {
    minGap: 214,
    maxGap: 240,
    minYOffset: -30,
    maxYOffset: 40,
    minWidth: 80,
    maxWidth: 125,
    scrollSpeed: 140,
    runSpeed: runSpeedAt(score),
  };
}
