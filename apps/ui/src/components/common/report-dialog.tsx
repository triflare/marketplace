import { FlagIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { ReportReason, ReportTargetType } from "@/lib/api"

import { ButtonLink } from "@/components/common/button-link"
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
import { useAuth } from "@/context/auth"
import { errorMessage, th } from "@/lib/registry"

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "malicious_code", label: "Malicious code" },
  { value: "copyright", label: "Copyright" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Something else" },
]

export function ReportDialog({
  targetType,
  targetNamespace,
  targetExtensionId,
}: {
  targetType: ReportTargetType
  targetNamespace: string
  targetExtensionId?: string
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason>("spam")
  const [description, setDescription] = useState("")
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await th.reports.create({
        targetType,
        targetNamespace,
        targetExtensionId,
        reason,
        description,
      })
      toast.success("Report filed. A moderator will review it.")
      setOpen(false)
      setDescription("")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <FlagIcon /> Report
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report {targetType}</DialogTitle>
            <DialogDescription>
              Reports go to the registry moderators. Filing one does not hide or
              remove anything.
            </DialogDescription>
          </DialogHeader>
          {user ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-reason">Reason</Label>
                <Select
                  items={REASONS}
                  value={reason}
                  onValueChange={(value) => setReason(value as ReportReason)}
                >
                  <SelectTrigger id="report-reason" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-description">What happened</Label>
                <Textarea
                  id="report-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  required
                  minLength={1}
                  maxLength={2000}
                  rows={4}
                  placeholder="Describe what you saw."
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? "Filing…" : "File report"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <p className="text-muted-foreground">Sign in to file a report.</p>
              <ButtonLink to="/login">Sign in</ButtonLink>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
