import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Crosshair, Lock, MapPin, Search, SlidersHorizontal, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SpecialistTile } from "@/components/specialist-tile";
import { RosterPagination } from "@/components/roster-pagination";
import { SpecialistRows } from "@/components/specialist-rows";
import { GroupBookingDialog, type BookableGroup } from "@/components/group-booking-dialog";
import { GroupSpecialistTile } from "@/components/group-specialist-tile";
import { useAppearance } from "@/lib/appearance";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServices, useSpecialists, type ProfileRow } from "@/lib/queries";
import { ALL_TIERS, accessibleTiers, tierLabel, type Specialist, type Tier } from "@/lib/types";
import {
  NEAR_ME_RADII,
  coordsOf,
  distanceKm,
  formatDistance,
  requestBrowserLocation,
  type Coords,
} from "@/lib/geo";
import { listBookableGroups } from "@/lib/group-bookings.functions";

export const Route = createFileRoute("/specialists/")({
  head: () => ({
    meta: [
      { title: "Browse Vetted Ash Specialists — Ashnight" },
      {
        name: "description",
        content:
          "Browse Ashnight's manually vetted ash specialists by room, city and service — deep cleans, move-outs, post-renovation and recurring housekeeping.",
      },
      { property: "og:title", content: "Browse Vetted Ash Specialists — Ashnight" },
      {
        property: "og:description",
        content:
          "Manually vetted ash specialists across Basic, Premium and Ultimate rooms. Chat, call and book in one thread.",
      },
    ],
  }),
  component: SpecialistsPage,
});

type SortKey = "rating" | "rate-low" | "rate-high" | "experience" | "distance";
type ResultType = "all" | "specialists" | "groups";

function toSpecialist(profile: ProfileRow, serviceNames: string[]): Specialist {
  return {
    id: profile.id,
    name: profile.display_name || "Ashnight specialist",
    city: profile.city,
    room: profile.room ?? "basic",
    headline: profile.headline,
    bio: profile.bio,
    rating: profile.rating,
    jobsCompleted: profile.jobs_completed,
    hourlyRate: profile.hourly_rate,
    yearsExperience: profile.years_experience,
    services: serviceNames,
    languages: profile.languages,
    verified: profile.verified,
    online: profile.available,
    responseMinutes: profile.response_minutes,
    avatarPath: profile.avatar_url,
  };

}

/** All specialist -> service name links, so listings can filter and badge without N+1 queries. */
function useSpecialistServiceMap() {
  return useQuery({
    queryKey: ["specialist-service-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialist_services")
        .select("specialist_id, services(name)");
      if (error) throw new Error(error.message);
      const map = new Map<string, string[]>();
      for (const row of (data ?? []) as unknown as {
        specialist_id: string;
        services: { name: string } | null;
      }[]) {
        const name = row.services?.name;
        if (!name) continue;
        map.set(row.specialist_id, [...(map.get(row.specialist_id) ?? []), name]);
      }
      return map;
    },
  });
}

