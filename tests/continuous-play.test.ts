import { describe, expect, it } from "vitest";
import { PHYSICS } from "../src/game/config";
import { descendingFlightTime } from "../src/game/platform-generator";
import { GameSession } from "../src/game/session";

interface RoundResult {
  readonly lost: boolean;
  readonly score: number;
  readonly maximumPlatformCount: number;
}

function playIdealRound(session: GameSession, seconds: number): RoundResult {
  let lost = false;
  let maximumPlatformCount = 0;

  for (let index = 0; index < seconds / PHYSICS.fixedStep && !lost; index += 1) {
    const snapshot = session.snapshot();
    maximumPlatformCount = Math.max(maximumPlatformCount, snapshot.platforms.length);
    const { cat } = snapshot;

    if (cat.grounded && cat.platformId !== null) {
      const current = snapshot.platforms.find((platform) => platform.id === cat.platformId);
      const next = snapshot.platforms.find((platform) => platform.id === cat.platformId! + 1);
      if (current !== undefined && next !== undefined) {
        const flightTime = descendingFlightTime(next.y - current.y);
        if (flightTime !== null) {
          const safeLandingX = next.x - cat.width + 8;
          const launchX = safeLandingX - cat.vx * flightTime;
          if (cat.x >= launchX) {
            session.jump();
          }
        }
      }
    }

    lost = session.update(PHYSICS.fixedStep);
  }

  return {
    lost,
    score: session.snapshot().score,
    maximumPlatformCount,
  };
}

describe("连续三局资源边界", () => {
  it("同一会话连续重置三次后仍能长局运行且平台集合保持有界", () => {
    const session = new GameSession(1);
    session.setViewWidth(1_055);
    const results: RoundResult[] = [];

    for (const seed of [20260718, 20260719, 20260720]) {
      session.reset(seed);
      results.push(playIdealRound(session, 180));
    }

    expect(results.every((result) => !result.lost)).toBe(true);
    expect(results.every((result) => result.score > 1_500)).toBe(true);
    expect(results.every((result) => result.maximumPlatformCount <= 24)).toBe(true);
  });
});
