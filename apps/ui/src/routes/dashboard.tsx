import type { ExtensionSummary } from "@/lib/api"

import { loaderApi } from "@/lib/loader-api.server"
import { dashboardKey } from "@/lib/preload"
import { cursorFrom } from "@/lib/registry"

export { DashboardPage as default } from "@/pages/dashboard-page"

export async function loader({ request }: { request: Request }) {
  const context = await loaderApi(request)
  if (!context) {
    return { preload: {} }
  }

  const { api, user } = context

  try {
    const extensions: ExtensionSummary[] = []
    let cursor: string | undefined
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page = await api.extensions.list({
        namespace: user.namespace,
        limit: 50,
        sort: "updated",
        cursor,
      })
      extensions.push(...page.data)
      cursor = cursorFrom(page._links?.next)
      if (!cursor) {
        break
      }
    }

    const notifications = await api.notifications.list({ limit: 5 })
    return {
      preload: {
        [dashboardKey(user.namespace)]: { extensions, notifications },
      },
    }
  } catch {
    return { preload: {} }
  }
}
