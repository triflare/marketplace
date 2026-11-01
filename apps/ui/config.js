import { randomBytes } from "node:crypto"
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

import YAML from "yaml"

// What the setup screen starts from. A checkout runs both apps on one machine,
// so localhost is right for the process and for the browser. In a container
// stack the API is a different service on the compose network: the process has
// to name that service, while the browser still uses the host's published port,
// which is also the address the shipped compose file exposes.
const IN_CONTAINER = inContainer()
const DEFAULT_SERVER_API_URL = IN_CONTAINER
  ? "http://api:3000/v1"
  : "http://localhost:3000/v1"
const DEFAULT_BROWSER_API_URL = IN_CONTAINER
  ? "http://localhost:3000/v1"
  : null

// Every setting the web frontend needs. There are no environment variables to
// override these: the file is the configuration, and the first-run screen writes
// it when the instance has none.
export const DEFAULTS = {
  port: 3001,
  // `production` turns on the checks that only make sense on a live instance,
  // and makes the session cookie Secure unless the file says otherwise.
  environment: "development",
  api: {
    // The address this process uses to reach the API. In a container stack this
    // is the service name, not the address a visitor's browser can reach.
    url: DEFAULT_SERVER_API_URL,
    // The address a browser uses for install links, badges, and the API itself.
    // Null means "the same as api.url".
    publicUrl: DEFAULT_BROWSER_API_URL,
  },
  session: {
    name: "triflare_session",
    // Signs the HTTP-only session cookie. A deployment has to set this; the
    // first-run screen generates one when it is left empty.
    secret: null,
    // Null means "Secure when environment is production".
    secure: null,
  },
  onboarding: {
    // Set once the first-run screen has written the settings it needs. A file
    // that predates onboarding has no marker; a session secret is enough to
    // treat it as finished.
    completed: false,
  },
}

// Test-only. The end-to-end suite points the dev server at a mock API without
// touching the checkout's own config.yaml. Nothing in a deployment sets this.
const TEST_CONFIG = process.env.TRIFLARE_TEST_UI_CONFIG?.trim()

function mergeDeep(base, override) {
  if (override === undefined) return base
  if (override === null) return base
  if (Array.isArray(base)) return override
  if (typeof base === "object" && base !== null) {
    const out = structuredClone(base)
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined) out[key] = mergeDeep(base[key], value)
    }
    return out
  }
  return override
}

// A config file in the working directory wins: that is how a checkout runs.
// Without one the file belongs to the data directory, the one directory a
// container deployment is told to give a volume. The image deliberately does
// not carry a config.yaml, so a first-run deployment has somewhere to keep the
// settings onboarding writes, and those settings survive a redeploy.
function defaultConfigPath() {
  if (TEST_CONFIG) return path.resolve(TEST_CONFIG)
  const local = path.resolve("config.yaml")
  if (existsSync(local)) return local
  return path.resolve("data", "config.yaml")
}

