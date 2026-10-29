import {
  BookmarkCheckIcon,
  BookmarkIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  HourglassIcon,
  SettingsIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router"
import { toast } from "sonner"

import type { VersionInfo } from "@twextjs/twexthubkit"

import { ErrorState } from "@/components/common/async-state"
import { ButtonLink } from "@/components/common/button-link"
import { NotFoundPage } from "@/pages/not-found-page"
import { CopyButton } from "@/components/common/copy-button"
import { ReportDialog } from "@/components/common/report-dialog"
import { SourceViewerDialog } from "@/components/sources/source-viewer-dialog"
import { UserAvatar } from "@/components/common/user-avatar"
import { VersionStatusBadge } from "@/components/extensions/version-status"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { usePageMeta } from "@/hooks/use-page-meta"
import { loadExtensionData, type ExtensionData } from "@/lib/extension-data"
import { product } from "@/lib/product"
import { formatDate, formatNumber } from "@/lib/format"
import { licenseName } from "@/lib/licenses"
import { extensionKey } from "@/lib/preload"
import { apiUrl, badgeUrl, downloadUrl, saveBlob, th } from "@/lib/twexthub"
import { isSaved, toggleSaved } from "@/lib/saved"

type BadgeField = "all" | "version" | "downloads" | "license"

// The registry can serve a badge for a single fact; the combined badge stays the
// default because it fits on one line in a README.
const BADGE_FIELDS: Array<{ value: BadgeField; label: string }> = [
  { value: "all", label: "Version, downloads and license" },
  { value: "version", label: "Version" },
  { value: "downloads", label: "Downloads" },
  { value: "license", label: "License" },
]

export function ExtensionPage() {
  const { namespace: handle = "", id = "" } = useParams()
  const namespace = handle.startsWith("@") ? handle.slice(1) : ""

  if (!namespace) {
    return <NotFoundPage />
  }

  return (
    <ExtensionView key={`${namespace}/${id}`} namespace={namespace} id={id} />
  )
}

function ExtensionView({ namespace, id }: { namespace: string; id: string }) {
  const { user, isAdmin } = useAuth()
  const [downloading, setDownloading] = useState<string | null>(null)
  const [sourceTarget, setSourceTarget] = useState<VersionInfo | null>(null)
  const [badgeField, setBadgeField] = useState<BadgeField>("all")

  const result = useAsync<ExtensionData>(
    (signal) => loadExtensionData(th, namespace, id, user?.namespace, signal),
    [namespace, id, user?.namespace],
    extensionKey(namespace, id, user?.namespace)
  )

  usePageMeta(
    result.data?.extension.name,
    result.data?.extension.description || undefined
  )

  if (result.status === "error") {
    return (
      <ErrorState
        message={result.error ?? "We couldn’t load this extension."}
        onRetry={result.reload}
      />
    )
  }

  if (result.status === "loading" || !result.data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const { extension, tags, owners, isOrgOwner, unpublished } = result.data
  const primaryOwner = owners[0]
  const latest = extension.versions[0]
  const isOwner =
    isAdmin ||
    user?.namespace === extension.namespace ||
    isOrgOwner ||
    owners.some((owner) => owner.namespace === user?.namespace)
  const saved = isSaved(extension.namespace, extension.id)
  const installUrl =
    latest?._links?.download ??
    latest?.dist?.downloadUrl ??
    downloadUrl(extension.namespace, extension.id, extension.version)
  const badgePath = `/badge/@${extension.namespace}/${extension.id}`
  // The preview is loaded from this server, which fetches the SVG; the copied
  // address still names the registry, because a README shows the badge on a
  // site this app is not in front of.
  const badgeSrc = badgeUrl(
    extension.namespace,
    extension.id,
    badgeField === "all" ? undefined : badgeField
  )
  const badgeRegistryUrl = apiUrl(
    badgeField === "all" ? badgePath : `${badgePath}/${badgeField}`
  )
  const pageUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/@${extension.namespace}/${extension.id}`
  const badgeLabel = BADGE_FIELDS.find((field) => field.value === badgeField)
  const badgeMarkdown = `[![${product.name} ${badgeLabel?.label ?? ""}](${badgeRegistryUrl})](${pageUrl})`

  async function handleDownload(version: string) {
    setDownloading(version)
    try {
      const blob = await th.extensions.versions.download(
        extension.namespace,
        extension.id,
        version
      )
      saveBlob(blob, `${extension.id}-${version}.js`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed.")
    } finally {
      setDownloading(null)
    }
  }

  function handleSave() {
    const nowSaved = toggleSaved(extension)
    toast.success(nowSaved ? "Saved to your list." : "Removed from saved.")
  }

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <Link to="/explore" className="hover:text-foreground">
          Browse
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/@${extension.namespace}`} className="hover:text-foreground">
          @{extension.namespace}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{extension.id}</span>
      </nav>

      <header className="flex flex-col gap-4 border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {extension.name}
              </h1>
              <Badge variant="outline" className="font-mono">
                v{extension.version}
              </Badge>
              {latest?.status === "deprecated" ? (
                <Badge variant="destructive">deprecated</Badge>
              ) : null}
              {unpublished ? (
                <VersionStatusBadge status={latest?.status ?? "pending"} />
              ) : null}
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {extension.description || "No description yet."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <UserAvatar
                name={primaryOwner?.display_name ?? extension.namespace}
                src={primaryOwner?.avatarUrl}
                size="sm"
              />
              <span>
                By{" "}
                <Link
                  to={`/@${extension.namespace}`}
                  className="text-foreground hover:underline"
                >
                  @{extension.namespace}
                </Link>
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatDate(extension.publishedAt)}</span>
              <span aria-hidden="true">·</span>
              <span title={extension.license}>
                {licenseName(extension.license)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unpublished ? null : (
              <>
                <Button variant="outline" onClick={handleSave}>
                  {saved ? <BookmarkCheckIcon /> : <BookmarkIcon />}
                  {saved ? "Saved" : "Save"}
                </Button>
                <Button
                  onClick={() => void handleDownload(extension.version)}
                  disabled={downloading !== null}
                >
                  <DownloadIcon />
                  {downloading ? "Downloading…" : "Download file"}
                </Button>
              </>
            )}
            {isOwner ? (
              <ButtonLink
                variant="ghost"
                to={`/@${extension.namespace}/${extension.id}/manage`}
              >
                <SettingsIcon /> Manage
              </ButtonLink>
            ) : null}
            {unpublished ? null : (
              <ReportDialog
                targetType="extension"
                targetNamespace={extension.namespace}
                targetExtensionId={extension.id}
              />
            )}
          </div>
        </div>
      </header>

      {unpublished ? (
        <Alert>
          <HourglassIcon />
          <AlertTitle>
            {latest?.status === "rejected"
              ? "A moderator asked for changes"
              : "This project is waiting for review"}
          </AlertTitle>
          <AlertDescription>
            {latest?.status === "rejected"
              ? latest.rejectionReason ||
                "The release needs changes before it can be published."
              : "A first release is reviewed before it joins the registry, so there is nothing to install yet."}{" "}
            Only the owners of @{extension.namespace} can see this page.{" "}
            {isOwner ? (
              <Link
                to={`/@${extension.namespace}/${extension.id}/manage?tab=releases`}
              >
                Manage releases
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {extension.isUnsandboxed ? (
        <Alert>
          <ShieldAlertIcon />
          <AlertTitle>This extension can run outside the sandbox</AlertTitle>
          <AlertDescription>
            Its author says it needs access beyond the normal extension sandbox.
            Only install it if you trust the source. TurboWarp can’t load an
            unsandboxed extension from a link; use PenguinMod or MistWarp, or
            download the file and load it locally.
          </AlertDescription>
        </Alert>
      ) : null}

      {latest?.deprecation ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Deprecated in v{latest.version}</AlertTitle>
          <AlertDescription>{latest.deprecation}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="flex min-w-0 flex-col gap-8">
          {unpublished ? null : (
            <section className="rounded-lg border bg-muted/20 p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Install in TurboWarp, PenguinMod, or MistWarp
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Copy the install link for the editor you use, then add it to
                  that editor’s extension loader. You can also download the
                  compiled file and load it locally.
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <InstallTarget
                  name="TurboWarp"
                  available={extension.isUnsandboxed !== true}
                  description={
                    extension.isUnsandboxed
                      ? "Not available for unsandboxed extensions. Download the file and load it locally instead."
                      : "Use the link in TurboWarp’s extension loader."
                  }
                  installUrl={installUrl}
                />
                <InstallTarget
                  name="PenguinMod"
                  available
                  description="Loads sandboxed and unsandboxed extensions from a link."
                  installUrl={installUrl}
                />
                <InstallTarget
                  name="MistWarp"
                  available
                  description="Loads sandboxed and unsandboxed extensions from a link."
                  installUrl={installUrl}
                />
              </div>
              <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                {[
                  "Copy the link for your editor.",
                  "Open its extension loader.",
                  "Paste the link and confirm.",
                ].map((step, index) => (
                  <li key={step} className="flex items-start gap-2">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border bg-background font-mono text-[10px] text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                Looking for a different release? Download it from the list
                below, or read the{" "}
                <Link
                  to="/developers"
                  className="text-foreground hover:underline"
                >
                  install guide
                </Link>
                .
              </p>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Releases
                </h2>
                <p className="text-sm text-muted-foreground">
                  {unpublished
                    ? "Every release in this project, newest first. Nothing here is downloadable until a moderator publishes it."
                    : "Every published release, newest first. Download counts start when someone installs the compiled file."}
                </p>
              </div>
              {Object.keys(tags).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(tags).map(([tag, version]) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="font-mono text-[11px]"
                    >
                      {tag} → {version}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Release</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Downloads</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Published
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extension.versions.map((version) => (
                    <VersionRow
                      key={version.version}
                      version={version}
                      downloading={downloading === version.version}
                      onDownload={() => void handleDownload(version.version)}
                      canViewSource={isOwner}
                      onViewSource={() => setSourceTarget(version)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-lg border p-4">
            <h2 className="text-sm font-medium">Details</h2>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <DetailRow
                label="License"
                value={licenseName(extension.license)}
              />
              <DetailRow
                label="Latest release"
                value={extension.version}
                mono
              />
              <DetailRow
                label="Downloads"
                value={formatNumber(extension.downloads)}
                mono
              />
              <DetailRow
                label={unpublished ? "Submitted" : "Published"}
                value={formatDate(extension.publishedAt)}
              />
              <DetailRow
                label="Releases"
                value={String(extension.versions.length)}
                mono
              />
              <DetailRow
                label="Sandbox"
                value={
                  extension.isUnsandboxed === true
                    ? "Outside sandbox"
                    : extension.isUnsandboxed === false
                      ? "Sandboxed"
                      : "Not specified"
                }
              />
            </dl>
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="text-sm font-medium">Owners</h2>
            <ul className="mt-3 flex flex-col gap-1">
              {owners.map((owner) => (
                <li key={owner.namespace}>
                  <Link
                    to={`/@${owner.namespace}`}
                    className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted"
                  >
                    <UserAvatar
                      name={owner.display_name}
                      src={owner.avatarUrl}
                      size="sm"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {owner.display_name}
                      </span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        @{owner.namespace}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {unpublished ? null : (
            <section className="rounded-lg border p-4">
              <h2 className="text-sm font-medium">Badge for your project</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Add this markdown to a README or project page.
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                <Label htmlFor="badge-field" className="text-xs">
                  Badge contents
                </Label>
                <Select
                  items={BADGE_FIELDS}
                  value={badgeField}
                  onValueChange={(value) => setBadgeField(value as BadgeField)}
                >
                  <SelectTrigger id="badge-field" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BADGE_FIELDS.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <img
                src={badgeSrc}
                alt={`${extension.id} badge`}
                className="mt-2 h-5"
              />
              <CopyButton
                className="mt-2 w-full"
                value={badgeMarkdown}
                label="Copy badge markdown"
              />
              <a
                href={badgeSrc}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLinkIcon className="size-3.5" /> View SVG badge
              </a>
            </section>
          )}
        </aside>
      </div>

      <SourceViewerDialog
        key={`${extension.namespace}/${extension.id}/${sourceTarget?.version ?? "none"}`}
        open={sourceTarget !== null}
        onOpenChange={(open) => !open && setSourceTarget(null)}
        namespace={extension.namespace}
        id={extension.id}
        version={sourceTarget?.version ?? ""}
        label={sourceTarget ? `v${sourceTarget.version}` : undefined}
      />
    </div>
  )
}

function getPlatformLink(name: string, installUrl: string) {
  try {
    const encoded = encodeURIComponent(installUrl)
    if (name === "TurboWarp") {
      return `https://turbowarp.org/editor?extension=${encoded}`
    }
    if (name === "PenguinMod") {
      return `https://penguinmod.com/editor?extension=${encoded}`
    }
    if (name === "MistWarp") {
      return `https://warp.mistium.com/editor?extension=${encoded}`
    }
  } catch {
    // fall through to original
  }
  return installUrl
}

function InstallTarget({
  name,
  available,
  description,
  installUrl,
}: {
  name: string
  available: boolean
  description: string
  installUrl: string
}) {
  const platformUrl = getPlatformLink(name, installUrl)
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <CopyButton
        className="mt-auto w-full"
        value={platformUrl}
        label={`Copy ${name} link`}
        disabled={!available}
      />
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : "text-right text-sm"}>
        {value}
      </dd>
    </div>
  )
}

function VersionRow({
  version,
  downloading,
  onDownload,
  canViewSource,
  onViewSource,
}: {
  version: VersionInfo
  downloading: boolean
  onDownload: () => void
  canViewSource: boolean
  onViewSource: () => void
}) {
  // A release that is still waiting has no compiled file to hand out, so the
  // download affordance is only there once the registry has published one.
  const downloadable = Boolean(
    version._links?.download ?? version.dist?.downloadUrl
  )

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{version.version}</TableCell>
      <TableCell>
        <VersionStatusBadge status={version.status} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {formatNumber(version.downloads)}
      </TableCell>
      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
        {formatDate(version.publishedAt ?? version.createdAt)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {canViewSource && version._links?.source ? (
            <Button variant="ghost" size="xs" onClick={onViewSource}>
              <FileCodeIcon /> Source
            </Button>
          ) : null}
          {downloadable ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={onDownload}
              disabled={downloading}
            >
              <DownloadIcon /> {downloading ? "…" : "Download"}
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}
