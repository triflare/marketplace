import { serverApiUrl } from "@/lib/api.server"

export async function loader({ request }: { request: Request }) {
  const path = new URL(request.url).searchParams.get("path")

  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return new Response("Not found", { status: 404 })
  }

  let target: URL
  try {
    const origin = new URL(serverApiUrl()).origin
    target = new URL(path, origin)
    if (target.origin !== origin) {
      return new Response("Not found", { status: 404 })
    }
  } catch {
    return new Response("Not found", { status: 404 })
  }

  let response: Response
  try {
    response = await fetch(target, { headers: { accept: "image/*,*/*" } })
  } catch {
    return new Response("Upstream unavailable", { status: 502 })
  }

  if (!response.ok || !response.body) {
    return new Response(null, {
      status: response.status === 404 ? 404 : 502,
    })
  }

  const headers = new Headers()
  const type = response.headers.get("content-type")
  if (type) {
    headers.set("content-type", type)
  }
  headers.set("cache-control", "public, max-age=300")

  return new Response(response.body, { status: 200, headers })
}
