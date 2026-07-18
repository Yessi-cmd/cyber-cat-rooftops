import { describe, expect, it } from "vitest";
import {
  getRoofDecorationOffset,
  hasVentSteam,
  ROOF_DECORATION_SAFE_MARGIN,
  ROOF_DECORATION_SPECS,
  selectRoofDecoration,
  type RoofDecorationKind,
} from "../src/render/roof-decoration";

describe("roof decoration selection", () => {
  it("keeps the starting platform and narrow high-difficulty platforms clear", () => {
    expect(selectRoofDecoration(0, 240)).toBe("none");
    for (let id = 1; id < 100; id += 1) {
      expect(selectRoofDecoration(id, 125)).toBe("none");
    }
  });

  it("returns the same decoration, position, and steam choice for the same platform", () => {
    const kind = selectRoofDecoration(37, 214);
    expect(selectRoofDecoration(37, 214)).toBe(kind);
    expect(hasVentSteam(37)).toBe(hasVentSteam(37));
    if (kind !== "none") {
      expect(getRoofDecorationOffset(37, 214, kind)).toBe(
        getRoofDecorationOffset(37, 214, kind),
      );
    }
  });

  it("keeps every generated decoration inside both safe margins", () => {
    const widths = [126, 149, 150, 195, 196, 220, 260];
    for (const width of widths) {
      for (let id = 1; id <= 1_000; id += 1) {
        const kind = selectRoofDecoration(id, width);
        if (kind === "none") continue;

        const offset = getRoofDecorationOffset(id, width, kind);
        expect(offset).toBeGreaterThanOrEqual(ROOF_DECORATION_SAFE_MARGIN);
        expect(offset + ROOF_DECORATION_SPECS[kind].width).toBeLessThanOrEqual(
          width - ROOF_DECORATION_SAFE_MARGIN,
        );
      }
    }
  });

  it("only selects props whose platform width meets their specification", () => {
    for (let width = 1; width <= 260; width += 1) {
      for (let id = 1; id <= 200; id += 1) {
        const kind = selectRoofDecoration(id, width);
        if (kind !== "none") {
          expect(width).toBeGreaterThanOrEqual(
            ROOF_DECORATION_SPECS[kind].minimumPlatformWidth,
          );
        }
      }
    }
  });

  it("produces all three prop families across wide platforms", () => {
    const kinds = new Set<RoofDecorationKind>();
    for (let id = 1; id <= 1_000; id += 1) {
      kinds.add(selectRoofDecoration(id, 220));
    }
    expect(kinds).toEqual(new Set(["none", "vent", "antenna", "waterTank"]));
  });

  it("makes steam presence deterministic while retaining both visual variants", () => {
    const choices = new Set<boolean>();
    for (let id = 1; id <= 200; id += 1) {
      choices.add(hasVentSteam(id));
    }
    expect(choices).toEqual(new Set([true, false]));
  });
});
