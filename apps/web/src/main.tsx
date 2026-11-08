import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AppearanceProvider } from "@/features/appearance";
import { PageTitleProvider } from "@/features/page-title";
import { SessionProvider } from "@/features/session";
import { ThemedToaster } from "@/components/themed-toaster";
import { router } from "@/router";
import "@/styles/globals.css";
import "@fontsource-variable/public-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

/**
 * Boot order: query client before the router, so a route's loaders can read the
 * cache; appearance before the session, so the first paint already has the right
 * theme and no flash.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const container = document.getElementById("root");
if (!container) throw new Error("The #root element is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PageTitleProvider>
        <AppearanceProvider>
          <SessionProvider>
            <RouterProvider router={router} context={{ queryClient }} />
            <ThemedToaster />
          </SessionProvider>
        </AppearanceProvider>
      </PageTitleProvider>
    </QueryClientProvider>
  </StrictMode>,
);
