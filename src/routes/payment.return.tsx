import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmPayment } from "@/lib/payments.functions";
import { money } from "@/lib/types";

/**
 * Where Paystack sends the member back after checkout. The charge is verified
 * server-side here as well as by the webhook, so a member who closes the tab
 * still gets credited.
 */
export const Route = createFileRoute("/payment/return")({
  head: () => ({
    meta: [
      { title: "Payment confirmation | Ashnight" },
      {
        name: "description",
        content:
          "Ashnight verifies your Paystack payment and secures it in escrow before the specialist is paid.",
      },
      { property: "og:title", content: "Payment confirmation | Ashnight" },
      { property: "og:description", content: "Verifying your Ashnight payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    reference: typeof search["reference"] === "string" ? search["reference"] : "",
    trxref: typeof search["trxref"] === "string" ? search["trxref"] : "",
  }),
  component: PaymentReturn,
});

type State =
  | { phase: "checking" }
  | { phase: "done"; amount: number; kind: string }
  | { phase: "pending" }
  | { phase: "failed"; message: string };

function PaymentReturn() {
  const { reference, trxref } = useSearch({ from: "/payment/return" });
  const ref = reference || trxref;
  const confirm = useServerFn(confirmPayment);
  const [state, setState] = useState<State>({ phase: "checking" });

  useEffect(() => {
    // Reaching this page means checkout was completed, not abandoned — clear the
    // private "you cancelled" marker the chat sets before redirecting.
    try {
      window.sessionStorage.removeItem("ashnight-checkout-pending-v1");
    } catch {
      // Ignore private-mode storage failures.
    }
    if (!ref) {
      setState({ phase: "failed", message: "No payment reference was returned." });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await confirm({ data: { reference: ref } });
        if (cancelled) return;
        if (result.status === "success") {
          setState({ phase: "done", amount: result.amount, kind: result.kind ?? "payment" });
        } else {
          setState({ phase: "pending" });
        }
      } catch (error) {
        if (cancelled) return;
        setState({
          phase: "failed",
          message: error instanceof Error ? error.message : "We couldn't verify that payment.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [confirm, ref]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 py-12">
      <BrandMark className="size-12" />
      <Card className="mt-6 w-full border-border/70 bg-surface p-6 text-center">
        {state.phase === "checking" ? (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
            <h1 className="mt-4 font-display text-xl font-semibold">Verifying your payment…</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Checking with Paystack. This takes a moment.
            </p>
          </>
        ) : null}

        {state.phase === "done" ? (
          <>
            <CheckCircle2 className="mx-auto size-8 text-accent" />
            <h1 className="mt-4 font-display text-xl font-semibold">
              {money(state.amount)} confirmed
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {state.kind === "membership"
                ? "Your membership is active. Room placement is confirmed by our team."
                : "Your payment is secured in Ashnight escrow until you confirm the job is complete."}
            </p>
          </>
        ) : null}

        {state.phase === "pending" ? (
          <>
            <Loader2 className="mx-auto size-8 text-muted-foreground" />
            <h1 className="mt-4 font-display text-xl font-semibold">Payment not completed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Paystack hasn&apos;t confirmed this charge. If you approved it on your phone, it will
              land here shortly.
            </p>
          </>
        ) : null}

        {state.phase === "failed" ? (
          <>
            <XCircle className="mx-auto size-8 text-destructive" />
            <h1 className="mt-4 font-display text-xl font-semibold">We couldn&apos;t verify that</h1>
            <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
          </>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild variant="brass">
            <Link to="/messages">Back to messages</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/rooms">View rooms</Link>
          </Button>
        </div>
        {ref ? (
          <p className="mt-4 text-[11px] text-muted-foreground">Reference {ref}</p>
        ) : null}
      </Card>
    </main>
  );
}
