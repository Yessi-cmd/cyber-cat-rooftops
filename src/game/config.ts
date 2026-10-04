export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;

export const PHYSICS = {
  catWidth: 24,
  catHeight: 28,
  // Logical px/s and px/s²; shorter flight keeps each press crisp.
  runSpeed: 200,
  jumpVelocity: -420,
  maxJumps: 2,
  gravity: 1500,
  // Seconds: forgive near-landing presses and very late edge jumps.
  jumpBufferSeconds: 0.1,
  coyoteSeconds: 0.06,
  fixedStep: 1 / 120,
  maxFrameDelta: 0.1,
} as const;

// Keep early roofs below the HUD while the camera has not moved yet.
export const MIN_ROOF_WORLD_Y = 420;

export const SCORE = {
  distancePixelsPerPoint: 15,
  landingBonus: 8,
} as const;

export const ROOF_FEATURES = {
  firstHazardId: 3,
  hazardPlatformWidth: 340,
  hazardWidth: 24,
  hazardHeight: 20,
  hazardOffset: 120,
  rewardWidth: 16,
  rewardHeight: 10,
  rewardPoints: 5,
} as const;

export const CAMERA = {
  horizontalLead: 112,
  verticalLead: 520,
  baseScrollSpeed: 80,
} as const;

export interface Difficulty {
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
  if (score < 150) {
    return {
      minGap: 142,
      maxGap: 170,
      minYOffset: -12,
      maxYOffset: 12,
      minWidth: 125,
      maxWidth: 180,
      scrollSpeed: CAMERA.baseScrollSpeed,
      runSpeed: PHYSICS.runSpeed,
    };
  }

  if (score < 500) {
    return {
      minGap: 174,
      maxGap: 198,
      minYOffset: -22,
      maxYOffset: 28,
      minWidth: 100,
      maxWidth: 150,
      scrollSpeed: 110,
      runSpeed: 235,
    };
  }

  return {
    minGap: 206,
    maxGap: 230,
    minYOffset: -30,
    maxYOffset: 40,
    minWidth: 80,
    maxWidth: 125,
    scrollSpeed: 140,
    runSpeed: 270,
  };
}
