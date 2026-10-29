import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

test("a passkey can be renamed from security settings", async ({ page }) => {
  await signIn(page)
  await visit(page, "/settings?tab=security")

  await expect(
    page.getByRole("heading", { name: "Passkeys and backup codes" })
  ).toBeVisible()

  await page.getByRole("button", { name: "Rename passkey" }).click()
  const label = page.getByLabel("Passkey label", { exact: true })
  await expect(label).toHaveValue(/./)

  await label.fill("Desk key")
  await page.getByRole("button", { name: "Save" }).click()

  await expect(page.getByText("Passkey renamed.")).toBeVisible()
  await expect(page.getByText("Desk key")).toBeVisible()
  await expect(page.getByLabel("Passkey label", { exact: true })).toHaveCount(0)
})

test("renaming a passkey can be cancelled without saving", async ({ page }) => {
  await signIn(page)
  await visit(page, "/settings?tab=security")

  await page.getByRole("button", { name: "Rename passkey" }).click()
  await page.getByLabel("Passkey label", { exact: true }).fill("Discarded")
  await page.getByRole("button", { name: "Cancel" }).click()

  await expect(page.getByLabel("Passkey label", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Discarded")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Rename passkey" })
  ).toBeVisible()
})
