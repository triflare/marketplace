import type { VersionStatus } from "@/lib/api"

import { Badge } from "@/components/ui/badge"

const LABELS: Record<VersionStatus, string> = {
  staging: "Staging",
  pending: "In review",
  published: "Published",
  rejected: "Changes requested",
  yanked: "Removed",
  deprecated: "Deprecated",
}

export function VersionStatusBadge({ status }: { status: VersionStatus }) {
  const variant =
    status === "published"
      ? "secondary"
      : status === "deprecated" || status === "rejected" || status === "yanked"
        ? "destructive"
        : "outline"

  return <Badge variant={variant}>{LABELS[status] ?? status}</Badge>
}
