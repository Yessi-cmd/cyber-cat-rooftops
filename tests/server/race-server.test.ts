import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startRaceServer, type RunningRaceServer } from "../../server/race-server.js";
import { parseServerMessage, type ServerMessage } from "../../shared/race-protocol.js";

const ORIGIN = "http://localhost:5173";
let running: RunningRaceServer | null = null;

afterEach(async () => {
  await running?.close();
  running = null;
});

interface TestClient {
  socket: WebSocket;
  messages: ServerMessage[];
  next(type: ServerMessage["t"]): Promise<ServerMessage>;
  send(data: unknown): void;
}

function connect(port: number, origin = ORIGIN): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
    const messages: ServerMessage[] = [];
    const waiters: { type: string; resolve: (message: ServerMessage) => void }[] = [];
    socket.on("message", data => {
      const message = parseServerMessage(data.toString());
      expect(message).not.toBeNull();
      const index = waiters.findIndex(waiter => waiter.type === message!.t);
      if (index >= 0) waiters.splice(index, 1)[0]!.resolve(message!);
      else messages.push(message!);
    });
    socket.once("open", () => resolve({
      socket,
      messages,
      send: data => socket.send(typeof data === "string" ? data : JSON.stringify(data)),
      next: type => new Promise(done => {
        const seen = messages.findIndex(message => message.t === type);
        if (seen >= 0) done(messages.splice(seen, 1)[0]!);
        else waiters.push({ type, resolve: done });
      }),
    }));
    socket.once("error", reject);
    socket.once("unexpected-response", (_request, response) => reject(new Error(`HTTP ${response.statusCode}`)));
  });
}

describe("race relay server", () => {
  it("两名玩家经真实 WebSocket 建房、开赛、互传状态并拿到排名", async () => {
    running = await startRaceServer({ port: 0, host: "127.0.0.1", allowedOrigins: [ORIGIN] });
    const host = await connect(running.port);
    const guest = await connect(running.port);
    host.send({ t: "create" });
    const room = await host.next("room");
    if (room.t !== "room") throw new Error("expected room");
    guest.send({ t: "join", room: room.room });
    expect(await guest.next("room")).toMatchObject({ you: 1, host: 0 });
    host.send({ t: "start" });
    const [a, b] = await Promise.all([host.next("countdown"), guest.next("countdown")]);
    expect(a).toEqual(b);
    // Wait out the real countdown until the room reports "racing".
    for (;;) {
      const update = await host.next("room");
      if (update.t === "room" && update.phase === "racing") break;
    }
    guest.send({ t: "state", x: 321, y: 600, vy: 0, grounded: true, score: 44 });
    expect(await host.next("state")).toMatchObject({ slot: 1, x: 321, score: 44 });
    guest.send({ t: "finish", score: 44 });
    host.send({ t: "finish", score: 90 });
    expect(await guest.next("results")).toEqual({
      t: "results",
      ranking: [{ slot: 0, score: 90 }, { slot: 1, score: 44 }],
    });
  }, 10_000);

  it("拒绝不在白名单的 Origin 与非 /ws 路径", async () => {
    running = await startRaceServer({ port: 0, host: "127.0.0.1", allowedOrigins: [ORIGIN] });
    await expect(connect(running.port, "https://evil.example")).rejects.toThrow("HTTP 403");
    await expect(new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${running!.port}/other`, { origin: ORIGIN });
      socket.once("unexpected-response", (_request, response) => reject(new Error(`HTTP ${response.statusCode}`)));
      socket.once("open", resolve);
    })).rejects.toThrow("HTTP 404");
  });

  it("同一 IP 连接数受限；坏消息与超速消息被拒但连接保留", async () => {
    running = await startRaceServer({
      port: 0, host: "127.0.0.1", allowedOrigins: [ORIGIN], maxConnectionsPerIp: 2, maxMessagesPerSecond: 5,
    });
    const first = await connect(running.port);
    await connect(running.port);
    await expect(connect(running.port)).rejects.toThrow("HTTP 503");
    first.send("not json");
    expect(await first.next("error")).toEqual({ t: "error", code: "bad-message" });
    for (let index = 0; index < 10; index += 1) first.send({ t: "leave" });
    expect(await first.next("error")).toEqual({ t: "error", code: "rate-limited" });
    expect(first.socket.readyState).toBe(WebSocket.OPEN);
  });
});
