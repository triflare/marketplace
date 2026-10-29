import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

test("manage tabs are addressable through the URL", async ({ page }) => {
  await signIn(page)
  await visit(page, "/@kamixfox/myextension/manage?tab=access")

  await expect(
    page.getByRole("heading", { name: "People with access" })
  ).toBeVisible()

  await page.getByRole("tab", { name: "Automation" }).click()

  await expect(page).toHaveURL(/[?&]tab=automation/)
  await expect(
    page.getByRole("heading", { name: "Delivery notifications" })
  ).toBeVisible()

  // A reload has to land on the same panel, not back on Releases.
  await visit(page, page.url())
  await expect(
    page.getByRole("heading", { name: "Delivery notifications" })
  ).toBeVisible()
})

test("old manage tab names still resolve", async ({ page }) => {
  await signIn(page)
  await visit(page, "/@kamixfox/myextension/manage?tab=versions")

  await expect(page.getByRole("heading", { name: "Releases" })).toBeVisible()
})

test("removing a release asks for the version to be typed", async ({ page }) => {
  await signIn(page)
  await visit(page, "/@kamixfox/myextension/manage?tab=releases")

  await page.getByRole("button", { name: "Remove release" }).first().click()

  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Remove v0.2.0?" })
  ).toBeVisible()

  const confirm = dialog.getByRole("button", { name: "Remove release" })
  await expect(confirm).toBeDisabled()

  await dialog.getByLabel(/Type v0\.2\.0 to confirm/).fill("v0.2.0")
  await expect(confirm).toBeEnabled()

  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toHaveCount(0)
})
