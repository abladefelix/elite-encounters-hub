import { Link } from "@tanstack/react-router";
import { Sparkle } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-24 hidden border-t border-border/70 bg-surface/50 md:block">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brass text-primary-foreground">
              <Sparkle className="size-3.5" />
            </span>
            <span className="font-display text-base font-semibold">Ashnight</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            A members-only ash services platform. Every specialist and every client is
            manually vetted before onboarding.
          </p>
        </div>

        <FooterColumn
          title="Platform"
          links={[
            { to: "/specialists", label: "Browse specialists" },
            { to: "/rooms", label: "Membership rooms" },
            { to: "/messages", label: "Messages" },
            { to: "/how-it-works", label: "How it works" },
          ]}
        />
        <FooterColumn
          title="Join"
          links={[
            { to: "/apply", label: "Apply as a client" },
            { to: "/apply", label: "Apply as a specialist" },
            { to: "/rooms", label: "Compare rooms" },
          ]}
        />
        <FooterColumn
          title="Your account"
          links={[
            { to: "/profile", label: "Profile & settings" },
            { to: "/messages", label: "Your conversations" },
            { to: "/how-it-works", label: "Escrow & payments" },
          ]}
        />
      </div>
      <div className="border-t border-border/70 px-5 py-6">
        <p className="mx-auto max-w-6xl text-xs text-muted-foreground">
          © {new Date().getFullYear()} Ashnight. Residential and commercial ash services
          only. All bookings, scheduling and payments happen on-platform.
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { to: string; label: string }[];
}) {
  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
