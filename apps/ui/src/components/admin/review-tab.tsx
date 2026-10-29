import { CheckIcon, FileCodeIcon, GitCompareIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import type { PendingVersion } from "@twextjs/twexthubkit"

import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import { SourceCompareDialog } from "@/components/sources/source-compare-dialog"
import { SourceViewerDialog } from "@/components/sources/source-viewer-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAsync } from "@/hooks/use-async"
import { formatRelative } from "@/lib/format"
import { licenseName } from "@/lib/licenses"
import { adminKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/twexthub"

export function ReviewTab() {
  const [rejectTarget, setRejectTarget] = useState<PendingVersion | null>(null)
  const [sourceTarget, setSourceTarget] = useState<PendingVersion | null>(null)
  const [compareTarget, setCompareTarget] = useState<PendingVersion | null>(
    null
  )
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState<string | null>(null)

  const queue = useAsync(
    (signal) =>
      th.admin.listPendingVersions({ status: "pending", limit: 30, signal }),
    [],
    adminKeys.queue
  )

  async function approve(version: PendingVersion) {
    setPending(version.ownerNamespace + version.id + version.version)
    try {
      await th.extensions.versions.review(
        version.namespace,
        version.id,
        version.version,
        {
          status: "approved",
        }
      )
      toast.success(`Approved ${version.id} v${version.version}.`)
      queue.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(null)
    }
  }

  async function reject(event: React.FormEvent) {
    event.preventDefault()
    if (!rejectTarget) {
      return
    }
    setPending(rejectTarget.id + rejectTarget.version)
    try {
      await th.extensions.versions.review(
        rejectTarget.namespace,
        rejectTarget.id,
        rejectTarget.version,
        {
          status: "rejected",
          reason: reason.trim(),
        }
      )
      toast.success("Feedback sent to the author.")
      setRejectTarget(null)
      setReason("")
      queue.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(null)
    }
  }

  if (queue.status === "error") {
    return (
      <ErrorState
        message={queue.error ?? "We couldn’t load the review queue."}
        onRetry={queue.reload}
      />
    )
  }

  if (queue.status === "loading") {
    return <LoadingRows rows={3} />
  }

  if (!queue.data || queue.data.data.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-medium">Review queue</h2>
          <p className="text-sm text-muted-foreground">
            New publishers wait here for a moderator to check their work.
          </p>
        </div>
        <EmptyState
          title="Nothing to review"
          description="New submissions will appear here when they need a decision."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Review queue</h2>
        <p className="text-sm text-muted-foreground">
          Read the source, check the warnings, then approve or ask the author
          for changes.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {queue.data.data.map((version) => {
          const key = `${version.namespace}/${version.id}/${version.version}`
          return (
            <li key={key} className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Link
                      to={`/@${version.namespace}/${version.id}`}
                      className="font-medium hover:underline"
                    >
                      {version.name ?? version.id}
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">
                      @{version.namespace}/{version.id} · v{version.version}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {version.description || "No description yet."}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    From @{version.ownerNamespace} · uploaded{" "}
                    {formatRelative(version.createdAt)} ·{" "}
                    {version.license
                      ? licenseName(version.license)
                      : "no license listed"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {version._links?.source ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSourceTarget(version)}
                      >
                        <FileCodeIcon /> View source
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCompareTarget(version)}
                      >
                        <GitCompareIcon /> Compare
                      </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() => void approve(version)}
                    disabled={pending !== null}
                  >
                    <CheckIcon /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setRejectTarget(version)
                      setReason("")
                    }}
                    disabled={pending !== null}
                  >
                    <XIcon /> Reject
                  </Button>
                </div>
              </div>

              {version.warnings && version.warnings.length > 0 ? (
                <ul className="flex flex-col gap-1 rounded-md border border-destructive/30 p-2">
                  {version.warnings.map((warning, index) => (
                    <li
                      key={`${warning.file}-${warning.line}-${index}`}
                      className="font-mono text-[11px]"
                    >
                      {warning.code} · {warning.file}:{warning.line} —{" "}
                      {warning.message}
                    </li>
                  ))}
                </ul>
              ) : null}

              {version.buildLog ? (
                <details className="rounded-md border">
                  <summary className="cursor-pointer px-2 py-1 text-xs">
                    Build log
                  </summary>
                  <pre className="max-h-60 overflow-auto border-t p-2 font-mono text-[11px] whitespace-pre-wrap">
                    {version.buildLog}
                  </pre>
                </details>
              ) : null}
            </li>
          )
        })}
      </ul>

      <SourceViewerDialog
        key={`${sourceTarget?.namespace ?? ""}/${sourceTarget?.id ?? ""}/${sourceTarget?.version ?? "none"}`}
        open={sourceTarget !== null}
        onOpenChange={(open) => !open && setSourceTarget(null)}
        namespace={sourceTarget?.namespace ?? ""}
        id={sourceTarget?.id ?? ""}
        version={sourceTarget?.version ?? ""}
        label={sourceTarget ? `v${sourceTarget.version}` : undefined}
      />

      <SourceCompareDialog
        key={`${compareTarget?.namespace ?? ""}/${compareTarget?.id ?? ""}/${compareTarget?.version ?? "none"}`}
        open={compareTarget !== null}
        onOpenChange={(open) => !open && setCompareTarget(null)}
        namespace={compareTarget?.namespace ?? ""}
        id={compareTarget?.id ?? ""}
        initialVersion={compareTarget?.version ?? ""}
        extraVersions={compareTarget ? [compareTarget] : []}
      />

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ask for changes to v{rejectTarget?.version}
            </DialogTitle>
            <DialogDescription>
              Tell the author what needs to change. This message is shown to
              them.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={reject} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reject-reason">What needs to change?</Label>
              <Textarea
                id="reject-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                variant="destructive"
                disabled={pending !== null}
              >
                {pending !== null ? "Sending…" : "Send feedback"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
