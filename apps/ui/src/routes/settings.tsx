import { loaderApi } from "@/lib/loader-api.server"
import { settingsKeys } from "@/lib/preload"

export { SettingsPage as default } from "@/pages/settings-page"

export async function loader({ request }: { request: Request }) {
  const context = await loaderApi(request)
  if (!context) {
    return { preload: {} }
  }

  const { api, user } = context
  const preload: Record<string, unknown> = {}

  async function put(key: string, load: () => Promise<unknown>) {
    try {
      preload[key] = await load()
    } catch {
      // Leave this section to load on the client and show its own error.
    }
  }

  await Promise.all([
    put(settingsKeys.email, () => api.auth.getEmail()),
    put(settingsKeys.mfa, () => api.auth.getMfaState()),
    put(settingsKeys.sessions, () => api.sessions.list({ limit: 50 })),
    put(settingsKeys.auth, () => api.auth.describe()),
    put(settingsKeys.tokens, () => api.tokens.list({ limit: 50 })),
    put(settingsKeys.webhooks, () => api.users.webhooks.list(user.namespace)),
    put(settingsKeys.reports, () => api.reports.list({ limit: 50 })),
    put(settingsKeys.organizations, () => api.orgs.list({ limit: 30 })),
  ])

  const auth = preload[settingsKeys.auth] as { oidc?: unknown } | undefined
  if (auth) {
    if (auth.oidc) {
      await put(settingsKeys.identities, async () => {
        const identities = await api.auth.listOidcIdentities()
        return identities.data
      })
    } else {
      preload[settingsKeys.identities] = null
    }
  }

  return { preload }
}
