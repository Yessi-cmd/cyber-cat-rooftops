import { describe, expect, it } from "vitest";
import { PHYSICS, ROOF_FEATURES, SCORE, comboMultiplier } from "../src/game/config";
import { shouldJump } from "./helpers/auto-player";
import { GameSession } from "../src/game/session";
import type { Cat, WorldSnapshot } from "../src/game/types";

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
    if (shouldJump(snapshot)) session.jump();

    lost = session.update(PHYSICS.fixedStep);
  }

  return { lost, snapshot: session.snapshot() };
}

describe("GameSession", () => {
  it("二段跳重置上升速度，第三次无效，落地与重开恢复次数", () => {
    const session = new GameSession(19);
    const cat = session.snapshot().cat;
    expect(cat.jumpsRemaining).toBe(2);
    session.jump();
    for (let frame = 0; frame < 20; frame += 1) session.update(PHYSICS.fixedStep);
    expect(cat.vy).toBeGreaterThan(PHYSICS.jumpVelocity);
    expect(session.jump()).toBe(true);
    expect(cat.vy).toBe(PHYSICS.jumpVelocity);
    expect(cat.jumpsRemaining).toBe(0);
    expect(session.jump()).toBe(false);
    session.clearPendingInput();
    expect(cat.jumpsRemaining).toBe(0);
    for (let frame = 0; frame < 85; frame += 1) session.update(PHYSICS.fixedStep);
    expect(cat.grounded).toBe(true);
    expect(cat.jumpsRemaining).toBe(2);
    session.jump();
    session.reset(19);
    expect(session.snapshot().cat.jumpsRemaining).toBe(2);
  });

  it("按住跳满弧线，轻点松手为矮跳但仍能越过路障，松手不影响下落", () => {
    const apexHeight = (releaseAfterSteps: number | null): number => {
      const session = new GameSession(5);
      const cat = session.snapshot().cat;
      const startY = cat.y;
      let highest = startY;
      session.jump();
      for (let step = 0; step < 60; step += 1) {
        if (step === releaseAfterSteps) session.releaseJump();
        session.update(PHYSICS.fixedStep);
        highest = Math.min(highest, cat.y);
      }
      return startY - highest;
    };
    const full = apexHeight(null);
    const tap = apexHeight(6); // 50 ms tap
    expect(full).toBeGreaterThan(74);
    expect(tap).toBeLessThan(full * 0.6);
    expect(tap).toBeGreaterThan(ROOF_FEATURES.hazardHeight + 8);
    // Past the apex, releasing must not change the fall.
    expect(apexHeight(40)).toBe(full);

    const session = new GameSession(5);
    const cat = session.snapshot().cat;
    session.jump();
    for (let step = 0; step < 45; step += 1) session.update(PHYSICS.fixedStep);
    const vy = cat.vy;
    session.update(PHYSICS.fixedStep);
    expect(cat.vy - vy).toBeCloseTo(PHYSICS.fallGravity * PHYSICS.fixedStep);
  });

  it("缓冲跳在落地时沿用当前按住状态", () => {
    const heights = [true, false].map(holdThrough => {
      const session = new GameSession(5);
      const cat = session.snapshot().cat;
      session.jump();
      session.jump();
      while (!(cat.vy > 0 && cat.y > 620 - cat.height - 12)) session.update(PHYSICS.fixedStep);
      session.jump(); // buffered: no jumps left while falling
      if (!holdThrough) session.releaseJump();
      while (!cat.grounded) session.update(PHYSICS.fixedStep);
      let highest = cat.y;
      for (let step = 0; step < 40; step += 1) {
        session.update(PHYSICS.fixedStep);
        highest = Math.min(highest, cat.y);
      }
      return 620 - cat.height - highest;
    });
    expect(heights[0]).toBeGreaterThan(70);
    expect(heights[1]).toBeLessThan(heights[0]! * 0.6);
  });

  it("吃到楼距鱼干再落新屋顶才延续连击，漏吃清零，倍率封顶", () => {
    expect([0, 3, 4, 8, 12, 99].map(comboMultiplier)).toEqual([1, 1, 2, 3, 4, SCORE.maxMultiplier]);

    const run = (skipFishOnRoof: number | null) => {
      const session = new GameSession(1);
      const combos: number[] = [];
      let last = 0;
      for (let step = 0; step < 20 / PHYSICS.fixedStep; step += 1) {
        const snapshot = session.snapshot();
        for (const platform of snapshot.platforms) {
          // Lift the chosen gap fish out of reach to simulate a missed arc.
          const fish = platform.rewards?.find(reward => reward.gap);
          if (platform.id === skipFishOnRoof && fish) fish.y = -10_000;
        }
        if (shouldJump(snapshot)) session.jump();
        expect(session.update(PHYSICS.fixedStep)).toBe(false);
        const { cat, combo } = session.snapshot();
        if (cat.grounded && cat.platformId! > last) {
          last = cat.platformId!;
          combos.push(combo);
        }
      }
      return { combos, snapshot: session.snapshot() };
    };
    const clean = run(null);
    const missed = run(5);
    expect(clean.combos.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(missed.combos[4]).toBe(0);
    expect(missed.combos[5]).toBe(1);
    expect(missed.snapshot.score).toBeLessThan(clean.snapshot.score);
    expect(clean.snapshot.bestCombo).toBeGreaterThanOrEqual(8);
    // Combo bonus and fish never change speed: same inputs, same cat path.
    expect(missed.snapshot.cat.x).toBe(clean.snapshot.cat.x);
  });

  it("远间隙单跳会落空，顶点二段跳可以跨越并恢复次数", () => {
    for (const useSecondJump of [false, true]) {
      const session = new GameSession(42);
      const cat = session.snapshot().cat as Cat;
      // Isolate a known far gap; the generated opening is deliberately a near gap.
      session.snapshot().platforms[1]!.x = 418;
      session.snapshot().platforms[1]!.y = 620;
      cat.x = 240;
      session.jump();
      for (let frame = 0; frame < 34; frame += 1) session.update(PHYSICS.fixedStep);
      if (useSecondJump) session.jump();
      let landed = false;
      for (let frame = 0; frame < 100; frame += 1) {
        if (session.update(PHYSICS.fixedStep)) break;
        if (cat.grounded && cat.platformId === 1) { landed = true; break; }
      }
      expect(landed).toBe(useSecondJump);
      if (landed) expect(cat.jumpsRemaining).toBe(2);
    }
  });

  it("离边60毫秒内仍可起跳，随后仅允许一次二段跳", () => {
    const session = new GameSession(1);
    const cat = session.snapshot().cat as Cat;
    cat.x = 259;
    session.update(PHYSICS.fixedStep);
    expect(cat.grounded).toBe(false);
    expect(session.jump()).toBe(true);
    expect(cat.vy).toBe(PHYSICS.jumpVelocity);
    expect(session.jump()).toBe(true);
    expect(session.jump()).toBe(false);
    expect(session.jumpCount).toBe(2);
  });

  it("离边容错超时后只保留一次空中补跳", () => {
    const session = new GameSession(1);
    (session.snapshot().cat as Cat).x = 259;
    for (let frame = 0; frame < 10; frame += 1) session.update(PHYSICS.fixedStep);
    expect(session.snapshot().cat.jumpsRemaining).toBe(1);
    expect(session.jump()).toBe(true);
    expect(session.jump()).toBe(false);
    expect(session.jumpCount).toBe(1);
  });

  it("落地前按键保留100毫秒，只在落地后起跳一次", () => {
    const session = new GameSession(1);
    const cat = session.snapshot().cat as Cat;
    cat.jumpsRemaining = 0;
    cat.grounded = false;
    cat.platformId = null;
    cat.y = 591;
    cat.vy = 100;
    expect(session.jump()).toBe(false);
    for (let frame = 0; frame < 4; frame += 1) session.update(PHYSICS.fixedStep);
    expect(cat.grounded).toBe(false);
    expect(cat.vy).toBeLessThan(0);
    expect(session.jumpCount).toBe(1);
    for (let frame = 0; frame < 65; frame += 1) session.update(PHYSICS.fixedStep);
    expect(session.jumpCount).toBe(1);
  });

  it("过早输入会过期，暂停清理和重开也清除待执行跳跃", () => {
    for (const clear of ["expire", "pause", "reset"]) {
      const session = new GameSession(1);
      let cat = session.snapshot().cat as Cat;
      cat.jumpsRemaining = 0;
      cat.grounded = false;
      cat.platformId = null;
      cat.y = clear === "expire" ? 540 : 591;
      cat.vy = 100;
      session.jump();
      if (clear === "pause") session.clearPendingInput();
      if (clear === "reset") { session.reset(1); cat = session.snapshot().cat; }
      for (let frame = 0; frame < 35; frame += 1) session.update(PHYSICS.fixedStep);
      expect(session.jumpCount, clear).toBe(0);
      expect(cat.grounded, clear).toBe(true);
    }
  });

  it("同种子同输入在手机、桌面及中途缩放时保持相同规则结果", () => {
    for (const seed of [1, 42, 20260718]) {
      const phone = new GameSession(seed);
      const desktop = new GameSession(seed);
      const resized = new GameSession(seed);
      desktop.setViewWidth(1_055);
      const sessions = [phone, desktop, resized];
      const generated = sessions.map(() => new Map<number, string>());
      for (let step = 0; step < 90 / PHYSICS.fixedStep; step += 1) {
        if (step % 600 === 0) resized.setViewWidth(step % 1200 === 0 ? 1_400 : 390);
        if (shouldJump(phone.snapshot())) {
          for (const session of sessions) session.jump();
        }
        for (const [index, session] of sessions.entries()) {
          expect(session.update(PHYSICS.fixedStep), `seed=${seed}, step=${step}`).toBe(false);
          for (const platform of session.snapshot().platforms) {
            generated[index]!.set(platform.id, JSON.stringify(platform));
          }
        }
        for (const session of [desktop, resized]) {
          expect(session.snapshot().cat).toEqual(phone.snapshot().cat);
          expect(session.snapshot().score).toBe(phone.snapshot().score);
        }
      }
      expect(phone.snapshot().score).toBeGreaterThan(500);
      for (const [id, platform] of generated[0]!) {
        expect(generated[1]!.get(id)).toBe(platform);
        expect(generated[2]!.get(id)).toBe(platform);
      }
    }
  });

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

    for (let index = 0; index < 100; index += 1) {
      session.update(PHYSICS.fixedStep);
    }

    expect(session.snapshot().cat.grounded).toBe(true);
    expect(session.snapshot().cat.vy).toBe(0);
  });

  it("盲目每100毫秒连点无法稳定通过前30秒", () => {
    let failedRounds = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const session = new GameSession(seed);
      for (let step = 0; step < 30 / PHYSICS.fixedStep; step += 1) {
        if (step % 12 === 0) session.jump();
        if (session.update(PHYSICS.fixedStep)) { failedRounds += 1; break; }
      }
    }
    expect(failedRounds).toBeGreaterThanOrEqual(90);
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
    for (let seed = 1; seed <= 300; seed += 1) {
      const { lost, snapshot } = playIdealSession(seed, 60, 390);
      const catScreenY = snapshot.cat.y - snapshot.cameraY;

      expect(lost, `seed=${seed} ${JSON.stringify(snapshot)}`).toBe(false);
      // The second apex adds about 59 px of height relative to single-jump play.
      expect(catScreenY, `seed=${seed}`).toBeGreaterThan(200);
      expect(catScreenY, `seed=${seed}`).toBeLessThan(760);
    }
  });
});
