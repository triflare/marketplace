import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test("owners can read a release source and compare it with another", async ({
  page,
}) => {
  await visit(page, "/@kamixfox/myextension/manage")
  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible()

  await page.getByRole("button", { name: "Source" }).first().click()
  const viewer = page.getByRole("dialog")
  await expect(
    viewer.getByRole("heading", { name: "Source for v0.2.0" })
  ).toBeVisible()
  const viewport = page.viewportSize()
  // The dialog is full-screen; poll past the opening animation, and allow for
  // the scrollbar and the visual viewport.
  await expect
    .poll(async () => (await viewer.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual((viewport?.width ?? 0) - 40)
  await expect
    .poll(async () => (await viewer.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual((viewport?.height ?? 0) - 40)
  await viewer.getByRole("button", { name: "src/index.ts" }).click()
  const sourceRegion = viewer.getByRole("region", {
    name: "src/index.ts source",
  })
  await expect(sourceRegion).toHaveAttribute("data-language", "typescript")
  await expect(sourceRegion.locator(".monaco-editor")).toBeVisible({
    timeout: 45000,
  })
  await expect(sourceRegion).toContainText(
    'export const greeting = "hello world"',
    {
      timeout: 45000,
    }
  )
  await viewer.getByRole("tab", { name: "Built output" }).click()
  const outputRegion = viewer.getByRole("region", {
    name: "extension.js source",
  })
  await expect(outputRegion).toHaveAttribute("data-language", "javascript")
  await expect(outputRegion).toContainText("function add(a, b) {", {
    timeout: 45000,
  })
  await expect(outputRegion).toContainText("return a + b;", {
    timeout: 45000,
  })
  await viewer.getByRole("button", { name: "Prettified" }).click()
  await expect(viewer.getByRole("button", { name: "Minified" })).toBeVisible()
  await expect(outputRegion).toContainText('var greeting="hello world";', {
    timeout: 45000,
  })
  await viewer.getByRole("button", { name: "Close" }).click()

  await page.getByRole("button", { name: "Compare" }).first().click()
  const compare = page.getByRole("dialog")
  await expect(
    compare.getByRole("heading", { name: "Compare versions" })
  ).toBeVisible()
  await expect(compare.getByText(/2 files changed\s*\+2\s*−1/)).toBeVisible()
  await compare.getByRole("button", { name: "src/index.ts" }).click()
  const diffRegion = compare.getByRole("region", {
    name: "Diff for src/index.ts",
  })
  await expect(diffRegion.locator(".monaco-diff-editor")).toBeVisible({
    timeout: 45000,
  })
  await expect(diffRegion).toContainText(
    'export const greeting = "hello world"'
  )
})

test("reviewers can inspect source before deciding on a submission", async ({
  page,
}) => {
  await visit(page, "/admin")
  await expect(
    page.getByRole("heading", { name: "Review queue" })
  ).toBeVisible()
  await expect(page.getByText("MIT License")).toBeVisible()

  await page.getByRole("button", { name: "View source" }).click()
  const viewer = page.getByRole("dialog")
  await expect(
    viewer.getByRole("heading", { name: "Source for v0.3.0" })
  ).toBeVisible()
  await viewer.getByRole("button", { name: "src/index.ts" }).click()
  await expect(
    viewer.getByRole("region", { name: "src/index.ts source" })
  ).toContainText('export const greeting = "hello reviewers"')
  await viewer.getByRole("button", { name: "Close" }).click()

  await page.getByRole("button", { name: "Compare" }).click()
  const compare = page.getByRole("dialog")
  await expect(
    compare.getByRole("heading", { name: "Compare versions" })
  ).toBeVisible()
  await expect(compare.getByText(/1 file changed\s*\+1\s*−1/)).toBeVisible()
})

test("admins edit the profile they are viewing", async ({ page }) => {
  await visit(page, "/@otheruser")
  await expect(
    page.getByRole("heading", { name: "Other Account" })
  ).toBeVisible()

  await page.getByRole("link", { name: "Edit profile" }).click()
  await expect(page).toHaveURL(/\/admin\/users\/otheruser$/)
  await expect(
    page.getByRole("heading", { name: "Edit @otheruser" })
  ).toBeVisible()
  await expect(page.getByLabel("Display name")).toHaveValue("Other Account")
  await expect(page.getByRole("button", { name: "Change avatar" })).toHaveCount(
    0
  )
  await expect(
    page.getByRole("button", { name: "Delete account" })
  ).toHaveCount(0)

  const banner = await page.getByText("No banner").boundingBox()
  expect((banner?.width ?? 0) / (banner?.height ?? 1)).toBeCloseTo(3, 1)

  await page.getByLabel("Display name").fill("Renamed Account")
  await page.getByRole("button", { name: "Save profile" }).click()
  await expect(page.getByText("Profile saved.")).toBeVisible()
})

test("manage tab content fills the panel", async ({ page }) => {
  await visit(page, "/@kamixfox/myextension/manage")
  await page.getByRole("tab", { name: "Version labels" }).click()
  await expect(page.getByText("No version labels yet.")).toBeVisible()

  const content = await page.getByText("No version labels yet.").boundingBox()
  const viewport = page.viewportSize()
  expect(content?.width).toBeGreaterThan((viewport?.width ?? 0) * 0.8)
})

test("notifications remember the unread filter", async ({ page }) => {
  await visit(page, "/notifications")
  await page.getByRole("tab", { name: "Unread" }).click()
  await expect(page.getByText("Nothing unread")).toBeVisible()

  await page.reload()
  await expect(page.getByText("Nothing unread")).toBeVisible()
  await expect(page.getByRole("tab", { name: "Unread" })).toHaveAttribute(
    "aria-selected",
    "true"
  )
})

test("owners can open source from the public extension page", async ({
  page,
}) => {
  await visit(page, "/@kamixfox/myextension")
  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible()
  await expect(page.getByText("MIT License").first()).toBeVisible()

  await page.getByRole("button", { name: "Source" }).first().click()
  const viewer = page.getByRole("dialog")
  await expect(
    viewer.getByRole("heading", { name: "Source for v0.2.0" })
  ).toBeVisible()
  await viewer.getByRole("button", { name: "src/index.ts" }).click()
  await expect(
    viewer.getByRole("region", { name: "src/index.ts source" })
  ).toContainText('export const greeting = "hello world"')
})
