import "./styles.css";
import { AudioController } from "./audio/audio-controller";
import { CONTENT } from "./content/zh-CN";
import { PHYSICS, SCORE } from "./game/config";
import { GameSession } from "./game/session";
import { GameStateMachine } from "./game/state-machine";
import type { GameState, WorldSnapshot } from "./game/types";
import { InputController, type InputAction } from "./input/input-controller";
import { RaceController } from "./net/race-controller";
import { raceServerUrl } from "./net/race-client";
import { PALETTE, POWER_COLORS } from "./render/palette";
import { POWER_KINDS } from "./game/powers";
import { Renderer } from "./render/renderer";
import { loadSave, saveBestScore, saveMuted } from "./storage/preferences";
import { renderUiIcon } from "./ui/icons";
import { renderRaceBoard, renderRaceOverlay, type BoardEntry, type RacePrimaryAction } from "./ui/race-panel";
import { normalizeRoomCode } from "../shared/race-protocol.js";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`缺少必要元素：${selector}`);
  }
  return element;
}

class GameApp {
  private readonly shell = requiredElement<HTMLElement>("#game-shell");
  private readonly canvas = requiredElement<HTMLCanvasElement>("#game-canvas");
  private readonly overlay = requiredElement<HTMLElement>("#overlay");
  private readonly overlayTitle = requiredElement<HTMLElement>("#overlay-title");
  private readonly overlayCopy = requiredElement<HTMLElement>("#overlay-copy");
  private readonly result = requiredElement<HTMLElement>("#result");
  private readonly primaryButton = requiredElement<HTMLButtonElement>("#primary-button");
  private readonly pauseButton = requiredElement<HTMLButtonElement>("#pause-button");
  private readonly soundButton = requiredElement<HTMLButtonElement>("#sound-button");
  private readonly lootElement = requiredElement<HTMLElement>("#loot-count");
  private readonly jumpElement = requiredElement<HTMLElement>("#jump-count");
  private readonly hazardStatus = requiredElement<HTMLElement>("#hazard-status");
  private readonly comboElement = requiredElement<HTMLElement>("#combo-count");
  private readonly banner = requiredElement<HTMLElement>("#banner");
  private readonly powerList = requiredElement<HTMLElement>("#power-list");
  private powerListKey = "";
  private lastPowerPickups = 0;
  private lastShieldBreaks = 0;
  private lastStomps = 0;
  private readonly secondaryButton = requiredElement<HTMLButtonElement>("#secondary-button");
  private readonly racePlayers = requiredElement<HTMLOListElement>("#race-players");
  private readonly raceInvite = requiredElement<HTMLElement>("#race-invite");
  private readonly raceLink = requiredElement<HTMLInputElement>("#race-link");
  private readonly raceCopy = requiredElement<HTMLButtonElement>("#race-copy");
  private readonly raceBoard = requiredElement<HTMLOListElement>("#race-board");
  private readonly race = new RaceController(raceServerUrl(location), () => this.handleRaceChange());
  private racePrimary: RacePrimaryAction = null;
  private raceBoardKey = "";
  private displayedCountdown = -1;
  private announcedRoom: string | null = null;
  private announcedResults = false;
  private announcedPhase: string | null = null;
  private readonly boardEntries: BoardEntry[] = [];
  private displayedCombo = -1;
  private bannerHideAt = 0;
  private announcedStage = 0;
  private announcedMultiplier = 1;
  private recordAnnounced = false;
  private runStartBest = 0;
  private displayedWarning: WorldSnapshot["warning"] = null;
  private displayedJumps = -1;
  private displayedLoot = -1;
  private lastCollectedCount = 0;
  private readonly scoreElement = requiredElement<HTMLElement>("#score");
  private readonly liveStatus = requiredElement<HTMLElement>("#live-status");
  private readonly stateMachine = new GameStateMachine();
  private readonly session = new GameSession(this.createSeed());
  private readonly renderer = new Renderer(this.canvas);
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly initialSave = loadSave();
  private readonly audio = new AudioController(this.initialSave.muted);
  private bestScore = this.initialSave.bestScore;
  private lastGrounded = true;
  private lastJumpCount = 0;
  private lastPlatformId = 0;
  private frameId: number | null = null;
  private previousTime = performance.now();
  private accumulator = 0;
  private displayedScore = -1;

