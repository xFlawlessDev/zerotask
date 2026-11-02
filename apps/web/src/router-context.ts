import type { QueryClient } from "@tanstack/react-query";

/**
 * What the router passes to loaders. Declared separately so both the router and
 * the route definitions can import it without a cycle.
 */
export interface RouterContext {
  queryClient: QueryClient;
}
