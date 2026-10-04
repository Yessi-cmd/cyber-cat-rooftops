import { describe, expect, it } from "vitest";
import { PHYSICS, ROOF_FEATURES } from "../src/game/config";
import { PlatformGenerator } from "../src/game/platform-generator";
import { GameSession } from "../src/game/session";
import { sweptCatIntersects } from "../src/game/swept-collision";
import type { Cat, Platform } from "../src/game/types";
import { shouldJump } from "./helpers/auto-player";

const start: Platform = { id: 0, x: 0, y: 620, width: 260, height: 42 };

function featureSession() {
  const session = new GameSession(1);
  const platform = session.snapshot().platforms[0]!;
  platform.hazard = { x: 120, y: 600, width: 24, height: 20 };
  return { session, platform, cat: session.snapshot().cat as Cat };
}

describe("roof hazards and rewards", () => {
  it("首两座屋顶无障碍，障碍屋顶留足起落和后续跳跃空间", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const generator = new PlatformGenerator(seed);
      let previous = { ...start };
      let hazardCount = 0;
      for (let index = 0; index < 40; index += 1) {
        const platform = generator.next(previous, index * 30);
        if (platform.id < 3) expect(platform.hazard).toBeUndefined();
        if (platform.hazard) {
          hazardCount += 1;
          expect(platform.width).toBeGreaterThanOrEqual(ROOF_FEATURES.hazardPlatformWidth);
          expect(platform.hazard.x - platform.x).toBeGreaterThanOrEqual(120);
          expect(platform.x + platform.width - platform.hazard.x - platform.hazard.width).toBeGreaterThan(160);
          expect(platform.rewards).toHaveLength(4);
        }
        expect(platform.rewards?.every((reward) => !reward.collected)).toBe(true);
        previous = platform;
      }
      expect(hazardCount).toBeGreaterThan(10);
    }
  });

  it("扫掠判定捕捉一帧跨过的障碍，跃过上方不误判", () => {
    const cat: Cat = { x: 120, previousX: 0, y: 580, previousY: 580,
      width: 24, height: 28, vx: 1000, vy: 0, grounded: false, jumpsRemaining: 0, platformId: null };
    const barrier = { x: 60, y: 600, width: 8, height: 20 };
    expect(sweptCatIntersects(cat, barrier)).toBe(true);
    cat.y = cat.previousY = 570;
    expect(sweptCatIntersects(cat, barrier)).toBe(false);
    cat.y = cat.previousY = 630;
    expect(sweptCatIntersects(cat, barrier)).toBe(false);
  });

  it("撞障碍立即结束且致命帧不收集奖励，结束后不再模拟", () => {
    const { session, platform, cat } = featureSession();
    cat.x = 95;
    platform.rewards = [{ x: 120, y: 592, width: 16, height: 10, collected: false }];
    expect(session.update(PHYSICS.fixedStep)).toBe(true);
    expect(session.snapshot().failureReason).toBe("hazard");
    expect(session.snapshot().collectedCount).toBe(0);
    const x = cat.x;
    expect(session.jump()).toBe(false);
    expect(session.update(0.1)).toBe(true);
    expect(cat.x).toBe(x);
  });

  it("收集只记一次分，重开恢复奖励与失败状态", () => {
    const session = new GameSession(7);
    session.snapshot().platforms[0]!.rewards = [
      { x: 80, y: 593, width: 16, height: 10, collected: false },
    ];
    session.update(PHYSICS.fixedStep);
    expect(session.snapshot().collectedCount).toBe(1);
    expect(session.snapshot().score).toBe(ROOF_FEATURES.rewardPoints);
    for (let index = 0; index < 6; index += 1) session.update(PHYSICS.fixedStep);
    expect(session.snapshot().collectedCount).toBe(1);
    session.reset(7);
    expect(session.snapshot().collectedCount).toBe(0);
    expect(session.snapshot().score).toBe(0);
    expect(session.snapshot().failureReason).toBeNull();
    expect(session.snapshot().platforms.flatMap((platform) => platform.rewards ?? []).every((reward) => !reward.collected)).toBe(true);
  });

  it("避障玩家能收集鱼干并进入后期，奖励不是不可获得的装饰", () => {
    const session = new GameSession(42);
    for (let frame = 0; frame < 60 / PHYSICS.fixedStep; frame += 1) {
      if (shouldJump(session.snapshot())) session.jump();
      expect(session.update(PHYSICS.fixedStep), `frame=${frame}`).toBe(false);
    }
    expect(session.snapshot().collectedCount).toBeGreaterThan(20);
    expect(session.snapshot().score).toBeGreaterThan(1000);
  });
});
