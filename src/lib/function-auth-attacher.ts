import { createMiddleware } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "ashnight:device-id";

export const attachAshnightAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token || typeof window === "undefined") return next();

  let deviceId = window.localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = window.crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, deviceId);
  }

  return next({
    headers: {
      Authorization: `Bearer ${token}`,
      "x-ashnight-device-id": deviceId,
    },
  });
});