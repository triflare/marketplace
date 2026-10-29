import { expect, test } from "@playwright/test"

import { visit } from "./helpers"

test("an extension embed renders without the site chrome", async ({ page }) => {
  await visit(page, "/embed/@kamixfox/myextension?theme=dark&size=full")

  await expect(page.getByRole("link", { name: "Hello" })).toBeVisible()
  await expect(page.getByText("@kamixfox/myextension")).toBeVisible()
  await expect(page.getByText("v0.2.0")).toBeVisible()
  await expect(page.getByText(/downloads · MIT/)).toBeVisible()
  await expect(page.getByRole("link", { name: "TwextHub" })).toBeVisible()

  await expect(page.getByRole("navigation", { name: "Footer" })).toHaveCount(0)
  await expect(page.getByRole("banner")).toHaveCount(0)
  await expect(page.locator(".dark")).toHaveCount(1)
})

test("a compact extension embed hides the description", async ({ page }) => {
  await visit(page, "/embed/@kamixfox/myextension?size=compact")

  await expect(page.getByText("@kamixfox/myextension")).toBeVisible()
  await expect(page.getByText(/A minimal hello world extension/)).toHaveCount(0)
})

test("a profile embed shows the publisher", async ({ page }) => {
  await visit(page, "/embed/@kamixfox?size=full")

  await expect(page.getByText("Testing Account")).toBeVisible()
  await expect(page.getByText("@kamixfox", { exact: true })).toBeVisible()
  await expect(page.getByText(/Testing hello world/)).toBeVisible()
})

test("an unknown handle renders a not available card", async ({ page }) => {
  await visit(page, "/embed/nobody")

  await expect(page.getByText("Not available")).toBeVisible()
  await expect(page.getByText(/isn’t published/)).toBeVisible()
})

test("the embeds page previews each card and copies its snippet", async ({
  page,
}) => {
  await visit(page, "/embeds")

  await expect(page.getByRole("heading", { name: "Embeds" })).toBeVisible()

  const extensionSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Extension card" }) })
  const preview = extensionSection.getByTitle("Extension card preview")
  await expect(preview).toHaveAttribute(
    "src",
    /\/embed\/@kamixfox\/myextension\?theme=light&size=full$/
  )

  await extensionSection.getByLabel("Theme").click()
  await page.getByRole("option", { name: "Dark", exact: true }).click()
  await expect(preview).toHaveAttribute("src", /theme=dark/)

  await extensionSection.getByLabel("Size").click()
  await page.getByRole("option", { name: "Compact", exact: true }).click()
  await expect(preview).toHaveAttribute("src", /size=compact/)

  await expect(extensionSection.locator("code").first()).toContainText(
    'width="360" height="132"'
  )
})

test("the footer leads to the embeds page", async ({ page }) => {
  await visit(page, "/")
  await page.getByRole("link", { name: "Embeds" }).click()
  await expect(page).toHaveURL(/\/embeds$/)
})
