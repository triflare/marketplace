import { redirect } from "react-router"

import { safeReturnPath } from "@/lib/return-path"
import { readSession } from "@/lib/session.server"

export { LoginPage as default } from "@/pages/login-page"

export async function loader({ request }: { request: Request }) {
  const session = await readSession(request)
  const params = new URL(request.url).searchParams
  // Signing in while signed in adds another account to this browser, so `add`
  // is the one way to reach the form without being sent on to the dashboard.
  if (!session.get("token") || params.get("add") === "1") {
    return null
  }

  throw redirect(safeReturnPath(params.get("next")))
}
