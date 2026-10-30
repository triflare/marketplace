import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

const exploreSearch = (page: import("@playwright/test").Page) =>
  page.getByLabel("Search", { exact: true })

test("browsing results update while typing", async ({ page }) => {
  await visit(page, "/explore")

  await exploreSearch(page).click()
  await page.keyboard.type("hello", { delay: 60 })

  await expect(page).toHaveURL(/[?&]q=hello/)
  // The URL update must not remount the field out from under the typist.
  await expect(exploreSearch(page)).toBeFocused()
  await expect(
    page.getByRole("heading", { name: "Results for “hello”" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Remove Search: hello" })
  ).toBeVisible()
})

test("Escape clears the browse search", async ({ page }) => {
  await visit(page, "/explore?q=hello")
  await expect(exploreSearch(page)).toHaveValue("hello")

  await exploreSearch(page).press("Escape")

  await expect(page).toHaveURL(/\/explore$/)
  await expect(exploreSearch(page)).toHaveValue("")
  await expect(
    page.getByRole("heading", { name: "Browse extensions" })
  ).toBeVisible()
})

test("slash jumps to the browse search", async ({ page }) => {
  await visit(page, "/explore")

  await page.keyboard.press("/")

  await expect(exploreSearch(page)).toBeFocused()
})

test("Ctrl+K opens the command palette from the home page", async ({
  page,
}) => {
  await visit(page, "/")

  await page.keyboard.press("Control+k")

  const palette = page.getByRole("dialog")
  await expect(
    palette.getByRole("combobox", { name: "Search pages and extensions" })
  ).toBeFocused()

  await page.keyboard.type("browse")
  await page.keyboard.press("Enter")

  await expect(page).toHaveURL(/\/explore$/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("the command palette finds extensions as well as pages", async ({
  page,
}) => {
  await visit(page, "/")
  await page.keyboard.press("Control+k")

  await page.keyboard.type("hello")

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("option", { name: /Hello/ })).toBeVisible()
  await dialog.getByRole("option", { name: /Hello/ }).click()

  await expect(page).toHaveURL(/\/@kamixfox\/myextension$/)
})

test("the phone search button opens the menu with the field ready", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await visit(page, "/")

  await page.getByRole("button", { name: "Open search" }).click()

  const sheet = page.getByRole("dialog")
  await expect(sheet).toBeVisible()
  await expect(sheet.getByLabel("Search extensions")).toBeFocused()

  await sheet.getByLabel("Search extensions").fill("hello")
  await sheet.getByLabel("Search extensions").press("Enter")

  await expect(page).toHaveURL(/\/explore\?q=hello$/)
  await expect(sheet).toHaveCount(0)
})

test("a slow navigation marks the page busy and shows progress", async ({
  page,
}) => {
  await visit(page, "/")

  // Client navigations fetch the next route's data; hold it so the pending
  // state is observable instead of racing the mock registry.
  await page.route("**/*.data", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.continue()
  })

  await page.getByRole("link", { name: "Browse all" }).click()

  await expect(page.locator("main")).toHaveAttribute("aria-busy", "true")
  await expect(page.getByTestId("navigation-progress")).toBeVisible()

  await expect(
    page.getByRole("heading", { name: "Browse extensions" })
  ).toBeVisible()
  await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true")
  await expect(page.getByTestId("navigation-progress")).toHaveCount(0)
})

test("publishing offers the useful next steps", async ({ page }) => {
  await signIn(page)
  await visit(page, "/publish")

  await page.getByText("Upload a project archive instead").click()
  await page.getByLabel("Publisher handle").fill("kamixfox")
  await page.getByLabel("Extension ID").fill("myextension")
  await page.getByLabel("Project archive").setInputFiles({
    name: "myextension.tar.gz",
    mimeType: "application/gzip",
    buffer: Buffer.from("mock project archive"),
  })
  await page.getByRole("button", { name: "Upload project" }).click()

  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "v0.4.0 was uploaded" })
  ).toBeVisible()
  await expect(
    dialog.getByRole("link", { name: /Open the extension page/ })
  ).toHaveAttribute("href", "/@kamixfox/myextension")
  await expect(
    dialog.getByRole("link", { name: /Manage releases/ })
  ).toHaveAttribute("href", "/@kamixfox/myextension/manage?tab=releases")

  await dialog.getByRole("button", { name: /Publish another archive/ }).click()
  await expect(page.getByLabel("Extension ID")).toHaveValue("")
})

test("a new automation token explains the next steps", async ({ page }) => {
  await signIn(page)
  await visit(page, "/settings?tab=tokens")

  await page.getByRole("button", { name: "New token" }).click()
  await page.getByLabel("Name").fill("Release workflow")
  await page.getByRole("button", { name: "Create token" }).click()

  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Copy the token now" })
  ).toBeVisible()
  await expect(dialog.getByText("triflare_test_secret_value")).toBeVisible()
  await expect(dialog.getByText("Next steps")).toBeVisible()
  await expect(dialog.getByText("TRIFLARE_TOKEN")).toBeVisible()

  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(dialog).toHaveCount(0)
})
