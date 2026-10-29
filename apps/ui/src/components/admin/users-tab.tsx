import {
  HardDriveIcon,
  MoreHorizontalIcon,
  ShieldCheckIcon,
  ShieldMinusIcon,
  TrashIcon,
} from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import type { User, UserRole } from "@twextjs/twexthubkit"

import { AccountStorageDialog } from "@/components/admin/account-storage-dialog"
import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { UserAvatar } from "@/components/common/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/auth"
import { usePagedList } from "@/hooks/use-paged-list"
import { formatDate } from "@/lib/format"
import { adminKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/twexthub"

const PAGE_SIZE = 20

/**
 * Every account on the registry, with the moderation a moderator does to an
 * account rather than to a release: the admin role, the storage an account may
 * hold, and deleting it. Each row links to the account's public profile.
 */
export function UsersTab() {
  const { user } = useAuth()
  const accounts = usePagedList(
    (cursor, signal) => th.users.list({ cursor, limit: PAGE_SIZE, signal }),
    [],
    adminKeys.users
  )
  const [pending, setPending] = useState<string | null>(null)
  const [storageTarget, setStorageTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  async function setRole(target: User, role: UserRole) {
    setPending(target.namespace)
    try {
      const updated = await th.users.update(target.namespace, { role })
      accounts.setItems(
        accounts.items.map((entry) =>
          entry.namespace === updated.namespace ? updated : entry
        )
      )
      toast.success(
        role === "admin"
          ? `@${updated.namespace} is an admin now.`
          : `@${updated.namespace} is no longer an admin.`
      )
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(null)
    }
  }

  async function remove(target: User) {
    setPending(target.namespace)
    try {
      await th.users.delete(target.namespace)
      accounts.setItems(
        accounts.items.filter((entry) => entry.namespace !== target.namespace)
      )
      setDeleteTarget(null)
      toast.success(`@${target.namespace} was deleted.`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Users</h2>
        <p className="text-sm text-muted-foreground">
          Every account on this registry. Moderation here acts on the account;
          the review queue looks at individual releases.
        </p>
      </div>

      {accounts.status === "error" ? (
        <ErrorState
          message={accounts.error ?? "We couldn’t load accounts."}
          onRetry={accounts.reload}
        />
      ) : accounts.status === "loading" ? (
        <LoadingRows rows={5} />
      ) : accounts.items.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="The first person to join the registry will appear here."
        />
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-lg border">
            {accounts.items.map((account) => {
              const isSelf = account.namespace === user?.namespace
              const isOrganization = account.kind === "organization"
              const isAdmin = account.role === "admin"
              const busy = pending !== null

              return (
                <li
                  key={account.namespace}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                >
                  <Link
                    to={`/@${account.namespace}`}
                    className="group flex min-w-0 flex-1 items-center gap-3"
                  >
                    <UserAvatar
                      name={account.displayName}
                      src={account.avatarUrl}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium group-hover:underline">
                          {account.displayName}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          @{account.namespace}
                        </span>
                        {isAdmin ? (
                          <Badge variant="secondary">admin</Badge>
                        ) : null}
                        {isOrganization ? (
                          <Badge variant="outline">organization</Badge>
                        ) : null}
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">
                            (you)
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                        {account.bio || "No bio yet."}
                      </p>
                    </div>
                  </Link>

                  <span className="hidden text-[11px] text-muted-foreground md:inline">
                    Joined {formatDate(account.createdAt)}
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Moderation for @${account.namespace}`}
                          disabled={busy}
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        render={
                          <Link to={`/admin/users/${account.namespace}`} />
                        }
                      >
                        <ShieldCheckIcon /> Edit profile
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setStorageTarget(account)}
                      >
                        <HardDriveIcon /> Storage limit…
                      </DropdownMenuItem>
                      {/* A registry organization has no role and no account to
                          delete; the API refuses both, so they are not offered. */}
                      {isOrganization ? null : (
                        <>
                          <DropdownMenuItem
                            disabled={isSelf || busy}
                            onClick={() =>
                              void setRole(
                                account,
                                isAdmin ? "normal" : "admin"
                              )
                            }
                          >
                            {isAdmin ? (
                              <ShieldMinusIcon />
                            ) : (
                              <ShieldCheckIcon />
                            )}
                            {isAdmin ? "Remove admin" : "Make admin"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={isSelf || busy}
                            onClick={() => setDeleteTarget(account)}
                          >
                            <TrashIcon /> Delete account
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>

          {accounts.hasMore ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={accounts.loadMore}
                disabled={accounts.loadingMore}
              >
                {accounts.loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <AccountStorageDialog
        namespace={storageTarget?.namespace ?? null}
        open={storageTarget !== null}
        onOpenChange={(open) => !open && setStorageTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete @${deleteTarget?.namespace}?`}
        description="The account and everything only it published are removed from this registry. This cannot be undone."
        confirmLabel="Delete account"
        confirmPhrase={deleteTarget ? `@${deleteTarget.namespace}` : undefined}
        destructive
        pending={pending !== null}
        onConfirm={() => deleteTarget && void remove(deleteTarget)}
      />
    </div>
  )
}