function absoluteUrl(value, key) {
  const text = String(value ?? "").trim()
  if (text === "") throw new Error(`${key} is required`)
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new Error(`${key} must be an absolute URL`)
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${key} must be an http or https URL`)
  }
  return text.replace(/\/+$/, "")
}

// A config written before onboarding existed has no marker. A session secret in
// it means it was configured by hand, so it is treated as finished rather than
// dragged back to the setup screen. An explicit `onboarding.completed: false`
// always wins, and a config with no session secret is never finished even when
// the marker says it is.
function resolveOnboarding(config, raw) {
  const hasSecret =
    typeof config.session.secret === "string" &&
    config.session.secret.trim() !== ""
  const markerPresent =
    raw?.onboarding !== null &&
    typeof raw?.onboarding === "object" &&
    Object.hasOwn(raw.onboarding, "completed")
  const completed = markerPresent
    ? config.onboarding.completed === true
    : hasSecret
  config.onboarding.completed = completed
  config.setupRequired = !completed || !hasSecret
  if (!hasSecret) config.session.secret = null
}

function normalizeConfig(config, raw, filePath) {
  if (
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535
  ) {
    throw new Error("port must be a whole number between 1 and 65535")
  }
  if (!["development", "production"].includes(config.environment)) {
    throw new Error(
      `environment must be "development" or "production" (got ${JSON.stringify(config.environment)})`
    )
  }
  config.api = config.api ?? {}
  config.api.url = absoluteUrl(config.api.url, "api.url")
  config.api.publicUrl =
    config.api.publicUrl === null ||
    config.api.publicUrl === undefined ||
    config.api.publicUrl === ""
      ? null
      : absoluteUrl(config.api.publicUrl, "api.publicUrl")

  config.session = config.session ?? {}
  config.session.name = String(config.session.name ?? "triflare_session")
  if (!/^[A-Za-z0-9_-]+$/.test(config.session.name)) {
    throw new Error(
      "session.name may only contain letters, numbers, underscores, and dashes"
    )
  }
  if (
    config.session.secret !== null &&
    (typeof config.session.secret !== "string" ||
      config.session.secret.trim() === "")
  ) {
    throw new Error("session.secret must be a non-empty string or null")
  }
  if (typeof config.session.secret === "string") {
    config.session.secret = config.session.secret.trim()
  }
  if (config.session.secure === null || config.session.secure === undefined) {
    config.session.secure = config.environment === "production"
  }
  if (typeof config.session.secure !== "boolean") {
    throw new Error("session.secure must be true or false")
  }

  if (typeof config.onboarding?.completed !== "boolean") {
    throw new Error("onboarding.completed must be true or false")
  }

  config.configPath = path.resolve(filePath)
  resolveOnboarding(config, raw)
  return config
}

export function loadConfig(configPath) {
  const filePath = configPath ?? defaultConfigPath()
  let raw = {}
  if (existsSync(filePath)) {
    const parsed = YAML.parse(readFileSync(filePath, "utf8"))
    if (parsed && typeof parsed === "object") raw = parsed
  }
  return normalizeConfig(mergeDeep(DEFAULTS, raw), raw, filePath)
}

// The config the process is running with. It is replaced in place after
// onboarding writes the file, so the next request uses the new settings without
// a restart.
let current = null

export function getConfig() {
  current ??= loadConfig()
  return current
}

export function setConfig(next) {
  current = next
}

export function reloadConfig() {
  current = loadConfig()
  return current
}

export function publicApiUrl(config = getConfig()) {
  return (config.api.publicUrl ?? config.api.url).replace(/\/+$/, "")
}

/** null where the platform has no mount table to read. */
function inContainer() {
  return existsSync("/.dockerenv") || existsSync("/run/.containerenv")
}

function readMountInfo() {
  try {
    return readFileSync("/proc/self/mountinfo", "utf8")
  } catch {
    return null
  }
}

function canWrite(target) {
  try {
    accessSync(target, constants.W_OK)
    return true
  } catch {
    // A file that is not there yet is writable when the nearest directory that
    // does exist is, because the first save creates the missing directories.
    if (existsSync(target)) return false
  }
  let dir = path.dirname(target)
  for (;;) {
    if (existsSync(dir)) {
      try {
        accessSync(dir, constants.W_OK)
        return true
      } catch {
        return false
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

/**
 * Whether the configuration file can be written, and whether a change to it
 * survives the instance being recreated. Onboarding is refused outright when
 * the file is not writable, because a form that cannot save is worse than a
 * clear explanation.
 */
export function configStorage(
  configPath,
  { mountInfo = readMountInfo(), container = inContainer() } = {}
) {
  const resolved = path.resolve(configPath)
  const writable = existsSync(resolved)
    ? canWrite(resolved)
    : canWrite(path.dirname(resolved))
  if (!writable) {
    return {
      path: resolved,
      writable: false,
      persistent: false,
      reason: "The configuration file is not writable by this process.",
    }
  }

  if (mountInfo === null) {
    return { path: resolved, writable: true, persistent: true, reason: null }
  }

  let real
  try {
    real = realpathSync(resolved)
  } catch {
    real = resolved
  }

  let deepest = ""
  for (const line of mountInfo.split("\n")) {
    const mountPoint = line.split(" ")[4]
    if (!mountPoint) continue
    const prefix = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`
    if (real === mountPoint || real.startsWith(prefix)) {
      if (mountPoint.length > deepest.length) deepest = mountPoint
    }
  }

  if (container && (deepest === "" || deepest === "/")) {
    return {
      path: resolved,
      writable: true,
      persistent: false,
      reason:
        "The configuration file is inside the container, so a change to it is lost when the instance is recreated. Mount it as a volume to enable this.",
    }
  }
  return { path: resolved, writable: true, persistent: true, reason: null }
}

