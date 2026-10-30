import {
  ArrowUpRightIcon,
  BellIcon,
  BookmarkIcon,
  CheckIcon,
  SettingsIcon,
  UploadIcon,
} from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"

import type { ExtensionSummary } from "@/lib/api"

import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import { ButtonLink } from "@/components/common/button-link"
import { PageHeader } from "@/components/common/page-header"
import { ExtensionRow } from "@/components/extensions/extension-row"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import {
  formatDate,
  formatNumber,
  formatRelative,
  humanizeKind,
} from "@/lib/format"
import { dashboardKey } from "@/lib/preload"
import { extend } from "@/lib/product"
import { cursorFrom, errorMessage, th } from "@/lib/registry"
import { useSaved } from "@/lib/saved"

/** How many of the publisher's extensions the dashboard lists. */
const VISIBLE_EXTENSIONS = 6

async function countVersions(
  namespace: string,
  id: string,
  status: "pending" | "rejected",
  signal: AbortSignal
): Promise<number> {
  try {
    const page = await th.extensions.versions.list(namespace, id, {
      status,
      limit: 50,
      signal,
    })
    return page.data.length
  } catch {
    // A refused or failed count is not worth an error state on the dashboard.
    return 0
  }
}

export function DashboardPage() {
  const { user, isAdmin } = useAuth()
  const saved = useSaved()

  const data = useAsync(
    async (signal) => {
      if (!user) {
        return null
      }

      // The dashboard summary counts every extension the account publishes, so
      // walk the pages instead of reporting only the first screenful.
      const extensions: ExtensionSummary[] = []
      let cursor: string | undefined
      for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
        const page = await th.extensions.list({
          namespace: user.namespace,
          limit: 50,
          sort: "updated",
          cursor,
          signal,
        })
        extensions.push(...page.data)
        cursor = cursorFrom(page._links?.next)
        if (!cursor) {
          break
        }
      }

      const notifications = await th.notifications.list({ limit: 5, signal })
      return { extensions, notifications }
    },
    [user?.namespace],
    dashboardKey(user?.namespace)
  )

  const listed = data.data?.extensions ?? []
  const shown = listed.slice(0, VISIBLE_EXTENSIONS)
  // The registry lists published addresses and has no per-account view of the
  // review queue, so the releases waiting for a moderator are read back one
  // address at a time, for the rows this page actually shows.
  const shownKey = shown
    .map((entry) => `${entry.namespace}/${entry.id}`)
    .join(" ")
  const review = useAsync(
    async (signal) => {
      const entries = await Promise.all(
        shown.map(async (entry) => {
          const [pending, rejected] = await Promise.all([
            countVersions(entry.namespace, entry.id, "pending", signal),
            countVersions(entry.namespace, entry.id, "rejected", signal),
          ])
          return [
            `${entry.namespace}/${entry.id}`,
            { pending, rejected },
          ] as const
        })
      )
      return new Map(entries)
    },
    [shownKey]
  )

  if (!user) {
    return null
  }

  const extensions = listed
  const downloads = extensions.reduce(
    (total, entry) => total + Number(entry.downloads ?? 0),
    0
  )

  async function markAllRead() {
    try {
      await th.notifications.markRead({ all: true })
      data.reload()
      toast.success("Inbox marked read.")
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`@${user.namespace}`}
        title={`Welcome back, ${user.displayName}`}
        description="Manage your extensions, read moderation decisions, and keep your account in order."
        actions={
          <>
            <ButtonLink variant="outline" to="/settings">
              <SettingsIcon /> Settings
            </ButtonLink>
            <ButtonLink to="/publish">
              <UploadIcon /> Publish
            </ButtonLink>
          </>
        }
      />

      <section className="grid grid-cols-2 divide-x overflow-hidden rounded-lg border sm:grid-cols-4">
        {[
          { label: "Extensions", value: extensions.length },
          { label: "Downloads", value: downloads },
          {
            label: "Unread",
            value: data.data?.notifications.unreadCount ?? 0,
          },
          { label: "Saved", value: saved.length },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <div className="mt-0.5 font-mono text-xl tabular-nums">
              {data.status === "loading" ? (
                <Skeleton className="h-5 w-10" />
              ) : (
                formatNumber(stat.value)
              )}
            </div>
          </div>
        ))}
      </section>

      {isAdmin ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
          <span>
            You have administrator access. The review queue, reports, and
            registry settings are under Administration.
          </span>
          <ButtonLink variant="outline" size="sm" to="/admin">
            Open administration
          </ButtonLink>
        </div>
      ) : null}

      {data.status === "error" ? (
        <ErrorState
          message={data.error ?? "We couldn’t load your dashboard."}
          onRetry={data.reload}
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Your extensions
                </h2>
                <p className="text-sm text-muted-foreground">
                  Everything you publish under @{user.namespace}.
                </p>
              </div>
              <ButtonLink variant="ghost" size="sm" to={`/@${user.namespace}`}>
                Public profile
              </ButtonLink>
            </div>
            {data.status === "loading" ? (
              <LoadingRows rows={3} />
            ) : extensions.length === 0 ? (
              <EmptyState
                title="You have not published yet"
                description={`Create a ${extend.name} project and publish it with the CLI, or upload an existing project archive. A first release waits for a moderator before it is listed here or in the registry.`}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <ButtonLink to="/developers" variant="outline">
                      Read the developer guide
                    </ButtonLink>
                    <ButtonLink to="/publish">
                      Publish your first extension
                    </ButtonLink>
                  </div>
                }
              />
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border">
                {shown.map((extension) => (
                  <ExtensionRow
                    key={`${extension.namespace}/${extension.id}`}
                    extension={extension}
                    review={review.data?.get(
                      `${extension.namespace}/${extension.id}`
                    )}
                  />
                ))}
              </ul>
            )}
            {extensions.length > 0 ? (
              <Link
                to={`/@${user.namespace}`}
                className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
              >
                See all public extensions{" "}
                <ArrowUpRightIcon className="size-3.5" />
              </Link>
            ) : null}
          </section>

          <aside className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
                <BellIcon className="size-4" /> Notifications
              </h2>
              {data.data && data.data.notifications.unreadCount > 0 ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void markAllRead()}
                >
                  <CheckIcon /> Mark all read
                </Button>
              ) : null}
            </div>
            {data.status === "loading" ? (
              <LoadingRows rows={3} />
            ) : data.data && data.data.notifications.data.length > 0 ? (
              <ul className="divide-y overflow-hidden rounded-lg border">
                {data.data.notifications.data.map((notification) => (
                  <li
                    key={notification.id}
                    className={
                      notification.read
                        ? "px-4 py-3"
                        : "border-l-2 border-l-foreground bg-muted/30 px-4 py-3"
                    }
                  >
                    <p className="text-sm">{notification.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {humanizeKind(notification.kind)} ·{" "}
                      {formatRelative(notification.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No notifications"
                description="Moderation decisions and account notices show up here."
              />
            )}
            <Link
              to="/notifications"
              className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
            >
              All notifications <ArrowUpRightIcon className="size-3.5" />
            </Link>

            <div className="mt-2 flex flex-col gap-2 rounded-lg border p-4">
              <h2 className="text-sm font-medium">Next steps</h2>
              <Link
                to="/settings?tab=security"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <SettingsIcon className="size-4" /> Secure your account
              </Link>
              <Link
                to="/developers"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <UploadIcon className="size-4" /> Publish from the command line
              </Link>
              <Link
                to="/saved"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <BookmarkIcon className="size-4" /> Open saved extensions
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                Member since {formatDate(user.createdAt)}
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
