/**
 * Template editor for invoices and receipts.
 *
 * Admins pick which template every document uses, edit any of them (built-ins
 * included), duplicate one as a starting point, or add their own from scratch.
 * A live preview renders the real DocumentCard with the edited values.
 */
import { useEffect, useState } from "react";
import { Copy, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  blankTemplate,
  useDocumentTemplates,
  type DocumentTemplate,
} from "@/lib/document-templates";

export function DocumentTemplateManager({
  onPreview,
}: {
  /** Bubbles the in-progress template up so the page can preview it. */
  onPreview: (template: DocumentTemplate) => void;
}) {
  const { templates, activeId, setActive, upsert, remove, resetToDefaults, loading } =
    useDocumentTemplates();
  const [editingId, setEditingId] = useState<string>(activeId);
  const [draft, setDraft] = useState<DocumentTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = templates.find((row) => row.id === editingId) ?? templates[0];

  useEffect(() => {
    if (selected && (!draft || draft.id !== selected.id)) setDraft(selected);
  }, [selected, draft]);

  useEffect(() => {
    if (draft) onPreview(draft);
  }, [draft, onPreview]);

  function edit(patch: Partial<DocumentTemplate>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await upsert(draft);
      toast.success(`Saved “${draft.name}”`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save the template.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!draft) return;
    const copy = { ...draft, ...blankTemplate(`${draft.name} copy`), builtIn: false };
    const next: DocumentTemplate = { ...draft, id: copy.id, name: copy.name, builtIn: false };
    await upsert(next);
    setEditingId(next.id);
    setDraft(next);
    toast.success("Duplicated — edit and save.");
  }

  async function destroy() {
    if (!draft || draft.builtIn) return;
    await remove(draft.id);
    const fallback = templates.find((row) => row.id !== draft.id);
    if (fallback) {
      setEditingId(fallback.id);
      setDraft(fallback);
    }
    toast.success("Template removed.");
  }

  async function addNew() {
    const template = blankTemplate("New template");
    await upsert(template);
    setEditingId(template.id);
    setDraft(template);
  }

  if (loading || !draft) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading templates…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="font-display text-base">Document templates</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">In use</Label>
            <Select value={activeId} onValueChange={(value) => void setActive(value)}>
              <SelectTrigger className="h-9 w-[190px] text-xs" aria-label="Active template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templates.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void addNew()}>
            <Plus className="mr-2 size-3.5" /> New
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs text-muted-foreground">Editing</Label>
          <Select value={draft.id} onValueChange={(value) => setEditingId(value)}>
            <SelectTrigger className="h-9 w-[190px] text-xs" aria-label="Template being edited">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                  {row.builtIn ? " (built-in)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => void duplicate()}>
            <Copy className="mr-2 size-3.5" /> Duplicate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={draft.builtIn}
            onClick={() => void destroy()}
          >
            <Trash2 className="mr-2 size-3.5" /> Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => void resetToDefaults().then(() => toast.success("Built-ins restored."))}
          >
            <RotateCcw className="mr-2 size-3.5" /> Restore built-ins
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Template name">
            <Input value={draft.name} onChange={(event) => edit({ name: event.target.value })} />
          </Field>
          <Field label="Trading name">
            <Input
              value={draft.businessName}
              onChange={(event) => edit({ businessName: event.target.value })}
            />
          </Field>
          <Field label="Tagline">
            <Input
              value={draft.tagline}
              placeholder="Optional line under the name"
              onChange={(event) => edit({ tagline: event.target.value })}
            />
          </Field>
          <Field label="Accent colour">
            <div className="flex gap-2">
              <Input
                type="color"
                className="h-10 w-14 p-1"
                value={draft.accent}
                onChange={(event) => edit({ accent: event.target.value })}
                aria-label="Accent colour"
              />
              <Input
                value={draft.accent}
                onChange={(event) => edit({ accent: event.target.value })}
              />
            </div>
          </Field>
          <Field label="Invoice heading">
            <Input
              value={draft.invoiceHeading}
              onChange={(event) => edit({ invoiceHeading: event.target.value })}
            />
          </Field>
          <Field label="Receipt heading">
            <Input
              value={draft.receiptHeading}
              onChange={(event) => edit({ receiptHeading: event.target.value })}
            />
          </Field>
          <Field label="Contact block" hint="One line per row — address, phone, billing email.">
            <Textarea
              rows={4}
              value={draft.contact}
              onChange={(event) => edit({ contact: event.target.value })}
            />
          </Field>
          <Field label="Note under totals">
            <Textarea
              rows={4}
              value={draft.thankYouNote}
              onChange={(event) => edit({ thankYouNote: event.target.value })}
            />
          </Field>
          <Field label="Footer small print" hint="Tax id, bank details, policy line.">
            <Textarea
              rows={3}
              value={draft.footerNote}
              onChange={(event) => edit({ footerNote: event.target.value })}
            />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
            <div>
              <p className="text-sm font-medium">Show wordmark</p>
              <p className="text-xs text-muted-foreground">
                Prints the trading name in the accent colour.
              </p>
            </div>
            <Switch
              checked={draft.showLogo}
              onCheckedChange={(checked) => edit({ showLogo: checked })}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            {saving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save template
          </Button>
          {draft.id !== activeId ? (
            <Button size="sm" variant="secondary" onClick={() => void setActive(draft.id)}>
              Use this template
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
