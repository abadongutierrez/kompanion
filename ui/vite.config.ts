import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json. Layer-crossing imports use it
    // ("@/shared/ui/index.js"); imports inside one feature stay relative.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // API_URL lets a second checkout (a worktree) point its UI at its own
    // server on another port, next to the one already on :3200.
    proxy: {
      "/api": process.env.API_URL ?? "http://localhost:3200",
    },
  },
});
