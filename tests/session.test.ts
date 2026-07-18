import { describe, expect, it } from "vitest";
import { PHYSICS } from "../src/game/config";
import { descendingFlightTime } from "../src/game/platform-generator";
import { GameSession } from "../src/game/session";
import type { WorldSnapshot } from "../src/game/types";

function playIdealSession(
  seed: number,
  seconds: number,
  viewWidth = 1_055,
): { lost: boolean; snapshot: WorldSnapshot } {
  const session = new GameSession(seed);
  session.setViewWidth(viewWidth);
  let lost = false;

  for (let index = 0; index < seconds / PHYSICS.fixedStep && !lost; index += 1) {
    const snapshot = session.snapshot();
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

  return { lost, snapshot: session.snapshot() };
}

describe("GameSession", () => {
  it("重置后恢复干净且保留给定种子", () => {
    const session = new GameSession(42);
    session.jump();
    for (let index = 0; index < 20; index += 1) {
      session.update(PHYSICS.fixedStep);
    }
    session.reset(99);

    const snapshot = session.snapshot();
    expect(snapshot.seed).toBe(99);
    expect(snapshot.score).toBe(0);
    expect(snapshot.cat.grounded).toBe(true);
    expect(snapshot.cat.platformId).toBe(0);
  });

  it("相同种子和输入产生相同世界快照", () => {
    const simulate = () => {
      const session = new GameSession(12345);
      session.jump();
      for (let index = 0; index < 240; index += 1) {
        session.update(PHYSICS.fixedStep);
        if (index === 120) {
          session.jump();
        }
      }
      return session.snapshot();
    };

    expect(simulate()).toEqual(simulate());
  });

  it("起跳后能从上方重新落到平台", () => {
    const session = new GameSession(7);
    expect(session.jump()).toBe(true);
    expect(session.jump()).toBe(false);

    for (let index = 0; index < 100; index += 1) {
      session.update(PHYSICS.fixedStep);
    }

    expect(session.snapshot().cat.grounded).toBe(true);
    expect(session.snapshot().cat.vy).toBe(0);
  });

  it("不跳跃会在第一个楼顶后落空", () => {
    const session = new GameSession(17);
    let lost = false;

    for (let index = 0; index < 1_200 && !lost; index += 1) {
      lost = session.update(PHYSICS.fixedStep);
    }

    expect(lost).toBe(true);
    expect(session.snapshot().score).toBeGreaterThan(10);
    expect(session.snapshot().score).toBeLessThan(40);
  });

  it("宽屏会生成足够的前方世界而不改变逻辑高度", () => {
    const session = new GameSession(88);
    session.setViewWidth(1_055);
    const platforms = session.snapshot().platforms;
    const last = platforms.at(-1);

    expect(last).toBeDefined();
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBeGreaterThanOrEqual(1_055 + 390);
  });

  it("理想输入可在三个难度阶段连续运行三分钟", () => {
    const { lost, snapshot: finalSnapshot } = playIdealSession(20260718, 180);
    expect(lost).toBe(false);
    expect(finalSnapshot.score).toBeGreaterThan(1_500);
    const catScreenY = finalSnapshot.cat.y - finalSnapshot.cameraY;
    expect(catScreenY).toBeGreaterThan(300);
    expect(catScreenY).toBeLessThan(720);
  });

  it("多种长局面中相机都不会脱离可玩楼顶", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const { lost, snapshot } = playIdealSession(seed, 60, 390);
      const catScreenY = snapshot.cat.y - snapshot.cameraY;

      expect(lost, `seed=${seed}`).toBe(false);
      expect(catScreenY, `seed=${seed}`).toBeGreaterThan(260);
      expect(catScreenY, `seed=${seed}`).toBeLessThan(760);
    }
  });
});
