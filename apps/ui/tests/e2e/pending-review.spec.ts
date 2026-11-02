import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

test("a first release waiting for review is visible to its publisher", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/@kamixfox/newproject")

  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible()
  // The notice is an alert, not a heading; its title is plain text.
  await expect(
    page.getByText("This project is waiting for review")
  ).toBeVisible()
  await expect(page.getByText("Waiting for its first review.")).toBeVisible()

  // Nothing has been published, so there is no file to install and no badge to
  // embed yet.
  await expect(
    page.getByRole("button", { name: "Copy TurboWarp link" })
  ).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Download file" })).toHaveCount(
    0
  )
  await expect(page.getByRole("link", { name: "View SVG badge" })).toHaveCount(
    0
  )

  await expect(page.getByText("In review").first()).toBeVisible()
})

test("a release a moderator sent back says what to change", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/@kamixfox/changes-requested")

  await expect(page.getByText("A moderator asked for changes")).toBeVisible()
  await expect(
    page.getByText("Remove the network call before this can be published.")
  ).toBeVisible()
  await expect(page.getByText("In review")).toHaveCount(0)
})

test("a visitor can't read a project that has no published release", async ({
  page,
}) => {
  await visit(page, "/@kamixfox/newproject")

  await expect(
    page.getByRole("alert").filter({ hasText: "We couldn’t find that page." })
  ).toBeVisible()
  await expect(
    page.getByText("This project is waiting for review")
  ).toHaveCount(0)
})

test("the manage page opens a project whose first release is waiting", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/@kamixfox/newproject/manage?tab=releases")

  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible()
  await expect(page.getByText("In review").first()).toBeVisible()

  // A release in review is decided by a moderator, so the panel does not offer
  // to remove it.
  await expect(
    page.getByRole("button", { name: "Remove release" })
  ).toHaveCount(0)

  await page.getByRole("button", { name: "Source" }).first().click()
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Source for v0.1.0" })
  ).toBeVisible()
})

test("the dashboard names the releases waiting for review", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/dashboard")

  const row = page.getByRole("listitem").filter({ hasText: "Second Project" })
  await expect(row.getByText("1 in review")).toBeVisible()

  // An extension with nothing waiting stays unmarked.
  const published = page.getByRole("listitem").filter({ hasText: "Hello" })
  await expect(published.getByText("in review")).toHaveCount(0)
})

test("a refused upload says why next to the form", async ({ page }) => {
  await signIn(page)
  await visit(page, "/publish")

  await page.getByText("Upload a project archive instead").click()
  await page.getByLabel("Publisher handle").fill("kamixfox")
  await page.getByLabel("Extension ID").fill("already-pending")
  await page.getByLabel("Project archive").setInputFiles({
    name: "my-extension.tar.gz",
    mimeType: "application/gzip",
    buffer: Buffer.from("mock project archive"),
  })
  await page.getByRole("button", { name: "Upload project" }).click()

  const alert = page
    .getByRole("alert")
    .filter({ hasText: "We couldn’t publish that" })
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(
    "The owner already has a version awaiting review."
  )

  // The form keeps what was typed, and the button returns to its resting label.
  await expect(page.getByLabel("Extension ID")).toHaveValue("already-pending")
  await expect(
    page.getByRole("button", { name: "Upload project" })
  ).toBeEnabled()
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("an unreachable registry takes the screen over and recovers", async ({
  page,
}) => {
  await signIn(page)
  await page.route("**/__api", (route) => route.abort())

  await visit(page, "/publish")

  await expect(
    page.getByRole("heading", { name: "Triflare Marketplace is down" })
  ).toBeVisible()
  await expect(
    page.getByText("The registry isn’t answering right now")
  ).toBeVisible()

  await page.unroute("**/__api")
  await page.getByRole("button", { name: "Try again" }).click()

  await expect(
    page.getByRole("heading", { name: "Publish an extension" })
  ).toBeVisible()
})
