import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useMatches } from "react-router"

export type PreloadMap = Record<string, unknown>

const PreloadContext = createContext<PreloadMap>({})

export const HOME_FEED_KEY = "home.feed"
export const AUTHORS_KEY = "authors"
export const ORGANIZATIONS_KEY = "organizations"

export function exploreKey(
  query: string,
  sort: string,
  license: string
): string {
  return `explore|${query}|${sort}|${license}`
}

export function authorProfileKey(namespace: string): string {
  return `author.profile|${namespace}`
}

export function authorExtensionsKey(namespace: string): string {
  return `author.extensions|${namespace}`
}

export function extensionKey(
  namespace: string,
  id: string,
  viewer?: string
): string {
  return `extension|${namespace}|${id}|${viewer ?? ""}`
}

export function legalKey(kind: string): string {
  return `legal|${kind}`
}

export function dashboardKey(namespace?: string): string {
  return `dashboard|${namespace ?? ""}`
}

export function notificationsKey(filter: "all" | "unread"): string {
  return `notifications|${filter}`
}

export const settingsKeys = {
  email: "settings.email",
  mfa: "settings.mfa",
  sessions: "settings.sessions",
  auth: "settings.auth",
  identities: "settings.identities",
  tokens: "settings.tokens",
  webhooks: "settings.webhooks",
  reports: "settings.reports",
  organizations: "settings.organizations",
} as const

export const adminKeys = {
  users: "admin.users",
  queue: "admin.queue",
  audit: "admin.audit",
  config: "admin.config",
  drivers: "admin.drivers",
  system: "admin.system",
  outbox: "admin.outbox",
  legal: "admin.legal",
  reports: (status: string) => `admin.reports|${status}`,
} as const

export const manageKeys = {
  access: (
    namespace: string,
    id: string,
    viewer: string | undefined,
    isAdmin: boolean
  ) => `manage.access|${namespace}|${id}|${viewer ?? ""}|${isAdmin}`,
  hidden: (namespace: string, id: string) => `manage.hidden|${namespace}|${id}`,
  tags: (namespace: string, id: string) => `manage.tags|${namespace}|${id}`,
  owners: (namespace: string, id: string) => `manage.owners|${namespace}|${id}`,
  transfers: (namespace: string, id: string) =>
    `manage.transfers|${namespace}|${id}`,
  webhooks: (namespace: string, id: string) =>
    `manage.webhooks|${namespace}|${id}`,
} as const

export const organizationKeys = {
  access: (namespace: string, viewer: string | undefined, isAdmin: boolean) =>
    `organization.access|${namespace}|${viewer ?? ""}|${isAdmin}`,
  owners: (namespace: string) => `organization.owners|${namespace}`,
  webhooks: (namespace: string) => `organization.webhooks|${namespace}`,
} as const

export function adminUserKey(namespace: string): string {
  return `admin.user|${namespace}`
}

export function PreloadProvider({ children }: { children: ReactNode }) {
  const matches = useMatches()

  const value = useMemo(() => {
    const merged: PreloadMap = {}
    for (const match of matches) {
      const data = match.loaderData as { preload?: PreloadMap } | undefined
      if (data && typeof data === "object" && data.preload) {
        Object.assign(merged, data.preload)
      }
    }
    return merged
  }, [matches])

  return (
    <PreloadContext.Provider value={value}>{children}</PreloadContext.Provider>
  )
}

export function usePreloaded(key?: string): unknown {
  const map = useContext(PreloadContext)
  if (!key) {
    return undefined
  }
  return map[key]
}
