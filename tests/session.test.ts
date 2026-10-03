import { describe, expect, it } from "vitest";
import { PHYSICS } from "../src/game/config";
import { descendingFlightTime } from "../src/game/platform-generator";
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
  it("离边60毫秒内仍可起跳，起跳后不能二段跳", () => {
    const session = new GameSession(1);
    const cat = session.snapshot().cat as Cat;
    cat.x = 259;
    session.update(PHYSICS.fixedStep);
    expect(cat.grounded).toBe(false);
    expect(session.jump()).toBe(true);
    expect(cat.vy).toBe(PHYSICS.jumpVelocity);
    expect(session.jump()).toBe(false);
    expect(session.jumpCount).toBe(1);
  });

  it("离边容错超时后不能在空中补跳", () => {
    const session = new GameSession(1);
    (session.snapshot().cat as Cat).x = 259;
    for (let frame = 0; frame < 10; frame += 1) session.update(PHYSICS.fixedStep);
    expect(session.jump()).toBe(false);
    expect(session.jumpCount).toBe(0);
  });

  it("落地前按键保留100毫秒，只在落地后起跳一次", () => {
    const session = new GameSession(1);
    const cat = session.snapshot().cat as Cat;
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
        const { cat, platforms } = phone.snapshot();
        const current = platforms.find((p) => p.id === cat.platformId);
        const next = platforms.find((p) => p.id === (cat.platformId ?? -1) + 1);
        if (cat.grounded && current && next) {
          const flight = descendingFlightTime(next.y - current.y);
          if (flight !== null && cat.x >= next.x - cat.width + 8 - cat.vx * flight) {
            for (const session of sessions) session.jump();
          }
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
    expect(session.jump()).toBe(false);

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
      expect(catScreenY, `seed=${seed}`).toBeGreaterThan(260);
      expect(catScreenY, `seed=${seed}`).toBeLessThan(760);
    }
  });
});
