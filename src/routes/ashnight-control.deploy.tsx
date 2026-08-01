/**
 * Control room → Deploy.
 *
 * Shows what GitHub has, what the live server runs, and gives the admin one
 * manual Sync button. Nothing deploys on its own.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, GitBranch, Loader2, RefreshCw, Rocket, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDeployStatus, syncFromGithub } from "@/lib/deploy.functions";
import { relativeTime } from "@/lib/escrow";

export const Route = createFileRoute("/ashnight-control/deploy")({
  head: () => ({
    meta: [
      { title: "Deploy & GitHub Sync | Ashnight Admin" },
      {
        name: "description",
        content:
          "Compare the Ashnight GitHub repository with the running site and push the latest commit live with one manual sync.",
      },
      { property: "og:title", content: "Deploy & GitHub Sync | Ashnight Admin" },
      { property: "og:description", content: "Manual, audited deployments for Ashnight." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDeploy,
});

function AdminDeploy() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["deploy-status"],
    queryFn: () => getDeployStatus(),
    refetchOnWindowFocus: false,
  });

  const sync = useMutation({
    mutationFn: () => syncFromGithub(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(`Synced ${result.commit.slice(0, 7)} to the live site.`);
      } else {
        toast.error("The deploy hook refused the request.", { description: result.detail });
      }
      void queryClient.invalidateQueries({ queryKey: ["deploy-status"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const status = statusQuery.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Deploy</h1>
        <p className="text-sm text-muted-foreground">
          Ashnight never deploys itself. Review the commits below, then press Sync to run the
          deploy hook on your server.
        </p>
      </header>

      {statusQuery.isLoading ? (
        <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking GitHub…
        </Card>
      ) : null}

      {status && !status.configured ? (
        <Card className="p-5 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4 text-amber-500" /> Not connected yet
          </div>
          <p className="mt-2 text-muted-foreground">
            Add these entries in <strong>Keys &amp; security</strong>: <code>github_repo</code>{" "}
            (owner/repository), <code>github_branch</code> (defaults to main),{" "}
            <code>github_token</code> for private repositories, plus{" "}
            <code>deploy_hook_url</code> and <code>deploy_hook_secret</code> for the listener on
            your server. The setup guide has a ready-made listener script.
          </p>
        </Card>
      ) : null}

      {status?.configured ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GitBranch className="size-4" /> {status.repo}
              <Badge variant="secondary">{status.branch}</Badge>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Latest on GitHub
                </dt>
                <dd className="mt-1">
                  {status.latest ? (
                    <>
                      <code>{status.latest.shortSha}</code> — {status.latest.message}
                      <span className="block text-xs text-muted-foreground">
                        {status.latest.author} · {relativeTime(status.latest.date)}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Running live
                </dt>
                <dd className="mt-1">
                  {status.live ? (
                    <>
                      <code>{status.live.commit.slice(0, 7)}</code> — {status.live.message}
                      <span className="block text-xs text-muted-foreground">
                        synced by {status.live.syncedBy} · {relativeTime(status.live.syncedAt)} ·{" "}
                        {status.live.outcome}
                      </span>
                    </>
                  ) : (
                    "No sync recorded yet."
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void statusQuery.refetch()}
                disabled={statusQuery.isFetching}
              >
                <RefreshCw className={statusQuery.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />{" "}
                Check GitHub
              </Button>
              <Button
                size="sm"
                disabled={sync.isPending || !status.hookConfigured}
                onClick={() => sync.mutate()}
              >
                {sync.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Rocket className="size-3.5" />
                )}{" "}
                Sync to live site
              </Button>
              {status.upToDate ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="size-3.5" /> Live site matches GitHub
                </span>
              ) : null}
            </div>
            {!status.hookConfigured ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Add <code>deploy_hook_url</code> in Keys &amp; security to enable syncing.
              </p>
            ) : null}
            {status.error ? (
              <p className="mt-2 text-xs text-destructive">{status.error}</p>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-medium">Recent commits</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {status.commits.map((commit) => (
                <li key={commit.sha} className="border-b border-border/60 pb-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs">{commit.shortSha}</code>
                    {status.live?.commit === commit.sha ? (
                      <Badge variant="secondary">live</Badge>
                    ) : null}
                  </div>
                  <p>{commit.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {commit.author} · {relativeTime(commit.date)}
                  </p>
                </li>
              ))}
              {!status.commits.length ? (
                <li className="text-muted-foreground">No commits returned.</li>
              ) : null}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
