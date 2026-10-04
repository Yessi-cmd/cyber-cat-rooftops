import { describe, expect, it } from "vitest";
import { getDifficulty } from "../src/game/config";
import {
  descendingFlightTime,
  doubleJumpFlightTime,
  PlatformGenerator,
  isPlatformReachableAtSpeed,
  isPlatformReachableWithoutJump,
} from "../src/game/platform-generator";
import type { Platform } from "../src/game/types";

const start: Platform = { id: 0, x: 0, y: 620, width: 260, height: 42 };

describe("PlatformGenerator", () => {
  it("远楼距超过单跳范围，二段跳保留明确余量，后期平台更短", () => {
    const difficulty = getDifficulty(0);
    const flightTime = doubleJumpFlightTime(0);
    expect(flightTime).not.toBeNull();
    if (flightTime === null) {
      return;
    }

    const shortestWindow =
      (flightTime * difficulty.runSpeed - difficulty.maxGap) / difficulty.runSpeed;
    expect(shortestWindow).toBeGreaterThanOrEqual(0.09);
    expect(shortestWindow).toBeLessThan(0.15);
    expect(difficulty.minGap).toBeGreaterThan(descendingFlightTime(0)! * difficulty.runSpeed + 24);
    const expert = getDifficulty(500);
    expect(expert.maxWidth / expert.runSpeed).toBeLessThan(0.47);
    expect(expert.runSpeed).toBeGreaterThan(difficulty.runSpeed * 1.3);
  });

  it("每组包含近中远三种楼距，近中可单跳，远距保留二段跳挑战", () => {
    for (const score of [0, 150, 500]) {
      for (let seed = 1; seed <= 100; seed += 1) {
        const generator = new PlatformGenerator(seed);
        const speed = getDifficulty(score).runSpeed;
        let previous = generator.next(start, score);
        expect(previous.gapKind).toBe("near");
        for (let group = 0; group < 8; group += 1) {
          const kinds = new Set<string>();
          for (let index = 0; index < 3; index += 1) {
            const next = generator.next(previous, score);
            kinds.add(next.gapKind!);
            const gap = next.x - previous.x - previous.width;
            const singleReach = descendingFlightTime(next.y - previous.y)! * speed;
            if (next.gapKind === "far") expect(gap).toBeGreaterThan(singleReach);
            else expect(gap + 14).toBeLessThanOrEqual(singleReach);
            previous = next;
          }
          expect([...kinds].sort()).toEqual(["far", "medium", "near"]);
        }
      }
    }
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