  constructor() {
    for (const [key, text] of Object.entries(CONTENT.document)) {
      requiredElement<HTMLElement>(`[data-document="${key}"]`).textContent = text;
    }
    requiredElement<HTMLElement>(".desktop-help").textContent = CONTENT.controls;
    this.session.setViewWidth(this.renderer.viewWidth);
    new InputController(this.shell, this.canvas, this.handleInput);
    this.primaryButton.addEventListener("click", this.handlePrimaryClick);
    this.secondaryButton.addEventListener("click", this.handleSecondaryClick);
    this.raceCopy.addEventListener("click", this.handleCopyInvite);
    this.pauseButton.addEventListener("click", this.handlePauseClick);
    this.soundButton.addEventListener("click", this.handleSoundClick);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("blur", this.handleBlur);
    this.renderUi();
    this.renderer.draw(
      this.session.snapshot(),
      this.stateMachine.state,
      this.reducedMotion.matches,
    );
    const invitedRoom = normalizeRoomCode(new URLSearchParams(location.search).get("room") ?? "");
    if (invitedRoom !== null) this.race.join(invitedRoom);
    this.startLoop();
  }

  private startLoop(): void {
    if (this.frameId !== null) {
      return;
    }
    this.previousTime = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (time: number): void => {
    const frameDelta = Math.min((time - this.previousTime) / 1000, PHYSICS.maxFrameDelta);
    this.previousTime = time;
    if (this.race.active) {
      const raceSeed = this.race.takeStart();
      if (raceSeed !== null) this.startRaceRun(raceSeed);
    }

    if (this.stateMachine.state === "playing") {
      this.session.setViewWidth(this.renderer.viewWidth);
      this.accumulator += frameDelta;
      while (this.accumulator >= PHYSICS.fixedStep) {
        const lost = this.session.update(PHYSICS.fixedStep);
        this.accumulator -= PHYSICS.fixedStep;
        this.playWorldCues();
        if (lost) {
          this.finishGame();
          this.accumulator = 0;
          break;
        }
      }
    } else {
      this.accumulator = 0;
    }

    const snapshot = this.session.snapshot();
    if (this.race.active) this.updateRaceFrame(snapshot);
    if (snapshot.warning !== this.displayedWarning) {
      this.displayedWarning = snapshot.warning;
      this.hazardStatus.textContent = snapshot.warning ? CONTENT.warnings[snapshot.warning] : "";
    }
    if (snapshot.score !== this.displayedScore) {
      this.displayedScore = snapshot.score;
      this.scoreElement.textContent = snapshot.score.toString().padStart(4, "0");
    }
    if (snapshot.cat.jumpsRemaining !== this.displayedJumps) {
      this.displayedJumps = snapshot.cat.jumpsRemaining;
      this.jumpElement.textContent = CONTENT.jumps(this.displayedJumps);
    }
    if (snapshot.collectedCount !== this.displayedLoot) {
      this.displayedLoot = snapshot.collectedCount;
      this.lootElement.textContent = CONTENT.loot(snapshot.collectedCount);
    }
    if (snapshot.combo !== this.displayedCombo) {
      this.displayedCombo = snapshot.combo;
      this.comboElement.hidden = snapshot.combo < 2;
      this.comboElement.dataset.tier = (snapshot.multiplier - 1).toString();
      this.comboElement.textContent = CONTENT.combo(snapshot.combo, snapshot.multiplier);
    }
    this.renderPowerList(snapshot);
    this.announceMilestones(snapshot, time);
    const view = this.race.view;
    this.renderer.draw(
      snapshot,
      this.stateMachine.state,
      this.reducedMotion.matches,
      view === null ? [] : this.race.ghosts(),
      view?.room ? view.you : 0,
    );
    this.frameId = requestAnimationFrame(this.tick);
  };

  private updateRaceFrame(snapshot: WorldSnapshot): void {
    const view = this.race.view!;
    if (this.stateMachine.state === "playing") this.race.reportState(snapshot);
    const countdown = this.race.countdownRemainingMs();
    const seconds = countdown === null ? -1 : Math.ceil(countdown / 1000);
    if (seconds !== this.displayedCountdown) {
      this.displayedCountdown = seconds;
      if (this.stateMachine.state !== "playing") this.renderUi();
    }
    const showBoard = view.phase === "racing" && this.stateMachine.state !== "ready";
    this.raceBoard.hidden = !showBoard;
    if (!showBoard) return;
    const entries = this.boardEntries;
    entries.length = 0;
    const ghosts = this.race.ghosts();
    for (const player of view.players) {
      if (!player.inRace) continue;
      const ghost = ghosts[player.slot];
      const live = player.slot === view.you ? snapshot.score : ghost?.visible ? ghost.score : player.score;
      entries.push({ slot: player.slot, score: Math.max(live, player.score), out: player.finished });
    }
    this.raceBoardKey = renderRaceBoard(this.raceBoard, entries, view.you, this.raceBoardKey);
  }

  private handleRaceChange(): void {
    const view = this.race.view;
    if (view === null) {
      this.raceBoard.hidden = true;
      this.announcedRoom = null;
      this.announcedPhase = null;
    } else {
      if (view.room !== null && view.room !== this.announcedRoom) {
        this.announcedRoom = view.room;
        this.setRoomInUrl(view.room);
        this.liveStatus.textContent = CONTENT.race.live.joined(view.room);
      }
      if (view.phase !== this.announcedPhase) {
        this.announcedPhase = view.phase;
        if (view.phase === "countdown") {
          this.announcedResults = false;
          this.liveStatus.textContent = CONTENT.race.live.countdown;
        }
      }
      if (view.ranking !== null && !this.announcedResults) {
        this.announcedResults = true;
        const rank = view.ranking.findIndex(entry => entry.slot === view.you) + 1;
        if (rank > 0) this.liveStatus.textContent = CONTENT.race.live.results(rank, view.ranking.length);
      }
    }
    if (this.stateMachine.state !== "playing") this.renderUi();
  }

  private setRoomInUrl(room: string | null): void {
    const url = new URL(location.href);
    if (room === null) url.searchParams.delete("room");
    else url.searchParams.set("room", room);
    history.replaceState(history.state, "", url);
  }

  private inviteUrl(room: string): string {
    return location.origin + location.pathname + "?room=" + room;
  }

  // Everyone in the race starts the same seed when their local countdown ends.
  private startRaceRun(seed: number): void {
    if (!this.race.racing) return;
    const state = this.stateMachine.state;
    if (state === "ready") this.stateMachine.send("start");
    else if (state !== "playing") this.stateMachine.send("restart");
    this.resetRun(seed);
    this.audio.setAmbientActive(true);
    this.showBanner(CONTENT.race.goBanner, performance.now());
    this.renderUi();
    // Started while backgrounded: wait for an explicit resume like any other interruption.
    if (document.hidden) this.pauseForInterruption();
  }

  private readonly handleSecondaryClick = (): void => {
    this.shell.focus({ preventScroll: true });
    if (this.race.active) this.leaveRace();
    else this.race.create();
  };

  private leaveRace(): void {
    this.race.leave();
    this.setRoomInUrl(null);
    this.renderUi();
  }

  private readonly handleCopyInvite = (): void => {
    const url = this.raceLink.value;
    const done = (): void => {
      this.raceCopy.textContent = CONTENT.race.copied;
      this.liveStatus.textContent = CONTENT.race.copied;
    };
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      void navigator.share({ title: document.title, url }).catch(() => undefined);
      return;
    }
    if (navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(url).then(done, () => this.raceLink.select());
    } else {
      this.raceLink.select();
    }
  };

