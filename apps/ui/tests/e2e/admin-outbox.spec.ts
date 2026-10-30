import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

const MOCK_API = `http://127.0.0.1:${process.env.MOCK_API_PORT ?? 3200}`

// Retrying a message changes the outbox, so these run one at a time and each
// starts from the state the mock documents.
test.describe.configure({ mode: "serial" })

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post(`${MOCK_API}/__reset`)
  expect(reset.ok()).toBeTruthy()
  await signIn(page)
})

test("the outbox lists deliveries and reads the body of one", async ({
  page,
}) => {
  await visit(page, "/admin?tab=outbox")

  await expect(page.getByRole("heading", { name: "Mail outbox" })).toBeVisible()
  await expect(page.getByText("Sign in to the registry")).toBeVisible()
  await expect(page.getByText("Your extension was reviewed")).toBeVisible()

  // The list names the outcome; the body is one dialog further in, because it
  // can carry a one-time link.
  await expect(page.getByText(/token=abc123/)).toHaveCount(0)
  await page
    .getByRole("row", { name: /Your extension was reviewed/ })
    .getByRole("button", { name: "Read" })
    .click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("greeter@1.2.0 was approved and is live.")
  await expect(dialog).toContainText("The mail provider answered 502.")
})

test("a failed message can be sent again from the list", async ({ page }) => {
  await visit(page, "/admin?tab=outbox")

  const row = page.getByRole("row", { name: /Your extension was reviewed/ })
  await expect(row.getByText("failed")).toBeVisible()
  await row.getByRole("button", { name: "Retry" }).click()

  await expect(page.getByText("The message was delivered.")).toBeVisible()

  // The retry records the attempt on the same row, so the message does not
  // appear twice and the row says it was sent.
  await expect(
    page.getByRole("row", { name: /Your extension was reviewed/ })
  ).toContainText("sent")
  await expect(page.getByText("Your extension was reviewed")).toHaveCount(1)
})

test("the filter narrows the list to one outcome", async ({ page }) => {
  await visit(page, "/admin?tab=outbox")

  await page.getByLabel("Filter messages").click()
  await page.getByRole("option", { name: "Failed" }).click()

  await expect(page.getByText("Your extension was reviewed")).toBeVisible()
  await expect(page.getByText("Sign in to the registry")).toHaveCount(0)
})

test("a delivered message is not offered for another send", async ({
  page,
}) => {
  await visit(page, "/admin?tab=outbox")

  const row = page.getByRole("row", { name: /Sign in to the registry/ })
  await expect(row.getByText("sent")).toBeVisible()
  await expect(row.getByRole("button", { name: "Retry" })).toHaveCount(0)

  await row.getByRole("button", { name: "Read" }).click()
  const dialog = page.getByRole("dialog")

  // The formatted body is what the recipient saw, rendered in a frame that
  // cannot run scripts or touch the admin page.
  const formatted = dialog.frameLocator('iframe[title="Message HTML body"]')
  await expect(
    formatted.getByRole("link", { name: "Sign in", exact: true })
  ).toBeVisible()

  // The plain part is one click away: it is what a client without HTML got,
  // and it carries the same one-time link.
  await dialog.getByRole("button", { name: "Plain text" }).click()
  await expect(dialog).toContainText("token=abc123")
  await expect(dialog.getByRole("button", { name: "Send again" })).toHaveCount(
    0
  )
})
