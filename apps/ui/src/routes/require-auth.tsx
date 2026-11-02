import { Outlet, redirect } from "react-router"

import { serverApi } from "@/lib/api.server"
import { readSession } from "@/lib/session.server"

export async function loader({ request }: { request: Request }) {
  const session = await readSession(request)
  const token = session.get("token")

  if (!token) {
    const url = new URL(request.url)
    const next = encodeURIComponent(`${url.pathname}${url.search}`)
    throw redirect(`/login?next=${next}`)
  }

  try {
    await serverApi(token).users.me()
  } catch {
    const url = new URL(request.url)
    const next = encodeURIComponent(`${url.pathname}${url.search}`)
    throw redirect(`/login?next=${next}`)
  }

  return null
}

export default function RequireAuthLayout() {
  return <Outlet />
}
