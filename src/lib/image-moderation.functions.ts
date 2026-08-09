import { createServerFn } from "@tanstack/react-start";

/**
 * Image moderation for chat attachments.
 *
 * Text moderation cannot see a photo of a business card, a WhatsApp
 * screenshot, or a handwritten momo number. This runs the picture through a
 * vision model and reports whether it carries contact details or an
 * off-platform / off-escrow arrangement.
 *
 * Fails open: if the model is unreachable the photo is allowed, because a
 * broken scanner must never take chat down.
 */

export interface ImageScanResult {
  /** True when the picture should not be delivered. */
  block: boolean;
  /** Short member-facing reason, e.g. "a phone number in the image". */
  reason: string;
  /** True when the scan could not run (fails open). */
  skipped: boolean;
}

const PROMPT = `You review photos shared inside a cleaning-services marketplace chat.
Block a photo ONLY when it shows details that move the deal off the platform, such as:
- phone numbers, WhatsApp/Telegram/Snapchat handles or QR codes to them
- email addresses, external website or social media links
- bank accounts, mobile money numbers, payment QR codes or payment app screenshots
- handwritten or printed notes, business cards or screenshots proposing cash/off-app payment or meeting outside the platform
Ordinary photos (people, rooms, cleaning work, receipts issued by the platform, pets, children, food) are allowed.
Reply with JSON only: {"block": boolean, "reason": "<short phrase naming what was found, empty when allowed>"}`;

export const scanChatImage = createServerFn({ method: "POST" })
  .inputValidator((input: { dataUrl: string }) => {
    if (typeof input?.dataUrl !== "string" || !input.dataUrl.startsWith("data:image/")) {
      throw new Error("An image is required");
    }
    return input;
  })
  .handler(async ({ data }): Promise<ImageScanResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { block: false, reason: "", skipped: true };

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT },
                { type: "image_url", image_url: { url: data.dataUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        console.error("Image moderation failed:", response.status, await response.text());
        return { block: false, reason: "", skipped: true };
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = payload.choices?.[0]?.message?.content ?? "";
      const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      const parsed = JSON.parse(json) as { block?: unknown; reason?: unknown };
      return {
        block: parsed.block === true,
        reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 160) : "",
        skipped: false,
      };
    } catch (error) {
      console.error("Image moderation error:", error);
      return { block: false, reason: "", skipped: true };
    }
  });
