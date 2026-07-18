import { CAMERA, GAME_HEIGHT, GAME_WIDTH, PHYSICS, SCORE, getDifficulty } from "./config";
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
  private score = 0;
  private landingBonus = 0;
  private furthestPlatformId = START_PLATFORM.id;
  private viewWidth = GAME_WIDTH;

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
    this.score = 0;
    this.landingBonus = 0;
    this.furthestPlatformId = START_PLATFORM.id;
    this.fillPlatforms();
  }

  jump(): boolean {
    if (!this.cat.grounded) {
      return false;
    }

    this.cat.grounded = false;
    this.cat.platformId = null;
    this.cat.vy = PHYSICS.jumpVelocity;
    return true;
  }

  setViewWidth(width: number): void {
    if (!Number.isFinite(width)) {
      return;
    }
    this.viewWidth = Math.max(GAME_WIDTH, Math.round(width));
    this.fillPlatforms();
  }

  update(deltaSeconds: number): boolean {
    const delta = Math.max(0, Math.min(deltaSeconds, PHYSICS.maxFrameDelta));
    const difficulty = getDifficulty(this.score);
    this.cat.vx = difficulty.runSpeed;
    this.cat.previousX = this.cat.x;
    this.cat.previousY = this.cat.y;
    this.cat.x += this.cat.vx * delta;

    if (this.cat.grounded && !this.isSupported()) {
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

    this.score = Math.max(
      this.score,
      Math.floor(Math.max(0, this.cat.x - 70) / SCORE.distancePixelsPerPoint) +
        this.landingBonus,
    );

    const horizontalLead = Math.max(CAMERA.horizontalLead, this.viewWidth * 0.28);
    this.cameraX = Math.max(this.cameraX, this.cat.x - horizontalLead);
    const groundedCameraTarget = this.cat.grounded
      ? Math.max(this.cameraY, this.cat.y - CAMERA.verticalLead)
      : this.cameraY;
    const cameraDistance = groundedCameraTarget - this.cameraY;
    this.cameraY += Math.min(cameraDistance, difficulty.scrollSpeed * delta);

    this.fillPlatforms();
    this.prunePlatforms();

    return (
      this.cat.y > this.cameraY + GAME_HEIGHT + 80 ||
      this.cat.x + this.cat.width < this.cameraX - 40
    );
  }

  snapshot(): WorldSnapshot {
    return {
      cat: this.cat,
      platforms: this.platforms,
      cameraX: this.cameraX,
      cameraY: this.cameraY,
      score: this.score,
      seed: this.seed,
    };
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
      if (previousBottom > platform.y || currentBottom < platform.y) {
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
      const next = this.generator.next(last, this.score);
      this.platforms.push(next);
      last = next;
    }
  }

  private prunePlatforms(): void {
    const cutoff = this.cameraX - this.viewWidth * 0.5;
    this.platforms = this.platforms.filter(
      (platform) => platform.x + platform.width >= cutoff || platform.id === this.cat.platformId,
    );
  }
}
