/**
 * Demo-data seeder (server only).
 *
 * Creates a complete, realistic Ashnight dataset — Ghanaian members, rooms,
 * bookings, escrow, documents, chat, moderation hits, complaints, notifications
 * and audit trails — so every screen in the app and the control room has
 * something to show. Everything it writes is recorded in a manifest inside
 * `platform_settings.data.demo`, so "Remove demo data" can undo it exactly
 * without touching a single real member row.
 */
import type { Database } from "@/integrations/supabase/types";

type Tier = Database["public"]["Enums"]["tier"];

export interface DemoManifest {
  seededAt: string;
  userIds: string[];
  serviceIds: string[];
  counts: Record<string, number>;
}

const DEMO_DOMAIN = "demo.ashnight.app";

/** Every seed insert goes through this so a failure never passes silently. */
function must(result: { error: { message: string } | null }, label: string) {
  if (result.error) throw new Error(`Demo seed failed at ${label}: ${result.error.message}`);
}

const DEMO_PASSWORD = "AshnightDemo2026!";

const AVATARS = [
  "/__l5e/assets-v1/994af4e2-abcb-4696-bde0-e08bae5cfcf9/demo-avatar-1.jpg",
  "/__l5e/assets-v1/ab52e2c5-30ef-4468-a094-98d82c81cf21/demo-avatar-2.jpg",
  "/__l5e/assets-v1/0c637572-be09-4349-bd07-6fd5f7b1bd9e/demo-avatar-3.jpg",
  "/__l5e/assets-v1/20b5b692-fdd5-4bbb-8ef3-7cdaebd22d78/demo-avatar-4.jpg",
  "/__l5e/assets-v1/58b61231-b29a-4fe5-b6f0-a7b5f900f319/demo-avatar-5.jpg",
  "/__l5e/assets-v1/e530b0e6-fe35-40fc-b483-de66f4849bf9/demo-avatar-6.jpg",
  "/__l5e/assets-v1/873c2da6-5d80-44b0-a2a8-7fc36d60716e/demo-avatar-7.jpg",
  "/__l5e/assets-v1/363f4e6b-6dbd-4d93-9988-32f1177068d9/demo-avatar-8.jpg",
];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

/* ------------------------------------------------------------------ people */

interface SpecialistSeed {
  username: string;
  name: string;
  city: string;
  locality: string;
  headline: string;
  bio: string;
  room: Tier;
  rate: number;
  years: number;
  rating: number;
  jobs: number;
  languages: string[];
  likes: string[];
  dislikes: string[];
  avatar: string;
  phone: string;
  card: string;
}

const SPECIALISTS: SpecialistSeed[] = [
  {
    username: "akua.mensah",
    name: "Akua Mensah",
    city: "Accra",
    locality: "East Legon",
    headline: "Deep-ash lead for family homes and short-lets",
    bio: "Nine years running detail-first deep ash visits across East Legon and Cantonments. Eco products by default and photo handover after every visit.",
    room: "ultimate",
    rate: 180,
    years: 9,
    rating: 4.97,
    jobs: 412,
    languages: ["English", "Twi"],
    likes: ["Early starts", "Checklists", "Eco products"],
    dislikes: ["Last-minute cancellations"],
    avatar: AVATARS[0]!,
    phone: "0244010101",
    card: "GHA-700100101-1",
  },
  {
    username: "yaa.boateng",
    name: "Yaa Boateng",
    city: "Kumasi",
    locality: "Ahodwo",
    headline: "Kitchens and bathrooms specialist, same-week slots",
    bio: "Former hotel housekeeping supervisor in Kumasi. Fast without cutting corners, and hard-water stains are my favourite challenge.",
    room: "premium",
    rate: 120,
    years: 6,
    rating: 4.91,
    jobs: 268,
    languages: ["English", "Twi", "Ga"],
    likes: ["Deep scrubs", "Repeat clients"],
    dislikes: ["Unclear briefs"],
    avatar: AVATARS[1]!,
    phone: "0244020202",
    card: "GHA-700200202-2",
  },
  {
    username: "adjoa.tetteh",
    name: "Adjoa Tetteh",
    city: "Tema",
    locality: "Community 25",
    headline: "Recurring weekly upkeep for busy households",
    bio: "I keep homes steady week to week — laundry, linens, floors and a tidy reset a family can actually maintain.",
    room: "premium",
    rate: 95,
    years: 7,
    rating: 4.88,
    jobs: 331,
    languages: ["English", "Ewe"],
    likes: ["Recurring schedules", "Organising"],
    dislikes: ["Pets left unattended"],
    avatar: AVATARS[2]!,
    phone: "0244030303",
    card: "GHA-700300303-3",
  },
  {
    username: "esi.appiah",
    name: "Esi Appiah",
    city: "Takoradi",
    locality: "Airport Ridge",
    headline: "Move-in and move-out turnarounds",
    bio: "Empty-unit specialist. Cabinets, baseboards and appliance interiors — the things landlords actually inspect.",
    room: "basic",
    rate: 70,
    years: 4,
    rating: 4.79,
    jobs: 154,
    languages: ["English", "Fante"],
    likes: ["Evening work", "Empty units"],
    dislikes: ["Rushed inspections"],
    avatar: AVATARS[3]!,
    phone: "0244040404",
    card: "GHA-700400404-4",
  },
];

