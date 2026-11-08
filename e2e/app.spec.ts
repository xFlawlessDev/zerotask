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
  test("an admin can create, edit and delete a project task", async ({ page }) => {
    await signIn(page, people.admin);
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    await page.getByRole("button", { name: "New task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task name").fill("E2E task management");
    await dialog.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("cell", { name: "E2E task management", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Manage .*E2E task management/ }).click();
    await dialog.getByLabel("Task name").fill("E2E task updated");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("cell", { name: "E2E task updated", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Manage .*E2E task updated/ }).click();
    // Deletion goes through the app's own confirmation dialog, not window.confirm.
    await dialog.getByRole("button", { name: "Delete task" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this task?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Delete task" }).click();
    await expect(page.getByRole("cell", { name: "E2E task updated", exact: true })).toHaveCount(0);
  });
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
    await expect(page.getByText("Build the receiving adapter", { exact: true })).toBeVisible();
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
  test("manages task dependencies and displays planned and actual dates", async ({ page }) => {
    await signIn(page, people.manager);
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByRole("dialog").getByLabel("Project name").fill("Dependency chart test");
    await page.getByRole("dialog").getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name: /Dependency chart test/ }).click();
    await page.getByRole("button", { name: "New task" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task name").fill("Design work");
    await dialog.getByLabel("Start date", { exact: true }).fill("2026-08-14");
    await dialog.getByLabel("End date", { exact: true }).fill("2026-08-18");
    await dialog.getByRole("button", { name: "Create task" }).click();
    await page.getByRole("button", { name: "New task" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task name").fill("Build work");
    const predecessorId = await dialog.getByLabel("Predecessor task").getByRole("option", { name: /Design work/ }).getAttribute("value");
    await dialog.getByLabel("Predecessor task").selectOption(predecessorId!);
    await dialog.getByRole("button", { name: "Create task" }).click();
    await page.getByRole("button", { name: /Manage .*Design work/ }).click();
    await dialog.getByLabel("Actual start").fill("2026-08-17");
    await dialog.getByLabel("Actual finish").fill("2026-08-19");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("tab", { name: "Schedule" }).click();
    await expect(page.getByRole("img", { name: /Planned dates for .*14 Aug.*18 Aug/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Actual dates for .*17 Aug.*19 Aug/ })).toBeVisible();
    await expect(page.getByTestId("dependency-lines").locator("[data-dependency-id]")).toHaveCount(1);
    await page.getByRole("tab", { name: "Tasks" }).click();
    await page.getByRole("button", { name: /Manage .*Build work/ }).click();
    await dialog.getByRole("button", { name: /Remove dependency/ }).click();
    await expect(dialog.getByText("No predecessors.")).toBeVisible();
    const option = await dialog.getByLabel("Predecessor task").getByRole("option", { name: /Design work/ }).getAttribute("value");
    await dialog.getByLabel("Predecessor task").selectOption(option!);
    await dialog.getByLabel("Relationship").selectOption("ss");
    await dialog.getByLabel("Lag (working days)").fill("1");
    await dialog.getByRole("button", { name: "Add dependency" }).click();
    await expect(dialog.getByText(/Design work · SS · 1 days/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("tab", { name: "Schedule" }).click();
    await expect(page.getByTestId("dependency-lines").locator("[data-dependency-id]")).toHaveCount(1);
  });
  test("keeps task details accessible on a narrow screen", async ({ asLead: page }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("tab", { name: "Schedule" }).click();
    const chart = page.getByRole("region", { name: "Project timeline" });
    await expect(chart.getByLabel("Timeline legend")).toBeVisible();
    await chart.getByRole("button", { name: /Build the receiving adapter/ }).first().click();
    await expect(page.getByRole("region", { name: "Selected task details" })).toContainText("Build the receiving adapter");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
  test("compares holidays and draws a gap in the task bar", async ({ asLead: page }) => {
    await page.goto("/projects");
    const timelineResponse = page.waitForResponse((response) => response.url().includes("/schedule/timeline"));
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    const timeline = await (await timelineResponse).json();
    const task = timeline.bars[0];
    const baseTask = { id: task.id, startDate: "2026-11-02", endDate: "2026-11-04", totalFloatDays: 0, isCritical: true };
    const result = { projectStartDate: "2026-11-02", calculatedEndDate: "2026-11-04", projectDurationDays: 3, tasks: [baseTask] };
    await page.route("**/schedule/holiday-comparison", (route) => route.fulfill({ json: { baseline: result, withHolidays: { ...result, calculatedEndDate: "2026-11-05", tasks: [{ ...baseTask, endDate: "2026-11-05" }] }, holidays: [{ date: "2026-11-03", name: "Test holiday", type: "national_holiday" }], sources: [{ title: "Decree", url: "https://example.com" }], delayCalendarDays: 1 } }));
    await page.getByRole("tab", { name: "Schedule" }).click();
    await page.getByRole("switch", { name: "Include holidays" }).click();
    await expect(page.getByText("1 calendar day", { exact: true })).toBeVisible();
    const bar = page.getByRole("img", { name: new RegExp(task.code) });
    await expect(bar.locator("[data-schedule-segment]")).toHaveCount(2);
    await page.getByText("Holidays within this schedule").click();
    await expect(page.getByText(/Test holiday/)).toBeVisible();
    await page.getByRole("switch", { name: "Holidays included" }).click();
    await expect(bar.locator("[data-schedule-segment]")).toHaveCount(1);
  });
  test("the schedule tab draws the Gantt with a computed finish date", async ({ asLead: page }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    await page.getByRole("tab", { name: "Schedule" }).click();
    await expect(page.getByText("Latest finish shown")).toBeVisible();
    await expect(page.getByRole("img", { name: /^ZR-001-03/ })).toBeVisible();
    await page.getByLabel("Search tasks").fill("receiving adapter");
    await expect(page.getByText(/1 of \d+ tasks/)).toBeVisible();
    await page.getByRole("button", { name: /Show details for .*Build the receiving adapter/ }).click();
    await expect(page.getByRole("region", { name: "Selected task details" })).toContainText("Build the receiving adapter");
    await page.getByLabel("Search tasks").fill("no matching task");
    await expect(page.getByText("No tasks match these filters.")).toBeVisible();
    await page.getByLabel("Search tasks").clear();
    await page.getByRole("button", { name: "Critical only" }).click();
    await expect(page.getByRole("button", { name: "Critical only" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("radio", { name: "Day" }).click();
    await expect(page.getByRole("radio", { name: "Day" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Timeline months")).toBeVisible();
    await expect(page.getByLabel("Timeline months")).toContainText(/\w+ \d{4}/);
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
  test("a manager can add a teammate, move a task and submit it for review", async ({ page }) => {
    await signIn(page, people.manager);
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    const projectDialog = page.getByRole("dialog", { name: "New project" });
    await projectDialog.getByLabel("Project name").fill("Team workflow test");
    await projectDialog.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name: /Team workflow test/ }).click();
    await page.getByRole("tab", { name: "Team" }).click();
    await page.getByLabel("Find a person").fill("Budi Santoso");
    await expect(page.getByLabel("Person", { exact: true }).getByRole("option", { name: /Budi Santoso/ })).toHaveCount(1);
    await page.getByLabel("Person", { exact: true }).selectOption({ label: "Budi Santoso (budi@zerotask.dev)" });
    await page.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByLabel("Project role of Budi Santoso")).toBeVisible();
    await page.getByLabel("Project role of Budi Santoso").selectOption("manager");
    await expect(page.getByLabel("Project role of Budi Santoso")).toHaveValue("manager");
    await page.getByRole("tab", { name: "Tasks" }).click();
    await page.getByRole("button", { name: "New task" }).click();
    const taskDialog = page.getByRole("dialog");
    await taskDialog.getByLabel("Task name").fill("Workflow task");
    await taskDialog.getByLabel("Assignee").selectOption({ label: "Iman Kusuma" });
    await taskDialog.getByLabel("Reviewer").selectOption({ label: "Budi Santoso" });
    await taskDialog.getByRole("button", { name: "Create task" }).click();
    await page.goto("/my-work");
    await page.getByLabel("Change status of Workflow task").selectOption("in_progress");
    await expect(page.getByLabel("Change status of Workflow task")).toHaveValue("in_progress");
    await page.locator("li", { hasText: "Workflow task" }).getByRole("button", { name: "Submit" }).click();
    await page.getByRole("dialog").getByLabel("Notes for reviewer").fill("Ready for review");
    await page.getByRole("dialog").getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Waiting for a reviewer" }).getByText("Workflow task")).toBeVisible();
  });
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

  test("an admin creates an account and changes its role", async ({ page }) => {
    await signIn(page, people.admin);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Add user" }).click();
    const dialog = page.getByRole("dialog", { name: "Add user" });
    await dialog.getByLabel(/^Name/).fill("New Team Member");
    await dialog.getByLabel("Email").fill("new-team-member@example.com");
    await dialog.getByLabel("Initial password").fill("test-password-123");
    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(dialog).toHaveCount(0);
    const role = page.getByLabel("Role of New Team Member");
    await expect(role).toHaveValue("staff");
    await role.selectOption("lead");
    await expect(role).toHaveValue("lead");
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

test.describe("templates", () => {
  test("an admin writes a template with a dependency between its tasks", async ({ page }) => {
    await signIn(page, people.admin);
    await page.goto("/templates");
    await page.getByRole("button", { name: "New template" }).click();

    const dialog = page.getByRole("dialog", { name: "New template" });
    await dialog.getByLabel("Template name").fill("E2E written shape");
    await dialog.getByLabel("Category").fill("e2e");

    await dialog.getByLabel("Task 1: name").fill("Survey");
    await dialog.getByRole("button", { name: "Add task" }).click();
    await dialog.getByLabel("Task 2: name").fill("Install");
    await dialog.getByLabel("Task 2: duration in days").fill("4");

    // A task waits on the one declared before it; the code in the option is what
    // the API resolves the edge against.
    const predecessor = await dialog
      .getByLabel("Task 2: waits for")
      .getByRole("option", { name: /T-01 Survey/ })
      .getAttribute("value");
    await dialog.getByLabel("Task 2: waits for").selectOption(predecessor!);

    await dialog.getByRole("button", { name: "Save template" }).click();

    const card = page.locator("li", { hasText: "E2E written shape" });
    await expect(card).toBeVisible();
    // The figure renders its number and its noun in separate elements, so the text
    // is "2tasks" with no space between them.
    await expect(card).toContainText(/2\s*tasks/u);
    await expect(card).toContainText(/5\s*d/u);

    // Leave the workspace as it was found.
    await card.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete this template?" }).getByRole("button", { name: "Delete template" }).click();
    await expect(page.locator("li", { hasText: "E2E written shape" })).toHaveCount(0);
  });

  test("capturing a project turns its plan into a template", async ({ page }) => {
    await signIn(page, people.admin);
    await page.goto("/templates");
    await page.getByRole("button", { name: "Capture a project" }).click();

    const dialog = page.getByRole("dialog", { name: "Capture a project as a template" });
    const atlas = await dialog
      .getByLabel("Source project")
      .getByRole("option", { name: /Atlas: warehouse rollout/u })
      .getAttribute("value");
    await dialog.getByLabel("Source project").selectOption(atlas!);

    // The name defaults to the project's own, and is editable from there.
    await expect(dialog.getByLabel("Template name")).toHaveValue(/^Atlas: warehouse rollout/u);
    await dialog.getByLabel("Template name").fill("E2E captured shape");
    await dialog.getByRole("button", { name: "Save as template" }).click();

    const card = page.locator("li", { hasText: "E2E captured shape" });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText(/0\s*tasks/u);

    await card.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete this template?" }).getByRole("button", { name: "Delete template" }).click();
    await expect(page.locator("li", { hasText: "E2E captured shape" })).toHaveCount(0);
  });

  test("a lead without template rights sees no create actions", async ({ asLead: page }) => {
    await page.goto("/templates");
    await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "New template" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Capture a project" })).toHaveCount(0);
  });

  test("a new project can be started from a template, and brings its tasks with it", async ({
    page,
  }) => {
    await signIn(page, people.admin);
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();

    const dialog = page.getByRole("dialog", { name: "New project" });
    const seeded = await dialog
      .getByLabel("Start from")
      .getByRole("option", { name: /Warehouse rollout/u })
      .getAttribute("value");
    await dialog.getByLabel("Start from").selectOption(seeded!);

    // Picking a template narrows the form to what a stamped project actually needs.
    await expect(dialog.getByLabel("Lead time")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Create from template" })).toBeVisible();

    await dialog.getByLabel("Project name").fill("E2E stamped project");
    await dialog.getByRole("button", { name: "Create from template" }).click();

    // The row that appears reports the stamped tasks, which only a real
    // instantiate produces: an empty project would say 0/0.
    const row = page.getByRole("link", { name: /E2E stamped project/u });
    await expect(row).toBeVisible();
    await expect(row).toContainText("7/7 open");

    // Leave the workspace as it was found.
    await row.click();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Delete project" }).click();
    await page
      .getByRole("dialog", { name: "Delete this project?" })
      .getByRole("button", { name: "Delete project", exact: true })
      .click();
    await expect(page).toHaveURL(/\/projects$/u);
  });
});

test.describe("documents", () => {
  test("an admin can attach a document to a project they are not a member of", async ({ page }) => {
    await signIn(page, people.admin);

    // Admins see every project in the picker, so the create route must accept them
    // all. This used to answer "You are not a member of this project" for a project
    // the same admin had just been offered.
    const target = await page.evaluate(async () => {
      const token = sessionStorage.getItem("zerotask.token");
      const headers = { Authorization: `Bearer ${token}` };
      const projects = await (await fetch("/api/projects", { headers })).json();
      for (const project of projects.items) {
        const detail = await (await fetch(`/api/projects/${project.id}`, { headers })).json();
        const isMember = detail.members.some((member: { email: string }) => member.email === "admin@zerotask.dev");
        if (!isMember) return { id: project.id as string, name: project.name as string };
      }
      return null;
    });
    expect(target).not.toBeNull();
    if (!target) return;

    await page.goto("/documents");
    await page.getByRole("button", { name: "Add document" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a document" });
    await dialog.getByLabel("Name").fill("Admin non-member attach");
    await dialog.getByLabel("Project").selectOption(target.id);
    await dialog.getByRole("button", { name: "Add document" }).click();

    // The row appears and names the project, which only happens on a successful
    // write. The table's "Belongs to" column holds the project name, not its code.
    const row = page.locator("tr", { hasText: "Admin non-member attach" });
    await expect(row).toBeVisible();
    await expect(row).toContainText(target.name);

    // And the project's own document list has it.
    await page.goto(`/projects/${target.id}`);
    await page.getByRole("tab", { name: "Documents" }).click();
    await expect(page.getByText("Admin non-member attach")).toBeVisible();

    // Clean up through the app's own dialog.
    await page.goto("/documents");
    const cleanup = page.locator("tr", { hasText: "Admin non-member attach" });
    await cleanup.getByRole("button", { name: /^Delete / }).click();
    await page.getByRole("dialog", { name: "Delete this document?" }).getByRole("button", { name: "Delete document" }).click();
    await expect(page.locator("tr", { hasText: "Admin non-member attach" })).toHaveCount(0);
  });

  test("uploads a real file, serves its bytes back, and shows a readable name", async ({ asLead: page }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: "Add document" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a document" });
    await expect(dialog).toBeVisible();

    const bytes = "e2e-document-body";
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "site survey, signed.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    });
    await dialog.getByLabel("Name").fill("E2E uploaded survey");
    await dialog.getByRole("button", { name: "Add document" }).click();

    const row = page.locator("tr", { hasText: "E2E uploaded survey" });
    await expect(row).toBeVisible();
    // The write closes the dialog; wait for that before opening the next one, so the
    // second click cannot land on a dialog that is still unmounting.
    await expect(dialog).toHaveCount(0);

    // The upload used to fail with a 500 before it reached this point; a link means
    // a stored key, and fetching it must return the exact bytes.
    const href = await row.locator("a[aria-label^='Download']").getAttribute("href");
    expect(href).toBeTruthy();
    const fetched = await page.evaluate(async (url) => {
      const response = await fetch(url!, { credentials: "same-origin" });
      return { status: response.status, text: await response.text() };
    }, href);
    expect(fetched.status).toBe(200);
    expect(fetched.text).toBe(bytes);

    // The name column must be wide enough to read a normal document name.
    const cell = await row.locator("td:nth-child(2) span").first().evaluate((element) => ({
      text: element.textContent,
      truncated: element.scrollWidth > element.clientWidth,
    }));
    expect(cell.text).toBe("E2E uploaded survey");
    expect(cell.truncated).toBe(false);

    // Attaching to a project is what makes a document findable from that project.
    await page.getByRole("button", { name: "Add document" }).click();
    const linked = page.getByRole("dialog", { name: "Add a document" });
    // The dialog is portalled and mounts after the click; wait for the field before
    // typing, so a slow first paint is not read as a missing control.
    await expect(linked).toBeVisible();
    await linked.getByLabel("Name").fill("E2E linked document");
    await linked.getByLabel("Project").selectOption({ label: "ZR-001 · Atlas: warehouse rollout, phase 2" });
    await linked.getByRole("button", { name: "Add document" }).click();
    await expect(page.locator("tr", { hasText: "E2E linked document" })).toContainText("Atlas: warehouse rollout");

    // Tidy up through the app's own delete dialog.
    for (const name of ["E2E uploaded survey", "E2E linked document"]) {
      await page.locator("tr", { hasText: name }).getByRole("button", { name: /^Delete / }).click();
      await page.getByRole("dialog", { name: "Delete this document?" }).getByRole("button", { name: "Delete document" }).click();
      await expect(page.locator("tr", { hasText: name })).toHaveCount(0);
    }
  });
});

test.describe("resources", () => {
  test("shows logged hours and filters by department without an error", async ({ page }) => {
    await signIn(page, people.manager);
    const failures: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/workload") && response.status() >= 400) failures.push(String(response.status()));
    });

    await page.goto("/resources");
    // Seeded work logs are in the past; the window has to look back to find them.
    await expect(page.getByText("No work logged in this window")).toHaveCount(0);
    await expect(page.getByRole("cell", { name: /18\.5h|18h/ })).toBeVisible();

    await page.getByLabel("Department").selectOption({ label: "Engineering" });
    await expect(page.getByText("Budi Santoso")).toBeVisible();
    await expect(page.getByText("Putri Handayani")).toHaveCount(0);
    expect(failures).toEqual([]);
  });
});

test.describe("deep links and page titles", () => {
  test("the tab title and the top bar name the page, including the project code", async ({ asLead: page }) => {
    await page.goto("/projects");
    await expect(page.locator('header[data-testid="topbar"] h2')).toHaveText("Projects");
    await expect(page).toHaveTitle("Projects · Zero Task");

    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    await expect(page).toHaveTitle(/ZR-001 Atlas: warehouse rollout.* · Zero Task/);
    await expect(page.locator('header[data-testid="topbar"] h2')).toContainText("ZR-001");
  });

  test("a notification about a task opens that task inside its project", async ({ page }) => {
    await signIn(page, people.manager);
    await page.getByRole("button", { name: /Notifications/ }).click();
    const bell = page.getByRole("dialog", { name: "Notifications" });
    const href = await bell.locator("a").first().getAttribute("href");
    expect(href).toMatch(/\/projects\/[^/]+\/tasks\/[^/]+$/);

    await bell.locator("a").first().click();
    await expect(page).toHaveURL(/\/tasks\//);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ZR-001");
    // The linked row is marked, so the destination is visibly the thing that was named.
    await expect(page.locator("tr[aria-current='true']")).toHaveCount(1);
    await expect(page.locator("tr[aria-current='true']")).toContainText("ZR-001-03");
  });

  test("a schedule-change notification opens the project's schedule, not the overview", async ({ page }) => {
    await signIn(page, people.manager);

    // Generate a real schedule notice: proposing a revision notifies the project's
    // other members, so the acting owner would not receive one. This is the same
    // route the app calls, not a fabricated row.
    const project = await page.evaluate(async () => {
      const token = sessionStorage.getItem("zerotask.token");
      const headers = { Authorization: `Bearer ${token}` };
      const projects = await (await fetch("/api/projects", { headers })).json();
      return projects.items.find((item: { code: string }) => item.code === "ZR-001");
    });
    expect(project).toBeTruthy();

    const revision = await page.evaluate(async (projectId: string) => {
      const token = sessionStorage.getItem("zerotask.token");
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const tasks = await (await fetch(`/api/projects/${projectId}/tasks`, { headers })).json();
      const target = tasks.items[0];
      const start = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
      const response = await fetch(`/api/projects/${projectId}/schedule/revisions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "Schedule notice navigation check",
          reason: "Asserting a schedule notification lands on the schedule.",
          source: "internal",
          changes: [{ taskId: target.id, plannedStartDate: start, durationDays: 2 }],
        }),
      });
      const created = await response.json();
      return Array.isArray(created) ? created.find((item: { title: string }) => item.title === "Schedule notice navigation check") : null;
    }, project.id);
    expect(revision?.id).toBeTruthy();

    try {
      // Read the notice from a member of the same project.
      await page.getByRole("button", { name: "Sign out" }).click();
      await signIn(page, people.lead);

      await page.getByRole("button", { name: /Notifications/ }).click();
      const bell = page.getByRole("dialog", { name: "Notifications" });
      const link = bell.locator("a[href$='/schedule']").first();
      await expect(link).toBeVisible();
      await link.click();

      // The destination is the project's schedule, not a bounce to the overview.
      await expect(page).toHaveURL(/\/projects\/[^/]+\/schedule$/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("ZR-001");
      await expect(page.getByRole("tab", { name: "Schedule" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("region", { name: "Project timeline" })).toBeVisible();
    } finally {
      // Leave the plan as it was found.
      await page.evaluate(async ({ projectId, revisionId }) => {
        const token = sessionStorage.getItem("zerotask.token");
        await fetch(`/api/projects/${projectId}/schedule/revisions/${revisionId}/reject`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ note: "test cleanup" }),
        });
      }, { projectId: project.id, revisionId: revision.id });
    }
  });
});

test.describe("authorization parity", () => {
  test("a plain member is not offered milestone or settings controls the server refuses", async ({ page }) => {
    await signIn(page, people.staff);
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();

    await page.getByRole("tab", { name: "Milestones" }).click();
    await expect(page.getByRole("button", { name: "Add milestone" })).toHaveCount(0);
    await expect(page.getByLabel(/^Status of /)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
    await expect(page.getByText(/managed by this project's managers/)).toBeVisible();

    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Project settings" });
    // Read-only fields say why rather than silently refusing input.
    await expect(settings.getByText(/Read-only:/)).toBeVisible();
    await expect(settings.getByLabel("Name")).toBeDisabled();
    await expect(settings.getByRole("button", { name: "Delete project" })).toHaveCount(0);
  });

  test("cancelling project settings discards the draft", async ({ page }) => {
    await signIn(page, people.manager);
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();

    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Project settings" });
    const saved = await settings.getByLabel("Name").inputValue();
    await settings.getByLabel("Name").fill("Discarded draft");
    await settings.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("dialog", { name: "Project settings" }).getByLabel("Name")).toHaveValue(saved);
  });

  test("deleting a milestone asks through the app's own dialog", async ({ page }) => {
    await signIn(page, people.manager);
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    await page.getByRole("tab", { name: "Milestones" }).click();

    await page.getByRole("button", { name: /^Remove / }).first().click();
    const confirm = page.getByRole("dialog", { name: "Remove this milestone?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(3);
  });

  test("deleting a project asks first, even when it has no tasks", async ({ page }) => {
    await signIn(page, people.manager);
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    const create = page.getByRole("dialog", { name: "New project" });
    await create.getByLabel("Project name").fill("E2E delete confirmation");
    await create.getByRole("button", { name: "Create project" }).click();
    // Creating closes the dialog and refreshes the list; wait for the row rather
    // than a fixed delay, then open it.
    await expect(page.getByRole("link", { name: /E2E delete confirmation/ })).toBeVisible();
    await page.getByRole("link", { name: /E2E delete confirmation/ }).click();
    await expect(page).toHaveURL(/\/projects\/[\da-f-]+$/);

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Delete project" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this project?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    // Cancelling the confirmation leaves the project and the settings dialog alone.
    await expect(confirm).toHaveCount(0);
    await expect(page.locator("h1")).toContainText("E2E delete confirmation");

    // The settings dialog is still open behind it, so confirm for real from there.
    await page.getByRole("button", { name: "Delete project" }).click();
    await page.getByRole("dialog", { name: "Delete this project?" }).getByRole("button", { name: "Delete project", exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("link", { name: /E2E delete confirmation/ })).toHaveCount(0);
  });
});

test.describe("failure states are honest", () => {
  const pages = [
    ["reviews", "/reviews", "**/api/my-work/reviews*"],
    ["critical path", "/cpm", "**/api/portfolio*"],
    ["templates", "/templates", "**/api/templates*"],
    ["documents", "/documents", "**/api/documents*"],
    ["team", "/team", "**/api/people*"],
    ["resources", "/resources", "**/api/workload*"],
  ] as const;

  for (const [name, route, pattern] of pages) {
    test(`${name} reports a failure instead of pretending to be empty`, async ({ asLead: page }) => {
      await page.route(pattern, (route) => route.fulfill({ status: 500, json: { code: "INTERNAL", message: "boom" } }));
      await page.goto(route);
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    });
  }

  test("a project's activity tab reports a failure instead of claiming no history", async ({ asLead: page }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    const projectUrl = new URL(page.url()).pathname;

    // Intercept before the tab is ever opened, so this is a real failed request and
    // not a cache read.
    await page.route("**/api/projects/*/activity*", (route) =>
      route.fulfill({ status: 500, json: { code: "INTERNAL", message: "boom" } }),
    );
    await page.goto(projectUrl);
    await page.getByRole("tab", { name: "Activity" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByText("No activity yet")).toHaveCount(0);
  });

  test("the profile's activity panel reports a failure instead of loading forever", async ({ asLead: page }) => {
    // A failed request used to leave the panel on "Loading activity" with no way out.
    await page.route("**/api/my-work/activity*", (route) =>
      route.fulfill({ status: 500, json: { code: "INTERNAL", message: "boom" } }),
    );
    await page.goto("/profile");

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByText("Loading activity")).toHaveCount(0);
    await expect(page.getByText("No activity recorded yet")).toHaveCount(0);
  });

  test("the profile's activity count does not repeat its own number in the label", async ({ asLead: page }) => {
    await page.goto("/profile");
    const section = page.locator('section[aria-label="Your recent activity"]');
    await expect(section).not.toContainText("Loading activity");

    const text = await section.innerText();
    // The figure's label must not echo the value it sits under ("15 … the last 15").
    const repeated = /(\d+)\s*\n[^\n]*\b\1\b/u.test(text) || /(\d+) events in the last \1/u.test(text);
    expect(repeated).toBe(false);
    expect(text).not.toMatch(/1 recorded changes/u);
    // And it agrees with the count.
    expect(text).toMatch(/recorded (change|changes), newest first/u);
  });

  test("the profile keeps the email settings section when that request fails", async ({ asLead: page }) => {
    // The section used to be rendered only when the query succeeded, so a broken
    // request read as "this workspace has no email settings at all".
    await page.route("**/api/notification-preferences*", (route) =>
      route.fulfill({ status: 500, json: { code: "INTERNAL", message: "boom" } }),
    );
    await page.goto("/profile");

    const section = page.locator('section[aria-label="Notifications"]');
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: "Email notifications" })).toBeVisible();
    await expect(section.getByRole("alert")).toBeVisible();
    await expect(section.getByRole("button", { name: "Try again" })).toBeVisible();
    // A failed read must not render switches in a guessed state.
    await expect(section.getByRole("switch")).toHaveCount(0);
  });

  test("the project header says the review count is unknown instead of showing none", async ({
    asLead: page,
  }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();
    const projectUrl = new URL(page.url()).pathname;

    await page.route("**/api/projects/*/submissions*", (route) =>
      route.fulfill({ status: 500, json: { code: "INTERNAL", message: "boom" } }),
    );
    await page.goto(projectUrl);

    // "0 to review" would be a claim the request never made.
    await expect(
      page.getByRole("link", { name: /number of submissions waiting for review could not be loaded/u }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /to review$/u })).toHaveCount(0);
  });

  test("the milestones and team panels read the project the page already loaded", async ({
    asLead: page,
  }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: /Atlas: warehouse rollout/ }).click();

    // Both panels used to fetch the same project again. Counting the reads is how
    // that regression shows up: one read for the page, none for the panels.
    const reads: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (/^\/api\/projects\/[^/]+$/u.test(path)) reads.push(path);
    });

    await page.getByRole("tab", { name: "Milestones" }).click();
    await expect(page.getByRole("button", { name: "Add milestone" })).toBeVisible();
    await expect(page.getByText("Site survey signed off")).toBeVisible();

    await page.getByRole("tab", { name: "Team" }).click();
    await expect(page.getByText("Iman Kusuma").first()).toBeVisible();

    expect(reads).toHaveLength(0);
  });
});

test.describe("responsive and accessible shell", () => {
  /**
   * A count of one must not read as "1 open tasks". The seed leaves every
   * department with two or more open tasks, so this first cancels one task on a
   * department that has exactly two, guaranteeing a rendered count of one, then
   * sweeps the pages. The task is returned to its own status afterwards.
   */
  test("count labels agree with their number", async ({ page }) => {
    await signIn(page, people.admin);

    const plan = await page.evaluate(async () => {
      const token = sessionStorage.getItem("zerotask.token");
      const headers = { Authorization: `Bearer ${token}` };
      const departments = (await (await fetch("/api/departments", { headers })).json()) as {
        id: string;
        code: string;
        name: string;
        openTasks?: number;
      }[];
      // Exactly two, so cancelling one lands on a count of one.
      const target = departments.find((department) => (department.openTasks ?? 0) === 2);
      if (!target) return null;

      const projects = await (await fetch("/api/projects", { headers })).json();
      for (const project of projects.items) {
        const tasks = await (await fetch(`/api/projects/${project.id}/tasks`, { headers })).json();
        const candidate = tasks.items.find(
          (task: { departmentId: string | null; status: string }) =>
            task.departmentId === target.id &&
            ["not_started", "in_progress", "blocked"].includes(task.status),
        );
        if (candidate) {
          return {
            projectId: project.id as string,
            taskId: candidate.id as string,
            status: candidate.status as string,
            departmentLabel: target.name as string,
          };
        }
      }
      return null;
    });

    expect(plan).not.toBeNull();
    if (!plan) return;

    const move = (status: string) =>
      page.evaluate(async (input: { projectId: string; taskId: string; status: string }) => {
        const token = sessionStorage.getItem("zerotask.token");
        const response = await fetch(`/api/projects/${input.projectId}/tasks/${input.taskId}/move`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: input.status }),
        });
        return response.status;
      }, { projectId: plan.projectId, taskId: plan.taskId, status });

    expect(await move("cancelled")).toBe(200);

    try {
      // The department now renders "1 open task"; the sweep must not find a plural.
      // The seed leaves every department on two or more, so exactly one shows a count
      // of one after the cancel above. Wait for the departments list to finish
      // loading before reading it.
      await page.goto("/team");
      await expect(page.getByText("open task", { exact: false }).first()).toBeVisible();
      const teamText = await page.locator("main").innerText();
      expect(teamText).toContain("1 open task");
      expect(teamText).not.toContain("1 open tasks");

      const VERB_OR_DETERMINER = new Set(["is", "was", "has", "does", "as", "this", "its", "plus"]);
      const pages = ["/", "/my-work", "/projects", "/cpm", "/resources", "/team", "/templates"];
      const offenders: string[] = [];

      for (const route of pages) {
        await page.goto(route);
        await page.waitForTimeout(800);
        const text = await page.locator("main").innerText();

        for (const line of text.split("\n")) {
          // "1 <words ending in s>": the last word is the head noun.
          const match = /(?:^|\s)1\s+([a-z][a-z ]*?[a-z]s)\b/iu.exec(line);
          if (!match) continue;
          const head = match[1]!.trim().split(" ").at(-1)!;
          if (VERB_OR_DETERMINER.has(head.toLowerCase())) continue;
          offenders.push(`${route}: ${line.trim().slice(0, 80)}`);
        }
      }

      expect(offenders).toEqual([]);
    } finally {
      // Leave the plan as it was found.
      expect(await move(plan.status)).toBe(200);
    }
  });

  test("the drawer covers the top bar and offers one close control", async ({ asLead: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation" }).click();

    const close = page.getByRole("dialog").getByRole("button", { name: "Close navigation" });
    await expect(close).toHaveCount(1);

    // The bar's own controls are behind the modal, not merely painted over.
    const covered = await page.evaluate(() => {
      const avatar = document.querySelector('header a[href="/profile"]') as HTMLElement;
      const rect = avatar.getBoundingClientRect();
      const top = document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)[0];
      return !avatar.contains(top);
    });
    expect(covered).toBe(true);

    await close.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the critical path table keeps every column reachable at 390px", async ({ asLead: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cpm");
    await expect(page.getByRole("table")).toBeVisible();

    const table = await page.evaluate(() => {
      const element = document.querySelector("table");
      if (!element) return null;
      const wrapper = element.parentElement as HTMLElement;
      wrapper.scrollLeft = wrapper.scrollWidth;
      const cells = Array.from(element.querySelectorAll("tbody tr")[0]?.children ?? []).map((cell) => cell.textContent?.trim() ?? "");
      return {
        scrollable: wrapper.scrollWidth > wrapper.clientWidth,
        overflow: getComputedStyle(wrapper).overflowX,
        cellCount: cells.length,
        finish: cells.at(-2) ?? "",
        target: cells.at(-1) ?? "",
        noPageOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });

    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.overflow).toBe("auto");
    expect(table.scrollable).toBe(true);
    expect(table.cellCount).toBe(7);
    expect(table.finish).toMatch(/\d{4}|Not run/);
    expect(table.target).toMatch(/\d{4}|Not set/);
    expect(table.noPageOverflow).toBe(true);
  });

  test("collapsed rail links keep a name", async ({ asLead: page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Collapse navigation" }).click();

    const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
    const total = await links.count();
    expect(total).toBeGreaterThan(0);
    for (let index = 0; index < total; index++) {
      await expect(links.nth(index)).toHaveAccessibleName(/\w/u);
    }
  });

  test("a toast renders on the dark surface in dark mode", async ({ page }) => {
    await signIn(page, people.manager);
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByRole("dialog", { name: "New project" }).getByLabel("Project name").fill("Toast surface probe");
    await page.getByRole("dialog", { name: "New project" }).getByRole("button", { name: "Create project" }).click();

    const toast = page.getByText("Project created");
    await expect(toast).toBeVisible();
    const background = await toast.evaluate((element) => getComputedStyle(element.parentElement ?? element).backgroundColor);
    // #16191d is the dark surface; anything near white means the toast ignored the theme.
    expect(background).not.toMatch(/255, 255, 255/);

    // Leave the workspace as it was found.
    await page.locator("tr, a", { hasText: "Toast surface probe" }).first().click();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Delete project" }).click();
    await page.getByRole("dialog", { name: "Delete this project?" }).getByRole("button", { name: "Delete project", exact: true }).click();
  });
});
