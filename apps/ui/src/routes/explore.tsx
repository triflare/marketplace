import { serverApi } from "@/lib/api.server"
import { exploreKey } from "@/lib/preload"

export { ExplorePage as default } from "@/pages/explore-page"

const SORTS = new Set(["recent", "downloads", "updated", "name"])

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url)
  const query = url.searchParams.get("q") ?? ""
  const requested = url.searchParams.get("sort") ?? ""
  const sort = SORTS.has(requested) ? requested : "recent"
  const license = url.searchParams.get("license") ?? ""

  const options = {
    sort: sort as never,
    license: license || undefined,
    limit: 20,
  }

  try {
    const kit = serverApi()
    const page = query
      ? await kit.extensions.search(query, options)
      : await kit.extensions.list(options)
    return { preload: { [exploreKey(query, sort, license)]: page } }
  } catch {
    return { preload: {} }
  }
}
