import { loaderApi } from "@/lib/loader-api.server"
import { notificationsKey } from "@/lib/preload"

export { NotificationsPage as default } from "@/pages/notifications-page"

export async function loader({ request }: { request: Request }) {
  const context = await loaderApi(request)
  if (!context) {
    return { preload: {} }
  }

  try {
    const page = await context.kit.notifications.list({ limit: 20 })
    return { preload: { [notificationsKey("all")]: page } }
  } catch {
    return { preload: {} }
  }
}
