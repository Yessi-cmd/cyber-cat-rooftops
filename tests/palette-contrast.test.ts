import { describe, expect, it } from "vitest";
import { PALETTE } from "../src/render/palette";

describe("M3 grayscale hierarchy", () => {
  it("猫与可落平台在灰度亮度上明显高于玩法背景", () => {
    expect(contrastRatio(PALETTE.catOrange, PALETTE.night)).toBeGreaterThan(7);
    expect(contrastRatio(PALETTE.catCream, PALETTE.night)).toBeGreaterThan(12);
    expect(contrastRatio(PALETTE.roofOrange, PALETTE.violet)).toBeGreaterThan(4.5);
    expect(contrastRatio(PALETTE.warmYellow, PALETTE.violetDark)).toBeGreaterThan(7);
  });

  it("远景与夜空保持低对比，避免伪装成平台", () => {
    expect(contrastRatio(PALETTE.violetDark, PALETTE.night)).toBeLessThan(1.5);
    expect(contrastRatio(PALETTE.nightLift, PALETTE.night)).toBeLessThan(1.2);
  });
});

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function relativeLuminance(hex: string): number {
  const red = channel(hex, 1);
  const green = channel(hex, 3);
  const blue = channel(hex, 5);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function channel(hex: string, start: number): number {
  const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
