import { useLoaderData } from "react-router"

import {
  EmbedFrame,
  ExtensionEmbedCard,
  MissingEmbedCard,
} from "@/components/embeds/embed-cards"
import { serverApi } from "@/lib/api.server"
import { embedSize, embedTheme } from "@/lib/embeds"

// Embeds render without the site chrome, so they resolve their own data instead
// of going through the preload cache the app pages share.
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
  const url = new URL(request.url)
  const theme = embedTheme(url.searchParams.get("theme"))
  const size = embedSize(url.searchParams.get("size"))
  const origin = url.origin

  if (!namespace || !id) {
    return { extension: null, theme, size, origin }
  }

  try {
    const extension = await serverApi().extensions.get(namespace, id)
    return { extension, theme, size, origin }
  } catch {
    return { extension: null, theme, size, origin }
  }
}

export default function EmbedExtensionRoute() {
  const { extension, theme, size, origin } = useLoaderData<typeof loader>()

  return (
    <EmbedFrame theme={theme}>
      {extension ? (
        <ExtensionEmbedCard extension={extension} origin={origin} size={size} />
      ) : (
        <MissingEmbedCard what="extension" />
      )}
    </EmbedFrame>
  )
}
