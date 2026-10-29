import {
  CalendarIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  GlobeIcon,
  SettingsIcon,
} from "lucide-react"
import { Link, useParams } from "react-router"

import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import { ButtonLink } from "@/components/common/button-link"
import { NotFoundPage } from "@/pages/not-found-page"
import { ReportDialog } from "@/components/common/report-dialog"
import { UserAvatar } from "@/components/common/user-avatar"
import { ExtensionRow } from "@/components/extensions/extension-row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { usePageMeta } from "@/hooks/use-page-meta"
import { usePagedList } from "@/hooks/use-paged-list"
import { formatDate } from "@/lib/format"
import { authorExtensionsKey, authorProfileKey } from "@/lib/preload"
import { assetUrl, th } from "@/lib/twexthub"

export function AuthorPage() {
  const { namespace: handle = "" } = useParams()
  const namespace = handle.startsWith("@") ? handle.slice(1) : ""

  if (!namespace) {
    return <NotFoundPage />
  }

  return <AuthorProfile key={namespace} namespace={namespace} />
}

function AuthorProfile({ namespace }: { namespace: string }) {
  const { user, isAdmin } = useAuth()

  const profile = useAsync(
    async (signal) => {
      const account = await th.users.get(namespace, { signal })
      if (account.kind !== "organization") {
        return { account, organization: null, owners: [] }
      }

      const [organization, owners] = await Promise.all([
        th.orgs.get(namespace, { signal }),
        th.orgs.listOwners(namespace, { signal }),
      ])
      return { account, organization, owners: owners.data }
    },
    [namespace],
    authorProfileKey(namespace)
  )

  const extensions = usePagedList(
    (cursor, signal) =>
      th.extensions.list({
        namespace,
        cursor,
        limit: 20,
        sort: "recent",
        signal,
      }),
    [namespace],
    authorExtensionsKey(namespace)
  )

  usePageMeta(
    profile.data?.account.displayName,
    profile.data?.account.bio ||
      (profile.data?.account.kind === "organization"
        ? "An organization publishing TurboWarp extensions."
        : "An author publishing TurboWarp extensions.")
  )

  if (profile.status === "error") {
    return (
      <ErrorState
        message={profile.error ?? "We couldn’t load this profile."}
        onRetry={profile.reload}
      />
    )
  }

  if (profile.status === "loading" || !profile.data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full rounded-lg" />
        <div className="flex gap-3">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <LoadingRows rows={3} />
      </div>
    )
  }

  const { account, organization, owners } = profile.data
  const isOrganization = account.kind === "organization"
  const banner = assetUrl(account.bannerUrl)
  const isSelf = user?.namespace === account.namespace
  const isOwner =
    isSelf || owners.some((owner) => owner.namespace === user?.namespace)
  const canManage = isOrganization ? isOwner || isAdmin : isSelf || isAdmin

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-lg border">
        {banner ? (
          <img
            src={banner}
            alt=""
            className="aspect-[3/1] w-full object-cover"
          />
        ) : null}
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
          <UserAvatar
            name={account.displayName}
            src={account.avatarUrl}
            size="lg"
            className={banner ? "-mt-10 ring-4 ring-card" : undefined}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {account.displayName}
              </h1>
              <span className="font-mono text-sm text-muted-foreground">
                @{account.namespace}
              </span>
              {isOrganization ? (
                <Badge variant="outline">organization</Badge>
              ) : null}
              {account.role === "admin" ? (
                <Badge variant="secondary">admin</Badge>
              ) : null}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {account.bio ||
                (isOrganization ? "No description yet." : "No bio yet.")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarIcon className="size-3.5" /> Joined{" "}
                {formatDate(account.createdAt)}
              </span>
              {account.website ? (
                <a
                  href={account.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <GlobeIcon className="size-3.5" />{" "}
                  {account.website.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
              {account.github ? (
                <a
                  href={`https://github.com/${account.github}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <GitBranchIcon className="size-3.5" /> {account.github}
                </a>
              ) : null}
              {account.hasPublished ? <span>Publishes extensions</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {canManage ? (
              <ButtonLink
                variant="outline"
                size="sm"
                to={
                  isOrganization
                    ? `/organizations/${account.namespace}/manage`
                    : isSelf
                      ? "/settings?tab=profile"
                      : `/admin/users/${account.namespace}`
                }
              >
                <SettingsIcon /> {isOrganization ? "Manage" : "Edit profile"}
              </ButtonLink>
            ) : null}
            <ReportDialog
              targetType={isOrganization ? "organization" : "user"}
              targetNamespace={account.namespace}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Extensions</h2>
            <Link
              to={`/explore?q=${encodeURIComponent(account.namespace)}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Search extensions
            </Link>
          </div>
          {extensions.status === "error" ? (
            <ErrorState
              message={extensions.error ?? "We couldn’t load extensions."}
              onRetry={extensions.reload}
            />
          ) : extensions.status === "loading" ? (
            <LoadingRows rows={3} />
          ) : extensions.items.length === 0 ? (
            <EmptyState
              title="No published extensions"
              description={`@${account.namespace} has not published an extension yet.`}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="divide-y overflow-hidden rounded-lg border">
                {extensions.items.map((extension) => (
                  <ExtensionRow
                    key={`${extension.namespace}/${extension.id}`}
                    extension={extension}
                  />
                ))}
              </ul>
              {extensions.hasMore ? (
                <Button
                  variant="outline"
                  className="self-center"
                  onClick={extensions.loadMore}
                  disabled={extensions.loadingMore}
                >
                  {extensions.loadingMore ? "Loading…" : "Load more"}
                </Button>
              ) : null}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          {isOrganization ? (
            <Tabs defaultValue="owners">
              <TabsList variant="line" className="w-full">
                <TabsTrigger value="owners">Owners</TabsTrigger>
                <TabsTrigger value="about">About</TabsTrigger>
              </TabsList>
              <TabsContent value="owners" className="pt-2">
                {owners.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No owners.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {owners.map((owner) => (
                      <li key={owner.namespace}>
                        <Link
                          to={`/@${owner.namespace}`}
                          className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted"
                        >
                          <UserAvatar
                            name={owner.displayName}
                            src={owner.avatarUrl}
                            size="sm"
                          />
                          <span className="min-w-0">
                            <span className="block truncate">
                              {owner.displayName}
                            </span>
                            <span className="block font-mono text-[11px] text-muted-foreground">
                              @{owner.namespace}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent
                value="about"
                className="flex flex-col gap-2 pt-2 text-sm"
              >
                <p className="text-muted-foreground">
                  {organization?.bio || "No description."}
                </p>
                {organization?.website ? (
                  <a
                    href={organization.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm hover:underline"
                  >
                    <ExternalLinkIcon className="size-3.5" />{" "}
                    {organization.website}
                  </a>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Created{" "}
                  {formatDate(organization?.createdAt ?? account.createdAt)}
                </p>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="rounded-lg border p-4">
              <h2 className="text-sm font-medium">Account</h2>
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Handle</dt>
                  <dd className="font-mono text-xs">@{account.namespace}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Joined</dt>
                  <dd className="font-mono text-xs">
                    {formatDate(account.createdAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Published</dt>
                  <dd className="font-mono text-xs">
                    {account.hasPublished ? "Yes" : "Not yet"}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
