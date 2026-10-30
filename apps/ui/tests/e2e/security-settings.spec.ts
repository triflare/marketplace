import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

const MOCK_API = `http://127.0.0.1:${process.env.MOCK_API_PORT ?? 3200}`

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

test("the email address is shown only once a new one is confirmed", async ({
  page,
}) => {
  await page.request.post(`${MOCK_API}/__email`, {
    data: { email: "old-address@example.test" },
  })
  await signIn(page)
  await visit(page, "/settings?tab=security")

  await expect(page.getByText("old-address@example.test")).toBeVisible()
  await page.getByRole("button", { name: "Change email" }).click()
  await page.getByLabel("New email address").fill("new-address@example.test")
  await page.getByRole("button", { name: "Send code" }).click()

  // The address on the account is unchanged while the code is outstanding.
  await expect(page.getByText(/We sent a six-digit code to/)).toBeVisible()
  await expect(page.getByText("new-address@example.test")).toBeVisible()

  await page.getByLabel("Code").fill("000000")
  await page.getByRole("button", { name: "Confirm email" }).click()
  await expect(
    page.getByText("That code is invalid or has expired.")
  ).toBeVisible()

  await page.getByLabel("Code").fill("123456")
  await page.getByRole("button", { name: "Confirm email" }).click()

  await expect(page.getByText("Email address updated.")).toBeVisible()
  await expect(page.getByText("new-address@example.test")).toBeVisible()
  await expect(page.getByText("old-address@example.test")).toHaveCount(0)
  await expect(page.getByLabel("Code")).toHaveCount(0)
})

test("passkey enrolment is hidden when the driver is turned off", async ({
  page,
}) => {
  // The settings page reads the method set during its server render, so this
  // goes through the mock registry rather than a browser-side interception.
  const advertise = (drivers: string[]) =>
    page.request.post(`${MOCK_API}/__auth`, { data: { drivers } })

  await advertise(["password", "oidc", "device-code"])
  try {
    await signIn(page)
    await visit(page, "/settings?tab=security")

    await expect(
      page.getByRole("heading", { name: "Passkeys and backup codes" })
    ).toBeVisible()
    await expect(
      page.getByText(/Passkeys are turned off on this instance/)
    ).toBeVisible()
    // Registering one is the part that would be refused, so it is absent; the
    // passkey the account already holds stays visible and removable.
    await expect(page.getByRole("button", { name: "Add passkey" })).toHaveCount(
      0
    )
    await expect(page.getByLabel("New passkey label")).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Rename passkey" })
    ).toBeVisible()
  } finally {
    await advertise(["password", "oidc", "passkey", "device-code"])
  }
})
