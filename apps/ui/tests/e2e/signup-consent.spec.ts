import { expect, test } from "@playwright/test"

import { visit } from "./helpers"

// The password pane refuses to create an account until the privacy box is
// ticked, and sends the version it showed. The RPC call is answered here so the
// journey adds no account to the shared mock registry.
test("signup requires and records the accepted privacy version", async ({
  page,
}) => {
  let created: { privacyAcceptedVersion?: unknown } | null = null

  await page.route("**/__api", async (route) => {
    const body = route.request().postDataJSON() as {
      path?: string[]
      args?: Array<{ type: string; value?: unknown }>
    } | null
    if (body?.path?.[0] !== "users" || body.path[1] !== "create") {
      return route.continue()
    }
    created = (body.args?.[0]?.value ?? null) as {
      privacyAcceptedVersion?: unknown
    } | null
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: {
          type: "json",
          value: {
            token: "test-token-consenttest",
            user: {
              namespace: "consenttest",
              displayName: "Consent Test",
              kind: "user",
              role: "normal",
              hasPublished: false,
              bio: "",
              website: null,
              github: null,
              avatarUrl: null,
              bannerUrl: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              termsAcceptedVersion: 1,
              termsAcceptedAt: "2026-01-01T00:00:00.000Z",
              privacyAcceptedVersion: 1,
              privacyAcceptedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        },
      }),
    })
  })

  await visit(page, "/signup")
  await page.locator("#signup-namespace").fill("consenttest")
  await page.locator("#signup-password").fill("testing-password")
  await page.locator("#signup-confirm").fill("testing-password")

  // The single-sign-on pane has its own box; this journey is the password pane.
  const consent = page
    .locator("form")
    .filter({ has: page.locator("#signup-namespace") })
    .getByRole("checkbox", { name: /privacy policy/ })
  await expect(consent).not.toBeChecked()

  await page.getByRole("button", { name: "Create account" }).click()
  await expect(
    page.getByText("Accept the privacy policy to create an account.")
  ).toBeVisible()
  expect(created).toBeNull()

  await consent.click()
  await expect(consent).toBeChecked()
  await page.getByRole("button", { name: "Create account" }).click()
  await expect.poll(() => created?.privacyAcceptedVersion).toBe(1)
})