interface ClientSeed {
  username: string;
  name: string;
  city: string;
  locality: string;
  room: Tier;
  avatar: string;
  phone: string;
  card: string;
  address: string;
}

const CLIENTS: ClientSeed[] = [
  {
    username: "kwame.asante",
    name: "Kwame Asante",
    city: "Accra",
    locality: "Cantonments",
    room: "ultimate",
    avatar: AVATARS[4]!,
    phone: "0201010101",
    card: "GHA-800100101-1",
    address: "12 Volta Street, Cantonments",
  },
  {
    username: "kofi.owusu",
    name: "Kofi Owusu",
    city: "Accra",
    locality: "Osu",
    room: "premium",
    avatar: AVATARS[5]!,
    phone: "0201020202",
    card: "GHA-800200202-2",
    address: "4 Oxford Street, Osu",
  },
  {
    username: "yaw.darko",
    name: "Yaw Darko",
    city: "Kumasi",
    locality: "Nhyiaeso",
    room: "premium",
    avatar: AVATARS[6]!,
    phone: "0201030303",
    card: "GHA-800300303-3",
    address: "9 Lake Road, Nhyiaeso",
  },
  {
    username: "nii.quartey",
    name: "Nii Quartey",
    city: "Tema",
    locality: "Community 11",
    room: "basic",
    avatar: AVATARS[7]!,
    phone: "0201040404",
    card: "GHA-800400404-4",
    address: "27 Harbour Close, Community 11",
  },
];

const SERVICES = [
  { name: "Standard ash visit", category: "Routine", base_rate: 70, description: "A two-to-three hour reset of living areas, kitchen and bathrooms." },
  { name: "Deep ash", category: "Deep", base_rate: 140, description: "Full-property deep clean including oven, fridge and skirting." },
  { name: "Move-in / move-out", category: "Turnaround", base_rate: 150, description: "Empty-unit turnaround built around landlord inspections." },
  { name: "Post-renovation ash", category: "Specialist", base_rate: 180, description: "Dust extraction and multi-pass wipe-down after contractors." },
  { name: "Housekeeping visit", category: "Routine", base_rate: 110, description: "Occupied-home housekeeping with laundry and linen change." },
  { name: "Recurring weekly upkeep", category: "Recurring", base_rate: 90, description: "Same specialist every week on a fixed schedule." },
];

/* --------------------------------------------------------------- manifest */

async function readManifest(): Promise<DemoManifest | null> {
  const client = await admin();
  const { data } = await client
    .from("platform_settings")
    .select("data")
    .eq("id", true)
    .maybeSingle();
  const blob = (data?.data ?? {}) as Record<string, unknown>;
  return (blob["demo"] as DemoManifest | undefined) ?? null;
}

