import { serverApi } from "@/lib/api.server"
import {
  accountSummaries,
  activeToken,
  commitSession,
  destroySession,
  forgetAccountToken,
  readSession,
  setActiveToken,
  storedAccountByNamespace,
  storedAccountByToken,
} from "@/lib/session.server"

const ACTIONS = new Set(["switch", "signOut"])

interface AccountsBody {
  action?: unknown
  namespace?: unknown
}

/**
 * The accounts this browser holds are decided here rather than in the RPC
 * gateway, because the cookie itself is the thing being changed: signing in
 * again and switching are both "which token does the next request use". The
 * list that comes back is what the client shows, so no token leaves this route.
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed." },
      { status: 405, headers: { allow: "POST" } }
    )
  }

  let body: AccountsBody
  try {
    body = (await request.json()) as AccountsBody
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  const action = typeof body.action === "string" ? body.action : ""
  if (!ACTIONS.has(action)) {
    return Response.json({ error: "Unknown action." }, { status: 400 })
  }

  const session = await readSession(request)
  const token = activeToken(session)
  if (!token) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  if (action === "switch") {
    const namespace = typeof body.namespace === "string" ? body.namespace : ""
    const target = storedAccountByNamespace(session, namespace)
    if (!target) {
      return Response.json(
        { error: `@${namespace} is not signed in on this browser.` },
        { status: 404 }
      )
    }

    setActiveToken(session, target.token)
    return Response.json(
      { accounts: accountSummaries(session), active: target.namespace },
      { headers: { "Set-Cookie": await commitSession(session) } }
    )
  }

  // Signing out ends the session at the registry too, so the token cannot be
  // replayed from anywhere. The account is dropped locally either way: a
  // registry that cannot be reached is no reason to keep a token this browser
  // has been told to forget.
  try {
    await serverApi(token).sessions.revokeCurrent()
  } catch {
    // The local account goes regardless.
  }
  forgetAccountToken(session, token)

  const accounts = accountSummaries(session)
  const active =
    storedAccountByToken(session, activeToken(session))?.namespace ?? null

  return Response.json(
    { accounts, active },
    {
      headers: {
        "Set-Cookie":
          accounts.length > 0
            ? await commitSession(session)
            : await destroySession(session),
      },
    }
  )
}
