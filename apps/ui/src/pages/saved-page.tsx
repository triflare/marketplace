import { Trash2Icon } from "lucide-react"
import { Link } from "react-router"

import { EmptyState } from "@/components/common/async-state"
import { ButtonLink } from "@/components/common/button-link"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { formatDate, formatNumber } from "@/lib/format"
import { removeSaved, useSaved } from "@/lib/saved"

export function SavedPage() {
  const saved = useSaved()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Your list"
        title="Saved extensions"
        description="Saved in this browser for quick access. Removing one here does not affect the extension."
      />

      {saved.length === 0 ? (
        <EmptyState
          title="Nothing saved"
          description="Use the bookmark button on an extension to keep it here."
          action={<ButtonLink to="/explore">Browse extensions</ButtonLink>}
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border">
          {saved.map((extension) => (
            <li
              key={`${extension.namespace}/${extension.id}`}
              className="flex items-stretch hover:bg-muted/40"
            >
              <Link
                to={`/@${extension.namespace}/${extension.id}`}
                className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{extension.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    @{extension.namespace}/{extension.id}
                  </span>
                </div>
                <p className="line-clamp-1 text-sm text-muted-foreground">
                  {extension.description || "No description yet."}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  v{extension.version} · {formatNumber(extension.downloads)}{" "}
                  downloads · saved {formatDate(extension.savedAt)}
                </p>
              </Link>
              <div className="flex items-center p-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove from saved"
                  onClick={() => removeSaved(extension.namespace, extension.id)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
