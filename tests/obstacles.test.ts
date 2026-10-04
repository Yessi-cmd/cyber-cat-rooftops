import { describe, expect, it } from "vitest";
import { PHYSICS, ROOF_FEATURES, hazardOffsetAt } from "../src/game/config";
import { PlatformGenerator } from "../src/game/platform-generator";
import { placeEagle } from "../src/game/roof-features";
import { GameSession } from "../src/game/session";
import type { Cat, Eagle, Platform } from "../src/game/types";

const start: Platform = { id: 0, x: 0, y: 620, width: 260, height: 42 };

function towerSession() {
  const session = new GameSession(1);
  const roof = session.snapshot().platforms[0]!;
  roof.width = 600;
  roof.hazard = {
    kind: "tower", x: 240, y: roof.y - ROOF_FEATURES.towerHeight,
    width: ROOF_FEATURES.towerWidth, height: ROOF_FEATURES.towerHeight,
  };
  return { session, cat: session.snapshot().cat as Cat, tower: roof.hazard };
}

function eagleSession() {
  const session = new GameSession(1);
  const roof = session.snapshot().platforms[0]!;
  roof.width = 900;
  const crossX = 400;
  const eagle: Eagle = {
    crossX, x: 0, width: ROOF_FEATURES.eagleWidth, height: ROOF_FEATURES.eagleHeight,
    y: roof.y - PHYSICS.catHeight - ROOF_FEATURES.eagleClearance - ROOF_FEATURES.eagleHeight,
  };
  roof.eagle = eagle;
  return { session, cat: session.snapshot().cat as Cat, eagle };
}

function runUntil(session: GameSession, cat: Cat, x: number): boolean {
  while (cat.x < x) {
    if (session.update(PHYSICS.fixedStep)) return true;
  }
  return false;
}

describe("信号塔与飞鹰", () => {
  it("信号塔：轻点小跳撞塔，按住跳满可以越过", () => {
    for (const tap of [true, false]) {
      const { session, cat, tower } = towerSession();
      // Launch centred on the held arc's clearance window.
      runUntil(session, cat, tower.x - 0.3 * cat.vx - 4);
      session.jump();
      let lost = false;
      for (let step = 0; step < 90 && !lost; step += 1) {
        if (tap && step === 6) session.releaseJump();
        lost = session.update(PHYSICS.fixedStep);
      }
      expect(lost).toBe(tap);
      if (tap) expect(session.snapshot().failureReason).toBe("tower");
    }
  });

  it("飞鹰：贴地跑过去安全，在交汇处起跳会撞上（提前跳满可越过其上方）", () => {
    const run = eagleSession();
    expect(runUntil(run.session, run.cat, 600)).toBe(false);
    // The eagle passed overhead with clearance and is now behind the cat.
    expect(run.eagle.x + run.eagle.width).toBeLessThan(run.cat.x);

    const jumped = eagleSession();
    runUntil(jumped.session, jumped.cat, jumped.eagle.crossX - jumped.cat.width / 2 - 12);
    jumped.session.jump();
    expect(runUntil(jumped.session, jumped.cat, 600)).toBe(true);
    expect(jumped.session.snapshot().failureReason).toBe("eagle");
  });

  it("飞鹰位置只由小猫进度决定，任何速度下都在 crossX 交汇", () => {
    const eagle: Eagle = { crossX: 500, x: 0, y: 0, width: 30, height: 14 };
    for (const vx of [200, 270, 300]) {
      const cat = { x: 500 - 12, width: 24, vx } as Cat;
      placeEagle(eagle, cat);
      expect(eagle.x + eagle.width / 2).toBe(500);
      cat.x -= 100;
      placeEagle(eagle, cat);
      expect(eagle.x + eagle.width / 2).toBe(500 + 100 * ROOF_FEATURES.eagleSpeedRatio);
    }
  });

  it("飞鹰接近时给出预警，交汇后预警消失", () => {
    const { session, cat, eagle } = eagleSession();
    const warnings = new Set<string | null>();
    while (cat.x < eagle.crossX + 40) {
      expect(session.update(PHYSICS.fixedStep)).toBe(false);
      const ahead = eagle.x + eagle.width / 2 - (cat.x + cat.width / 2);
      const warning = session.snapshot().warning;
      warnings.add(warning);
      if (ahead > ROOF_FEATURES.eagleWarningDistance || ahead <= 0) expect(warning).toBeNull();
      else expect(warning).toBe("eagle");
    }
    expect(warnings).toEqual(new Set([null, "eagle"]));
  });

  it("依次单独引入挡板、信号塔、飞鹰，飞鹰交汇点避开落地区和起跳区", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 100; seed += 1) {
      const generator = new PlatformGenerator(seed);
      let previous = start;
      for (let index = 0; index < 60; index += 1) {
        const score = index * 25;
        const roof = generator.next(previous, score);
        if (roof.id === 3) expect(roof.hazard?.kind).toBe("barrier");
        if (roof.id === 7) expect(roof.hazard?.kind).toBe("tower");
        if (roof.id === 11) expect(roof.eagle).toBeDefined();
        if (roof.id < 11) expect(roof.eagle).toBeUndefined();
        expect(roof.hazard !== undefined && roof.eagle !== undefined).toBe(false);
        if (roof.hazard) kinds.add(roof.hazard.kind!);
        if (roof.eagle) {
          kinds.add("eagle");
          const speed = previous.x > 0 ? 300 : 200;
          expect(roof.eagle.crossX - roof.x).toBeGreaterThanOrEqual(hazardOffsetAt(200) + ROOF_FEATURES.eagleCrossOffset);
          expect(roof.x + roof.width - roof.eagle.crossX).toBeGreaterThanOrEqual(0.45 * speed);
          // Running cat's head stays below the eagle.
          expect(roof.y - PHYSICS.catHeight - (roof.eagle.y + roof.eagle.height)).toBe(ROOF_FEATURES.eagleClearance);
        }
        previous = roof;
      }
    }
    expect(kinds).toEqual(new Set(["barrier", "tower", "eagle"]));
  });
});
