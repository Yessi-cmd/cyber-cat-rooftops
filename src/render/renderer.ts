import { GAME_HEIGHT, GAME_WIDTH } from "../game/config";
import type { Eagle, GameState, Hazard, WorldSnapshot, WorldRect } from "../game/types";

// Render-only view of a race opponent (see src/net/race-controller.ts).
export interface RaceGhost {
  slot: number;
  visible: boolean;
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
}
import { LAND_ANIMATION_DURATION_MS, selectCatPose, type CatPose } from "./cat-animation";
import { EffectLayer } from "./effects";
import { CAT_COATS, PALETTE, type CatCoat } from "./palette";
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
  readonly effects = new EffectLayer();

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

  draw(
    snapshot: WorldSnapshot,
    gameState: GameState,
    reducedMotion: boolean,
    ghosts: readonly RaceGhost[] = [],
    coatSlot = 0,
  ): void {
    const context = this.context;
    const nowMs = performance.now();
    context.save();
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    // Keep decorative layers still in the document-style presentation.
    this.drawSky(0, 0, true);
    context.translate(
      this.effects.shakeOffsetX(nowMs, reducedMotion),
      this.effects.shakeOffsetY(nowMs, reducedMotion),
    );
    if (gameState === "playing" && !reducedMotion) this.drawSpeedLines(snapshot.cat.vx, nowMs);
    this.drawPlatforms(snapshot, true, nowMs);
    this.drawFeatures(snapshot, reducedMotion, nowMs);
    this.drawGhosts(ghosts, snapshot, reducedMotion, nowMs);
    this.drawCat(snapshot, gameState, reducedMotion || gameState !== "playing", nowMs, CAT_COATS[coatSlot] ?? CAT_COATS[0]!);
    this.effects.draw(context, snapshot.cameraX, snapshot.cameraY, nowMs, reducedMotion);
    context.restore();
  }

  triggerLanding(nowMs = performance.now()): void {
    this.landingStartedAtMs = nowMs;
  }

  // Faint streaks once the run speed passes the opening pace; purely cosmetic.
  private drawSpeedLines(runSpeed: number, nowMs: number): void {
    const intensity = Math.min(1, Math.max(0, (runSpeed - 215) / 85));
    if (intensity <= 0) return;
    const context = this.context;
    const span = this.logicalWidth + 120;
    context.fillStyle = PALETTE.haze;
    for (let index = 0; index < 7; index += 1) {
      const lane = this.hash(index + 11);
      const travel = (nowMs * (0.5 + lane * 0.4) + lane * span) % span;
      const x = Math.round(this.logicalWidth + 40 - travel);
      const y = Math.round(150 + this.hash(index + 31) * 420);
      context.globalAlpha = 0.12 + 0.22 * intensity;
      context.fillRect(x, y, Math.round(30 + 50 * intensity * lane), 2);
    }
    context.globalAlpha = 1;
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
    context.globalAlpha = 0.08;
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
      if (decoration !== "none" && !platform.hazard && !platform.eagle) {
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

  private drawFeatures(snapshot: WorldSnapshot, reducedMotion: boolean, nowMs: number): void {
    const context = this.context;
    for (const platform of snapshot.platforms) {
      if (platform.hazard?.kind === "tower") {
        this.drawSignalTower(platform.hazard, snapshot.cameraX, snapshot.cameraY);
      } else if (platform.hazard && platform.hazard.popup?.phase !== "hidden") {
        const x = Math.round(platform.hazard.x - snapshot.cameraX);
        const y = Math.round(platform.hazard.y - snapshot.cameraY);
        if (x + platform.hazard.width >= 0 && x <= this.logicalWidth) {
          if (platform.hazard.popup?.phase === "warning") {
            // Static outline and ! remain legible with mute and reduced motion.
            context.strokeStyle = PALETTE.hazard;
            context.lineWidth = 2;
            context.strokeRect(x, y, platform.hazard.width, platform.hazard.height);
            context.fillStyle = PALETTE.hazard;
            context.fillRect(x + 10, y - 24, 4, 12);
            context.fillRect(x + 10, y - 8, 4, 4);
          } else {
            context.fillStyle = PALETTE.hazard;
            context.fillRect(x, y, platform.hazard.width, platform.hazard.height);
            context.fillStyle = PALETTE.catCream;
            // Diagonal warning bands distinguish solid hazards from harmless props.
            for (let band = 0; band < 3; band += 1) {
              context.fillRect(x + 2 + band * 7, y + 3, 3, 5);
              context.fillRect(x + 4 + band * 7, y + 8, 3, 5);
            }
            context.fillStyle = PALETTE.blackPurple;
            context.fillRect(x, y + platform.hazard.height - 3, platform.hazard.width, 3);
          }
        }
      }
      const rewards = platform.rewards;
      for (let index = 0; rewards && index < rewards.length; index += 1) {
        const reward = rewards[index]!;
        if (index > 0 && platform.hazard?.popup?.phase === "hidden") continue;
        if (!reward.collected) this.drawReward(reward, snapshot.cameraX, snapshot.cameraY);
      }
    }
    // Eagles fly over everything on the roof, so draw them last.
    for (const platform of snapshot.platforms) {
      if (platform.eagle) this.drawEagle(platform.eagle, snapshot.cameraX, snapshot.cameraY, reducedMotion, nowMs);
    }
  }

  // Fills the whole collision box: striped mast, cross bars and a red tip.
  private drawSignalTower(hazard: Hazard, cameraX: number, cameraY: number): void {
    const x = Math.round(hazard.x - cameraX);
    const y = Math.round(hazard.y - cameraY);
    if (x + hazard.width < 0 || x > this.logicalWidth) return;
    const context = this.context;
    const { width, height } = hazard;
    const mastX = x + Math.floor(width / 2) - 3;
    context.fillStyle = PALETTE.blackPurple;
    context.fillRect(mastX - 1, y + 4, 8, height - 4);
    context.fillRect(x, y + height - 6, width, 6);
    context.fillRect(x, y + 10, width, 3);
    context.fillRect(x + 2, y + 20, width - 4, 3);
    context.fillStyle = PALETTE.hazard;
    context.fillRect(mastX, y + 5, 6, height - 11);
    context.fillRect(mastX, y, 6, 5);
    context.fillStyle = PALETTE.catCream;
    for (let band = y + 8; band < y + height - 8; band += 8) context.fillRect(mastX, band, 6, 3);
    context.fillRect(mastX + 2, y + 1, 2, 2);
  }

  // Left-facing pixel eagle; wings flap unless reduced motion is on.
  private drawEagle(eagle: Eagle, cameraX: number, cameraY: number, reducedMotion: boolean, nowMs: number): void {
    const x = Math.round(eagle.x - cameraX);
    const y = Math.round(eagle.y - cameraY);
    if (x + eagle.width < -10 || x > this.logicalWidth + 10) return;
    const context = this.context;
    // Two flap frames; reduced motion holds the wings level.
    const wing = reducedMotion ? "level" : Math.floor(nowMs / 140) % 2 === 0 ? "up" : "down";
    context.fillStyle = PALETTE.blackPurple;
    // Body and fanned tail.
    context.fillRect(x + 8, y + 7, 23, 7);
    context.fillRect(x + 29, y + 6, 8, 3);
    context.fillRect(x + 30, y + 10, 10, 3);
    context.fillRect(x + 29, y + 13, 7, 2);
    // Wing stays inside the collision box; the red band marks it as a hazard.
    if (wing === "up") {
      context.fillRect(x + 12, y, 16, 3);
      context.fillRect(x + 14, y + 3, 14, 4);
    } else if (wing === "down") {
      context.fillRect(x + 12, y + 12, 16, 3);
      context.fillRect(x + 14, y + 15, 12, 3);
    } else {
      context.fillRect(x + 10, y + 4, 22, 4);
    }
    context.fillStyle = PALETTE.hazard;
    if (wing === "up") context.fillRect(x + 14, y + 1, 13, 2);
    else if (wing === "down") context.fillRect(x + 14, y + 13, 13, 2);
    else context.fillRect(x + 11, y + 5, 20, 2);
    context.fillRect(x + 12, y + 9, 16, 2);
    // White head, hooked yellow beak and eye.
    context.fillStyle = PALETTE.catCream;
    context.fillRect(x + 3, y + 5, 8, 7);
    context.fillStyle = PALETTE.reward;
    context.fillRect(x, y + 8, 4, 2);
    context.fillRect(x + 1, y + 10, 2, 1);
    context.fillStyle = PALETTE.blackPurple;
    context.fillRect(x + 5, y + 7, 2, 2);
  }

  private drawReward(reward: WorldRect, cameraX: number, cameraY: number): void {
    const x = Math.round(reward.x - cameraX);
    const y = Math.round(reward.y - cameraY);
    if (x + reward.width < 0 || x > this.logicalWidth) return;
    const context = this.context;
    context.fillStyle = PALETTE.reward;
    context.fillRect(x + 4, y + 2, 10, 6);
    context.fillRect(x + 7, y, 5, 10);
    context.fillRect(x, y + 1, 3, 8);
    context.fillRect(x + 3, y + 3, 3, 4);
    context.fillStyle = PALETTE.catCream;
    context.fillRect(x + 10, y + 3, 2, 2);
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
    coat: CatCoat,
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
    if (
      this.landingStartedAtMs !== null &&
      nowMs - this.landingStartedAtMs >= LAND_ANIMATION_DURATION_MS
    ) {
      this.landingStartedAtMs = null;
    }

    const angle = this.effects.flipAngle(nowMs, reducedMotion);
    if (angle !== 0) {
      context.save();
      context.translate(x + 10, y + 14);
      context.rotate(angle);
      context.translate(-(x + 10), -(y + 14));
    }

    this.drawCatSprite(x, y, pose, coat);
    if (angle !== 0) context.restore();

    // A gold star above the head while a mid-air jump is still available.
    if (gameState === "playing" && !cat.grounded && cat.jumpsRemaining > 0) {
      const starX = x + 9;
      const starY = y - 11;
      context.fillStyle = PALETTE.blackPurple;
      context.fillRect(starX - 1, starY + 1, 9, 5);
      context.fillRect(starX + 2, starY - 2, 3, 11);
      context.fillStyle = PALETTE.reward;
      context.fillRect(starX, starY + 2, 7, 3);
      context.fillRect(starX + 3, starY - 1, 1, 9);
      context.fillRect(starX + 2, starY + 1, 3, 5);
    }
  }

  // Opponents in a race: translucent, coloured by slot, with an edge marker
  // when they run outside the visible window.
  private drawGhosts(
    ghosts: readonly RaceGhost[],
    snapshot: WorldSnapshot,
    reducedMotion: boolean,
    nowMs: number,
  ): void {
    const context = this.context;
    for (const ghost of ghosts) {
      if (!ghost.visible) continue;
      const coat = CAT_COATS[ghost.slot] ?? CAT_COATS[0]!;
      const x = Math.round(ghost.x - snapshot.cameraX);
      const y = Math.round(ghost.y - snapshot.cameraY);
      if (x > this.logicalWidth || x + 24 < 0 || y > GAME_HEIGHT || y + 28 < 0) {
        this.drawGhostMarker(x, y, coat);
        continue;
      }
      const pose = selectCatPose("playing", ghost.grounded, ghost.vy, nowMs + ghost.slot * 97, null, reducedMotion);
      context.globalAlpha = 0.5;
      this.drawCatSprite(x, y, pose, coat);
      context.globalAlpha = 1;
      context.fillStyle = coat.tag;
      context.fillRect(x + 6, y - 6, 12, 3);
    }
  }

  private drawGhostMarker(x: number, y: number, coat: CatCoat): void {
    const context = this.context;
    const markerY = Math.max(96, Math.min(GAME_HEIGHT - 24, y + 10));
    context.fillStyle = coat.tag;
    if (x > this.logicalWidth) {
      const edge = this.logicalWidth - 10;
      context.fillRect(edge - 6, markerY - 6, 6, 12);
      context.fillRect(edge, markerY - 3, 4, 6);
    } else if (x + 24 < 0) {
      context.fillRect(6, markerY - 3, 4, 6);
      context.fillRect(10, markerY - 6, 6, 12);
    } else {
      // Above or below the view: a small chevron at the matching edge.
      const markerX = Math.max(8, Math.min(this.logicalWidth - 20, x));
      context.fillRect(markerX, y < 0 ? 100 : GAME_HEIGHT - 20, 12, 4);
    }
  }

  // Shared by the local cat and translucent race ghosts.
  private drawCatSprite(x: number, y: number, pose: CatPose, coat: CatCoat): void {
    const context = this.context;
    const { bob, stretch, squash } = pose;
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

    context.fillStyle = coat.fur;
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

    context.fillStyle = coat.cream;
    context.fillRect(x + 5, y + 16 + bob, 10, 7);
    context.fillRect(x + 20, y + 11 + bob, 7, 6);
    context.fillStyle = PALETTE.blackPurple;
    context.fillRect(x + 22, y + 8 + bob, 2, pose.eyesWide ? 4 : 3);
    context.fillStyle = PALETTE.scarfCoral;
    context.fillRect(x + 12, y + 14 + bob + pose.scarfLift, 8, 4);
    context.fillRect(x + 6, y + 15 + bob + pose.scarfLift, 7, 3);
    context.fillRect(x + 2, y + 13 + bob + pose.scarfLift, 5, 3);

    context.fillStyle = coat.fur;
    context.fillRect(x + 3, y + 22 + bob + pose.backLegOffset, 5, 5);
    context.fillRect(x + 14, y + 22 + bob + pose.frontLegOffset, 5, 5);
    context.fillStyle = coat.cream;
    context.fillRect(x + 4, y + 25 + bob + pose.backLegOffset, 5, 2);
    context.fillRect(x + 15, y + 25 + bob + pose.frontLegOffset, 5, 2);
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
