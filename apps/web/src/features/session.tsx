import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken, subscribeToken } from "@/lib/api/client";
import type { Capabilities, Department, Person, SessionResponse } from "@/lib/api/types";
import type { Role } from "@zerotask/domain";

/**
 * The session is a React Query cache entry, not a reducer with effects.
 *
 * The component tree needs three facts: who is signed in, what they may do, and
 * which departments exist for pickers. One request answers all three, so one hook
 * serves the shell, the route guards, and every assignee picker without a second
 * round trip.
 */

interface SessionValue {
  loading: boolean;
  person: Person | null;
  capabilities: Capabilities | null;
  departments: Department[];
  /** Role of the signed-in person, or null. Guards read this before rendering. */
  role: Role | null;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Read through a subscription so a sign-in or sign-out re-renders this provider.
  // Reading sessionStorage directly during render left `enabled` frozen at whatever
  // it was on first paint: after signing out the stale options kept the query alive,
  // and after signing in as someone else the new token only took effect on reload.
  const token = useSyncExternalStore(subscribeToken, getToken, () => null);

  const { data, isLoading } = useQuery({
    queryKey: ["session"],
    queryFn: () => api.session.get(),
    // The token lives in sessionStorage; a visitor without one cannot be signed in.
    enabled: token !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const value: SessionValue = {
    loading: token !== null && isLoading,
    person: data?.authenticated ? data.user : null,
    capabilities: data?.authenticated ? data.capabilities : null,
    departments: data?.authenticated ? data.departments : [],
    role: data?.authenticated ? data.user.role : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

/** A narrowed session for pages that are already behind the auth guard. */
export function useRequiredSession(): {
  person: Person;
  capabilities: Capabilities;
  departments: Department[];
  refresh: () => Promise<void>;
} {
  const session = useSession();
  if (!session.person || !session.capabilities) {
    throw new Error("useRequiredSession used outside the signed-in area");
  }
  return {
    person: session.person,
    capabilities: session.capabilities,
    departments: session.departments,
    refresh: session.refresh,
  };
}

export type { SessionResponse };
