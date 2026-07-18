import type { GameState } from "../game/types";

export type CatAnimationName = "idle" | "run" | "jumpUp" | "apex" | "fall" | "land" | "fail";

export interface CatPose {
  readonly animation: CatAnimationName;
  readonly frame: number;
  readonly bob: number;
  readonly stretch: number;
  readonly squash: number;
  readonly frontLegOffset: number;
  readonly backLegOffset: number;
  readonly tailLift: number;
  readonly scarfLift: number;
  readonly eyesWide: boolean;
}

export const LAND_ANIMATION_DURATION_MS = 132;

const IDLE_FRAME_MS = 250;
const RUN_FRAME_MS = 90;
const AIR_FRAME_MS = 125;
const FAIL_FRAME_MS = 125;

const idle: readonly CatPose[] = [
  pose("idle", 0, 0, 0, 0, 0, 2, 0, 0),
  pose("idle", 1, 0, 0, 0, 0, 2, -1, 0),
  pose("idle", 2, -1, 0, 0, 0, 2, -1, -1),
  pose("idle", 3, 0, 0, 0, 0, 2, 0, 0),
];

const run: readonly CatPose[] = [
  pose("run", 0, 0, 0, 0, 0, 2, 0, 0),
  pose("run", 1, 1, 0, 0, 0, 1, -1, 0),
  pose("run", 2, 0, 0, 0, 2, 0, -1, -1),
  pose("run", 3, 1, 0, 0, 1, -1, 0, -1),
  pose("run", 4, 0, 0, 0, 0, 2, 1, 0),
  pose("run", 5, 1, 0, 0, -1, 1, 1, 0),
];

const jumpUp: readonly CatPose[] = [
  pose("jumpUp", 0, 0, 2, 0, -2, 1, 1, 1),
  pose("jumpUp", 1, -1, 1, 0, -1, 2, 0, 0),
];

const apex: readonly CatPose[] = [pose("apex", 0, -1, 0, 1, -1, 1, -1, -1)];

const fall: readonly CatPose[] = [
  pose("fall", 0, 0, 0, 1, -1, 2, -2, -1),
  pose("fall", 1, 1, 0, 2, 0, 2, -2, 0),
];

const land: readonly CatPose[] = [
  pose("land", 0, 2, 0, 3, -1, -1, 1, 1),
  pose("land", 1, 1, 0, 2, 0, 0, 0, 0),
  pose("land", 2, 0, 0, 0, 0, 2, 0, 0),
];

const fail: readonly CatPose[] = [
  pose("fail", 0, 0, 0, 1, -2, 2, -2, -1, true),
  pose("fail", 1, 1, 0, 2, -2, 2, -1, 0, true),
  pose("fail", 2, 0, 0, 1, -1, 2, 0, 1, true),
  pose("fail", 3, 1, 0, 2, -1, 2, -1, 0, true),
];

export const CAT_ANIMATION_SPEC = {
  idle: { frames: idle.length, fps: 4 },
  run: { frames: run.length, fps: 1000 / RUN_FRAME_MS },
  jumpUp: { frames: jumpUp.length, fps: 1000 / AIR_FRAME_MS },
  apex: { frames: apex.length, fps: 0 },
  fall: { frames: fall.length, fps: 1000 / AIR_FRAME_MS },
  land: { frames: land.length, durationMs: LAND_ANIMATION_DURATION_MS },
  fail: { frames: fail.length, fps: 1000 / FAIL_FRAME_MS },
} as const;

export function selectCatPose(
  gameState: GameState,
  grounded: boolean,
  verticalVelocity: number,
  nowMs: number,
  landingStartedAtMs: number | null,
  reducedMotion: boolean,
): CatPose {
  if (gameState === "gameOver") {
    return frameAt(fail, reducedMotion ? 0 : cyclicFrame(nowMs, FAIL_FRAME_MS, fail.length));
  }

  if (gameState === "ready" || (gameState === "paused" && grounded)) {
    return frameAt(idle, reducedMotion ? 0 : cyclicFrame(nowMs, IDLE_FRAME_MS, idle.length));
  }

  if (
    !reducedMotion &&
    grounded &&
    landingStartedAtMs !== null &&
    nowMs >= landingStartedAtMs &&
    nowMs - landingStartedAtMs < LAND_ANIMATION_DURATION_MS
  ) {
    const frame = Math.min(
      land.length - 1,
      Math.floor((nowMs - landingStartedAtMs) / (LAND_ANIMATION_DURATION_MS / land.length)),
    );
    return frameAt(land, frame);
  }

  if (grounded) {
    return frameAt(run, reducedMotion ? 0 : cyclicFrame(nowMs, RUN_FRAME_MS, run.length));
  }

  if (verticalVelocity < -70) {
    return frameAt(
      jumpUp,
      reducedMotion ? 0 : cyclicFrame(nowMs, AIR_FRAME_MS, jumpUp.length),
    );
  }

  if (verticalVelocity <= 80) {
    return frameAt(apex, 0);
  }

  return frameAt(fall, reducedMotion ? 0 : cyclicFrame(nowMs, AIR_FRAME_MS, fall.length));
}

function pose(
  animation: CatAnimationName,
  frame: number,
  bob: number,
  stretch: number,
  squash: number,
  frontLegOffset: number,
  backLegOffset: number,
  tailLift: number,
  scarfLift: number,
  eyesWide = false,
): CatPose {
  return {
    animation,
    frame,
    bob,
    stretch,
    squash,
    frontLegOffset,
    backLegOffset,
    tailLift,
    scarfLift,
    eyesWide,
  };
}

function cyclicFrame(nowMs: number, frameDurationMs: number, frameCount: number): number {
  return Math.floor(Math.max(0, nowMs) / frameDurationMs) % frameCount;
}

function frameAt(frames: readonly CatPose[], index: number): CatPose {
  const frame = frames[index];
  if (frame === undefined) {
    throw new Error(`猫咪动画帧越界：${index}`);
  }
  return frame;
}
