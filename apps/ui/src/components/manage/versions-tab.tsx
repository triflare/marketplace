import {
  DownloadIcon,
  FileCodeIcon,
  GitCompareIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { ExtensionDetail, VersionInfo } from "@/lib/api"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { VersionStatusBadge } from "@/components/extensions/version-status"
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
import { formatDate, formatNumber } from "@/lib/format"
import { manageKeys } from "@/lib/preload"
import { errorMessage, saveBlob, th } from "@/lib/registry"

export function VersionsTab({ extension }: { extension: ExtensionDetail }) {
  const [deprecateTarget, setDeprecateTarget] = useState<VersionInfo | null>(
    null
  )
  const [deprecationMessage, setDeprecationMessage] = useState("")
  const [yankTarget, setYankTarget] = useState<VersionInfo | null>(null)
  const [sourceTarget, setSourceTarget] = useState<VersionInfo | null>(null)
  const [compareTarget, setCompareTarget] = useState<VersionInfo | null>(null)
  const [pending, setPending] = useState(false)

  const hidden = useAsync(
    async (signal) => {
      const [pendingPage, rejectedPage] = await Promise.all([
        th.extensions.versions.list(extension.namespace, extension.id, {
          status: "pending",
          signal,
        }),
        th.extensions.versions.list(extension.namespace, extension.id, {
          status: "rejected",
          signal,
        }),
      ])
      return [...pendingPage.data, ...rejectedPage.data]
    },
    [extension.namespace, extension.id],
    manageKeys.hidden(extension.namespace, extension.id)
  )

  async function applyDeprecation(event: React.FormEvent) {
    event.preventDefault()
    if (!deprecateTarget) {
      return
    }
    setPending(true)
    try {
      await th.extensions.versions.review(
        extension.namespace,
        extension.id,
        deprecateTarget.version,
        { deprecationMessage: deprecationMessage.trim() || null }
      )
      toast.success("Version updated.")
      setDeprecateTarget(null)
      hidden.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function yank() {
    if (!yankTarget) {
      return
    }
    setPending(true)
    try {
      await th.extensions.versions.delete(
        extension.namespace,
        extension.id,
        yankTarget.version
      )
      toast.success("Version removed.")
      setYankTarget(null)
      hidden.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  // A project whose first release is still waiting for review has no published
  // detail at all, so the rows only an owner can see are also the extension's
  // own list; keep one row per version either way.
  const rows = [
    ...new Map(
      [...(hidden.data ?? []), ...extension.versions].map((version) => [
        version.version,
        version,
      ])
    ).values(),
  ]
  const waitingForReview = rows.some((version) => version.status === "pending")

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Releases</h2>
        <p className="text-sm text-muted-foreground">
          Deprecating keeps a release available with a notice. Removing a
          release takes it out of the registry.
          {waitingForReview
            ? " A release in review is published or sent back by a moderator, so it cannot be removed here."
            : null}
        </p>
      </div>

      {hidden.status === "error" ? (
        <ErrorState
          message={hidden.error ?? "We couldn’t load pending versions."}
          onRetry={hidden.reload}
        />
      ) : hidden.status === "loading" ? (
        <LoadingRows rows={3} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((version) => (
            <li key={version.version} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">v{version.version}</span>
                  <VersionStatusBadge status={version.status} />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatNumber(version.downloads)} downloads ·{" "}
                    {formatDate(version.publishedAt ?? version.createdAt)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {version.status === "published" ||
                  version.status === "deprecated" ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setDeprecateTarget(version)
                        setDeprecationMessage(version.deprecation ?? "")
                      }}
                    >
                      {version.status === "deprecated"
                        ? "Edit notice"
                        : "Deprecate"}
                    </Button>
                  ) : null}
                  {version._links?.source ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setSourceTarget(version)}
                    >
                      <FileCodeIcon /> Source
                    </Button>
                  ) : null}
                  {version._links?.source && rows.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setCompareTarget(version)}
                    >
                      <GitCompareIcon /> Compare
                    </Button>
                  ) : null}
                  {version.status === "published" ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={async () => {
                        try {
                          const blob = await th.extensions.versions.download(
                            extension.namespace,
                            extension.id,
                            version.version
                          )
                          saveBlob(
                            blob,
                            `${extension.id}-${version.version}.js`
                          )
                        } catch (error) {
                          toast.error(errorMessage(error))
                        }
                      }}
                    >
                      <DownloadIcon /> Download
                    </Button>
                  ) : null}
                  {version.status === "published" ||
                  version.status === "deprecated" ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setYankTarget(version)}
                    >
                      <Trash2Icon /> Remove release
                    </Button>
                  ) : null}
                </div>
              </div>
              {version.rejectionReason ? (
                <p className="text-xs text-destructive">
                  Rejected: {version.rejectionReason}
                </p>
              ) : null}
              {version.deprecation ? (
                <p className="text-xs text-muted-foreground">
                  Deprecation: {version.deprecation}
                </p>
              ) : null}
              {version.buildLog && version.status !== "published" ? (
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
          ))}
        </ul>
      )}

      <Dialog
        open={deprecateTarget !== null}
        onOpenChange={(open) => !open && setDeprecateTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deprecate v{deprecateTarget?.version}</DialogTitle>
            <DialogDescription>
              Leave the message empty to remove the deprecation notice.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={applyDeprecation} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deprecation-message">Message</Label>
              <Textarea
                id="deprecation-message"
                value={deprecationMessage}
                onChange={(event) => setDeprecationMessage(event.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SourceViewerDialog
        key={`${extension.namespace}/${extension.id}/${sourceTarget?.version ?? "none"}`}
        open={sourceTarget !== null}
        onOpenChange={(open) => !open && setSourceTarget(null)}
        namespace={extension.namespace}
        id={extension.id}
        version={sourceTarget?.version ?? ""}
        label={sourceTarget ? `v${sourceTarget.version}` : undefined}
      />

      <SourceCompareDialog
        key={`${extension.namespace}/${extension.id}/${compareTarget?.version ?? "none"}`}
        open={compareTarget !== null}
        onOpenChange={(open) => !open && setCompareTarget(null)}
        namespace={extension.namespace}
        id={extension.id}
        initialVersion={compareTarget?.version ?? ""}
        extraVersions={rows}
      />

      <ConfirmDialog
        open={yankTarget !== null}
        onOpenChange={(open) => !open && setYankTarget(null)}
        title={`Remove v${yankTarget?.version}?`}
        description="The release and its compiled file are removed. Anyone using this exact version will no longer be able to install it."
        confirmLabel="Remove release"
        confirmPhrase={yankTarget ? `v${yankTarget.version}` : undefined}
        destructive
        pending={pending}
        onConfirm={() => void yank()}
      />
    </div>
  )
}
