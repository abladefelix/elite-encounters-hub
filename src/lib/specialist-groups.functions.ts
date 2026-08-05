import { createServerFn } from "@tanstack/react-start";

import { requireActiveSession } from "@/lib/active-session-middleware";
import { specialistGroupDeleteInput, specialistGroupInput, specialistGroupStatusInput } from "@/lib/specialist-groups.schemas";

export const listAdminGroups = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const [{ assertAdminArea }, { listGroupsForAdmin }] = await Promise.all([
      import("./identity.server"),
      import("./specialist-groups.server"),
    ]);
    await assertAdminArea(context.userId, "groups", "read");
    return listGroupsForAdmin();
  });

export const saveSpecialistGroup = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .validator((input) => specialistGroupInput.parse(input))
  .handler(async ({ data, context }) => {
    const [{ assertAdminArea }, { saveGroup }] = await Promise.all([
      import("./identity.server"),
      import("./specialist-groups.server"),
    ]);
    await assertAdminArea(context.userId, "groups");
    return saveGroup({ ...data, actorId: context.userId });
  });

export const changeSpecialistGroupStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .validator((input) => specialistGroupStatusInput.parse(input))
  .handler(async ({ data, context }) => {
    const [{ assertAdminArea }, { setGroupStatus }] = await Promise.all([
      import("./identity.server"),
      import("./specialist-groups.server"),
    ]);
    await assertAdminArea(context.userId, "groups");
    return setGroupStatus(data.id, data.status, context.userId);
  });

export const deleteSpecialistGroup = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .validator((input) => specialistGroupDeleteInput.parse(input))
  .handler(async ({ data, context }) => {
    const [{ assertAdminArea }, { deleteGroup }] = await Promise.all([
      import("./identity.server"),
      import("./specialist-groups.server"),
    ]);
    await assertAdminArea(context.userId, "groups");
    return deleteGroup(data.id, context.userId);
  });