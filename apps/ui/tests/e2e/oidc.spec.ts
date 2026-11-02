import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

test("single sign-on signs in and keeps the session", async ({ page }) => {
  await visit(page, "/login")

  await page
    .getByRole("button", { name: "Continue with single sign-on" })
    .click()

  await expect(page).toHaveURL(/\/stay-signed-in\?next=%2Fdashboard$/)
  await expect(
    page.getByRole("heading", { name: "Stay signed in?" })
  ).toBeVisible()
  await expect(page.getByText("@kamixfox")).toBeVisible()

  await page.getByRole("button", { name: "Yes, stay signed in" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole("heading", { name: "Welcome back, Testing Account" })
  ).toBeVisible()
})

test("an account can link an identity through the provider", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/settings?tab=security")

  await expect(
    page.getByRole("heading", { name: "Linked identities" })
  ).toBeVisible()

  await page.getByRole("button", { name: "Link identity" }).click()

  await expect(page).toHaveURL(/\/settings\?tab=security$/)
  await expect(
    page.getByRole("heading", { name: "Linked identities" })
  ).toBeVisible()
})
