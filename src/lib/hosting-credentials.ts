/**
 * Hosting credentials the control room stores in the admin-only key vault.
 *
 * These reuse `integration_keys`, so they are readable by admins only and never
 * reach a member's browser. Grouped so the Server & DNS screen can render them
 * as tidy sections.
 */
export interface CredentialField {
  key: string;
  label: string;
  description: string;
  secret: boolean;
}

export interface CredentialGroup {
  id: string;
  title: string;
  blurb: string;
  fields: CredentialField[];
}

export const CREDENTIAL_GROUPS: CredentialGroup[] = [
  {
    id: "domain",
    title: "Domain & host",
    blurb: "The names DNS should point at this server.",
    fields: [
      {
        key: "primary_domain",
        label: "Primary domain",
        description: "e.g. ashnight.com — used in the DNS record table below.",
        secret: false,
      },
      {
        key: "server_public_ip_override",
        label: "Public IP override",
        description: "Set only if the detected IP is wrong (e.g. behind a NAT or proxy).",
        secret: false,
      },
    ],
  },
  {
    id: "database",
    title: "Database",
    blurb: "Connection details for the Postgres instance behind Ashnight.",
    fields: [
      { key: "db_host", label: "Database host", description: "Hostname or IP.", secret: false },
      { key: "db_port", label: "Database port", description: "Usually 5432.", secret: false },
      { key: "db_name", label: "Database name", description: "", secret: false },
      { key: "db_user", label: "Database user", description: "", secret: false },
      { key: "db_password", label: "Database password", description: "", secret: true },
      {
        key: "db_connection_url",
        label: "Connection URL",
        description: "Full postgres:// string, if you prefer one value.",
        secret: true,
      },
    ],
  },
  {
    id: "server",
    title: "Server access",
    blurb: "How you reach the machine itself.",
    fields: [
      { key: "ssh_host", label: "SSH host", description: "", secret: false },
      { key: "ssh_user", label: "SSH user", description: "", secret: false },
      { key: "ssh_port", label: "SSH port", description: "Usually 22.", secret: false },
      {
        key: "ssh_password",
        label: "SSH password / key passphrase",
        description: "Store the passphrase only — never paste a private key here.",
        secret: true,
      },
      {
        key: "control_panel_url",
        label: "Hosting panel URL",
        description: "cPanel, Coolify, Proxmox — wherever the box is managed.",
        secret: false,
      },
      {
        key: "control_panel_user",
        label: "Hosting panel user",
        description: "",
        secret: false,
      },
      {
        key: "control_panel_password",
        label: "Hosting panel password",
        description: "",
        secret: true,
      },
    ],
  },
  {
    id: "mail",
    title: "Outbound mail (SMTP)",
    blurb: "Used for transactional email once you wire a provider.",
    fields: [
      { key: "smtp_host", label: "SMTP host", description: "", secret: false },
      { key: "smtp_port", label: "SMTP port", description: "587 for STARTTLS.", secret: false },
      { key: "smtp_user", label: "SMTP user", description: "", secret: false },
      { key: "smtp_password", label: "SMTP password", description: "", secret: true },
      {
        key: "smtp_from",
        label: "From address",
        description: "e.g. no-reply@ashnight.com",
        secret: false,
      },
    ],
  },
];

export const CREDENTIAL_KEYS = CREDENTIAL_GROUPS.flatMap((group) => group.fields);
