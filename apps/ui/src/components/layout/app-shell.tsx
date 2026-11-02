import { Suspense } from "react"
import { Outlet, useNavigation, useRouteLoaderData } from "react-router"

import { AnnouncementBanner } from "@/components/layout/announcement-banner"
import { CommandPalette } from "@/components/layout/command-palette"
import { NavigationProgress } from "@/components/layout/navigation-progress"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from "@/components/ui/sonner"

export function AppShell() {
  const navigation = useNavigation()
  const busy = navigation.state !== "idle"
  // The root loader reads the announcement with the session, so it is part of
  // the document rather than something that appears after hydration.
  const root = useRouteLoaderData("root") as
    { banner?: { message: string; link: string | null } | null } | undefined

  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <NavigationProgress />
      <AnnouncementBanner banner={root?.banner ?? null} />
      <SiteHeader />
      <main
        id="main-content"
        tabIndex={-1}
        aria-busy={busy || undefined}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8"
      >
        <Suspense
          fallback={
            <div
              className="flex flex-col gap-4"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="sr-only">Loading page</span>
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-80 max-w-full" />
              <Skeleton className="mt-4 h-64 w-full rounded-lg" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
      <CommandPalette />
      <Toaster position="top-right" />
    </div>
  )
}
