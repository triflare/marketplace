import type { User } from "@twextjs/twexthubkit"
import type { Session } from "react-router"

import type { AccountSummary } from "@/lib/accounts"
import { serverApi } from "@/lib/api.server"
import {
  accountSummaries,
  activeToken,
  commitSession,
  destroySession,
  forgetAccountToken,
  rememberAccount,
  setActiveToken,
  storedAccounts,
  type SessionData,
  type StoredAccount,
} from "@/lib/session.server"

export interface ActiveAccount {
  /** The account this request runs as, or null when nobody is signed in. */
  user: User | null
  accounts: AccountSummary[]
  /** Set when the cookie no longer matches what the registry accepts. */
  cookie?: string
}

export function summaryFromUser(user: User): AccountSummary {
  return {
    namespace: user.namespace,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  }
}

async function accountFor(token: string): Promise<User | null> {
  try {
    return await serverApi(token).users.me()
  } catch {
    return null
  }
}

function differs(stored: StoredAccount | undefined, summary: AccountSummary) {
  return (
    !stored ||
    stored.namespace !== summary.namespace ||
    stored.displayName !== summary.displayName ||
    (stored.avatarUrl ?? null) !== (summary.avatarUrl ?? null)
  )
}

/**
 * The account this request runs as.
 *
 * The browser can be signed in to several accounts at once, and any one of the
 * tokens behind them can expire or be revoked elsewhere. So the account used
 * last is tried first, and if the registry no longer accepts it the cookie is
 * rewritten: that token is forgotten and the next account this browser holds
 * takes over. A signed-out browser that holds nothing is left alone.
 */
export async function resolveActiveAccount(
  session: Session<SessionData>
): Promise<ActiveAccount> {
  const active = activeToken(session)
  const others = storedAccounts(session)
    .map((entry) => entry.token)
    .filter((token) => token !== active)
    .reverse()
  const order = active ? [active, ...others] : others
  let changed = false

  for (const token of order) {
    const user = await accountFor(token)
    if (!user) {
      // The registry no longer accepts this session; this browser stops
      // holding it.
      forgetAccountToken(session, token)
      changed = true
      continue
    }

    const summary = summaryFromUser(user)
    const stored = storedAccounts(session).find(
      (entry) => entry.token === token
    )
    if (differs(stored, summary) || token !== active) {
      // A profile that moved on, a cookie written before the browser tracked
      // its accounts, or a fallback to another account: all are worth a write.
      rememberAccount(session, { token, ...summary })
      changed = true
    }

    return {
      user,
      accounts: accountSummaries(session),
      cookie: changed ? await commitSession(session) : undefined,
    }
  }

  if (!changed) {
    // Nothing stored, nothing lost: this browser is simply signed out.
    return { user: null, accounts: [] }
  }

  // Every token this browser held has been dropped, so the cookie goes too.
  setActiveToken(session, null)
  return { user: null, accounts: [], cookie: await destroySession(session) }
}