function SpecialistsPage() {
  const { user, profile, isSpecialist, isAdmin } = useAuth();
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState<Tier | "all">("all");
  const [service, setService] = useState("all");
  const [sort, setSort] = useState<SortKey>("rating");
  const [availability, setAvailability] = useState<"all" | "online" | "verified">("all");
  const [resultType, setResultType] = useState<ResultType>("all");
  const [selectedGroup, setSelectedGroup] = useState<BookableGroup | null>(null);
  // "Near me": the member's own device position plus the radius they accept.
  const [origin, setOrigin] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [radius, setRadius] = useState<number>(10);
  const teamScroller = useRef<HTMLDivElement>(null);
  const listGroups = useServerFn(listBookableGroups);

  async function locateMe() {
    setLocating(true);
    try {
      const coords = await requestBrowserLocation();
      setOrigin(coords);
      setSort("distance");
      toast.success("Showing specialists closest to you first.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't read your location.");
    } finally {
      setLocating(false);
    }
  }


  // A specialist never browses the roster — they only meet a client once that
  // client opens a thread with them.
  const canBrowse = isAdmin || !isSpecialist;
  // Your room decides which rooms you can see, cumulatively.
  const allowedRooms = useMemo(
    () => (isAdmin ? ALL_TIERS : accessibleTiers(profile?.room)),
    [isAdmin, profile?.room],
  );

  const { data: profiles, isLoading } = useSpecialists(room);
  const { data: serviceMap } = useSpecialistServiceMap();
  const { data: allServices } = useServices();
  const groups = useQuery({
    queryKey: ["bookable-groups", user?.id ?? "anon"],
    enabled: Boolean(user) && canBrowse,
    queryFn: () => listGroups(),
  });

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (groups.data ?? []).filter((group) => {
      const serviceNames = group.specialist_group_services.map((item) => item.services?.name).filter(Boolean);
      const memberNames = group.specialist_group_members.map((member) => member.profiles?.display_name ?? "");
      const matchesRoom = allowedRooms.includes(group.room as Tier) && (room === "all" || group.room === room);
      const matchesQuery = !q || [group.name, group.description, ...memberNames, ...serviceNames].some((value) => value?.toLowerCase().includes(q));
      const matchesService = service === "all" || serviceNames.includes(service);
      return matchesRoom && matchesQuery && matchesService;
    });
  }, [groups.data, query, room, service, allowedRooms]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (profiles ?? []).filter((s) => {
      const matchesRoom = allowedRooms.includes((s.room ?? "basic") as Tier);
      const matchesQuery =
        !q ||
        s.display_name.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.headline.toLowerCase().includes(q);
      const serviceNames = serviceMap?.get(s.id) ?? [];
      const matchesService = service === "all" || serviceNames.includes(service);
      const matchesAvailability =
        availability === "all" ||
        (availability === "online" ? s.available : s.verified);
      return matchesRoom && matchesQuery && matchesService && matchesAvailability;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "rate-low") return a.hourly_rate - b.hourly_rate;
      if (sort === "rate-high") return b.hourly_rate - a.hourly_rate;
      if (sort === "experience") return b.years_experience - a.years_experience;
      return b.rating - a.rating;
    });
  }, [profiles, query, service, sort, serviceMap, allowedRooms, availability]);

  const hasAnySpecialists = (profiles?.length ?? 0) > 0;

  // Layout and page size are admin settings from the control room.
  const { appearance } = useAppearance();
  const rowsLayout = appearance.directoryLayout === "rows";
  const PAGE_SIZE = Math.max(6, appearance.gridPageSize || 24);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));

  // Any filter change (or a shrinking result set) sends you back to page one.
  useEffect(() => {
    setPage(1);
  }, [query, room, service, sort, availability, resultType]);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const mapped = useMemo(
    () => results.map((specialist) => toSpecialist(specialist, serviceMap?.get(specialist.id) ?? [])),
    [results, serviceMap],
  );

  const filtersActive =
    query.trim() !== "" || room !== "all" || service !== "all" || availability !== "all" || resultType !== "all";

  const pageStart = (Math.min(page, pageCount) - 1) * PAGE_SIZE;
  const visible = results.slice(pageStart, pageStart + PAGE_SIZE);

  if (!canBrowse) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto w-full max-w-2xl px-5 py-16">
          <h1 className="font-display text-3xl font-semibold">Specialist workspace</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The specialist directory is for clients. As a specialist you don't browse other
            specialists or clients — a client reaches you first, and the thread appears in your
            messages straight away.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="brass">
              <Link to="/messages">Open messages</Link>
            </Button>
            <Button asChild variant="soft">
              <Link to="/profile">Edit my profile</Link>
            </Button>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }


  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto w-full max-w-6xl px-5 py-12">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Specialists</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Every profile here has cleared ID verification, a background check and reference calls.
          Your room decides who you can book — you can still browse everyone.
        </p>

        <div className="mt-8 grid gap-3 rounded-xl border border-border/70 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, city, specialism"
              className="pl-9"
            />
          </div>

          <Select value={resultType} onValueChange={(value) => setResultType(value as ResultType)}>
            <SelectTrigger>
              <Users className="size-4 text-muted-foreground" />
              <SelectValue placeholder="Listing type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Specialists &amp; Ash groups</SelectItem>
              <SelectItem value="specialists">Specialists only</SelectItem>
              <SelectItem value="groups">Ash groups only</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={availability}
            onValueChange={(value) => setAvailability(value as typeof availability)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Availability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="online">Available now</SelectItem>
              <SelectItem value="verified">Verified only</SelectItem>
            </SelectContent>
          </Select>


          <Select value={room} onValueChange={(value) => setRoom(value as Tier | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="Room" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All my rooms</SelectItem>
              {allowedRooms.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {tierLabel(tier)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={service} onValueChange={setService}>
            <SelectTrigger>
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {(allServices ?? []).map((item) => (
                <SelectItem key={item.id} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
            <SelectTrigger>
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">Highest rated</SelectItem>
              <SelectItem value="experience">Most experienced</SelectItem>
              <SelectItem value="rate-low">Rate: low to high</SelectItem>
              <SelectItem value="rate-high">Rate: high to low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {resultType !== "specialists" && visibleGroups.length > 0 ? <section className="mt-8 border-b border-border/70 pb-8">
          <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Users className="size-4 text-primary" /><h2 className="font-display text-lg font-semibold">Ash groups</h2></div><p className="mt-1 text-xs text-muted-foreground">Admin-assigned crews that work, chat, and receive protected payment as one Ash group.</p></div><div className="hidden gap-1 sm:flex"><Button size="icon" variant="soft" aria-label="Scroll Ash groups left" onClick={() => teamScroller.current?.scrollBy({ left: -500, behavior: "smooth" })}><ChevronLeft className="size-4" /></Button><Button size="icon" variant="soft" aria-label="Scroll Ash groups right" onClick={() => teamScroller.current?.scrollBy({ left: 500, behavior: "smooth" })}><ChevronRight className="size-4" /></Button></div></div>
          <div ref={teamScroller} className="-mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">{visibleGroups.map((group) => <div key={group.id} className="w-36 shrink-0 snap-start sm:w-40"><GroupSpecialistTile group={group} onSelect={() => setSelectedGroup(group)} /></div>)}</div>
        </section> : null}

        {resultType === "groups" ? (
          !groups.isLoading && visibleGroups.length === 0 ? <div className="mt-10 rounded-xl border border-dashed border-border p-12 text-center"><p className="font-display text-lg font-semibold">No Ash groups match</p><p className="mt-2 text-sm text-muted-foreground">Try widening the room or service filters.</p></div> : null
        ) : isLoading ? (
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[4/5] rounded-lg" />
            ))}
          </div>

        ) : (
          <>
            <p className="mt-6 text-xs text-muted-foreground">
              {results.length} specialist{results.length === 1 ? "" : "s"} match your filters
              {!rowsLayout && pageCount > 1
                ? ` · page ${Math.min(page, pageCount)} of ${pageCount}`
                : ""}
            </p>

            {rowsLayout ? (
              <div className="mt-5">
                <SpecialistRows
                  roster={mapped}
                  // Filters and sort stay meaningful in the row layout: the
                  // member's own selection leads, in their chosen order.
                  {...(filtersActive
                    ? { leadRow: { label: "Matching your filters", items: mapped } }
                    : {})}
                />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {visible.map((specialist) => (
                  <SpecialistTile
                    key={specialist.id}
                    specialist={toSpecialist(specialist, serviceMap?.get(specialist.id) ?? [])}
                  />
                ))}
              </div>
            )}

            {rowsLayout ? null : <RosterPagination
              page={Math.min(page, pageCount)}
              pageCount={pageCount}
              total={results.length}
              from={results.length === 0 ? 0 : pageStart + 1}
              to={pageStart + visible.length}
              onPageChange={(next) => {
                setPage(next);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />}




            {results.length === 0 && !hasAnySpecialists ? (
              <div className="mt-10 rounded-xl border border-dashed border-border p-12 text-center">
                {!user ? (
                  <>
                    <Lock className="mx-auto size-8 text-muted-foreground" />
                    <p className="mt-4 font-display text-lg font-semibold">Members-only roster</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Sign in to browse our vetted Ash specialists and book your first clean.
                    </p>
                    <Button asChild variant="brass" className="mt-5">
                      <Link to="/auth">Sign in to browse</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-display text-lg font-semibold">No specialists yet</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      We're still onboarding vetted specialists. Check back soon.
                    </p>
                  </>
                )}
              </div>
            ) : results.length === 0 ? (
              <div className="mt-10 rounded-xl border border-dashed border-border p-12 text-center">
                <p className="font-display text-lg font-semibold">No matches yet</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try widening the room filter or clearing your search.
                </p>
                <Button
                  variant="soft"
                  className="mt-5"
                  onClick={() => {
                    setQuery("");
                    setRoom("all");
                    setService("all");
                    setAvailability("all");
                    setResultType("all");
                  }}
                >
                  Reset filters
                </Button>
              </div>
            ) : null}
          </>
        )}

        <div className="mt-14 rounded-xl border border-primary/25 bg-panel p-6">
          <p className="font-display text-lg font-semibold">
            Want access to the Ultimate room?
          </p>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Ultimate placement is manual. Subscribe, then our team confirms your fit and moves
            your account into the room.
          </p>
          <Button asChild variant="brass" className="mt-5">
            <Link to="/rooms">Compare rooms</Link>
          </Button>
        </div>
      </div>

      <SiteFooter />
      <GroupBookingDialog group={selectedGroup} onClose={() => setSelectedGroup(null)} />
    </div>
  );
}
