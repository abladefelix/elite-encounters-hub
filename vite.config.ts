// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    // Two constraints have to hold at once on the Cloudflare runtime:
    //
    // 1. Since 2026-08-04 the runtime REJECTS an explicit `nodejs_compat`
    //    compatibility flag (it is the default now) — every request 502s.
    // 2. The bundle still has to resolve `node:*` builtins (TanStack Start keeps
    //    its request context in `node:async_hooks`). Without that mapping every
    //    server function dies with "No Start context found in AsyncLocalStorage",
    //    which is what left the signed-in app stuck on "Loading your profile…".
    //
    // So: turn nitro's nodeCompat off (it is the thing that emits the flag) and
    // re-add the node builtin externals/aliases/injects it would have added.
    cloudflare: { nodeCompat: false },
    rolldownConfig: { platform: "node" },
    unenv: [
      {
        meta: { name: "ashnight:cloudflare-node-compat" },
        external: NODE_BUILTINS,
        alias: Object.fromEntries(
          NODE_BUILTINS.flatMap((id) => [
            [id, id],
            [id.replace("node:", ""), id],
          ]),
        ),
        inject: {
          global: "unenv/polyfill/globalthis",
          process: "node:process",
          clearImmediate: ["node:timers", "clearImmediate"],
          setImmediate: ["node:timers", "setImmediate"],
          Buffer: ["node:buffer", "Buffer"],
        },
      },
    ],
  } as never,
});
