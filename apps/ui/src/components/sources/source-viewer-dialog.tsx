import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FileCode2Icon,
  FileWarningIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ErrorState } from "@/components/common/async-state"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SourceCode } from "@/components/sources/source-code"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAsync } from "@/hooks/use-async"
import { formatBytes } from "@/lib/format"
import { prettifyJavaScript } from "@/lib/prettify"
import { readSourceArchive } from "@/lib/source-archive"
import { copyText, saveBlob, th } from "@/lib/twexthub"
import { cn } from "@/lib/utils"

const MAX_LINES = 2000

export function SourceViewerDialog({
  open,
  onOpenChange,
  namespace,
  id,
  version,
  label,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  id: string
  version: string
  label?: string
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [view, setView] = useState<"source" | "output">("source")
  const [outputRequested, setOutputRequested] = useState(false)
  const [pretty, setPretty] = useState(true)

  const source = useAsync(
    async (signal) => {
      if (!open) {
        return null
      }
      const blob = await th.extensions.versions.source(namespace, id, version, {
        signal,
      })
      return { blob, files: await readSourceArchive(blob) }
    },
    [open, namespace, id, version]
  )

  const compiled = useAsync(
    async (signal) => {
      if (!open || !outputRequested) {
        return null
      }
      const blob = await th.extensions.versions.download(
        namespace,
        id,
        version,
        { signal }
      )
      return { blob, text: await blob.text(), size: blob.size }
    },
    [open, outputRequested, namespace, id, version]
  )

  const formatted = useAsync(async () => {
    if (!compiled.data) {
      return null
    }
    return pretty
      ? prettifyJavaScript(compiled.data.text)
      : { code: compiled.data.text, formatted: false }
  }, [compiled.data?.text, pretty])

  const outputText = formatted.data?.code ?? ""
  const outputTruncated = outputText.split("\n").length > MAX_LINES
  const files = source.data?.files ?? []
  const query = filter.trim().toLowerCase()
  const visibleFiles = query
    ? files.filter((file) => file.path.toLowerCase().includes(query))
    : files
  const selected =
    visibleFiles.find((file) => file.path === selectedPath) ?? visibleFiles[0]
  const selectedIndex = selected ? visibleFiles.indexOf(selected) : -1
  const truncated = selected
    ? selected.text.split("\n").length > MAX_LINES
    : false

  function moveFile(offset: number) {
    const next = visibleFiles[selectedIndex + offset]
    if (next) {
      setSelectedPath(next.path)
    }
  }

  async function copySource() {
    if (!selected || selected.binary) {
      return
    }
    await copyFile(selected.text, selected.path)
  }

  async function copyCompiled() {
    if (!outputText) {
      return
    }
    await copyFile(outputText, "extension.js")
  }

  async function copyFile(text: string, name: string) {
    try {
      await copyText(text)
      toast.success(`Copied ${name}.`)
    } catch {
      toast.error("Couldn’t copy the file.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setView("source")
          setOutputRequested(false)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="top-0 left-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-none p-4 sm:max-w-none sm:p-6">
        <DialogHeader>
          <DialogTitle>Source for {label ?? `v${version}`}</DialogTitle>
          <DialogDescription>
            The files uploaded for this release. The registry compiles these
            itself, so this is the source behind the published build.
          </DialogDescription>
        </DialogHeader>

        {source.status === "error" ? (
          <ErrorState
            message={source.error ?? "We couldn’t load the source."}
            onRetry={source.reload}
          />
        ) : source.status === "loading" ? (
          <div className="grid min-h-0 gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            <FileCode2Icon className="size-5" />
            No readable files in this source archive.
          </div>
        ) : (
          <Tabs
            value={view}
            onValueChange={(value) => {
              const next = value as "source" | "output"
              setView(next)
              if (next === "output") {
                setOutputRequested(true)
              }
            }}
            className="min-h-0 flex-1 gap-3"
          >
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="source">Source</TabsTrigger>
              <TabsTrigger value="output">Built output</TabsTrigger>
            </TabsList>
            <TabsContent value="source" className="min-h-0">
              <div className="grid h-full min-h-0 gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
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
                  <p className="px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    {query
                      ? `${visibleFiles.length} of ${files.length} files`
                      : `${files.length} ${files.length === 1 ? "file" : "files"}`}
                  </p>
                  <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    {visibleFiles.map((file) => (
                      <li key={file.path}>
                        <button
                          type="button"
                          onClick={() => setSelectedPath(file.path)}
                          className={cn(
                            "w-full truncate rounded px-2 py-1.5 text-left font-mono text-[11px] hover:bg-muted",
                            selected?.path === file.path &&
                              "bg-muted text-foreground"
                          )}
                          title={file.path}
                        >
                          {file.path}
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>

                <div className="flex min-h-0 min-w-0 flex-col gap-2">
                  {selected ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 truncate font-mono text-xs">
                          {selected.path}
                        </p>
                        <div className="flex flex-wrap items-center gap-1">
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
                            {selectedIndex + 1} / {visibleFiles.length}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Next file"
                            onClick={() => moveFile(1)}
                            disabled={selectedIndex === visibleFiles.length - 1}
                          >
                            <ChevronRightIcon />
                          </Button>
                          <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                            {formatBytes(selected.size)}
                          </span>
                          {!selected.binary ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => void copySource()}
                            >
                              <CopyIcon /> Copy
                            </Button>
                          ) : null}
                          {source.data ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() =>
                                saveBlob(
                                  source.data!.blob,
                                  `${id}-${version}-source.tar.gz`
                                )
                              }
                            >
                              <DownloadIcon /> Download
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {selected.binary ? (
                        <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                          <FileWarningIcon className="size-5" />
                          Binary file · {formatBytes(selected.size)}
                        </div>
                      ) : (
                        <SourceCode
                          path={selected.path}
                          code={selected.text
                            .split("\n")
                            .slice(0, MAX_LINES)
                            .join("\n")}
                        />
                      )}
                      {!selected.binary && truncated ? (
                        <p className="text-[11px] text-muted-foreground">
                          Showing the first {MAX_LINES} lines. Download the
                          archive to see the rest.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="flex min-h-64 flex-1 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No files match “{filter}”.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent
              value="output"
              className="min-h-0 flex-1 overflow-hidden"
            >
              {compiled.status === "error" ? (
                <ErrorState
                  message={
                    compiled.error ?? "We couldn’t load the compiled output."
                  }
                  onRetry={compiled.reload}
                />
              ) : compiled.status === "loading" ||
                !compiled.data ||
                formatted.status === "loading" ||
                !formatted.data ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="flex h-full min-h-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs">extension.js</p>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatBytes(compiled.data.size)}
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-pressed={pretty}
                        onClick={() => setPretty((value) => !value)}
                      >
                        {pretty ? "Prettified" : "Minified"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => void copyCompiled()}
                      >
                        <CopyIcon /> Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          saveBlob(compiled.data!.blob, `${id}-${version}.js`)
                        }
                      >
                        <DownloadIcon /> Download
                      </Button>
                    </div>
                  </div>
                  {outputText ? (
                    <SourceCode
                      path="extension.js"
                      code={outputText
                        .split("\n")
                        .slice(0, MAX_LINES)
                        .join("\n")}
                    />
                  ) : (
                    <p className="flex min-h-64 flex-1 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      The compiled output is empty.
                    </p>
                  )}
                  {outputTruncated ? (
                    <p className="text-[11px] text-muted-foreground">
                      Showing the first {MAX_LINES} lines. Download the file to
                      see the rest.
                    </p>
                  ) : null}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
