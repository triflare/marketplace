import { serverApiUrl } from "@/lib/api.server"
import { readSession } from "@/lib/session.server"

const ACTIONS = new Set(["lookup", "approve", "deny"])

export async function action({
  request,
  params,
}: {
  request: Request
  params: Record<string, string | undefined>
}) {
  const action = params.action ?? ""
  if (!ACTIONS.has(action)) {
    return Response.json({ error: "Not found." }, { status: 404 })
  }

  let body: string
  try {
    body = JSON.stringify(await request.json())
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  const session = await readSession(request)
  const token = session.get("token")
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  }
  if (token) {
    headers.authorization = `Bearer ${token}`
  }

  let upstream: Response
  try {
    upstream = await fetch(`${serverApiUrl()}/auth/device/${action}`, {
      method: "POST",
      headers,
      body,
    })
  } catch {
    return Response.json(
      { error: "The registry could not be reached." },
      { status: 502 }
    )
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
