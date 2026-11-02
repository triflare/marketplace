import { useState } from "react"
import { toast } from "sonner"

import type { MailOutboxDetail, MailOutboxStatus } from "@/lib/api"
import { ApiError } from "@/lib/api/errors"

import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAsync } from "@/hooks/use-async"
import { usePagedList } from "@/hooks/use-paged-list"
import { formatDate, formatRelative } from "@/lib/format"
import { adminKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/registry"

const FILTERS = [
  { value: "all", label: "All messages" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
] as const

type Filter = (typeof FILTERS)[number]["value"]

// Every outbound message is written down before a provider sees it, so this is
// where a delivery an operator has to chase shows up. The list says what was
// sent and how it went; the body is one dialog further in, because a body can
// carry a one-time link.
export function OutboxTab() {
  const [filter, setFilter] = useState<Filter>("all")
  const [reading, setReading] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)

  const entries = usePagedList(
    (cursor, signal) =>
      th.admin.listMailOutbox({
        ...(filter === "all" ? {} : { status: filter }),
        cursor,
        limit: 30,
        signal,
      }),
    [filter],
    filter === "all" ? adminKeys.outbox : undefined
  )

  async function retry(id: string) {
    setRetrying(id)
    try {
      const result = await th.admin.retryMailOutboxEntry(id)
      toast.success(
        result.status === "sent"
          ? "The message was delivered."
          : "The provider still refused the message."
      )
      entries.reload()
    } catch (error) {
      toast.error(describeFailure(error))
    } finally {
      setRetrying(null)
    }
  }

  if (entries.status === "error") {
    return (
      <ErrorState
        message={entries.error ?? "We couldn’t load the outbox."}
        onRetry={entries.reload}
      />
    )
  }

  if (entries.status === "loading") {
    return <LoadingRows rows={5} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Mail outbox</h2>
          <p className="text-sm text-muted-foreground">
            Messages this registry tried to send, newest first. A failed one can
            be read and sent again.
          </p>
        </div>
        <Select
          items={[...FILTERS]}
          value={filter}
          onValueChange={(value) => setFilter(value as Filter)}
        >
          <SelectTrigger className="w-40" aria-label="Filter messages">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Last error</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Nothing has been sent yet.
                </TableCell>
              </TableRow>
            ) : (
              entries.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell
                    className="text-xs whitespace-nowrap text-muted-foreground"
                    title={formatDate(entry.createdAt)}
                  >
                    {formatRelative(entry.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px]">
                    {entry.to}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs">
                    {entry.subject}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={entry.status} />
                  </TableCell>
                  <TableCell className="text-xs">{entry.attempts}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-[11px] text-muted-foreground">
                    {entry.lastError ?? "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReading(entry.id)}
                    >
                      Read
                    </Button>
                    {entry.status === "sent" ? null : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={retrying === entry.id}
                        onClick={() => void retry(entry.id)}
                      >
                        {retrying === entry.id ? "Retrying…" : "Retry"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {entries.hasMore ? (
        <Button
          variant="outline"
          className="self-center"
          onClick={entries.loadMore}
          disabled={entries.loadingMore}
        >
          {entries.loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      <Dialog
        open={reading !== null}
        onOpenChange={(open) => {
          if (!open) setReading(null)
        }}
      >
        <DialogContent className="sm:max-w-xl">
          {reading ? (
            <MessageBody
              id={reading}
              onRetried={() => {
                entries.reload()
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusBadge({ status }: { status: MailOutboxStatus }) {
  const variant =
    status === "failed"
      ? "destructive"
      : status === "sent"
        ? "secondary"
        : "outline"
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  )
}

// The message itself. It is exactly what went to the provider, which is the
// point: an admin debugging a delivery needs to see the link that was sent.
function MessageBody({ id, onRetried }: { id: string; onRetried: () => void }) {
  const entry = useAsync(
    (signal) => th.admin.getMailOutboxEntry(id, { signal }),
    [id]
  )
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // What the recipient actually sees by default; the plain part is still there
  // for a client that could not render the HTML, and for reading the link text.
  const [view, setView] = useState<"html" | "text" | null>(null)

  async function retry(data: MailOutboxDetail) {
    setPending(true)
    setFailure(null)
    try {
      const result = await th.admin.retryMailOutboxEntry(data.id)
      if (result.status === "sent") {
        toast.success("The message was delivered.")
      } else {
        setFailure(result.lastError ?? "The provider refused the message.")
        toast.error("The provider still refused the message.")
      }
      onRetried()
    } catch (error) {
      setFailure(describeFailure(error))
    } finally {
      setPending(false)
    }
  }

  if (entry.status === "error") {
    return (
      <ErrorState
        message={entry.error ?? "We couldn’t load this message."}
        onRetry={entry.reload}
      />
    )
  }

  const data = entry.data
  if (!data) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Message</DialogTitle>
        </DialogHeader>
        <LoadingRows rows={2} />
      </>
    )
  }

  const html = data.message.html ?? null
  const shown = view ?? (html ? "html" : "text")

  return (
    <>
      <DialogHeader>
        <DialogTitle>{data.subject}</DialogTitle>
        <DialogDescription>
          To {data.to}
          {data.purpose ? ` · ${data.purpose}` : ""}
          {data.sentAt
            ? ` · sent ${formatDate(data.sentAt)}`
            : ` · last tried ${formatDate(data.updatedAt)}`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge status={data.status} />
        <span className="text-muted-foreground">
          {data.attempts} attempt{data.attempts === 1 ? "" : "s"}
          {data.driver ? ` via ${data.driver}` : ""}
        </span>
      </div>

      {data.lastError && data.status !== "sent" ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {data.lastError}
        </p>
      ) : null}

      {html ? (
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
          <Button
            size="sm"
            variant={shown === "html" ? "secondary" : "ghost"}
            onClick={() => setView("html")}
          >
            Formatted
          </Button>
          <Button
            size="sm"
            variant={shown === "text" ? "secondary" : "ghost"}
            onClick={() => setView("text")}
          >
            Plain text
          </Button>
        </div>
      ) : null}

      {shown === "html" && html ? (
        // Exactly the body that was sent, rendered the way the recipient's
        // client would. The frame cannot run scripts or touch this page.
        <iframe
          title="Message HTML body"
          srcDoc={html}
          sandbox=""
          referrerPolicy="no-referrer"
          className="h-80 w-full rounded-lg border bg-white"
        />
      ) : (
        <pre className="max-h-64 overflow-auto rounded-lg border p-3 font-mono text-[11px] break-words whitespace-pre-wrap">
          {data.message.text || "This message carried no text."}
        </pre>
      )}

      {failure ? <p className="text-xs text-destructive">{failure}</p> : null}

      <DialogFooter>
        {data.status === "sent" ? null : (
          <Button onClick={() => void retry(data)} disabled={pending}>
            {pending ? "Sending…" : "Send again"}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

function describeFailure(error: unknown): string {
  if (error instanceof ApiError) {
    const errors = error.problem?.errors
    if (errors && errors.length > 0) {
      return errors
        .map((entry) => `${entry.field}: ${entry.message}`)
        .join("\n")
    }
    // The registry's own words: a provider that refused the message says why.
    return error.message
  }
  return errorMessage(error)
}
