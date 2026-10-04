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

export interface Hazard extends WorldRect {
  popup?: { phase: "hidden" | "warning" | "active"; elapsed: number };
}

export interface Platform {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  gapKind?: GapKind;
  hazard?: Hazard;
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
  hazardWarning: boolean;
  failureReason: "fall" | "hazard" | null;
}
