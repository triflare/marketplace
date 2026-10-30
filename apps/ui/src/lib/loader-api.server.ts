import type { ApiClient, User } from "@/lib/api"

import { serverApi } from "@/lib/api.server"
import { readSession } from "@/lib/session.server"

export interface LoaderApi {
  api: ApiClient
  user: User
}

export async function loaderApi(request: Request): Promise<LoaderApi | null> {
  const session = await readSession(request)
  const token = session.get("token")
  if (!token) {
    return null
  }

  const api = serverApi(token)
  try {
    return { api, user: await api.users.me() }
  } catch {
    return null
  }
}
