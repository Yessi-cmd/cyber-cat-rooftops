import {
  RACE_COUNTDOWN_MS,
  RACE_MAX_DURATION_MS,
  RACE_MAX_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientMessage,
  type RacePhase,
  type RaceRanking,
  type ServerMessage,
} from "../shared/race-protocol.js";

// Pure room state machine: no sockets, timers or wall clock of its own, so it
// is fully deterministic under test. The server feeds it messages and ticks.

export interface RoomClock {
  now(): number;
  random(): number; // [0, 1)
}

export type Send = (connection: number, message: ServerMessage) => void;

interface Member {
  connection: number;
  slot: number;
  inRace: boolean;
  finished: boolean;
  score: number;
}

interface Room {
  code: string;
  members: Member[];
  host: number;
  phase: RacePhase;
  seed: number | null;
  startsAt: number;
}

export class RaceRooms {
  private readonly rooms = new Map<string, Room>();
  private readonly roomByConnection = new Map<number, Room>();

  constructor(
    private readonly send: Send,
    private readonly clock: RoomClock,
    private readonly maxRooms = 100,
  ) {}

  get roomCount(): number {
    return this.rooms.size;
  }

  handle(connection: number, message: ClientMessage): void {
    switch (message.t) {
      case "create":
        this.create(connection);
        return;
      case "join":
        this.join(connection, message.room);
        return;
      case "leave":
        this.disconnect(connection);
        return;
      case "start":
        this.start(connection);
        return;
      case "state": {
        const found = this.racingMember(connection);
        if (found === null) return;
        const { room, member } = found;
        member.score = Math.max(member.score, message.score);
        const relay: ServerMessage = { ...message, slot: member.slot };
        for (const other of room.members) {
          if (other !== member) this.send(other.connection, relay);
        }
        return;
      }
      case "finish": {
        const found = this.racingMember(connection);
        if (found === null) return;
        found.member.finished = true;
        found.member.score = Math.max(found.member.score, message.score);
        if (!this.settle(found.room)) this.broadcastRoom(found.room);
        return;
      }
    }
  }

  disconnect(connection: number): void {
    const room = this.roomByConnection.get(connection);
    if (room === undefined) return;
    this.roomByConnection.delete(connection);
    room.members = room.members.filter(member => member.connection !== connection);
    if (room.members.length === 0) {
      this.rooms.delete(room.code);
      return;
    }
    if (!room.members.some(member => member.slot === room.host)) {
      room.host = Math.min(...room.members.map(member => member.slot));
    }
    // A runner who leaves mid-race simply drops out of the ranking.
    if (!this.settle(room)) this.broadcastRoom(room);
  }

  // Advance timed phases; the server calls this a few times per second.
  tick(): void {
    const now = this.clock.now();
    for (const room of this.rooms.values()) {
      if (room.phase === "countdown" && now >= room.startsAt) {
        room.phase = "racing";
        this.broadcastRoom(room);
      } else if (room.phase === "racing" && now >= room.startsAt + RACE_MAX_DURATION_MS) {
        for (const member of room.members) member.finished = true;
        this.settle(room);
      }
    }
  }

  private create(connection: number): void {
    this.disconnect(connection);
    if (this.rooms.size >= this.maxRooms) {
      this.send(connection, { t: "error", code: "server-busy" });
      return;
    }
    const room: Room = {
      code: this.uniqueCode(),
      members: [],
      host: 0,
      phase: "lobby",
      seed: null,
      startsAt: 0,
    };
    this.rooms.set(room.code, room);
    this.addMember(room, connection);
  }

  private join(connection: number, code: string): void {
    const current = this.roomByConnection.get(connection);
    if (current?.code === code) {
      this.broadcastRoom(current);
      return;
    }
    const room = this.rooms.get(code);
    if (room === undefined) {
      this.send(connection, { t: "error", code: "room-not-found" });
      return;
    }
    if (room.members.length >= RACE_MAX_PLAYERS) {
      this.send(connection, { t: "error", code: "room-full" });
      return;
    }
    this.disconnect(connection);
    this.addMember(room, connection);
  }

  private start(connection: number): void {
    const room = this.roomByConnection.get(connection);
    if (room === undefined) return;
    const member = room.members.find(item => item.connection === connection)!;
    if (member.slot !== room.host) {
      this.send(connection, { t: "error", code: "not-host" });
      return;
    }
    if (room.phase !== "lobby" && room.phase !== "results") {
      this.send(connection, { t: "error", code: "bad-phase" });
      return;
    }
    room.seed = 1 + Math.floor(this.clock.random() * 0xfffffffe);
    room.phase = "countdown";
    room.startsAt = this.clock.now() + RACE_COUNTDOWN_MS;
    for (const item of room.members) {
      item.inRace = true;
      item.finished = false;
      item.score = 0;
    }
    for (const item of room.members) {
      this.send(item.connection, { t: "countdown", seed: room.seed, startsInMs: RACE_COUNTDOWN_MS });
    }
    this.broadcastRoom(room);
  }

  // Ends the race once every runner still present has finished.
  private settle(room: Room): boolean {
    if (room.phase !== "racing" && room.phase !== "countdown") return false;
    const runners = room.members.filter(member => member.inRace);
    if (runners.some(member => !member.finished)) return false;
    if (runners.length === 0) {
      room.phase = "lobby";
      this.broadcastRoom(room);
      return true;
    }
    const ranking: RaceRanking[] = runners
      .map(member => ({ slot: member.slot, score: member.score }))
      .sort((a, b) => b.score - a.score || a.slot - b.slot);
    room.phase = "results";
    for (const member of room.members) this.send(member.connection, { t: "results", ranking });
    this.broadcastRoom(room);
    return true;
  }

  private racingMember(connection: number): { room: Room; member: Member } | null {
    const room = this.roomByConnection.get(connection);
    if (room?.phase !== "racing") return null;
    const member = room.members.find(item => item.connection === connection);
    return member?.inRace && !member.finished ? { room, member } : null;
  }

  private addMember(room: Room, connection: number): void {
    let slot = 0;
    while (room.members.some(member => member.slot === slot)) slot += 1;
    room.members.push({ connection, slot, inRace: false, finished: false, score: 0 });
    room.members.sort((a, b) => a.slot - b.slot);
    if (room.members.length === 1) room.host = slot;
    this.roomByConnection.set(connection, room);
    this.broadcastRoom(room);
  }

  private broadcastRoom(room: Room): void {
    const players = room.members.map(({ slot, inRace, finished, score }) => ({ slot, inRace, finished, score }));
    for (const member of room.members) {
      this.send(member.connection, {
        t: "room",
        room: room.code,
        you: member.slot,
        host: room.host,
        phase: room.phase,
        seed: room.seed,
        players,
      });
    }
  }

  private uniqueCode(): string {
    for (;;) {
      let code = "";
      for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
        code += ROOM_CODE_ALPHABET[Math.floor(this.clock.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}
