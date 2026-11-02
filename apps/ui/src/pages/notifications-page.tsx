import { CheckCheckIcon, CheckIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import type { Notification } from "@/lib/api"

import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/context/auth"
import { usePagedList } from "@/hooks/use-paged-list"
import { formatRelative, humanizeKind } from "@/lib/format"
import { notificationsKey } from "@/lib/preload"
import { errorMessage, th } from "@/lib/registry"

const FILTER_KEY = "triflare.notifications.filter"

export function NotificationsPage() {
  const { user } = useAuth()
  // Start with the same value on the server and the first client render, then
  // restore the remembered choice once the page is interactive.
  const [filter, setFilterState] = useState<"all" | "unread">("all")
  const [accepting, setAccepting] = useState<string | null>(null)

  useEffect(() => {
    try {
      if (localStorage.getItem(FILTER_KEY) === "unread") {
        // Restoring a remembered UI preference after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFilterState("unread")
      }
    } catch {
      // Storage can be blocked; the all view is a safe fallback.
    }
  }, [])

  function setFilter(value: "all" | "unread") {
    setFilterState(value)
    try {
      localStorage.setItem(FILTER_KEY, value)
    } catch {
      // The filter still applies for this visit.
    }
  }

  const inbox = usePagedList(
    (cursor, signal) =>
      th.notifications.list({
        unread: filter === "unread" ? true : undefined,
        cursor,
        limit: 20,
        signal,
      }),
    [filter],
    notificationsKey(filter)
  )

  const unreadCount = inbox.items.filter((entry) => !entry.read).length

  async function markAll() {
    try {
      await th.notifications.markRead({ all: true })
      inbox.reload()
      toast.success("Inbox marked read.")
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function markOne(notification: Notification) {
    try {
      await th.notifications.markOneRead(notification.id)
      inbox.setItems(
        inbox.items.map((entry) =>
          entry.id === notification.id ? { ...entry, read: true } : entry
        )
      )
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function accept(
    notification: Notification,
    action: "invite" | "transfer"
  ) {
    const payload = notification.payload as {
      namespace?: unknown
      id?: unknown
    }
    if (
      !user ||
      typeof payload.namespace !== "string" ||
      typeof payload.id !== "string"
    ) {
      return
    }

    setAccepting(notification.id)
    try {
      if (action === "invite") {
        await th.extensions.owners.accept(
          payload.namespace,
          payload.id,
          user.namespace
        )
      } else {
        await th.extensions.transfers.accept(
          payload.namespace,
          payload.id,
          user.namespace
        )
      }
      toast.success(
        action === "invite" ? "Invite accepted." : "Transfer accepted."
      )
      inbox.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setAccepting(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="Moderation decisions, ownership changes, and registry announcements."
        actions={
          <Button
            variant="outline"
            onClick={() => void markAll()}
            disabled={unreadCount === 0 && filter === "all"}
          >
            <CheckCheckIcon /> Mark all read
          </Button>
        }
      />

      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as "all" | "unread")}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
        </TabsList>
      </Tabs>

      {inbox.status === "error" ? (
        <ErrorState
          message={inbox.error ?? "We couldn’t load notifications."}
          onRetry={inbox.reload}
        />
      ) : inbox.status === "loading" ? (
        <LoadingRows rows={4} />
      ) : inbox.items.length === 0 ? (
        <EmptyState
          title={filter === "unread" ? "Nothing unread" : "No notifications"}
          description="Moderators send notices here when something changes."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="divide-y overflow-hidden rounded-lg border">
            {inbox.items.map((notification) => {
              const target = notificationTarget(notification)
              const canAcceptInvite =
                notification.kind === "extension.owner.invited"
              const canAcceptTransfer =
                notification.kind === "extension.transfer.requested"
              return (
                <li
                  key={notification.id}
                  className={
                    notification.read ? "px-4 py-3" : "bg-muted/30 px-4 py-3"
                  }
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={
                        notification.read
                          ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-transparent"
                          : "mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{notification.message}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{humanizeKind(notification.kind)}</span>
                        <span>{formatRelative(notification.createdAt)}</span>
                        {target ? (
                          <Link
                            to={target}
                            className="text-foreground hover:underline"
                          >
                            Open
                          </Link>
                        ) : null}
                      </div>
                      {canAcceptInvite || canAcceptTransfer ? (
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={accepting !== null}
                            onClick={() =>
                              void accept(
                                notification,
                                canAcceptInvite ? "invite" : "transfer"
                              )
                            }
                          >
                            {accepting === notification.id
                              ? "Accepting…"
                              : "Accept"}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {!notification.read ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => void markOne(notification)}
                        aria-label="Mark read"
                      >
                        <CheckIcon /> Read
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          {inbox.hasMore ? (
            <Button
              variant="outline"
              className="self-center"
              onClick={inbox.loadMore}
              disabled={inbox.loadingMore}
            >
              {inbox.loadingMore ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function notificationTarget(notification: Notification): string | undefined {
  const payload = notification.payload as {
    namespace?: unknown
    id?: unknown
    extensionId?: unknown
  }

  if (typeof payload.namespace !== "string") {
    return undefined
  }

  if (typeof payload.id === "string") {
    return `/@${payload.namespace}/${payload.id}`
  }

  return `/@${payload.namespace}`
}
