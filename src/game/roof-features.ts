import { ROOF_FEATURES } from "./config";
import type { Cat, Platform, Reward } from "./types";

export function hasHazardRoof(id: number, score: number): boolean {
  return id >= ROOF_FEATURES.firstHazardId &&
    (id % 4 === 3 || (score >= 500 && id % 4 === 1));
}

// Features use world coordinates and platform IDs, never viewport or wall-clock time.
export function addRoofFeatures(previous: Platform, platform: Platform, hazardRoof: boolean, popup = false): Platform {
  const rewards: Reward[] = [];
  const addReward = (centerX: number, centerY: number): void => {
    rewards.push({
      x: Math.round(centerX - ROOF_FEATURES.rewardWidth / 2),
      y: Math.round(centerY - ROOF_FEATURES.rewardHeight / 2),
      width: ROOF_FEATURES.rewardWidth,
      height: ROOF_FEATURES.rewardHeight,
      collected: false,
    });
  };

  const gapCenter = (previous.x + previous.width + platform.x) / 2;
  addReward(gapCenter, Math.min(previous.y, platform.y) - (platform.gapKind === "far" ? 112 : 54));

  if (hazardRoof) {
    const x = platform.x + ROOF_FEATURES.hazardOffset + (platform.id % 3) * 12;
    platform.hazard = {
      x, y: platform.y - ROOF_FEATURES.hazardHeight,
      width: ROOF_FEATURES.hazardWidth, height: ROOF_FEATURES.hazardHeight,
      ...(popup ? { popup: { phase: "hidden" as const, elapsed: 0 } } : {}),
    };
    addReward(x - 20, platform.y - 46);
    addReward(x + 16, platform.y - 72);
    addReward(x + 52, platform.y - 46);
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
