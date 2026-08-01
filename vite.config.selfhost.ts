/**
 * Standalone (self-hosted) build config for Ashnight.
 *
 * Use this config when you build the app on your own machine / CI / cPanel
 * server. It has no editor tooling of any kind and targets a plain Node.js
 * server, which is what cPanel's "Setup Node.js App" (Passenger) runs.
 *
 *   npm run build:selfhost      -> .output/server/index.mjs + .output/public
 *   node .output/server/index.mjs
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    nitro({ config: { preset: "node-server" } }),
    react(),
  ],
});
