/**
 * Control room: every member-facing form except sign-up.
 *
 * Admins switch fields on/off, make them optional or required, rewrite their
 * label / hint / placeholder, and add their own questions — for sign-in, the
 * profile editor, the application form and the support complaint form.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useRecordAudit } from "@/lib/audit-log";
import { useFeatureFlags } from "@/lib/feature-flags";
import {
  DEFAULT_FORMS_CONFIG,
  FORM_REGISTRY,
  useFormsConfig,
  type CustomFormField,
  type FieldOverride,
  type FormKey,
  type FormSectionConfig,
  type FormsConfig,
  type IdentifierMode,
} from "@/lib/form-fields";
import type { SignupFieldType } from "@/lib/signup-fields";

const FIELD_TYPES: { id: SignupFieldType; label: string }[] = [
  { id: "text", label: "Short text" },
  { id: "textarea", label: "Long text" },
  { id: "tel", label: "Phone" },
  { id: "number", label: "Number" },
  { id: "select", label: "Dropdown" },
  { id: "checkbox", label: "Checkbox" },
  { id: "date", label: "Date" },
];

export const Route = createFileRoute("/ashnight-control/forms")({
  head: () => ({
    meta: [
      { title: "Form fields | Ashnight Admin" },
      {
        name: "description",
        content:
          "Control every Ashnight form: sign-in, profile, application and support. Add, remove, rename or require any field.",
      },
      { property: "og:title", content: "Form fields | Ashnight Admin" },
      {
        property: "og:description",
        content: "Field-level control for the sign-in, profile, application and complaint forms.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFormsPage,
});

function AdminFormsPage() {
  const { config, save, loading } = useFormsConfig();
  const { flags } = useFeatureFlags();
  const recordAudit = useRecordAudit();
  const [draft, setDraft] = useState<FormsConfig>(config);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(config);
  }, [config, dirty]);

  function patchSection(key: FormKey, next: Partial<FormSectionConfig>) {
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: { ...current[key], ...next } }));
  }

  function patchField(key: FormKey, fieldKey: string, next: Partial<FieldOverride>) {
    setDirty(true);
    setDraft((current) => ({
      ...current,
      [key]: {
        ...current[key],
        fields: {
          ...current[key].fields,
          [fieldKey]: {
            ...(current[key].fields[fieldKey] ?? { enabled: true, required: false }),
            ...next,
          },
        },
      },
    }));
  }

  function patchCustom(key: FormKey, id: string, next: Partial<CustomFormField>) {
    patchSection(key, {
      custom: draft[key].custom.map((row) => (row.id === id ? { ...row, ...next } : row)),
    });
  }

  function addCustom(key: FormKey) {
    const row: CustomFormField = {
      id: `f_${Math.random().toString(36).slice(2, 9)}`,
      label: "New question",
      hint: "",
      type: "text",
      options: [],
      enabled: true,
      required: false,
    };
    patchSection(key, { custom: [...draft[key].custom, row] });
  }

  async function persist() {
    try {
      await save(draft);
      setDirty(false);
      toast.success("Forms published.");
      if (flags.auditLogging) {
        recordAudit.mutate({ area: "forms", action: "updated", target: "form-fields" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the forms.");
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Control room</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Form fields</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Every member-facing form outside sign-up. Switch fields on or off, make them required,
            rewrite the wording members read, and add your own questions.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDraft(DEFAULT_FORMS_CONFIG);
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

      <Tabs defaultValue="signin">
        <TabsList className="flex-wrap">
          {FORM_REGISTRY.map((form) => (
            <TabsTrigger key={form.key} value={form.key}>
              {form.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {FORM_REGISTRY.map((form) => {
          const section = draft[form.key];
          return (
            <TabsContent key={form.key} value={form.key} className="mt-4 space-y-6">
              <Card className="space-y-4 p-5">
                <p className="text-sm text-muted-foreground">{form.description}</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${form.key}-intro`}>Intro copy</Label>
                    <Textarea
                      id={`${form.key}-intro`}
                      rows={2}
                      value={section.intro}
                      onChange={(event) => patchSection(form.key, { intro: event.target.value })}
                      placeholder="Shown above the form. Leave blank to hide."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${form.key}-submit`}>Submit button text</Label>
                    <Input
                      id={`${form.key}-submit`}
                      value={section.submitLabel ?? ""}
                      onChange={(event) =>
                        patchSection(form.key, { submitLabel: event.target.value })
                      }
                    />
                  </div>
                </div>

                {form.key === "signin" ? (
                  <div className="grid gap-4 border-t border-border/70 pt-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Members sign in with</Label>
                      <Select
                        value={draft.signin.identifierMode}
                        onValueChange={(next) =>
                          patchSection("signin", {
                            identifierMode: next as IdentifierMode,
                          } as Partial<FormSectionConfig>)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="either">Username or email</SelectItem>
                          <SelectItem value="email">Email only</SelectItem>
                          <SelectItem value="username">Username only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      {(
                        [
                          ["showGoogle", "Show Google button"],
                          ["showForgot", "Show “forgot password”"],
                          ["showSignupTab", "Show the create-account tab"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between gap-4">
                          <span className="text-sm">{label}</span>
                          <Switch
                            checked={draft.signin[key]}
                            onCheckedChange={(next) =>
                              patchSection("signin", { [key]: next } as Partial<FormSectionConfig>)
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signin-tab-label">Sign-in tab label</Label>
                      <Input
                        id="signin-tab-label"
                        value={draft.signin.signinTabLabel}
                        onChange={(event) =>
                          patchSection("signin", {
                            signinTabLabel: event.target.value,
                          } as Partial<FormSectionConfig>)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-tab-label">Create-account tab label</Label>
                      <Input
                        id="signup-tab-label"
                        value={draft.signin.signupTabLabel}
                        onChange={(event) =>
                          patchSection("signin", {
                            signupTabLabel: event.target.value,
                          } as Partial<FormSectionConfig>)
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </Card>

              <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold">Built-in fields</h2>
                <Card className="divide-y divide-border/70">
                  {form.fields.map((meta) => {
                    const value = section.fields[meta.key] ?? { enabled: true, required: false };
                    return (
                      <div key={meta.key} className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="min-w-40 flex-1">
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                              <span>{value.label?.trim() || meta.label}</span>
                              {meta.locked ? (
                                <Badge variant="outline" className="text-[10px] uppercase">
                                  always on
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">{meta.hint}</p>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Required
                            <Switch
                              checked={value.required}
                              disabled={meta.locked}
                              onCheckedChange={(next) =>
                                patchField(form.key, meta.key, { required: next })
                              }
                            />
                          </label>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Shown
                            <Switch
                              checked={value.enabled !== false}
                              disabled={meta.locked}
                              onCheckedChange={(next) =>
                                patchField(form.key, meta.key, { enabled: next })
                              }
                            />
                          </label>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Input
                            placeholder={`Label: ${meta.label}`}
                            value={value.label ?? ""}
                            onChange={(event) =>
                              patchField(form.key, meta.key, { label: event.target.value })
                            }
                          />
                          <Input
                            placeholder="Helper text under the field"
                            value={value.hint ?? ""}
                            onChange={(event) =>
                              patchField(form.key, meta.key, { hint: event.target.value })
                            }
                          />
                          <Input
                            placeholder="Placeholder inside the field"
                            value={value.placeholder ?? ""}
                            onChange={(event) =>
                              patchField(form.key, meta.key, { placeholder: event.target.value })
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold">Your own questions</h2>
                    <p className="text-sm text-muted-foreground">
                      {form.key === "signin"
                        ? "Extra sign-in questions can gate access — set an expected answer for an access code."
                        : form.key === "profile"
                          ? "Answers are saved on the member's profile."
                          : "Answers are appended to the message support receives."}
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => addCustom(form.key)}>
                    <Plus className="size-4" /> Add question
                  </Button>
                </div>

                {section.custom.length === 0 ? (
                  <Card className="p-5 text-sm text-muted-foreground">No extra questions yet.</Card>
                ) : null}

                {section.custom.map((row) => (
                  <Card key={row.id} className="space-y-3 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Question</Label>
                        <Input
                          value={row.label}
                          onChange={(event) =>
                            patchCustom(form.key, row.id, { label: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Helper text</Label>
                        <Input
                          value={row.hint}
                          onChange={(event) =>
                            patchCustom(form.key, row.id, { hint: event.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Select
                        value={row.type}
                        onValueChange={(next) =>
                          patchCustom(form.key, row.id, { type: next as SignupFieldType })
                        }
                      >
                        <SelectTrigger className="w-40">
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
                      {row.type === "select" ? (
                        <Input
                          className="flex-1"
                          placeholder="Options, comma separated"
                          value={row.options.join(", ")}
                          onChange={(event) =>
                            patchCustom(form.key, row.id, {
                              options: event.target.value
                                .split(",")
                                .map((option) => option.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      ) : null}
                      {form.key === "signin" ? (
                        <Input
                          className="w-56"
                          placeholder="Expected answer (optional)"
                          value={row.mustEqual ?? ""}
                          onChange={(event) =>
                            patchCustom(form.key, row.id, { mustEqual: event.target.value })
                          }
                        />
                      ) : null}
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Required
                        <Switch
                          checked={row.required}
                          onCheckedChange={(next) =>
                            patchCustom(form.key, row.id, { required: next })
                          }
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Shown
                        <Switch
                          checked={row.enabled}
                          onCheckedChange={(next) => patchCustom(form.key, row.id, { enabled: next })}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${row.label}`}
                        onClick={() =>
                          patchSection(form.key, {
                            custom: draft[form.key].custom.filter((item) => item.id !== row.id),
                          })
                        }
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </section>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
