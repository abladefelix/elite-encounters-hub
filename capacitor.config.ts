import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Ashnight native shell (iOS + Android).
 *
 * Ashnight renders on a server (TanStack Start server functions, escrow, chat,
 * Paystack callbacks), so the native app does NOT bundle a static copy of the
 * site. Instead the shell loads the live deployment over https and adds native
 * capabilities on top (status bar, keyboard, hardware back button, camera and
 * microphone permissions for calls).
 *
 * Change ASHNIGHT_APP_URL below (or set it as an env var before `cap sync`)
 * when the production domain changes.
 */
const liveUrl = process.env["ASHNIGHT_APP_URL"] ?? "https://ashnight.caymanirs.com";
const liveHost = new URL(liveUrl).host;

const config: CapacitorConfig = {
  appId: "app.ashnight.mobile",
  appName: "Ashnight",
  // Offline fallback shell only — the real UI is served from `server.url`.
  webDir: "mobile-shell",
  server: {
    url: liveUrl,
    hostname: liveHost,
    androidScheme: "https",
    iosScheme: "https",
    cleartext: false,
    // Anything not listed here opens in the system browser instead of the app.
    allowNavigation: [
      liveHost,
      "*.paystack.com",
      "*.paystack.co",
      "checkout.paystack.com",
      "accounts.google.com",
    ],
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      overlaysWebView: false,
    },
  },
};

export default config;
