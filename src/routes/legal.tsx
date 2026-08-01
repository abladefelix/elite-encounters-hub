import { createFileRoute } from "@tanstack/react-router";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import { useSignupConfig } from "@/lib/signup-fields";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Terms & Privacy Policy | Ashnight" },
      {
        name: "description",
        content:
          "Read the Ashnight terms of service and privacy policy covering membership, escrow payments, on-platform messaging and how member data is used.",
      },
      { property: "og:title", content: "Terms & Privacy Policy | Ashnight" },
      {
        property: "og:description",
        content: "How Ashnight membership, escrow payments and member data are handled.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LegalPage,
});

function LegalPage() {
  const { config } = useSignupConfig();
  const { legal } = config;

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="eyebrow text-muted-foreground">Ashnight</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          Terms & privacy
        </h1>

        <section id="terms" className="mt-8">
          <Card className="p-6">
            <h2 className="font-display text-xl font-semibold">{legal.termsTitle}</h2>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {legal.termsBody}
            </div>
            {legal.termsUrl ? (
              <a
                href={legal.termsUrl}
                className="mt-4 inline-block text-sm underline underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                Read the full document
              </a>
            ) : null}
          </Card>
        </section>

        <section id="privacy" className="mt-6">
          <Card className="p-6">
            <h2 className="font-display text-xl font-semibold">{legal.privacyTitle}</h2>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {legal.privacyBody}
            </div>
            {legal.privacyUrl ? (
              <a
                href={legal.privacyUrl}
                className="mt-4 inline-block text-sm underline underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                Read the full document
              </a>
            ) : null}
          </Card>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
