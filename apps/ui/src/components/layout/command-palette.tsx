import {
  ArrowDownIcon,
  ArrowUpIcon,
  BellIcon,
  BookmarkIcon,
  BookOpenIcon,
  Building2Icon,
  Code2Icon,
  CompassIcon,
  CornerDownLeftIcon,
  LayoutDashboardIcon,
  LockIcon,
  ScaleIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  UploadIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"

import type { ExtensionSummary } from "@/lib/api"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/context/auth"
import { extend } from "@/lib/product"
import { th } from "@/lib/registry"
import { cn } from "@/lib/utils"

interface PaletteItem {
  id: string
  label: string
  hint?: string
  to: string
  icon?: LucideIcon
}

interface Command extends PaletteItem {
  icon: LucideIcon
  keywords: string
  requires?: "user" | "admin"
}

const COMMANDS: Command[] = [
  {
    id: "explore",
    label: "Browse extensions",
    to: "/explore",
    icon: CompassIcon,
    keywords: "search find registry explore browse extensions",
  },
  {
    id: "authors",
    label: "Authors",
    to: "/authors",
    icon: UsersIcon,
    keywords: "publishers people accounts",
  },
  {
    id: "organizations",
    label: "Organizations",
    to: "/organizations",
    icon: Building2Icon,
    keywords: "orgs teams",
  },
  {
    id: "saved",
    label: "Saved extensions",
    to: "/saved",
    icon: BookmarkIcon,
    keywords: "bookmarks favourites favorites",
  },
  {
    id: "developers",
    label: "Developer guide",
    to: "/developers",
    icon: BookOpenIcon,
    keywords: `docs cli build publish ${extend.command}`,
  },
  {
    id: "embeds",
    label: "Embeds",
    to: "/embeds",
    icon: Code2Icon,
    keywords: "badge iframe widget snippet",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboardIcon,
    keywords: "overview home account",
    requires: "user",
  },
  {
    id: "notifications",
    label: "Notifications",
    to: "/notifications",
    icon: BellIcon,
    keywords: "inbox alerts",
    requires: "user",
  },
  {
    id: "publish",
    label: "Publish an extension",
    to: "/publish",
    icon: UploadIcon,
    keywords: "upload release new version",
    requires: "user",
  },
  {
    id: "settings",
    label: "Settings",
    to: "/settings",
    icon: SettingsIcon,
    keywords: "account profile security tokens webhooks",
    requires: "user",
  },
  {
    id: "admin",
    label: "Admin",
    to: "/admin",
    icon: ShieldIcon,
    keywords: "review queue reports audit instance",
    requires: "admin",
  },
  {
    id: "terms",
    label: "Terms of service",
    to: "/terms",
    icon: ScaleIcon,
    keywords: "legal tos",
  },
  {
    id: "privacy",
    label: "Privacy policy",
    to: "/privacy",
    icon: LockIcon,
    keywords: "legal data",
  },
]

const SEARCH_DELAY = 250

// Ctrl/Cmd+K opens a single box for jumping to a page or an extension, so the
// header search can stay a plain search field.
export function CommandPalette() {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [active, setActive] = useState(0)
  const [found, setFound] = useState<{
    query: string
    items: ExtensionSummary[]
  }>({ query: "", items: [] })
  const list = useRef<HTMLDivElement | null>(null)

  const query = text.trim().toLowerCase()

  const commands = useMemo(
    () =>
      COMMANDS.filter((command) => {
        if (command.requires === "user" && !user) {
          return false
        }
        if (command.requires === "admin" && !isAdmin) {
          return false
        }
        return `${command.label} ${command.keywords}`
          .toLowerCase()
          .includes(query)
      }),
    [query, user, isAdmin]
  )

  const extensions = useMemo(
    () => (found.query === text.trim() ? found.items : []),
    [found, text]
  )

  const items: PaletteItem[] = useMemo(
    () => [
      ...commands,
      ...extensions.map((extension) => ({
        id: `extension-${extension.namespace}/${extension.id}`,
        label: extension.name,
        hint: `@${extension.namespace}/${extension.id}`,
        to: `/@${extension.namespace}/${extension.id}`,
      })),
    ],
    [commands, extensions]
  )

  // Keep the highlight inside the list as results shrink.
  const index = Math.min(active, Math.max(items.length - 1, 0))
  const current = items[index]

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "k"
      ) {
        return
      }
      event.preventDefault()
      setText("")
      setActive(0)
      setFound({ query: "", items: [] })
      setOpen(true)
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    const value = text.trim()
    if (!open || !value) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      th.extensions
        .search(value, { limit: 5, signal: controller.signal })
        .then((page) => setFound({ query: value, items: page.data }))
        .catch(() => {
          // A failed lookup just leaves the page commands alone.
        })
    }, SEARCH_DELAY)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [open, text])

  useEffect(() => {
    const node = list.current?.querySelector(`[data-index="${index}"]`)
    node?.scrollIntoView({ block: "nearest" })
  }, [index])

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setText("")
      setActive(0)
    }
  }

  function choose(item: PaletteItem | undefined) {
    if (!item) {
      return
    }
    changeOpen(false)
    navigate(item.to)
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((value) =>
        Math.min(Math.max(value + step, 0), Math.max(items.length - 1, 0))
      )
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      choose(current)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      changeOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[12%] translate-y-0 gap-0 p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Search and jump</DialogTitle>

        <div className="relative border-b">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={
              current ? `command-palette-${current.id}` : undefined
            }
            aria-autocomplete="list"
            aria-label="Search pages and extensions"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setActive(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages and extensions…"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full bg-transparent pr-10 pl-9 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>

        <div
          ref={list}
          id="command-palette-results"
          role="listbox"
          aria-label="Results"
          className="max-h-80 overflow-y-auto overscroll-contain p-1"
        >
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Nothing matches “{text.trim()}”.
            </p>
          ) : (
            <>
              {commands.length > 0 ? (
                <Group label="Pages">
                  {commands.map((command, position) => (
                    <Option
                      key={command.id}
                      item={command}
                      index={position}
                      active={position === index}
                      onHover={setActive}
                      onSelect={choose}
                    />
                  ))}
                </Group>
              ) : null}
              {extensions.length > 0 ? (
                <Group label="Extensions">
                  {extensions.map((extension, position) => {
                    const itemIndex = commands.length + position
                    return (
                      <Option
                        key={`${extension.namespace}/${extension.id}`}
                        item={{
                          id: `extension-${extension.namespace}/${extension.id}`,
                          label: extension.name,
                          hint: `@${extension.namespace}/${extension.id}`,
                          to: `/@${extension.namespace}/${extension.id}`,
                        }}
                        index={itemIndex}
                        active={itemIndex === index}
                        onHover={setActive}
                        onSelect={choose}
                      />
                    )
                  })}
                </Group>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowUpIcon className="size-3" />
            <ArrowDownIcon className="size-3" />
            move
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeftIcon className="size-3" />
            open
          </span>
          <span className="ml-auto">
            {query
              ? `${items.length} result${items.length === 1 ? "" : "s"}`
              : "Ctrl K"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Group({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="pb-1">
      <p className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  )
}

function Option({
  item,
  index,
  active,
  onHover,
  onSelect,
}: {
  item: PaletteItem
  index: number
  active: boolean
  onHover: (index: number) => void
  onSelect: (item: PaletteItem) => void
}) {
  const Icon = item.icon

  return (
    <button
      type="button"
      role="option"
      id={`command-palette-${item.id}`}
      aria-selected={active}
      data-index={index}
      onMouseMove={() => onHover(index)}
      onClick={() => onSelect(item)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
        active && "bg-muted"
      )}
    >
      {Icon ? (
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.hint ? (
        <span className="max-w-[55%] min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {item.hint}
        </span>
      ) : null}
    </button>
  )
}
