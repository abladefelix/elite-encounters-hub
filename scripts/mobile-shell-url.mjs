/**
 * Keeps mobile-shell/index.html pointed at the same deployment as
 * capacitor.config.ts. The offline screen probes that URL and re-enters the app
 * the moment the connection comes back, so it must not go stale.
 *
 * Runs as part of `npm run mobile:sync`. Safe to run repeatedly.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env["ASHNIGHT_APP_URL"] ?? "https://ashnight.caymanirs.com";
const file = resolve(process.cwd(), "mobile-shell/index.html");

const html = readFileSync(file, "utf8");
const next = html.replace(
  /<meta name="ashnight-app-url" content="[^"]*" \/>/,
  `<meta name="ashnight-app-url" content="${url}" />`,
);

if (next !== html) {
  writeFileSync(file, next);
  console.log(`[mobile-shell] offline screen now points at ${url}`);
} else {
  console.log(`[mobile-shell] offline screen already points at ${url}`);
}
