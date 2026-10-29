import { expect, test, type Page } from "@playwright/test"

import { signIn, visit, waitForHydration } from "./helpers"

/**
 * Changing accounts reloads the document, because everything on the page was
 * fetched as the account that is being left. The fresh document has to hydrate
 * before its menu can be clicked again.
 */
async function waitForReload(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.clientReady !== "true"
  )
  await waitForHydration(page)
}

async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: /^Account menu for/ }).click()
}

/** Signs the second mock account in through the account menu. */
async function addOtherAccount(page: Page) {
  await openAccountMenu(page)
  await page.getByRole("menuitem", { name: "Switch accounts" }).click()
  await page.getByRole("menuitem", { name: "Add another account" }).click()

  await expect(
    page.getByRole("heading", { name: "Add another account" })
  ).toBeVisible()
  await page.getByLabel("Handle").fill("otheruser")
  await page.getByLabel("Password").fill("testing-password")
  await page.getByRole("button", { name: "Add account" }).click()

  await page.getByRole("button", { name: "Yes, stay signed in" }).click()
}

test("a second account can be added and switched to from the menu", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/dashboard")
  await expect(
    page.getByRole("heading", { name: "Welcome back, Testing Account" })
  ).toBeVisible()

  await addOtherAccount(page)

  // The added account takes over, and the browser still holds the first one.
  await expect(
    page.getByRole("heading", { name: "Welcome back, Other Account" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Account menu for Other Account" })
  ).toBeVisible()

  await openAccountMenu(page)
  await page.getByRole("menuitem", { name: "Switch accounts" }).click()

  const submenu = page.getByRole("menu").last()
  await expect(
    submenu.getByRole("menuitem", { name: /Other Account/ })
  ).toBeDisabled()
  await expect(
    submenu.getByRole("menuitem", { name: /Testing Account/ })
  ).toBeEnabled()

  await submenu.getByRole("menuitem", { name: /Testing Account/ }).click()
  await waitForReload(page)

  // Nothing the first account had loaded is left on the page.
  await expect(
    page.getByRole("heading", { name: "Welcome back, Testing Account" })
  ).toBeVisible()
})

test("signing out leaves the other account signed in", async ({ page }) => {
  await signIn(page)
  await visit(page, "/dashboard")
  await addOtherAccount(page)

  await openAccountMenu(page)
  await page.getByRole("menuitem", { name: "Sign out of @otheruser" }).click()
  await waitForReload(page)

  // The account that was signed in first is now the one in use.
  await expect(
    page.getByRole("heading", { name: "Welcome back, Testing Account" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Account menu for Testing Account" })
  ).toBeVisible()

  await openAccountMenu(page)
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible()
  await expect(
    page.getByRole("menuitem", { name: /Sign out of @/ })
  ).toHaveCount(0)
})

test("a phone can add and switch accounts from the menu sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signIn(page)
  await visit(page, "/dashboard")

  await page.getByRole("button", { name: "Open menu" }).click()
  await page.getByRole("link", { name: "Add another account" }).click()

  await expect(
    page.getByRole("heading", { name: "Add another account" })
  ).toBeVisible()
  await page.getByLabel("Handle").fill("otheruser")
  await page.getByLabel("Password").fill("testing-password")
  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByRole("button", { name: "Yes, stay signed in" }).click()

  await expect(
    page.getByRole("heading", { name: "Welcome back, Other Account" })
  ).toBeVisible()

  await page.getByRole("button", { name: "Open menu" }).click()
  await expect(page.getByText("Switch accounts")).toBeVisible()
  await page.getByRole("button", { name: /Testing Account/ }).click()
  await waitForReload(page)

  await expect(
    page.getByRole("heading", { name: "Welcome back, Testing Account" })
  ).toBeVisible()
})

test("signing out of the last account returns to the home page", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/dashboard")

  await openAccountMenu(page)
  await page.getByRole("menuitem", { name: "Sign out" }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible()
})
