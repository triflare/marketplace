import { commitSession, readSession } from "@/lib/session.server"

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed." },
      { status: 405, headers: { allow: "POST" } }
    )
  }

  let remember: boolean
  try {
    const body = (await request.json()) as { remember?: unknown }
    remember = body.remember === true
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  const session = await readSession(request)
  if (!session.get("token")) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  session.set("remember", remember)
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": await commitSession(session) } }
  )
}
