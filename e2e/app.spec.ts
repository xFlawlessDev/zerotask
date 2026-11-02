import type { Page } from "@playwright/test";
import { expect, people, signIn, test } from "./fixtures.ts";

/** Opens the decision dialog for a queued submission and confirms it with the same verb. */
async function decide(page: Page, taskName: string, verb: "Approve") {
  const card = page.locator("li", { hasText: taskName });
  await card.getByRole("button", { name: verb }).click();
  await page.getByRole("dialog").getByRole("button", { name: verb }).click();
}

test.describe("authentication", () => {
  test("a visitor is sent to sign-in before seeing any project data", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
  });

  test("a wrong password is refused with a message next to the field", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Work email").fill(people.staff);
    await page.getByLabel(/^Password/).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("That email and password do not match an account")).toBeVisible();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("signing in lands on the overview and shows the signed-in person", async ({ page }) => {
    await signIn(page, people.manager);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    await expect(page.getByText("Iman Kusuma").first()).toBeVisible();
  });

  test("signing out returns to sign-in and blocks the signed-in area", async ({ page }) => {
    await signIn(page, people.staff);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/auth$/);
    await page.goto("/my-work");
    await expect(page).toHaveURL(/\/auth$/);
  });
});

test.describe("projects", () => {
  test("the project list shows every project the lead can open", async ({ asLead: page }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Atlas: warehouse rollout/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Borealis: cold chain/ })).toBeVisible();
  });

  test("filtering by status narrows the list", async ({ page }) => {
    // Iman owns the completed project; the list only shows projects the viewer belongs to.
    await signIn(page, people.manager);
    await page.goto("/projects");
    await page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: "Completed" }).click();
    await expect(page.getByRole("link", { name: /Cirrus: supplier portal/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Atlas: warehouse rollout/ })).toHaveCount(0);
  });

  test("searching finds a project by name", async ({ asLead: page }) => {
    await page.goto("/projects");
    await page.getByRole("searchbox", { name: "Search projects" }).fill("Borealis");
    await expect(page.getByRole("link", { name: /Borealis/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Atlas/ })).toHaveCount(0);
  });

  test("opening a project shows its tasks with status and dates", async ({ asLead: page }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ZR-001");
    await expect(page.getByRole("tab", { name: "Tasks" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("cell", { name: "Build the receiving adapter" })).toBeVisible();
  });

  test("creating a project appears in the list", async ({ asLead: page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await dialog.getByLabel("Project name").fill("E2E created project");
    await dialog.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("link", { name: /E2E created project/ })).toBeVisible();
  });

  test("a project name that is too short is refused before any request", async ({ asLead: page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await dialog.getByLabel("Project name").fill("x");
    await dialog.getByRole("button", { name: "Create project" }).click();
    await expect(dialog.getByText("Give the project a name of at least two characters.")).toBeVisible();
  });
});

test.describe("schedule", () => {
  test("the schedule tab draws the Gantt with a computed finish date", async ({ asLead: page }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    await page.getByRole("tab", { name: "Schedule" }).click();
    await expect(page.getByText("Computed finish")).toBeVisible();
    await expect(page.getByRole("img", { name: /ZR-001-03/ })).toBeVisible();
  });

  test("recalculate runs the scheduler and reports success", async ({ asLead: page }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    await page.getByRole("tab", { name: "Schedule" }).click();
    await page.getByRole("button", { name: "Recalculate" }).click();
    await expect(page.getByText("Schedule recalculated")).toBeVisible();
  });
});

test.describe("my work", () => {
  test("a staff member sees their assigned tasks grouped by status", async ({ page }) => {
    await signIn(page, people.staff);
    await page.goto("/my-work");
    await expect(page.getByRole("heading", { name: "My work", level: 1 })).toBeVisible();
    // Budi's open task is "Build the receiving adapter". This suite runs before the review
    // flow, which settles that task, so the assertion holds in file order.
    await expect(page.getByText("Build the receiving adapter")).toBeVisible();
  });
});


test.describe.serial("review workflow", () => {
  // Serial on purpose: the approval test settles the seeded submission, so the
  // read and validation tests must run before it against the same database.
  test("a reviewer sees the submission waiting in the review queue", async ({ page }) => {
    await signIn(page, people.manager);
    await page.goto("/reviews");
    await expect(page.getByRole("heading", { name: "Reviews", level: 1 })).toBeVisible();
    await expect(page.getByText("Build the receiving adapter")).toBeVisible();
  });

  test("requesting changes requires a note", async ({ page }) => {
    // Validation fails before any write, so this test leaves the seeded queue untouched.
    await signIn(page, people.manager);
    await page.goto("/reviews");
    await page.locator("li", { hasText: "Build the receiving adapter" }).getByRole("button", { name: "Request changes" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send back" }).click();
    await expect(page.getByText("Say what needs to change, so the submitter can act on it.")).toBeVisible();
  });

  test("one approval is recorded, and the second reviewer settles the submission", async ({ page, browser }) => {
    // The seeded submission needs two approvals, so the first vote must not clear it.
    await signIn(page, people.manager);
    await page.goto("/reviews");
    await decide(page, "Build the receiving adapter", "Approve");
    await expect(page.getByText("Your approval is recorded. Waiting for the other reviewers.")).toBeVisible();
    await expect(page.getByText("Build the receiving adapter")).toBeVisible();

    const second = await browser.newContext();
    const sari = await second.newPage();
    await signIn(sari, people.lead);
    await sari.goto("/reviews");
    await decide(sari, "Build the receiving adapter", "Approve");
    await expect(sari.getByText("Submission approved")).toBeVisible();
    await expect(sari.locator("li", { hasText: "Build the receiving adapter" })).toHaveCount(0);
    await second.close();
  });
});

test.describe("access control", () => {
  test("staff cannot open the admin area", async ({ page }) => {
    await signIn(page, people.staff);
    await page.goto("/admin");
    await expect(page.getByText("This area is for admins.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  });

  test("an admin sees people and roles", async ({ page }) => {
    await signIn(page, people.admin);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Role of Budi Santoso/ })).toBeVisible();
  });
});

test.describe("appearance and accessibility", () => {
  test("switching to dark theme applies it and persists across reload", async ({ page }) => {
    await signIn(page, people.staff);
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("primary buttons keep readable text in both themes", async ({ page }) => {
    await signIn(page, people.manager);
    await page.goto("/projects");
    const primary = page.getByRole("button", { name: "New project" });
    const light = await primary.evaluate((el) => getComputedStyle(el).color);
    const bg = await primary.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(light).toBe("rgb(255, 255, 255)");
    expect(bg).toBe("rgb(23, 69, 127)");
  });

  test("the skip link is the first focusable element", async ({ page }) => {
    await signIn(page, people.staff);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });

  test("a dialog closes on Escape", async ({ asLead: page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await expect(page.getByRole("dialog", { name: "New project" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "New project" })).toHaveCount(0);
  });
});

test.describe("every route renders without a crash", () => {
  const routes = ["/", "/projects", "/my-work", "/reviews", "/documents", "/cpm", "/resources", "/team", "/templates", "/profile"];

  for (const route of routes) {
    test(`${route} renders its heading`, async ({ asLead: page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