// Everything the first-run screen asks for. Each entry is also the validation
// contract, so the form and the file agree.
export const ONBOARDING_FIELDS = [
  {
    key: "api.url",
    type: "url",
    label: "API URL (server)",
    help: "The address this process uses to reach the registry. In a container stack this is usually the service name.",
    placeholder: DEFAULT_SERVER_API_URL,
    required: true,
  },
  {
    key: "api.publicUrl",
    type: "url",
    label: "API URL (browser)",
    help: "The address a visitor's browser uses for install links and badges. Leave empty when it is the same as the server URL.",
    placeholder: "https://registry.example.com/v1",
    nullable: true,
  },
  {
    key: "port",
    type: "number",
    label: "Listen port",
    help: "Port the web frontend binds. Changing it needs a restart.",
    min: 1,
    max: 65535,
  },
  {
    key: "environment",
    type: "select",
    label: "Environment",
    help: "Production makes the session cookie Secure and turns on live-instance checks.",
    options: [
      { value: "production", label: "Production" },
      { value: "development", label: "Development" },
    ],
    required: true,
  },
  {
    key: "session.secret",
    type: "secret",
    label: "Session signing secret",
    help: "Signs the HTTP-only session cookie. Leave empty to generate one. Changing it signs every account out.",
    generate: true,
  },
  {
    key: "session.secure",
    type: "boolean",
    label: "Secure session cookie",
    help: "Send the session cookie over HTTPS only. On by default in production.",
  },
]

const FIELD_BY_KEY = new Map(ONBOARDING_FIELDS.map((field) => [field.key, field]))

function readAt(source, key) {
  return key
    .split(".")
    .reduce((acc, part) => (acc == null ? acc : acc[part]), source)
}

function isBlank(value) {
  return value === null || value === undefined || value === ""
}

function invalid(field, message) {
  const error = new Error(message)
  error.errors = [{ field: field.key, message }]
  throw error
}

function coerce(field, value) {
  if (isBlank(value)) {
    if (field.required) invalid(field, "A value is required.")
    return null
  }

  switch (field.type) {
    case "url": {
      try {
        return absoluteUrl(value, field.key)
      } catch (error) {
        invalid(field, error.message)
      }
      break
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value)
      if (!Number.isInteger(n)) invalid(field, "Must be a whole number.")
      if (field.min !== undefined && n < field.min) {
        invalid(field, `Must be at least ${field.min}.`)
      }
      if (field.max !== undefined && n > field.max) {
        invalid(field, `Must be at most ${field.max}.`)
      }
      return n
    }
    case "boolean": {
      if (typeof value === "boolean") return value
      if (value === "true" || value === "on") return true
      if (value === "false" || value === "off") return false
      invalid(field, "Must be true or false.")
      break
    }
    case "select": {
      const text = String(value)
      if (!field.options.some((option) => option.value === text)) {
        invalid(
          field,
          `Must be one of: ${field.options.map((option) => option.value).join(", ")}.`
        )
      }
      return text
    }
    case "secret": {
      if (typeof value !== "string" || value.trim() === "") {
        invalid(field, "Must be a non-empty string.")
      }
      return value.trim()
    }
    default: {
      const text = String(value).trim()
      if (field.nullable && text === "") return null
      return text
    }
  }
}

// The value a field would have after this submission. A field the caller left
// out keeps what the file already says, so the form only has to send what it
// changed and a required key can be satisfied by an earlier run.
function effectiveValue(field, patch, config) {
  if (Object.hasOwn(patch, field.key)) {
    const value = coerce(field, patch[field.key])
    if (field.key === "session.secret" && value === null) {
      const current = readAt(config, field.key)
      return isBlank(current) ? randomBytes(32).toString("hex") : current
    }
    return value
  }
  const current = readAt(config, field.key)
  if (field.key === "session.secret") {
    return isBlank(current) ? randomBytes(32).toString("hex") : current
  }
  if (isBlank(current) && field.required) invalid(field, "A value is required.")
  return current ?? null
}

