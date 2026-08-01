import { useState } from "react";
import { Check, Eye, EyeOff, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maskValue } from "@/lib/integration-keys";

/**
 * One row of the hosting credential vault: shows whether a value is set, masks
 * secrets by default and lets an admin replace it in place.
 */
export function CredentialRow({
  label,
  description,
  storageKey,
  value,
  secret,
  saving,
  onSave,
}: {
  label: string;
  description: string;
  storageKey: string;
  value: string;
  secret: boolean;
  saving: boolean;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hasValue = value.length > 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{label}</p>
        {secret ? (
          <Badge variant="destructive" className="text-[10px]">
            Secret
          </Badge>
        ) : null}
        {hasValue ? (
          <Badge className="bg-accent/15 text-[10px] text-accent">
            <Check className="mr-1 size-3" /> Set
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            Not set
          </Badge>
        )}
        <code className="ml-auto text-[10px] text-muted-foreground">{storageKey}</code>
      </div>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Enter the ${label.toLowerCase()}`}
            className="min-w-52 flex-1"
            type={secret ? "password" : "text"}
          />
          <Button
            size="sm"
            variant="brass"
            disabled={saving}
            onClick={() => {
              onSave(draft.trim());
              setDraft("");
              setEditing(false);
            }}
          >
            <Save className="size-3.5" /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-secondary px-2 py-1.5 text-xs">
            {hasValue
              ? secret && !revealed
                ? maskValue(value)
                : value
              : "—"}
          </code>
          {hasValue && secret ? (
            <Button size="sm" variant="ghost" onClick={() => setRevealed((prev) => !prev)}>
              {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {revealed ? "Hide" : "Reveal"}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {hasValue ? "Replace" : "Add"}
          </Button>
        </div>
      )}
    </div>
  );
}
