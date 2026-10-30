import { SearchIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"

import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import { PageHeader } from "@/components/common/page-header"
import { ExtensionRow } from "@/components/extensions/extension-row"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePagedList } from "@/hooks/use-paged-list"
import { useSearchShortcut } from "@/hooks/use-search-shortcut"
import { pluralize } from "@/lib/format"
import { licenseName } from "@/lib/licenses"
import { exploreKey } from "@/lib/preload"
import { th } from "@/lib/registry"

const SORTS = [
  { value: "recent", label: "Newest first" },
  { value: "downloads", label: "Most downloaded" },
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name (A–Z)" },
] as const

const LICENSES = [
  "MIT",
  "Apache-2.0",
  "BSD-3-Clause",
  "GPL-3.0",
  "MPL-2.0",
  "Unlicense",
]

// Long enough to finish a word, short enough that results feel live.
const TYPING_DELAY = 350

export function ExplorePage() {
  const [params, setParams] = useSearchParams()
  const query = params.get("q") ?? ""
  const requestedSort = params.get("sort")
  const sort =
    SORTS.find((entry) => entry.value === requestedSort)?.value ?? "recent"
  const license = params.get("license") ?? ""

  const [text, setText] = useState(query)
  const [licenseText, setLicenseText] = useState(license)
  const searchField = useRef<HTMLInputElement | null>(null)

  // What the URL was last set to by this page. A value arriving in the URL that
  // does not match it came from history or a removed filter, so the fields
  // should follow it.
  const pushedQuery = useRef(query)
  const pushedLicense = useRef(license)

  useSearchShortcut(() => {
    searchField.current?.focus()
    searchField.current?.select()
  }, 10)

  const commit = useCallback(
    (patch: { q?: string; license?: string }, mode: "replace" | "push") => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            if (value) {
              next.set(key, value)
            } else {
              next.delete(key)
            }
          }
          return next
        },
        { replace: mode === "replace", preventScrollReset: true }
      )
    },
    [setParams]
  )

  const results = usePagedList(
    (cursor, signal) => {
      const options = {
        sort,
        license: license || undefined,
        cursor,
        limit: 20,
        signal,
      }
      return query
        ? th.extensions.search(query, options)
        : th.extensions.list(options)
    },
    [query, sort, license],
    exploreKey(query, sort, license)
  )

  useEffect(() => {
    if (query !== pushedQuery.current) {
      pushedQuery.current = query
      setText(query)
    }
  }, [query])

  useEffect(() => {
    if (license !== pushedLicense.current) {
      pushedLicense.current = license
      setLicenseText(license)
    }
  }, [license])

  useEffect(() => {
    const value = text.trim()
    if (value === query) {
      return
    }

    const timer = window.setTimeout(() => {
      pushedQuery.current = value
      commit({ q: value }, "replace")
    }, TYPING_DELAY)
    return () => window.clearTimeout(timer)
  }, [text, query, commit])

  useEffect(() => {
    const value = licenseText.trim()
    if (value === license) {
      return
    }

    const timer = window.setTimeout(() => {
      pushedLicense.current = value
      commit({ license: value }, "replace")
    }, TYPING_DELAY)
    return () => window.clearTimeout(timer)
  }, [licenseText, license, commit])

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = text.trim()
    const licenseValue = licenseText.trim()
    pushedQuery.current = value
    pushedLicense.current = licenseValue
    commit({ q: value, license: licenseValue }, "push")
  }

  function updateSort(value: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value && value !== "recent") {
          next.set("sort", value)
        } else {
          next.delete("sort")
        }
        return next
      },
      { preventScrollReset: true }
    )
  }

  function clearQuery() {
    setText("")
    pushedQuery.current = ""
    commit({ q: "" }, "replace")
  }

  function removeFilter(key: "q" | "license") {
    if (key === "q") {
      setText("")
      pushedQuery.current = ""
    } else {
      setLicenseText("")
      pushedLicense.current = ""
    }
    commit({ [key]: "" }, "replace")
  }

  function removeSort() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete("sort")
        return next
      },
      { preventScrollReset: true }
    )
  }

  function clearFilters() {
    setText("")
    setLicenseText("")
    pushedQuery.current = ""
    pushedLicense.current = ""
    setParams(new URLSearchParams(), { preventScrollReset: true })
  }

  const activeSort = SORTS.find((entry) => entry.value === sort)
  const hasFilters = Boolean(query || license || sort !== "recent")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Registry"
        title={query ? `Results for “${query}”` : "Browse extensions"}
        description="Find published extensions for TurboWarp. Search by name, author, or what the extension does."
      />

      <form
        onSubmit={applyFilters}
        aria-label="Filter extensions"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="explore-query">Search</Label>
          <div className="group relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="explore-query"
              ref={searchField}
              name="q"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && text) {
                  event.preventDefault()
                  clearQuery()
                }
              }}
              placeholder="Search by name, author, or description"
              className="pr-9 pl-8"
              enterKeyHint="search"
            />
            {text ? null : (
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground group-focus-within:opacity-0"
              >
                /
              </kbd>
            )}
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-44">
          <Label htmlFor="explore-license">License</Label>
          <Input
            id="explore-license"
            name="license"
            list="explore-licenses"
            value={licenseText}
            onChange={(event) => setLicenseText(event.target.value)}
            placeholder="Any license"
          />
          <datalist id="explore-licenses">
            {LICENSES.map((entry) => (
              <option key={entry} value={entry} />
            ))}
          </datalist>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-48">
          <Label htmlFor="explore-sort">Sort by</Label>
          <Select items={SORTS} value={sort} onValueChange={updateSort}>
            <SelectTrigger id="explore-sort" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button type="submit" className="flex-1 sm:flex-none">
            Apply filters
          </Button>
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="flex-1 sm:flex-none"
              onClick={clearFilters}
            >
              Clear all
            </Button>
          ) : null}
        </div>
      </form>

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filters:</span>
          {query ? (
            <FilterChip
              label={`Search: ${query}`}
              onRemove={() => removeFilter("q")}
            />
          ) : null}
          {license ? (
            <FilterChip
              label={`License: ${licenseName(license)}`}
              onRemove={() => removeFilter("license")}
            />
          ) : null}
          {sort !== "recent" && activeSort ? (
            <FilterChip
              label={`Sort: ${activeSort.label}`}
              onRemove={removeSort}
            />
          ) : null}
        </div>
      ) : null}

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {results.status === "success"
          ? `${pluralize(results.items.length, "extension")} shown${
              results.hasMore ? " · more available" : ""
            }`
          : "Loading extensions"}
      </p>

      {results.status === "error" ? (
        <ErrorState
          message={results.error ?? "We couldn’t load extensions."}
          onRetry={results.reload}
        />
      ) : results.status === "loading" ? (
        <LoadingRows rows={5} />
      ) : results.items.length === 0 ? (
        <EmptyState
          title="No extensions match"
          description={
            query
              ? "Try a shorter search, or remove the license filter."
              : "Nothing has been published with these filters yet."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="divide-y overflow-hidden rounded-lg border">
            {results.items.map((extension) => (
              <ExtensionRow
                key={`${extension.namespace}/${extension.id}`}
                extension={extension}
              />
            ))}
          </ul>
          {results.hasMore ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={results.loadMore}
                disabled={results.loadingMore}
              >
                {results.loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border py-1 pr-1 pl-2.5 text-xs">
      {label}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </span>
  )
}
