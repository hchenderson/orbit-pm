import { expect, test, type Page } from "@playwright/test";

const testEmail = process.env.STAGING_TEST_EMAIL;
const testPassword = process.env.STAGING_TEST_PASSWORD;

if (process.env.CI && (!testEmail || !testPassword)) {
  throw new Error("STAGING_TEST_EMAIL and STAGING_TEST_PASSWORD are required in CI so authenticated staging coverage cannot be skipped.");
}

async function signIn(page: Page) {
  if (!testEmail || !testPassword) test.skip(true, "STAGING_TEST_EMAIL and STAGING_TEST_PASSWORD are required for authenticated checks.");
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(testEmail!);
  await page.getByLabel("Password").fill(testPassword!);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading").first()).toBeVisible();
}

test.describe("public production surface", () => {
  test("generic registration is visibly invite-only", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("Need access? Ask a workspace owner to send an invitation.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create an account/i })).toHaveCount(0);
  });

  test("an invitation context exposes invited account creation", async ({ page }) => {
    const next = encodeURIComponent("/invite?workspace=staging&token=invalid-test-token");
    await page.goto(`/sign-in?next=${next}`);
    await expect(page.getByRole("button", { name: "Create your invited account" })).toBeVisible();
  });

  test("legal and account deletion pages are reachable", async ({ page }) => {
    for (const path of ["/privacy", "/terms", "/support", "/delete-account"]) {
      const response = await page.goto(path);
      expect(response?.ok(), `${path} should return successfully`).toBeTruthy();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });
});

test.describe("authenticated staging smoke", () => {
  test("opens the workspace and task creation flow", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "New task", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: /Create a new task|New task/i })).toBeVisible();
  });

  test("opens Account settings and the protected danger zone", async ({ page }) => {
    await signIn(page);
    if ((page.viewportSize()?.width ?? 1_280) <= 820) await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.locator(".settings-nav").getByRole("button", { name: "Account" }).click();
    await expect(page.getByRole("heading", { name: "Account security" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Danger zone" })).toBeVisible();
  });

  test("opens the spreadsheet and schedule issue review", async ({ page }) => {
    await signIn(page);
    if ((page.viewportSize()?.width ?? 1_280) <= 560) await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("button", { name: "My tasks" }).click();
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page.getByRole("table")).toBeVisible();
    const health = page.getByRole("button", { name: /schedule issue|Schedule is healthy/i });
    await expect(health).toBeVisible();
    await health.click();
    await expect(page.getByRole("dialog", { name: "Schedule issues" })).toBeVisible();
  });
});
