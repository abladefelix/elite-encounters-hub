import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireActiveSession } from "@/lib/active-session-middleware";

export const startSpecialistChat = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ specialistId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (data.specialistId === context.userId) {
      throw new Error("You can't message your own profile.");
    }

    const { data: clientRole, error: roleError } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", context.userId)
      .eq("role", "client")
      .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (!clientRole) throw new Error("Only clients can start a specialist chat.");

    const { data: specialist, error: specialistError } = await context.supabase
      .from("specialist_directory")
      .select("id, room")
      .eq("id", data.specialistId)
      .eq("vetting", "approved")
      .eq("suspended", false)
      .maybeSingle();
    if (specialistError) throw new Error(specialistError.message);
    if (!specialist) throw new Error("This specialist is not available in your room.");

    const { data: existing, error: existingError } = await context.supabase
      .from("threads")
      .select("id")
      .eq("client_id", context.userId)
      .eq("specialist_id", specialist.id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return existing;

    const { data: thread, error } = await context.supabase
      .from("threads")
      .insert({
        client_id: context.userId,
        specialist_id: specialist.id,
        room: specialist.room,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return thread;
  });