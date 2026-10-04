import { PALETTE } from "./palette";

// Cosmetic feedback only: world coordinates in, never mutates the simulation.
// Fixed pools keep the hot render loop free of per-frame allocation.
const MAX_PARTICLES = 48;
const MAX_TEXTS = 6;
const PARTICLE_GRAVITY = 0.0009; // logical px/ms²
const TEXT_LIFE_MS = 750;
export const FLIP_DURATION_MS = 260;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornMs: number;
  lifeMs: number;
  size: number;
  color: string;
}

interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  text: string;
  color: string;
  bornMs: number;
}

export class EffectLayer {
  private readonly particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, bornMs: 0, lifeMs: 0, size: 2, color: PALETTE.smoke,
  }));
  private readonly texts: FloatingText[] = Array.from({ length: MAX_TEXTS }, () => ({
    active: false, x: 0, y: 0, text: "", color: PALETTE.ink, bornMs: 0,
  }));
  private nextParticle = 0;
  private nextText = 0;
  private shakeUntilMs = 0;
  private shakeStrength = 0;
  private flipStartedAtMs: number | null = null;
  private seed = 1;

  clear(): void {
    for (const particle of this.particles) particle.active = false;
    for (const text of this.texts) text.active = false;
    this.shakeUntilMs = 0;
    this.flipStartedAtMs = null;
  }

  burst(x: number, y: number, count: number, color: string, spread: number, lift: number, nowMs: number): void {
    for (let index = 0; index < count; index += 1) {
      const particle = this.particles[this.nextParticle]!;
      this.nextParticle = (this.nextParticle + 1) % MAX_PARTICLES;
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = (this.random() - 0.5) * spread;
      particle.vy = -this.random() * lift;
      particle.bornMs = nowMs;
      particle.lifeMs = 260 + this.random() * 220;
      particle.size = this.random() < 0.5 ? 2 : 3;
      particle.color = color;
    }
  }

  floatText(x: number, y: number, text: string, color: string, nowMs: number): void {
    const entry = this.texts[this.nextText]!;
    this.nextText = (this.nextText + 1) % MAX_TEXTS;
    entry.active = true;
    entry.x = x;
    entry.y = y;
    entry.text = text;
    entry.color = color;
    entry.bornMs = nowMs;
  }

  shake(strength: number, durationMs: number, nowMs: number): void {
    this.shakeStrength = Math.max(strength, nowMs < this.shakeUntilMs ? this.shakeStrength : 0);
    this.shakeUntilMs = Math.max(this.shakeUntilMs, nowMs + durationMs);
  }

  flip(nowMs: number): void {
    this.flipStartedAtMs = nowMs;
  }

  // Radians for the double-jump somersault, or 0 when idle.
  flipAngle(nowMs: number, reducedMotion: boolean): number {
    if (this.flipStartedAtMs === null || reducedMotion) return 0;
    const progress = (nowMs - this.flipStartedAtMs) / FLIP_DURATION_MS;
    if (progress >= 1 || progress < 0) {
      this.flipStartedAtMs = null;
      return 0;
    }
    const eased = 1 - (1 - progress) ** 2;
    return -eased * Math.PI * 2;
  }

  // Whole logical pixels so pixel art stays crisp while shaking.
  shakeOffsetX(nowMs: number, reducedMotion: boolean): number {
    if (reducedMotion || nowMs >= this.shakeUntilMs) return 0;
    return Math.round((this.random() - 0.5) * 2 * this.shakeStrength);
  }

  shakeOffsetY(nowMs: number, reducedMotion: boolean): number {
    if (reducedMotion || nowMs >= this.shakeUntilMs) return 0;
    return Math.round((this.random() - 0.5) * 2 * this.shakeStrength);
  }

  draw(
    context: CanvasRenderingContext2D,
    cameraX: number,
    cameraY: number,
    nowMs: number,
    reducedMotion: boolean,
  ): void {
    if (!reducedMotion) {
      for (const particle of this.particles) {
        if (!particle.active) continue;
        const age = nowMs - particle.bornMs;
        if (age >= particle.lifeMs || age < 0) {
          particle.active = false;
          continue;
        }
        const x = particle.x + particle.vx * age;
        const y = particle.y + particle.vy * age + PARTICLE_GRAVITY * age * age;
        context.globalAlpha = 1 - age / particle.lifeMs;
        context.fillStyle = particle.color;
        context.fillRect(Math.round(x - cameraX), Math.round(y - cameraY), particle.size, particle.size);
      }
    }

    context.font = "700 13px ui-monospace, monospace";
    context.textAlign = "center";
    for (const text of this.texts) {
      if (!text.active) continue;
      const age = nowMs - text.bornMs;
      if (age >= TEXT_LIFE_MS || age < 0) {
        text.active = false;
        continue;
      }
      const rise = reducedMotion ? 0 : (age / TEXT_LIFE_MS) * 22;
      const x = Math.round(text.x - cameraX);
      const y = Math.round(text.y - cameraY - rise);
      context.globalAlpha = Math.min(1, 2.4 * (1 - age / TEXT_LIFE_MS));
      context.fillStyle = PALETTE.night;
      context.fillText(text.text, x + 1, y + 1);
      context.fillStyle = text.color;
      context.fillText(text.text, x, y);
    }
    context.textAlign = "start";
    context.globalAlpha = 1;
  }

  private random(): number {
    // Cosmetic xorshift; never shared with the seeded world generator.
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967296;
  }
}