async function writeManifest(manifest: DemoManifest | null) {
  const client = await admin();
  const { data } = await client
    .from("platform_settings")
    .select("data")
    .eq("id", true)
    .maybeSingle();
  const blob = { ...((data?.data ?? {}) as Record<string, unknown>) };
  if (manifest) blob["demo"] = manifest;
  else delete blob["demo"];
  await client
    .from("platform_settings")
    .upsert({ id: true, data: blob as never }, { onConflict: "id" });
}

export async function demoStatus() {
  const manifest = await readManifest();
  return {
    seeded: Boolean(manifest),
    seededAt: manifest?.seededAt ?? null,
    counts: manifest?.counts ?? {},
    password: manifest ? DEMO_PASSWORD : null,
    domain: DEMO_DOMAIN,
  };
}

/* ----------------------------------------------------------------- seeding */

async function ensureUser(
  email: string,
  meta: Record<string, unknown>,
): Promise<string> {
  const client = await admin();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { ...meta, demo: true },
  });
  if (data?.user) return data.user.id;

  // Already there from an earlier run — find it instead of failing the seed.
  for (let page = 1; page <= 20; page += 1) {
    const list = await client.auth.admin.listUsers({ page, perPage: 200 });
    const hit = list.data?.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if ((list.data?.users.length ?? 0) < 200) break;
  }
  throw new Error(error?.message ?? `Could not create demo user ${email}`);
}

