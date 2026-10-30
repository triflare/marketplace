import { resolveManageAccess } from "@/lib/extension-access"
import { loaderApi } from "@/lib/loader-api.server"
import { manageKeys } from "@/lib/preload"

export { ExtensionManagePage as default } from "@/pages/extension-manage-page"

export async function loader({
  request,
  params,
}: {
  request: Request
  params: Record<string, string | undefined>
}) {
  const handle = params.namespace ?? ""
  const namespace = handle.startsWith("@") ? handle.slice(1) : ""
  const id = params.id ?? ""
  const context = await loaderApi(request)
  if (!namespace || !id || !context) {
    return { preload: {} }
  }

  const { api, user } = context
  const isAdmin = user.role === "admin"
  const preload: Record<string, unknown> = {}

  async function put(key: string, load: () => Promise<unknown>) {
    try {
      preload[key] = await load()
    } catch {
      // The tab will fetch and render its own error state.
    }
  }

  try {
    const access = await resolveManageAccess(api, namespace, id, user, isAdmin)
    preload[manageKeys.access(namespace, id, user.namespace, isAdmin)] = access

    if (access.allowed) {
      await Promise.all([
        put(manageKeys.hidden(namespace, id), async () => {
          const [pending, rejected] = await Promise.all([
            api.extensions.versions.list(namespace, id, { status: "pending" }),
            api.extensions.versions.list(namespace, id, { status: "rejected" }),
          ])
          return [...pending.data, ...rejected.data]
        }),
        put(manageKeys.tags(namespace, id), () =>
          api.extensions.tags.get(namespace, id)
        ),
        put(manageKeys.owners(namespace, id), async () => {
          const [owners, invites] = await Promise.all([
            api.extensions.owners.list(namespace, id),
            api.extensions.owners.listInvites(namespace, id),
          ])
          return { owners: owners.data, invites: invites.data }
        }),
        put(manageKeys.transfers(namespace, id), () =>
          api.extensions.transfers.list(namespace, id)
        ),
        put(manageKeys.webhooks(namespace, id), () =>
          api.extensions.webhooks.list(namespace, id)
        ),
      ])
    }
  } catch {
    return { preload: {} }
  }

  return { preload }
}