function publicFields(config) {
  return ONBOARDING_FIELDS.map((field) => {
    const current = readAt(config, field.key)
    return {
      key: field.key,
      type: field.type,
      label: field.label,
      help: field.help ?? null,
      placeholder: field.placeholder ?? null,
      required: field.required === true,
      nullable: field.nullable === true,
      secret: field.secret === true,
      options: field.options ?? null,
      min: field.min ?? null,
      max: field.max ?? null,
      value: field.secret ? null : (current ?? null),
      configured: !isBlank(current),
    }
  })
}

/** Whether first-run setup is still needed, and what the form should ask. */
export function onboardingStatus(config = getConfig(), options = {}) {
  const storage = configStorage(config.configPath, options)
  return {
    required: config.setupRequired === true,
    editable: storage.writable,
    persistent: storage.persistent,
    reason: storage.reason,
    configPath: storage.path,
    fields: publicFields(config),
  }
}

function yamlSource(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : ""
}

/**
 * Validates the submitted settings, writes them through the YAML document so an
 * operator's comments and key order survive, and marks onboarding complete.
 *
 * The candidate is written to a sibling temporary file and loaded with the same
 * `loadConfig` the server uses before it replaces the real file. A setting that
 * passes the form but fails the server's own checks therefore leaves the
 * original file exactly as it was.
 */
export function applyOnboarding(config, patch, options = {}) {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    const error = new Error("Must be an object of settings.")
    error.errors = [{ field: "settings", message: error.message }]
    throw error
  }
  const storage = configStorage(config.configPath, options)
  if (!storage.writable) {
    const error = new Error(
      storage.reason ??
        "The configuration file is not writable by this process, so onboarding cannot save anything."
    )
    error.status = 409
    throw error
  }

  const unknown = Object.keys(patch).filter((key) => !FIELD_BY_KEY.has(key))
  if (unknown.length) {
    const error = new Error("Some settings are not onboarding settings.")
    error.errors = unknown.map((key) => ({
      field: key,
      message: "This is not an onboarding setting.",
    }))
    throw error
  }

  const errors = []
  const values = {}
  for (const field of ONBOARDING_FIELDS) {
    try {
      values[field.key] = effectiveValue(field, patch, config)
    } catch (error) {
      errors.push(
        ...(error.errors ?? [{ field: field.key, message: error.message }])
      )
    }
  }
  if (errors.length) {
    const error = new Error("Some settings could not be saved.")
    error.errors = errors
    throw error
  }

  // A blank browser URL means "same as the server URL". Storing the resolved
  // value keeps the file unambiguous for the next reader.
  if (isBlank(values["api.publicUrl"])) {
    values["api.publicUrl"] = values["api.url"]
  }

  const document = YAML.parseDocument(yamlSource(storage.path))
  if (document.contents === null) document.contents = document.createNode({})
  for (const [key, value] of Object.entries(values)) {
    document.setIn(key.split("."), value)
  }
  // The marker is what tells the next boot to skip this screen. It is written
  // only after the values above have passed validation.
  document.setIn(["onboarding", "completed"], true)

  const dir = path.dirname(storage.path)
  mkdirSync(dir, { recursive: true })
  const temporary = path.join(
    dir,
    `.${path.basename(storage.path)}.${randomBytes(6).toString("hex")}.tmp`
  )

  try {
    writeFileSync(temporary, document.toString(), {
      encoding: "utf8",
      mode: 0o600,
    })
    const candidate = loadConfig(temporary)
    if (candidate.setupRequired) {
      const error = new Error("The configuration is not complete yet.")
      error.errors = [
        { field: "session.secret", message: "A session secret is required." },
      ]
      throw error
    }
    renameSync(temporary, storage.path)
    return { config: loadConfig(storage.path), changed: Object.keys(values) }
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}
