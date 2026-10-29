import type { ExtensionDetail, User } from "@twextjs/twexthubkit"
import type { ReactNode } from "react"

import { UserAvatar } from "@/components/common/user-avatar"
import { formatDate, formatNumber } from "@/lib/format"
import type { EmbedSize, EmbedTheme } from "@/lib/embeds"
import { product } from "@/lib/product"
import { cn } from "@/lib/utils"

// The dark variant is defined as `.dark *`, so the theme class has to sit on an
// ancestor of the card rather than on the card itself.
export function EmbedFrame({
  theme,
  children,
}: {
  theme: EmbedTheme
  children: ReactNode
}) {
  return (
    <div className={cn("min-h-svh w-full", theme === "dark" && "dark")}>
      <div className="flex min-h-svh w-full items-center justify-center bg-background p-3">
        {children}
      </div>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="w-full min-w-0 rounded-xl border bg-background px-4 py-3 text-foreground shadow-sm">
      {children}
    </div>
  )
}

function Credit({ origin, href }: { origin: string; href: string }) {
  return (
    <p className="mt-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
      <a
        href={`${origin}${href}`}
        target="_top"
        className="hover:text-foreground"
      >
        {product.name}
      </a>
    </p>
  )
}

export function ExtensionEmbedCard({
  extension,
  origin,
  size,
}: {
  extension: ExtensionDetail
  origin: string
  size: EmbedSize
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            <a
              href={`${origin}/@${extension.namespace}/${extension.id}`}
              target="_top"
              className="hover:underline"
            >
              {extension.name}
            </a>
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            @{extension.namespace}/{extension.id}
          </p>
        </div>
        <span className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          v{extension.version}
        </span>
      </div>
      {size === "full" ? (
        <>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {extension.description || "No description yet."}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {formatNumber(extension.downloads)} downloads ·{" "}
            {extension.license || "no license"}
          </p>
        </>
      ) : null}
      <Credit
        origin={origin}
        href={`/@${extension.namespace}/${extension.id}`}
      />
    </Card>
  )
}

export function ProfileEmbedCard({
  profile,
  origin,
  size,
}: {
  profile: User
  origin: string
  size: EmbedSize
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <UserAvatar name={profile.displayName} src={profile.avatarUrl} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            <a
              href={`${origin}/@${profile.namespace}`}
              target="_top"
              className="hover:underline"
            >
              {profile.displayName}
            </a>
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            @{profile.namespace}
            {profile.kind === "organization" ? " · organization" : ""}
          </p>
        </div>
      </div>
      {size === "full" ? (
        <>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {profile.bio || "No bio yet."}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {profile.hasPublished
              ? "Publishes extensions"
              : "No published extensions"}
            {" · joined "}
            {formatDate(profile.createdAt)}
          </p>
        </>
      ) : null}
      <Credit origin={origin} href={`/@${profile.namespace}`} />
    </Card>
  )
}

export function MissingEmbedCard({ what }: { what: string }) {
  return (
    <Card>
      <p className="text-sm font-medium">Not available</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This {what} isn’t published on this {product.name} instance.
      </p>
    </Card>
  )
}
