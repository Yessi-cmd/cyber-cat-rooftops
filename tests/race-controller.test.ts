import { describe, expect, it } from "vitest";
import { RaceController } from "../src/net/race-controller";
import { GameSession } from "../src/game/session";
import type { ClientMessage, ServerMessage } from "../shared/race-protocol";

class FakeSocket {
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: ServerMessage | string): void {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }
}

function setup() {
  let now = 0;
  const sockets: FakeSocket[] = [];
  let changes = 0;
  const race = new RaceController("ws://test/ws", () => { changes += 1; }, () => now, () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  const room = (phase: "lobby" | "countdown" | "racing" | "results", extra: Partial<Extract<ServerMessage, { t: "room" }>> = {}): ServerMessage => ({
    t: "room", room: "AB2CD", you: 0, host: 0, phase, seed: null,
    players: [
      { slot: 0, inRace: phase !== "lobby", finished: false, score: 0 },
      { slot: 1, inRace: phase !== "lobby", finished: false, score: 0 },
    ],
    ...extra,
  });
  return { race, sockets, room, tick: (ms: number) => { now += ms; }, changes: () => changes };
}

describe("RaceController", () => {
  it("建房消息在连接打开后发出，房间视图随服务器更新", () => {
    const { race, sockets, room } = setup();
    race.create();
    expect(race.view).toMatchObject({ room: null, error: null });
    const socket = sockets[0]!;
    expect(socket.sent).toEqual([]);
    socket.open();
    expect(socket.sent).toEqual([{ t: "create" }]);
    socket.receive(room("lobby"));
    expect(race.view).toMatchObject({ room: "AB2CD", phase: "lobby" });
    expect(race.isHost).toBe(true);
    socket.receive("{garbage");
    socket.receive(JSON.stringify({ t: "room", room: "<img>" }));
    expect(race.view!.room).toBe("AB2CD");
  });

  it("倒计时结束只交出一次种子；比赛中按间隔节流上报，结束后停止", () => {
    const { race, sockets, room, tick } = setup();
    race.join("AB2CD");
    const socket = sockets[0]!;
    socket.open();
    socket.receive(room("lobby"));
    socket.receive({ t: "countdown", seed: 4242, startsInMs: 3000 });
    socket.receive(room("countdown"));
    expect(race.racing).toBe(true);
    tick(2999);
    expect(race.takeStart()).toBeNull();
    expect(race.countdownRemainingMs()).toBe(1);
    tick(1);
    expect(race.takeStart()).toBe(4242);
    expect(race.takeStart()).toBeNull();

    socket.receive(room("racing"));
    const snapshot = new GameSession(4242).snapshot();
    socket.sent = [];
    race.reportState(snapshot);
    tick(50);
    race.reportState(snapshot);
    tick(50);
    race.reportState(snapshot);
    expect(socket.sent.filter(message => message.t === "state")).toHaveLength(2);
    race.reportFinish(123);
    race.reportFinish(456);
    tick(500);
    race.reportState(snapshot);
    expect(socket.sent.filter(message => message.t === "finish")).toEqual([{ t: "finish", score: 123 }]);
    expect(socket.sent.filter(message => message.t === "state")).toHaveLength(2);
  });

  it("幽灵猫在两次采样之间插值，出局或断线后隐藏", () => {
    const { race, sockets, room, tick } = setup();
    race.join("AB2CD");
    const socket = sockets[0]!;
    socket.open();
    socket.receive(room("racing"));
    socket.receive({ t: "state", slot: 1, x: 100, y: 600, vy: 0, grounded: true, score: 10 });
    tick(100);
    socket.receive({ t: "state", slot: 1, x: 200, y: 580, vy: -300, grounded: false, score: 20 });
    // Rendered 150 ms behind: at now=200 that is t=50, halfway between samples.
    tick(100);
    const ghost = race.ghosts()[1]!;
    expect(ghost.visible).toBe(true);
    expect(ghost.x).toBeCloseTo(150);
    expect(ghost.score).toBe(20);
    expect(race.ghosts()[0]!.visible).toBe(false); // never draws yourself
    socket.receive(room("racing", { players: [
      { slot: 0, inRace: true, finished: false, score: 0 },
      { slot: 1, inRace: true, finished: true, score: 20 },
    ] }));
    expect(race.ghosts()[1]!.visible).toBe(false);

    socket.onclose?.();
    expect(race.view!.error).toBe("disconnected");
    race.leave();
    expect(race.active).toBe(false);
  });
});
