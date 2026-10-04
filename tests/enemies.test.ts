import { describe, expect, it } from "vitest";
import { ENEMIES, PHYSICS, POWERS } from "../src/game/config";
import { createEnemy, placeEnemy } from "../src/game/enemies";
import { PlatformGenerator } from "../src/game/platform-generator";
import { GameSession } from "../src/game/session";
import type { Cat, EnemyKind, Platform } from "../src/game/types";

const start: Platform = { id: 0, x: 0, y: 620, width: 260, height: 42 };

// Long isolated roof with one enemy anchored ahead of the cat.
function arena(kind: EnemyKind, anchorX = 500) {
  const session = new GameSession(1);
  const platforms = session.snapshot().platforms as Platform[];
  platforms.splice(1);
  const roof = platforms[0]!;
  roof.width = 5000;
  roof.enemy = createEnemy(kind, roof, anchorX);
  const cat = session.snapshot().cat as Cat;
  return { session, roof, enemy: roof.enemy, cat };
}

function runTo(session: GameSession, cat: Cat, x: number, onStep?: () => void): boolean {
  while (cat.x < x) {
    onStep?.();
    if (session.update(PHYSICS.fixedStep)) return true;
  }
  return false;
}

// Jump so the held arc is centred on world x (cat centre).
function jumpOver(session: GameSession, cat: Cat, centerX: number, releaseAfter: number | null = null): boolean {
  if (runTo(session, cat, centerX - cat.width / 2 - 0.3 * cat.vx)) return true;
  session.jump();
  for (let step = 0; step < 90; step += 1) {
    if (step === releaseAfter) session.releaseJump();
    if (session.update(PHYSICS.fixedStep)) return true;
  }
  return false;
}

