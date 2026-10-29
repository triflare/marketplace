import { useState } from "react"

import { CopyButton } from "@/components/common/copy-button"
import { PageHeader } from "@/components/common/page-header"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  EMBED_FRAMES,
  embedSize,
  embedSnippet,
  embedTheme,
  embedUrl,
  type EmbedKind,
  type EmbedSize,
  type EmbedTheme,
} from "@/lib/embeds"

const THEMES: Array<{ value: EmbedTheme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

const SIZES: Array<{ value: EmbedSize; label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "full", label: "Full" },
]

export interface EmbedDemo {
  label: string
  path: string
}

export function EmbedsPage({
  origin,
  extension,
  profile,
}: {
  origin: string
  extension: EmbedDemo | null
  profile: EmbedDemo | null
}) {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="For developers"
        title="Embeds"
        description="Put a live extension or profile card on your own site or in a README. Cards are plain iframes: no scripts, no API keys, and the light and dark themes follow the card, not the page around it."
      />

      <EmbedSection
        kind="extension"
        title="Extension card"
        description="Shows the name, handle, latest version and, at full size, the description and download count. Everything links back to the extension page."
        demo={extension}
        missing="Publish an extension and its card appears here."
        origin={origin}
      />

      <EmbedSection
        kind="profile"
        title="Profile card"
        description="Shows an author or organization with their avatar, handle and, at full size, their bio."
        demo={profile}
        missing="The first account to join the registry appears here."
        origin={origin}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Options</h2>
        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <li>
            <code className="font-mono text-xs">theme</code> is{" "}
            <code className="font-mono text-xs">light</code> (default) or{" "}
            <code className="font-mono text-xs">dark</code>.
          </li>
          <li>
            <code className="font-mono text-xs">size</code> is{" "}
            <code className="font-mono text-xs">compact</code> (default) or{" "}
            <code className="font-mono text-xs">full</code>.
          </li>
          <li>
            An unknown handle renders a small “Not available” card instead of a
            broken frame, and the iframes load lazily.
          </li>
        </ul>
      </section>
    </div>
  )
}

function EmbedSection({
  kind,
  title,
  description,
  demo,
  missing,
  origin,
}: {
  kind: EmbedKind
  title: string
  description: string
  demo: EmbedDemo | null
  missing: string
  origin: string
}) {
  const [theme, setTheme] = useState<EmbedTheme>("light")
  const [size, setSize] = useState<EmbedSize>("full")

  const frame = EMBED_FRAMES[kind][size]
  const src = demo ? embedUrl(origin, demo.path, { theme, size }) : ""

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      {demo ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${kind}-theme`} className="text-xs">
                Theme
              </Label>
              <Select
                items={THEMES}
                value={theme}
                onValueChange={(value) => setTheme(embedTheme(value))}
              >
                <SelectTrigger id={`${kind}-theme`} className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THEMES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${kind}-size`} className="text-xs">
                Size
              </Label>
              <Select
                items={SIZES}
                value={size}
                onValueChange={(value) => setSize(embedSize(value))}
              >
                <SelectTrigger id={`${kind}-size`} className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-muted/20 p-4">
            <iframe
              key={src}
              src={src}
              width={frame.width}
              height={frame.height}
              title={`${title} preview`}
              className="max-w-full rounded-lg border bg-background"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xs text-muted-foreground">
                /embed{demo.path}?theme={theme}&amp;size={size}
              </p>
              <CopyButton value={embedSnippet(src, frame, demo.label)} />
            </div>
            <code className="block overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs whitespace-pre">
              {embedSnippet(src, frame, demo.label)}
            </code>
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {missing}
        </p>
      )}
    </section>
  )
}
