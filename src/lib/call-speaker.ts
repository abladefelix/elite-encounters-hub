/**
 * Loudspeaker / earpiece routing for voice calls.
 *
 * Calls start at normal handset level (like a regular phone call) and only get
 * loud when the member taps the speaker button. Because Android's web view gives
 * us no real routing API, the toggle works in layers — every layer that exists
 * is applied, and the volume layer always exists, so the button is never dead:
 *
 * 1. Output level on the remote audio element — earpiece level vs full level.
 *    Always available, so the button always does something audible.
 * 2. `HTMLMediaElement.setSinkId` — Chrome/Edge desktop + some Android web
 *    views. Picks an output device that looks like a speaker.
 * 3. `navigator.audioSession.type` — iOS 16.4+ WebKit. `"play-and-record"`
 *    routes to the earpiece, `"playback"` to the loudspeaker.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type AudioSessionLike = { type: string };

/** Handset (earpiece-style) level — a normal call, not a loud one. */
const EARPIECE_VOLUME = 0.45;
/** Loudspeaker level. */
const SPEAKER_VOLUME = 1;

function audioSession(): AudioSessionLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  const session = (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession;
  return session && typeof session.type === "string" ? session : undefined;
}

function canSetSinkId(el: HTMLMediaElement | null): el is HTMLMediaElement & {
  setSinkId: (id: string) => Promise<void>;
} {
  return Boolean(el && typeof (el as { setSinkId?: unknown }).setSinkId === "function");
}

/** Finds a device id that represents the loudspeaker, if the browser lists one. */
async function findSpeakerId(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return null;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((device) => device.kind === "audiooutput");
    if (outputs.length === 0) return null;
    const speaker = outputs.find((device) => /speaker|loud/i.test(device.label));
    return speaker?.deviceId ?? outputs.find((d) => d.deviceId === "default")?.deviceId ?? null;
  } catch {
    return null;
  }
}

export interface SpeakerControl {
  /** True when call audio is on the loudspeaker. */
  speakerOn: boolean;
  /** Kept for callers that used to disable the button; always true now. */
  supported: boolean;
  toggleSpeaker: () => void;
}

/**
 * @param audioRef the element playing the remote party's audio
 * @param active enable routing only while a call is up
 */
export function useSpeaker(
  audioRef: React.RefObject<HTMLMediaElement | null>,
  active: boolean,
): SpeakerControl {
  // Start on the earpiece so a call sounds like a normal phone call.
  const [speakerOn, setSpeakerOn] = useState(false);
  const previousSessionType = useRef<string | null>(null);

  // Remember and restore the page's audio session so ending a call doesn't
  // leave every other sound stuck in call routing.
  useEffect(() => {
    const session = audioSession();
    if (!active || !session) return;
    previousSessionType.current = session.type;
    return () => {
      if (previousSessionType.current) {
        try {
          session.type = previousSessionType.current;
        } catch {
          /* noop */
        }
      }
    };
  }, [active]);

  const apply = useCallback(
    async (next: boolean) => {
      const el = audioRef.current;
      // Level first — this is the layer that always works.
      if (el) el.volume = next ? SPEAKER_VOLUME : EARPIECE_VOLUME;

      if (canSetSinkId(el)) {
        const id = next ? await findSpeakerId() : "";
        try {
          await el.setSinkId(id ?? "");
        } catch {
          /* fall through to the audio session attempt */
        }
      }
      const session = audioSession();
      if (session) {
        try {
          // "playback" = loudspeaker, "play-and-record" = earpiece on iOS.
          session.type = next ? "playback" : "play-and-record";
        } catch {
          /* noop */
        }
      }
    },
    [audioRef],
  );

  // Push the current choice whenever the call becomes active or the toggle flips.
  useEffect(() => {
    if (!active) return;
    void apply(speakerOn);
  }, [active, speakerOn, apply]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((current) => !current);
  }, []);

  return { speakerOn, supported: true, toggleSpeaker };
}
