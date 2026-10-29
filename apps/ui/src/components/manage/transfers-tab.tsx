import { SendIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { ExtensionDetail } from "@twextjs/twexthubkit"

import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { formatDate } from "@/lib/format"
import { manageKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/twexthub"

export function TransfersTab({ extension }: { extension: ExtensionDetail }) {
  const { user } = useAuth()
  const [target, setTarget] = useState("")
  const [pending, setPending] = useState(false)
  const [withdrawTarget, setWithdrawTarget] = useState<string | null>(null)

  const transfers = useAsync(
    (signal) =>
      th.extensions.transfers.list(extension.namespace, extension.id, {
        signal,
      }),
    [extension.namespace, extension.id],
    manageKeys.transfers(extension.namespace, extension.id)
  )

  async function offer(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await th.extensions.transfers.offer(
        extension.namespace,
        extension.id,
        target.trim()
      )
      setTarget("")
      transfers.reload()
      toast.success("Transfer offered.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function withdraw() {
    if (!withdrawTarget) {
      return
    }
    setPending(true)
    try {
      await th.extensions.transfers.withdraw(
        extension.namespace,
        extension.id,
        withdrawTarget
      )
      setWithdrawTarget(null)
      transfers.reload()
      toast.success("Offer withdrawn.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function accept(to: string) {
    setPending(true)
    try {
      await th.extensions.transfers.accept(
        extension.namespace,
        extension.id,
        to
      )
      transfers.reload()
      toast.success("Transfer accepted.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Transfer ownership</h2>
        <p className="text-sm text-muted-foreground">
          A transfer moves every release and owner invitation to another handle.
          The other person must accept before anything changes.
        </p>
      </div>

      {transfers.status === "error" ? (
        <ErrorState
          message={transfers.error ?? "We couldn’t load transfers."}
          onRetry={transfers.reload}
        />
      ) : transfers.status === "loading" || !transfers.data ? (
        <LoadingRows rows={1} />
      ) : transfers.data.data.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No transfer offers are waiting.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {transfers.data.data.map((transfer) => (
            <li
              key={transfer.to}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm">
                  Offer to{" "}
                  <span className="font-mono text-xs">@{transfer.to}</span> (
                  {transfer.display_name})
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {formatDate(transfer.created_at)}
                  {transfer.requested_by
                    ? ` · requested by @${transfer.requested_by}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {user?.namespace === transfer.to ? (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => void accept(transfer.to)}
                    disabled={pending}
                  >
                    Accept
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Withdraw offer to ${transfer.to}`}
                  onClick={() => setWithdrawTarget(transfer.to)}
                >
                  <XIcon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={offer}
        className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="transfer-target">Offer to handle</Label>
          <Input
            id="transfer-target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            required
            placeholder="new-owner"
          />
        </div>
        <Button type="submit" disabled={pending}>
          <SendIcon /> {pending ? "Sending…" : "Offer transfer"}
        </Button>
      </form>

      <ConfirmDialog
        open={withdrawTarget !== null}
        onOpenChange={(open) => !open && setWithdrawTarget(null)}
        title={`Withdraw the offer to @${withdrawTarget}?`}
        description="The other person can no longer accept it unless you offer again."
        confirmLabel="Withdraw"
        destructive
        pending={pending}
        onConfirm={() => void withdraw()}
      />
    </div>
  )
}
