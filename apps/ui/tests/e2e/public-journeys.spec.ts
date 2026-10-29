import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

test("home page leads to browsing and publishing", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))

  await visit(page, "/")
  await expect(page).toHaveTitle("Extensions for TurboWarp · TwextHub")
  await expect(
    page.getByRole("heading", {
      name: "Extensions for TurboWarp, built with Twext.",
    })
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "Browse all" })).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Developer guide" }).first()
  ).toBeVisible()
  await expect(page.getByText("TwextHubKit")).toHaveCount(0)
  // A cold dev server reloads the first document once while it optimizes its
  // dependencies; that stray, dev-only error is not an app failure.
  expect(
    errors.filter((message) => !message.includes("dynamically imported module"))
  ).toEqual([])
})

test("extension page explains how to install", async ({ page }) => {
  await visit(page, "/@kamixfox/myextension")
  await expect(page).toHaveTitle("Hello · TwextHub")
  await expect(
    page.getByRole("heading", {
      name: "Install in TurboWarp, PenguinMod, or MistWarp",
    })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Copy TurboWarp link" })
  ).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "Copy PenguinMod link" })
  ).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "Copy MistWarp link" })
  ).toBeEnabled()
  await expect(
    page.getByText("Every published release, newest first.")
  ).toBeVisible()
})

test("unsandboxed extensions can't be installed in TurboWarp by link", async ({
  page,
}) => {
  await visit(page, "/@kamixfox/unsandboxed")

  await expect(
    page.getByRole("button", { name: "Copy TurboWarp link" })
  ).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Copy PenguinMod link" })
  ).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "Copy MistWarp link" })
  ).toBeEnabled()
  await expect(
    page.getByText(/TurboWarp can’t load an unsandboxed extension from a link/)
  ).toBeVisible()
})

test("footer links to the registry feed", async ({ page }) => {
  await visit(page, "/")
  const feed = page.getByRole("link", { name: "Feed" })
  await expect(feed).toHaveAttribute("type", "application/atom+xml")
  await expect(feed).toHaveAttribute("href", /\/v2\/feed\.atom$/)
})

test("extension page offers a badge for each fact", async ({ page }) => {
  await visit(page, "/@kamixfox/myextension")

  // The preview comes from this app's server, which fetches the SVG, so no
  // request leaves the browser for the registry.
  const badge = page.getByRole("img", { name: "myextension badge" })
  await expect(badge).toHaveAttribute("src", "/__badge/@kamixfox/myextension")
  await expect
    .poll(() => badge.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)

  const viewSvg = page.getByRole("link", { name: "View SVG badge" })
  await expect(viewSvg).toHaveAttribute(
    "href",
    "/__badge/@kamixfox/myextension"
  )

  // What gets pasted into a README names the registry instead: there the badge
  // is rendered on someone else's page, outside this server.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await page.getByRole("button", { name: "Copy badge markdown" }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("/v2/badge/@kamixfox/myextension)")

  await page.getByLabel("Badge contents").click()
  await page.getByRole("option", { name: "Downloads", exact: true }).click()
  await expect(viewSvg).toHaveAttribute(
    "href",
    "/__badge/@kamixfox/myextension/downloads"
  )
  await expect(badge).toHaveAttribute(
    "src",
    "/__badge/@kamixfox/myextension/downloads"
  )

  await page.getByLabel("Badge contents").click()
  await page.getByRole("option", { name: "Version", exact: true }).click()
  await expect(viewSvg).toHaveAttribute(
    "href",
    "/__badge/@kamixfox/myextension/version"
  )
})

test("the badge proxy serves badges and nothing else", async ({ request }) => {
  const badge = await request.get("/__badge/@kamixfox/myextension")
  expect(badge.status()).toBe(200)
  expect(badge.headers()["content-type"]).toContain("image/svg+xml")
  expect(badge.headers()["cache-control"]).toContain("max-age=300")
  expect(await badge.text()).toContain("<svg")

  // An address the registry would not answer still never reaches it.
  expect(
    (await request.get("/__badge/@kamixfox/myextension/spam")).status()
  ).toBe(404)
  expect((await request.get("/__badge/@kamixfox")).status()).toBe(404)
})

test("browse filters can be removed one at a time", async ({ page }) => {
  await visit(page, "/explore?q=hello")
  await expect(
    page.getByRole("heading", { name: "Results for “hello”" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Remove Search: hello" }).click()
  await expect(
    page.getByRole("heading", { name: "Browse extensions" })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/explore$/)
})

test("mobile navigation stays available below tablet width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 900 })
  await visit(page, "/")
  await page.getByRole("button", { name: "Open menu" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByRole("link", { name: "Browse" }).first()).toBeVisible()
  await expect(
    page.getByRole("link", { name: "For developers" }).first()
  ).toBeVisible()
})

test("device page sends a signed-out visitor through sign-in", async ({
  page,
}) => {
  await visit(page, "/device")
  await expect(
    page.getByRole("heading", { name: "Device activation" })
  ).toBeVisible()

  await page.getByLabel("Code").fill("abcd efgh")
  await expect(page.getByLabel("Code")).toHaveValue("ABCD-EFGH")
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(page).toHaveURL(
    /\/login\?next=%2Fdevice%3Fuser_code%3DABCD-EFGH/
  )
})

test("device page approves a signed-in CLI sign-in", async ({ page }) => {
  await signIn(page)
  await visit(page, "/device?user_code=ABCD-EFGH")

  await expect(
    page.getByRole("heading", { name: "Authorize Twext CLI?" })
  ).toBeVisible()
  await expect(page.getByText("@kamixfox").first()).toBeVisible()

  await page.getByRole("button", { name: "Authorize device" }).click()
  await expect(
    page.getByRole("heading", { name: "Device authorized" })
  ).toBeVisible()
})
