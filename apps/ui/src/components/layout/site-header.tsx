import {
  BellIcon,
  BookmarkIcon,
  CheckIcon,
  MenuIcon,
  SearchIcon,
  UserPlusIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router"
import { toast } from "sonner"

import { ButtonLink } from "@/components/common/button-link"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { UserAvatar } from "@/components/common/user-avatar"
import { AccountMenu } from "@/components/layout/account-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { useSearchShortcut } from "@/hooks/use-search-shortcut"
import { th } from "@/lib/twexthub"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { to: "/explore", label: "Browse" },
  { to: "/organizations", label: "Organizations" },
  { to: "/authors", label: "Authors" },
]

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    isActive && "bg-muted text-foreground"
  )
}

export function SiteHeader() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { user, isAdmin, accounts, signOut, switchAccount } = useAuth()
  const [query, setQuery] = useState("")
  const [mobileOpen, setMobileOpen] = useState(false)
  const desktopSearch = useRef<HTMLInputElement | null>(null)
  const mobileSearch = useRef<HTMLInputElement | null>(null)
  const focusMobileSearch = useRef(false)

  function openSearch() {
    if (window.matchMedia("(min-width: 768px)").matches) {
      desktopSearch.current?.focus()
      desktopSearch.current?.select()
      return
    }

    focusMobileSearch.current = true
    setMobileOpen(true)
  }

  useSearchShortcut(openSearch)

  // The sheet mounts its content on open, so the field only exists after the
  // next paint.
  useEffect(() => {
    if (!mobileOpen || !focusMobileSearch.current) {
      return
    }

    focusMobileSearch.current = false
    const timer = window.setTimeout(() => mobileSearch.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [mobileOpen])

  const inbox = useAsync(
    (signal) =>
      user
        ? th.notifications.list({ unread: true, limit: 1, signal })
        : Promise.resolve(null),
    [user?.namespace]
  )

  const unread = inbox.data?.unreadCount ?? 0

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    const text = query.trim()
    navigate(text ? `/explore?q=${encodeURIComponent(text)}` : "/explore")
    setMobileOpen(false)
  }

  async function switchTo(namespace: string) {
    setMobileOpen(false)
    try {
      await switchAccount(namespace)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Switch failed.")
    }
  }

  // Signing in again adds an account rather than replacing the one in use, so
  // the page it lands back on is the one being read.
  const addAccountHref = `/login?add=1&next=${encodeURIComponent(`${pathname}${search}`)}`

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img src="/assets/logo.svg" alt="" className="size-7 rounded-md" />
          <span className="text-sm font-semibold tracking-tight">TwextHub</span>
        </Link>

        <nav
          className="ml-2 hidden items-center gap-1 md:flex"
          aria-label="Main"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              {item.label}
            </NavLink>
          ))}
          {user ? (
            <NavLink to="/publish" className={navClass}>
              Publish
            </NavLink>
          ) : null}
        </nav>

        <form
          onSubmit={submitSearch}
          className="group relative ml-auto hidden w-40 md:block lg:w-56"
          role="search"
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={desktopSearch}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search extensions"
            aria-label="Search extensions"
            className="h-8 pr-9 pl-8"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground group-focus-within:opacity-0"
          >
            /
          </kbd>
        </form>

        <div className="ml-auto flex items-center gap-0.5 lg:ml-0">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open search"
            onClick={openSearch}
            className="size-9 md:hidden"
          >
            <SearchIcon />
          </Button>
          {user ? (
            <ButtonLink
              variant="ghost"
              size="icon"
              aria-label={
                unread > 0 ? `${unread} unread notifications` : "Notifications"
              }
              to="/notifications"
              className="relative size-9 sm:size-7"
            >
              <BellIcon />
              {unread > 0 ? (
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary ring-2 ring-background" />
              ) : null}
            </ButtonLink>
          ) : null}
          <ButtonLink
            variant="ghost"
            size="icon"
            aria-label="Saved extensions"
            to="/saved"
            className="hidden size-9 sm:inline-flex sm:size-7"
          >
            <BookmarkIcon />
          </ButtonLink>
          <div className="ml-1 hidden sm:block">
            <AccountMenu />
          </div>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 md:hidden"
                  aria-label="Open menu"
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-4">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <form onSubmit={submitSearch} className="relative" role="search">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={mobileSearch}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search extensions"
                  aria-label="Search extensions"
                  className="pl-8"
                />
              </form>
              <nav className="flex flex-col gap-1" aria-label="Mobile">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="rounded-md px-2 py-2.5 text-sm hover:bg-muted"
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
                <NavLink
                  to="/saved"
                  className="rounded-md px-2 py-2.5 text-sm hover:bg-muted"
                  onClick={() => setMobileOpen(false)}
                >
                  Saved
                </NavLink>
                <NavLink
                  to="/developers"
                  className="rounded-md px-2 py-2.5 text-sm hover:bg-muted"
                  onClick={() => setMobileOpen(false)}
                >
                  For developers
                </NavLink>
                {user ? (
                  <>
                    <NavLink
                      to="/dashboard"
                      className="rounded-md px-2 py-2.5 text-sm hover:bg-muted"
                      onClick={() => setMobileOpen(false)}
                    >
                      Dashboard
                    </NavLink>
                    <NavLink
                      to="/publish"
                      className="rounded-md px-2 py-2.5 text-sm hover:bg-muted"
                      onClick={() => setMobileOpen(false)}
                    >
                      Publish
                    </NavLink>
                    <NavLink
                      to="/settings"
                      className="rounded-md px-2 py-2.5 text-sm hover:bg-muted"
                      onClick={() => setMobileOpen(false)}
                    >
                      Settings
                    </NavLink>
                  </>
                ) : null}
              </nav>
              <SheetFooter className="mt-auto gap-2 border-t p-0 pt-3">
                {user ? (
                  <>
                    {accounts.length > 1 ? (
                      <div className="flex flex-col gap-1 rounded-lg border p-2">
                        <p className="px-1 text-xs font-medium">
                          Switch accounts
                        </p>
                        {accounts.map((account) => (
                          <button
                            key={account.namespace}
                            type="button"
                            disabled={account.namespace === user.namespace}
                            onClick={() => void switchTo(account.namespace)}
                            className="flex items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60 disabled:hover:bg-transparent"
                          >
                            <UserAvatar
                              name={account.displayName}
                              src={account.avatarUrl}
                              size="sm"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {account.displayName}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              @{account.namespace}
                            </span>
                            {account.namespace === user.namespace ? (
                              <CheckIcon className="size-4 text-foreground" />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <ButtonLink
                      variant="outline"
                      to={addAccountHref}
                      onClick={() => setMobileOpen(false)}
                    >
                      <UserPlusIcon /> Add another account
                    </ButtonLink>
                    <p className="font-mono text-xs text-muted-foreground">
                      @{user.namespace}
                    </p>
                    <ButtonLink
                      variant="outline"
                      to="/notifications"
                      onClick={() => setMobileOpen(false)}
                    >
                      Notifications
                    </ButtonLink>
                    {isAdmin ? (
                      <ButtonLink
                        variant="outline"
                        to="/admin"
                        onClick={() => setMobileOpen(false)}
                      >
                        Admin
                      </ButtonLink>
                    ) : null}
                    <Button variant="ghost" onClick={() => void signOut()}>
                      {accounts.length > 1
                        ? `Sign out of @${user.namespace}`
                        : "Sign out"}
                    </Button>
                  </>
                ) : (
                  <>
                    <ButtonLink
                      variant="outline"
                      to="/login"
                      onClick={() => setMobileOpen(false)}
                    >
                      Sign in
                    </ButtonLink>
                    <ButtonLink
                      to="/signup"
                      onClick={() => setMobileOpen(false)}
                    >
                      Create account
                    </ButtonLink>
                  </>
                )}
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
