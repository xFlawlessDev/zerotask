import { createRootRoute, createRoute, createRouter, Navigate, Outlet, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { LoadingState } from "@/components/ui/surface";
import { useSession } from "@/features/session";
import { getToken } from "@/lib/api/client";
import AuthPage from "@/routes/auth";
import OverviewPage from "@/routes";
import ProjectsPage from "@/routes/projects";
import ProjectDetailPage from "@/routes/project-detail";
import MyWorkPage from "@/routes/my-work";
import ReviewsPage from "@/routes/reviews";
import CpmPage from "@/routes/cpm";
import ResourcesPage from "@/routes/resources";
import DocumentsPage from "@/routes/documents";
import TeamPage from "@/routes/team";
import TemplatesPage from "@/routes/templates";
import AdminPage from "@/routes/admin";
import ProfilePage from "@/routes/profile";

/**
 * One layout route holds the signed-in area: it renders the shell and redirects to
 * sign-in when the session says nobody is home. Auth lives outside it, so a
 * signed-in visitor landing on /auth is bounced back rather than shown two shells.
 *
 * Page titles are set per route; the shell reads them for the top bar.
 */

function RequireAuth() {
  const { loading, person } = useSession();

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <LoadingState label="Checking your session" />
      </div>
    );
  }

  // Redirects thrown during render escape to the error boundary; <Navigate /> is the render-time form.
  if (!person) {
    return <Navigate to="/auth" />;
  }

  return <AppShell title={document.title.replace(" · Zero Task", "")}>{<Outlet />}</AppShell>;
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <Navigate to="/" />,
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in · Zero Task" }] }),
  beforeLoad: () => {
    if (getToken()) throw redirect({ to: "/" });
  },
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: () => {
    if (!getToken()) throw redirect({ to: "/auth" });
  },
  component: RequireAuth,
});

const overviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: OverviewPage,
  head: () => ({ meta: [{ title: "Overview · Zero Task" }] }),
});

const projectsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projects",
  component: ProjectsPage,
  head: () => ({ meta: [{ title: "Projects · Zero Task" }] }),
});

const projectDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projects/$projectId",
  component: ProjectDetailPage,
  head: () => ({ meta: [{ title: "Project · Zero Task" }] }),
});

const myWorkRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/my-work",
  component: MyWorkPage,
  head: () => ({ meta: [{ title: "My work · Zero Task" }] }),
});

const reviewsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/reviews",
  component: ReviewsPage,
  head: () => ({ meta: [{ title: "Reviews · Zero Task" }] }),
});

const cpmRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/cpm",
  component: CpmPage,
  head: () => ({ meta: [{ title: "Critical path · Zero Task" }] }),
});

const resourcesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/resources",
  component: ResourcesPage,
  head: () => ({ meta: [{ title: "Resources · Zero Task" }] }),
});

const documentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/documents",
  component: DocumentsPage,
  head: () => ({ meta: [{ title: "Documents · Zero Task" }] }),
});

const teamRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/team",
  component: TeamPage,
  head: () => ({ meta: [{ title: "Team · Zero Task" }] }),
});

const templatesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/templates",
  component: TemplatesPage,
  head: () => ({ meta: [{ title: "Templates · Zero Task" }] }),
});

const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin",
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin · Zero Task" }] }),
});

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/profile",
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Your profile · Zero Task" }] }),
});

const routeTree = rootRoute.addChildren([
  authRoute,
  appRoute.addChildren([
    overviewRoute,
    projectsRoute,
    projectDetailRoute,
    myWorkRoute,
    reviewsRoute,
    cpmRoute,
    resourcesRoute,
    documentsRoute,
    teamRoute,
    templatesRoute,
    adminRoute,
    profileRoute,
  ]),
]);

export const router: ReturnType<typeof createRouter> = createRouter({
  routeTree,
  context: { queryClient: undefined as unknown as QueryClient },
  defaultPreload: "intent",
  defaultPendingComponent: () => <LoadingState />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
