import { redirect } from "react-router"

import { readSession } from "@/lib/session.server"

export { StaySignedInPage as default } from "@/pages/stay-signed-in-page"

export async function loader({ request }: { request: Request }) {
  const session = await readSession(request)
  if (!session.get("token")) {
    throw redirect("/login")
  }
  return null
}
