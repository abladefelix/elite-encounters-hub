import { useEffect } from "react";

import { isNativeApp, nativePlatform } from "@/lib/native";

/**
 * Applies native-only shell behaviour when Ashnight runs inside the iOS/Android
 * wrapper. In a normal browser every effect short-circuits, so the web build is
 * untouched — and the Capacitor plugins are imported lazily so they never land
 * in the browser bundle's critical path.
 */
export function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    // Lets CSS paint the safe areas instead of leaving OS-coloured bars.
    document.documentElement.classList.add("native-app");
    cleanups.push(() => document.documentElement.classList.remove("native-app"));

    void (async () => {
      // Hide the splash as soon as React has mounted, so the OS timeout never
      // decides for us (that timeout is what leaves a blank frame behind).
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide({ fadeOutDuration: 200 });
      } catch {
        /* plugin unavailable — harmless */
      }

      // Status bar: overlay the web view and match the app chrome.

      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        const dark = document.documentElement.classList.contains("dark");
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
        if (nativePlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: "#00000000" });
        }
      } catch {
        // Plugin unavailable — harmless.
      }


      // Keyboard: keep the chat composer visible above the keyboard.
      try {
        const { Keyboard } = await import("@capacitor/keyboard");
        const show = await Keyboard.addListener("keyboardWillShow", (info) => {
          document.documentElement.style.setProperty("--keyboard-inset", `${info.keyboardHeight}px`);
        });
        const hide = await Keyboard.addListener("keyboardWillHide", () => {
          document.documentElement.style.setProperty("--keyboard-inset", "0px");
        });
        cleanups.push(() => void show.remove(), () => void hide.remove());
      } catch {
        /* noop */
      }

      // Android hardware back button: go back in history, exit at the root.
      try {
        const { App } = await import("@capacitor/app");
        const handler = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            void App.exitApp();
          }
        });
        cleanups.push(() => void handler.remove());
      } catch {
        /* noop */
      }

      if (disposed) cleanups.forEach((fn) => fn());
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
