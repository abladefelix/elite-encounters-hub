/**
 * App-wide maintenance plumbing.
 *
 * `ClientErrorReporter` quietly forwards anything that breaks in a member's
 * browser to the control room's error inbox, so admins can fix problems they
 * were never told about. `MaintenanceGate` shows the admin's maintenance
 * message to members while the platform is being worked on — admins keep full
 * access so they can finish the job.
 */
import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Wrench } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useMaintenanceConfig } from "@/lib/maintenance";
import { reportAppError } from "@/lib/maintenance.functions";

const MAX_REPORTS_PER_SESSION = 6;

export function ClientErrorReporter() {
  const { session } = useAuth();
  const { value: config } = useMaintenanceConfig();
  const sent = useRef(new Set<string>());
  const count = useRef(0);

  useEffect(() => {
    if (!session || !config.enabled || !config.captureClientErrors) return;

    const send = (message: string, stack: string) => {
      const trimmed = message.trim();
      if (!trimmed || trimmed === "Script error.") return;
      const key = trimmed.slice(0, 160);
      if (sent.current.has(key) || count.current >= MAX_REPORTS_PER_SESSION) return;
      sent.current.add(key);
      count.current += 1;
      void reportAppError({
        data: { message: trimmed.slice(0, 800), stack: stack.slice(0, 4000), route: window.location.pathname },
      }).catch(() => undefined);
    };

    const onError = (event: ErrorEvent) => send(event.message || String(event.error), event.error?.stack ?? "");
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof Error) send(reason.message, reason.stack ?? "");
      else send(typeof reason === "string" ? reason : "Unhandled promise rejection", "");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [session, config.enabled, config.captureClientErrors]);

  return null;
}

export function MaintenanceGate() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isAdmin, loading } = useAuth();
  const { value: config, ready } = useMaintenanceConfig();

  const inControlRoom = pathname.startsWith("/ashnight-control");
  if (!ready || loading || !config.maintenanceMode || inControlRoom || isAdmin) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/98 px-6 backdrop-blur">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Wrench className="h-6 w-6" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold text-foreground">
          Back in a moment
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{config.maintenanceMessage}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Check again
        </button>
      </div>
    </div>
  );
}
