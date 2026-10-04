import { ENEMIES, PHYSICS, ROOF_FEATURES } from "./config";
import { createEnemy } from "./enemies";
import type { Cat, Eagle, Platform, Reward, RoofFeatureKind } from "./types";

export function hasHazardRoof(id: number, score: number): boolean {
  return id >= ROOF_FEATURES.firstHazardId &&
    (id % 4 === 3 || (score >= 500 && id % 4 === 1));
}

// Features use world coordinates and platform IDs, never viewport or wall-clock time.
export function addRoofFeatures(
  previous: Platform,
  platform: Platform,
  feature: RoofFeatureKind | null,
  popup = false,
  hazardOffset: number = ROOF_FEATURES.hazardOffset,
): Platform {
  const rewards: Reward[] = [];
  const addReward = (centerX: number, centerY: number, gap = false): void => {
    rewards.push({
      ...(gap ? { gap } : {}),
      x: Math.round(centerX - ROOF_FEATURES.rewardWidth / 2),
      y: Math.round(centerY - ROOF_FEATURES.rewardHeight / 2),
      width: ROOF_FEATURES.rewardWidth,
      height: ROOF_FEATURES.rewardHeight,
      collected: false,
    });
  };

  const gapCenter = (previous.x + previous.width + platform.x) / 2;
  addReward(gapCenter, Math.min(previous.y, platform.y) - (platform.gapKind === "far" ? 112 : 54), true);

  const x = platform.x + hazardOffset + (platform.id % 3) * 12;
  if (feature === "barrier") {
    platform.hazard = {
      kind: "barrier",
      x, y: platform.y - ROOF_FEATURES.hazardHeight,
      width: ROOF_FEATURES.hazardWidth, height: ROOF_FEATURES.hazardHeight,
      ...(popup ? { popup: { phase: "hidden" as const, elapsed: 0 } } : {}),
    };
    addReward(x - 20, platform.y - 46);
    addReward(x + 16, platform.y - 72);
    addReward(x + 52, platform.y - 46);
  } else if (feature === "tower") {
    platform.hazard = {
      kind: "tower",
      x, y: platform.y - ROOF_FEATURES.towerHeight,
      width: ROOF_FEATURES.towerWidth, height: ROOF_FEATURES.towerHeight,
    };
    // A higher arc that only a held jump follows.
    addReward(x - 22, platform.y - 70);
    addReward(x + 7, platform.y - 96);
    addReward(x + 36, platform.y - 70);
  } else if (feature === "eagle") {
    const crossX = x + ROOF_FEATURES.eagleCrossOffset;
    platform.eagle = {
      crossX,
      x: crossX - ROOF_FEATURES.eagleWidth / 2,
      y: platform.y - PHYSICS.catHeight - ROOF_FEATURES.eagleClearance - ROOF_FEATURES.eagleHeight,
      width: ROOF_FEATURES.eagleWidth,
      height: ROOF_FEATURES.eagleHeight,
    };
    // Fish along the running line reward staying low under the eagle.
    for (const offset of [-36, 0, 36]) addReward(crossX + offset, platform.y - 14);
  } else if (feature !== null) {
    const anchorX = x + ENEMIES.anchorAfterOffset + (feature === "crow" ? ENEMIES.crowCrossOffset : 0);
    platform.enemy = createEnemy(feature, platform, anchorX);
    // A fish arc over each enemy rewards clearing it in the air.
    addReward(anchorX - 22, platform.y - 64);
    addReward(anchorX, platform.y - 86);
    addReward(anchorX + 22, platform.y - 64);
  }
  platform.rewards = rewards;
  return platform;
}

// Simulation time only: pausing stops the warning; viewport and wall-clock never affect it.
export function advancePopupHazards(platforms: readonly Platform[], cat: Readonly<Cat>, delta: number): void {
  for (const platform of platforms) {
    const hazard = platform.hazard;
    const popup = hazard?.popup;
    if (!hazard || !popup || popup.phase === "active") continue;
    if (popup.phase === "hidden") {
      if (hazard.x - cat.x - cat.width <= ROOF_FEATURES.popupTriggerDistance) {
        popup.phase = "warning";
        popup.elapsed = 0;
      }
    } else {
      popup.elapsed += delta;
      if (popup.elapsed >= ROOF_FEATURES.popupWarningSeconds) popup.phase = "active";
    }
  }
}

// Eagle x is a pure function of cat progress: centres meet exactly at crossX,
// independent of speed, frame rate or pauses.
export function placeEagle(eagle: Eagle, cat: Readonly<Cat>): void {
  const catCenter = cat.x + cat.width / 2;
  const center = eagle.crossX + ROOF_FEATURES.eagleSpeedRatio * (eagle.crossX - catCenter);
  eagle.x = center - eagle.width / 2;
}