  // Chips for active powers; rebuilt only when a whole second ticks over.
  private renderPowerList(snapshot: WorldSnapshot): void {
    let key = "";
    for (const kind of POWER_KINDS) {
      const remaining = kind === "rocket" && snapshot.rocketing ? Math.max(1, snapshot.powers.rocket) : snapshot.powers[kind];
      if (remaining > 0) key += kind + ":" + Math.ceil(remaining) + "|";
    }
    if (key === this.powerListKey) return;
    this.powerListKey = key;
    this.powerList.replaceChildren();
    for (const kind of POWER_KINDS) {
      const remaining = snapshot.powers[kind];
      if (remaining <= 0 && !(kind === "rocket" && snapshot.rocketing)) continue;
      const chip = document.createElement("span");
      chip.className = "power-chip";
      chip.style.background = POWER_COLORS[kind];
      chip.dataset.ending = String(remaining < 2);
      chip.textContent = remaining > 0
        ? CONTENT.powers.chip(CONTENT.powers.names[kind], Math.ceil(remaining))
        : CONTENT.powers.rocketLanding;
      this.powerList.append(chip);
    }
  }

  private announceMilestones(snapshot: WorldSnapshot, time: number): void {
    if (this.stateMachine.state === "playing") {
      let message: string | null = null;
      if (snapshot.stage > this.announcedStage) {
        this.announcedStage = snapshot.stage;
        message = CONTENT.banner.stage(snapshot.stage);
      }
      if (snapshot.multiplier > this.announcedMultiplier) {
        message = CONTENT.banner.multiplier(snapshot.multiplier);
      }
      this.announcedMultiplier = snapshot.multiplier;
      if (!this.recordAnnounced && this.runStartBest > 0 && snapshot.score > this.runStartBest) {
        this.recordAnnounced = true;
        message = CONTENT.banner.record;
      }
      if (message !== null) this.showBanner(message, time);
    }
    if (!this.banner.hidden && time >= this.bannerHideAt) {
      this.banner.hidden = true;
      this.banner.classList.remove("is-showing");
    }
  }

