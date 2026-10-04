import {
  CAMERA,
  ENEMIES,
  GAME_HEIGHT,
  GAME_WIDTH,
  PHYSICS,
  POWERS,
  ROOF_FEATURES,
  SCORE,
  comboMultiplier,
  getDifficulty,
  stageAt,
} from "./config";
import {
  emptyPowerTimers,
  maxJumpsFor,
  powerDuration,
  pullRewards,
  rocketReleaseTarget,
  rocketTargetY,
} from "./powers";
import { advancePopupHazards, placeEagle } from "./roof-features";
import { enemyIsDangerous, enemyWarning, isStomp, placeEnemy } from "./enemies";
import { sweptCatIntersects } from "./swept-collision";
import { PlatformGenerator } from "./platform-generator";
import type { Cat, FailureReason, Platform, PowerKind, PowerTimers, WorldSnapshot } from "./types";

const START_PLATFORM: Platform = {
  id: 0,
  x: 0,
  y: 620,
  width: 260,
  height: 42,
};

// Snap float residue from many fixed steps to exactly zero.
function countDown(remaining: number, delta: number): number {
  const next = remaining - delta;
  return next > 1e-6 ? next : 0;
}

export class GameSession {
  private seed = 1;
  private generator = new PlatformGenerator(this.seed);
  private cat: Cat = this.createCat();
  private platforms: Platform[] = [{ ...START_PLATFORM }];
  private cameraX = 0;
  private cameraY = 0;
  private cameraTargetY = 0;
  private score = 0;
  // Distance + landing bonus only; drives difficulty so rewards never speed the game up.
  private progress = 0;
  private landingBonus = 0;
  private comboBonus = 0;
  private combo = 0;
  private bestCombo = 0;
  private furthestPlatformId = START_PLATFORM.id;
  private viewWidth = GAME_WIDTH;
  private coyoteRemaining = 0;
  // Set when the cat runs off an edge; spends the ground jump once coyote time ends.
  private walkedOff = false;
  private jumpBufferRemaining = 0;
  private jumps = 0;
  private jumpHeld = false;
  private collectedCount = 0;
  private failureReason: FailureReason | null = null;
  private powers: PowerTimers = emptyPowerTimers();
  // After the rocket timer ends the cat keeps flying until a safe drop exists.
  private rocketSeeking = false;
  private rocketSeekTime = 0;
  private grace = 0;
  private powerBonus = 0;
  private powerPickups = 0;
  private lastPower: PowerKind | null = null;
  private shieldBreaks = 0;
  // A rocket skips gaps without their fish; don't let that break the combo.
  private keepCombo = false;
  private stomps = 0;
  // Simulation seconds this run; drives the blinking lasers.
  private elapsed = 0;

  get jumpCount(): number {
    return this.jumps;
  }

  clearPendingInput(): void {
    this.jumpBufferRemaining = 0;
    this.jumpHeld = false;
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
    this.progress = 0;
    this.coyoteRemaining = 0;
    this.walkedOff = false;
    this.jumpBufferRemaining = 0;
    this.jumps = 0;
    this.jumpHeld = false;
    this.collectedCount = 0;
    this.failureReason = null;
    this.landingBonus = 0;
    this.comboBonus = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.furthestPlatformId = START_PLATFORM.id;
    this.powers = emptyPowerTimers();
    this.rocketSeeking = false;
    this.rocketSeekTime = 0;
    this.grace = 0;
    this.powerBonus = 0;
    this.powerPickups = 0;
    this.lastPower = null;
    this.shieldBreaks = 0;
    this.keepCombo = false;
    this.stomps = 0;
    this.elapsed = 0;
    this.fillPlatforms();
  }

  // A press: the arc stays full height until releaseJump() is called.
  jump(): boolean {
    if (this.failureReason !== null) return false;
    this.jumpHeld = true;
    return this.tryJump();
  }

  releaseJump(): void {
    this.jumpHeld = false;
  }

  private get rocketing(): boolean {
    return this.powers.rocket > 0 || this.rocketSeeking;
  }

