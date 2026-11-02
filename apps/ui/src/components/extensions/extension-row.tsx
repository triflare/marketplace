import {
  BookmarkCheckIcon,
  BookmarkIcon,
  ChevronRightIcon,
  DownloadIcon,
  HourglassIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"

import type { ExtensionSummary } from "@/lib/api"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatNumber, formatRelative, initials } from "@/lib/format"
import { toggleSaved, useSaved } from "@/lib/saved"
import { cn } from "@/lib/utils"

export interface ReviewSummary {
  pending: number
  rejected: number
}

export function ExtensionRow({
  extension,
  review,
}: {
  extension: ExtensionSummary
  /** Releases waiting on a moderator, for an owner looking at their own row. */
  review?: ReviewSummary
}) {
  const saved = useSaved()
  const isSaved = saved.some(
    (entry) =>
      entry.namespace === extension.namespace && entry.id === extension.id
  )

  function handleSave() {
    const nowSaved = toggleSaved(extension)
    toast.success(nowSaved ? "Saved to your list." : "Removed from saved.")
  }

  return (
    <li className="group flex min-w-0 items-stretch transition-colors hover:bg-muted/40">
      <Link
        to={`/@${extension.namespace}/${extension.id}`}
        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5"
      >
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-sm font-semibold text-muted-foreground"
        >
          {initials(extension.name).slice(0, 1) || "?"}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-medium">{extension.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              by @{extension.namespace}
            </span>
          </span>
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {extension.description || "No description yet."}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">v{extension.version}</span>
            {review && review.pending > 0 ? (
              <Badge variant="outline">
                <HourglassIcon /> {review.pending} in review
              </Badge>
            ) : null}
            {review && review.rejected > 0 ? (
              <Badge variant="destructive">
                <TriangleAlertIcon /> {review.rejected} needs changes
              </Badge>
            ) : null}
            <span className="flex items-center gap-1">
              <DownloadIcon className="size-3" />
              {formatNumber(extension.downloads)}
            </span>
            <span className="hidden sm:inline">
              Published {formatRelative(extension.publishedAt)}
            </span>
          </span>
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className="mt-1 hidden size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 sm:block"
        />
      </Link>
      <div className="flex items-start p-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={isSaved ? "Remove from saved" : "Save extension"}
          aria-pressed={isSaved}
          onClick={handleSave}
        >
          {isSaved ? (
            <BookmarkCheckIcon className="text-foreground" />
          ) : (
            <BookmarkIcon className={cn("text-muted-foreground")} />
          )}
        </Button>
      </div>
    </li>
  )
}
