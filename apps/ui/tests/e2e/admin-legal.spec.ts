import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

test("the legal tab previews documents and edits on demand", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/admin?tab=legal")

  await expect(
    page.getByRole("heading", { name: "Legal documents" })
  ).toBeVisible()

  const terms = page.getByRole("region", { name: "Terms of service" })
  const privacy = page.getByRole("region", { name: "Privacy policy" })

  // Both documents are rendered markdown until an admin asks to change one.
  await expect(terms).toContainText("Mock document.")
  await expect(privacy).toContainText("Mock document.")
  await expect(terms.locator(".monaco-editor")).toHaveCount(0)

  await terms.getByRole("button", { name: "Edit", exact: true }).click()
  const editor = terms.getByRole("region", { name: "terms body" })
  await expect(editor.locator(".monaco-editor")).toBeVisible({
    timeout: 45000,
  })
  await expect(editor).toHaveAttribute("data-language", "markdown")

  await editor.locator(".monaco-editor").click()
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.insertText("# Updated terms")
  await expect(editor).toContainText("# Updated terms")

  // Monaco commits input on the next frame; saving on the same tick can race
  // with the model update and persist the previous body.
  await page.waitForTimeout(300)

  await terms.getByRole("button", { name: "Update terms" }).click()
  await expect(page.getByText("Terms of service updated.")).toBeVisible()

  // The saved body comes back as preview, not as an open editor.
  await expect(
    terms.getByRole("heading", { name: "Updated terms" })
  ).toBeVisible()
  await expect(terms.locator(".monaco-editor")).toHaveCount(0)

  // Saving one document must not rewrite the other.
  await expect(privacy).toContainText("Mock document.")
})

test("the public legal pages render the saved markdown", async ({ page }) => {
  await visit(page, "/terms")

  await expect(
    page.getByRole("heading", { name: "Terms of Service" }).first()
  ).toBeVisible()
  await expect(page.getByText(/^Version \d+$/)).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Something went wrong" })
  ).toHaveCount(0)

  await visit(page, "/privacy")

  await expect(
    page.getByRole("heading", { name: "Privacy Policy" }).first()
  ).toBeVisible()
  await expect(
    page.getByText("This registry doesn’t publish a privacy document.")
  ).toHaveCount(0)
  await expect(
    page.getByRole("heading", { name: "Something went wrong" })
  ).toHaveCount(0)
})

test("the registry tab no longer hosts the legal editors", async ({ page }) => {
  await signIn(page)
  await visit(page, "/admin?tab=instance")

  await expect(page.getByRole("tab", { name: "Legal" })).toBeVisible()
  await expect(page.getByRole("region", { name: "terms body" })).toHaveCount(0)
})
