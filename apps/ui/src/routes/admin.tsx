import { TwextHubError } from "@twextjs/twexthubkit"

import { loaderApi } from "@/lib/loader-api.server"
import { adminKeys } from "@/lib/preload"

export { AdminPage as default } from "@/pages/admin-page"

export async function loader({ request }: { request: Request }) {
  const context = await loaderApi(request)
  if (!context) {
    return { preload: {} }
  }

  const { kit } = context
  const preload: Record<string, unknown> = {}

  async function put(key: string, load: () => Promise<unknown>) {
    try {
      preload[key] = await load()
    } catch {
      // The tab will fetch and render its own error state.
    }
  }

  await Promise.all([
    put(adminKeys.users, () => kit.users.list({ limit: 20 })),
    put(adminKeys.queue, () =>
      kit.admin.listPendingVersions({ status: "pending", limit: 30 })
    ),
    put(adminKeys.reports("open"), () =>
      kit.admin.listReports({ status: "open", limit: 30 })
    ),
    put(adminKeys.audit, () => kit.admin.listAudit({ limit: 30 })),
    put(adminKeys.config, () => kit.admin.getConfig()),
    put(adminKeys.legal, async () => {
      // An unpublished document answers 404; the tab starts from an empty one.
      const load = (read: () => Promise<unknown>) =>
        read().catch((error: unknown) => {
          if (error instanceof TwextHubError && error.status === 404) {
            return null
          }
          throw error
        })

      const [terms, privacy] = await Promise.all([
        load(() => kit.instance.terms()),
        load(() => kit.instance.privacy()),
      ])
      return { terms, privacy }
    }),
  ])

  return { preload }
}
