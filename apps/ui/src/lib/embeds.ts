export type EmbedTheme = "light" | "dark"
export type EmbedSize = "compact" | "full"
export type EmbedKind = "extension" | "profile"

// The documents these iframes load carry their own padding, so the frame is a
// little larger than the card it shows.
export const EMBED_FRAMES: Record<
  EmbedKind,
  Record<EmbedSize, { width: number; height: number }>
> = {
  extension: {
    compact: { width: 360, height: 132 },
    full: { width: 360, height: 200 },
  },
  profile: {
    compact: { width: 320, height: 124 },
    full: { width: 320, height: 176 },
  },
}

export function embedTheme(value: string | null | undefined): EmbedTheme {
  return value === "dark" ? "dark" : "light"
}

export function embedSize(value: string | null | undefined): EmbedSize {
  return value === "full" ? "full" : "compact"
}

export function embedUrl(
  origin: string,
  path: string,
  options: { theme: EmbedTheme; size: EmbedSize }
): string {
  const url = new URL(
    `/embed${path.startsWith("/") ? path : `/${path}`}`,
    origin
  )
  url.searchParams.set("theme", options.theme)
  url.searchParams.set("size", options.size)
  return url.toString()
}

export function embedSnippet(
  url: string,
  frame: { width: number; height: number },
  title: string
): string {
  // Names can contain quotes, which would otherwise close the title attribute
  // of the snippet a publisher pastes into their own page.
  const safeTitle = title.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
  return `<iframe src="${url}" width="${frame.width}" height="${frame.height}" title="${safeTitle}" loading="lazy" style="border:0;max-width:100%"></iframe>`
}
