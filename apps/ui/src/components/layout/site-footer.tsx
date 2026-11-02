import { Link } from "react-router"

import { extend } from "@/lib/product"
import { apiUrl } from "@/lib/registry"

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Extensions for TurboWarp, built with {extend.name}.</p>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          <Link to="/explore" className="hover:text-foreground">
            Browse
          </Link>
          <Link to="/developers" className="hover:text-foreground">
            For developers
          </Link>
          <Link to="/embeds" className="hover:text-foreground">
            Embeds
          </Link>
          <a
            href={apiUrl("/feed.atom")}
            type="application/atom+xml"
            className="hover:text-foreground"
          >
            Feed
          </a>
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  )
}
