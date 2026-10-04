import { ROOF_FEATURES } from "./config";
import type { Platform, Reward } from "./types";

export function hasHazardRoof(id: number, score: number): boolean {
  return id >= ROOF_FEATURES.firstHazardId &&
    (id % 4 === 3 || (score >= 500 && id % 4 === 1));
}

// Features use world coordinates and platform IDs, never viewport or wall-clock time.
export function addRoofFeatures(previous: Platform, platform: Platform, hazardRoof: boolean): Platform {
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
  addReward(gapCenter, Math.min(previous.y, platform.y) - 112);

  if (hazardRoof) {
    const x = platform.x + ROOF_FEATURES.hazardOffset + (platform.id % 3) * 12;
    platform.hazard = {
      x, y: platform.y - ROOF_FEATURES.hazardHeight,
      width: ROOF_FEATURES.hazardWidth, height: ROOF_FEATURES.hazardHeight,
    };
    addReward(x - 20, platform.y - 46);
    addReward(x + 16, platform.y - 72);
    addReward(x + 52, platform.y - 46);
  }
  platform.rewards = rewards;
  return platform;
}
