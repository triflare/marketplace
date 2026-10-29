import {
  ArrowRightIcon,
  DownloadIcon,
  SearchIcon,
  ShieldCheckIcon,
  TerminalIcon,
  UploadIcon,
} from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"

import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import { ButtonLink } from "@/components/common/button-link"
import { CopyButton } from "@/components/common/copy-button"
import { ExtensionRow } from "@/components/extensions/extension-row"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAsync } from "@/hooks/use-async"
import { usePageMeta } from "@/hooks/use-page-meta"
import { formatNumber } from "@/lib/format"
import { HOME_FEED_KEY } from "@/lib/preload"
import { product } from "@/lib/product"
import { CLI_HUB_URL_FLAG, th } from "@/lib/twexthub"

const QUICK_STEPS = [
  { label: "Install the CLI", command: "npm install -g @twextjs/twext" },
  { label: "Create a project", command: "twext init" },
  { label: "Sign in", command: `twext login${CLI_HUB_URL_FLAG}` },
  { label: "Publish it", command: `twext publish${CLI_HUB_URL_FLAG}` },
]

export function HomePage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")

  usePageMeta(
    "Extensions for TurboWarp",
    "Browse community-made TurboWarp extensions built with Twext, or publish your own."
  )

  const feed = useAsync(
    async (signal) => {
      const [meta, stats, trending, recent] = await Promise.all([
        th.instance.meta({ signal }),
        th.instance.stats({ signal }),
        th.extensions.trending({ limit: 5, signal }),
        th.extensions.list({ sort: "recent", limit: 6, signal }),
      ])
      return { meta, stats, trending: trending.data, recent: recent.data }
    },
    [],
    HOME_FEED_KEY
  )

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = query.trim()
    navigate(text ? `/explore?q=${encodeURIComponent(text)}` : "/explore")
  }

  return (
    <div className="flex flex-col gap-12">
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5 pt-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {feed.data?.meta.name ?? product.name} · built with Twext
          </p>
          <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Extensions for TurboWarp, built with Twext.
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Browse community-made extensions, or publish your own. New
            extensions are reviewed before they appear, so the build people
            install is the build that was checked.
          </p>
          <form
            onSubmit={submit}
            className="flex max-w-md items-center gap-2"
            role="search"
          >
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or author"
                aria-label="Search extensions"
                className="h-9 pl-8"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <ButtonLink variant="outline" to="/explore">
              Browse all <ArrowRightIcon />
            </ButtonLink>
            <ButtonLink variant="ghost" to="/publish">
              <UploadIcon /> Publish an extension
            </ButtonLink>
          </div>
        </div>

        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <TerminalIcon className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">From project to registry</h2>
            </div>
            <span className="text-[11px] text-muted-foreground">Twext CLI</span>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              Build a TurboWarp extension from a small JavaScript project, then
              publish it here without leaving the terminal.
            </p>
            <ol className="flex flex-col gap-2">
              {QUICK_STEPS.map((step, index) => (
                <li key={step.label} className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {step.label}
                    </p>
                    <div className="mt-1 flex items-center gap-1 rounded-md border bg-muted/40 py-1 pr-1 pl-2">
                      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] whitespace-nowrap">
                        {step.command}
                      </code>
                      <CopyButton
                        value={step.command}
                        label="Copy command"
                        size="icon-sm"
                        variant="ghost"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <ButtonLink
              variant="outline"
              size="sm"
              to="/developers"
              className="self-start"
            >
              Developer guide <ArrowRightIcon />
            </ButtonLink>
          </div>
        </section>
      </section>

      <section aria-label="Registry statistics" className="border-y">
        {feed.data ? (
          <dl className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: "Published", value: feed.data.stats.published },
              { label: "Authors", value: feed.data.stats.authors },
              { label: "Downloads", value: feed.data.stats.downloads },
              { label: "In review", value: feed.data.stats.pending },
            ].map((stat, index) => (
              <div
                key={stat.label}
                className={index > 1 ? "px-4 py-3 sm:border-t-0" : "px-4 py-3"}
              >
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="mt-0.5 font-mono text-xl tabular-nums">
                  {formatNumber(stat.value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="bg-background px-4 py-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-5 w-12" />
              </div>
            ))}
          </div>
        )}
      </section>

      {feed.status === "error" ? (
        <ErrorState
          message={feed.error ?? "We couldn’t load the registry."}
          onRetry={feed.reload}
        />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Trending this week
                </h2>
                <p className="text-sm text-muted-foreground">
                  Ranked by downloads in the last seven days.
                </p>
              </div>
              <Link
                to="/explore?sort=downloads"
                className="shrink-0 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground"
              >
                Top downloads
              </Link>
            </div>
            {feed.status === "loading" ? (
              <LoadingRows rows={4} />
            ) : feed.data && feed.data.trending.length > 0 ? (
              <ul className="divide-y overflow-hidden rounded-lg border">
                {feed.data.trending.map((extension) => (
                  <ExtensionRow
                    key={`${extension.namespace}/${extension.id}`}
                    extension={extension}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Nothing is trending yet"
                description="Once published extensions start getting downloads, the weekly ranking appears here."
                action={
                  <ButtonLink variant="outline" to="/explore">
                    Browse the registry
                  </ButtonLink>
                }
              />
            )}
          </section>

          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">
                Recently published
              </h2>
              <Link
                to="/explore"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                All
              </Link>
            </div>
            {feed.status === "loading" ? (
              <LoadingRows rows={3} />
            ) : feed.data && feed.data.recent.length > 0 ? (
              <ul className="divide-y overflow-hidden rounded-lg border">
                {feed.data.recent.map((extension) => (
                  <ExtensionRow
                    key={`${extension.namespace}/${extension.id}`}
                    extension={extension}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No published extensions"
                description="The registry is empty. The first approved extension will show up here."
              />
            )}
          </section>
        </div>
      )}

      <section className="grid gap-6 border-t pt-8 sm:grid-cols-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <DownloadIcon className="size-4" /> Install in your editor
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open an extension and copy its link for TurboWarp, PenguinMod, or
            MistWarp. TurboWarp only loads sandboxed extensions from a link; the
            mods also load unsandboxed ones.
          </p>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheckIcon className="size-4" /> Reviewed before release
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A first release waits for a moderator. The registry builds every
            upload itself, so the version people install matches the one that
            was reviewed.
          </p>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <TerminalIcon className="size-4" /> Built with Twext
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the Twext CLI to build from modules, validate the project, and
            publish a release.{" "}
            <Link to="/developers" className="text-foreground hover:underline">
              Read the developer guide
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/30 p-5">
        <div>
          <h2 className="text-base font-medium">Have an extension to share?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish it with Twext, or upload a project archive from the publish
            page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="outline" to="/developers">
            Developer guide
          </ButtonLink>
          <ButtonLink to="/publish">
            <UploadIcon /> Publish an extension
          </ButtonLink>
        </div>
      </section>
    </div>
  )
}
