/**
 * Applies the admin's appearance settings to member-facing pages.
 *
 * Radius, type scale and the optional accent override are written as CSS
 * variables on <html>, so every semantic token keeps working. The control room
 * is excluded on purpose: it stays a fixed desktop tool.
 */
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { DEFAULT_APPEARANCE, useAppearance } from "@/lib/appearance";

export function AppearanceStyles() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const inControlRoom = pathname.startsWith("/ashnight-control");
  const { appearance } = useAppearance();

  useEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      root.style.removeProperty("--radius");
      root.style.removeProperty("font-size");
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
    };

    if (inControlRoom) {
      clear();
      return;
    }

    root.style.setProperty(
      "--radius",
      `${appearance.cornerRadius || DEFAULT_APPEARANCE.cornerRadius}rem`,
    );
    const scale = Math.min(1.3, Math.max(0.85, appearance.fontScale || 1));
    root.style.setProperty("font-size", `${scale * 100}%`);

    if (/^#[0-9a-f]{6}$/i.test(appearance.accentColor)) {
      root.style.setProperty("--primary", appearance.accentColor);
      root.style.setProperty("--ring", appearance.accentColor);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
    }

    return clear;
  }, [
    inControlRoom,
    appearance.cornerRadius,
    appearance.fontScale,
    appearance.accentColor,
  ]);

  return null;
}
