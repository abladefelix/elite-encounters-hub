/**
 * Admin control for the call engine.
 *
 * Lets an admin move every call between LiveKit's relay and the built-in
 * peer-to-peer path, and states plainly which engine members are actually
 * getting right now — including when LiveKit is selected but its keys are still
 * missing, in which case calls quietly stay on peer-to-peer rather than break.
 */
import { PhoneCall, Radio, Wifi } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CALL_ENGINE_OPTIONS, type CallEngine } from "@/lib/call-engine";
import { useIntegrationKeys } from "@/lib/integration-keys";

export function CallEngineCard({
  engine,
  onChange,
  disabled,
}: {
  engine: CallEngine;
  onChange: (next: CallEngine) => void;
  disabled?: boolean;
}) {
  const keys = useIntegrationKeys();
  const value = (key: string) =>
    ((keys.data ?? []).find((row) => row.key === key)?.value ?? "").trim();
  const liveKitReady = Boolean(
    value("livekit_url") && value("livekit_api_key") && value("livekit_api_secret"),
  );

  const active =
    engine === "webrtc" || !liveKitReady ? "Direct peer-to-peer" : "LiveKit relay";

  return (
    <Card className="border-border/70 bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
          {active === "LiveKit relay" ? (
            <Radio className="size-4" />
          ) : (
            <Wifi className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold">Call engine</h2>
            <Badge variant="default" className="text-[10px]">
              Live: {active}
            </Badge>
            {!liveKitReady ? (
              <Badge variant="secondary" className="text-[10px]">
                LiveKit keys missing
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Choose how voice and video calls are carried. Changes apply to every member on
            their next call — no deploy, no reinstall — so you can compare reliability on
            real devices and switch back the moment something misbehaves.
          </p>
        </div>
        <PhoneCall className="size-4 shrink-0 text-muted-foreground" />
      </div>

      <RadioGroup
        value={engine}
        onValueChange={(next) => onChange(next as CallEngine)}
        disabled={disabled}
        className="mt-5 gap-2.5"
      >
        {CALL_ENGINE_OPTIONS.map((option) => (
          <Label
            key={option.value}
            htmlFor={`call-engine-${option.value}`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-3"
          >
            <RadioGroupItem
              id={`call-engine-${option.value}`}
              value={option.value}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>

      <p className="mt-4 text-[11px] text-muted-foreground">
        LiveKit credentials live in Control room → Settings → Keys & security. Selecting
        LiveKit without them saved keeps calls on peer-to-peer instead of failing.
      </p>
    </Card>
  );
}
