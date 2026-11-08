import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * The page's own name, published once and read in two places.
 *
 * The top bar used to show "Zero Task" on every page, and `document.title` never
 * changed either: the route `head()` metadata was declared but nothing rendered it,
 * and the shell read `document.title` during render, so it could not follow a
 * change anyway.
 *
 * Rather than a second lookup table mapping URL to label, the `PageHeader` that
 * every page already renders publishes its own heading. The h1, the browser tab,
 * and the top bar are then the same string by construction, and a page that adds a
 * code to its title (the project page, ZR-001 …) gets it everywhere.
 */

const PageTitleContext = createContext<{ label: string; publish: (label: string) => void } | null>(null);

const FALLBACK = "Zero Task";

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState(FALLBACK);

  useEffect(() => {
    document.title = label === FALLBACK ? FALLBACK : `${label} · Zero Task`;
  }, [label]);

  return <PageTitleContext.Provider value={{ label, publish: setLabel }}>{children}</PageTitleContext.Provider>;
}

/** Called by `PageHeader`; the cleanup keeps a stale title off the next page. */
export function usePublishPageTitle(title: string): void {
  const context = useContext(PageTitleContext);

  useEffect(() => {
    if (!context) return;
    context.publish(title);
    return () => context.publish(FALLBACK);
  }, [context, title]);
}

/** The label the top bar shows. A page outside the provider still gets a name. */
export function usePageTitle(): string {
  return useContext(PageTitleContext)?.label ?? FALLBACK;
}
