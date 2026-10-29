import { serverApi } from "@/lib/api.server"
import { AUTHORS_KEY } from "@/lib/preload"

export { AuthorsPage as default } from "@/pages/authors-page"

export async function loader() {
  try {
    const page = await serverApi().users.list({ limit: 30 })
    return { preload: { [AUTHORS_KEY]: page } }
  } catch {
    return { preload: {} }
  }
}
