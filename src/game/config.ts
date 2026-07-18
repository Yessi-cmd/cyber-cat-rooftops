export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;

export const PHYSICS = {
  catWidth: 24,
  catHeight: 28,
  runSpeed: 150,
  jumpVelocity: -370,
  gravity: 1050,
  fixedStep: 1 / 120,
  maxFrameDelta: 0.1,
} as const;

export const SCORE = {
  distancePixelsPerPoint: 15,
  landingBonus: 8,
} as const;

export const CAMERA = {
  horizontalLead: 112,
  verticalLead: 520,
  baseScrollSpeed: 14,
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
      minGap: 54,
      maxGap: 68,
      minYOffset: -12,
      maxYOffset: 12,
      minWidth: 170,
      maxWidth: 230,
      scrollSpeed: CAMERA.baseScrollSpeed,
      runSpeed: PHYSICS.runSpeed,
    };
  }

  if (score < 500) {
    return {
      minGap: 62,
      maxGap: 80,
      minYOffset: -22,
      maxYOffset: 28,
      minWidth: 130,
      maxWidth: 190,
      scrollSpeed: 18,
      runSpeed: 162,
    };
  }

  return {
    minGap: 68,
    maxGap: 90,
    minYOffset: -30,
    maxYOffset: 40,
    minWidth: 105,
    maxWidth: 160,
    scrollSpeed: 23,
    runSpeed: 175,
  };
}