export async function seedDemoData(actorId: string, actorLabel: string) {
  // Always clear first — even a half-finished earlier run leaves demo accounts
  // behind, and clearDemoData finds them by their demo email domain.
  await clearDemoData(actorId, actorLabel, { silent: true });


  const client = await admin();
  const counts: Record<string, number> = {};

  /* services */
  const { data: serviceRows, error: serviceError } = await client
    .from("services")
    .insert(
      SERVICES.map((service, index) => ({
        ...service,
        active: true,
        sort_order: index + 1,
      })),
    )
    .select("id, name");
  if (serviceError) throw new Error(serviceError.message);
  const serviceIds = (serviceRows ?? []).map((row) => row.id);
  counts["services"] = serviceIds.length;

  /* specialists */
  const specialistIds: string[] = [];
  for (const person of SPECIALISTS) {
    const id = await ensureUser(`${person.username}@${DEMO_DOMAIN}`, {
      display_name: person.name,
      username: person.username,
      role: "specialist",
    });
    specialistIds.push(id);
    must(await client.from("profiles").upsert(
      {
        id,
        display_name: person.name,
        username: person.username,
        city: person.city,
        locality: person.locality,
        address: `${person.locality}, ${person.city}`,
        headline: person.headline,
        bio: person.bio,
        avatar_url: person.avatar,
        phone: person.phone,
        room: person.room,
        vetting: "approved",
        verified: true,
        available: true,
        suspended: false,
        account_status: "active",
        rating: person.rating,
        jobs_completed: person.jobs,
        hourly_rate: person.rate,
        years_experience: person.years,
        response_minutes: 6,
        languages: person.languages,
        likes: person.likes,
        dislikes: person.dislikes,
        ghana_card_number: person.card,
        ghana_card_expiry: "2031-06-30",
        terms_accepted_at: hoursAgo(900),
        privacy_accepted_at: hoursAgo(900),
        last_seen_at: hoursAgo(1),
        extra: { demo: true } as never,
      },
      { onConflict: "id" },
    ), "profiles");
    await client
      .from("user_roles")
      .upsert({ user_id: id, role: "specialist" }, { onConflict: "user_id,role" });
  }
  counts["specialists"] = specialistIds.length;

  /* clients */
  const clientIds: string[] = [];
  for (const person of CLIENTS) {
    const id = await ensureUser(`${person.username}@${DEMO_DOMAIN}`, {
      display_name: person.name,
      username: person.username,
      role: "client",
    });
    clientIds.push(id);
    must(await client.from("profiles").upsert(
      {
        id,
        display_name: person.name,
        username: person.username,
        city: person.city,
        locality: person.locality,
        address: person.address,
        headline: "",
        bio: "",
        avatar_url: person.avatar,
        phone: person.phone,
        room: person.room,
        vetting: "approved",
        verified: true,
        suspended: false,
        account_status: "active",
        ghana_card_number: person.card,
        ghana_card_expiry: "2030-09-30",
        terms_accepted_at: hoursAgo(800),
        privacy_accepted_at: hoursAgo(800),
        last_seen_at: hoursAgo(3),
        extra: { demo: true } as never,
      },
      { onConflict: "id" },
    ), "profiles");
    await client
      .from("user_roles")
      .upsert({ user_id: id, role: "client" }, { onConflict: "user_id,role" });
    must(await client.from("memberships").insert({
      user_id: id,
      room: person.room,
      status: person.username === "nii.quartey" ? "past_due" : "active",
      amount: person.room === "ultimate" ? 1890 : person.room === "premium" ? 790 : 290,
      paystack_reference: `demo-mem-${person.username}`,
      current_period_end: daysAhead(18),
    }), "memberships");
  }
  counts["clients"] = clientIds.length;
  counts["memberships"] = clientIds.length;

  /* specialist ↔ service links */
  const links = specialistIds.flatMap((specialistId, index) =>
    serviceIds
      .filter((_, serviceIndex) => (serviceIndex + index) % 2 === 0)
      .map((serviceId) => ({ specialist_id: specialistId, service_id: serviceId })),
  );
  must(await client.from("specialist_services").insert(links), "specialist_services");
  counts["specialist_services"] = links.length;

  /* vetting queue */
  const applications = [
    {
      full_name: "Abena Sarpong",
      email: `abena.sarpong@${DEMO_DOMAIN}`,
      phone: "0244050505",
      city: "Accra",
      applied_role: "specialist" as const,
      pitch: "Six years hotel housekeeping in Airport City. Available weekdays.",
      years_experience: 6,
      id_verified: true,
      background_check: "clear" as const,
      reference_checks: 3,
      suggested_room: "premium" as Tier,
      status: "in_review" as const,
      admin_note: "Strong references. Confirm weekend availability.",
    },
    {
      full_name: "Comfort Anaba",
      email: `comfort.anaba@${DEMO_DOMAIN}`,
      phone: "0244060606",
      city: "Tamale",
      applied_role: "specialist" as const,
      pitch: "Two years private household ash work, looking to go full time.",
      years_experience: 2,
      id_verified: true,
      background_check: "pending" as const,
      reference_checks: 1,
      suggested_room: "basic" as Tier,
      status: "pending" as const,
      admin_note: "Awaiting second reference.",
    },
    {
      full_name: "Samuel Ofori",
      email: `samuel.ofori@${DEMO_DOMAIN}`,
      phone: "0201050505",
      city: "Accra",
      applied_role: "client" as const,
      pitch: "Four-bedroom house in Airport Hills, want a recurring crew.",
      years_experience: 0,
      id_verified: true,
      background_check: "clear" as const,
      reference_checks: 0,
      suggested_room: "ultimate" as Tier,
      status: "pending" as const,
      admin_note: "Ultimate deposit paid.",
    },
    {
      full_name: "Ibrahim Fuseini",
      email: `ibrahim.fuseini@${DEMO_DOMAIN}`,
      phone: "0201060606",
      city: "Kumasi",
      applied_role: "client" as const,
      pitch: "Two-bedroom flat, monthly deep ash.",
      years_experience: 0,
      id_verified: false,
      background_check: "flagged" as const,
      reference_checks: 0,
      suggested_room: "basic" as Tier,
      status: "rejected" as const,
      admin_note: "Ghana Card upload unreadable and check flagged.",
    },
  ];
  must(await client.from("applications").insert(applications), "applications");
  counts["applications"] = applications.length;

  /* threads */
  const pairs: { client: number; specialist: number; room: Tier; exempt: boolean }[] = [
    { client: 0, specialist: 0, room: "ultimate", exempt: false },
    { client: 1, specialist: 1, room: "premium", exempt: false },
    { client: 2, specialist: 2, room: "premium", exempt: true },
    { client: 3, specialist: 3, room: "basic", exempt: false },
  ];
  const { data: threadRows, error: threadError } = await client
    .from("threads")
    .insert(
      pairs.map((pair, index) => ({
        client_id: clientIds[pair.client]!,
        specialist_id: specialistIds[pair.specialist]!,
        room: pair.room,
        contact_exempt: pair.exempt,
        last_message: "Booking confirmed — see you then.",
        last_message_at: hoursAgo(index + 1),
        client_last_read_at: hoursAgo(index + 1),
        specialist_last_read_at: hoursAgo(index + 4),
      })),
    )
    .select("id, client_id, specialist_id");
  if (threadError) throw new Error(threadError.message);
  const threads = threadRows ?? [];
  counts["threads"] = threads.length;

  /* bookings */
  const bookingSeeds = [
    { thread: 0, service: 1, status: "completed" as const, hours: 6, rate: 180, addons: ["Window detail"], when: hoursAgo(72) },
    { thread: 1, service: 0, status: "paid" as const, hours: 3, rate: 120, addons: [], when: daysAhead(2) },
    { thread: 2, service: 5, status: "accepted" as const, hours: 4, rate: 95, addons: ["Laundry & linens"], when: daysAhead(4) },
    { thread: 3, service: 2, status: "requested" as const, hours: 5, rate: 70, addons: ["Inside cabinets"], when: daysAhead(6) },
    { thread: 0, service: 3, status: "disputed" as const, hours: 5, rate: 180, addons: [], when: hoursAgo(200) },
  ];
  const { data: bookingRows, error: bookingError } = await client
    .from("bookings")
    .insert(
      bookingSeeds.map((seed) => {
        const thread = threads[seed.thread]!;
        return {
          thread_id: thread.id,
          client_id: thread.client_id,
          specialist_id: thread.specialist_id,
          service_id: serviceIds[seed.service]!,
          service_name: SERVICES[seed.service]!.name,
          scheduled_for: seed.when,
          hours: seed.hours,
          rate: seed.rate,
          addons: seed.addons,
          notes: "Gate code shared on arrival.",
          platform_fee_pct: 12,
          status: seed.status,
        };
      }),
    )
    .select("id, thread_id, client_id, specialist_id, rate, hours, service_name, status");
  if (bookingError) throw new Error(bookingError.message);
  const bookings = bookingRows ?? [];
  counts["bookings"] = bookings.length;

  /* escrow ledger */
  const escrowSeeds = bookings.map((booking, index) => {
    const amount = Math.round(Number(booking.rate) * Number(booking.hours));
    const fee = Math.round(amount * 0.12);
    const state =
      booking.status === "completed"
        ? ("released" as const)
        : booking.status === "paid"
          ? ("held" as const)
          : booking.status === "disputed"
            ? ("disputed" as const)
            : ("pending" as const);
    return {
      kind: "booking" as const,
      thread_id: booking.thread_id,
      booking_id: booking.id,
      client_id: booking.client_id,
      specialist_id: booking.specialist_id,
      label: booking.service_name,
      amount,
      platform_fee: fee,
      payout_amount: amount - fee,
      state,
      hold_hours: 48,
      paystack_reference: state === "pending" ? null : `demo-bk-${index + 1}`,
      paid_at: state === "pending" ? null : hoursAgo(60 - index * 4),
      release_at: state === "pending" ? null : daysAhead(1),
      released_at: state === "released" ? hoursAgo(10) : null,
      dispute_reason: state === "disputed" ? "Client says two rooms were skipped." : null,
      disputed_at: state === "disputed" ? hoursAgo(20) : null,
      admin_note: state === "disputed" ? "Awaiting photo evidence from both sides." : "",
    };
  });
  const giftSeeds = [
    {
      kind: "gift" as const,
      thread_id: threads[0]!.id,
      client_id: threads[0]!.client_id,
      specialist_id: threads[0]!.specialist_id,
      label: "Brass rose",
      gift_key: "rose",
      amount: 50,
      platform_fee: 6,
      payout_amount: 44,
      state: "released" as const,
      hold_hours: 24,
      paystack_reference: "demo-gift-1",
      paid_at: hoursAgo(30),
      released_at: hoursAgo(4),
      admin_note: "",
    },
    {
      kind: "gift" as const,
      thread_id: threads[1]!.id,
      client_id: threads[1]!.client_id,
      specialist_id: threads[1]!.specialist_id,
      label: "Midnight crown",
      gift_key: "crown",
      amount: 200,
      platform_fee: 24,
      payout_amount: 176,
      state: "held" as const,
      hold_hours: 24,
      paystack_reference: "demo-gift-2",
      paid_at: hoursAgo(6),
      release_at: daysAhead(1),
      admin_note: "",
    },
  ];
  const { data: escrowRows, error: escrowError } = await client
    .from("escrow_entries")
    .insert([...escrowSeeds, ...giftSeeds])
    .select("id, client_id, specialist_id, booking_id, amount, platform_fee, label, state");
  if (escrowError) throw new Error(escrowError.message);
  const escrow = escrowRows ?? [];
  counts["escrow_entries"] = escrow.length;

  /* invoices & receipts */
  const documents = escrow.slice(0, 3).map((entry, index) => ({
    number: `ASH-${new Date().getFullYear()}-${String(1000 + index)}`,
    kind: (entry.state === "released" ? "receipt" : "invoice") as "receipt" | "invoice",
    client_id: entry.client_id,
    specialist_id: entry.specialist_id,
    booking_id: entry.booking_id,
    escrow_id: entry.id,
    title: entry.label,
    currency: "GHS",
    subtotal: entry.amount,
    platform_fee: entry.platform_fee,
    total: entry.amount,
    line_items: [
      { label: entry.label, amount: entry.amount },
      { label: "Platform fee (12%)", amount: entry.platform_fee },
    ] as never,
    paystack_reference: `demo-doc-${index + 1}`,
    paid_at: entry.state === "released" ? hoursAgo(9) : null,
    notes: "Demo document generated by the control room.",
  }));
  must(await client.from("documents").insert(documents), "documents");
  counts["documents"] = documents.length;

  /* chat */
  const messageSeeds: {
    thread_id: string;
    author_id: string | null;
    body: string;
    kind: Database["public"]["Enums"]["message_kind"];
    created_at: string;
    redacted?: boolean;
  }[] = [];
  threads.forEach((thread, index) => {
    const base = 40 - index * 6;
    messageSeeds.push(
      {
        thread_id: thread.id,
        author_id: null,
        body: "You're both verified Ashnight members. Payments, scheduling and payouts stay on the platform.",
        kind: "system",
        created_at: hoursAgo(base),
      },
      {
        thread_id: thread.id,
        author_id: thread.client_id,
        body: "Hello — three bedrooms and two bathrooms. I need a full deep ash before family arrive next week.",
        kind: "text",
        created_at: hoursAgo(base - 1),
      },
      {
        thread_id: thread.id,
        author_id: thread.specialist_id,
        body: "Happy to take it. For that size I'd plan five hours, including inside the oven and fridge.",
        kind: "text",
        created_at: hoursAgo(base - 2),
      },
      {
        thread_id: thread.id,
        author_id: thread.client_id,
        body: "Perfect. Can you add the balcony windows too?",
        kind: "text",
        created_at: hoursAgo(base - 3),
      },
      {
        thread_id: thread.id,
        author_id: thread.specialist_id,
        body: "Yes — I'll add window detail. Send the request and I'll confirm the slot.",
        kind: "text",
        created_at: hoursAgo(base - 4),
      },
      {
        thread_id: thread.id,
        author_id: thread.client_id,
        body: "Sent. Reach me on [hidden] if anything changes.",
        kind: "text",
        created_at: hoursAgo(base - 5),
        redacted: true,
      },
      {
        thread_id: thread.id,
        author_id: thread.specialist_id,
        body: "Booking confirmed — see you then.",
        kind: "text",
        created_at: hoursAgo(index + 1),
      },
    );
  });
  // Batched inserts share one column list, so every row states `redacted`.
  must(
    await client
      .from("messages")
      .insert(messageSeeds.map((m) => ({ ...m, redacted: m.redacted ?? false }))),
    "messages",
  );

  counts["messages"] = messageSeeds.length;

  /* ratings */
  const ratings = threads.slice(0, 3).map((thread, index) => ({
    thread_id: thread.id,
    rater_id: thread.client_id,
    rated_id: thread.specialist_id,
    stars: 5 - index,
    tags: ["On time", "Thorough"],
    note: index === 0 ? "Spotless work and a clear handover." : "Good visit, would book again.",
  }));
  must(await client.from("ratings").insert(ratings), "ratings");
  counts["ratings"] = ratings.length;

  /* moderation, reports, complaints */
  const hits = [
    {
      thread_id: threads[0]!.id,
      author_id: threads[0]!.client_id,
      original_body: "Call me on 024 401 0101 so we can settle off the app.",
      categories: ["phone", "contact"],
      terms: [],
      action: "block",
      reviewed: false,
    },
    {
      thread_id: threads[1]!.id,
      author_id: threads[1]!.specialist_id,
      original_body: "Add me on WhatsApp and we can arrange directly.",
      categories: ["contact"],
      terms: [],
      action: "mask",
      reviewed: true,
    },
  ];
  must(await client.from("moderation_hits").insert(hits), "moderation_hits");
  counts["moderation_hits"] = hits.length;

  const reports = [
    {
      thread_id: threads[3]!.id,
      reporter_id: threads[3]!.client_id,
      reported_id: threads[3]!.specialist_id,
      reason: "Pressured to pay outside the platform",
      notes: "Asked for mobile money transfer instead of in-chat payment.",
      blocked: false,
      excerpt: "Just send the money by MoMo, it is faster.",
      state: "open" as const,
      admin_note: "",
    },
  ];
  must(await client.from("reports").insert(reports), "reports");
  counts["reports"] = reports.length;

  const complaints = [
    {
      user_id: clientIds[0]!,
      contact_email: `${CLIENTS[0]!.username}@${DEMO_DOMAIN}`,
      category: "booking",
      subject: "Two rooms were skipped on my deep ash",
      body: "The upstairs bedrooms were not touched. I have photos and would like a partial refund from escrow.",
      thread_id: threads[0]!.id,
      booking_id: bookings[4]!.id,
      state: "reviewing" as const,
      admin_note: "Escrow held pending evidence.",
      resolution: "",
    },
    {
      user_id: clientIds[3]!,
      contact_email: `${CLIENTS[3]!.username}@${DEMO_DOMAIN}`,
      category: "billing",
      subject: "Membership charged twice",
      body: "My Basic room membership was debited twice in July.",
      state: "resolved" as const,
      admin_note: "Duplicate Paystack charge.",
      resolution: "One charge refunded on 28 July.",
    },
  ];
  must(await client.from("complaints").insert(complaints), "complaints");
  counts["complaints"] = complaints.length;

  /* notifications */
  const notifications = [...clientIds, ...specialistIds].map((userId, index) => ({
    user_id: userId,
    title: index % 2 === 0 ? "Welcome to Ashnight" : "Escrow released",
    body:
      index % 2 === 0
        ? "Your account is vetted and active. Open Messages to reach your matched specialists."
        : "A payout has cleared its hold window and is on its way to you.",
    kind: index % 2 === 0 ? "welcome" : "escrow",
    link: index % 2 === 0 ? "/specialists" : "/support",
    read_at: index > 4 ? hoursAgo(2) : null,
  }));
  must(await client.from("notifications").insert(notifications), "notifications");
  counts["notifications"] = notifications.length;

  /* trails */
  const activity = [
    { area: "accounts", event: "demo_seed", severity: "info", target: "demo dataset" },
    { area: "payments", event: "escrow_released", severity: "info", target: "demo-bk-1" },
    { area: "moderation", event: "message_blocked", severity: "warn", target: "phone number" },
  ].map((row) => ({
    ...row,
    actor_id: actorId,
    actor_label: actorLabel,
    ip: "",
    user_agent: "",
    details: { demo: true } as never,
  }));
  must(await client.from("activity_log").insert(activity), "activity_log");
  counts["activity_log"] = activity.length;

  must(await client.from("admin_audit_log").insert({
    actor_id: actorId,
    area: "demo",
    action: "seed_demo_data",
    target: "platform",
    note: "Populated the demo dataset across every module.",
    details: counts as never,
  }), "admin_audit_log");

  const manifest: DemoManifest = {
    seededAt: new Date().toISOString(),
    userIds: [...specialistIds, ...clientIds],
    serviceIds,
    counts,
  };
  await writeManifest(manifest);
  return manifest;
}

