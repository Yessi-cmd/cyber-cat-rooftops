import { describe, expect, it } from "vitest";
import {
  MAX_ROOF_RISE,
  MAX_RUN_SPEED,
  PHYSICS,
  ROOF_FEATURES,
  getDifficulty,
  hazardOffsetAt,
  runSpeedAt,
} from "../src/game/config";
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

  it("跑速随进度连续爬升、跨阶段不跳变并在后期封顶", () => {
    expect(runSpeedAt(0)).toBe(PHYSICS.runSpeed);
    let previous = runSpeedAt(0);
    for (let score = 1; score <= 1500; score += 1) {
      const speed = runSpeedAt(score);
      expect(speed).toBeGreaterThanOrEqual(previous);
      expect(speed - previous).toBeLessThan(0.5);
      previous = speed;
    }
    expect(runSpeedAt(1100)).toBe(MAX_RUN_SPEED);
    expect(runSpeedAt(5000)).toBe(MAX_RUN_SPEED);
    // Popup warnings keep >= 0.9 s of lead even at the capped speed.
    expect(ROOF_FEATURES.popupTriggerDistance / MAX_RUN_SPEED).toBeGreaterThanOrEqual(0.9);
  });

  it("远距落点越深，路障左侧留白随跑速放大", () => {
    for (const speed of [200, 235, 270, MAX_RUN_SPEED]) {
      const overshoot = doubleJumpFlightTime(0)! * speed - getDifficulty(1100).minGap;
      expect(hazardOffsetAt(speed)).toBeGreaterThanOrEqual(overshoot + speed * 0.3);
    }
    for (let seed = 1; seed <= 50; seed += 1) {
      const generator = new PlatformGenerator(seed);
      let previous = start;
      for (let index = 0; index < 60; index += 1) {
        const score = index * 25;
        const next = generator.next(previous, score);
        if (next.hazard) {
          expect(next.hazard.x - next.x).toBeGreaterThanOrEqual(hazardOffsetAt(getDifficulty(score).runSpeed));
          expect(next.x + next.width - next.hazard.x - next.hazard.width).toBeGreaterThanOrEqual(172);
        }
        previous = next;
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
      let deepest = start.y;
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
        expect(next.y, `climb: seed=${seed}, index=${index}`).toBeGreaterThanOrEqual(deepest - MAX_ROOF_RISE);
        deepest = Math.max(deepest, next.y);
        previous = next;
      }
    }
  });
});
