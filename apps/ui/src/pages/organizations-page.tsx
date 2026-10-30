import { Link } from "react-router"

import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import { ButtonLink } from "@/components/common/button-link"
import { PageHeader } from "@/components/common/page-header"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { usePagedList } from "@/hooks/use-paged-list"
import { formatDate, pluralize } from "@/lib/format"
import { ORGANIZATIONS_KEY } from "@/lib/preload"
import { th } from "@/lib/registry"

export function OrganizationsPage() {
  const orgs = usePagedList(
    (cursor, signal) => th.orgs.list({ cursor, limit: 30, signal }),
    [],
    ORGANIZATIONS_KEY
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Community"
        title="Organizations"
        description="Teams that publish extensions together. Each organization has a shared profile and one or more owners."
        actions={
          <ButtonLink variant="outline" to="/settings?tab=organizations">
            Create an organization
          </ButtonLink>
        }
      />

      {orgs.status === "error" ? (
        <ErrorState
          message={orgs.error ?? "We couldn’t load organizations."}
          onRetry={orgs.reload}
        />
      ) : orgs.status === "loading" ? (
        <LoadingRows rows={4} />
      ) : orgs.items.length === 0 ? (
        <EmptyState
          title="No organizations yet"
          description="Create one from your account settings to publish with a team."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="divide-y overflow-hidden rounded-lg border">
            {orgs.items.map((org) => (
              <li key={org.namespace}>
                <Link
                  to={`/@${org.namespace}`}
                  className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <UserAvatar name={org.displayName} src={org.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{org.displayName}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        @{org.namespace}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                      {org.bio || "No description yet."}
                    </p>
                  </div>
                  <span className="hidden text-[11px] text-muted-foreground sm:block">
                    Since {formatDate(org.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {pluralize(orgs.items.length, "organization")}
          </p>
          {orgs.hasMore ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={orgs.loadMore}
                disabled={orgs.loadingMore}
              >
                {orgs.loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
