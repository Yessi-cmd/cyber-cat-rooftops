export type SoundCue = "jump" | "land" | "score" | "fail" | "toggle";

interface CueDefinition {
  frequencies: readonly number[];
  duration: number;
  gain: number;
  type: OscillatorType;
}

interface AmbientGraph {
  readonly carriers: readonly [OscillatorNode, OscillatorNode];
  readonly filter: BiquadFilterNode;
  readonly gain: GainNode;
  readonly lfo: OscillatorNode;
  readonly lfoDepth: GainNode;
}

export type AudioContextFactory = () => AudioContext;

const CUES: Record<SoundCue, CueDefinition> = {
  jump: { frequencies: [330, 520], duration: 0.09, gain: 0.035, type: "square" },
  land: { frequencies: [150, 110], duration: 0.07, gain: 0.025, type: "triangle" },
  score: { frequencies: [660, 880], duration: 0.11, gain: 0.025, type: "square" },
  fail: { frequencies: [220, 165, 110], duration: 0.24, gain: 0.032, type: "sawtooth" },
  toggle: { frequencies: [440, 660], duration: 0.08, gain: 0.02, type: "sine" },
};

// A barely audible two-note city hum. Keeping this procedural avoids another
// first-load asset and gives every active round a constant-size audio graph.
const AMBIENT_GAIN = 0.0032;
const AMBIENT_FADE_SECONDS = 0.12;

export class AudioController {
  private context: AudioContext | null = null;
  private ambientGraph: AmbientGraph | null = null;
  private ambientRequested = false;

  constructor(
    private muted: boolean,
    private readonly createContext: AudioContextFactory = () => new AudioContext(),
  ) {}

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopAmbient(0);
      if (this.context?.state === "running") {
        void this.context
          .suspend()
          .then(() => {
            if (!this.muted) {
              this.withRunningContext(() => undefined);
            }
          })
          .catch(() => undefined);
      }
      return;
    }

    this.syncAmbient();
  }

  setAmbientActive(active: boolean): void {
    this.ambientRequested = active;
    if (!active) {
      this.stopAmbient(AMBIENT_FADE_SECONDS);
      return;
    }

    this.syncAmbient();
  }

  play(cue: SoundCue): void {
    if (this.muted) {
      return;
    }

    this.withRunningContext((context) => this.scheduleCue(context, CUES[cue]));
  }

  private syncAmbient(): void {
    if (this.muted || !this.ambientRequested || this.ambientGraph !== null) {
      return;
    }

    this.withRunningContext((context) => {
      if (!this.muted && this.ambientRequested && this.ambientGraph === null) {
        this.startAmbient(context);
      }
    });
  }

  private withRunningContext(action: (context: AudioContext) => void): void {
    let context: AudioContext;
    try {
      context = this.context ?? this.createContext();
      this.context = context;
    } catch {
      return;
    }

    const run = (): void => {
      try {
        action(context);
      } catch {
        // Audio is optional; unsupported or interrupted audio must never block play.
      }
    };

    if (context.state === "suspended") {
      void context.resume().then(run).catch(() => undefined);
    } else if (context.state !== "closed") {
      run();
    }
  }

  private startAmbient(context: AudioContext): void {
    const start = context.currentTime;
    const firstCarrier = context.createOscillator();
    const secondCarrier = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();

    firstCarrier.type = "sine";
    firstCarrier.frequency.setValueAtTime(73.42, start);
    secondCarrier.type = "triangle";
    secondCarrier.frequency.setValueAtTime(110, start);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(360, start);
    filter.Q.setValueAtTime(0.35, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(AMBIENT_GAIN, start + 0.35);

    lfo.type = "sine";
    lfo.frequency.setValueAtTime(0.065, start);
    lfoDepth.gain.setValueAtTime(AMBIENT_GAIN * 0.18, start);

    firstCarrier.connect(filter);
    secondCarrier.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    lfo.connect(lfoDepth);
    lfoDepth.connect(gain.gain);

    firstCarrier.start(start);
    secondCarrier.start(start);
    lfo.start(start);

    this.ambientGraph = {
      carriers: [firstCarrier, secondCarrier],
      filter,
      gain,
      lfo,
      lfoDepth,
    };
  }

  private stopAmbient(fadeSeconds: number): void {
    const graph = this.ambientGraph;
    const context = this.context;
    if (graph === null || context === null) {
      return;
    }

    this.ambientGraph = null;
    const now = context.currentTime;
    const stopAt = now + fadeSeconds;

    try {
      graph.gain.gain.cancelScheduledValues(now);
      graph.gain.gain.setValueAtTime(Math.max(graph.gain.gain.value, 0.0001), now);
      if (fadeSeconds > 0) {
        graph.gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      }
      graph.carriers.forEach((carrier) => carrier.stop(stopAt));
      graph.lfo.stop(stopAt);

      const disconnect = (): void => {
        graph.carriers.forEach((carrier) => carrier.disconnect());
        graph.filter.disconnect();
        graph.gain.disconnect();
        graph.lfo.disconnect();
        graph.lfoDepth.disconnect();
      };
      if (fadeSeconds === 0) {
        disconnect();
      } else {
        graph.carriers[0].addEventListener("ended", disconnect, { once: true });
      }
    } catch {
      // Browsers can close an AudioContext between lifecycle callbacks.
    }
  }

  private scheduleCue(context: AudioContext, cue: CueDefinition): void {
    const start = context.currentTime;
    const segment = cue.duration / cue.frequencies.length;

    cue.frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const segmentStart = start + index * segment;
      const segmentEnd = segmentStart + segment;

      oscillator.type = cue.type;
      oscillator.frequency.setValueAtTime(frequency, segmentStart);
      gain.gain.setValueAtTime(0.0001, segmentStart);
      gain.gain.exponentialRampToValueAtTime(cue.gain, segmentStart + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, segmentEnd);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(segmentStart);
      oscillator.stop(segmentEnd + 0.01);
    });
  }
}
