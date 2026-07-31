/**
 * Paystack payment layer (front-end model).
 *
 * Ashnight collects client payments through Paystack, which is the natural fit
 * for Ghana: cards, mobile money (MTN / Telecel / AirtelTigo), bank transfer
 * and USSD, all settled in GHS. This module holds the channel catalogue and
 * the reference format so the checkout UI stays declarative. When the backend
 * lands, `initializePaystack` is the single place to swap the simulated
 * authorisation for a real transaction initialise call.
 */

export type PaystackChannel = "mobile_money" | "card" | "bank_transfer" | "ussd";

export interface PaystackChannelOption {
  id: PaystackChannel;
  label: string;
  hint: string;
}

export const PAYSTACK_CHANNELS: PaystackChannelOption[] = [
  {
    id: "mobile_money",
    label: "Mobile money",
    hint: "MTN MoMo, Telecel Cash, AirtelTigo Money",
  },
  { id: "card", label: "Card", hint: "Visa, Mastercard, Verve" },
  { id: "bank_transfer", label: "Bank transfer", hint: "Pay from your bank app" },
  { id: "ussd", label: "USSD", hint: "Dial a short code to approve" },
];

export const DEFAULT_PAYSTACK_CHANNEL: PaystackChannel = "mobile_money";

export function paystackChannel(id: PaystackChannel): PaystackChannelOption {
  return PAYSTACK_CHANNELS.find((channel) => channel.id === id) ?? PAYSTACK_CHANNELS[0];
}

/** Human-readable reference shown on receipts and in the admin ledger. */
export function paystackReference(seed = Date.now()) {
  return `ASH-${seed.toString(36).toUpperCase().slice(-6)}`;
}

/** Paystack charges in the smallest currency unit (pesewas for GHS). */
export function toPesewas(amountGhs: number) {
  return Math.round(amountGhs * 100);
}
