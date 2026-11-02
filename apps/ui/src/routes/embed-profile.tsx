import { useLoaderData } from "react-router"

import {
  EmbedFrame,
  MissingEmbedCard,
  ProfileEmbedCard,
} from "@/components/embeds/embed-cards"
import { serverApi } from "@/lib/api.server"
import { embedSize, embedTheme } from "@/lib/embeds"

export async function loader({
  request,
  params,
}: {
  request: Request
  params: Record<string, string | undefined>
}) {
  const handle = params.namespace ?? ""
  const namespace = handle.startsWith("@") ? handle.slice(1) : ""
  const url = new URL(request.url)
  const theme = embedTheme(url.searchParams.get("theme"))
  const size = embedSize(url.searchParams.get("size"))
  const origin = url.origin

  if (!namespace) {
    return { profile: null, theme, size, origin }
  }

  try {
    const profile = await serverApi().users.get(namespace)
    return { profile, theme, size, origin }
  } catch {
    return { profile: null, theme, size, origin }
  }
}

export default function EmbedProfileRoute() {
  const { profile, theme, size, origin } = useLoaderData<typeof loader>()

  return (
    <EmbedFrame theme={theme}>
      {profile ? (
        <ProfileEmbedCard profile={profile} origin={origin} size={size} />
      ) : (
        <MissingEmbedCard what="profile" />
      )}
    </EmbedFrame>
  )
}