describe("强力敌人", () => {
  it("四种敌人依次在 15/19/23/27 栋单独登场，之后与旧障碍混合，且不与其他障碍同屋", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed += 1) {
      const generator = new PlatformGenerator(seed);
      let previous = start;
      for (let index = 0; index < 70; index += 1) {
        const roof = generator.next(previous, index * 30);
        const intro = (ENEMIES.introductions as Record<number, string>)[roof.id];
        if (intro) expect(roof.enemy?.kind).toBe(intro);
        if (roof.id < 15) expect(roof.enemy).toBeUndefined();
        if (roof.enemy) {
          seen.add(roof.enemy.kind);
          expect(roof.hazard ?? roof.eagle ?? roof.power).toBeUndefined();
          // Room to land before it and to take off after it.
          expect(roof.enemy.anchorX - roof.x).toBeGreaterThanOrEqual(140);
          expect(roof.x + roof.width - roof.enemy.anchorX).toBeGreaterThanOrEqual(130);
        }
        previous = roof;
      }
    }
    expect(seen).toEqual(new Set(["robot", "laser", "crow", "pot"]));
  });

  it("巡逻机器人：撞上失败，轻跳越过安全，从上方踩扁弹起并补满跳跃", () => {
    const hit = arena("robot");
    expect(runTo(hit.session, hit.cat, 900)).toBe(true);
    expect(hit.session.snapshot().failureReason).toBe("robot");

    const hop = arena("robot");
    placeEnemy(hop.enemy, hop.cat, 0);
    // Short hop (released after 50 ms) is enough for an 18 px robot.
    let lost = false;
    runTo(hop.session, hop.cat, 900, () => {
      if (lost || !hop.cat.grounded) return;
      const gap = hop.enemy.x - (hop.cat.x + hop.cat.width);
      if (gap > 0 && gap < 0.15 * hop.cat.vx) {
        hop.session.jump();
        for (let step = 0; step < 6; step += 1) lost ||= hop.session.update(PHYSICS.fixedStep);
        hop.session.releaseJump();
      }
    });
    expect(lost).toBe(false);
    expect(hop.session.snapshot().failureReason).toBeNull();

    // Drop straight onto the robot from above.
    const stomp = arena("robot");
    // The robot moves with the cat, so settle on a spot right above it.
    for (let index = 0; index < 8; index += 1) {
      placeEnemy(stomp.enemy, stomp.cat, 0);
      stomp.cat.x = stomp.enemy.x - 30; // relative drift ~35 px during the fall
    }
    stomp.cat.previousX = stomp.cat.x;
    stomp.cat.y = stomp.enemy.y - stomp.cat.height - 20;
    stomp.cat.previousY = stomp.cat.y;
    stomp.cat.grounded = false;
    stomp.cat.platformId = null;
    stomp.cat.jumpsRemaining = 0;
    stomp.cat.vy = 0;
    let bounced = false;
    for (let step = 0; step < 60 && !bounced; step += 1) {
      expect(stomp.session.update(PHYSICS.fixedStep)).toBe(false);
      bounced = stomp.session.snapshot().stomps === 1;
    }
    expect(bounced).toBe(true);
    expect(stomp.enemy.broken).toBe(true);
    expect(stomp.cat.vy).toBeLessThan(0);
    expect(stomp.cat.jumpsRemaining).toBe(PHYSICS.maxJumps);
  });

  it("激光按模拟时间闪烁：熄灭时可跑过，亮起时撞上，跳满任何时候都能越过", () => {
    const { enemy, cat } = arena("laser");
    const states = new Set<boolean>();
    for (let t = 0; t < ENEMIES.laserPeriod; t += 0.05) {
      placeEnemy(enemy, cat, t);
      states.add(enemy.active);
    }
    expect(states).toEqual(new Set([true, false]));

    const outcomes = new Set<boolean>();
    for (let delay = 0; delay < 12; delay += 1) {
      const run = arena("laser", 500 + delay * 23);
      outcomes.add(runTo(run.session, run.cat, 1100));
      if (run.session.snapshot().failureReason !== null) expect(run.session.snapshot().failureReason).toBe("laser");
      const jumped = arena("laser", 500 + delay * 23);
      expect(jumpOver(jumped.session, jumped.cat, jumped.enemy.anchorX + 3), `delay=${delay}`).toBe(false);
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it("乌鸦俯冲：一直跑会被撞，看准时机跳过安全，并给出预警", () => {
    const run = arena("crow");
    const warnings = new Set<string | null>();
    expect(runTo(run.session, run.cat, 900, () => warnings.add(run.session.snapshot().warning))).toBe(true);
    expect(run.session.snapshot().failureReason).toBe("crow");
    expect(warnings.has("crow")).toBe(true);

    const jump = arena("crow");
    expect(jumpOver(jump.session, jump.cat, jump.enemy.anchorX)).toBe(false);
    expect(runTo(jump.session, jump.cat, 900)).toBe(false);
  });

  it("花盆：落地前无害、落地后碎片挡路，跳过碎片安全", () => {
    const run = arena("pot");
    const warnings = new Set<string | null>();
    let activeEarly = false;
    expect(runTo(run.session, run.cat, 900, () => {
      warnings.add(run.session.snapshot().warning);
      const ahead = run.enemy.anchorX - (run.cat.x + run.cat.width / 2);
      if (ahead > ENEMIES.potLandDistance + 1 && run.enemy.active) activeEarly = true;
    })).toBe(true);
    expect(activeEarly).toBe(false);
    expect(run.session.snapshot().failureReason).toBe("pot");
    expect(warnings.has("pot")).toBe(true);

    const hop = arena("pot");
    expect(jumpOver(hop.session, hop.cat, hop.enemy.anchorX)).toBe(false);
    expect(runTo(hop.session, hop.cat, 900)).toBe(false);
  });

  it("护盾撞碎敌人；火箭飞行中无视敌人", () => {
    for (const kind of ["robot", "crow", "pot"] as const) {
      const shielded = arena(kind);
      shielded.roof.power = { kind: "shield", x: shielded.cat.x + 25, y: shielded.cat.y + 4, width: 18, height: 18, collected: false };
      expect(runTo(shielded.session, shielded.cat, 900), kind).toBe(false);
      expect(shielded.enemy.broken, kind).toBe(true);
    }
    const rocket = arena("robot", 420);
    rocket.roof.power = { kind: "rocket", x: rocket.cat.x + 25, y: rocket.cat.y + 4, width: 18, height: 18, collected: false };
    rocket.session.update(PHYSICS.fixedStep);
    expect(rocket.session.snapshot().rocketing).toBe(true);
    // Force the cruise down onto the running line: still no collision.
    for (let step = 0; step < POWERS.rocketSeconds / PHYSICS.fixedStep / 2; step += 1) {
      rocket.cat.y = rocket.roof.y - rocket.cat.height;
      expect(rocket.session.update(PHYSICS.fixedStep)).toBe(false);
    }
  });
});
