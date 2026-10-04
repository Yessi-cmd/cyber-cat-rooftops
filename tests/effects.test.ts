import { describe, expect, it } from "vitest";
import { EffectLayer, FLIP_DURATION_MS } from "../src/render/effects";

function recordingContext() {
  const rects: number[] = [];
  const texts: string[] = [];
  const context = {
    globalAlpha: 1,
    fillStyle: "",
    font: "",
    textAlign: "start",
    fillRect: () => rects.push(1),
    fillText: (text: string) => texts.push(text),
  };
  return { context: context as unknown as CanvasRenderingContext2D, rects, texts };
}

describe("EffectLayer", () => {
  it("粒子与飘字使用固定容量，过期后自动停止绘制", () => {
    const effects = new EffectLayer();
    for (let index = 0; index < 20; index += 1) effects.burst(0, 0, 10, "#000", 0.1, 0.1, 0);
    for (let index = 0; index < 10; index += 1) effects.floatText(0, 0, `+${index}`, "#000", 0);
    const live = recordingContext();
    effects.draw(live.context, 0, 0, 10, false);
    expect(live.rects.length).toBeLessThanOrEqual(48);
    expect(live.texts.length).toBe(12); // 6 texts, each with a shadow pass
    const expired = recordingContext();
    effects.draw(expired.context, 0, 0, 5_000, false);
    expect(expired.rects.length + expired.texts.length).toBe(0);
  });

  it("减少动态时不抖动、不翻转、不画粒子，但保留得分飘字", () => {
    const effects = new EffectLayer();
    effects.shake(3, 300, 0);
    effects.flip(0);
    effects.burst(0, 0, 8, "#000", 0.1, 0.1, 0);
    effects.floatText(0, 0, "+8", "#000", 0);
    expect(effects.shakeOffsetX(50, true)).toBe(0);
    expect(effects.shakeOffsetY(50, true)).toBe(0);
    expect(effects.flipAngle(50, true)).toBe(0);
    const reduced = recordingContext();
    effects.draw(reduced.context, 0, 0, 50, true);
    expect(reduced.rects.length).toBe(0);
    expect(reduced.texts).toContain("+8");

    expect(effects.flipAngle(FLIP_DURATION_MS / 2, false)).not.toBe(0);
    expect(effects.flipAngle(FLIP_DURATION_MS + 1, false)).toBe(0);
    effects.shake(3, 300, 0);
    effects.clear();
    expect(effects.shakeOffsetX(10, false)).toBe(0);
  });
});
