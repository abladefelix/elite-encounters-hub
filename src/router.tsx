import { QueryClient, MutationCache, QueryCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { describeFailure, notifyError } from "./lib/friendly-errors";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Connection blips deserve a couple of quiet retries with backoff;
        // permission/auth/not-found failures should surface immediately.
        retry: (attempt, error) => {
          const { kind } = describeFailure(error);
          const retryable = kind === "offline" || kind === "timeout" || kind === "server";
          return retryable && attempt < 3;
        },
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
        staleTime: 30_000,
      },
      mutations: {
        retry: (attempt, error) => describeFailure(error).kind === "offline" && attempt < 2,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
      },
    },
    // Global safety net: nothing fails silently, but connection problems are
    // reported once (deduped by kind) instead of once per query.
    queryCache: new QueryCache({
      onError: (error, query) => {
        const kind = describeFailure(error).kind;
        if (kind !== "offline" && kind !== "timeout" && kind !== "server") return;
        notifyError(error, {
          id: `query-${kind}`,
          onRetry: () => void queryClient.refetchQueries({ queryKey: query.queryKey }),
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        const kind = describeFailure(error).kind;
        if (kind !== "offline" && kind !== "timeout" && kind !== "server") return;
        notifyError(error, { id: `mutation-${kind}` });
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
