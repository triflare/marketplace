import { CheckIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import type { Report, ReportStatus } from "@twextjs/twexthubkit"

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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAsync } from "@/hooks/use-async"
import { formatDate, humanizeKind } from "@/lib/format"
import { adminKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/twexthub"

const STATUSES: Array<{ value: ReportStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
]

export function AdminReportsTab() {
  const [status, setStatus] = useState<ReportStatus>("open")
  const [target, setTarget] = useState<Report | null>(null)
  const [decision, setDecision] = useState<"resolved" | "dismissed">("resolved")
  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)

  const reports = useAsync(
    (signal) => th.admin.listReports({ status, limit: 30, signal }),
    [status],
    adminKeys.reports(status)
  )

  async function decide(event: React.FormEvent) {
    event.preventDefault()
    if (!target) {
      return
    }
    setPending(true)
    try {
      await th.admin.decideReport(target.id, {
        status: decision,
        note: note.trim() || undefined,
      })
      toast.success("Report closed.")
      setTarget(null)
      setNote("")
      reports.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Reports</h2>
          <p className="text-sm text-muted-foreground">
            Reports help you find content that may need attention. Closing a
            report does not remove the content by itself.
          </p>
        </div>
        <Select
          items={STATUSES}
          value={status}
          onValueChange={(value) => setStatus(value as ReportStatus)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {reports.status === "error" ? (
        <ErrorState
          message={reports.error ?? "We couldn’t load reports."}
          onRetry={reports.reload}
        />
      ) : reports.status === "loading" ? (
        <LoadingRows rows={3} />
      ) : reports.data && reports.data.data.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {reports.data.data.map((report) => {
            const link =
              report.target.type === "extension" && report.target.id
                ? `/@${report.target.namespace}/${report.target.id}`
                : `/@${report.target.namespace}`
            return (
              <li
                key={report.id}
                className="flex flex-col gap-2 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        report.status === "open" ? "outline" : "secondary"
                      }
                    >
                      {humanizeKind(report.status)}
                    </Badge>
                    <span className="text-xs">
                      {humanizeKind(report.reason)}
                    </span>
                    <Link
                      to={link}
                      className="font-mono text-xs hover:underline"
                    >
                      {humanizeKind(report.target.type)} by @
                      {report.target.namespace}
                      {report.target.id ? `/${report.target.id}` : ""}
                    </Link>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Reported by @{report.reporter} ·{" "}
                    {formatDate(report.createdAt)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {report.description}
                </p>
                {report.status === "open" ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setTarget(report)
                        setDecision("resolved")
                      }}
                    >
                      <CheckIcon /> Mark resolved
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTarget(report)
                        setDecision("dismissed")
                      }}
                    >
                      <XIcon /> Dismiss report
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Decided {formatDate(report.reviewedAt)}
                    {report.resolutionNote ? ` — ${report.resolutionNote}` : ""}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No {status} reports right now.
        </p>
      )}

      <Dialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "resolved" ? "Mark resolved" : "Dismiss report"}
            </DialogTitle>
            <DialogDescription>
              This closes the report. It does not remove or hide the reported
              content.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={decide} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="decision-note">Note</Label>
              <Textarea
                id="decision-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Optional internal note"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Confirm"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
