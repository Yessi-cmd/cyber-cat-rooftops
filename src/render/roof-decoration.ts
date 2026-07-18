export type RoofDecorationKind = "none" | "vent" | "antenna" | "waterTank";

export interface RoofDecorationSpec {
  readonly width: number;
  readonly height: number;
  readonly minimumPlatformWidth: number;
}

export const ROOF_DECORATION_SAFE_MARGIN = 36;

export const ROOF_DECORATION_SPECS: Readonly<
  Record<Exclude<RoofDecorationKind, "none">, RoofDecorationSpec>
> = {
  vent: { width: 24, height: 20, minimumPlatformWidth: 126 },
  antenna: { width: 18, height: 36, minimumPlatformWidth: 150 },
  waterTank: { width: 44, height: 48, minimumPlatformWidth: 196 },
};

export function selectRoofDecoration(
  platformId: number,
  platformWidth: number,
): RoofDecorationKind {
  if (platformId === 0 || platformWidth < ROOF_DECORATION_SPECS.vent.minimumPlatformWidth) {
    return "none";
  }

  const roll = hashUnit(platformId * 53 + Math.round(platformWidth) * 11);

  if (platformWidth >= ROOF_DECORATION_SPECS.waterTank.minimumPlatformWidth) {
    if (roll < 0.24) return "waterTank";
    if (roll < 0.52) return "antenna";
    if (roll < 0.84) return "vent";
    return "none";
  }

  if (platformWidth >= ROOF_DECORATION_SPECS.antenna.minimumPlatformWidth) {
    if (roll < 0.4) return "antenna";
    if (roll < 0.8) return "vent";
    return "none";
  }

  return roll < 0.74 ? "vent" : "none";
}

export function getRoofDecorationOffset(
  platformId: number,
  platformWidth: number,
  kind: Exclude<RoofDecorationKind, "none">,
): number {
  const spec = ROOF_DECORATION_SPECS[kind];
  const minimum = ROOF_DECORATION_SAFE_MARGIN;
  const maximum = Math.max(minimum, platformWidth - ROOF_DECORATION_SAFE_MARGIN - spec.width);
  const usableRange = maximum - minimum;
  return minimum + Math.round(hashUnit(platformId * 89 + platformWidth * 7) * usableRange);
}

export function hasVentSteam(platformId: number): boolean {
  return hashUnit(platformId * 131 + 17) > 0.42;
}

function hashUnit(value: number): number {
  let hash = Math.imul(value | 0, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}
