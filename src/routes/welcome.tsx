/**
 * Public tour of Ashnight. "/" is the sign-in page, so the marketing landing
 * lives here and is linked from the sign-in screen and the footer.
 */
import { createFileRoute } from "@tanstack/react-router";

import { Home } from "@/routes/index";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to Ashnight | Vetted Ash Specialists in Ghana" },
      {
        name: "description",
        content:
          "See how Ashnight works: manually vetted ash specialists, room memberships, escrow-protected payments and moderated in-app chat.",
      },
      { property: "og:title", content: "Welcome to Ashnight" },
      {
        property: "og:description",
        content: "Vetted ash specialists, escrow-protected bookings and moderated chat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});
