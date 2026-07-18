import "./styles.css";
import { AudioController } from "./audio/audio-controller";
import { CONTENT } from "./content/zh-CN";
import { PHYSICS } from "./game/config";
import { GameSession } from "./game/session";
import { GameStateMachine } from "./game/state-machine";
import type { GameState } from "./game/types";
import { InputController, type InputAction } from "./input/input-controller";
import { Renderer } from "./render/renderer";
import { loadSave, saveBestScore, saveMuted } from "./storage/preferences";
import { renderUiIcon } from "./ui/icons";

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
  private lastPlatformId = 0;
  private frameId: number | null = null;
  private previousTime = performance.now();
  private accumulator = 0;

  constructor() {
    this.session.setViewWidth(this.renderer.viewWidth);
    new InputController(this.shell, this.canvas, this.handleInput);
    this.primaryButton.addEventListener("click", this.handlePrimaryClick);
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
    this.scoreElement.textContent = snapshot.score.toString().padStart(4, "0");
    this.renderer.draw(snapshot, this.stateMachine.state, this.reducedMotion.matches);
    this.frameId = requestAnimationFrame(this.tick);
  };

  private readonly handleInput = (action: InputAction): void => {
    if (action === "pause") {
      this.togglePause();
      return;
    }

    switch (this.stateMachine.state) {
      case "ready":
        this.stateMachine.send("start");
        this.audio.setAmbientActive(true);
        this.jump();
        this.liveStatus.textContent = CONTENT.live.started;
        break;
      case "playing":
        this.jump();
        break;
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
    if (this.stateMachine.state === "ready") {
      this.stateMachine.send("start");
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
    this.togglePause();
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

  private togglePause(): void {
    if (this.stateMachine.state === "playing") {
      this.stateMachine.send("pause");
      this.audio.setAmbientActive(false);
      this.liveStatus.textContent = CONTENT.live.paused;
    } else if (this.stateMachine.state === "paused") {
      this.stateMachine.send("resume");
      this.audio.setAmbientActive(true);
      this.liveStatus.textContent = CONTENT.live.resumed;
    }
    this.renderUi();
  }

  private pauseForInterruption(): void {
    if (this.stateMachine.state !== "playing") {
      return;
    }
    this.stateMachine.send("pause");
    this.audio.setAmbientActive(false);
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
    this.liveStatus.textContent = CONTENT.live.gameOver(score);
    this.renderUi();
  }

  private restart(jumpImmediately: boolean): void {
    if (!this.stateMachine.send("restart")) {
      return;
    }
    this.session.reset(this.createSeed());
    this.lastGrounded = true;
    this.lastPlatformId = 0;
    this.audio.setAmbientActive(true);
    if (jumpImmediately) {
      this.jump();
    }
    this.liveStatus.textContent = CONTENT.live.restarted;
  }

  private renderUi(): void {
    const state = this.stateMachine.state;
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

    const content = CONTENT.overlay[state as Exclude<GameState, "playing">];
    this.overlayTitle.textContent = content.title;
    this.overlayCopy.textContent = content.copy;
    this.primaryButton.textContent = content.action;

    if (state === "gameOver") {
      const score = this.session.snapshot().score;
      this.result.hidden = false;
      this.result.textContent = CONTENT.result(score, this.bestScore);
    }
  }

  private jump(): void {
    if (this.session.jump()) {
      this.lastGrounded = false;
      this.audio.play("jump");
    }
  }

  private playWorldCues(): void {
    const cat = this.session.snapshot().cat;
    if (!this.lastGrounded && cat.grounded) {
      this.renderer.triggerLanding();
      this.audio.play("land");
      if (cat.platformId !== null && cat.platformId > this.lastPlatformId) {
        this.lastPlatformId = cat.platformId;
        this.audio.play("score");
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
