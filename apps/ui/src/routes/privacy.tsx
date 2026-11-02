import { serverApi } from "@/lib/api.server"
import { legalKey } from "@/lib/preload"
import { LegalPage } from "@/pages/legal-page"

export default function PrivacyRoute() {
  return <LegalPage kind="privacy" />
}

export async function loader() {
  try {
    const document = await serverApi().instance.privacy()
    return { preload: { [legalKey("privacy")]: document } }
  } catch {
    return { preload: {} }
  }
}
