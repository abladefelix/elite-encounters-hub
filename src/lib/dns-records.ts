/**
 * DNS records the admin maintains by hand.
 *
 * The Server & DNS screen used to print a fixed guess based on the detected IP.
 * Registrars and mail providers need more than that (MX, TXT, CAA, verification
 * records), so the admin now owns an editable record sheet stored in platform
 * settings, with a one-click starter set built from the detected address.
 */
import { useCallback } from "react";

import { useSettingsSection } from "./platform-settings";

export const DNS_RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "SRV",
  "NS",
  "CAA",
] as const;

export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

export interface DnsRecord {
  id: string;
  type: DnsRecordType;
  /** Host / name as the registrar expects it (`@`, `www`, `mail`…). */
  name: string;
  value: string;
  /** Seconds; empty means "registrar default". */
  ttl: string;
  /** MX / SRV only. */
  priority: string;
  note: string;
}

export interface DnsSettings {
  records: DnsRecord[];
}

export const DEFAULT_DNS_SETTINGS: DnsSettings = { records: [] };

export function newDnsRecord(patch: Partial<DnsRecord> = {}): DnsRecord {
  return {
    id: `dns-${Math.random().toString(36).slice(2, 9)}`,
    type: "A",
    name: "@",
    value: "",
    ttl: "3600",
    priority: "",
    note: "",
    ...patch,
  };
}

/** A sensible starting sheet for a fresh domain pointed at this host. */
export function starterRecords(ip: string, domain: string): DnsRecord[] {
  const target = ip || "";
  return [
    newDnsRecord({ type: "A", name: "@", value: target, note: `Points ${domain} at this server.` }),
    newDnsRecord({ type: "A", name: "www", value: target, note: `Points www.${domain} here too.` }),
    newDnsRecord({
      type: "TXT",
      name: "@",
      value: "v=spf1 include:_spf.yourmail.com ~all",
      note: "SPF — replace with your mail provider's value.",
    }),
    newDnsRecord({
      type: "MX",
      name: "@",
      value: "mail.yourmail.com",
      priority: "10",
      note: "Inbound mail host.",
    }),
  ];
}

export function useDnsRecords() {
  const { value, save, loading } = useSettingsSection<DnsSettings>("dns", DEFAULT_DNS_SETTINGS);
  const records = value.records ?? [];

  const replace = useCallback((next: DnsRecord[]) => save({ records: next }), [save]);

  return { records, replace, loading };
}
