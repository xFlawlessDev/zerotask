import { expect, test as base, type Page } from "@playwright/test";

/**
 * Shared fixtures. Each person in the demo workspace has the same password, and
 * `signIn` goes through the real sign-in form so the token path is exercised too.
 */
export const PASSWORD = "zerotask-demo-2026";

export const people = {
  admin: "admin@zerotask.dev",
  manager: "iman@zerotask.dev",
  lead: "sari@zerotask.dev",
  staff: "budi@zerotask.dev",
} as const;

export async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

export const test = base.extend<{ asLead: Page }>({
  asLead: async ({ page }, use) => {
    await signIn(page, people.lead);
    await use(page);
  },
});

export { expect };
