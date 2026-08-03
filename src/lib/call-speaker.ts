/**
 * Loudspeaker / earpiece routing for voice calls.
 *
 * The speaker button used to be decorative. Real routing depends on what the
 * platform actually exposes, so we try each real mechanism in order:
 *
 * 1. `HTMLMediaElement.setSinkId` — Chrome/Edge desktop + Android web view. We
 *    pick an output device whose label looks like a speaker (or the default) and
 *    switch the remote audio element to it.
 * 2. `navigator.audioSession.type` — iOS 16.4+ WebKit. `"play-and-record"`
 *    routes call audio to the earpiece; `"playback"` routes it to the
 *    loudspeaker.
 *
 * When neither exists the OS owns the routing and we report that back so the UI
 * can disable the button instead of pretending it works.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type AudioSessionLike = { type: string };

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
  /** False when the platform gives us no way to move the audio. */
  supported: boolean;
  toggleSpeaker: () => void;
}

/**
 * @param audioRef the element playing the remote party's audio
 * @param activeenable routing only while a call is up
 */
export function useSpeaker(
  audioRef: React.RefObject<HTMLMediaElement | null>,
  active: boolean,
): SpeakerControl {
  const [speakerOn, setSpeakerOn] = useState(true);
  const [supported, setSupported] = useState(false);
  const previousSessionType = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      const hasSession = Boolean(audioSession());
      const hasSink = canSetSinkId(audioRef.current) && Boolean(await findSpeakerId());
      if (!cancelled) setSupported(hasSession || hasSink);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, audioRef]);

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
      // Volume is not routing, but a lower earpiece level matches expectations.
      if (el) el.volume = next ? 1 : 0.8;
    },
    [audioRef],
  );

  // Push the current choice whenever the call becomes active.
  useEffect(() => {
    if (!active) return;
    void apply(speakerOn);
  }, [active, speakerOn, apply]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((current) => !current);
  }, []);

  return { speakerOn, supported, toggleSpeaker };
}
