import { CAMERA, GAME_HEIGHT, GAME_WIDTH, PHYSICS, ROOF_FEATURES, SCORE, getDifficulty } from "./config";
import { sweptCatIntersects } from "./swept-collision";
import { PlatformGenerator } from "./platform-generator";
import type { Cat, Platform, WorldSnapshot } from "./types";

const START_PLATFORM: Platform = {
  id: 0,
  x: 0,
  y: 620,
  width: 260,
  height: 42,
};

export class GameSession {
  private seed = 1;
  private generator = new PlatformGenerator(this.seed);
  private cat: Cat = this.createCat();
  private platforms: Platform[] = [{ ...START_PLATFORM }];
  private cameraX = 0;
  private cameraY = 0;
  private cameraTargetY = 0;
  private score = 0;
  private landingBonus = 0;
  private furthestPlatformId = START_PLATFORM.id;
  private viewWidth = GAME_WIDTH;
  private coyoteRemaining = 0;
  private jumpBufferRemaining = 0;
  private jumps = 0;
  private collectedCount = 0;
  private failureReason: "fall" | "hazard" | null = null;

  get jumpCount(): number {
    return this.jumps;
  }

  clearPendingInput(): void {
    this.jumpBufferRemaining = 0;
  }

  constructor(seed = 1) {
    this.reset(seed);
  }

  reset(seed: number): void {
    this.seed = seed >>> 0 || 1;
    this.generator = new PlatformGenerator(this.seed);
    this.cat = this.createCat();
    this.platforms = [{ ...START_PLATFORM }];
    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraTargetY = 0;
    this.score = 0;
    this.coyoteRemaining = 0;
    this.jumpBufferRemaining = 0;
    this.jumps = 0;
    this.collectedCount = 0;
    this.failureReason = null;
    this.landingBonus = 0;
    this.furthestPlatformId = START_PLATFORM.id;
    this.fillPlatforms();
  }

  jump(): boolean {
    if (this.failureReason !== null) return false;
    if (!this.cat.grounded && this.coyoteRemaining <= 0) {
      // Only retain a press during descent; never grant an extra mid-air jump.
      if (this.cat.vy > 0) this.jumpBufferRemaining = PHYSICS.jumpBufferSeconds;
      return false;
    }

    this.coyoteRemaining = 0;
    this.jumpBufferRemaining = 0;
    this.jumps += 1;
    this.cat.grounded = false;
    this.cat.platformId = null;
    this.cat.vy = PHYSICS.jumpVelocity;
    return true;
  }

  setViewWidth(width: number): void {
    if (!Number.isFinite(width)) {
      return;
    }
    const nextWidth = Math.max(GAME_WIDTH, Math.round(width));
    if (nextWidth === this.viewWidth) return;
    this.viewWidth = nextWidth;
    this.fillPlatforms();
  }

  update(deltaSeconds: number): boolean {
    if (this.failureReason !== null) return true;
    const delta = Math.max(0, Math.min(deltaSeconds, PHYSICS.maxFrameDelta));
    const difficulty = getDifficulty(this.score - this.collectedCount * ROOF_FEATURES.rewardPoints);
    if (this.cat.grounded && this.jumpBufferRemaining > 0) this.jump();
    this.jumpBufferRemaining = Math.max(0, this.jumpBufferRemaining - delta);
    this.coyoteRemaining = Math.max(0, this.coyoteRemaining - delta);
    this.cat.vx = difficulty.runSpeed;
    this.cat.previousX = this.cat.x;
    this.cat.previousY = this.cat.y;
    this.cat.x += this.cat.vx * delta;

    if (this.cat.grounded && !this.isSupported()) {
      this.coyoteRemaining = PHYSICS.coyoteSeconds;
      this.cat.grounded = false;
      this.cat.platformId = null;
    }

    if (this.cat.grounded) {
      const support = this.platforms.find((platform) => platform.id === this.cat.platformId);
      if (support !== undefined) {
        this.cat.y = support.y - this.cat.height;
      }
      this.cat.vy = 0;
    } else {
      this.cat.vy += PHYSICS.gravity * delta;
      this.cat.y += this.cat.vy * delta;
      this.resolveLanding();
    }

    if (this.resolveFeatures()) return true;

    this.score = Math.max(
      this.score,
      Math.floor(Math.max(0, this.cat.x - 70) / SCORE.distancePixelsPerPoint) +
        this.landingBonus + this.collectedCount * ROOF_FEATURES.rewardPoints,
    );

    const horizontalLead = Math.max(CAMERA.horizontalLead, this.viewWidth * 0.28);
    this.cameraX = Math.max(this.cameraX, this.cat.x - horizontalLead);
    if (this.cat.grounded) {
      this.cameraTargetY = Math.max(this.cameraTargetY, this.cat.y - CAMERA.verticalLead);
    }
    const cameraDistance = this.cameraTargetY - this.cameraY;
    this.cameraY += Math.min(cameraDistance, difficulty.scrollSpeed * delta);

    this.fillPlatforms();
    this.prunePlatforms();

    const lost = this.cat.y > this.cameraY + GAME_HEIGHT + 80 ||
      this.cat.x + this.cat.width < this.cameraX - 40;
    if (lost) this.failureReason = "fall";
    return lost;
  }

