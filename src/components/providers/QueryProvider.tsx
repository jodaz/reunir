"use client";

/**
 * TanStack Query provider mounted at the app root (PRD §2 / §4). The search UI uses
 * `useQueries` to fan out to the three `/api/sources/*` proxies in parallel, each source
 * loading independently. Defaults are conservative for a public search box.
 */

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
