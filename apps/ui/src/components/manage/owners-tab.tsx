import { UserPlusIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import type { ExtensionDetail } from "@/lib/api"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { formatDate } from "@/lib/format"
import { manageKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/registry"

export function OwnersTab({ extension }: { extension: ExtensionDetail }) {
  const { user } = useAuth()
  const [inviteNamespace, setInviteNamespace] = useState("")
  const [pending, setPending] = useState(false)
  const [removeNamespace, setRemoveNamespace] = useState<string | null>(null)

  const data = useAsync(
    async (signal) => {
      const [owners, invites] = await Promise.all([
        th.extensions.owners.list(extension.namespace, extension.id, {
          signal,
        }),
        th.extensions.owners.listInvites(extension.namespace, extension.id, {
          signal,
        }),
      ])
      return { owners: owners.data, invites: invites.data }
    },
    [extension.namespace, extension.id],
    manageKeys.owners(extension.namespace, extension.id)
  )

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await th.extensions.owners.invite(
        extension.namespace,
        extension.id,
        inviteNamespace.trim()
      )
      setInviteNamespace("")
      data.reload()
      toast.success("Invite sent.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (!removeNamespace) {
      return
    }
    setPending(true)
    try {
      await th.extensions.owners.remove(
        extension.namespace,
        extension.id,
        removeNamespace
      )
      setRemoveNamespace(null)
      data.reload()
      toast.success("Owner removed.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function accept() {
    if (!user) {
      return
    }
    setPending(true)
    try {
      await th.extensions.owners.accept(
        extension.namespace,
        extension.id,
        user.namespace
      )
      data.reload()
      toast.success("Invite accepted.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">People with access</h2>
        <p className="text-sm text-muted-foreground">
          Owners can publish releases, change version labels, and manage access.
        </p>
      </div>

      {data.status === "error" ? (
        <ErrorState
          message={data.error ?? "We couldn’t load owners."}
          onRetry={data.reload}
        />
      ) : data.status === "loading" || !data.data ? (
        <LoadingRows rows={2} />
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {data.data.owners.map((owner) => (
              <li
                key={owner.namespace}
                className="flex items-center justify-between gap-2 px-4 py-2.5"
              >
                <Link
                  to={`/@${owner.namespace}`}
                  className="flex min-w-0 items-center gap-2 text-sm hover:underline"
                >
                  <UserAvatar name={owner.display_name} size="sm" />
                  <span className="truncate">{owner.display_name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    @{owner.namespace}
                  </span>
                </Link>
                <div className="flex items-center gap-2">
                  {owner.added_at ? (
                    <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                      {formatDate(owner.added_at)}
                    </span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${owner.namespace}`}
                    onClick={() => setRemoveNamespace(owner.namespace)}
                  >
                    <XIcon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {data.data.invites.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Pending invites</h3>
              <ul className="divide-y rounded-lg border">
                {data.data.invites.map((inviteEntry) => (
                  <li
                    key={inviteEntry.namespace}
                    className="flex items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <span className="font-mono text-xs">
                      @{inviteEntry.namespace}
                    </span>
                    {user?.namespace === inviteEntry.namespace ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => void accept()}
                        disabled={pending}
                      >
                        Accept
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        waiting
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <form
        onSubmit={invite}
        className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="invite-namespace">Invite a handle</Label>
          <Input
            id="invite-namespace"
            value={inviteNamespace}
            onChange={(event) => setInviteNamespace(event.target.value)}
            required
            placeholder="collaborator"
          />
        </div>
        <Button type="submit" disabled={pending}>
          <UserPlusIcon /> {pending ? "Sending…" : "Send invite"}
        </Button>
      </form>

      <ConfirmDialog
        open={removeNamespace !== null}
        onOpenChange={(open) => !open && setRemoveNamespace(null)}
        title={`Remove @${removeNamespace}?`}
        description="They will no longer be able to publish releases or manage this extension."
        confirmLabel="Remove owner"
        confirmPhrase={removeNamespace ? `@${removeNamespace}` : undefined}
        destructive
        pending={pending}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
