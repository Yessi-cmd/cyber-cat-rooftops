import { describe, expect, it } from "vitest";
import { RaceRooms } from "../../server/race-room.js";
import {
  RACE_COUNTDOWN_MS,
  RACE_MAX_DURATION_MS,
  type ServerMessage,
} from "../../shared/race-protocol.js";

function setup() {
  let now = 1_000;
  let seed = 0.123;
  const inbox = new Map<number, ServerMessage[]>();
  const rooms = new RaceRooms(
    (connection, message) => {
      const list = inbox.get(connection) ?? [];
      list.push(message);
      inbox.set(connection, list);
    },
    { now: () => now, random: () => (seed = (seed * 9301 + 0.49297) % 1) },
    3,
  );
  const last = <T extends ServerMessage["t"]>(connection: number, type: T) =>
    inbox.get(connection)?.filter((message): message is Extract<ServerMessage, { t: T }> => message.t === type).at(-1);
  const advance = (ms: number) => {
    now += ms;
    rooms.tick();
  };
  return { rooms, inbox, last, advance };
}

describe("RaceRooms", () => {
  it("建房、凭房号加入，按最小空位分配颜色，最多四人", () => {
    const { rooms, last } = setup();
    rooms.handle(1, { t: "create" });
    const code = last(1, "room")!.room;
    expect(last(1, "room")).toMatchObject({ you: 0, host: 0, phase: "lobby", seed: null });
    for (const connection of [2, 3, 4]) rooms.handle(connection, { t: "join", room: code });
    expect(last(4, "room")!.you).toBe(3);
    expect(last(1, "room")!.players.map(player => player.slot)).toEqual([0, 1, 2, 3]);
    rooms.handle(5, { t: "join", room: code });
    expect(last(5, "error")!.code).toBe("room-full");
    rooms.disconnect(3);
    rooms.handle(5, { t: "join", room: code });
    expect(last(5, "room")!.you).toBe(2);
    rooms.handle(6, { t: "join", room: "ZZZZZ" });
    expect(last(6, "error")!.code).toBe("room-not-found");
  });

  it("只有房主能开赛；倒计时后进入比赛，所有人拿到同一种子", () => {
    const { rooms, last, advance } = setup();
    rooms.handle(1, { t: "create" });
    const code = last(1, "room")!.room;
    rooms.handle(2, { t: "join", room: code });
    rooms.handle(2, { t: "start" });
    expect(last(2, "error")!.code).toBe("not-host");
    rooms.handle(1, { t: "start" });
    const countdown = last(1, "countdown")!;
    expect(countdown.startsInMs).toBe(RACE_COUNTDOWN_MS);
    expect(last(2, "countdown")!.seed).toBe(countdown.seed);
    expect(last(2, "room")!.phase).toBe("countdown");
    rooms.handle(1, { t: "start" });
    expect(last(1, "error")!.code).toBe("bad-phase");
    advance(RACE_COUNTDOWN_MS - 1);
    expect(last(2, "room")!.phase).toBe("countdown");
    advance(1);
    expect(last(2, "room")!.phase).toBe("racing");
  });

  it("比赛中转发状态给其他人，全部结束后按分数排名，可再来一局", () => {
    const { rooms, inbox, last, advance } = setup();
    rooms.handle(1, { t: "create" });
    const code = last(1, "room")!.room;
    rooms.handle(2, { t: "join", room: code });
    rooms.handle(3, { t: "join", room: code });
    // State before the race starts is ignored.
    rooms.handle(2, { t: "state", x: 1, y: 2, vy: 0, grounded: true, score: 5 });
    expect(last(1, "state")).toBeUndefined();
    rooms.handle(1, { t: "start" });
    advance(RACE_COUNTDOWN_MS);
    rooms.handle(2, { t: "state", x: 100, y: 600, vy: -10, grounded: false, score: 40 });
    expect(last(1, "state")).toEqual({ t: "state", slot: 1, x: 100, y: 600, vy: -10, grounded: false, score: 40 });
    expect(last(2, "state")).toBeUndefined();
    rooms.handle(2, { t: "finish", score: 300 });
    rooms.handle(1, { t: "finish", score: 300 });
    expect(last(1, "results")).toBeUndefined();
    // A late state from a finished runner is not relayed.
    const before = inbox.get(3)!.length;
    rooms.handle(2, { t: "state", x: 1, y: 1, vy: 0, grounded: true, score: 999 });
    expect(inbox.get(3)!.length).toBe(before);
    rooms.handle(3, { t: "finish", score: 120 });
    expect(last(3, "results")!.ranking).toEqual([
      { slot: 0, score: 300 },
      { slot: 1, score: 300 },
      { slot: 2, score: 120 },
    ]);
    expect(last(1, "room")!.phase).toBe("results");
    rooms.handle(1, { t: "start" });
    expect(last(3, "room")!.players.every(player => player.inRace && !player.finished && player.score === 0)).toBe(true);
  });

  it("比赛中加入者观战等下一局；离开的选手退出排名；房主离开会移交", () => {
    const { rooms, last, advance } = setup();
    rooms.handle(1, { t: "create" });
    const code = last(1, "room")!.room;
    rooms.handle(2, { t: "join", room: code });
    rooms.handle(1, { t: "start" });
    advance(RACE_COUNTDOWN_MS);
    rooms.handle(3, { t: "join", room: code });
    expect(last(3, "room")!.players.find(player => player.slot === 2)!.inRace).toBe(false);
    rooms.handle(1, { t: "state", x: 5, y: 5, vy: 0, grounded: true, score: 1 });
    expect(last(3, "state")!.slot).toBe(0); // spectators see the runners
    rooms.handle(3, { t: "finish", score: 999 }); // ignored: not racing
    rooms.disconnect(1);
    expect(last(2, "room")!.host).toBe(1);
    rooms.handle(2, { t: "finish", score: 50 });
    expect(last(3, "results")!.ranking).toEqual([{ slot: 1, score: 50 }]);
  });

  it("所有选手离开则回到大厅；超时强制结算；房间清空即删除并受上限保护", () => {
    const { rooms, last, advance } = setup();
    rooms.handle(1, { t: "create" });
    const code = last(1, "room")!.room;
    rooms.handle(1, { t: "start" });
    advance(RACE_COUNTDOWN_MS);
    rooms.handle(2, { t: "join", room: code });
    rooms.disconnect(1);
    expect(last(2, "room")).toMatchObject({ phase: "lobby", host: 1 });

    rooms.handle(2, { t: "start" });
    advance(RACE_COUNTDOWN_MS);
    rooms.handle(2, { t: "state", x: 0, y: 0, vy: 0, grounded: true, score: 77 });
    advance(RACE_MAX_DURATION_MS);
    expect(last(2, "results")!.ranking).toEqual([{ slot: 1, score: 77 }]);

    rooms.disconnect(2);
    expect(rooms.roomCount).toBe(0);
    for (const connection of [10, 11, 12]) rooms.handle(connection, { t: "create" });
    rooms.handle(13, { t: "create" });
    expect(last(13, "error")!.code).toBe("server-busy");
  });
});
