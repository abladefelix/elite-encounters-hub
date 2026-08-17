/**
 * Turns raw failures into calm, human notifications.
 *
 * Members should never see "TypeError: Failed to fetch" or a bare Postgres
 * code. Everything routed through `notifyError` gets a plain-English title,
 * a hint about what to do next, and — for connection problems — a retry.
 */
import { toast } from "sonner";

export type FailureKind =
  | "offline"
  | "timeout"
  | "slow"
  | "server"
  | "auth"
  | "permission"
  | "notFound"
  | "conflict"
  | "validation"
  | "unknown";

export interface FriendlyFailure {
  kind: FailureKind;
  title: string;
  description: string;
  /** Connection-ish problems are worth offering a retry for. */
  retryable: boolean;
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; error_description?: unknown; code?: unknown };
    if (typeof maybe.message === "string") return maybe.message;
    if (typeof maybe.error_description === "string") return maybe.error_description;
    if (typeof maybe.code === "string") return maybe.code;
  }
  return "";
}

function statusOf(error: unknown): number | null {
  if (error && typeof error === "object") {
    const maybe = error as { status?: unknown; statusCode?: unknown };
    const value = maybe.status ?? maybe.statusCode;
    if (typeof value === "number") return value;
  }
  return null;
}

export function describeFailure(error: unknown): FriendlyFailure {
  const raw = messageOf(error);
  const message = raw.toLowerCase();
  const status = statusOf(error);
  const offlineBrowser = typeof navigator !== "undefined" && navigator.onLine === false;

  const networkish =
    offlineBrowser ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("err_internet_disconnected") ||
    message.includes("fetch failed");

  if (networkish) {
    return {
      kind: "offline",
      title: "You're offline",
      description:
        "We couldn't reach Ashnight. Check your mobile data or Wi-Fi and try again — nothing was lost.",
      retryable: true,
    };
  }

  if (
    message.includes("abort") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    status === 408 ||
    status === 504
  ) {
    return {
      kind: "timeout",
      title: "Connection is too slow",
      description:
        "That request took too long to finish. Move to a stronger signal and try again.",
      retryable: true,
    };
  }

  if (status === 429 || message.includes("too many requests")) {
    return {
      kind: "slow",
      title: "Slow down a moment",
      description: "Too many attempts in a row. Wait a few seconds, then try again.",
      retryable: true,
    };
  }

  if (status === 401 || message.includes("unauthorized") || message.includes("jwt")) {
    return {
      kind: "auth",
      title: "Please sign in again",
      description: "Your session expired for security. Sign in to pick up where you left off.",
      retryable: false,
    };
  }

  if (
    status === 403 ||
    message.includes("permission denied") ||
    message.includes("row-level security") ||
    message.includes("42501")
  ) {
    return {
      kind: "permission",
      title: "You don't have access to that",
      description: "If you think this is a mistake, contact support and we'll take a look.",
      retryable: false,
    };
  }

  if (status === 404 || message.includes("no rows") || message.includes("pgrst116")) {
    return {
      kind: "notFound",
      title: "We couldn't find that",
      description: "It may have been moved or removed. Refresh and try once more.",
      retryable: false,
    };
  }

  if (status === 409 || message.includes("duplicate key") || message.includes("already exists")) {
    return {
      kind: "conflict",
      title: "That already exists",
      description: "Something with those details is already saved. Adjust it and try again.",
      retryable: false,
    };
  }

  if (status !== null && status >= 500) {
    return {
      kind: "server",
      title: "Something broke on our side",
      description: "Our team has been notified automatically. Please try again in a moment.",
      retryable: true,
    };
  }

  if (status === 400 || status === 422) {
    return {
      kind: "validation",
      title: "Check the details",
      description: raw || "Some information looks incomplete or invalid.",
      retryable: false,
    };
  }

  return {
    kind: "unknown",
    title: "That didn't go through",
    description: raw || "Please try again. If it keeps happening, contact support.",
    retryable: true,
  };
}

/** One-liner for inline form errors. */
export function friendlyMessage(error: unknown): string {
  const failure = describeFailure(error);
  return `${failure.title}. ${failure.description}`;
}

export interface NotifyOptions {
  /** Prefix shown instead of the generic title, e.g. "Couldn't send message". */
  title?: string;
  /** Called when the member taps "Try again". */
  onRetry?: () => void;
  /** Dedupe key so repeated failures don't stack up. */
  id?: string;
}

export function notifyError(error: unknown, options: NotifyOptions = {}) {
  const failure = describeFailure(error);
  toast.error(options.title ?? failure.title, {
    id: options.id ?? `err-${failure.kind}`,
    description: failure.description,
    duration: failure.retryable ? 8_000 : 6_000,
    ...(failure.retryable && options.onRetry
      ? { action: { label: "Try again", onClick: options.onRetry } }
      : {}),
  });
}
