// The instance announcement: one line scrolled across the top of every page,
// for the things an operator cannot expect anyone to read on a status page —
// a maintenance window, a sign-in method that just changed. The text is
// duplicated so the loop has no gap, and the copy is hidden from assistive
// technology: the same sentence is rendered once, statically, for it to read.
// The banner comes from the API, so the link is treated as untrusted: only
// http(s) and same-origin paths are rendered, never `javascript:` or `data:`.
function safeHref(value: string): string | null {
  if (value.startsWith("/") && !value.startsWith("//")) return value
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? value : null
  } catch {
    return null
  }
}

export function AnnouncementBanner({
  banner,
}: {
  banner: { message: string; link: string | null } | null
}) {
  if (!banner) {
    return null
  }

  const href = banner.link ? safeHref(banner.link) : null

  return (
    <div className="border-b bg-primary text-primary-foreground">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-1.5 text-xs sm:px-6">
        <span className="hidden shrink-0 rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase sm:inline">
          Notice
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="announcement-track">
            <span className="pr-12">{banner.message}</span>
            <span className="pr-12" data-marquee-dup aria-hidden="true">
              {banner.message}
            </span>
          </div>
        </div>
        <span className="sr-only">{banner.message}</span>
        {href ? (
          <a
            href={href}
            className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80"
            rel="noreferrer noopener"
            target="_blank"
          >
            Details
          </a>
        ) : null}
      </div>
    </div>
  )
}
