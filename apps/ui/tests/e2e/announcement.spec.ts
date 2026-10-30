import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

const MOCK_API = `http://127.0.0.1:${process.env.MOCK_API_PORT ?? 3200}`

// The banner is read by the root loader on every page, so these run one at a
// time and each leaves the mock without one.
test.describe.configure({ mode: "serial" })

async function announce(
  page: import("@playwright/test").Page,
  banner: { message?: string; link?: string } = {}
) {
  const response = await page.request.post(`${MOCK_API}/__banner`, {
    data: banner,
  })
  expect(response.ok()).toBeTruthy()
}

test.afterEach(async ({ page }) => {
  await announce(page)
})

test("an announcement is read with the page and sits above the header", async ({
  page,
}) => {
  await announce(page, {
    message: "Scheduled maintenance at 02:00 UTC.",
    link: "https://status.example.test",
  })
  await visit(page, "/")

  // The text is rendered twice so the scroll loops seamlessly; either copy is
  // the same sentence.
  await expect(
    page.getByText("Scheduled maintenance at 02:00 UTC.").first()
  ).toBeVisible()

  const details = page.getByRole("link", { name: "Details" })
  await expect(details).toHaveAttribute("href", "https://status.example.test")

  // It is a strip at the top of the document, not a notice inside the page.
  const track = page.locator(".announcement-track").first()
  const bannerBox = await track.boundingBox()
  const headerBox = await page.getByRole("banner").boundingBox()
  expect(bannerBox).not.toBeNull()
  expect(headerBox).not.toBeNull()
  expect(bannerBox!.y).toBeLessThan(headerBox!.y)
})

test("an announcement without a link has no details link", async ({ page }) => {
  await announce(page, { message: "Auth methods changed today." })
  await visit(page, "/login")

  await expect(page.getByText("Auth methods changed today.").first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Details" })).toHaveCount(0)
})

test("an announcement saved in the admin settings appears without a reload", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/admin?tab=instance")

  const field = page.getByLabel("Announcement banner")
  const save = page.getByRole("button", { name: "Save changes" })

  await field.fill("Sign-in now uses a passkey.\nPassword sign-in was retired.")
  await save.click()
  await expect(page.getByText("Configuration saved.")).toBeVisible()

  // The strip is part of the root loader's data, so it only shows up here
  // because the save revalidated that loader; a reload would not prove it.
  await expect(page.locator(".announcement-track").first()).toContainText(
    "Sign-in now uses a passkey. Password sign-in was retired."
  )

  await field.fill("")
  await save.click()
  await expect(page.locator(".announcement-track")).toHaveCount(0)
})

test("no announcement means no strip at all", async ({ page }) => {
  await announce(page)
  await visit(page, "/")

  await expect(page.locator(".announcement-track")).toHaveCount(0)
  await expect(page.getByText("Notice", { exact: true })).toHaveCount(0)
})
