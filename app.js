// cPanel / Passenger startup file.
//
// In cPanel -> "Setup Node.js App":
//   Application root       : /home/<user>/ashnight
//   Application URL        : yourdomain.com
//   Application startup file: app.js
//
// Passenger imports this file and sets PORT for us; the standalone Nitro
// node-server build reads PORT and starts listening.
//
// Build first (locally or over SSH):  npm run build:selfhost
import "./.output/server/index.mjs";
