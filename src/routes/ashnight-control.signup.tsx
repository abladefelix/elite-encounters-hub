import { createFileRoute } from "@tanstack/react-router";
import { GripVertical, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRecordAudit } from "@/lib/audit-log";
import { useFeatureFlags } from "@/lib/feature-flags";
import {
  BUILTIN_FIELDS,
  DEFAULT_SIGNUP_CONFIG,
  useSignupConfig,
  type BuiltinFieldKey,
  type CustomSignupField,
  type SignupAudience,
  type SignupConfig,
  type SignupFieldType,
} from "@/lib/signup-fields";

const AUDIENCES: { id: SignupAudience; label: string }[] = [
  { id: "both", label: "Everyone" },
  { id: "client", label: "Clients only" },
  { id: "specialist", label: "Specialists only" },
];

const FIELD_TYPES: { id: SignupFieldType; label: string }[] = [
  { id: "text", label: "Short text" },
  { id: "textarea", label: "Long text" },
  { id: "tel", label: "Phone" },
  { id: "number", label: "Number" },
  { id: "select", label: "Dropdown" },
  { id: "checkbox", label: "Checkbox" },
  { id: "date", label: "Date" },
];

export const Route = createFileRoute("/ashnight-control/signup")({
  head: () => ({
    meta: [
      { title: "Sign-up Form Builder | Ashnight Admin" },
      {
        name: "description",
        content:
          "Choose which fields clients and specialists fill in at sign-up, add custom fields, and publish the Ashnight terms and privacy policy.",
      },
      { property: "og:title", content: "Sign-up Form Builder | Ashnight Admin" },
      {
        property: "og:description",
        content: "Built-in fields, custom fields and legal copy for the Ashnight sign-up form.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSignupForm,
});

function AdminSignupForm() {
  const { config, save, loading } = useSignupConfig();
  const { flags } = useFeatureFlags();
  const recordAudit = useRecordAudit();
  const [draft, setDraft] = useState<SignupConfig>(config);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(config);
  }, [config, dirty]);

  function patch(next: Partial<SignupConfig>) {
    setDirty(true);
    setDraft((current) => ({ ...current, ...next }));
  }

  function patchField(key: BuiltinFieldKey, next: Partial<SignupConfig["fields"][BuiltinFieldKey]>) {
    patch({ fields: { ...draft.fields, [key]: { ...draft.fields[key], ...next } } });
  }

  function patchCustom(id: string, next: Partial<CustomSignupField>) {
    patch({ custom: draft.custom.map((row) => (row.id === id ? { ...row, ...next } : row)) });
  }

  function addCustom() {
    const row: CustomSignupField = {
      id: `f_${Math.random().toString(36).slice(2, 9)}`,
      label: "New question",
      hint: "",
      type: "text",
      options: [],
      enabled: true,
      required: false,
      audience: "both",
    };
    patch({ custom: [...draft.custom, row] });
  }

  async function persist() {
    try {
      await save(draft);
      setDirty(false);
      toast.success("Sign-up form published.");
      if (flags.auditLogging) {
        recordAudit.mutate({ area: "signup", action: "updated", target: "signup-form" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the form.");
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Control room</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Sign-up form
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Decide exactly what clients and specialists must provide to create an account, add your
            own questions, and publish the terms and privacy policy members must accept.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDraft(DEFAULT_SIGNUP_CONFIG);
              setDirty(true);
            }}
          >
            <RotateCcw className="size-4" /> Reset
          </Button>
          <Button onClick={persist} disabled={!dirty || loading}>
            <Save className="size-4" /> Publish
          </Button>
        </div>
      </header>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Let visitors choose their role</p>
            <p className="text-xs text-muted-foreground">
              Off means everyone signs up as a client and specialists apply separately.
            </p>
          </div>
          <Switch
            checked={draft.roleChoice}
            onCheckedChange={(next) => patch({ roleChoice: next })}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="client-intro">Client intro copy</Label>
            <Textarea
              id="client-intro"
              rows={3}
              value={draft.clientIntro}
              onChange={(event) => patch({ clientIntro: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="specialist-intro">Specialist intro copy</Label>
            <Textarea
              id="specialist-intro"
              rows={3}
              value={draft.specialistIntro}
              onChange={(event) => patch({ specialistIntro: event.target.value })}
            />
          </div>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Built-in fields</h2>
        <p className="text-sm text-muted-foreground">
          Email and password are always required. Everything else is yours to control.
        </p>
        <Card className="divide-y divide-border/70">
          {BUILTIN_FIELDS.map((meta) => {
            const value = draft.fields[meta.key];
            return (
              <div key={meta.key} className="flex flex-wrap items-center gap-4 p-4">
                <GripVertical className="size-4 shrink-0 text-muted-foreground/60" />
                <div className="min-w-48 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span>{value.label || meta.label}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {meta.type}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">{meta.hint}</p>
                </div>
                <Input
                  className="w-44"
                  placeholder={`Label: ${meta.label}`}
                  value={value.label ?? ""}
                  onChange={(event) => patchField(meta.key, { label: event.target.value })}
                />
                <Select
                  value={value.audience}
                  onValueChange={(next) =>
                    patchField(meta.key, { audience: next as SignupAudience })
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Required
                  <Switch
                    checked={value.required}
                    onCheckedChange={(next) => patchField(meta.key, { required: next })}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Shown
                  <Switch
                    checked={value.enabled}
                    onCheckedChange={(next) => patchField(meta.key, { enabled: next })}
                  />
                </label>
              </div>
            );
          })}
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Custom fields</h2>
            <p className="text-sm text-muted-foreground">
              Extra questions saved on the member profile and visible in the vetting queue.
            </p>
          </div>
          <Button variant="outline" onClick={addCustom}>
            <Plus className="size-4" /> Add field
          </Button>
        </div>

        {draft.custom.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No custom fields yet.</Card>
        ) : (
          <div className="space-y-3">
            {draft.custom.map((row) => (
              <Card key={row.id} className="space-y-4 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-56 flex-1 space-y-2">
                    <Label>Question</Label>
                    <Input
                      value={row.label}
                      onChange={(event) => patchCustom(row.id, { label: event.target.value })}
                    />
                  </div>
                  <div className="w-40 space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={row.type}
                      onValueChange={(next) =>
                        patchCustom(row.id, { type: next as SignupFieldType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-40 space-y-2">
                    <Label>Audience</Label>
                    <Select
                      value={row.audience}
                      onValueChange={(next) =>
                        patchCustom(row.id, { audience: next as SignupAudience })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIENCES.map((audience) => (
                          <SelectItem key={audience.id} value={audience.id}>
                            {audience.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
                    Required
                    <Switch
                      checked={row.required}
                      onCheckedChange={(next) => patchCustom(row.id, { required: next })}
                    />
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
                    Shown
                    <Switch
                      checked={row.enabled}
                      onCheckedChange={(next) => patchCustom(row.id, { enabled: next })}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mb-1 text-destructive"
                    onClick={() =>
                      patch({ custom: draft.custom.filter((item) => item.id !== row.id) })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Helper text</Label>
                    <Input
                      value={row.hint}
                      onChange={(event) => patchCustom(row.id, { hint: event.target.value })}
                    />
                  </div>
                  {row.type === "select" ? (
                    <div className="space-y-2">
                      <Label>Options (comma separated)</Label>
                      <Input
                        value={row.options.join(", ")}
                        onChange={(event) =>
                          patchCustom(row.id, {
                            options: event.target.value
                              .split(",")
                              .map((option) => option.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Terms & privacy policy</h2>
        <p className="text-sm text-muted-foreground">
          This copy is what members read at <span className="font-mono text-xs">/legal</span> and
          accept during sign-up. Add a URL instead if you host the documents elsewhere.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium">Terms</p>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Must accept
                <Switch
                  checked={draft.legal.requireTerms}
                  onCheckedChange={(next) =>
                    patch({ legal: { ...draft.legal, requireTerms: next } })
                  }
                />
              </label>
            </div>
            <Input
              value={draft.legal.termsTitle}
              placeholder="Title"
              onChange={(event) =>
                patch({ legal: { ...draft.legal, termsTitle: event.target.value } })
              }
            />
            <Input
              value={draft.legal.termsUrl}
              placeholder="External URL (optional)"
              onChange={(event) =>
                patch({ legal: { ...draft.legal, termsUrl: event.target.value } })
              }
            />
            <Textarea
              rows={10}
              value={draft.legal.termsBody}
              onChange={(event) =>
                patch({ legal: { ...draft.legal, termsBody: event.target.value } })
              }
            />
          </Card>
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium">Privacy policy</p>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Must accept
                <Switch
                  checked={draft.legal.requirePrivacy}
                  onCheckedChange={(next) =>
                    patch({ legal: { ...draft.legal, requirePrivacy: next } })
                  }
                />
              </label>
            </div>
            <Input
              value={draft.legal.privacyTitle}
              placeholder="Title"
              onChange={(event) =>
                patch({ legal: { ...draft.legal, privacyTitle: event.target.value } })
              }
            />
            <Input
              value={draft.legal.privacyUrl}
              placeholder="External URL (optional)"
              onChange={(event) =>
                patch({ legal: { ...draft.legal, privacyUrl: event.target.value } })
              }
            />
            <Textarea
              rows={10}
              value={draft.legal.privacyBody}
              onChange={(event) =>
                patch({ legal: { ...draft.legal, privacyBody: event.target.value } })
              }
            />
          </Card>
        </div>
        <Card className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium">Marketing opt-in checkbox</p>
            <p className="text-xs text-muted-foreground">
              Adds an optional consent tick for Ashnight updates.
            </p>
          </div>
          <Switch
            checked={draft.legal.marketingOptIn}
            onCheckedChange={(next) => patch({ legal: { ...draft.legal, marketingOptIn: next } })}
          />
        </Card>
      </section>
    </div>
  );
}
