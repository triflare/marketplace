// The browser never talks to the TwextHub API directly. Every call is described
// by a resource path and encoded arguments, sent to /__api, and performed by the
// server with the session token. Files travel as base64 so a single JSON body
// can carry uploads, form data, and aborted requests.

export const RPC_PATH = "/__api"

export type EncodedValue =
  | { type: "json"; value: unknown }
  | { type: "undefined" }
  | { type: "blob"; mime: string; name: string; data: string }
  | { type: "form"; entries: Array<[string, EncodedValue]> }

export interface RpcRequestBody {
  path: string[]
  args: EncodedValue[]
}

export interface RpcFailure {
  error: {
    message: string
    status?: number
  }
}

export interface RpcSuccess {
  result: EncodedValue
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof AbortSignal !== "undefined" &&
    typeof value === "object" &&
    value !== null &&
    value instanceof AbortSignal
  )
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

function fromBase64(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** Copy a payload, leaving out values that cannot cross the server boundary. */
function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "function" || isAbortSignal(value)) {
    return undefined
  }

  if (value === null || typeof value !== "object") {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (seen.has(value)) {
    return undefined
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((entry) => sanitize(entry, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    const clean = sanitize(entry, seen)
    if (clean !== undefined) {
      result[key] = clean
    }
  }
  return result
}

export async function encodeValue(value: unknown): Promise<EncodedValue> {
  if (value === undefined) {
    return { type: "undefined" }
  }

  if (isBlob(value)) {
    return {
      type: "blob",
      mime: value.type || "application/octet-stream",
      name: "name" in value && typeof value.name === "string" ? value.name : "",
      data: await toBase64(value),
    }
  }

  if (isFormData(value)) {
    const entries: Array<[string, EncodedValue]> = []
    for (const [key, entry] of value.entries()) {
      entries.push([key, await encodeValue(entry)])
    }
    return { type: "form", entries }
  }

  return { type: "json", value: sanitize(value) }
}

export async function encodeArgs(args: unknown[]): Promise<EncodedValue[]> {
  return Promise.all(args.map((arg) => encodeValue(arg)))
}

export function decodeValue(value: EncodedValue): unknown {
  switch (value.type) {
    case "undefined":
      return undefined
    case "json":
      return value.value
    case "blob": {
      const bytes = fromBase64(value.data)
      const buffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(buffer).set(bytes)
      const blob = new Blob([buffer], { type: value.mime })
      if (value.name) {
        return new File([blob], value.name, { type: value.mime })
      }
      return blob
    }
    case "form": {
      const form = new FormData()
      for (const [key, entry] of value.entries) {
        const decoded = decodeValue(entry)
        if (decoded instanceof Blob) {
          form.append(key, decoded)
        } else if (decoded !== undefined) {
          form.append(key, String(decoded))
        }
      }
      return form
    }
  }
}
