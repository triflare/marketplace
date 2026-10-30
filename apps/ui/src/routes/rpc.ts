import type { User } from "@/lib/api"
import { ApiError } from "@/lib/api/errors"

import { summaryFromUser } from "@/lib/accounts.server"
import { serverApi } from "@/lib/api.server"
import {
  decodeValue,
  encodeValue,
  type EncodedValue,
  type RpcRequestBody,
} from "@/lib/rpc"
import {
  commitSession,
  destroySession,
  forgetAccountToken,
  readSession,
  rememberAccount,
  type Session,
  type SessionData,
} from "@/lib/session.server"

const BLOCKED = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "then",
  "toString",
  "valueOf",
])

function resolveMethod(api: unknown, path: string[]) {
  if (path.length < 2) {
    throw new Error("Unknown API method.")
  }

  let target: unknown = api
  for (const segment of path.slice(0, -1)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(segment) || BLOCKED.has(segment)) {
      throw new Error("Unknown API method.")
    }
    const next = (target as Record<string, unknown> | null)?.[segment]
    if (next === null || typeof next !== "object") {
      throw new Error("Unknown API method.")
    }
    target = next
  }

  const name = path[path.length - 1]
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name) || BLOCKED.has(name)) {
    throw new Error("Unknown API method.")
  }

  const method = (target as Record<string, unknown>)[name]
  if (typeof method !== "function") {
    throw new Error("Unknown API method.")
  }

  return (method as (...args: unknown[]) => Promise<unknown>).bind(target)
}

/**
 * End the active account's session locally, leaving any other account this
 * browser holds signed in. The cookie is rewritten either way, so a sign-out
 * that never reached the registry still does not leave the browser pointed at
 * a token it has been told to forget.
 */
async function signOutOfActiveAccount(
  session: Session<SessionData>
): Promise<string> {
  const token = session.get("token")
  if (token) {
    forgetAccountToken(session, token)
  }
  session.unset("remember")
  return session.get("token")
    ? await commitSession(session)
    : await destroySession(session)
}

function isSessionPayload(
  value: unknown
): value is { token: string; user: User } {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as {
    token?: unknown
    user?: { namespace?: unknown; displayName?: unknown }
  }
  return (
    typeof candidate.token === "string" &&
    typeof candidate.user?.namespace === "string" &&
    typeof candidate.user.displayName === "string"
  )
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json(
      { error: { message: "Method not allowed.", status: 405 } },
      { status: 405, headers: { allow: "POST" } }
    )
  }

  let body: RpcRequestBody
  try {
    body = (await request.json()) as RpcRequestBody
  } catch {
    return Response.json(
      { error: { message: "Invalid request body.", status: 400 } },
      { status: 400 }
    )
  }

  const path = Array.isArray(body?.path) ? body.path : null
  const encodedArgs: EncodedValue[] = Array.isArray(body?.args) ? body.args : []
  if (!path || path.some((segment) => typeof segment !== "string")) {
    return Response.json(
      { error: { message: "Invalid API path.", status: 400 } },
      { status: 400 }
    )
  }

  const session = await readSession(request)
  const api = serverApi(session.get("token"))
  const headers = new Headers()
  const revoking = path.join(".") === "sessions.revokeCurrent"

  try {
    const method = resolveMethod(api, path)
    const args = encodedArgs.map((arg) => decodeValue(arg))
    let result = await method(...args)

    if (isSessionPayload(result)) {
      const { token, user, ...rest } = result
      // Signing in is how an account joins the ones this browser holds: the
      // token becomes the active one and the rest stay signed in behind it.
      rememberAccount(session, { token, ...summaryFromUser(user) })
      session.unset("remember")
      headers.set("Set-Cookie", await commitSession(session))
      // The token becomes a cookie rather than a body value, but the account
      // it belongs to is what the page renders next, so it stays.
      result = { ...rest, user }
    }

    if (revoking) {
      headers.set("Set-Cookie", await signOutOfActiveAccount(session))
    }

    return Response.json({ result: await encodeValue(result) }, { headers })
  } catch (error) {
    if (revoking) {
      headers.set("Set-Cookie", await signOutOfActiveAccount(session))
    }

    // A registry the gateway could not reach keeps the client's 0, which the
    // response below turns into a 502 the browser can read; anything that is
    // not a registry error at all is this gateway failing, and says so with a
    // 500 rather than blaming the outage the client watches for.
    const status = error instanceof ApiError ? (error.status ?? 502) : 500
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The registry request failed."
    // Passed on so the browser can tell a validation problem from a request
    // that needs confirming: both arrive as one sentence otherwise.
    const problem = error instanceof ApiError ? error.problem : undefined

    return Response.json(
      { error: { message, status, ...(problem ? { problem } : {}) } },
      { status: status >= 400 && status <= 599 ? status : 502, headers }
    )
  }
}
