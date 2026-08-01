/**
 * Renders the admin-configured sign-up fields for one role.
 *
 * Built-in answers are keyed by their profile column; custom answers are keyed
 * by the field id and stored on `profiles.extra`.
 */
import { Camera } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import {
  BUILTIN_FIELDS,
  appliesTo,
  type BuiltinFieldKey,
  type SignupConfig,
} from "@/lib/signup-fields";

export type SignupValues = Record<string, string | boolean>;

interface Props {
  config: SignupConfig;
  role: "client" | "specialist";
  values: SignupValues;
  onChange: (key: string, value: string | boolean) => void;
  avatarPreview: string | null;
  onAvatarPick: (file: File | null) => void;
}

export function SignupFieldsForm({
  config,
  role,
  values,
  onChange,
  avatarPreview,
  onAvatarPick,
}: Props) {
  const builtins = BUILTIN_FIELDS.filter((meta) => {
    const field = config.fields[meta.key];
    return field?.enabled && appliesTo(field.audience, role);
  });
  const customs = config.custom.filter((row) => row.enabled && appliesTo(row.audience, role));

  return (
    <>
      {builtins.map((meta) => {
        const field = config.fields[meta.key as BuiltinFieldKey];
        const label = field.label?.trim() || meta.label;
        const id = `signup-${meta.key}`;
        const value = typeof values[meta.key] === "string" ? (values[meta.key] as string) : "";

        if (meta.type === "avatar") {
          return (
            <div key={meta.key} className="space-y-2">
              <Label>{label}</Label>
              <div className="flex items-center gap-3">
                <Avatar className="size-14">
                  {avatarPreview ? <AvatarImage src={avatarPreview} alt="Selected avatar" /> : null}
                  <AvatarFallback>
                    <Camera className="size-5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <input
                    id={id}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => onAvatarPick(event.target.files?.[0] ?? null)}
                  />
                  <Button type="button" variant="outline" size="sm" asChild>
                    <label htmlFor={id}>Choose photo</label>
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">{meta.hint}</p>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={meta.key} className="space-y-2">
            <Label htmlFor={id}>
              {label}
              {field.required ? <span className="text-primary"> *</span> : null}
            </Label>
            {meta.type === "textarea" ? (
              <Textarea
                id={id}
                rows={3}
                required={field.required}
                placeholder={meta.placeholder}
                value={value}
                onChange={(event) => onChange(meta.key, event.target.value)}
              />
            ) : (
              <Input
                id={id}
                type={meta.type === "number" ? "number" : meta.type === "tel" ? "tel" : "text"}
                required={field.required}
                placeholder={meta.placeholder}
                value={value}
                onChange={(event) => onChange(meta.key, event.target.value)}
              />
            )}
          </div>
        );
      })}

      {customs.map((row) => {
        const id = `signup-custom-${row.id}`;
        const key = `custom:${row.id}`;
        const raw = values[key];

        if (row.type === "checkbox") {
          return (
            <label key={row.id} className="flex items-start gap-3 text-sm">
              <Checkbox
                id={id}
                checked={raw === true}
                onCheckedChange={(next) => onChange(key, next === true)}
              />
              <span>
                {row.label}
                {row.required ? <span className="text-primary"> *</span> : null}
                {row.hint ? (
                  <span className="block text-xs text-muted-foreground">{row.hint}</span>
                ) : null}
              </span>
            </label>
          );
        }

        const value = typeof raw === "string" ? raw : "";
        return (
          <div key={row.id} className="space-y-2">
            <Label htmlFor={id}>
              {row.label}
              {row.required ? <span className="text-primary"> *</span> : null}
            </Label>
            {row.type === "select" ? (
              <Select value={value} onValueChange={(next) => onChange(key, next)}>
                <SelectTrigger id={id}>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {row.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : row.type === "textarea" ? (
              <Textarea
                id={id}
                rows={3}
                required={row.required}
                value={value}
                onChange={(event) => onChange(key, event.target.value)}
              />
            ) : (
              <Input
                id={id}
                type={row.type === "number" ? "number" : row.type === "date" ? "date" : "text"}
                required={row.required}
                value={value}
                onChange={(event) => onChange(key, event.target.value)}
              />
            )}
            {row.hint ? <p className="text-xs text-muted-foreground">{row.hint}</p> : null}
          </div>
        );
      })}
    </>
  );
}
