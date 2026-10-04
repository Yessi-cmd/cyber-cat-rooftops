// Wire format shared by the browser client and the room relay server.
// Keep this file dependency-free: it is compiled for both DOM and Node.

export const RACE_MAX_PLAYERS = 4;
export const RACE_COUNTDOWN_MS = 3000;
export const RACE_STATE_INTERVAL_MS = 100;
// A race with a silent (e.g. backgrounded forever) runner still ends.
export const RACE_MAX_DURATION_MS = 15 * 60 * 1000;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;
export const RACE_MAX_MESSAGE_BYTES = 512;
// Generous bounds: values outside them are malformed, not merely suspicious.
const MAX_COORDINATE = 10_000_000;
const MAX_SCORE = 1_000_000;

export type RacePhase = "lobby" | "countdown" | "racing" | "results";

export interface RacePlayer {
  slot: number;
  // Joined during a race: watches and waits for the next round.
  inRace: boolean;
  finished: boolean;
  score: number;
}

export interface RaceRanking {
  slot: number;
  score: number;
}

export interface RaceRunnerState {
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
  score: number;
}

export type ClientMessage =
  | { t: "create" }
  | { t: "join"; room: string }
  | { t: "start" }
  | ({ t: "state" } & RaceRunnerState)
  | { t: "finish"; score: number }
  | { t: "leave" };

export type RaceErrorCode =
  | "room-not-found"
  | "room-full"
  | "not-host"
  | "bad-phase"
  | "rate-limited"
  | "bad-message"
  | "server-busy";

export type ServerMessage =
  | {
    t: "room";
    room: string;
    you: number;
    host: number;
    phase: RacePhase;
    seed: number | null;
    players: RacePlayer[];
  }
  | { t: "countdown"; seed: number; startsInMs: number }
  | ({ t: "state"; slot: number } & RaceRunnerState)
  | { t: "results"; ranking: RaceRanking[] }
  | { t: "error"; code: RaceErrorCode };

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

export function isRaceScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_SCORE;
}

function isSlot(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < RACE_MAX_PLAYERS;
}

export function isRoomCode(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== ROOM_CODE_LENGTH) return false;
  for (const char of value) if (!ROOM_CODE_ALPHABET.includes(char)) return false;
  return true;
}

// Accepts lower case and stray spaces from hand-typed or pasted codes.
export function normalizeRoomCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return isRoomCode(code) ? code : null;
}

function readRunnerState(data: Json): RaceRunnerState | null {
  const { x, y, vy, grounded, score } = data;
  if (!isCoordinate(x) || !isCoordinate(y) || !isCoordinate(vy)) return null;
  if (typeof grounded !== "boolean" || !isRaceScore(score)) return null;
  return { x, y, vy, grounded, score };
}

function parseJson(raw: string): Json | null {
  if (raw.length > RACE_MAX_MESSAGE_BYTES) return null;
  try {
    const data: unknown = JSON.parse(raw);
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

export function parseClientMessage(raw: string): ClientMessage | null {
  const data = parseJson(raw);
  if (data === null) return null;
  switch (data.t) {
    case "create":
    case "start":
    case "leave":
      return { t: data.t };
    case "join":
      return isRoomCode(data.room) ? { t: "join", room: data.room } : null;
    case "state": {
      const state = readRunnerState(data);
      return state === null ? null : { t: "state", ...state };
    }
    case "finish":
      return isRaceScore(data.score) ? { t: "finish", score: data.score } : null;
    default:
      return null;
  }
}

const PHASES: readonly RacePhase[] = ["lobby", "countdown", "racing", "results"];
const ERROR_CODES: readonly RaceErrorCode[] = [
  "room-not-found", "room-full", "not-host", "bad-phase", "rate-limited", "bad-message", "server-busy",
];

function readPlayer(value: unknown): RacePlayer | null {
  if (!isRecord(value)) return null;
  const { slot, inRace, finished, score } = value;
  if (!isSlot(slot) || typeof inRace !== "boolean" || typeof finished !== "boolean" || !isRaceScore(score)) {
    return null;
  }
  return { slot, inRace, finished, score };
}

function readRanking(value: unknown): RaceRanking | null {
  if (!isRecord(value) || !isSlot(value.slot) || !isRaceScore(value.score)) return null;
  return { slot: value.slot, score: value.score };
}

function readList<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > RACE_MAX_PLAYERS) return null;
  const items: T[] = [];
  for (const item of value) {
    const parsed = read(item);
    if (parsed === null) return null;
    items.push(parsed);
  }
  return items;
}

const isSeed = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 0xffffffff;

// The client treats the server as untrusted input too.
export function parseServerMessage(raw: string): ServerMessage | null {
  const data = parseJson(raw);
  if (data === null) return null;
  switch (data.t) {
    case "room": {
      const players = readList(data.players, readPlayer);
      const { room, you, host, phase, seed } = data;
      if (!isRoomCode(room) || !isSlot(you) || !isSlot(host) || players === null) return null;
      if (typeof phase !== "string" || !PHASES.includes(phase as RacePhase)) return null;
      if (seed !== null && !isSeed(seed)) return null;
      return { t: "room", room, you, host, phase: phase as RacePhase, seed, players };
    }
    case "countdown": {
      const { seed, startsInMs } = data;
      if (!isSeed(seed) || typeof startsInMs !== "number" || !(startsInMs >= 0 && startsInMs <= RACE_COUNTDOWN_MS)) {
        return null;
      }
      return { t: "countdown", seed, startsInMs };
    }
    case "state": {
      const state = readRunnerState(data);
      return state === null || !isSlot(data.slot) ? null : { t: "state", slot: data.slot, ...state };
    }
    case "results": {
      const ranking = readList(data.ranking, readRanking);
      return ranking === null ? null : { t: "results", ranking };
    }
    case "error":
      return typeof data.code === "string" && ERROR_CODES.includes(data.code as RaceErrorCode)
        ? { t: "error", code: data.code as RaceErrorCode }
        : null;
    default:
      return null;
  }
}
