import { serverApi } from "@/lib/api.server"
import { loadExtensionData } from "@/lib/extension-data"
import { extensionKey } from "@/lib/preload"
import { readSession } from "@/lib/session.server"

export { ExtensionPage as default } from "@/pages/extension-page"

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
  if (!namespace || !id) {
    return { preload: {} }
  }

  const session = await readSession(request)
  const token = session.get("token")
  const kit = serverApi(token)

  let viewer: string | undefined
  if (token) {
    try {
      viewer = (await kit.users.me()).namespace
    } catch {
      viewer = undefined
    }
  }

  try {
    const data = await loadExtensionData(kit, namespace, id, viewer)
    return { preload: { [extensionKey(namespace, id, viewer)]: data } }
  } catch {
    return { preload: {} }
  }
}
