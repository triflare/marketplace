import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { usePagedList } from "@/hooks/use-paged-list"
import { adminKeys } from "@/lib/preload"
import { formatDate, formatRelative, humanizeKind } from "@/lib/format"
import { th } from "@/lib/twexthub"

export function AuditTab() {
  const entries = usePagedList(
    (cursor, signal) => th.admin.listAudit({ cursor, limit: 30, signal }),
    [],
    adminKeys.audit
  )

  if (entries.status === "error") {
    return (
      <ErrorState
        message={entries.error ?? "We couldn’t load the audit log."}
        onRetry={entries.reload}
      />
    )
  }

  if (entries.status === "loading") {
    return <LoadingRows rows={5} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Audit log</h2>
        <p className="text-sm text-muted-foreground">
          A record of administrative actions, newest first.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell
                  className="text-xs whitespace-nowrap text-muted-foreground"
                  title={formatDate(entry.createdAt)}
                >
                  {formatRelative(entry.createdAt)}
                </TableCell>
                <TableCell className="text-xs">@{entry.actor}</TableCell>
                <TableCell className="text-xs">
                  {humanizeKind(entry.action)}
                </TableCell>
                <TableCell className="font-mono text-[11px]">
                  {entry.target.namespace ? `@${entry.target.namespace}` : ""}
                  {entry.target.id ? `/${entry.target.id}` : ""}
                  {entry.target.version ? `@${entry.target.version}` : ""}
                </TableCell>
                <TableCell className="max-w-[360px] truncate text-[11px] text-muted-foreground">
                  {formatDetail(entry.detail)}
                </TableCell>
              </TableRow>
            ))}
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
    </div>
  )
}

function formatDetail(detail: unknown): string {
  if (!detail || typeof detail !== "object") {
    return detail === undefined || detail === null ? "—" : String(detail)
  }

  const entries = Object.entries(detail as Record<string, unknown>).map(
    ([key, value]) => {
      const label = humanizeKind(key)
      if (value === null || value === undefined || value === "") {
        return `${label}: none`
      }
      if (typeof value === "object") {
        return `${label}: ${JSON.stringify(value)}`
      }
      return `${label}: ${String(value)}`
    }
  )

  return entries.length > 0 ? entries.join(" · ") : "—"
}
