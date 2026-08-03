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
    // "never" keeps the web view edge to edge; the app paints its own safe areas
    // (see html.native-app rules in src/styles.css). "always" left OS-coloured
    // bars at the top and bottom of the screen.
    contentInset: "never",
    backgroundColor: "#0b0d12",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0b0d12",
  },
  plugins: {
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      // Draw under the status bar so there is no black strip above the app.
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#00000000",
    },

    // Icons/splash art is generated from assets/ by `npm run mobile:assets`.
    // The source art is a square 2732x2732 canvas with a centred mark, so
    // CENTER_CROP / aspectFill covers every phone shape without letter-boxing.
    SplashScreen: {
      // The web app calls SplashScreen.hide() itself (see src/components/native-shell.tsx),
      // so the OS must not race it with an automatic timeout.
      launchAutoHide: false,
      launchShowDuration: 3000,
      backgroundColor: "#0b0d12",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      useDialog: false,
    },
  },

};

export default config;
