/**
 * CAPTCHA server actions.
 *
 * Thin wrappers only — verification lives in `captcha.server.ts` and is
 * imported inside the handler so no secret reaches the browser bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const callerIp = () =>
  getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "";

/**
 * Verifies a sign-up challenge before the account is created. Throws a
 * readable error when the challenge is missing, stale or forged.
 */
export const verifyAuthCaptcha = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        token: z.string().trim().max(2048).default(""),
        action: z.enum(["signup", "reset"]).default("signup"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { assertHuman } = await import("./captcha.server");
    await assertHuman(data.token, { ip: callerIp(), action: data.action });
    return { ok: true };
  });
