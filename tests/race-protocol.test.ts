import { describe, expect, it } from "vitest";
import {
  normalizeRoomCode,
  parseClientMessage,
  parseServerMessage,
} from "../shared/race-protocol";

describe("race protocol", () => {
  it("只接受格式正确、数值有界的客户端消息", () => {
    expect(parseClientMessage('{"t":"create"}')).toEqual({ t: "create" });
    expect(parseClientMessage('{"t":"join","room":"AB2CD"}')).toEqual({ t: "join", room: "AB2CD" });
    expect(parseClientMessage('{"t":"join","room":"ab2cd"}')).toBeNull();
    expect(parseClientMessage('{"t":"join","room":"AB0CD"}')).toBeNull(); // ambiguous 0 not in alphabet
    const state = { t: "state", x: 10.5, y: -3, vy: 20, grounded: false, score: 12 };
    expect(parseClientMessage(JSON.stringify({ ...state, extra: "dropped" }))).toEqual(state);
    for (const bad of [
      { ...state, x: Number.MAX_VALUE },
      { ...state, score: -1 },
      { ...state, score: 1.5 },
      { ...state, grounded: "yes" },
      { t: "finish", score: 2_000_000 },
      { t: "unknown" },
      [],
    ]) {
      expect(parseClientMessage(JSON.stringify(bad))).toBeNull();
    }
    expect(parseClientMessage("{")).toBeNull();
    expect(parseClientMessage(`{"t":"create","pad":"${"x".repeat(600)}"}`)).toBeNull();
  });

  it("客户端同样校验服务器消息", () => {
    const room = { t: "room", room: "AB2CD", you: 1, host: 0, phase: "lobby", seed: null,
      players: [{ slot: 0, inRace: false, finished: false, score: 0 }] };
    expect(parseServerMessage(JSON.stringify(room))).toEqual(room);
    expect(parseServerMessage(JSON.stringify({ ...room, you: 4 }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ ...room, phase: "party" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ ...room, players: new Array(5).fill(room.players[0]) }))).toBeNull();
    expect(parseServerMessage('{"t":"countdown","seed":7,"startsInMs":3000}')).not.toBeNull();
    expect(parseServerMessage('{"t":"countdown","seed":0,"startsInMs":3000}')).toBeNull();
    expect(parseServerMessage('{"t":"error","code":"room-full"}')).toEqual({ t: "error", code: "room-full" });
    expect(parseServerMessage('{"t":"error","code":"<script>"}')).toBeNull();
  });

  it("手输房号容忍大小写和空格", () => {
    expect(normalizeRoomCode(" ab2cd ")).toBe("AB2CD");
    expect(normalizeRoomCode("abc")).toBeNull();
  });
});
