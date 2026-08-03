import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, RotateCcw, ToggleLeft } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { CaptchaControlCard } from "@/components/admin/captcha-control-card";
import { CallEngineCard } from "@/components/admin/call-engine-card";
import { useCallEngine } from "@/lib/call-engine";
import { useRecordAudit } from "@/lib/audit-log";
import {
  FEATURE_FLAGS,
  FLAG_GROUPS,
  useFeatureFlags,
  type FeatureFlagKey,
} from "@/lib/feature-flags";

export const Route = createFileRoute("/ashnight-control/features")({
  head: () => ({
    meta: [
      { title: "Feature Switches | Ashnight Admin" },
      {
        name: "description",
        content:
          "Turn Ashnight features on or off platform-wide — calls, gifts, bookings, payouts, referrals, notifications and maintenance mode.",
      },
      { property: "og:title", content: "Feature Switches | Ashnight Admin" },
      {
        property: "og:description",
        content: "One screen to enable, disable or stage every Ashnight feature.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFeatures,
});

function AdminFeatures() {
  const { flags, setFlag, reset, loading } = useFeatureFlags();
  const recordAudit = useRecordAudit();
  const { engine, setEngine, loading: engineLoading } = useCallEngine();

  function toggle(key: FeatureFlagKey, next: boolean) {
    void setFlag(key, next);
    if (flags.auditLogging) {
      recordAudit.mutate({
        area: "features",
        action: next ? "enabled" : "disabled",
        target: key,
      });
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Control room</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Feature switches
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Everything Ashnight can enable, disable or tune without a deploy. Switches marked
            "staged" are wired for an upcoming release — flip them on when the surface ships.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            void reset();
            toast("Feature switches reset to Ashnight defaults");
          }}
        >
          <RotateCcw className="size-3.5" /> Reset to defaults
        </Button>
      </header>

      {flags.maintenanceMode ? (
        <Card className="flex items-start gap-3 border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <p className="text-sm">
            Maintenance mode is on — members see a maintenance notice instead of the normal app. The
            control room stays fully available.
          </p>
        </Card>
      ) : null}

      <CallEngineCard
        engine={engine}
        disabled={engineLoading}
        onChange={(next) => {
          void setEngine(next);
          toast(`Calls now use ${next === "webrtc" ? "direct peer-to-peer" : next === "livekit" ? "the LiveKit relay" : "automatic engine selection"}`);
          if (flags.auditLogging) {
            recordAudit.mutate({ area: "features", action: "call-engine", target: next });
          }
        }}
      />

      <CaptchaControlCard
        enabled={flags.captchaOnAuth}
        onToggle={(next) => toggle("captchaOnAuth", next)}
      />

      {FLAG_GROUPS.map((group) => {
        const items = FEATURE_FLAGS.filter((flag) => flag.group === group);
        if (!items.length) return null;
        return (
          <Card key={group} className="border-border/70 bg-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
                <ToggleLeft className="size-4" />
              </span>
              <h2 className="font-display text-base font-semibold">{group}</h2>
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {items.filter((flag) => flags[flag.key]).length}/{items.length} on
              </Badge>
            </div>

            <div className="mt-5 space-y-2.5">
              {items.map((flag) => (
                <div
                  key={flag.key}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{flag.label}</p>
                      {flag.planned ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Staged
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{flag.hint}</p>
                  </div>
                  <Switch
                    checked={flags[flag.key]}
                    disabled={loading}
                    onCheckedChange={(next) => toggle(flag.key, next)}
                    aria-label={flag.label}
                  />
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
