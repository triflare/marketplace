import { FileArchiveIcon, TerminalIcon, TriangleAlertIcon } from "lucide-react"
import { useRef, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import type { VersionInfo } from "@/lib/api"

import { ButtonLink } from "@/components/common/button-link"
import { CopyButton } from "@/components/common/copy-button"
import { NextStepsDialog } from "@/components/common/next-steps-dialog"
import { PageHeader } from "@/components/common/page-header"
import { VersionStatusBadge } from "@/components/extensions/version-status"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { formatDate } from "@/lib/format"
import { extend } from "@/lib/product"
import { CLI_HUB_URL_FLAG, errorMessage, th } from "@/lib/registry"

const PACKAGE = `# From the ${extend.name} project root:
tar -czf my-extension.tar.gz ${extend.configFilename} package.json src`

const SIGNUP = `${extend.command} signup${CLI_HUB_URL_FLAG}`

const CLI_STEPS = [
  {
    label: `Install the ${extend.name} CLI`,
    command: `npm install -g ${extend.package}`,
    help: "You only need to do this once.",
  },
  {
    label: "Sign in to this registry",
    command: `${extend.command} login${CLI_HUB_URL_FLAG}`,
    help: `Use the handle and password for the account publishing the extension. No account yet? Run ${SIGNUP} first.`,
  },
  {
    label: "Publish from your project folder",
    command: `${extend.command} publish${CLI_HUB_URL_FLAG}`,
    help: `${extend.name} checks the project and builds it before uploading.`,
  },
]

export function PublishPage() {
  const { user } = useAuth()
  const [namespace, setNamespace] = useState(user?.namespace ?? "")
  const [id, setId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VersionInfo | null>(null)
  const [nextStepsOpen, setNextStepsOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const terms = useAsync((signal) => th.instance.terms({ signal }), [])
  const needsTerms =
    Boolean(user) &&
    Boolean(terms.data) &&
    String(user?.termsAcceptedVersion ?? "") !== String(terms.data?.version)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) {
      setError("Choose a project archive first.")
      return
    }

    setPending(true)
    setError(null)
    setResult(null)
    try {
      const version = await th.extensions.versions.publish(
        namespace.trim(),
        id.trim(),
        file,
        {
          contentType: "application/gzip",
        }
      )
      setResult(version)
      setNextStepsOpen(true)
      if (version.status === "pending") {
        toast.success("Uploaded. The first release waits for review.")
      } else {
        toast.success(`Published v${version.version}.`)
      }
    } catch (reason) {
      // The alert sits with the form, so the message also has to travel: a
      // toast catches the eye wherever the page happens to be scrolled.
      const message = errorMessage(reason)
      setError(message)
      toast.error(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Publishing"
        title="Publish an extension"
        description={`Use the ${extend.name} CLI to build and publish, or upload a project archive if you already have one. The registry checks every submission before it appears.`}
      />

      {needsTerms ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Accept the current terms first</AlertTitle>
          <AlertDescription>
            Publishing and organization changes are blocked until this account
            accepts the current terms.{" "}
            <Link to="/terms" className="underline">
              Read and accept them
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-w-0 flex-col gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-medium">
              <TerminalIcon className="size-4" /> Publish with {extend.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This is the quickest path. Run these commands from the project
              folder that contains a{" "}
              <span className="font-mono">{extend.configFilename}</span>.
            </p>
          </div>

          <ol className="flex flex-col gap-3">
            {CLI_STEPS.map((step, index) => (
              <li
                key={step.command}
                className="flex flex-col gap-2 rounded-lg border p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {step.help}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-1.5 pl-3">
                  <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap">
                    {step.command}
                  </code>
                  <CopyButton
                    value={step.command}
                    label="Copy command"
                    size="icon-sm"
                  />
                </div>
              </li>
            ))}
          </ol>

          <p className="text-sm text-muted-foreground">
            Need help with the project itself?{" "}
            <Link to="/developers" className="text-foreground hover:underline">
              Read the developer guide
            </Link>
            .
          </p>

          <details className="mt-2 rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium select-none">
              Upload a project archive instead
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              Use this if you already have a{" "}
              <span className="font-mono">.tar.gz</span> of your {extend.name}{" "}
              project and would rather publish it in the browser.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="publish-namespace">Publisher handle</Label>
                  <Input
                    id="publish-namespace"
                    value={namespace}
                    onChange={(event) => setNamespace(event.target.value)}
                    required
                    placeholder="your-name"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your handle, or an organization you own.
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="publish-id">Extension ID</Label>
                  <Input
                    id="publish-id"
                    value={id}
                    onChange={(event) => setId(event.target.value)}
                    required
                    placeholder="my-extension"
                  />
                  <p className="text-xs text-muted-foreground">
                    The ID in{" "}
                    <span className="font-mono">{extend.configFilename}</span>{" "}
                    must match exactly.
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="publish-file">Project archive</Label>
                <Input
                  id="publish-file"
                  ref={fileInput}
                  type="file"
                  accept=".gz,.tgz,.tar.gz,application/gzip,application/octet-stream"
                  className="w-full min-w-0 text-xs sm:text-sm"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Include{" "}
                  <span className="font-mono">{extend.configFilename}</span>,
                  your sources, and a{" "}
                  <span className="font-mono">package.json</span>. The version
                  in the manifest must be newer than the latest published
                  release.
                </p>
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>We couldn’t publish that</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">
                    {error}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  disabled={pending || needsTerms}
                  variant="outline"
                >
                  <FileArchiveIcon />{" "}
                  {pending ? "Uploading…" : "Upload project"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  This can take a few seconds.
                </span>
              </div>
            </form>
          </details>
        </section>

        <aside className="flex flex-col gap-6">
          <section className="rounded-lg border p-4">
            <h2 className="text-sm font-medium">What happens next</h2>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-xs text-muted-foreground">
              <li>
                The project is checked against your handle and extension ID.
              </li>
              <li>The registry builds it in a clean environment.</li>
              <li>
                A first release waits for a moderator. Later releases usually go
                live right away.
              </li>
              <li>You get a notification when a moderator makes a decision.</li>
            </ol>
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="text-sm font-medium">Before you publish</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-xs text-muted-foreground">
              <li>Choose a clear name and description.</li>
              <li>Test the build in TurboWarp.</li>
              <li>Pick a license you are comfortable sharing under.</li>
            </ul>
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="text-sm font-medium">Packaging manually</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The browser upload expects a gzipped project, not a zip file.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
              <code>{PACKAGE}</code>
            </pre>
            <CopyButton
              className="mt-2 w-full"
              value={PACKAGE}
              label="Copy command"
            />
          </section>
        </aside>
      </div>

      {result ? (
        <section
          aria-live="polite"
          className="flex flex-col gap-3 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">v{result.version}</h2>
            <VersionStatusBadge status={result.status} />
            <span className="text-xs text-muted-foreground">
              {formatDate(result.createdAt)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {result.status === "pending"
              ? "Your release is waiting for review. You’ll get a notification when a moderator decides."
              : "Your release is available now."}
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              variant="outline"
              to={`/@${result.namespace}/${result.id}`}
            >
              Open extension
            </ButtonLink>
            <ButtonLink
              variant="ghost"
              to={`/@${result.namespace}/${result.id}/manage?tab=releases`}
            >
              Manage releases
            </ButtonLink>
            <ButtonLink variant="ghost" to="/dashboard">
              Go to dashboard
            </ButtonLink>
          </div>
          {result.warnings && result.warnings.length > 0 ? (
            <Alert>
              <TriangleAlertIcon />
              <AlertTitle>{result.warnings.length} things to review</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 flex flex-col gap-1">
                  {result.warnings.map((warning, index) => (
                    <li
                      key={`${warning.file}-${warning.line}-${index}`}
                      className="font-mono text-xs"
                    >
                      {warning.code} · {warning.file}:{warning.line} —{" "}
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {result.buildLog ? (
            <details className="rounded-md border">
              <summary className="cursor-pointer px-3 py-2 text-sm">
                Build details
              </summary>
              <pre className="max-h-80 overflow-auto border-t p-3 font-mono text-[11px] whitespace-pre-wrap">
                {result.buildLog}
              </pre>
            </details>
          ) : null}
        </section>
      ) : null}

      <NextStepsDialog
        open={nextStepsOpen && result !== null}
        onOpenChange={setNextStepsOpen}
        title={result ? `v${result.version} was uploaded` : "Upload complete"}
        description={
          result?.status === "pending"
            ? "Your release is queued for review. In the meantime, you can still set up the page it will appear on."
            : "Your release is live. These are the usual next stops."
        }
        steps={
          result
            ? [
                {
                  title: "Open the extension page",
                  description:
                    "See what visitors see, including the install links.",
                  to: `/@${result.namespace}/${result.id}`,
                },
                {
                  title: "Manage releases",
                  description:
                    "Add tags, invite owners, or remove this release later.",
                  to: `/@${result.namespace}/${result.id}/manage?tab=releases`,
                },
                {
                  title: "Publish another archive",
                  description:
                    "Keep the handle, clear the fields, and upload again.",
                  onSelect: () => {
                    setResult(null)
                    setId("")
                    setFile(null)
                    if (fileInput.current) {
                      fileInput.current.value = ""
                    }
                  },
                },
              ]
            : []
        }
      />
    </div>
  )
}