  private showBanner(message: string, time: number, cue: "milestone" | null = "milestone"): void {
    this.banner.textContent = message;
    this.banner.hidden = false;
    // Restart the CSS pop animation for back-to-back milestones.
    this.banner.classList.remove("is-showing");
    void this.banner.offsetWidth;
    this.banner.classList.add("is-showing");
    this.bannerHideAt = time + 1400;
    this.liveStatus.textContent = message;
    if (cue !== null) this.audio.play(cue);
  }

  private resetRunUi(): void {
    this.announcedStage = 0;
    this.announcedMultiplier = 1;
    this.recordAnnounced = false;
    this.runStartBest = this.bestScore;
    this.banner.hidden = true;
    this.banner.classList.remove("is-showing");
  }

  private readonly handleInput = (action: InputAction): void => {
    if (action === "blur") {
      this.pauseForInterruption();
      return;
    }
    if (action === "pause") {
      this.pauseForInterruption();
      return;
    }
    if (action === "jumpRelease") {
      // Releasing only shortens a rise; it never starts, resumes or restarts.
      this.session.releaseJump();
      return;
    }
    // In race mode the overlay buttons drive starts; taps only jump while running.
    if (this.race.active && this.stateMachine.state !== "playing") return;

    switch (this.stateMachine.state) {
      case "ready":
        this.stateMachine.send("start");
        this.resetRunUi();
        this.audio.setAmbientActive(true);
        this.jump();
        this.liveStatus.textContent = CONTENT.live.started;
        break;
      case "playing":
        this.jump();
        return;
      case "gameOver":
        this.restart(true);
        break;
      case "paused":
        return;
    }
    this.renderUi();
  };

  private readonly handlePrimaryClick = (): void => {
    this.shell.focus({ preventScroll: true });
    if (this.race.active && this.stateMachine.state !== "paused") {
      if (this.racePrimary === "start") this.race.start();
      else if (this.racePrimary === "solo") this.leaveRace();
      return;
    }
    if (this.stateMachine.state === "ready") {
      this.stateMachine.send("start");
      this.resetRunUi();
      this.audio.setAmbientActive(true);
      this.jump();
      this.liveStatus.textContent = CONTENT.live.started;
    } else if (this.stateMachine.state === "paused") {
      this.stateMachine.send("resume");
      this.audio.setAmbientActive(true);
      this.liveStatus.textContent = CONTENT.live.resumed;
    } else if (this.stateMachine.state === "gameOver") {
      this.restart(false);
    }
    this.renderUi();
  };

  private readonly handlePauseClick = (): void => {
    this.pauseForInterruption();
    this.shell.focus({ preventScroll: true });
  };

  private readonly handleSoundClick = (): void => {
    const muted = !this.audio.isMuted;
    this.audio.setMuted(muted);
    saveMuted(muted);
    if (!muted) {
      this.audio.play("toggle");
    }
    this.liveStatus.textContent = muted ? CONTENT.live.muted : CONTENT.live.unmuted;
    this.renderSoundButton();
    this.shell.focus({ preventScroll: true });
  };

