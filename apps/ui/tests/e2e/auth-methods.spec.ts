import { expect, test, type Page } from "@playwright/test"

import { visit } from "./helpers"

const RPC_PATH = "**/__api"
const MOCK_API = `http://127.0.0.1:${process.env.MOCK_API_PORT ?? 3200}`

const DRIVERS: Record<string, Record<string, unknown>> = {
  password: {
    label: "Password",
    capabilities: { signIn: true, register: true, link: false, mfa: false },
    requirements: {},
    describe: {},
  },
  oidc: {
    label: "OpenID Connect",
    capabilities: { signIn: true, register: true, link: true, mfa: false },
    requirements: {},
    describe: { issuer: "https://id.example.test", required: false },
  },
  passkey: {
    label: "Passkey",
    capabilities: { signIn: true, register: true, link: true, mfa: true },
    requirements: {},
    describe: { rpId: "127.0.0.1", rpName: "Test" },
  },
  "magic-link": {
    label: "Email link",
    capabilities: { signIn: true, register: true, link: false, mfa: false },
    requirements: { mail: true },
    describe: {},
  },
  "email-otp": {
    label: "Email code",
    capabilities: { signIn: true, register: true, link: false, mfa: false },
    requirements: { mail: true },
    describe: {},
  },
  "magic-password": {
    label: "Generated password",
    capabilities: { signIn: true, register: true, link: false, mfa: false },
    requirements: { mail: true },
    describe: {},
  },
  "device-code": {
    label: "Device code",
    capabilities: {
      signIn: true,
      register: false,
      link: false,
      mfa: false,
      browser: true,
    },
    requirements: {},
    describe: { verificationUrl: "http://127.0.0.1:3101/device" },
  },
}

// The pages read the method set the registry advertises on GET /auth. Answered
// here rather than by the mock registry because that process is shared by every
// spec running in parallel: a driver removed for this journey would disappear
// from the pages another journey is checking at the same time.
async function advertise(
  page: Page,
  drivers: string[],
  options: { registration?: "open" | "closed" } = {}
) {
  const descriptor = {
    methods: drivers.map((driver) => ({
      kind: "auth",
      driver,
      id: driver,
      ...DRIVERS[driver],
    })),
    passwordAuth: drivers.includes("password"),
    registration: options.registration ?? "open",
    oidc: drivers.includes("oidc")
      ? { issuer: "https://id.example.test", required: false }
      : null,
    device: drivers.includes("device-code")
      ? { verificationUrl: "http://127.0.0.1:3101/device" }
      : null,
  }

  await page.route(RPC_PATH, async (route) => {
    const body = route.request().postDataJSON() as { path?: string[] } | null
    if (body?.path?.[0] !== "auth" || body.path[1] !== "describe") {
      return route.continue()
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { type: "json", value: descriptor } }),
    })
  })
}

test("login hides the password form when the driver is not offered", async ({
  page,
}) => {
  await advertise(page, ["oidc"])
  await visit(page, "/login")

  await expect(
    page.getByRole("button", { name: "Continue with single sign-on" })
  ).toBeVisible()
  await expect(page.getByLabel("Handle")).toHaveCount(0)
  await expect(
    page.getByText(/signs in with OpenID Connect instead of a password/)
  ).toBeVisible()
})

test("login explains when no method can sign in", async ({ page }) => {
  await advertise(page, [])
  await visit(page, "/login")

  await expect(page.getByText("Sign-in is turned off")).toBeVisible()
  await expect(page.getByText(/has no sign-in method enabled/)).toBeVisible()
  await expect(page.getByLabel("Handle")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Continue with single sign-on" })
  ).toHaveCount(0)
})

test("signup keeps its form only while password registration is offered", async ({
  page,
}) => {
  await advertise(page, ["password", "oidc"])
  await visit(page, "/signup")

  await expect(page.getByLabel("Handle")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Create an account" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Create account" })
  ).toBeVisible()
})

test("signup points at the sign-in methods when passwords are off", async ({
  page,
}) => {
  await advertise(page, ["oidc"])
  await visit(page, "/signup")

  await expect(
    page.getByText("Accounts are created by signing in")
  ).toBeVisible()
  await expect(page.getByLabel("Handle")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Create account" })
  ).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible()
})

test("an emailed code signs in without a password", async ({ page }) => {
  await advertise(page, ["email-otp"])
  await visit(page, "/login")

  await page.getByLabel("Email").fill("code-reader@example.test")
  await page.getByRole("button", { name: "Email me a sign-in code" }).click()
  await expect(page.getByText("Check your email")).toBeVisible()

  await page.getByLabel("Code").fill("123456")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Stay signed in?" })
  ).toBeVisible()
})

test("a sign-in link comes back to the page and finishes there", async ({
  page,
}) => {
  await advertise(page, ["magic-link"])
  await visit(page, "/login")

  const email = "link-reader@example.test"
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Email me a sign-in link" }).click()
  await expect(page.getByText("Check your email")).toBeVisible()

  const link = await (
    await page.request.get(
      `${MOCK_API}/__magic-link?email=${encodeURIComponent(email)}`
    )
  ).json()
  expect(link.returnTo).toContain("/login")

  // The link the message carries is the API's, which sends the browser on to
  // the page that asked for it with a one-time code.
  const target = new URL(link.returnTo)
  await visit(
    page,
    `${target.pathname}${target.search}&magic_link_code=${link.code}`
  )
  await expect(
    page.getByRole("heading", { name: "Stay signed in?" })
  ).toBeVisible()
})

