import { redirect } from "react-router"

import { readSession } from "@/lib/session.server"

export { SignupPage as default } from "@/pages/signup-page"

export async function loader({ request }: { request: Request }) {
  const session = await readSession(request)
  if (session.get("token")) {
    throw redirect("/dashboard")
  }
  return null
}
