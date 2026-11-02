import { expect, type Page } from "@playwright/test"

/**
 * Signs the browser context in through the app's own gateway. The API request
 * context shares cookies with the page, so every later navigation is signed in.
 */
export async function waitForHydration(page: Page, timeout = 30_000) {
  await page.waitForFunction(
    () => document.documentElement.dataset.clientReady === "true",
    null,
    { timeout }
  )
}

export async function visit(page: Page, path: string) {
  await page.goto(path)
  try {
    await waitForHydration(page, 10_000)
  } catch {
    // On a cold cache the dev server optimizes dependencies while the first
    // document is already streaming, and its reload can land on stale module
    // URLs that never hydrate. A fresh visit gets the warmed server.
    await page.reload()
    await waitForHydration(page)
  }
}

export async function signIn(page: Page) {
  const response = await page.request.post("/__api", {
    data: {
      path: ["sessions", "create"],
      args: [
        {
          type: "json",
          value: { namespace: "kamixfox", password: "testing-password" },
        },
      ],
    },
  })
  expect(response.ok()).toBeTruthy()
}
