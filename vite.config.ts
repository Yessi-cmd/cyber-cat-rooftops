import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
  },
  server: {
    // `npm run race-server` in another terminal provides the local relay.
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8790", ws: true },
    },
  },
  test: {
    environment: "node",
  },
});
