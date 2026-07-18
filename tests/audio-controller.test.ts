import { describe, expect, it } from "vitest";
import { AudioController } from "../src/audio/audio-controller";

class FakeAudioParam {
  value = 0;

  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  cancelScheduledValues(): this {
    return this;
  }
}

class FakeNode {
  disconnectCount = 0;

  connect(): this {
    return this;
  }

  disconnect(): void {
    this.disconnectCount += 1;
  }
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = "sine";
  readonly frequency = new FakeAudioParam();
  startCount = 0;
  stopCount = 0;
  private ended: (() => void) | null = null;

  start(): void {
    this.startCount += 1;
  }

  stop(): void {
    this.stopCount += 1;
  }

  addEventListener(event: string, listener: EventListenerOrEventListenerObject): void {
    if (event !== "ended") {
      return;
    }
    this.ended =
      typeof listener === "function" ? () => listener(new Event("ended")) : () => undefined;
  }

  finish(): void {
    this.ended?.();
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeAudioParam();
}

class FakeFilter extends FakeNode {
  type: BiquadFilterType = "lowpass";
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
}

class FakeAudioContext {
  state: AudioContextState = "running";
  readonly currentTime = 12;
  readonly destination = new FakeNode();
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];

  createOscillator(): OscillatorNode {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter as unknown as BiquadFilterNode;
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.state = "suspended";
    return Promise.resolve();
  }
}

describe("AudioController", () => {
  it("静音时不会为环境音创建 AudioContext", () => {
    let contextCreations = 0;
    const controller = new AudioController(true, () => {
      contextCreations += 1;
      return new FakeAudioContext() as unknown as AudioContext;
    });

    controller.setAmbientActive(true);
    controller.play("jump");

    expect(contextCreations).toBe(0);
  });

  it("环境音重复启用保持单一固定大小的音频图", () => {
    const context = new FakeAudioContext();
    const controller = new AudioController(
      false,
      () => context as unknown as AudioContext,
    );

    controller.setAmbientActive(true);
    controller.setAmbientActive(true);

    expect(context.oscillators).toHaveLength(3);
    expect(context.gains).toHaveLength(2);
    expect(context.filters).toHaveLength(1);
    expect(context.oscillators.every((oscillator) => oscillator.startCount === 1)).toBe(true);
  });

  it("暂停、静音和恢复会停止旧声源且只创建一套新声源", async () => {
    const context = new FakeAudioContext();
    const controller = new AudioController(
      false,
      () => context as unknown as AudioContext,
    );

    controller.setAmbientActive(true);
    controller.setAmbientActive(false);
    expect(context.oscillators.slice(0, 3).every((oscillator) => oscillator.stopCount === 1)).toBe(
      true,
    );

    controller.setAmbientActive(true);
    expect(context.oscillators).toHaveLength(6);
    controller.setMuted(true);
    expect(context.oscillators.slice(3).every((oscillator) => oscillator.stopCount === 1)).toBe(
      true,
    );
    expect(context.state).toBe("suspended");

    controller.setMuted(false);
    await Promise.resolve();
    expect(context.state).toBe("running");
    expect(context.oscillators).toHaveLength(9);
  });

  it("连续五十局启停后没有未停止的旧环境声源", () => {
    const context = new FakeAudioContext();
    const controller = new AudioController(
      false,
      () => context as unknown as AudioContext,
    );

    for (let round = 0; round < 50; round += 1) {
      controller.setAmbientActive(true);
      controller.setAmbientActive(false);
    }

    expect(context.oscillators).toHaveLength(150);
    expect(context.oscillators.every((oscillator) => oscillator.stopCount === 1)).toBe(true);
  });

  it("音频实现缺失或创建失败时保持静默降级", () => {
    const controller = new AudioController(false, () => {
      throw new Error("AudioContext unavailable");
    });

    expect(() => controller.setAmbientActive(true)).not.toThrow();
    expect(() => controller.play("score")).not.toThrow();
    expect(() => controller.setMuted(true)).not.toThrow();
  });
});
