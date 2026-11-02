import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"

import { applyOnboarding, loadConfig } from "../config.js"
import { safeReturnPath } from "../src/lib/return-path.ts"
import { readRpcJson, RpcBodyTooLargeError } from "../src/lib/rpc.ts"

test("onboarding refuses to rewrite a completed configuration", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "triflare-ui-config-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, "config.yaml")
  const original = [
    "database:",
    "  url: postgres://user@localhost:5432/triflare",
    "onboarding:",
    "  completed: true",
    "session:",
    "  secret: already-configured",
    "",
  ].join("\n")
  fs.writeFileSync(file, original)

  const config = loadConfig(file)
  assert.equal(config.setupRequired, false)

  assert.throws(
    () => applyOnboarding(config, { "api.url": "https://evil.example/v1" }),
    (error) => error.status === 409 && /already complete/.test(error.message)
  )
  assert.equal(fs.readFileSync(file, "utf8"), original)
})

test("post-login paths cannot leave the instance", () => {
  assert.equal(safeReturnPath("/dashboard"), "/dashboard")
  assert.equal(safeReturnPath("/settings?tab=tokens"), "/settings?tab=tokens")
  assert.equal(safeReturnPath("/\\evil.example"), "/dashboard")
  assert.equal(safeReturnPath("/\t/evil.example"), "/dashboard")
  assert.equal(safeReturnPath("//evil.example"), "/dashboard")
  assert.equal(safeReturnPath("https://evil.example"), "/dashboard")
  assert.equal(safeReturnPath(null), "/dashboard")
})

test("the RPC reader enforces its body limit", async () => {
  const request = new Request("http://localhost/__api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hello: "world" }),
  })
  assert.deepEqual(await readRpcJson(request), { hello: "world" })

  const oversized = new Request("http://localhost/__api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: "x".repeat(100) }),
  })
  await assert.rejects(() => readRpcJson(oversized, 20), RpcBodyTooLargeError)
})
