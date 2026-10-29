import type TwextHubKit from "@twextjs/twexthubkit"
import type { User } from "@twextjs/twexthubkit"

import { serverApi } from "@/lib/api.server"
import { readSession } from "@/lib/session.server"

export interface LoaderApi {
  kit: TwextHubKit
  user: User
}

export async function loaderApi(request: Request): Promise<LoaderApi | null> {
  const session = await readSession(request)
  const token = session.get("token")
  if (!token) {
    return null
  }

  const kit = serverApi(token)
  try {
    return { kit, user: await kit.users.me() }
  } catch {
    return null
  }
}
