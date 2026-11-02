import { Outlet, redirect } from "react-router"

import { serverApi } from "@/lib/api.server"
import { readSession } from "@/lib/session.server"

export async function loader({ request }: { request: Request }) {
  const session = await readSession(request)
  const token = session.get("token")
  const url = new URL(request.url)

  if (!token) {
    const next = encodeURIComponent(`${url.pathname}${url.search}`)
    throw redirect(`/login?next=${next}`)
  }

  let user
  try {
    user = await serverApi(token).users.me()
  } catch {
    const next = encodeURIComponent(`${url.pathname}${url.search}`)
    throw redirect(`/login?next=${next}`)
  }

  if (user.role !== "admin") {
    throw redirect("/dashboard")
  }

  return null
}

export default function RequireAdminLayout() {
  return <Outlet />
}
