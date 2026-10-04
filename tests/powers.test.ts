import { describe, expect, it } from "vitest";
import { PHYSICS, POWERS, ROOF_FEATURES } from "../src/game/config";
import { PlatformGenerator } from "../src/game/platform-generator";
import { rocketReleaseTarget } from "../src/game/powers";
import { GameSession } from "../src/game/session";
import type { Cat, Platform, PowerKind } from "../src/game/types";
import { shouldJump } from "./helpers/auto-player";

const start: Platform = { id: 0, x: 0, y: 620, width: 260, height: 42 };

// One very long start roof with nothing generated on top of it.
function longRoof(session: GameSession): Platform {
  const platforms = session.snapshot().platforms as Platform[];
  platforms.splice(1);
  platforms[0]!.width = 5000;
  return platforms[0]!;
}

// Drops a power item right on the running line just ahead of the cat.
function grant(session: GameSession, kind: PowerKind): void {
  const { cat, platforms } = session.snapshot();
  const roof = platforms.find(platform => platform.id === cat.platformId) ?? platforms[0]!;
  roof.power = { kind, x: cat.x + cat.width + 1, y: cat.y + 4, width: 18, height: 18, collected: false };
  session.update(PHYSICS.fixedStep);
  expect(session.snapshot().lastPower).toBe(kind);
}

function step(session: GameSession, seconds: number, autoplay = false): boolean {
  for (let index = 0; index < Math.round(seconds / PHYSICS.fixedStep); index += 1) {
    if (autoplay && shouldJump(session.snapshot())) session.jump();
    if (session.update(PHYSICS.fixedStep)) return true;
  }
  return false;
}

