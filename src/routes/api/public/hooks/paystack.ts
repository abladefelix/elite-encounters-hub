/**
 * Paystack webhook.
 *
 * Paystack signs each call with HMAC-SHA512 over the raw body using the
 * account's secret key, which Ashnight reads from the admin key vault. Nothing
 * is trusted until that signature matches.
 *
 * Webhook URL to paste into the Paystack dashboard:
 *   https://<your-domain>/api/public/hooks/paystack
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/public/hooks/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-paystack-signature") ?? "";

        let secret = "";
        try {
          const { paystackSecret } = await import("@/lib/payments.server");
          secret = await paystackSecret();
        } catch {
          return new Response("Paystack is not configured", { status: 503 });
        }

        const expected = createHmac("sha512", secret).update(raw).digest("hex");
        const got = Buffer.from(signature);
        const want = Buffer.from(expected);
        if (got.length !== want.length || !timingSafeEqual(got, want)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: { event?: string; data?: { reference?: string; channel?: string; status?: string } };
        try {
          event = JSON.parse(raw) as typeof event;
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const reference = event.data?.reference;
        if (!reference) return new Response("ok");

        try {
          const { finalizeReference, verifyTransaction } = await import("@/lib/payments.server");
          if (event.event === "charge.success") {
            // Re-verify with Paystack before crediting anything.
            const verified = await verifyTransaction(reference);
            if (verified.status === "success") {
              await finalizeReference(reference, verified.channel ?? event.data?.channel);
            }
          }
        } catch (error) {
          console.error("paystack webhook failed", error);
          return new Response("Webhook processing failed", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
