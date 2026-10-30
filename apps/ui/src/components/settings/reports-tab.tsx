import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { Badge } from "@/components/ui/badge"
import { Link } from "react-router"

import { useAsync } from "@/hooks/use-async"
import { formatDate } from "@/lib/format"
import { settingsKeys } from "@/lib/preload"
import { th } from "@/lib/registry"

export function ReportsTab() {
  const reports = useAsync(
    (signal) => th.reports.list({ limit: 50, signal }),
    [],
    settingsKeys.reports
  )

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Your reports</h2>
        <p className="text-sm text-muted-foreground">
          The reduced view: what was reported and whether a moderator decided
          it.
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
          {reports.data.data.map((report) => {
            const target =
              report.target.type === "extension" && report.target.id
                ? `/@${report.target.namespace}/${report.target.id}`
                : `/@${report.target.namespace}`
            return (
              <li
                key={report.id}
                className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
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
                    <Link
                      to={target}
                      className="font-mono text-xs text-muted-foreground hover:underline"
                    >
                      {report.target.namespace}
                      {report.target.id ? `/${report.target.id}` : ""}
                    </Link>
                  </p>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  filed {formatDate(report.createdAt)}
                </p>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          You have not filed a report.
        </p>
      )}
    </div>
  )
}
