/**
 * Call engine selection.
 *
 * Ashnight can carry a call two ways: through LiveKit's relay infrastructure,
 * or through the built-in direct peer-to-peer WebRTC path. An admin picks which
 * one is used platform-wide from the control room, so reliability can be tested
 * on real devices and rolled back instantly without a deploy.
 *
 * - `auto`    — LiveKit whenever its vault keys are filled, otherwise peer-to-peer.
 * - `livekit` — LiveKit only; falls back to peer-to-peer if keys are missing so
 *               calling never simply stops working.
 * - `webrtc`  — force the direct peer-to-peer engine, ignoring LiveKit keys.
 */
import { useSettingsSection } from "@/lib/platform-settings";

export type CallEngine = "auto" | "livekit" | "webrtc";

export interface CallEngineConfig {
  engine: CallEngine;
}

export const DEFAULT_CALL_ENGINE: CallEngineConfig = { engine: "auto" };

export const CALL_ENGINE_OPTIONS: { value: CallEngine; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Automatic",
    hint: "Use LiveKit when its keys are saved, otherwise the built-in peer-to-peer call.",
  },
  {
    value: "livekit",
    label: "LiveKit relay",
    hint: "Always route calls through LiveKit — most reliable on mobile data and behind firewalls.",
  },
  {
    value: "webrtc",
    label: "Direct peer-to-peer",
    hint: "Force the built-in WebRTC call and ignore LiveKit. Useful for side-by-side testing.",
  },
];

export function isCallEngine(value: unknown): value is CallEngine {
  return value === "auto" || value === "livekit" || value === "webrtc";
}

export function useCallEngine() {
  const { value, save, loading } = useSettingsSection<CallEngineConfig>(
    "calls",
    DEFAULT_CALL_ENGINE,
  );
  const engine = isCallEngine(value.engine) ? value.engine : "auto";

  return {
    engine,
    loading,
    setEngine: async (next: CallEngine) => save({ ...value, engine: next }),
  };
}
