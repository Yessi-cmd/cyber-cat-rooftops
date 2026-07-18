import { describe, expect, it } from "vitest";
import { UI_ICON_RECTS, type UiIconName } from "../src/ui/icons";

describe("pixel UI icons", () => {
  it("keeps every pixel inside the shared 24×24 icon grid", () => {
    for (const pixels of Object.values(UI_ICON_RECTS)) {
      for (const pixel of pixels) {
        expect(pixel.x).toBeGreaterThanOrEqual(0);
        expect(pixel.y).toBeGreaterThanOrEqual(0);
        expect(pixel.x + pixel.width).toBeLessThanOrEqual(24);
        expect(pixel.y + pixel.height).toBeLessThanOrEqual(24);
      }
    }
  });

  it("defines a visible, non-empty shape for every supported control state", () => {
    const names: UiIconName[] = ["soundOn", "soundOff", "pause"];
    for (const name of names) {
      expect(UI_ICON_RECTS[name].length).toBeGreaterThan(0);
    }
  });
});
