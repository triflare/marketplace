import { loaderApi } from "@/lib/loader-api.server"
import { organizationKeys } from "@/lib/preload"

export { OrganizationManagePage as default } from "@/pages/organization-manage-page"

export async function loader({
  request,
  params,
}: {
  request: Request
  params: Record<string, string | undefined>
}) {
  const namespace = params.namespace ?? ""
  const context = await loaderApi(request)
  if (!namespace || !context) {
    return { preload: {} }
  }

  const { kit, user } = context
  const isAdmin = user.role === "admin"
  const preload: Record<string, unknown> = {}

  try {
    const [org, owners] = await Promise.all([
      kit.orgs.get(namespace),
      kit.orgs.listOwners(namespace),
    ])
    const allowed =
      isAdmin || owners.data.some((owner) => owner.namespace === user.namespace)

    preload[organizationKeys.access(namespace, user.namespace, isAdmin)] = {
      org,
      owners: owners.data,
      allowed,
    }

    if (allowed) {
      preload[organizationKeys.owners(namespace)] = owners
      try {
        preload[organizationKeys.webhooks(namespace)] =
          await kit.orgs.webhooks.list(namespace)
      } catch {
        // The delivery tab will show its own error.
      }
    }
  } catch {
    return { preload: {} }
  }

  return { preload }
}
