export type GameState = "ready" | "playing" | "paused" | "gameOver";

export interface Cat {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  grounded: boolean;
  jumpsRemaining: number;
  platformId: number | null;
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Reward extends WorldRect {
  collected: boolean;
  // The fish arcing over the gap before this roof; it feeds the combo.
  gap?: boolean;
}

export type GapKind = "near" | "medium" | "far";

// "barrier" can be cleared by a short hop; "tower" needs a held, full jump.
export type HazardKind = "barrier" | "tower";
export type RoofFeatureKind = HazardKind | "eagle";

export interface Hazard extends WorldRect {
  kind?: HazardKind;
  popup?: { phase: "hidden" | "warning" | "active"; elapsed: number };
}

// Flies low toward the cat; its x follows the cat's progress so the two
// always meet at `crossX` (world x of both centres) mid-roof.
export interface Eagle extends WorldRect {
  crossX: number;
}

export type FailureReason = "fall" | "hazard" | "tower" | "eagle";

export interface Platform {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  gapKind?: GapKind;
  hazard?: Hazard;
  eagle?: Eagle;
  rewards?: Reward[];
}

export interface WorldSnapshot {
  cat: Readonly<Cat>;
  platforms: readonly Platform[];
  cameraX: number;
  cameraY: number;
  score: number;
  seed: number;
  collectedCount: number;
  combo: number;
  bestCombo: number;
  multiplier: number;
  stage: number;
  warning: "popup" | "eagle" | null;
  failureReason: FailureReason | null;
}
