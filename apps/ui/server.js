import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { createRequestHandler } from "@react-router/express"
import compression from "compression"
import express from "express"

import { loadConfig } from "./config.js"

// A small replacement for `react-router-serve`. The stock server reads its port
// and mode from environment variables; this one reads them from config.yaml so
// the process has a single source of configuration.
const root = path.dirname(fileURLToPath(import.meta.url))
const config = loadConfig()
const build = await import(
  pathToFileURL(path.join(root, "build/server/index.js")).href
)
const assets = path.join(root, "build/client")

const app = express()
app.disable("x-powered-by")
app.use(compression())
app.use(
  "/assets",
  express.static(path.join(assets, "assets"), {
    immutable: true,
    maxAge: "1y",
  })
)
app.use(express.static(assets))
app.use(express.static(path.join(root, "public"), { maxAge: "1h" }))
app.all(
  "/{*splat}",
  createRequestHandler({ build, mode: config.environment })
)

const server = app.listen(config.port, () => {
  console.log(`[ui] http://localhost:${config.port}`)
  if (config.setupRequired) {
    console.log(`[ui] setup required: http://localhost:${config.port}/onboarding`)
  }
})

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => server.close())
}
