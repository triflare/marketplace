import { serverApi } from "@/lib/api.server"
import { HOME_FEED_KEY } from "@/lib/preload"

export { HomePage as default } from "@/pages/home-page"

export async function loader() {
  const api = serverApi()

  try {
    const [meta, stats, trending, recent] = await Promise.all([
      api.instance.meta(),
      api.instance.stats(),
      api.extensions.trending({ limit: 5 }),
      api.extensions.list({ sort: "recent", limit: 6 }),
    ])
    return {
      preload: {
        [HOME_FEED_KEY]: {
          meta,
          stats,
          trending: trending.data,
          recent: recent.data,
        },
      },
    }
  } catch {
    // Let the page show its own error state rather than replacing the whole
    // document with the error boundary.
    return { preload: {} }
  }
}
