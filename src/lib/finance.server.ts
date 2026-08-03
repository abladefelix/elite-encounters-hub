/**
 * Ledger sync — server side.
 *
 * Turns real money movements (escrow payments, payouts, refunds) into balanced
 * double-entry journal entries. It is idempotent: every generated entry is
 * tagged with `source` + `source_id`, so re-running only books what is missing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

const REVENUE_ACCOUNT: Record<string, string> = {
  booking: "4000",
  gift: "4020",
  membership: "4010",
};

function entryNo(date: string, seq: number) {
  const stamp = date.slice(0, 10).replaceAll("-", "");
  const suffix = `${Date.now().toString(36).slice(-3)}${seq}`.toUpperCase();
  return `JE-${stamp}-${suffix}`;
}

function period(date: string) {
  return date.slice(0, 7);
}

interface PendingLine {
  code: string;
  debit: number;
  credit: number;
  description: string;
}

interface PendingEntry {
  source: string;
  sourceId: string;
  date: string;
  memo: string;
  reference: string;
  lines: PendingLine[];
}

export async function syncLedger(admin: Admin) {
  const { data: accountRows, error: accountsError } = await admin
    .from("ledger_accounts")
    .select("id, code");
  if (accountsError) throw new Error(accountsError.message);
  const accountId = new Map((accountRows ?? []).map((row) => [row.code, row.id]));

  const { data: escrow, error: escrowError } = await admin
    .from("escrow_entries")
    .select("*")
    .not("paid_at", "is", null)
    .order("paid_at", { ascending: true });
  if (escrowError) throw new Error(escrowError.message);

  const { data: existing, error: existingError } = await admin
    .from("journal_entries")
    .select("source, source_id")
    .in("source", ["escrow_payment", "escrow_settlement"]);
  if (existingError) throw new Error(existingError.message);
  const booked = new Set(
    (existing ?? []).map((row) => `${row.source}:${row.source_id ?? ""}`),
  );

  const pending: PendingEntry[] = [];

  for (const row of escrow ?? []) {
    const amount = Number(row.amount || 0);
    const fee = Number(row.platform_fee || 0);
    const payout = Number(row.payout_amount || 0);
    const paidAt = (row.paid_at ?? row.created_at).slice(0, 10);
    const revenueCode = REVENUE_ACCOUNT[row.kind] ?? "4030";

    if (!booked.has(`escrow_payment:${row.id}`) && amount > 0) {
      const lines: PendingLine[] = [
        { code: "1000", debit: amount, credit: 0, description: "Paystack collection" },
      ];
      if (payout > 0) {
        lines.push({
          code: "2000",
          debit: 0,
          credit: payout,
          description: "Held for specialist",
        });
      }
      if (fee > 0 || payout === 0) {
        lines.push({
          code: revenueCode,
          debit: 0,
          credit: payout === 0 ? amount : fee,
          description: `${row.kind} revenue`,
        });
      }
      pending.push({
        source: "escrow_payment",
        sourceId: row.id,
        date: paidAt,
        memo: `${row.kind} payment — ${row.label}`,
        reference: row.reference || row.paystack_reference || "",
        lines,
      });
    }

    const settledOn = (row.released_at ?? row.updated_at ?? row.created_at).slice(0, 10);

    if (
      row.state === "released" &&
      payout > 0 &&
      !booked.has(`escrow_settlement:${row.id}`)
    ) {
      pending.push({
        source: "escrow_settlement",
        sourceId: row.id,
        date: settledOn,
        memo: `Payout released — ${row.label}`,
        reference: row.reference || row.paystack_reference || "",
        lines: [
          { code: "2000", debit: payout, credit: 0, description: "Escrow cleared" },
          { code: "1000", debit: 0, credit: payout, description: "Specialist payout" },
        ],
      });
    }

    if (row.state === "refunded" && !booked.has(`escrow_settlement:${row.id}`)) {
      const lines: PendingLine[] = [];
      if (payout > 0) {
        lines.push({ code: "2000", debit: payout, credit: 0, description: "Escrow reversed" });
      }
      if (fee > 0) {
        lines.push({ code: "5100", debit: fee, credit: 0, description: "Commission refunded" });
      }
      lines.push({ code: "1000", debit: 0, credit: amount, description: "Refund to client" });
      pending.push({
        source: "escrow_settlement",
        sourceId: row.id,
        date: settledOn,
        memo: `Refund — ${row.label}`,
        reference: row.reference || row.paystack_reference || "",
        lines,
      });
    }
  }

  let posted = 0;
  let skipped = 0;

  for (const [index, draft] of pending.entries()) {
    const debit = draft.lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = draft.lines.reduce((sum, line) => sum + line.credit, 0);
    if (Math.round((debit - credit) * 100) !== 0 || debit <= 0) {
      skipped += 1;
      continue;
    }
    const ids = draft.lines.map((line) => accountId.get(line.code));
    if (ids.some((id) => !id)) {
      skipped += 1;
      continue;
    }

    const { data: entry, error } = await admin
      .from("journal_entries")
      .insert({
        entry_no: entryNo(draft.date, index),
        entry_date: draft.date,
        period: period(draft.date),
        memo: draft.memo,
        reference: draft.reference,
        source: draft.source,
        source_id: draft.sourceId,
        status: "posted",
        posted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !entry) {
      skipped += 1;
      continue;
    }

    const { error: linesError } = await admin.from("journal_lines").insert(
      draft.lines.map((line, lineIndex) => ({
        entry_id: entry.id,
        account_id: accountId.get(line.code)!,
        debit: Math.round(line.debit * 100) / 100,
        credit: Math.round(line.credit * 100) / 100,
        description: line.description,
        line_no: lineIndex + 1,
      })),
    );
    if (linesError) {
      await admin.from("journal_entries").delete().eq("id", entry.id);
      skipped += 1;
      continue;
    }
    posted += 1;
  }

  return { posted, skipped, scanned: (escrow ?? []).length };
}
