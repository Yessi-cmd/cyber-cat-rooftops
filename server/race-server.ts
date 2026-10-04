import { createServer, type IncomingMessage, type Server } from "node:http";
import { randomInt } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import {
  RACE_MAX_MESSAGE_BYTES,
  parseClientMessage,
  type ServerMessage,
} from "../shared/race-protocol.js";
import { RaceRooms } from "./race-room.js";

// Stateless relay for race rooms. Holds rooms in memory only; nothing about
// players is logged or stored. Runs behind Caddy on a loopback port.

export interface RaceServerOptions {
  port: number;
  host: string;
  allowedOrigins: readonly string[];
  maxConnections?: number;
  maxConnectionsPerIp?: number;
  maxMessagesPerSecond?: number;
  heartbeatMs?: number;
}

export interface RunningRaceServer {
  server: Server;
  port: number;
  close(): Promise<void>;
}

interface Connection {
  socket: WebSocket;
  ip: string;
  alive: boolean;
  windowStart: number;
  messages: number;
}

// Behind Cloudflare + Caddy the socket peer is loopback; trust the CDN header only then.
function clientIp(request: IncomingMessage): string {
  const peer = request.socket.remoteAddress ?? "unknown";
  const forwarded = request.headers["cf-connecting-ip"];
  const isLoopback = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
  return isLoopback && typeof forwarded === "string" && forwarded.length <= 64 ? forwarded : peer;
}

export function startRaceServer(options: RaceServerOptions): Promise<RunningRaceServer> {
  const maxConnections = options.maxConnections ?? 400;
  const maxPerIp = options.maxConnectionsPerIp ?? 8;
  const maxRate = options.maxMessagesPerSecond ?? 30;
  const connections = new Map<number, Connection>();
  const perIp = new Map<string, number>();
  let nextId = 1;

  const send = (id: number, message: ServerMessage): void => {
    const connection = connections.get(id);
    if (connection?.socket.readyState === connection?.socket.OPEN) {
      connection!.socket.send(JSON.stringify(message));
    }
  };
  const rooms = new RaceRooms(send, { now: () => Date.now(), random: () => randomInt(0, 2 ** 32) / 2 ** 32 });

  const server = createServer((_request, response) => {
    response.writeHead(426, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("WebSocket only\n");
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: RACE_MAX_MESSAGE_BYTES });

  server.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin ?? "";
    const ip = clientIp(request);
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const refuse = (status: string): void => {
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (path !== "/ws") return refuse("404 Not Found");
    if (!options.allowedOrigins.includes(origin)) return refuse("403 Forbidden");
    if (connections.size >= maxConnections || (perIp.get(ip) ?? 0) >= maxPerIp) {
      return refuse("503 Service Unavailable");
    }
    sockets.handleUpgrade(request, socket, head, websocket => {
      const id = nextId++;
      const connection: Connection = { socket: websocket, ip, alive: true, windowStart: Date.now(), messages: 0 };
      connections.set(id, connection);
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);

      websocket.on("pong", () => { connection.alive = true; });
      websocket.on("message", (data, isBinary) => {
        const now = Date.now();
        if (now - connection.windowStart >= 1000) {
          connection.windowStart = now;
          connection.messages = 0;
        }
        connection.messages += 1;
        if (connection.messages > maxRate) {
          if (connection.messages === maxRate + 1) send(id, { t: "error", code: "rate-limited" });
          return;
        }
        const message = isBinary ? null : parseClientMessage(data.toString());
        if (message === null) {
          send(id, { t: "error", code: "bad-message" });
          return;
        }
        rooms.handle(id, message);
      });
      websocket.on("close", () => {
        connections.delete(id);
        const count = (perIp.get(ip) ?? 1) - 1;
        if (count <= 0) perIp.delete(ip);
        else perIp.set(ip, count);
        rooms.disconnect(id);
      });
      websocket.on("error", () => websocket.terminate());
    });
  });

  const ticker = setInterval(() => rooms.tick(), 100);
  const heartbeat = setInterval(() => {
    for (const connection of connections.values()) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
  }, options.heartbeatMs ?? 20_000);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : options.port;
      resolve({
        server,
        port,
        close: () => new Promise(done => {
          clearInterval(ticker);
          clearInterval(heartbeat);
          for (const connection of connections.values()) connection.socket.terminate();
          sockets.close();
          server.close(() => done());
        }),
      });
    });
  });
}