  snapshot(): WorldSnapshot {
    return {
      cat: this.cat,
      platforms: this.platforms,
      cameraX: this.cameraX,
      cameraY: this.cameraY,
      score: this.score,
      seed: this.seed,
      collectedCount: this.collectedCount,
      failureReason: this.failureReason,
    };
  }

  private resolveFeatures(): boolean {
    for (const platform of this.platforms) {
      if (platform.hazard && sweptCatIntersects(this.cat, platform.hazard)) {
        this.failureReason = "hazard";
        this.clearPendingInput();
        return true;
      }
    }
    for (const platform of this.platforms) {
      for (const reward of platform.rewards ?? []) {
        if (!reward.collected && sweptCatIntersects(this.cat, reward)) {
          reward.collected = true;
          this.collectedCount += 1;
        }
      }
    }
    return false;
  }

  private createCat(): Cat {
    return {
      x: 70,
      y: START_PLATFORM.y - PHYSICS.catHeight,
      previousX: 70,
      previousY: START_PLATFORM.y - PHYSICS.catHeight,
      width: PHYSICS.catWidth,
      height: PHYSICS.catHeight,
      vx: PHYSICS.runSpeed,
      vy: 0,
      grounded: true,
      platformId: START_PLATFORM.id,
    };
  }

  private isSupported(): boolean {
    const platform = this.platforms.find((item) => item.id === this.cat.platformId);
    if (platform === undefined) {
      return false;
    }

    return this.cat.x + this.cat.width > platform.x && this.cat.x < platform.x + platform.width;
  }

  private resolveLanding(): void {
    if (this.cat.vy <= 0) {
      return;
    }

    const previousBottom = this.cat.previousY + this.cat.height;
    const currentBottom = this.cat.y + this.cat.height;
    if (currentBottom <= previousBottom) {
      return;
    }

    for (const platform of this.platforms) {
      if (previousBottom >= platform.y || currentBottom < platform.y) {
        continue;
      }

      const crossing = (platform.y - previousBottom) / (currentBottom - previousBottom);
      const crossingX = this.cat.previousX + (this.cat.x - this.cat.previousX) * crossing;
      const overlaps =
        crossingX + this.cat.width > platform.x && crossingX < platform.x + platform.width;

      if (!overlaps) {
        continue;
      }

      this.cat.y = platform.y - this.cat.height;
      this.cat.vy = 0;
      this.cat.grounded = true;
      this.cat.platformId = platform.id;
      if (platform.id > this.furthestPlatformId) {
        this.landingBonus += SCORE.landingBonus;
        this.furthestPlatformId = platform.id;
      }
      return;
    }
  }

  private fillPlatforms(): void {
    let last = this.platforms.at(-1);
    if (last === undefined) {
      return;
    }

    const requiredX = this.cameraX + this.viewWidth + GAME_WIDTH;
    while (last.x + last.width < requiredX) {
      // Estimate progress at this roof, independently of when it enters the viewport.
      const generationScore =
        Math.floor(Math.max(0, last.x - 70) / SCORE.distancePixelsPerPoint) +
        last.id * SCORE.landingBonus;
      const next = this.generator.next(last, generationScore);
      this.platforms.push(next);
      last = next;
    }
  }

  private prunePlatforms(): void {
    const cutoff = this.cameraX - this.viewWidth * 0.5;
    let removeCount = 0;
    for (const platform of this.platforms) {
      if (platform.x + platform.width >= cutoff || platform.id === this.cat.platformId) break;
      removeCount += 1;
    }
    if (removeCount > 0) this.platforms.splice(0, removeCount);
  }
}
