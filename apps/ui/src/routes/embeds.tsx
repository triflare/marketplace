import { useLoaderData } from "react-router"

import { EmbedsPage } from "@/pages/embeds-page"
import { serverApi } from "@/lib/api.server"

export default function EmbedsRoute() {
  const data = useLoaderData<typeof loader>()
  return <EmbedsPage {...data} />
}

export async function loader({ request }: { request: Request }) {
  const origin = new URL(request.url).origin
  const kit = serverApi()

  const [extensions, users] = await Promise.all([
    kit.extensions.list({ limit: 1, sort: "recent" }).catch(() => null),
    kit.users.list({ limit: 1 }).catch(() => null),
  ])

  const extension = extensions?.data[0]
  const profile = users?.data[0]

  return {
    origin,
    extension: extension
      ? {
          label: extension.name,
          path: `/@${extension.namespace}/${extension.id}`,
        }
      : null,
    profile: profile
      ? {
          label: profile.displayName,
          path: `/@${profile.namespace}`,
        }
      : null,
  }
}