  private tryJump(): boolean {
    if (this.rocketing) return false;
    if (this.cat.jumpsRemaining <= 0) {
      // With both jumps spent, only a near-landing press may be buffered.
      if (this.cat.vy > 0) this.jumpBufferRemaining = PHYSICS.jumpBufferSeconds;
      return false;
    }

    this.coyoteRemaining = 0;
    this.walkedOff = false;
    this.jumpBufferRemaining = 0;
    this.jumps += 1;
    this.cat.jumpsRemaining -= 1;
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
    const difficulty = getDifficulty(this.progress);
    if (this.cat.grounded && this.jumpBufferRemaining > 0) this.tryJump();
    this.jumpBufferRemaining = Math.max(0, this.jumpBufferRemaining - delta);
    this.coyoteRemaining = Math.max(0, this.coyoteRemaining - delta);
    this.tickPowers(delta);
    this.elapsed += delta;
    if (this.walkedOff && this.coyoteRemaining <= 0) {
      // Walking off spends the ground jump once; later refills (stomps) stand.
      this.walkedOff = false;
      if (!this.cat.grounded && !this.rocketing) {
        this.cat.jumpsRemaining = Math.min(maxJumpsFor(this.powers) - 1, this.cat.jumpsRemaining);
      }
    }
    advancePopupHazards(this.platforms, this.cat, delta);
    this.cat.previousX = this.cat.x;
    this.cat.previousY = this.cat.y;
    const progressBefore = this.progress;

    if (this.rocketing) {
      this.flyRocket(delta, difficulty.runSpeed);
    } else {
    this.cat.vx = difficulty.runSpeed;
    this.cat.x += this.cat.vx * delta;

    if (this.cat.grounded && !this.isSupported()) {
      this.coyoteRemaining = PHYSICS.coyoteSeconds;
      this.walkedOff = true;
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
      const gravity = this.cat.vy >= 0
        ? PHYSICS.fallGravity
        : this.jumpHeld ? PHYSICS.gravity : PHYSICS.releasedRiseGravity;
      this.cat.vy += gravity * delta;
      this.cat.y += this.cat.vy * delta;
      this.resolveLanding();
    }
    }

    if (this.resolveFeatures(delta)) return true;

    this.progress = Math.max(
      this.progress,
      Math.floor(Math.max(0, this.cat.x - 70) / SCORE.distancePixelsPerPoint) + this.landingBonus,
    );
    // Double score repeats this step's distance and landing points as a bonus.
    if (this.powers.double > 0) this.powerBonus += this.progress - progressBefore;
    this.score = this.progress + this.collectedCount * ROOF_FEATURES.rewardPoints +
      this.comboBonus + this.powerBonus;

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
      combo: this.combo,
      bestCombo: this.bestCombo,
      multiplier: comboMultiplier(this.combo),
      stage: stageAt(this.progress),
      warning: this.currentWarning(),
      powers: this.powers,
      rocketing: this.rocketing,
      powerPickups: this.powerPickups,
      lastPower: this.lastPower,
      shieldBreaks: this.shieldBreaks,
      stomps: this.stomps,
      failureReason: this.failureReason,
    };
  }

  private tickPowers(delta: number): void {
    const hadFeather = this.powers.feather > 0;
    for (const kind of ["shield", "feather", "magnet", "double"] as const) {
      this.powers[kind] = countDown(this.powers[kind], delta);
    }
    if (hadFeather && this.powers.feather === 0) {
      this.cat.jumpsRemaining = Math.min(this.cat.jumpsRemaining, PHYSICS.maxJumps);
    }
    this.grace = Math.max(0, this.grace - delta);
  }

  private collectPower(kind: PowerKind): void {
    this.powerPickups += 1;
    this.lastPower = kind;
    this.powers[kind] = powerDuration(kind);
    if (kind === "feather") {
      this.cat.jumpsRemaining = Math.min(maxJumpsFor(this.powers), this.cat.jumpsRemaining + 1);
    } else if (kind === "rocket") {
      this.rocketSeeking = false;
      this.rocketSeekTime = 0;
      this.jumpBufferRemaining = 0;
      this.coyoteRemaining = 0;
      this.walkedOff = false;
      this.cat.grounded = false;
      this.cat.platformId = null;
      this.cat.vy = 0;
    }
  }

  // Rocket: fast, invulnerable cruise above the roofs; afterwards keep flying
  // until dropping now lands mid-roof on a plain building, then let go.
  private flyRocket(delta: number, runSpeed: number): void {
    const cat = this.cat;
    cat.grounded = false;
    cat.platformId = null;
    cat.vy = 0;
    cat.vx = runSpeed * POWERS.rocketSpeedRatio;
    cat.x += cat.vx * delta;
    const target = Math.max(rocketTargetY(this.platforms, cat), this.cameraY + 110);
    const climb = POWERS.rocketClimbSpeed * delta;
    cat.y += Math.max(-climb, Math.min(climb, target - cat.y));

    if (this.powers.rocket > 0) {
      this.powers.rocket = countDown(this.powers.rocket, delta);
      if (this.powers.rocket === 0) {
        this.rocketSeeking = true;
        this.rocketSeekTime = 0;
      }
      return;
    }
    this.rocketSeekTime += delta;
    if (
      rocketReleaseTarget(this.platforms, cat, runSpeed) !== null ||
      this.rocketSeekTime >= POWERS.rocketSeekLimitSeconds
    ) {
      this.rocketSeeking = false;
      cat.vx = runSpeed;
      cat.jumpsRemaining = maxJumpsFor(this.powers);
      this.grace = POWERS.graceSeconds;
      this.keepCombo = true;
    }
  }

  private currentWarning(): WorldSnapshot["warning"] {
    const catCenter = this.cat.x + this.cat.width / 2;
    for (const platform of this.platforms) {
      if (platform.hazard?.popup?.phase === "warning") return "popup";
      const eagle = platform.eagle;
      if (eagle && !eagle.broken) {
        const ahead = eagle.x + eagle.width / 2 - catCenter;
        if (ahead > 0 && ahead <= ROOF_FEATURES.eagleWarningDistance) return "eagle";
      }
      const enemyAlert = platform.enemy ? enemyWarning(platform.enemy, this.cat) : null;
      if (enemyAlert !== null) return enemyAlert;
    }
    return null;
  }

  private resolveFeatures(delta: number): boolean {
    const invulnerable = this.rocketing || this.grace > 0;
    for (const platform of this.platforms) {
      const hazard = platform.hazard;
      const eagle = platform.eagle;
      if (eagle) placeEagle(eagle, this.cat);
      let reason: FailureReason | null = null;
      if (
        hazard && !hazard.broken && (!hazard.popup || hazard.popup.phase === "active") &&
        sweptCatIntersects(this.cat, hazard)
      ) {
        reason = hazard.kind === "tower" ? "tower" : "hazard";
      }
      if (eagle && !eagle.broken && sweptCatIntersects(this.cat, eagle)) reason = "eagle";
      const enemy = platform.enemy;
      if (enemy) {
        placeEnemy(enemy, this.cat, this.elapsed);
        if (enemyIsDangerous(enemy) && sweptCatIntersects(this.cat, enemy)) {
          if (isStomp(enemy, this.cat)) {
            // Landing on a robot defeats it and springs the cat back up.
            enemy.broken = true;
            this.stomps += 1;
            this.powerBonus += ENEMIES.stompBonus;
            this.cat.vy = ENEMIES.stompBounce;
            // A stomp counts as a landing: the bounce may carry the cat past the
            // roof edge, so it must still have a full double jump to recover.
            this.cat.jumpsRemaining = maxJumpsFor(this.powers);
            continue;
          }
          reason = enemy.kind;
        }
      }
      if (reason === null || invulnerable) continue;
      if (this.powers.shield > 0) {
        // The shield smashes what it hits, then grants a moment of safety.
        if (reason === "eagle") eagle!.broken = true;
        else if (enemy && reason === enemy.kind) enemy.broken = true;
        else hazard!.broken = true;
        this.powers.shield = 0;
        this.grace = POWERS.graceSeconds;
        this.powerBonus += POWERS.shieldBreakBonus;
        this.shieldBreaks += 1;
        continue;
      }
      this.failureReason = reason;
      this.clearPendingInput();
      return true;
    }
    if (this.powers.magnet > 0) pullRewards(this.platforms, this.cat, delta);
    for (const platform of this.platforms) {
      const power = platform.power;
      if (power && !power.collected && sweptCatIntersects(this.cat, power)) {
        power.collected = true;
        this.collectPower(power.kind);
      }
      for (const reward of platform.rewards ?? []) {
        if (!reward.collected && sweptCatIntersects(this.cat, reward)) {
          reward.collected = true;
          this.collectedCount += 1;
          if (this.powers.double > 0) this.powerBonus += ROOF_FEATURES.rewardPoints;
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
      jumpsRemaining: PHYSICS.maxJumps,
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
      this.cat.jumpsRemaining = maxJumpsFor(this.powers);
      this.walkedOff = false;
      this.cat.platformId = platform.id;
      if (platform.id > this.furthestPlatformId) {
        this.landingBonus += SCORE.landingBonus;
        this.furthestPlatformId = platform.id;
        const gapFish = platform.rewards?.find(reward => reward.gap);
        this.combo = gapFish?.collected ? this.combo + 1 : this.keepCombo ? this.combo : 0;
        this.keepCombo = false;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        // Only the extra share is combo bonus; progress (difficulty) stays unaffected.
        this.comboBonus += SCORE.landingBonus * (comboMultiplier(this.combo) - 1);
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
      // Place on creation so lookahead width never changes what a snapshot shows.
      if (next.eagle) placeEagle(next.eagle, this.cat);
      if (next.enemy) placeEnemy(next.enemy, this.cat, this.elapsed);
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
