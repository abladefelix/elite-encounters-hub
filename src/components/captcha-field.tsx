/**
 * Cloudflare Turnstile challenge.
 *
 * Renders nothing until an admin saves a Turnstile site key in the key vault,
 * so the sign-in page keeps working on a fresh install. The solved token is
 * handed upward and verified on the server before anything is trusted.
 */
import { useEffect, useRef } from "react";

import { useCaptcha } from "@/lib/captcha";

interface TurnstileWidget {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | undefined;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = undefined;
        reject(new Error("Turnstile script failed to load"));
      };
      document.head.append(script);
    });
  }
  return scriptPromise;
}

export interface CaptchaFieldProps {
  /** Receives the solved token, or "" when it expires and must be redone. */
  onToken: (token: string) => void;
  /** Bumping this value re-renders the challenge — use it after a failure. */
  resetKey?: number;
}

export function CaptchaField({ onToken, resetKey = 0 }: CaptchaFieldProps) {
  const { enabled, siteKey } = useCaptcha();
  const holder = useRef<HTMLDivElement | null>(null);
  const callback = useRef(onToken);
  callback.current = onToken;

  useEffect(() => {
    if (!enabled || !siteKey || !holder.current) return;
    const element = holder.current;
    let widgetId: string | undefined;
    let cancelled = false;

    void loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        element.innerHTML = "";
        widgetId = window.turnstile.render(element, {
          sitekey: siteKey,
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(""),
          "error-callback": () => callback.current(""),
        });
      })
      .catch(() => {
        // A blocked script must not hide the form; the server still decides.
        callback.current("");
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          /* the widget may already be gone */
        }
      }
      element.innerHTML = "";
    };
  }, [enabled, siteKey, resetKey]);

  if (!enabled || !siteKey) return null;

  return (
    <div className="space-y-1">
      <div ref={holder} className="flex justify-center" />
      <p className="text-center text-xs text-muted-foreground">
        Protected by a security check to keep automated sign-ups out.
      </p>
    </div>
  );
}
