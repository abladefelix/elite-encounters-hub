/**
 * Optional two-factor authentication (TOTP) for any Ashnight account.
 *
 * Uses the auth provider's MFA API: enrol an authenticator app, verify the
 * six-digit code, then challenge on demand. Admins can require it per role
 * from the control room; members can add it voluntarily.
 */
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export interface TotpFactor {
  id: string;
  friendlyName: string;
  status: "verified" | "unverified";
}

export interface EnrolmentDraft {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

export function useTwoFactor() {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<EnrolmentDraft | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    setLoading(false);
    if (error) return;
    setFactors(
      (data.totp ?? []).map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name ?? "Authenticator app",
        status: factor.status === "verified" ? "verified" : "unverified",
      })),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enrolled = factors.some((factor) => factor.status === "verified");

  /** Starts enrolment and returns the QR code to scan. */
  const startEnrolment = useCallback(
    async (friendlyName = `Ashnight ${new Date().toISOString().slice(0, 10)}`) => {
      setBusy(true);
      try {
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName,
        });
        if (error) throw new Error(error.message);
        const next: EnrolmentDraft = {
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
          uri: data.totp.uri,
        };
        setDraft(next);
        return next;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  /** Confirms the six-digit code and activates the factor. */
  const confirmEnrolment = useCallback(
    async (code: string) => {
      if (!draft) throw new Error("Start enrolment first");
      setBusy(true);
      try {
        const challenge = await supabase.auth.mfa.challenge({ factorId: draft.factorId });
        if (challenge.error) throw new Error(challenge.error.message);
        const verify = await supabase.auth.mfa.verify({
          factorId: draft.factorId,
          challengeId: challenge.data.id,
          code: code.trim(),
        });
        if (verify.error) throw new Error(verify.error.message);
        setDraft(null);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [draft, refresh],
  );

  /** Removes 2FA from the account. */
  const disable = useCallback(
    async (factorId: string) => {
      setBusy(true);
      try {
        const { error } = await supabase.auth.mfa.unenroll({ factorId });
        if (error) throw new Error(error.message);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const cancelEnrolment = useCallback(async () => {
    if (!draft) return;
    await supabase.auth.mfa.unenroll({ factorId: draft.factorId }).catch(() => undefined);
    setDraft(null);
    await refresh();
  }, [draft, refresh]);

  return {
    factors,
    enrolled,
    loading,
    busy,
    draft,
    refresh,
    startEnrolment,
    confirmEnrolment,
    cancelEnrolment,
    disable,
  };
}

/**
 * Verifies a code against an already-enrolled factor — used when a policy
 * requires a fresh 2FA challenge (for example entering the control room).
 */
export async function challengeAndVerify(factorId: string, code: string) {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw new Error(challenge.error.message);
  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.trim(),
  });
  if (verify.error) throw new Error(verify.error.message);
  return true;
}
