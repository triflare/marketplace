import { SERVER_API_URL } from "@/lib/api.server"

// A badge is the one registry response that cannot go through the JSON bridge
// the rest of the app uses: an <img> in the page is the browser asking for it.
// Fetching it here instead keeps the browser talking only to this server, so a
// visitor whose network cannot reach the registry still sees the badge -- the
// same arrangement as the avatar and source proxies.
const FIELDS = new Set(["version", "downloads", "license"])

// The registry's own rules, restated so an address it would reject never
// becomes a request. Anything else is a 404 from here, not from upstream.
const NAMESPACE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/
const ID = /^[a-z0-9]{1,64}$/

function upstreamPath(splat: string | undefined): string | null {
  if (!splat) {
    return null
  }

  const [handle, id, field, ...rest] = splat.split("/")
  if (!handle?.startsWith("@") || !id || rest.length > 0) {
    return null
  }

  const namespace = handle.slice(1)
  if (!NAMESPACE.test(namespace) || !ID.test(id)) {
    return null
  }
  if (field !== undefined && !FIELDS.has(field)) {
    return null
  }

  return `/badge/@${namespace}/${id}${field ? `/${field}` : ""}`
}

export async function loader({
  request,
  params,
}: {
  request: Request
  params: Record<string, string | undefined>
}) {
  const path = upstreamPath(params["*"])
  if (!path) {
    return new Response("Not found", { status: 404 })
  }

  const target = new URL(`${SERVER_API_URL}${path}`)
  // ?label= is what repaints the left pill; the registry bounds its width.
  const label = new URL(request.url).searchParams.get("label")
  if (label) {
    target.searchParams.set("label", label)
  }

  let response: Response
  try {
    response = await fetch(target, { headers: { accept: "image/svg+xml" } })
  } catch {
    return new Response("Upstream unavailable", { status: 502 })
  }

  if (!response.ok || !response.body) {
    return new Response(null, {
      status: response.status === 404 ? 404 : 502,
    })
  }

  const headers = new Headers()
  headers.set(
    "content-type",
    response.headers.get("content-type") ?? "image/svg+xml"
  )
  headers.set("x-content-type-options", "nosniff")
  // The colour is hashed from the address and the facts move slowly, so a
  // short public cache is what keeps a README from hitting us per view.
  headers.set("cache-control", "public, max-age=300")

  return new Response(response.body, { status: 200, headers })
}
