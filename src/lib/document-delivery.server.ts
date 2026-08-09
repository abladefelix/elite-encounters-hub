/**
 * Delivers invoices and receipts on the channels the member picked.
 *
 * Email uses the platform sender configured in Control room → Email & domain.
 * WhatsApp uses the WhatsApp Cloud API credentials in the admin key vault
 * (`whatsapp_phone_number_id` + `whatsapp_access_token`). A channel that is not
 * configured is recorded as skipped — never reported as delivered.
 */
import { adminClient, vaultKeys } from "./payments.server";
import {
  DEFAULT_DELIVERY_SETTINGS,
  readDocumentDelivery,
  toWhatsAppMsisdn,
  type DeliverySettings,
} from "./document-delivery";

type ChannelOutcome = "sent" | "skipped" | "failed";

export interface DeliveryReport {
  documentId: string;
  email: ChannelOutcome;
  whatsapp: ChannelOutcome;
  note: string;
}

async function deliverySettings(): Promise<DeliverySettings> {
  const db = await adminClient();
  const { data } = await db.from("platform_settings").select("data").eq("id", true).maybeSingle();
  const blob = (data?.data ?? {}) as Record<string, unknown>;
  return {
    ...DEFAULT_DELIVERY_SETTINGS,
    ...((blob["delivery"] as Partial<DeliverySettings> | undefined) ?? {}),
  };
}

async function emailSettings() {
  const db = await adminClient();
  const { data } = await db.from("platform_settings").select("data").eq("id", true).maybeSingle();
  const blob = (data?.data ?? {}) as Record<string, unknown>;
  const email = (blob["email"] ?? {}) as Record<string, unknown>;
  const domain = String(email["senderDomain"] ?? "").trim();
  const mailbox = String(email["senderMailbox"] ?? "no-reply").trim() || "no-reply";
  return {
    domain,
    from: domain ? `${String(email["senderName"] ?? "Ashnight")} <${mailbox}@${domain}>` : "",
    replyTo: String(email["replyTo"] ?? "").trim(),
    receiptEmail: email["receiptEmail"] !== false,
  };
}

function money(pesewasOrCedis: number) {
  return `GHS ${Number(pesewasOrCedis ?? 0).toLocaleString("en-GH")}`;
}

/** Plain-text summary used for both WhatsApp and the email text part. */
function summary(doc: {
  kind: string;
  number: string;
  title: string;
  total: number;
  issued_at: string;
}) {
  const label = doc.kind === "invoice" ? "Invoice" : "Receipt";
  const date = new Date(doc.issued_at).toLocaleDateString("en-GB");
  return [
    `${label} ${doc.number}`,
    doc.title,
    `Total: ${money(doc.total)}`,
    `Issued: ${date}`,
    "",
    "Open Ashnight → Inbox → Billing to view or download the full document.",
  ].join("\n");
}

async function sendWhatsApp(to: string, body: string) {
  const keys = await vaultKeys(["whatsapp_phone_number_id", "whatsapp_access_token"]);
  const phoneNumberId = keys["whatsapp_phone_number_id"];
  const token = keys["whatsapp_access_token"];
  if (!phoneNumberId || !token) {
    return { outcome: "skipped" as ChannelOutcome, note: "WhatsApp credentials not set" };
  }
  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`WhatsApp send failed [${response.status}]: ${detail}`);
    return { outcome: "failed" as ChannelOutcome, note: `WhatsApp ${response.status}` };
  }
  return { outcome: "sent" as ChannelOutcome, note: "" };
}

