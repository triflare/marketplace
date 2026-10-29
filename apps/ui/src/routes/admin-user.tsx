import { loaderApi } from "@/lib/loader-api.server"
import { adminUserKey } from "@/lib/preload"

export { AdminUserPage as default } from "@/pages/admin-user-page"

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

  try {
    const account = await context.kit.users.get(namespace)
    return { preload: { [adminUserKey(namespace)]: account } }
  } catch {
    return { preload: {} }
  }
}
