import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useNavigate } from "react-router"

import type { AuthSession, MfaRequired, User } from "@twextjs/twexthubkit"
import { toast } from "sonner"

import type { AccountSummary } from "@/lib/accounts"
import { th } from "@/lib/twexthub"

export interface SignInInput {
  namespace: string
  password: string
}

export type SignInResult =
  | { kind: "session"; session: AuthSession }
  | { kind: "mfa"; challenge: MfaRequired }

/** What the account menu needs to know about the account behind it. */
function accountSummaryOf(user: User): AccountSummary {
  return {
    namespace: user.namespace,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  }
}

interface AuthContextValue {
  user: User | null
  /** Every account this browser is signed in to, in the order they were added. */
  accounts: AccountSummary[]
  loading: boolean
  isAdmin: boolean
  signIn: (input: SignInInput) => Promise<SignInResult>
  completeMfa: (payload: {
    mfaToken: string
    response?: Record<string, unknown>
    backupCode?: string
  }) => Promise<AuthSession>
  signUp: (input: {
    namespace: string
    password: string
    displayName?: string
  }) => Promise<AuthSession>
  acceptSession: (session: AuthSession) => void
  /** Make another account this browser holds the one every request runs as. */
  switchAccount: (namespace: string) => Promise<void>
  remember: (remember: boolean) => void
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  setUser: (user: User) => void
}

const ACCOUNTS_PATH = "/__session/accounts"

interface SessionAccountsResponse {
  accounts: AccountSummary[]
  active: string | null
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({
  children,
  initialUser,
  initialAccounts,
}: {
  children: ReactNode
  initialUser: User | null
  initialAccounts: AccountSummary[]
}) {
  const [user, setUserState] = useState<User | null>(initialUser)
  // The accounts this browser holds are the server's to decide, and sign-in,
  // switching, and sign-out all rewrite them here as they happen. The list is
  // taken from the last page load as a starting point rather than synced from
  // it, so a later navigation cannot walk a fresh sign-in back.
  const [accounts, setAccounts] = useState<AccountSummary[]>(initialAccounts)
  const navigate = useNavigate()

  // The session cookie is written by the server. The in-memory user is what
  // keeps the header and guards in step until the next page-load, so auth
  // changes do not force loaders (such as the sign-in redirect) to re-run
  // mid-flow.
  const acceptSession = useCallback((session: AuthSession) => {
    setUserState(session.user)
    setAccounts((current) => {
      const summary = accountSummaryOf(session.user)
      const known = current.some(
        (entry) => entry.namespace === summary.namespace
      )
      return known
        ? current.map((entry) =>
            entry.namespace === summary.namespace ? summary : entry
          )
        : [...current, summary]
    })
  }, [])

  const signIn = useCallback(
    async (input: SignInInput): Promise<SignInResult> => {
      const result = await th.sessions.create({
        namespace: input.namespace,
        password: input.password,
      })

      if ("mfaRequired" in result) {
        return { kind: "mfa", challenge: result }
      }

      acceptSession(result)
      return { kind: "session", session: result }
    },
    [acceptSession]
  )

  const completeMfa = useCallback<AuthContextValue["completeMfa"]>(
    async (payload) => {
      const session = await th.auth.verifyMfa(payload)
      acceptSession(session)
      return session
    },
    [acceptSession]
  )

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async (input) => {
      const session = await th.users.create(input)
      acceptSession(session)
      return session
    },
    [acceptSession]
  )

  const remember = useCallback((stay: boolean) => {
    void fetch("/__session/remember", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ remember: stay }),
      credentials: "same-origin",
    })
  }, [])

  const switchAccount = useCallback(async (namespace: string) => {
    const response = await fetch(ACCOUNTS_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "switch", namespace }),
      credentials: "same-origin",
    })
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      throw new Error(payload?.error ?? "We couldn’t switch accounts.")
    }

    // Everything on the page was fetched as the previous account: the settings
    // lists, the inbox, and the manage pages are all that account's business,
    // so the document is reloaded rather than patched.
    window.location.reload()
  }, [])

  const signOut = useCallback(async () => {
    let remaining: AccountSummary[]
    try {
      // Signing out ends this account's session at the registry and leaves any
      // other account this browser holds signed in.
      const response = await fetch(ACCOUNTS_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "signOut" }),
        credentials: "same-origin",
      })
      if (response.ok) {
        remaining = ((await response.json()) as SessionAccountsResponse)
          .accounts
      } else if (response.status === 401) {
        // The session is already gone, so there is nothing left to end.
        remaining = []
      } else {
        throw new Error("Sign-out was refused.")
      }
    } catch {
      // The session lives on the server, so a sign-out that never got there
      // has not happened. Saying otherwise would leave the browser signed in
      // and the menu claiming it is not.
      toast.error("We couldn’t sign out. Check your connection and try again.")
      return
    }

    if (remaining.length > 0) {
      setAccounts(remaining)
      window.location.reload()
      return
    }

    setAccounts([])
    setUserState(null)
    navigate("/")
  }, [navigate])

  const refresh = useCallback(async () => {
    const account = await th.users.me()
    setUserState(account)
  }, [])

  const setUser = useCallback((account: User) => {
    setUserState(account)
    // A renamed account or a new avatar belongs in the switcher too.
    setAccounts((current) =>
      current.map((entry) =>
        entry.namespace === account.namespace
          ? accountSummaryOf(account)
          : entry
      )
    )
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accounts,
      loading: false,
      isAdmin: user?.role === "admin",
      signIn,
      completeMfa,
      signUp,
      acceptSession,
      switchAccount,
      remember,
      signOut,
      refresh,
      setUser,
    }),
    [
      user,
      accounts,
      signIn,
      completeMfa,
      signUp,
      acceptSession,
      switchAccount,
      remember,
      signOut,
      refresh,
      setUser,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider")
  }
  return context
}
