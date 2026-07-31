import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SpecialistCard } from "@/components/specialist-card";
import { specialists } from "@/lib/mock-data";
import type { Tier } from "@/lib/types";

export const Route = createFileRoute("/specialists")({
  head: () => ({
    meta: [
      { title: "Browse Vetted Cleaning Specialists — Ashnight" },
      {
        name: "description",
        content:
          "Browse Ashnight's manually vetted cleaning specialists by room, city and service — deep cleans, move-outs, post-renovation and recurring housekeeping.",
      },
      { property: "og:title", content: "Browse Vetted Cleaning Specialists — Ashnight" },
      {
        property: "og:description",
        content:
          "Manually vetted cleaning specialists across Basic, Premium and Ultimate rooms. Chat, call and book in one thread.",
      },
    ],
  }),
  component: SpecialistsPage,
});

type SortKey = "rating" | "rate-low" | "rate-high" | "experience";

function SpecialistsPage() {
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState<Tier | "all">("all");
  const [service, setService] = useState("all");
  const [sort, setSort] = useState<SortKey>("rating");

  const allServices = useMemo(
    () => Array.from(new Set(specialists.flatMap((s) => s.services))).sort(),
    [],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = specialists.filter((s) => {
      const matchesQuery =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.headline.toLowerCase().includes(q);
      const matchesRoom = room === "all" || s.room === room;
      const matchesService = service === "all" || s.services.includes(service);
      return matchesQuery && matchesRoom && matchesService;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "rate-low") return a.hourlyRate - b.hourlyRate;
      if (sort === "rate-high") return b.hourlyRate - a.hourlyRate;
      if (sort === "experience") return b.yearsExperience - a.yearsExperience;
      return b.rating - a.rating;
    });
  }, [query, room, service, sort]);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto w-full max-w-6xl px-5 py-12">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Specialists</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Every profile here has cleared ID verification, a background check and reference calls.
          Your room decides who you can book — you can still browse everyone.
        </p>

        <div className="mt-8 grid gap-3 rounded-xl border border-border/70 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, city, specialism"
              className="pl-9"
            />
          </div>

          <Select value={room} onValueChange={(value) => setRoom(value as Tier | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="Room" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rooms</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="ultimate">Ultimate</SelectItem>
            </SelectContent>
          </Select>

          <Select value={service} onValueChange={setService}>
            <SelectTrigger>
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {allServices.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
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

        <p className="mt-6 text-xs text-muted-foreground">
          {results.length} specialist{results.length === 1 ? "" : "s"} match your filters
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((specialist) => (
            <SpecialistCard key={specialist.id} specialist={specialist} />
          ))}
        </div>

        {results.length === 0 ? (
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
              }}
            >
              Reset filters
            </Button>
          </div>
        ) : null}

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
    </div>
  );
}
