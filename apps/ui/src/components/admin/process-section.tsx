import { RefreshCwIcon, RotateCcwIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/lib/api/errors"

import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAsync } from "@/hooks/use-async"
import { formatDate, formatRelative } from "@/lib/format"
import { adminKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/registry"

// The running process. A driver change applies to the file the moment it is
// written; this is how a hand edit to the same file reaches the running build,
// and how a change that needs new code (the database URL, the port) is made.
export function ProcessSection() {
  const system = useAsync(
    (signal) => th.admin.getSystem({ signal }),
    [],
    adminKeys.system
  )
  const [pending, setPending] = useState<"reload" | "restart" | null>(null)
  const [confirming, setConfirming] = useState(false)

  if (system.status === "error") {
    return (
      <ErrorState
        message={system.error ?? "We couldn’t read the process."}
        onRetry={system.reload}
      />
    )
  }

  if (system.status === "loading" && !system.data) {
    return <LoadingRows rows={2} />
  }

  const data = system.data
  if (!data) {
    return null
  }

  async function reload() {
    setPending("reload")
    try {
      await th.admin.reloadSystem()
      toast.success("Configuration reloaded.")
      system.reload()
      // The reload rebuilt the config, routers and drivers. The sections that
      // hold a copy of one of those listen for this and read it again rather
      // than making the admin reload the whole document.
      window.dispatchEvent(new CustomEvent("triflare:config-reloaded"))
      setPending(null)
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : errorMessage(error)
      )
      setPending(null)
    }
  }

  async function restart() {
    setPending("restart")
    try {
      await th.admin.restartSystem()
      setConfirming(false)
      toast.success("Restarting. This page will reconnect when it is back.")
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : errorMessage(error)
      )
      setPending(null)
    }
  }

  const revisions = Object.entries(data.driversRevision)
    .map(([kind, revision]) => `${kind} ${revision}`)
    .join(" · ")

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-medium">
          <RefreshCwIcon className="size-4" /> Process
        </h2>
        <p className="text-sm text-muted-foreground">
          Reload after editing the configuration file by hand, or restart when a
          change needs new code. A reload keeps the listening socket open; a
          restart needs something outside to start the server again.
        </p>
      </div>

      <div className="divide-y rounded-lg border text-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-muted-foreground">Started</span>
          <span className="text-xs" title={formatDate(data.startedAt)}>
            {formatRelative(data.startedAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-muted-foreground">Last reload</span>
          <span className="text-xs">
            {data.lastReload ? formatRelative(data.lastReload) : "never"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-muted-foreground">Driver revisions</span>
          <span className="font-mono text-[11px]">{revisions || "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-muted-foreground">Configuration file</span>
          <span className="truncate font-mono text-[11px]">
            {data.configPath ?? "—"}
          </span>
        </div>
      </div>

      {data.supervised ? null : (
        <Alert>
          <AlertTitle>Not supervised</AlertTitle>
          <AlertDescription>
            Nothing outside this process is set up to start it again, so a
            restart would end the service. Run it under Docker’s `restart:
            unless-stopped`, systemd, or an equivalent, and set the supervised
            environment variable.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => void reload()}
          disabled={pending !== null}
        >
          <RefreshCwIcon />{" "}
          {pending === "reload" ? "Reloading…" : "Reload configuration"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setConfirming(true)}
          disabled={pending !== null || !data.supervised}
        >
          <RotateCcwIcon /> Restart process
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart the process?</DialogTitle>
            <DialogDescription>
              Open connections are dropped and builds in progress are
              interrupted; their publish fails and the client retries. The
              process exits and whatever supervises it starts a fresh one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={pending === "restart"}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void restart()}
              disabled={pending === "restart"}
            >
              {pending === "restart" ? "Restarting…" : "Restart now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
