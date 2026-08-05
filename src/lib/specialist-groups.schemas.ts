import { z } from "zod";

const room = z.enum(["basic", "premium", "ultimate", "room4", "room5", "room6", "room7", "room8"]);

export const specialistGroupInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000),
  coverUrl: z.string().trim().max(500).nullable().optional(),
  room,
  pricingModel: z.enum(["flat", "hourly"]),
  baseRate: z.number().int().positive().max(1_000_000),
  capacity: z.number().int().min(1).max(50),
  available: z.boolean(),
  active: z.boolean(),
  members: z.array(z.object({
    specialistId: z.string().uuid(),
    roleLabel: z.string().trim().min(2).max(80),
    isLead: z.boolean(),
    sharePct: z.number().positive().max(100),
  })).min(1).max(50),
  services: z.array(z.object({
    serviceId: z.string().uuid(),
    rate: z.number().int().positive().max(1_000_000),
    minimumHours: z.number().positive().max(48),
  })).min(1).max(100),
});

export const specialistGroupStatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "active", "paused"]),
});

export const specialistGroupDeleteInput = z.object({
  id: z.string().uuid(),
});