  private pauseForInterruption(): void {
    if (this.stateMachine.state !== "playing") {
      return;
    }
    this.stateMachine.send("pause");
    this.session.clearPendingInput();
    this.audio.setAmbientActive(false);
    this.liveStatus.textContent = CONTENT.live.paused;
    this.renderUi();
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.pauseForInterruption();
    }
  };

  private readonly handleBlur = (): void => {
    this.pauseForInterruption();
  };

  private finishGame(): void {
    if (!this.stateMachine.send("lose")) {
      return;
    }

    this.audio.setAmbientActive(false);
    const score = this.session.snapshot().score;
    if (score > this.bestScore) {
      this.bestScore = score;
      saveBestScore(score);
    }
    this.audio.play("fail");
    this.race.reportFinish(score);
    const { cat } = this.session.snapshot();
    const now = performance.now();
    this.renderer.effects.shake(3, 260, now);
    this.renderer.effects.burst(cat.x + cat.width / 2, cat.y + cat.height / 2, 14, PALETTE.catOrange, 0.22, 0.14, now);
    this.liveStatus.textContent = CONTENT.live.gameOver(score);
    this.renderUi();
  }

  private restart(jumpImmediately: boolean): void {
    if (!this.stateMachine.send("restart")) {
      return;
    }
    this.resetRun(this.createSeed());
    this.audio.setAmbientActive(true);
    if (jumpImmediately) {
      this.jump();
    }
    this.liveStatus.textContent = CONTENT.live.restarted;
  }

  private resetRun(seed: number): void {
    this.session.reset(seed);
    this.lastGrounded = true;
    this.lastJumpCount = 0;
    this.lastCollectedCount = 0;
    this.lastPlatformId = 0;
    this.lastPowerPickups = 0;
    this.lastShieldBreaks = 0;
    this.lastStomps = 0;
    this.renderer.effects.clear();
    this.resetRunUi();
  }

  private renderUi(): void {
    const state = this.stateMachine.state;
    this.shell.dataset.state = state;
    this.pauseButton.hidden = state !== "playing";
    renderUiIcon(this.pauseButton, "pause");
    this.pauseButton.setAttribute("aria-label", CONTENT.aria.pause);
    this.renderSoundButton();

    if (state === "playing") {
      this.overlay.hidden = true;
      return;
    }

    this.overlay.hidden = false;
    this.result.hidden = true;

    const view = this.race.view;
    if (view !== null && state !== "paused") {
      this.racePrimary = renderRaceOverlay({
        title: this.overlayTitle,
        copy: this.overlayCopy,
        result: this.result,
        players: this.racePlayers,
        invite: this.raceInvite,
        link: this.raceLink,
        primary: this.primaryButton,
        secondary: this.secondaryButton,
      }, view, {
        localScore: this.session.snapshot().score,
        countdownMs: this.race.countdownRemainingMs(),
        inviteUrl: view.room === null ? null : this.inviteUrl(view.room),
      });
      if (this.raceInvite.hidden) this.raceCopy.textContent = CONTENT.race.copyLink;
      return;
    }
    this.racePlayers.hidden = true;
    this.raceInvite.hidden = true;
    this.primaryButton.hidden = false;
    this.primaryButton.disabled = false;
    this.secondaryButton.hidden = state === "paused";
    this.secondaryButton.textContent = CONTENT.race.invite;

    const content = CONTENT.overlay[state as Exclude<GameState, "playing">];
    this.overlayTitle.textContent = content.title;
    this.overlayCopy.textContent = content.copy;
    this.primaryButton.textContent = content.action;

    if (state === "gameOver") {
      const score = this.session.snapshot().score;
      this.result.hidden = false;
      this.result.textContent = CONTENT.result(score, this.bestScore) +
        " · " + CONTENT.loot(this.session.snapshot().collectedCount) +
        " · " + CONTENT.bestCombo(this.session.snapshot().bestCombo);
      const reason = this.session.snapshot().failureReason;
      if (reason !== null && reason !== "fall") {
        this.overlayCopy.textContent = CONTENT.failures[reason];
      }
    }
  }

  private jump(): void {
    this.session.jump();
    this.playJumpCue();
  }

  private playJumpCue(): void {
    if (this.session.jumpCount !== this.lastJumpCount) {
      this.lastJumpCount = this.session.jumpCount;
      this.lastGrounded = false;
      const cat = this.session.snapshot().cat;
      const effects = this.renderer.effects;
      const now = performance.now();
      if (cat.jumpsRemaining === 0) {
        // Second jump: somersault plus a puff under the paws.
        this.audio.play("doubleJump");
        effects.flip(now);
        effects.burst(cat.x + cat.width / 2, cat.y + cat.height, 8, PALETTE.catCream, 0.16, 0.05, now);
      } else {
        this.audio.play("jump");
        effects.burst(cat.x + 4, cat.y + cat.height, 4, PALETTE.smoke, 0.08, 0.06, now);
      }
    }
  }

  private playWorldCues(): void {
    this.playJumpCue();
    const snapshot = this.session.snapshot();
    const cat = snapshot.cat;
    const effects = this.renderer.effects;
    const now = performance.now();
    if (snapshot.collectedCount > this.lastCollectedCount) {
      this.audio.play("collect", 1 + Math.min(snapshot.combo, 12) * 0.03);
      effects.burst(cat.x + cat.width / 2, cat.y + 6, 6, PALETTE.reward, 0.14, 0.12, now);
    }
    this.lastCollectedCount = snapshot.collectedCount;
    if (snapshot.powerPickups > this.lastPowerPickups && snapshot.lastPower !== null) {
      const kind = snapshot.lastPower;
      this.audio.play("power");
      effects.burst(cat.x + cat.width / 2, cat.y + 4, 12, POWER_COLORS[kind], 0.2, 0.16, now);
      this.showBanner(CONTENT.powers.pickup[kind], now, null);
    }
    this.lastPowerPickups = snapshot.powerPickups;
    if (snapshot.shieldBreaks > this.lastShieldBreaks) {
      this.audio.play("smash");
      effects.shake(2, 160, now);
      effects.burst(cat.x + cat.width + 6, cat.y + cat.height / 2, 16, PALETTE.hazard, 0.26, 0.18, now);
      effects.floatText(cat.x + cat.width / 2, cat.y - 10, "+20", POWER_COLORS.shield, now);
      this.liveStatus.textContent = CONTENT.powers.smash;
    }
    this.lastShieldBreaks = snapshot.shieldBreaks;
    if (snapshot.stomps > this.lastStomps) {
      this.audio.play("smash");
      effects.burst(cat.x + cat.width / 2, cat.y + cat.height, 14, PALETTE.hazard, 0.24, 0.14, now);
      effects.floatText(cat.x + cat.width / 2, cat.y - 10, "+30", PALETTE.hazard, now);
      this.liveStatus.textContent = CONTENT.powers.stomp;
    }
    this.lastStomps = snapshot.stomps;
    if (!this.lastGrounded && cat.grounded) {
      this.renderer.triggerLanding();
      this.audio.play("land");
      effects.burst(cat.x + cat.width / 2, cat.y + cat.height, 7, PALETTE.smoke, 0.14, 0.07, now);
      if (cat.platformId !== null && cat.platformId > this.lastPlatformId) {
        this.lastPlatformId = cat.platformId;
        // Landing tone climbs with the multiplier so a hot streak sounds hot.
        this.audio.play("score", 1 + (snapshot.multiplier - 1) * 0.12);
        const points = SCORE.landingBonus * snapshot.multiplier;
        const color = snapshot.multiplier > 1 ? PALETTE.hazard : PALETTE.ink;
        effects.floatText(cat.x + cat.width / 2, cat.y - 6, snapshot.multiplier > 1 ? `+${points} ×${snapshot.multiplier}` : `+${points}`, color, now);
        if (snapshot.multiplier >= 3) effects.shake(1, 90, now);
      }
    }
    this.lastGrounded = cat.grounded;
  }

  private renderSoundButton(): void {
    const muted = this.audio.isMuted;
    renderUiIcon(this.soundButton, muted ? "soundOff" : "soundOn");
    this.soundButton.setAttribute("aria-label", muted ? CONTENT.aria.unmute : CONTENT.aria.mute);
    this.soundButton.setAttribute("aria-pressed", muted.toString());
  }

  private createSeed(): number {
    return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
  }
}

new GameApp();
