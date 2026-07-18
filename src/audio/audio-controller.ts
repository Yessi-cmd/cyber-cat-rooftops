export type SoundCue = "jump" | "land" | "score" | "fail" | "toggle";

interface CueDefinition {
  frequencies: readonly number[];
  duration: number;
  gain: number;
  type: OscillatorType;
}

const CUES: Record<SoundCue, CueDefinition> = {
  jump: { frequencies: [330, 520], duration: 0.09, gain: 0.035, type: "square" },
  land: { frequencies: [150, 110], duration: 0.07, gain: 0.025, type: "triangle" },
  score: { frequencies: [660, 880], duration: 0.11, gain: 0.025, type: "square" },
  fail: { frequencies: [220, 165, 110], duration: 0.24, gain: 0.032, type: "sawtooth" },
  toggle: { frequencies: [440, 660], duration: 0.08, gain: 0.02, type: "sine" },
};

export class AudioController {
  private context: AudioContext | null = null;

  constructor(private muted: boolean) {}

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted && this.context?.state === "running") {
      void this.context.suspend().catch(() => undefined);
    }
  }

  play(cue: SoundCue): void {
    if (this.muted) {
      return;
    }

    let context: AudioContext;
    try {
      context = this.context ?? new AudioContext();
      this.context = context;
    } catch {
      return;
    }

    const schedule = (): void => {
      try {
        this.scheduleCue(context, CUES[cue]);
      } catch {
        // Audio is optional; unsupported or interrupted audio must never block play.
      }
    };

    if (context.state === "suspended") {
      void context.resume().then(schedule).catch(() => undefined);
    } else {
      schedule();
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
