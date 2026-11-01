import { createCookieSessionStorage, type Session } from "react-router"

import type { AccountSummary } from "@/lib/accounts"
import { getConfig } from "@/lib/config.server"

export type { Session }

export interface StoredAccount extends AccountSummary {
  token: string
}

export interface SessionData {
  /** Every account signed in on this browser, in the order they were added. */
  accounts?: StoredAccount[]
  /** The token every request runs as; always one of `accounts`. */
  token?: string
  remember: boolean
}

// The store is built on first use and rebuilt after onboarding writes a new
// secret, so the process does not have to restart to start signing real
// sessions. Before onboarding the cookie is only a placeholder.
let sessionStorage: ReturnType<
  typeof createCookieSessionStorage<SessionData>
> | null = null

function sessionStore() {
  if (sessionStorage) return sessionStorage
  const config = getConfig()
  const secret = config.session.secret ?? "triflare-setup-mode-session-secret"
  sessionStorage = createCookieSessionStorage<SessionData>({
    cookie: {
      name: config.session.name,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secrets: [secret],
      // Production is expected to terminate TLS in front of the app. Local
      // development is plain HTTP, where a Secure cookie would never be stored.
      secure: config.session.secure,
    },
  })
  return sessionStorage
}

/** Forget the cookie configuration after onboarding changes the secret. */
export function resetSessionStore(): void {
  sessionStorage = null
}

const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30

export function readSession(request: Request): Promise<Session<SessionData>> {
  return sessionStore().getSession(request.headers.get("cookie"))
}

export function commitSession(session: Session<SessionData>): Promise<string> {
  return sessionStore().commitSession(
    session,
    session.get("remember") ? { maxAge: REMEMBER_MAX_AGE } : undefined
  )
}

export function destroySession(session: Session<SessionData>) {
  return sessionStore().destroySession(session)
}

export async function sessionToken(request: Request): Promise<string | null> {
  const session = await readSession(request)
  return session.get("token") ?? null
}

/**
 * Every account this browser holds. A cookie written before the app could keep
 * more than one names a token but no account; the loader fills that entry in on
 * the next page load, so this list is only empty for a genuinely signed-out
 * browser.
 */
export function storedAccounts(session: Session<SessionData>): StoredAccount[] {
  return session.get("accounts") ?? []
}

export function accountSummaries(
  session: Session<SessionData>
): AccountSummary[] {
  return storedAccounts(session).map(
    ({ namespace, displayName, avatarUrl }) => ({
      namespace,
      displayName,
      avatarUrl,
    })
  )
}

export function activeToken(session: Session<SessionData>): string | null {
  return session.get("token") ?? null
}

export function setActiveToken(
  session: Session<SessionData>,
  token: string | null
): void {
  if (token) {
    session.set("token", token)
  } else {
    session.unset("token")
  }
}

/**
 * Sign one account in on this browser and make it the active one. Signing into
 * an account that is already stored replaces its entry in place, so a renewed
 * session never leaves the previous token behind and the menu keeps its order.
 */
export function rememberAccount(
  session: Session<SessionData>,
  account: StoredAccount
): void {
  const accounts = [...storedAccounts(session)]
  const index = accounts.findIndex(
    (entry) => entry.namespace === account.namespace
  )
  if (index === -1) {
    accounts.push(account)
  } else {
    accounts[index] = account
  }
  session.set("accounts", accounts)
  setActiveToken(session, account.token)
}

/** The stored account behind a namespace, when this browser holds it. */
export function storedAccountByNamespace(
  session: Session<SessionData>,
  namespace: string
): StoredAccount | null {
  return (
    storedAccounts(session).find((entry) => entry.namespace === namespace) ??
    null
  )
}

/** The stored account behind a token, when this browser holds it. */
export function storedAccountByToken(
  session: Session<SessionData>,
  token: string | null
): StoredAccount | null {
  if (!token) {
    return null
  }
  return storedAccounts(session).find((entry) => entry.token === token) ?? null
}

/**
 * Drop the account behind one token. When it was the active one, the account
 * added most recently takes over, so signing out never leaves the browser
 * pointing at a token it no longer holds.
 */
export function forgetAccountToken(
  session: Session<SessionData>,
  token: string
): void {
  const accounts = storedAccounts(session).filter(
    (entry) => entry.token !== token
  )
  session.set("accounts", accounts)
  if (activeToken(session) === token) {
    const next = accounts.at(-1)
    setActiveToken(session, next ? next.token : null)
  }
}

export function requireSessionSecret(): void {
  const config = getConfig()
  if (config.environment === "production" && !config.session.secret) {
    throw new Error(
      "session.secret must be set in production so sessions survive restarts."
    )
  }
}
