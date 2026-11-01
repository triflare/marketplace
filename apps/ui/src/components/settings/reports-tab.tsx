import { useState } from "react"
import { Link } from "react-router"

import type { ReportOwnerView } from "@/lib/api"

import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAsync } from "@/hooks/use-async"
import { formatDate } from "@/lib/format"
import { settingsKeys } from "@/lib/preload"
import { th } from "@/lib/registry"

function targetPath(report: ReportOwnerView): string {
  return report.target.type === "extension" && report.target.id
    ? `/@${report.target.namespace}/${report.target.id}`
    : `/@${report.target.namespace}`
}

export function ReportsTab() {
  const reports = useAsync(
    (signal) => th.reports.list({ limit: 50, signal }),
    [],
    settingsKeys.reports
  )
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Your reports</h2>
        <p className="text-sm text-muted-foreground">
          The reduced view: what was reported and whether a moderator decided
          it. Open a report to read its status.
        </p>
      </div>

      {reports.status === "error" ? (
        <ErrorState
          message={reports.error ?? "We couldn’t load reports."}
          onRetry={reports.reload}
        />
      ) : reports.status === "loading" ? (
        <LoadingRows rows={2} />
      ) : reports.data && reports.data.data.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {reports.data.data.map((report) => (
            <li key={report.id}>
              <button
                type="button"
                onClick={() => setOpenId(report.id)}
                className="flex w-full flex-wrap items-start justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        report.status === "open" ? "outline" : "secondary"
                      }
                    >
                      {report.status}
                    </Badge>
                    <span className="font-mono text-xs">{report.reason}</span>
                  </div>
                  <p className="mt-1 text-sm">
                    {report.target.type}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {report.target.namespace}
                      {report.target.id ? `/${report.target.id}` : ""}
                    </span>
                  </p>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  filed {formatDate(report.createdAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          You have not filed a report.
        </p>
      )}

      <ReportDialog
        id={openId}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null)
          }
        }}
      />
    </div>
  )
}

function ReportDialog({
  id,
  onOpenChange,
}: {
  id: string | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={id !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {id ? <ReportDetail id={id} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ReportDetail({ id }: { id: string }) {
  const report = useAsync((signal) => th.reports.get(id, { signal }), [id])

  if (report.status === "error") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Report</DialogTitle>
        </DialogHeader>
        <ErrorState
          message={report.error ?? "We couldn’t load this report."}
          onRetry={report.reload}
        />
      </>
    )
  }

  if (report.status === "loading" || !report.data) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Report</DialogTitle>
          <DialogDescription>Reading the report…</DialogDescription>
        </DialogHeader>
        <LoadingRows rows={2} />
      </>
    )
  }

  const data = report.data

  return (
    <>
      <DialogHeader>
        <DialogTitle>Report #{data.id}</DialogTitle>
        <DialogDescription>
          What was reported, and whether a moderator has decided it.
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[7rem_1fr] items-start gap-x-4 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <Badge variant={data.status === "open" ? "outline" : "secondary"}>
            {data.status}
          </Badge>
        </dd>

        <dt className="text-muted-foreground">Reason</dt>
        <dd className="font-mono text-xs">{data.reason}</dd>

        <dt className="text-muted-foreground">Target</dt>
        <dd>
          {data.target.type}{" "}
          <Link
            to={targetPath(data)}
            className="font-mono text-xs text-muted-foreground hover:underline"
          >
            {data.target.namespace}
            {data.target.id ? `/${data.target.id}` : ""}
          </Link>
        </dd>

        <dt className="text-muted-foreground">Filed</dt>
        <dd>{formatDate(data.createdAt)}</dd>

        <dt className="text-muted-foreground">Updated</dt>
        <dd>{formatDate(data.updatedAt)}</dd>

        <dt className="text-muted-foreground">Decided</dt>
        <dd>
          {data.reviewedAt ? formatDate(data.reviewedAt) : "Not reviewed yet"}
        </dd>
      </dl>
    </>
  )
}
