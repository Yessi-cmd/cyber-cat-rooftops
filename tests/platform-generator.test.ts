import { describe, expect, it } from "vitest";
import { getDifficulty } from "../src/game/config";
import {
  descendingFlightTime,
  PlatformGenerator,
  isPlatformReachableAtSpeed,
  isPlatformReachableWithoutJump,
} from "../src/game/platform-generator";
import type { Platform } from "../src/game/types";

const start: Platform = { id: 0, x: 0, y: 620, width: 260, height: 42 };

describe("PlatformGenerator", () => {
  it("初级同高度跳跃窗口保持在约四分之一秒以上", () => {
    const difficulty = getDifficulty(0);
    const flightTime = descendingFlightTime(0);
    expect(flightTime).not.toBeNull();
    if (flightTime === null) {
      return;
    }

    const shortestWindow =
      (flightTime * difficulty.runSpeed - difficulty.maxGap) / difficulty.runSpeed;
    expect(shortestWindow).toBeGreaterThanOrEqual(0.24);
    expect(shortestWindow).toBeLessThan(0.4);
  });

  it("同一随机种子生成同一序列", () => {
    const generate = (): Platform[] => {
      const generator = new PlatformGenerator(20260718);
      const platforms = [start];
      for (let index = 0; index < 30; index += 1) {
        const previous = platforms.at(-1);
        if (previous === undefined) {
          throw new Error("缺少前一平台");
        }
        platforms.push(generator.next(previous, index * 30));
      }
      return platforms;
    };

    expect(generate()).toEqual(generate());
  });

  it("批量种子和所有难度阶段都只生成可达平台", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const generator = new PlatformGenerator(seed);
      let previous = start;
      for (let index = 0; index < 80; index += 1) {
        const score = index * 20;
        const difficulty = getDifficulty(score);
        const next = generator.next(previous, score);
        expect(
          isPlatformReachableAtSpeed(previous, next, difficulty.runSpeed),
          `reachable: seed=${seed}, index=${index}`,
        ).toBe(true);
        expect(
          isPlatformReachableWithoutJump(previous, next, difficulty.runSpeed),
          `requires jump: seed=${seed}, index=${index}`,
        ).toBe(false);
        previous = next;
      }
    }
  });
});
