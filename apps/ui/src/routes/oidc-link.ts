import { SERVER_API_URL } from "@/lib/api.server"
import { readSession } from "@/lib/session.server"

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed." },
      { status: 405, headers: { allow: "POST" } }
    )
  }

  const session = await readSession(request)
  const token = session.get("token")
  if (!token) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  let returnTo: string
  try {
    const body = (await request.json()) as { returnTo?: unknown }
    if (typeof body.returnTo !== "string") {
      throw new Error("missing returnTo")
    }
    returnTo = body.returnTo
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${SERVER_API_URL}/auth/oidc/link`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ returnTo }),
    })
  } catch {
    return Response.json(
      { error: "The registry could not be reached." },
      { status: 502 }
    )
  }

  const headers = new Headers({ "content-type": "application/json" })
  // The provider flow is bound to a cookie the API sets here. Relay it so the
  // callback, which lands on the API, can find the flow again.
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("set-cookie", cookie)
  }

  const text = await upstream.text()
  return new Response(text || "{}", { status: upstream.status, headers })
}
