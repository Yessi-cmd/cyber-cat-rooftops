import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "../../shared/race-protocol.js";

// WebSocket readyState values; avoids relying on a global constructor in tests.
const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;

export type RaceSocketFactory = (url: string) => WebSocket;

// Thin socket wrapper: validates every inbound message and never throws into
// the game loop. Reconnecting is left to the player (rejoin via link).
export class RaceClient {
  private socket: WebSocket | null = null;
  private queue: string[] = [];

  constructor(
    private readonly url: string,
    private readonly onMessage: (message: ServerMessage) => void,
    private readonly onClose: () => void,
    private readonly createSocket: RaceSocketFactory = target => new WebSocket(target),
  ) {}

  get connected(): boolean {
    return this.socket !== null;
  }

  send(message: ClientMessage): void {
    const data = JSON.stringify(message);
    if (this.socket === null) this.open();
    const socket = this.socket;
    if (socket === null) return;
    if (socket.readyState === SOCKET_OPEN) socket.send(data);
    else if (socket.readyState === SOCKET_CONNECTING && this.queue.length < 8) this.queue.push(data);
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    this.queue = [];
    if (socket === null) return;
    socket.onclose = null;
    socket.onmessage = null;
    socket.onopen = null;
    socket.onerror = null;
    try {
      if (socket.readyState === SOCKET_OPEN) socket.send(JSON.stringify({ t: "leave" }));
      socket.close();
    } catch {
      // Already closing; nothing to clean up.
    }
  }

  private open(): void {
    let socket: WebSocket;
    try {
      socket = this.createSocket(this.url);
    } catch {
      this.onClose();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      for (const data of this.queue) socket.send(data);
      this.queue = [];
    };
    socket.onmessage = event => {
      if (typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (message !== null) this.onMessage(message);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.queue = [];
      this.onClose();
    };
    socket.onerror = () => undefined; // onclose follows and reports.
  }
}

export function raceServerUrl(location: Location): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/ws`;
}
