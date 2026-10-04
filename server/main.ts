import { startRaceServer } from "./race-server.js";

// Entry point for the systemd service and `npm run race-server`.
const port = Number(process.env.RACE_PORT ?? 8790);
const host = process.env.RACE_HOST ?? "127.0.0.1";
const allowedOrigins = (process.env.RACE_ALLOWED_ORIGINS ??
  "https://game.norliva.top,http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map(origin => origin.trim())
  .filter(origin => origin.length > 0);

const running = await startRaceServer({ port, host, allowedOrigins });
console.log(`race relay listening on ${host}:${running.port}`);

const shutdown = (): void => {
  void running.close().then(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
