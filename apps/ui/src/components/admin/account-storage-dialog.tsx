import { useState } from "react"
import { toast } from "sonner"

import type { ServerConfig } from "@twextjs/twexthubkit"

import {
  FALLBACK_ACCOUNT_QUOTA,
  StorageUsage,
} from "@/components/admin/storage-usage"
import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAsync } from "@/hooks/use-async"
import { formatBytes } from "@/lib/format"
import { adminKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/twexthub"

const DEFAULT_QUOTA_SETTING = "limits.maxAccountBlobBytes"

// An account without its own cap follows the registry default, so the meter
// needs that setting to draw a meaningful scale. If the config cannot be read,
// the documented fallback keeps the bar working rather than hiding it.
function resolveRegistryQuota(config: ServerConfig | null): {
  limit: number
  assumed: boolean
} {
  const setting = config?.settings.find(
    (entry) => entry.key === DEFAULT_QUOTA_SETTING
  )
  const value = setting?.value
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return { limit: value, assumed: false }
  }
  return { limit: FALLBACK_ACCOUNT_QUOTA, assumed: true }
}

/**
 * How much storage one account may hold. The row the dialog is opened from
 * decides which account, and the body is only mounted while the dialog is open,
 * so every visit starts from that account's stored limit.
 */
export function AccountStorageDialog({
  namespace,
  open,
  onOpenChange,
}: {
  namespace: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && namespace ? <StorageBody namespace={namespace} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function StorageBody({ namespace }: { namespace: string }) {
  const config = useAsync(
    (signal) => th.admin.getConfig({ signal }),
    [],
    adminKeys.config
  )
  const registry = resolveRegistryQuota(config.data ?? null)
  const quota = useAsync(
    (signal) => th.admin.getQuota(namespace, { signal }),
    [namespace]
  )
  // Null until the limit is edited, so the field follows whatever the registry
  // reports and a reload after saving lands back on the stored value.
  const [edited, setEdited] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const stored = quota.data
  const limit =
    edited ??
    (stored
      ? stored.maxBlobBytes === null
        ? ""
        : String(stored.maxBlobBytes)
      : "")
  const value = Number(limit)
  const usable = limit === "" || (Number.isInteger(value) && value > 0)

  async function save() {
    setPending(true)
    try {
      await th.admin.setQuota(namespace, {
        maxBlobBytes: limit === "" ? null : value,
      })
      setEdited(null)
      quota.reload()
      toast.success("Storage limit saved.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Storage limit for @{namespace}</DialogTitle>
        <DialogDescription>
          The most this account may hold. An account without a limit of its own
          follows the registry default.
        </DialogDescription>
      </DialogHeader>

      {quota.status === "error" ? (
        <ErrorState
          message={quota.error ?? "We couldn’t load this account’s usage."}
          onRetry={quota.reload}
        />
      ) : !stored ? (
        <LoadingRows rows={2} />
      ) : (
        <>
          <StorageUsage
            namespace={namespace}
            usedBytes={stored.blobBytes}
            maxBlobBytes={stored.maxBlobBytes}
            defaultLimit={registry.limit}
            defaultIsAssumed={config.status === "error"}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-storage-limit">Maximum bytes</Label>
            <Input
              id="account-storage-limit"
              type="number"
              min={0}
              value={limit}
              onChange={(event) => setEdited(event.target.value)}
              placeholder={String(registry.limit)}
            />
            <p className="text-xs text-muted-foreground">
              {limit === ""
                ? `Empty uses the registry default (${formatBytes(registry.limit)}).`
                : usable
                  ? `That is ${formatBytes(value)}.`
                  : "Enter a whole number of bytes, or clear the field for the default."}
            </p>
          </div>

          <DialogFooter>
            {limit !== "" ? (
              <Button
                variant="ghost"
                onClick={() => setEdited("")}
                disabled={pending}
              >
                Use the default
              </Button>
            ) : null}
            <Button onClick={() => void save()} disabled={pending || !usable}>
              {pending ? "Saving…" : "Save limit"}
            </Button>
          </DialogFooter>
        </>
      )}
    </>
  )
}