async function sendEmail(to: string, subject: string, text: string) {
  const settings = await emailSettings();
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!settings.domain || !settings.from) {
    return { outcome: "skipped" as ChannelOutcome, note: "Sending domain not set" };
  }
  if (!apiKey) {
    return { outcome: "skipped" as ChannelOutcome, note: "Email service not configured" };
  }
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6">${text
    .split("\n")
    .map((line) => (line ? `<p style="margin:0 0 8px">${line}</p>` : "<br/>"))
    .join("")}</div>`;
  try {
    const { sendLovableEmail } = await import("@lovable.dev/email-js");
    await sendLovableEmail(
      {
        to,
        from: settings.from,
        sender_domain: settings.domain,
        subject,
        html,
        text,
        purpose: "transactional",
        ...(settings.replyTo ? { reply_to: settings.replyTo } : {}),
      },
      { apiKey },
    );
    return { outcome: "sent" as ChannelOutcome, note: "" };
  } catch (error) {
    console.error("Document email failed:", error);
    return {
      outcome: "failed" as ChannelOutcome,
      note: error instanceof Error ? error.message : "Email failed",
    };
  }
}

/**
 * Sends one document out on the member's chosen channels. Never throws — a
 * delivery problem must not roll back the paperwork itself.
 */
export async function deliverDocument(documentId: string): Promise<DeliveryReport> {
  const report: DeliveryReport = {
    documentId,
    email: "skipped",
    whatsapp: "skipped",
    note: "",
  };
  try {
    const db = await adminClient();
    const { data: doc } = await db
      .from("documents")
      .select("id, kind, number, title, total, issued_at, client_id")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc?.client_id) {
      report.note = "Document or recipient missing";
      return report;
    }

    const { data: profile } = await db
      .from("profiles")
      .select("display_name, phone, extra")
      .eq("id", doc.client_id)
      .maybeSingle();
    const prefs = readDocumentDelivery(profile?.extra);
    const settings = await deliverySettings();
    if (!settings.enabled) {
      report.note = "Document delivery is switched off in admin";
      return report;
    }
    const body = summary(doc as never);
    const subject = `${doc.kind === "invoice" ? "Invoice" : "Receipt"} ${doc.number} · Ashnight`;
    const notes: string[] = [];

    let wantsEmail = prefs.email && settings.emailEnabled;

    if (prefs.whatsapp && settings.whatsappEnabled) {
      const target = toWhatsAppMsisdn(prefs.whatsappNumber || profile?.phone || "");
      if (!target) {
        notes.push("No WhatsApp number on file");
        if (settings.whatsappFallbackToEmail) wantsEmail = true;
      } else {
        const greeting = `Hi ${profile?.display_name || "there"} — here is your ${
          doc.kind === "invoice" ? "invoice" : "receipt"
        } from ${settings.whatsappSenderName}.\n\n${body}`;
        const result = await sendWhatsApp(target, greeting);
        report.whatsapp = result.outcome;
        if (result.note) notes.push(result.note);
        if (result.outcome !== "sent" && settings.whatsappFallbackToEmail) wantsEmail = true;
      }
    } else if (prefs.whatsapp) {
      notes.push("WhatsApp delivery is switched off in admin");
      if (settings.whatsappFallbackToEmail) wantsEmail = true;
    }

    if (wantsEmail) {
      const { data: auth } = await db.auth.admin.getUserById(doc.client_id);
      const address = auth?.user?.email ?? "";
      if (!address) {
        notes.push("No email address on file");
      } else {
        const result = await sendEmail(address, subject, body);
        report.email = result.outcome;
        if (result.note) notes.push(result.note);
      }
    }

    report.note = notes.join("; ");

    await db.from("activity_log").insert({
      actor_id: doc.client_id,
      actor_label: profile?.display_name ?? "member",
      area: "documents",
      event: `${doc.kind} delivery`,
      severity: report.email === "failed" || report.whatsapp === "failed" ? "warning" : "info",
      target: doc.number,
      details: {
        email: report.email,
        whatsapp: report.whatsapp,
        note: report.note,
      } as never,
    });

    return report;
  } catch (error) {
    console.error("Document delivery failed:", error);
    report.note = error instanceof Error ? error.message : "Delivery failed";
    return report;
  }
}
