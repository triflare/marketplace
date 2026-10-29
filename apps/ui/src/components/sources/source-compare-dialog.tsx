import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileWarningIcon,
  GitCompareIcon,
} from "lucide-react"
import { useState } from "react"

import type { VersionInfo } from "@twextjs/twexthubkit"

import { ErrorState } from "@/components/common/async-state"
import { DiffCode } from "@/components/sources/source-code"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAsync } from "@/hooks/use-async"
import { formatBytes } from "@/lib/format"
import { readSourceArchive } from "@/lib/source-archive"
import {
  compareSourceArchives,
  type FileDiff,
  type SourceChange,
} from "@/lib/source-diff"
import { th } from "@/lib/twexthub"
import { cn } from "@/lib/utils"

type SourceVersion = Pick<VersionInfo, "version" | "status">

const MAX_DIFF_LINES = 4000

const CHANGE_LABEL: Record<SourceChange, string> = {
  added: "added",
  removed: "removed",
  changed: "changed",
  unchanged: "unchanged",
}

const CHANGE_DOT: Record<SourceChange, string> = {
  added: "bg-emerald-500",
  removed: "bg-destructive",
  changed: "bg-amber-500",
  unchanged: "bg-muted-foreground",
}

export function SourceCompareDialog({
  open,
  onOpenChange,
  namespace,
  id,
  initialVersion,
  extraVersions = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  id: string
  initialVersion: string
  extraVersions?: SourceVersion[]
}) {
  const [pickedLeft, setPickedLeft] = useState<string | null>(null)
  const [pickedRight, setPickedRight] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [filter, setFilter] = useState("")

  const extraKey = extraVersions.map((version) => version.version).join("|")

  const versions = useAsync(
    async (signal) => {
      if (!open) {
        return []
      }
      const page = await th.extensions.versions.list(namespace, id, {
        limit: 50,
        signal,
      })
      const byVersion = new Map<string, SourceVersion>()
      for (const version of [...extraVersions, ...page.data]) {
        if (!byVersion.has(version.version)) {
          byVersion.set(version.version, version)
        }
      }
      return [...byVersion.values()]
    },
    [open, namespace, id, extraKey]
  )

  const list = versions.data ?? []
  const right =
    pickedRight ??
    (list.some((version) => version.version === initialVersion)
      ? initialVersion
      : (list[0]?.version ?? ""))
  const left =
    pickedLeft ??
    list.find((version) => version.version !== right)?.version ??
    ""

  const comparison = useAsync(
    async (signal) => {
      if (!open || !left || !right || left === right) {
        return null
      }
      const [leftBlob, rightBlob] = await Promise.all([
        th.extensions.versions.source(namespace, id, left, { signal }),
        th.extensions.versions.source(namespace, id, right, { signal }),
      ])
      const [leftFiles, rightFiles] = await Promise.all([
        readSourceArchive(leftBlob),
        readSourceArchive(rightBlob),
      ])
      return compareSourceArchives(leftFiles, rightFiles)
    },
    [open, namespace, id, left, right]
  )

  const changed = (comparison.data ?? []).filter(
    (file) => file.change !== "unchanged"
  )
  const added = changed.reduce((total, file) => total + file.added, 0)
  const removed = changed.reduce((total, file) => total + file.removed, 0)
  const query = filter.trim().toLowerCase()
  const visibleChanged = query
    ? changed.filter((file) => file.path.toLowerCase().includes(query))
    : changed
  const selected =
    visibleChanged.find((file) => file.path === selectedPath) ??
    visibleChanged[0]
  const selectedIndex = selected ? visibleChanged.indexOf(selected) : -1

  function moveFile(offset: number) {
    const next = visibleChanged[selectedIndex + offset]
    if (next) {
      setSelectedPath(next.path)
    }
  }

  function chooseRight(value: string | null) {
    if (!value) {
      return
    }
    setPickedRight(value)
    if (value === left) {
      setPickedLeft(
        list.find((version) => version.version !== value)?.version ?? ""
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Compare versions</DialogTitle>
          <DialogDescription>
            See which source files changed between two releases.
          </DialogDescription>
        </DialogHeader>

        {versions.status === "error" ? (
          <ErrorState
            message={versions.error ?? "We couldn’t load the versions."}
            onRetry={versions.reload}
          />
        ) : versions.status === "loading" ? (
          <div className="flex gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-48" />
          </div>
        ) : list.length < 2 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            <GitCompareIcon className="size-5" />
            There is no other release to compare this one with.
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-muted-foreground">From</span>
                <Select
                  items={versionItems(list)}
                  value={left}
                  onValueChange={(value) => value && setPickedLeft(value)}
                >
                  <SelectTrigger aria-label="From version" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {versionItems(list).map((version) => (
                      <SelectItem key={version.value} value={version.value}>
                        {version.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-muted-foreground">To</span>
                <Select
                  items={versionItems(list)}
                  value={right}
                  onValueChange={chooseRight}
                >
                  <SelectTrigger aria-label="To version" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {versionItems(list).map((version) => (
                      <SelectItem key={version.value} value={version.value}>
                        {version.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!left || left === right ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Choose two different versions to compare.
              </p>
            ) : comparison.status === "error" ? (
              <ErrorState
                message={comparison.error ?? "We couldn’t compare the sources."}
                onRetry={comparison.reload}
              />
            ) : comparison.status === "loading" ? (
              <div className="grid min-h-0 gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : changed.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                The source is identical between these versions.
              </p>
            ) : (
              <div className="grid min-h-0 gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                <aside className="flex max-h-40 min-h-0 flex-col rounded-md border p-1 sm:max-h-none">
                  <div className="p-1">
                    <Input
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      placeholder="Filter files"
                      aria-label="Filter files"
                      className="h-7 text-xs"
                    />
                  </div>
                  <p className="flex flex-wrap items-center gap-1 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    <span>
                      {query
                        ? `${visibleChanged.length} of ${changed.length} files`
                        : `${changed.length} ${changed.length === 1 ? "file changed" : "files changed"}`}
                    </span>
                    <span className="ml-auto text-emerald-600 dark:text-emerald-400">
                      +{added}
                    </span>
                    <span className="text-destructive">−{removed}</span>
                  </p>
                  <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    {visibleChanged.map((file) => (
                      <li key={file.path}>
                        <button
                          type="button"
                          onClick={() => setSelectedPath(file.path)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[11px] hover:bg-muted",
                            selected?.path === file.path &&
                              "bg-muted text-foreground"
                          )}
                          title={file.path}
                        >
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              CHANGE_DOT[file.change]
                            )}
                          />
                          <span className="min-w-0 truncate">{file.path}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px]">
                            {file.added > 0 ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                +{file.added}
                              </span>
                            ) : null}
                            {file.removed > 0 ? (
                              <span className="text-destructive">
                                −{file.removed}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>

                <div className="flex min-h-0 min-w-0 flex-col gap-2">
                  {selected ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="min-w-0 truncate font-mono text-xs">
                            {selected.path}
                          </p>
                          <Badge variant="outline">
                            {CHANGE_LABEL[selected.change]}
                          </Badge>
                          <span className="font-mono text-[11px]">
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{selected.added}
                            </span>{" "}
                            <span className="text-destructive">
                              −{selected.removed}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Previous file"
                            onClick={() => moveFile(-1)}
                            disabled={selectedIndex <= 0}
                          >
                            <ChevronLeftIcon />
                          </Button>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {selectedIndex + 1} / {visibleChanged.length}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Next file"
                            onClick={() => moveFile(1)}
                            disabled={
                              selectedIndex === visibleChanged.length - 1
                            }
                          >
                            <ChevronRightIcon />
                          </Button>
                          <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                            {formatBytes(selected.left?.size ?? 0)} →{" "}
                            {formatBytes(selected.right?.size ?? 0)}
                          </span>
                        </div>
                      </div>
                      <DiffView diff={selected} />
                    </>
                  ) : (
                    <p className="flex min-h-64 flex-1 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No files match “{filter}”.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function lineCount(text: string | undefined): number {
  return text ? text.split("\n").length : 0
}

function clampLines(text: string | undefined): string {
  return text ? text.split("\n").slice(0, MAX_DIFF_LINES).join("\n") : ""
}

function versionItems(versions: SourceVersion[]) {
  return versions.map((version) => ({
    value: version.version,
    label: `v${version.version} · ${version.status}`,
  }))
}

function DiffView({ diff }: { diff: FileDiff }) {
  if (diff.left?.binary || diff.right?.binary) {
    return (
      <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        <FileWarningIcon className="size-5" />
        This file changed, but it is binary.
      </div>
    )
  }

  if (diff.lines.length === 0) {
    return (
      <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        This file changed, but there are no line differences to show.
      </div>
    )
  }

  const truncated =
    lineCount(diff.left?.text) > MAX_DIFF_LINES ||
    lineCount(diff.right?.text) > MAX_DIFF_LINES

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DiffCode
        path={diff.path}
        before={clampLines(diff.left?.text)}
        after={clampLines(diff.right?.text)}
      />
      {truncated ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Showing the first {MAX_DIFF_LINES} lines of each side.
        </p>
      ) : null}
    </div>
  )
}
