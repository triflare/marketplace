import { ApiError } from "@/lib/api/errors"

import { loaderApi } from "@/lib/loader-api.server"
import { adminKeys } from "@/lib/preload"

export { AdminPage as default } from "@/pages/admin-page"

export async function loader({ request }: { request: Request }) {
  const context = await loaderApi(request)
  if (!context) {
    return { preload: {} }
  }

  const { api } = context
  const preload: Record<string, unknown> = {}

  async function put(key: string, load: () => Promise<unknown>) {
    try {
      preload[key] = await load()
    } catch {
      // The tab will fetch and render its own error state.
    }
  }

  await Promise.all([
    put(adminKeys.users, () => api.users.list({ limit: 20 })),
    put(adminKeys.queue, () =>
      api.admin.listPendingVersions({ status: "pending", limit: 30 })
    ),
    put(adminKeys.reports("open"), () =>
      api.admin.listReports({ status: "open", limit: 30 })
    ),
    put(adminKeys.audit, () => api.admin.listAudit({ limit: 30 })),
    put(adminKeys.config, () => api.admin.getConfig()),
    put(adminKeys.drivers, () => api.admin.listDrivers()),
    put(adminKeys.system, () => api.admin.getSystem()),
    put(adminKeys.outbox, () => api.admin.listMailOutbox({ limit: 30 })),
    put(adminKeys.legal, async () => {
      // An unpublished document answers 404; the tab starts from an empty one.
      const load = (read: () => Promise<unknown>) =>
        read().catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) {
            return null
          }
          throw error
        })

      const [terms, privacy] = await Promise.all([
        load(() => api.instance.terms()),
        load(() => api.instance.privacy()),
      ])
      return { terms, privacy }
    }),
  ])

  return { preload }
}