describe("超能力道具", () => {
  it("道具只出现在无障碍屋顶正上方，第 5 栋起、间隔至少 5 栋，五种都会出现", () => {
    const kinds = new Set<string>();
    let total = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const generator = new PlatformGenerator(seed);
      let previous = start;
      let lastId = -Infinity;
      for (let index = 0; index < 60; index += 1) {
        const roof = generator.next(previous, index * 25);
        if (roof.power) {
          total += 1;
          kinds.add(roof.power.kind);
          expect(roof.hazard ?? roof.eagle).toBeUndefined();
          expect(roof.id).toBeGreaterThanOrEqual(POWERS.firstRoofId);
          expect(roof.id - lastId).toBeGreaterThanOrEqual(POWERS.minRoofSpacing);
          lastId = roof.id;
          // A running cat (top = roof - 28) passes under; a short hop reaches it.
          expect(roof.power.y + roof.power.height).toBeLessThan(roof.y - PHYSICS.catHeight);
          expect(roof.power.y + roof.power.height).toBeGreaterThan(roof.y - PHYSICS.catHeight - 40);
          expect(roof.power.x).toBeGreaterThan(roof.x);
          expect(roof.power.x + roof.power.width).toBeLessThan(roof.x + roof.width);
        }
        previous = roof;
      }
    }
    expect(kinds).toEqual(new Set(["shield", "feather", "rocket", "magnet", "double"]));
    expect(total / 200).toBeGreaterThan(3); // a few per minute of play
  });

  it("护盾撞碎一次障碍并加分，短暂无敌后再撞会失败；限时到期失效", () => {
    const session = new GameSession(1);
    const roof = longRoof(session);
    const cat = session.snapshot().cat as Cat;
    roof.hazard = { kind: "barrier", x: cat.x + 60, y: roof.y - 20, width: 24, height: 20 };
    grant(session, "shield");
    expect(step(session, 0.5)).toBe(false);
    const smashed = session.snapshot();
    expect(roof.hazard.broken).toBe(true);
    expect(smashed.shieldBreaks).toBe(1);
    expect(smashed.powers.shield).toBe(0);
    roof.hazard = { kind: "tower", x: cat.x + 60, y: roof.y - 44, width: 14, height: 44 };
    expect(step(session, 0.5)).toBe(true);
    expect(session.snapshot().failureReason).toBe("tower");

    const expiring = new GameSession(1);
    longRoof(expiring);
    grant(expiring, "shield");
    step(expiring, POWERS.shieldSeconds);
    expect(expiring.snapshot().powers.shield).toBe(0);
  });

  it("羽毛期间空中可跳三次，到期后恢复两次", () => {
    const session = new GameSession(1);
    longRoof(session);
    grant(session, "feather");
    const cat = session.snapshot().cat;
    expect(cat.jumpsRemaining).toBe(3);
    expect([session.jump(), session.jump(), session.jump(), session.jump()]).toEqual([true, true, true, false]);
    while (!cat.grounded) session.update(PHYSICS.fixedStep);
    expect(cat.jumpsRemaining).toBe(3);
    step(session, POWERS.featherSeconds);
    expect(session.snapshot().powers.feather).toBe(0);
    expect(cat.jumpsRemaining).toBe(2);
  });

  it("火箭：无敌飞越、高于前方屋顶，结束后落在无障碍屋顶中段并补满跳跃", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const session = new GameSession(seed);
      step(session, 4 + (seed % 7), true);
      if (session.snapshot().failureReason !== null) continue;
      grant(session, "rocket");
      expect(session.snapshot().rocketing).toBe(true);
      expect(session.jump()).toBe(false);
      let landedOn: Platform | undefined;
      for (let index = 0; index < 12 / PHYSICS.fixedStep; index += 1) {
        const snapshot = session.snapshot();
        if (snapshot.rocketing) {
          // Never inside a building while cruising.
          for (const roof of snapshot.platforms) {
            const overlapsX = snapshot.cat.x + snapshot.cat.width > roof.x && snapshot.cat.x < roof.x + roof.width;
            if (overlapsX) expect(snapshot.cat.y + snapshot.cat.height, `seed=${seed}`).toBeLessThanOrEqual(roof.y);
          }
        }
        expect(session.update(PHYSICS.fixedStep), `seed=${seed}`).toBe(false);
        const after = session.snapshot();
        if (!after.rocketing && after.cat.grounded) {
          landedOn = after.platforms.find(roof => roof.id === after.cat.platformId);
          break;
        }
      }
      expect(landedOn, `seed=${seed}`).toBeDefined();
      expect(landedOn!.hazard ?? landedOn!.eagle).toBeUndefined();
      const landed = session.snapshot();
      expect(landed.cat.jumpsRemaining).toBe(PHYSICS.maxJumps + (landed.powers.feather > 0 ? 1 : 0));
    }
  });

  it("火箭释放点：只在落点位于无障碍屋顶中段时成立", () => {
    const cat = { x: 100, y: 400, width: 24, height: 28 } as Cat;
    const roof: Platform = { id: 1, x: 150, y: 600, width: 120, height: 36 };
    const landX = 100 + 300 * Math.sqrt((2 * (600 - 428)) / PHYSICS.fallGravity);
    expect(landX).toBeGreaterThan(150);
    expect(rocketReleaseTarget([roof], cat, 300)).toBe(roof);
    expect(rocketReleaseTarget([{ ...roof, hazard: { x: 0, y: 0, width: 1, height: 1 } }], cat, 300)).toBeNull();
    expect(rocketReleaseTarget([{ ...roof, x: 400 }], cat, 300)).toBeNull();
  });

  it("磁铁把半径内的鱼干吸过来；双倍分让同一段路程得分翻倍", () => {
    const session = new GameSession(1);
    const roof = longRoof(session);
    const cat = session.snapshot().cat;
    roof.rewards = [{ x: cat.x + 60, y: cat.y - 90, width: 16, height: 10, collected: false }];
    grant(session, "magnet");
    step(session, 0.6);
    expect(roof.rewards[0]!.collected).toBe(true);

    const run = (double: boolean): number => {
      const runner = new GameSession(2);
      longRoof(runner);
      if (double) grant(runner, "double");
      else runner.update(PHYSICS.fixedStep);
      const before = runner.snapshot().score;
      step(runner, 2);
      return runner.snapshot().score - before;
    };
    const plain = run(false);
    expect(run(true)).toBeGreaterThanOrEqual(plain * 2 - 1);
    expect(ROOF_FEATURES.rewardPoints).toBeGreaterThan(0);
  });

  it("重开清空所有能力与计数", () => {
    const session = new GameSession(3);
    longRoof(session);
    grant(session, "double");
    grant(session, "shield");
    session.reset(3);
    const snapshot = session.snapshot();
    expect(Object.values(snapshot.powers).every(value => value === 0)).toBe(true);
    expect([snapshot.powerPickups, snapshot.shieldBreaks, snapshot.lastPower, snapshot.rocketing]).toEqual([0, 0, null, false]);
  });
});
