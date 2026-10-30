import { expect, test, type Page } from "@playwright/test"

import { signIn, visit } from "./helpers"

const MOCK_API = `http://127.0.0.1:${process.env.MOCK_API_PORT ?? 3200}`

// These journeys promote, cap, and delete accounts, so they run one at a time
// and each starts from the registry state the mock documents.
test.describe.configure({ mode: "serial" })

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post(`${MOCK_API}/__reset`)
  expect(reset.ok()).toBeTruthy()
  await signIn(page)
})

function row(page: Page, namespace: string) {
  return page.getByRole("listitem").filter({ hasText: `@${namespace}` })
}

async function openModeration(page: Page, namespace: string) {
  await row(page, namespace)
    .getByRole("button", { name: `Moderation for @${namespace}` })
    .click()
}

test("the users tab lists every account with its role and profile", async ({
  page,
}) => {
  await visit(page, "/admin?tab=users")
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible()

  const admin = row(page, "kamixfox")
  await expect(
    admin.getByRole("link", { name: /Testing Account/ })
  ).toHaveAttribute("href", "/@kamixfox")
  await expect(admin.getByText("admin", { exact: true })).toBeVisible()
  await expect(admin.getByText("(you)")).toBeVisible()

  const plain = row(page, "promoteme")
  await expect(
    plain.getByRole("link", { name: /Promotable Account/ })
  ).toHaveAttribute("href", "/@promoteme")
  await expect(plain.getByText("admin", { exact: true })).toHaveCount(0)

  // An admin cannot take their own role away or delete themselves from here.
  await openModeration(page, "kamixfox")
  await expect(
    page.getByRole("menuitem", { name: "Remove admin" })
  ).toBeDisabled()
  await expect(
    page.getByRole("menuitem", { name: "Delete account" })
  ).toBeDisabled()
})

test("an admin can give an account the admin role and take it back", async ({
  page,
}) => {
  await visit(page, "/admin?tab=users")

  await openModeration(page, "promoteme")
  await page.getByRole("menuitem", { name: "Make admin" }).click()
  await expect(page.getByText("@promoteme is an admin now.")).toBeVisible()
  await expect(
    row(page, "promoteme").getByText("admin", { exact: true })
  ).toBeVisible()

  await openModeration(page, "promoteme")
  await page.getByRole("menuitem", { name: "Remove admin" }).click()
  await expect(
    page.getByText("@promoteme is no longer an admin.")
  ).toBeVisible()
  await expect(
    row(page, "promoteme").getByText("admin", { exact: true })
  ).toHaveCount(0)
})

test("a storage limit set from a row rescales that account's meter", async ({
  page,
}) => {
  await visit(page, "/admin?tab=users")
  await openModeration(page, "promoteme")
  await page.getByRole("menuitem", { name: "Storage limit…" }).click()

  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Storage limit for @promoteme" })
  ).toBeVisible()

  const meter = dialog.getByRole("progressbar", {
    name: "Storage used by @promoteme",
  })
  // 5 MB of the 64 MB registry default.
  await expect(meter).toHaveAttribute(
    "aria-valuetext",
    "5 MB of 64 MB used (8%)"
  )
  await expect(dialog.getByText("Default limit")).toBeVisible()
  await expect(dialog.getByText(/registry default 64 MB/)).toBeVisible()
  await expect(dialog.getByText("59 MB left")).toBeVisible()

  // A custom cap replaces the default and rescales the bar.
  await dialog.getByLabel("Maximum bytes").fill(String(10 * 1024 * 1024))
  await expect(dialog.getByText("That is 10 MB.")).toBeVisible()
  await dialog.getByRole("button", { name: "Save limit" }).click()

  await expect(dialog.getByText("Custom limit")).toBeVisible()
  await expect(meter).toHaveAttribute(
    "aria-valuetext",
    "5 MB of 10 MB used (50%)"
  )
  await expect(meter).toHaveAttribute("aria-valuenow", "50")

  // A cap below current usage is allowed, and the meter says so plainly.
  await dialog.getByLabel("Maximum bytes").fill(String(4 * 1024 * 1024))
  await dialog.getByRole("button", { name: "Save limit" }).click()

  await expect(meter).toHaveAttribute(
    "aria-valuetext",
    "5 MB of 4 MB used (125%)"
  )
  await expect(dialog.getByText("1 MB over")).toBeVisible()
  await expect(dialog.getByText(/Over the limit/)).toBeVisible()

  // Clearing the field hands the account back to the registry default.
  await dialog.getByRole("button", { name: "Use the default" }).click()
  await dialog.getByRole("button", { name: "Save limit" }).click()

  await expect(dialog.getByText("Default limit")).toBeVisible()
  await expect(meter).toHaveAttribute(
    "aria-valuetext",
    "5 MB of 64 MB used (8%)"
  )
})

test("deleting an account takes it off the registry", async ({ page }) => {
  // A throwaway account, so the shared test accounts survive the journey.
  const created = await page.request.post(`${MOCK_API}/v1/users`, {
    data: {
      namespace: "spamuser",
      password: "spam-account-password",
      displayName: "Spam Account",
    },
  })
  expect(created.ok()).toBeTruthy()

  await visit(page, "/admin?tab=users")
  await expect(row(page, "spamuser").getByText("Spam Account")).toBeVisible()

  await openModeration(page, "spamuser")
  await page.getByRole("menuitem", { name: "Delete account" }).click()

  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Delete @spamuser?" })
  ).toBeVisible()

  // The exact handle is required, so an account cannot be removed by a
  // mis-click, and the confirmation button is dead until it is typed.
  const confirm = dialog.getByRole("button", { name: "Delete account" })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/Type @spamuser to confirm/).fill("@spamuser")
  await confirm.click()

  await expect(page.getByText("@spamuser was deleted.")).toBeVisible()
  await expect(row(page, "spamuser")).toHaveCount(0)
})
