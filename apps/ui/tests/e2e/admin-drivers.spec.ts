import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

test("the drivers tab edits a driver and starts from what was saved", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/admin?tab=drivers")

  await expect(page.getByRole("heading", { name: "Drivers" })).toBeVisible()
  await expect(
    page.getByText("revision", { exact: false }).first()
  ).toBeVisible()

  await page.getByRole("button", { name: "Change the mail drivers" }).click()

  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Change the mail drivers" })
  ).toBeVisible()

  // The form is generated from the driver's own option schema, so the field
  // the server publishes is the field that is editable.
  await dialog.getByLabel("Directory").fill("queued-mail")
  await dialog.getByRole("button", { name: "Save drivers" }).click()

  await expect(page.getByText("Drivers updated.")).toBeVisible()
  await expect(dialog).toBeHidden()

  // Reopening reads the catalog back, so the value the registry stored is what
  // the form starts from rather than the draft that was saved.
  await page.getByRole("button", { name: "Change the mail drivers" }).click()
  await expect(page.getByRole("dialog").getByLabel("Directory")).toHaveValue(
    "queued-mail"
  )
})

test("a secret already stored is never shown, only that it is set", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/admin?tab=drivers")

  await page.getByRole("button", { name: "Change the auth drivers" }).click()

  const dialog = page.getByRole("dialog")
  const secret = dialog.getByLabel("Client secret")
  await expect(secret).toHaveValue("")
  await expect(secret).toHaveAttribute(
    "placeholder",
    "Set — leave blank to keep"
  )

  // Saving without typing leaves the stored secret alone rather than wiping it.
  await dialog.getByRole("button", { name: "Save drivers" }).click()
  await expect(page.getByText("Drivers updated.")).toBeVisible()
  await expect(dialog).toBeHidden()

  await page.getByRole("button", { name: "Change the auth drivers" }).click()
  await expect(
    page.getByRole("dialog").getByLabel("Client secret")
  ).toHaveAttribute("placeholder", "Set — leave blank to keep")
})

test("the process can be reloaded and restarted", async ({ page }) => {
  await signIn(page)
  await visit(page, "/admin?tab=drivers")

  const process = page.getByRole("heading", { name: "Process" })
  await expect(process).toBeVisible()

  // A reload rebuilds the server, and the sections holding a copy of it read
  // it again — the page stays put.
  await page.getByRole("button", { name: "Reload configuration" }).click()
  await expect(page.getByText("Configuration reloaded.")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Drivers" })).toBeVisible()

  await page.getByRole("button", { name: "Restart process" }).click()
  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Restart the process?" })
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Restart now" }).click()
  await expect(
    page.getByText("Restarting. This page will reconnect when it is back.")
  ).toBeVisible()
})
