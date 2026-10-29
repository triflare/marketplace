import { serverApi } from "@/lib/api.server"
import { legalKey } from "@/lib/preload"
import { LegalPage } from "@/pages/legal-page"

export default function TermsRoute() {
  return <LegalPage kind="terms" />
}

export async function loader() {
  try {
    const document = await serverApi().instance.terms()
    return { preload: { [legalKey("terms")]: document } }
  } catch {
    return { preload: {} }
  }
}
