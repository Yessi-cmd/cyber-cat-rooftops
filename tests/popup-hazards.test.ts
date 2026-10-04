import { describe, expect, it } from "vitest";
import { PHYSICS, ROOF_FEATURES } from "../src/game/config";
import { advancePopupHazards } from "../src/game/roof-features";
import { GameSession } from "../src/game/session";
import type { Cat } from "../src/game/types";

function popupSession() {
  const session = new GameSession(41);
  const platform = session.snapshot().platforms[0]!;
  platform.width = 600;
  platform.hazard = { x: 340, y: 600, width: 24, height: 20,
    popup: { phase: "hidden", elapsed: 0 } };
  return { session, platform, popup: platform.hazard.popup!, cat: session.snapshot().cat as Cat };
}

describe("突发路障", () => {
  it("接近才预警，完整预警之后才激活，最快跑速仍有反应时间", () => {
    const { platform, popup, cat } = popupSession();
    cat.x = platform.hazard!.x - cat.width - ROOF_FEATURES.popupTriggerDistance - 1;
    cat.vx = 270;
    advancePopupHazards([platform], cat, PHYSICS.fixedStep);
    expect(popup.phase).toBe("hidden");
    cat.x += 1;
    advancePopupHazards([platform], cat, PHYSICS.fixedStep);
    expect(popup.phase).toBe("warning");
    expect(popup.elapsed).toBe(0);
    for (let frame = 0; frame < 41; frame += 1) {
      cat.x += cat.vx * PHYSICS.fixedStep;
      advancePopupHazards([platform], cat, PHYSICS.fixedStep);
      expect(popup.phase).toBe("warning");
    }
    cat.x += cat.vx * PHYSICS.fixedStep;
    advancePopupHazards([platform], cat, PHYSICS.fixedStep);
    expect(popup.phase).toBe("active");
    expect((platform.hazard!.x - cat.x - cat.width) / cat.vx).toBeGreaterThanOrEqual(0.54);
  });

  it("隐藏与预警轮廓均不伤害，升起的实体会触发失败", () => {
    for (const phase of ["hidden", "warning", "active"] as const) {
      const { session, popup, cat } = popupSession();
      popup.phase = phase;
      cat.x = 316;
      expect(session.update(PHYSICS.fixedStep)).toBe(phase === "active");
      expect(session.snapshot().failureReason).toBe(phase === "active" ? "hazard" : null);
    }
  });

  it("无模拟推进不会耗尽预警，重开恢复隐藏状态", () => {
    const session = new GameSession(99);
    session.setViewWidth(1400);
    const hazard = session.snapshot().platforms.find(p => p.id === 3)!.hazard!;
    expect(hazard.popup?.phase).toBe("hidden");
    hazard.popup!.phase = "warning";
    hazard.popup!.elapsed = 0.2;
    session.clearPendingInput();
    for (let frame = 0; frame < 100; frame += 1) {
      advancePopupHazards(session.snapshot().platforms, session.snapshot().cat, 0);
    }
    expect(hazard.popup!.elapsed).toBe(0.2);
    session.reset(99);
    expect(session.snapshot().platforms.find(p => p.id === 3)!.hazard!.popup?.phase).toBe("hidden");
  });

  it("玩家看到预警后可在实体升起前后正常越障", () => {
    const { session, popup, cat } = popupSession();
    let sawWarning = false;
    let jumped = false;
    for (let frame = 0; frame < 200 && cat.x < 390; frame += 1) {
      sawWarning ||= popup.phase === "warning";
      if (sawWarning && !jumped && cat.x >= 340 - cat.width - cat.vx * 0.15) {
        jumped = session.jump();
      }
      expect(session.update(PHYSICS.fixedStep)).toBe(false);
    }
    expect(sawWarning && jumped).toBe(true);
    expect(cat.x).toBeGreaterThan(364);
    expect(popup.phase).toBe("active");
  });
});
