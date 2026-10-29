import { serverApi } from "@/lib/api.server"
import { ORGANIZATIONS_KEY } from "@/lib/preload"

export { OrganizationsPage as default } from "@/pages/organizations-page"

export async function loader() {
  try {
    const page = await serverApi().orgs.list({ limit: 30 })
    return { preload: { [ORGANIZATIONS_KEY]: page } }
  } catch {
    return { preload: {} }
  }
}
