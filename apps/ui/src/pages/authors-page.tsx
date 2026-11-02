import { Link } from "react-router"

import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import { PageHeader } from "@/components/common/page-header"
import { UserAvatar } from "@/components/common/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePagedList } from "@/hooks/use-paged-list"
import { formatDate } from "@/lib/format"
import { AUTHORS_KEY } from "@/lib/preload"
import { th } from "@/lib/registry"

export function AuthorsPage() {
  const authors = usePagedList(
    (cursor, signal) => th.users.list({ cursor, limit: 30, signal }),
    [],
    AUTHORS_KEY
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Community"
        title="Authors"
        description="People who publish and maintain extensions on this registry."
      />

      {authors.status === "error" ? (
        <ErrorState
          message={authors.error ?? "We couldn’t load authors."}
          onRetry={authors.reload}
        />
      ) : authors.status === "loading" ? (
        <LoadingRows rows={6} />
      ) : authors.items.length === 0 ? (
        <EmptyState
          title="No authors yet"
          description="The first person to join the registry will appear here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="divide-y overflow-hidden rounded-lg border">
            {authors.items.map((author) => (
              <li key={author.namespace}>
                <Link
                  to={`/@${author.namespace}`}
                  className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <UserAvatar
                    name={author.displayName}
                    src={author.avatarUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{author.displayName}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        @{author.namespace}
                      </span>
                      {author.role === "admin" ? (
                        <Badge variant="secondary">admin</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                      {author.bio || "No bio yet."}
                    </p>
                  </div>
                  <div className="hidden text-right text-[11px] text-muted-foreground sm:block">
                    Joined {formatDate(author.createdAt)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {authors.hasMore ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={authors.loadMore}
                disabled={authors.loadingMore}
              >
                {authors.loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
