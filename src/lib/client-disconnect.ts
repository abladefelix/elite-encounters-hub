/**
 * "Error: aborted" is not an app failure — it's the browser closing a socket
 * mid-request (reload, navigation away, HMR refresh, cancelled prefetch). Node
 * surfaces it from `abortIncoming`, and logging it as a crash makes the error
 * overlay claim a blank screen that never happened. Detect and ignore it.
 */
export function isClientDisconnect(error: unknown): boolean {
  if (error == null) return false;
  const candidate = error as { message?: unknown; code?: unknown; name?: unknown; cause?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";

  if (
    message === "aborted" ||
    name === "AbortError" ||
    code === "ECONNRESET" ||
    code === "ECONNABORTED" ||
    code === "ERR_STREAM_PREMATURE_CLOSE" ||
    /aborted|socket hang up|premature close|connection reset/i.test(message)
  ) {
    return true;
  }

  return candidate.cause ? isClientDisconnect(candidate.cause) : false;
}