test("a passkey signs in when the browser offers one", async ({ page }) => {
  // No real authenticator in a headless run: the ceremony's browser half is
  // answered here so the page's own half is what is under test.
  await page.addInitScript(() => {
    class FakePublicKeyCredential {}
    Object.defineProperty(window, "PublicKeyCredential", {
      value: FakePublicKeyCredential,
      configurable: true,
    })
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        get: async () => ({
          id: "credential-id",
          rawId: new Uint8Array([1, 2, 3]).buffer,
          type: "public-key",
          authenticatorAttachment: "platform",
          response: {
            clientDataJSON: new TextEncoder().encode('{"type":"webauthn.get"}')
              .buffer,
            authenticatorData: new Uint8Array([4, 5]).buffer,
            signature: new Uint8Array([6, 7]).buffer,
            userHandle: null,
          },
          getClientExtensionResults: () => ({}),
        }),
      },
    })
  })

  await advertise(page, ["passkey"])
  await visit(page, "/login")

  await page.getByLabel("Handle").fill("kamixfox")
  await page.getByRole("button", { name: "Use a passkey" }).click()
  await expect(
    page.getByRole("heading", { name: "Stay signed in?" })
  ).toBeVisible()
})

test("signing up can generate a password that is shown once", async ({
  page,
}) => {
  await advertise(page, ["magic-password"])
  await visit(page, "/signup")

  await page.getByLabel("Email").fill("generated@example.test")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(
    page.getByRole("heading", { name: "Your generated password" })
  ).toBeVisible()
  await expect(page.getByText("generated-password-for-test")).toBeVisible()

  await page.getByRole("button", { name: "Continue" }).click()
  await expect(
    page.getByRole("heading", { name: "Stay signed in?" })
  ).toBeVisible()
})

test("a registry with registration closed offers no form", async ({ page }) => {
  await advertise(page, ["password", "magic-link"], { registration: "closed" })
  await visit(page, "/signup")

  await expect(page.getByText("Registration is closed")).toBeVisible()
  await expect(page.getByLabel("Handle")).toHaveCount(0)
  await expect(page.getByLabel("Email")).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible()

  // The sign-in page says the same rather than pointing at a form that would
  // be refused.
  await visit(page, "/login")
  await expect(page.getByText(/isn’t accepting new ones/)).toBeVisible()
  await expect(page.getByRole("link", { name: "Create one" })).toHaveCount(0)
})

test("a passwordless sign-up can add a passkey on the spot", async ({
  page,
}) => {
  // The enrolment ceremony's browser half, answered the same way the sign-in
  // one is: a headless run has no authenticator.
  await page.addInitScript(() => {
    class FakePublicKeyCredential {}
    Object.defineProperty(window, "PublicKeyCredential", {
      value: FakePublicKeyCredential,
      configurable: true,
    })
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        create: async () => ({
          id: "new-credential",
          rawId: new Uint8Array([9, 9]).buffer,
          type: "public-key",
          authenticatorAttachment: "platform",
          response: {
            clientDataJSON: new TextEncoder().encode(
              '{"type":"webauthn.create"}'
            ).buffer,
            attestationObject: new Uint8Array([1, 2, 3]).buffer,
            getTransports: () => ["internal"],
          },
          getClientExtensionResults: () => ({}),
        }),
      },
    })
  })

  await advertise(page, ["magic-password", "passkey"])
  await visit(page, "/signup")

  await page.getByLabel("Email").fill("enrolling@example.test")
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(
    page.getByRole("heading", { name: "Your generated password" })
  ).toBeVisible()

  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByRole("heading", { name: "Add a passkey?" })).toBeVisible()

  await page.getByRole("button", { name: "Create a passkey" }).click()
  // The first passkey is the second factor, so its backup codes are shown once.
  await expect(
    page.getByRole("heading", { name: "Save your backup codes" })
  ).toBeVisible()
  await expect(page.getByText("AAAA-BBBB-CCCC")).toBeVisible()

  await page.getByRole("button", { name: "Continue" }).click()
  await expect(
    page.getByRole("heading", { name: "Stay signed in?" })
  ).toBeVisible()
})

test("skipping the passkey offer goes straight to the session choice", async ({
  page,
}) => {
  await advertise(page, ["magic-password", "passkey"])
  await visit(page, "/signup")

  await page.getByLabel("Email").fill("skipping@example.test")
  await page.getByRole("button", { name: "Create account" }).click()
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByRole("heading", { name: "Add a passkey?" })).toBeVisible()

  await page.getByRole("button", { name: "Not now" }).click()
  await expect(
    page.getByRole("heading", { name: "Stay signed in?" })
  ).toBeVisible()
})

test("the device page says so when the device code driver is left out", async ({
  page,
}) => {
  await advertise(page, ["password", "oidc"])
  await visit(page, "/device")

  await expect(page.getByText("Device sign-in is turned off")).toBeVisible()
  await expect(page.getByLabel("Code")).toHaveCount(0)
})
