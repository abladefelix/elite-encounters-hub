/**
 * Admin-facing maintenance endpoints. Every call re-checks the caller's admin
 * role and the "maintenance" area permission before touching anything.
 *
 * `reportAppError` is the one exception: any signed-in member's browser may
 * post the error it hit, so the control room sees breakage as it happens.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireActiveSession as requireSupabaseAuth } from "@/lib/active-session-middleware";

const AREA = "maintenance";

export const scanAppHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, AREA, "read");
    const { runHealthScan } = await import("./maintenance.server");
    return runHealthScan(context.userId);
  });

export const listRepairRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, AREA, "read");
    const { listRuns, listErrors } = await import("./maintenance.server");
    const [runs, errors] = await Promise.all([listRuns(), listErrors()]);
    return { runs, errors };
  });

export const stageRepair = createServerFn({ method: "POST" })
  .validator((input: { key: string; errorId?: string | null }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, AREA);
    const { prepareRepair } = await import("./maintenance.server");
    return prepareRepair(context.userId, data.key, data.errorId ?? null);
  });

export const approveRepairRun = createServerFn({ method: "POST" })
  .validator((input: { runId: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, AREA);
    const { approveRepair } = await import("./maintenance.server");
    return approveRepair(context.userId, data.runId);
  });

export const skipRepairRun = createServerFn({ method: "POST" })
  .validator((input: { runId: string; note?: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, AREA);
    const { skipRepair } = await import("./maintenance.server");
    return skipRepair(context.userId, data.runId, data.note ?? "");
  });

export const revertRepairRun = createServerFn({ method: "POST" })
  .validator((input: { runId: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, AREA);
    const { revertRepair } = await import("./maintenance.server");
    return revertRepair(context.userId, data.runId);
  });

export const diagnoseErrorText = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, AREA);
    const { diagnoseText } = await import("./maintenance.server");
    return diagnoseText(context.userId, data.text);
  });

export const updateErrorStatus = createServerFn({ method: "POST" })
  .validator((input: { id: string; status: "open" | "fixed" | "ignored" }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, AREA);
    const { setErrorStatus } = await import("./maintenance.server");
    return setErrorStatus(context.userId, data.id, data.status);
  });

export const clearHandledErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, AREA);
    const { clearResolvedErrors } = await import("./maintenance.server");
    return clearResolvedErrors(context.userId);
  });

/** Any signed-in member's browser reports what broke on their screen. */
export const reportAppError = createServerFn({ method: "POST" })
  .validator((input: { message: string; stack?: string; route?: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { recordError } = await import("./maintenance.server");
    return recordError({
      message: data.message,
      stack: data.stack ?? "",
      route: data.route ?? "",
      source: "client",
      userId: context.userId,
    });
  });
