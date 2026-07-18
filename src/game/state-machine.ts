import type { GameState } from "./types";

export type GameEvent = "start" | "pause" | "resume" | "lose" | "restart";

const TRANSITIONS: Record<GameState, Partial<Record<GameEvent, GameState>>> = {
  ready: { start: "playing" },
  playing: { pause: "paused", lose: "gameOver", restart: "playing" },
  paused: { resume: "playing", restart: "playing" },
  gameOver: { restart: "playing" },
};

export class GameStateMachine {
  state: GameState = "ready";

  send(event: GameEvent): boolean {
    const next = TRANSITIONS[this.state][event];
    if (next === undefined) {
      return false;
    }

    this.state = next;
    return true;
  }
}
