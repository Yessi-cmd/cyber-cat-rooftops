import {
  RACE_MAX_PLAYERS,
  RACE_STATE_INTERVAL_MS,
  type RaceErrorCode,
  type RacePhase,
  type RacePlayer,
  type RaceRanking,
  type ServerMessage,
} from "../../shared/race-protocol.js";
import type { WorldSnapshot } from "../game/types";
import { RaceClient, type RaceSocketFactory } from "./race-client";

// Ghosts render slightly in the past so two samples usually bracket the frame.
const GHOST_DELAY_MS = 150;

export interface Ghost {
  slot: number;
  visible: boolean;
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
  score: number;
}

export interface RaceView {
  room: string | null; // null while creating/joining
  you: number;
  host: number;
  phase: RacePhase;
  players: readonly RacePlayer[];
  ranking: readonly RaceRanking[] | null;
  error: RaceErrorCode | "disconnected" | null;
}

interface Sample {
  at: number;
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
  score: number;
}

export class RaceController {
  private readonly client: RaceClient;
  private state: RaceView | null = null;
  private countdownAt: number | null = null;
  private countdownSeed = 0;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private finishedLocally = false;
  private readonly previous: (Sample | null)[] = new Array(RACE_MAX_PLAYERS).fill(null);
  private readonly latest: (Sample | null)[] = new Array(RACE_MAX_PLAYERS).fill(null);
  private readonly ghostList: Ghost[] = Array.from({ length: RACE_MAX_PLAYERS }, (_, slot) => ({
    slot, visible: false, x: 0, y: 0, vy: 0, grounded: true, score: 0,
  }));

  constructor(
    url: string,
    private readonly onChange: () => void,
    private readonly now: () => number = () => performance.now(),
    socketFactory?: RaceSocketFactory,
  ) {
    this.client = new RaceClient(url, this.handle, this.handleClose, socketFactory);
  }

  get view(): Readonly<RaceView> | null {
    return this.state;
  }

  get active(): boolean {
    return this.state !== null;
  }

  // True when this client runs in the current race (not a waiting spectator).
  get racing(): boolean {
    const view = this.state;
    if (view === null || (view.phase !== "racing" && view.phase !== "countdown")) return false;
    return view.players.some(player => player.slot === view.you && player.inRace);
  }

  get isHost(): boolean {
    return this.state !== null && this.state.room !== null && this.state.you === this.state.host;
  }

  create(): void {
    this.enter();
    this.client.send({ t: "create" });
  }

  join(room: string): void {
    this.enter();
    this.client.send({ t: "join", room });
  }

  start(): void {
    if (this.isHost) this.client.send({ t: "start" });
  }

  leave(): void {
    this.client.close();
    this.state = null;
    this.countdownAt = null;
    this.clearGhosts();
    this.onChange();
  }

  countdownRemainingMs(): number | null {
    return this.countdownAt === null ? null : Math.max(0, this.countdownAt - this.now());
  }

  // Returns the race seed exactly once, when the local countdown elapses.
  takeStart(): number | null {
    if (this.countdownAt === null || this.now() < this.countdownAt) return null;
    this.countdownAt = null;
    return this.countdownSeed;
  }

  reportState(snapshot: WorldSnapshot): void {
    if (!this.racing || this.finishedLocally) return;
    const now = this.now();
    if (now - this.lastSentAt < RACE_STATE_INTERVAL_MS) return;
    this.lastSentAt = now;
    const { cat } = snapshot;
    this.client.send({
      t: "state",
      x: Math.round(cat.x * 10) / 10,
      y: Math.round(cat.y * 10) / 10,
      vy: Math.round(cat.vy),
      grounded: cat.grounded,
      score: snapshot.score,
    });
  }

  reportFinish(score: number): void {
    if (!this.racing || this.finishedLocally) return;
    this.finishedLocally = true;
    this.client.send({ t: "finish", score });
  }

  // Interpolated opponents; the array and its objects are reused every frame.
  ghosts(): readonly Ghost[] {
    const view = this.state;
    const renderAt = this.now() - GHOST_DELAY_MS;
    for (const ghost of this.ghostList) {
      ghost.visible = false;
      if (view === null || view.phase !== "racing" || ghost.slot === view.you) continue;
      const player = view.players.find(item => item.slot === ghost.slot);
      const latest = this.latest[ghost.slot];
      if (!player?.inRace || player.finished || latest == null) continue;
      const previous = this.previous[ghost.slot];
      let from = latest;
      let t = 0;
      if (previous != null && renderAt < latest.at) {
        from = previous;
        t = Math.max(0, Math.min(1, (renderAt - previous.at) / Math.max(1, latest.at - previous.at)));
      }
      ghost.visible = true;
      ghost.x = from.x + (latest.x - from.x) * t;
      ghost.y = from.y + (latest.y - from.y) * t;
      ghost.vy = t < 0.5 ? from.vy : latest.vy;
      ghost.grounded = t < 0.5 ? from.grounded : latest.grounded;
      ghost.score = latest.score;
    }
    return this.ghostList;
  }

  private enter(): void {
    this.client.close();
    this.clearGhosts();
    this.countdownAt = null;
    this.state = { room: null, you: 0, host: 0, phase: "lobby", players: [], ranking: null, error: null };
    this.onChange();
  }

  private clearGhosts(): void {
    this.previous.fill(null);
    this.latest.fill(null);
    for (const ghost of this.ghostList) ghost.visible = false;
  }

  private readonly handle = (message: ServerMessage): void => {
    const view = this.state;
    if (view === null) return;
    switch (message.t) {
      case "room":
        view.room = message.room;
        view.you = message.you;
        view.host = message.host;
        view.phase = message.phase;
        view.players = message.players;
        view.error = null;
        if (message.phase === "lobby") view.ranking = null;
        break;
      case "countdown":
        this.countdownSeed = message.seed;
        this.countdownAt = this.now() + message.startsInMs;
        this.finishedLocally = false;
        this.lastSentAt = Number.NEGATIVE_INFINITY;
        view.ranking = null;
        this.clearGhosts();
        break;
      case "state": {
        if (message.slot === view.you) return;
        const sample = this.previous[message.slot] ?? { at: 0, x: 0, y: 0, vy: 0, grounded: true, score: 0 };
        this.previous[message.slot] = this.latest[message.slot] ?? null;
        sample.at = this.now();
        sample.x = message.x;
        sample.y = message.y;
        sample.vy = message.vy;
        sample.grounded = message.grounded;
        sample.score = message.score;
        this.latest[message.slot] = sample;
        return; // high-frequency: no UI change notification
      }
      case "results":
        view.ranking = message.ranking;
        break;
      case "error":
        view.error = message.code;
        break;
    }
    this.onChange();
  };

  private readonly handleClose = (): void => {
    if (this.state === null) return;
    this.state.error = "disconnected";
    this.countdownAt = null;
    this.onChange();
  };
}
