import { test, expect } from "@playwright/test";

test("AUTH-LOGIN-001 - User can log in", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await page.goto("http://localhost:3000/login");
  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(new RegExp("/dashboard"));
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByText("Invalid credentials")).toBeHidden();
});
