import { GAME_HEIGHT, GAME_WIDTH } from "../game/config";
import type { GameState, WorldSnapshot } from "../game/types";
import { LAND_ANIMATION_DURATION_MS, selectCatPose } from "./cat-animation";
import { PALETTE } from "./palette";
import {
  getRoofDecorationOffset,
  hasVentSteam,
  ROOF_DECORATION_SPECS,
  selectRoofDecoration,
  type RoofDecorationKind,
} from "./roof-decoration";

export class Renderer {
  private readonly context: CanvasRenderingContext2D;
  private dpr = 1;
  private logicalWidth = GAME_WIDTH;
  private landingStartedAtMs: number | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("当前浏览器不支持 Canvas 2D");
    }
    this.context = context;
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  destroy(): void {
    window.removeEventListener("resize", this.resize);
  }

  get viewWidth(): number {
    return this.logicalWidth;
  }

  draw(snapshot: WorldSnapshot, gameState: GameState, reducedMotion: boolean): void {
    const context = this.context;
    const nowMs = performance.now();
    context.save();
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    this.drawSky(snapshot.cameraX, snapshot.cameraY, reducedMotion);
    this.drawPlatforms(snapshot, reducedMotion, nowMs);
    this.drawCat(snapshot, gameState, reducedMotion, nowMs);
    context.restore();
  }

  triggerLanding(nowMs = performance.now()): void {
    this.landingStartedAtMs = nowMs;
  }

  private readonly resize = (): void => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = this.canvas.getBoundingClientRect();
    const ratio = bounds.height > 0 ? bounds.width / bounds.height : GAME_WIDTH / GAME_HEIGHT;
    this.logicalWidth = Math.max(GAME_WIDTH, Math.round(GAME_HEIGHT * ratio));
    this.canvas.width = Math.round(this.logicalWidth * this.dpr);
    this.canvas.height = Math.round(GAME_HEIGHT * this.dpr);
  };

  private drawSky(cameraX: number, cameraY: number, reducedMotion: boolean): void {
    const context = this.context;
    const motionCameraX = reducedMotion ? 0 : cameraX;
    const motionCameraY = reducedMotion ? 0 : cameraY;
    const gradient = context.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    gradient.addColorStop(0, PALETTE.night);
    gradient.addColorStop(0.58, PALETTE.nightLift);
    gradient.addColorStop(1, PALETTE.violetDark);
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.logicalWidth, GAME_HEIGHT);

    context.fillStyle = PALETTE.warmYellow;
    context.globalAlpha = 0.72;
    const starCount = Math.ceil(this.logicalWidth / 22);
    for (let index = 0; index < starCount; index += 1) {
      const x = (index * 83 + 29) % this.logicalWidth;
      const y =
        (index * 47 + 34 - motionCameraY * 0.03 + GAME_HEIGHT) % (GAME_HEIGHT * 0.64);
      context.fillRect(Math.floor(x), Math.floor(y), 2, 2);
    }
    context.globalAlpha = 1;

    this.drawClouds(motionCameraX, reducedMotion);
    this.drawCityLayer(motionCameraX, 0.04, 74, 120, 225, PALETTE.violetDark, 0.62);
    this.drawCityLayer(motionCameraX, 0.1, 92, 170, 310, PALETTE.nightLift, 0.94);
  }

  private drawClouds(cameraX: number, reducedMotion: boolean): void {
    const context = this.context;
    const parallax = reducedMotion ? 0 : cameraX * 0.025;
    context.fillStyle = PALETTE.violetDark;
    context.globalAlpha = 0.48;
    for (let index = 0; index < 5; index += 1) {
      const x = this.positiveModulo(index * 241 + 80 - parallax, this.logicalWidth + 220) - 110;
      const y = 142 + ((index * 97) % 250);
      context.fillRect(Math.round(x), y + 8, 92, 7);
      context.fillRect(Math.round(x + 18), y + 3, 52, 9);
      context.fillRect(Math.round(x + 34), y, 24, 8);
    }
    context.globalAlpha = 1;
  }

  private drawCityLayer(
    cameraX: number,
    parallaxRate: number,
    spacing: number,
    minHeight: number,
    maxHeight: number,
    color: string,
    alpha: number,
  ): void {
    const context = this.context;
    const parallax = cameraX * parallaxRate;
    const firstWorldIndex = Math.floor(parallax / spacing) - 1;
    const offset = this.positiveModulo(parallax, spacing);
    const count = Math.ceil(this.logicalWidth / spacing) + 3;
    context.globalAlpha = alpha;

    for (let slot = 0; slot < count; slot += 1) {
      const worldIndex = firstWorldIndex + slot;
      const variation = this.hash(worldIndex * 17 + Math.round(parallaxRate * 100));
      const height = Math.round(minHeight + variation * (maxHeight - minHeight));
      const width = spacing - 10 - Math.round(this.hash(worldIndex * 29) * 12);
      const x = Math.round((slot - 1) * spacing - offset);
      const y = GAME_HEIGHT - height;
      context.fillStyle = color;
      context.fillRect(x, y, width, height);

      const windowAlpha = 0.18 + this.hash(worldIndex * 31) * 0.2;
      context.fillStyle = PALETTE.windowAmber;
      context.globalAlpha = alpha * windowAlpha;
      for (let row = y + 24; row < GAME_HEIGHT - 18; row += 30) {
        for (let column = x + 12; column < x + width - 6; column += 24) {
          if (this.hash(worldIndex * 101 + row * 3 + column) > 0.48) {
            context.fillRect(column, row, 5, 8);
          }
        }
      }
      context.globalAlpha = alpha;
    }
    context.globalAlpha = 1;
  }

  private drawPlatforms(
    snapshot: WorldSnapshot,
    reducedMotion: boolean,
    nowMs: number,
  ): void {
    const context = this.context;
    for (const platform of snapshot.platforms) {
      const x = Math.round(platform.x - snapshot.cameraX);
      const y = Math.round(platform.y - snapshot.cameraY);
      if (
        x > this.logicalWidth ||
        x + platform.width < 0 ||
        y > GAME_HEIGHT ||
        y + 90 < 0
      ) {
        continue;
      }

      const decoration = selectRoofDecoration(platform.id, platform.width);
      if (decoration !== "none") {
        const offset = getRoofDecorationOffset(platform.id, platform.width, decoration);
        this.drawRoofDecoration(
          decoration,
          x + offset,
          y,
          platform.id,
          reducedMotion,
          nowMs,
        );
      }

      context.fillStyle = PALETTE.blackPurple;
      context.fillRect(x, y - 3, platform.width, 3);
      context.fillStyle = PALETTE.warmYellow;
      context.fillRect(x, y, platform.width, 2);
      context.fillStyle = PALETTE.roofOrange;
      context.fillRect(x, y + 2, platform.width, 6);
      context.fillStyle = platform.id % 2 === 0 ? PALETTE.violet : PALETTE.violetDark;
      context.fillRect(x, y + 8, platform.width, Math.max(platform.height, GAME_HEIGHT - y));
      context.fillStyle = PALETTE.blackPurple;
      context.fillRect(x, y + 8, 3, 8);
      context.fillRect(x + platform.width - 3, y + 8, 3, 8);

      context.fillStyle = PALETTE.blackPurple;
      context.globalAlpha = 0.55;
      for (let row = 0; y + 25 + row * 24 < GAME_HEIGHT; row += 1) {
        const offset = row % 2 === 0 ? 8 : 23;
        for (let brickX = offset; brickX < platform.width; brickX += 38) {
          context.fillRect(x + brickX, y + 24 + row * 24, 22, 3);
        }
      }
      context.globalAlpha = 1;

      for (let windowX = 28; windowX < platform.width - 16; windowX += 66) {
        if (this.hash(platform.id * 97 + windowX) > 0.44) {
          context.fillStyle = PALETTE.blackPurple;
          context.fillRect(x + windowX - 2, y + 48, 16, 22);
          context.fillStyle = PALETTE.windowAmber;
          context.globalAlpha = 0.62;
          context.fillRect(x + windowX + 1, y + 51, 10, 15);
          context.globalAlpha = 1;
        }
      }
    }
  }

  private drawRoofDecoration(
    kind: Exclude<RoofDecorationKind, "none">,
    x: number,
    roofY: number,
    platformId: number,
    reducedMotion: boolean,
    nowMs: number,
  ): void {
    switch (kind) {
      case "vent":
        this.drawVent(x, roofY, platformId, reducedMotion, nowMs);
        break;
      case "antenna":
        this.drawAntenna(x, roofY);
        break;
      case "waterTank":
        this.drawWaterTank(x, roofY);
        break;
    }
  }

  private drawVent(
    x: number,
    roofY: number,
    platformId: number,
    reducedMotion: boolean,
    nowMs: number,
  ): void {
    const context = this.context;
    const spec = ROOF_DECORATION_SPECS.vent;
    const y = roofY - spec.height;

    if (!reducedMotion && hasVentSteam(platformId)) {
      const phase = Math.floor(nowMs / 180 + platformId) % 4;
      context.save();
      context.fillStyle = PALETTE.smoke;
      context.globalAlpha = 0.2;
      context.fillRect(x + 9 + (phase % 2) * 2, y - 10 - phase * 3, 6, 5);
      context.globalAlpha = 0.12;
      context.fillRect(x + 13 - (phase % 2) * 3, y - 22 - phase * 2, 8, 5);
      context.restore();
    }

    context.fillStyle = PALETTE.blackPurple;
    context.fillRect(x + 2, y + 2, spec.width - 4, spec.height);
    context.fillStyle = PALETTE.haze;
    context.fillRect(x, y, spec.width, 5);
    context.fillRect(x + 5, y + 5, spec.width - 10, spec.height - 7);
    context.fillStyle = PALETTE.violetDark;
    context.fillRect(x + 7, y + 8, spec.width - 14, 3);
    context.fillRect(x + 7, y + 14, spec.width - 14, 3);
  }

  private drawAntenna(x: number, roofY: number): void {
    const context = this.context;
    const spec = ROOF_DECORATION_SPECS.antenna;
    const y = roofY - spec.height;
    context.fillStyle = PALETTE.blackPurple;
    context.fillRect(x + 8, y, 3, spec.height);
    context.fillRect(x + 1, y + 7, spec.width - 2, 3);
    context.fillRect(x + 4, y + 17, spec.width - 8, 3);
    context.fillRect(x + 3, roofY - 5, spec.width - 6, 5);
    context.fillStyle = PALETTE.haze;
    context.fillRect(x + 9, y + 2, 2, spec.height - 7);
    context.fillRect(x + 3, y + 8, spec.width - 6, 2);
  }

  private drawWaterTank(x: number, roofY: number): void {
    const context = this.context;
    const spec = ROOF_DECORATION_SPECS.waterTank;
    const y = roofY - spec.height;
    context.fillStyle = PALETTE.blackPurple;
    context.fillRect(x + 5, y + 1, spec.width - 10, 31);
    context.fillRect(x + 8, y + 32, 4, 16);
    context.fillRect(x + spec.width - 12, y + 32, 4, 16);
    context.fillRect(x + 3, y + 42, spec.width - 6, 3);
    context.fillStyle = PALETTE.haze;
    context.fillRect(x + 7, y, spec.width - 14, 4);
    context.fillRect(x + 4, y + 5, spec.width - 8, 22);
    context.fillStyle = PALETTE.violetDark;
    context.fillRect(x + 8, y + 9, spec.width - 16, 4);
    context.fillRect(x + 8, y + 19, spec.width - 16, 4);
    context.fillStyle = PALETTE.neonCyan;
    context.globalAlpha = 0.34;
    context.fillRect(x + spec.width - 11, y + 7, 3, 3);
    context.globalAlpha = 1;
  }

  private drawCat(
    snapshot: WorldSnapshot,
    gameState: GameState,
    reducedMotion: boolean,
    nowMs: number,
  ): void {
    const { cat } = snapshot;
    const context = this.context;
    const x = Math.round(cat.x - snapshot.cameraX);
    const y = Math.round(cat.y - snapshot.cameraY);
    const pose = selectCatPose(
      gameState,
      cat.grounded,
      cat.vy,
      nowMs,
      this.landingStartedAtMs,
      reducedMotion,
    );
    const { bob, stretch, squash } = pose;

    if (
      this.landingStartedAtMs !== null &&
      nowMs - this.landingStartedAtMs >= LAND_ANIMATION_DURATION_MS
    ) {
      this.landingStartedAtMs = null;
    }

    if (pose.animation === "land" && !reducedMotion && this.landingStartedAtMs !== null) {
      this.drawLandingDust(x, y + cat.height, nowMs - this.landingStartedAtMs);
    }

    context.fillStyle = PALETTE.blackPurple;
    context.fillRect(x - 4, y + 11 + bob + pose.tailLift, 7, 10);
    context.fillRect(x - 7, y + 7 + bob + pose.tailLift, 5, 8);
    context.fillRect(
      x,
      y + 9 + bob + stretch + squash,
      19,
      17 - stretch - squash,
    );
    context.fillRect(x + 13, y + 3 + bob, 14, 18);
    context.fillRect(x + 15, y, 5, 7);
    context.fillRect(x + 22, y + 1, 5, 7);

    context.fillStyle = PALETTE.catOrange;
    context.fillRect(x - 3, y + 12 + bob + pose.tailLift, 6, 7);
    context.fillRect(x - 6, y + 8 + bob + pose.tailLift, 4, 7);
    context.fillRect(
      x + 1,
      y + 10 + bob + stretch + squash,
      17,
      14 - stretch - squash,
    );
    context.fillRect(x + 14, y + 4 + bob, 12, 15);
    context.fillRect(x + 16, y + 1, 3, 6);
    context.fillRect(x + 23, y + 2, 3, 5);

    context.fillStyle = PALETTE.catCream;
    context.fillRect(x + 5, y + 16 + bob, 10, 7);
    context.fillRect(x + 20, y + 11 + bob, 7, 6);
    context.fillStyle = PALETTE.blackPurple;
    context.fillRect(x + 22, y + 8 + bob, 2, pose.eyesWide ? 4 : 3);
    context.fillStyle = PALETTE.scarfCoral;
    context.fillRect(x + 12, y + 14 + bob + pose.scarfLift, 8, 4);
    context.fillRect(x + 6, y + 15 + bob + pose.scarfLift, 7, 3);
    context.fillRect(x + 2, y + 13 + bob + pose.scarfLift, 5, 3);

    context.fillStyle = PALETTE.catOrange;
    context.fillRect(x + 3, y + 22 + bob + pose.backLegOffset, 5, 5);
    context.fillRect(x + 14, y + 22 + bob + pose.frontLegOffset, 5, 5);
    context.fillStyle = PALETTE.catCream;
    context.fillRect(x + 4, y + 25 + bob + pose.backLegOffset, 5, 2);
    context.fillRect(x + 15, y + 25 + bob + pose.frontLegOffset, 5, 2);
  }

  private drawLandingDust(x: number, floorY: number, elapsedMs: number): void {
    const context = this.context;
    const progress = Math.min(1, elapsedMs / LAND_ANIMATION_DURATION_MS);
    const spread = Math.round(progress * 9);
    const lift = Math.round(progress * 5);
    context.save();
    context.globalAlpha = 0.68 * (1 - progress);
    context.fillStyle = PALETTE.smoke;
    context.fillRect(x - 3 - spread, floorY - 2 - lift, 4, 3);
    context.fillRect(x + 21 + spread, floorY - 3 - Math.round(lift * 0.6), 5, 3);
    context.restore();
  }

  private positiveModulo(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
  }

  private hash(value: number): number {
    let hash = Math.imul(value | 0, 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
  }
}
