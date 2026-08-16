/**
 * Renders the admin-authored extra questions for any form.
 *
 * Used by sign-in, the profile editor, the application form and the support
 * complaint form so a new question added in the control room shows up
 * everywhere without touching each page's markup again.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CustomFormField } from "@/lib/form-fields";

export type CustomValues = Record<string, string | boolean>;

interface Props {
  idPrefix: string;
  fields: CustomFormField[];
  values: CustomValues;
  onChange: (id: string, value: string | boolean) => void;
}

export function CustomFormFields({ idPrefix, fields, values, onChange }: Props) {
  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((row) => {
        const id = `${idPrefix}-${row.id}`;
        const value = typeof values[row.id] === "string" ? (values[row.id] as string) : "";

        if (row.type === "checkbox") {
          return (
            <div key={row.id} className="flex items-start gap-2">
              <Checkbox
                id={id}
                checked={values[row.id] === true}
                onCheckedChange={(next) => onChange(row.id, next === true)}
              />
              <Label htmlFor={id} className="text-sm font-normal leading-snug">
                {row.label}
                {row.required ? <span className="text-primary"> *</span> : null}
                {row.hint ? (
                  <span className="block text-xs text-muted-foreground">{row.hint}</span>
                ) : null}
              </Label>
            </div>
          );
        }

        return (
          <div key={row.id} className="space-y-2">
            <Label htmlFor={id} className="text-sm">
              {row.label}
              {row.required ? <span className="text-primary"> *</span> : null}
            </Label>
            {row.type === "textarea" ? (
              <Textarea
                id={id}
                rows={3}
                value={value}
                onChange={(event) => onChange(row.id, event.target.value)}
              />
            ) : row.type === "select" ? (
              <Select value={value} onValueChange={(next) => onChange(row.id, next)}>
                <SelectTrigger id={id}>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {row.options.filter(Boolean).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                type={
                  row.type === "number"
                    ? "number"
                    : row.type === "tel"
                      ? "tel"
                      : row.type === "date"
                        ? "date"
                        : "text"
                }
                value={value}
                onChange={(event) => onChange(row.id, event.target.value)}
              />
            )}
            {row.hint ? <p className="text-xs text-muted-foreground">{row.hint}</p> : null}
          </div>
        );
      })}
    </>
  );
}