/* ---------------------------------------------------------------- clearing */

export async function clearDemoData(
  actorId: string,
  actorLabel: string,
  options: { silent?: boolean } = {},
) {
  const manifest = await readManifest();
  const client = await admin();

  // Demo accounts are identified by their email domain as well as the manifest,
  // so an interrupted seed still gets cleaned up completely.
  const found = new Set(manifest?.userIds ?? []);
  for (let page = 1; page <= 20; page += 1) {
    const list = await client.auth.admin.listUsers({ page, perPage: 200 });
    const users = list.data?.users ?? [];
    users
      .filter((u) => (u.email ?? "").toLowerCase().endsWith(`@${DEMO_DOMAIN}`))
      .forEach((u) => found.add(u.id));
    if (users.length < 200) break;
  }
  const userIds = [...found];


  if (userIds.length) {
    const both = (table: "threads" | "bookings" | "escrow_entries") =>
      client.from(table).delete().in("client_id", userIds);

    // Threads carry system messages with no author, so clear by thread first.
    const { data: demoThreads } = await client
      .from("threads")
      .select("id")
      .in("client_id", userIds);
    const threadIds = (demoThreads ?? []).map((t) => t.id);

    await client.from("documents").delete().in("client_id", userIds);
    await client.from("ratings").delete().in("rater_id", userIds);
    await client.from("moderation_hits").delete().in("author_id", userIds);
    await client.from("reports").delete().in("reporter_id", userIds);
    await client.from("complaints").delete().in("user_id", userIds);
    await client.from("notifications").delete().in("user_id", userIds);
    if (threadIds.length) {
      await client.from("moderation_hits").delete().in("thread_id", threadIds);
      await client.from("messages").delete().in("thread_id", threadIds);
    }
    await client.from("messages").delete().in("author_id", userIds);
    await both("escrow_entries");
    await both("bookings");
    await both("threads");

    await client.from("specialist_services").delete().in("specialist_id", userIds);
    await client.from("memberships").delete().in("user_id", userIds);
    await client.from("user_roles").delete().in("user_id", userIds);
    await client.from("activity_log").delete().in("actor_id", userIds);
    await client.from("profiles").delete().in("id", userIds);
    for (const id of userIds) {
      await client.auth.admin.deleteUser(id);
    }
  }

  await client.from("applications").delete().like("email", `%@${DEMO_DOMAIN}`);
  if (manifest?.serviceIds?.length) {
    await client.from("services").delete().in("id", manifest.serviceIds);
  }
  await client.from("activity_log").delete().eq("event", "demo_seed");

  await writeManifest(null);

  if (!options.silent) {
    await client.from("admin_audit_log").insert({
      actor_id: actorId,
      area: "demo",
      action: "clear_demo_data",
      target: "platform",
      note: "Removed every demo member and demo record.",
      details: { users: userIds.length } as never,
    });
  }
  return { removedUsers: userIds.length };
}
