import { ExternalLinkIcon, TerminalIcon } from "lucide-react"
import type { ReactNode } from "react"

import { CopyButton } from "@/components/common/copy-button"
import { PageHeader } from "@/components/common/page-header"
import { ButtonLink } from "@/components/common/button-link"
import { product } from "@/lib/product"
import {
  API_BASE_URL,
  CLI_HUB_URL_FLAG,
  IS_OFFICIAL_INSTANCE,
} from "@/lib/twexthub"

const INSTALL = "npm install -g @twextjs/twext"
const INIT = "twext init"
const BUILD = "twext build"
const DEV = "twext dev"
const SIGNUP = `twext signup${CLI_HUB_URL_FLAG}`
const LOGIN = `twext login${CLI_HUB_URL_FLAG}`
const PUBLISH = `twext publish${CLI_HUB_URL_FLAG}`
const TOKEN_CREATE = `twext token create --name ci --scope publish${CLI_HUB_URL_FLAG}`
const CI_PUBLISH = `${
  IS_OFFICIAL_INSTANCE ? "" : `TWEXTHUB_URL=${API_BASE_URL} `
}TWEXTHUB_TOKEN=twext_... twext publish`

export function DevelopersPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="For developers"
        title="Build and publish with Twext"
        description="Twext turns a small JavaScript project into a TurboWarp extension. Use the Twext CLI to build it, preview it, and publish it here."
      />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <GuideStep
            step="1"
            title="Create a project"
            description="Install the CLI, then create a project in an empty folder. Twext writes the configuration and a working starter block."
          >
            <Command value={INSTALL} />
            <Command value={INIT} />
          </GuideStep>

          <GuideStep
            step="2"
            title="Build and try it"
            description="Build once, or start the development server and reload TurboWarp after each save."
          >
            <Command value={BUILD} />
            <Command value={DEV} />
            <p className="text-xs text-muted-foreground">
              The dev server serves the extension at a local URL so you can add
              it to TurboWarp without downloading a file.
            </p>
          </GuideStep>

          <GuideStep
            step="3"
            title="Publish a release"
            description="Sign in once, then publish from the project folder. Twext validates and builds the project before it uploads anything."
          >
            <Command value={LOGIN} />
            <Command value={PUBLISH} />
            <p className="text-xs text-muted-foreground">
              No account yet? Run <span className="font-mono">{SIGNUP}</span>{" "}
              first. A first release waits for review. Later releases from the
              same account appear immediately unless a moderator asks for
              changes.
            </p>
          </GuideStep>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border p-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <TerminalIcon className="size-4" /> Install in your editor
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Each extension page has a copy button for TurboWarp, PenguinMod,
              and MistWarp. Paste the link into that editor’s extension loader.
              TurboWarp only accepts sandboxed extensions from a link; for an
              unsandboxed one, download the file and load it locally.
            </p>
            <ButtonLink
              variant="outline"
              size="sm"
              to="/explore"
              className="mt-3"
            >
              Browse extensions
            </ButtonLink>
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="text-sm font-medium">Release commands</h2>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div>
                <dt className="font-mono text-xs">twext tag set</dt>
                <dd className="text-muted-foreground">
                  Point a label such as beta at a release.
                </dd>
              </div>
              <div>
                <dt className="font-mono text-xs">twext deprecate</dt>
                <dd className="text-muted-foreground">
                  Recommend a newer release without removing the old one.
                </dd>
              </div>
              <div>
                <dt className="font-mono text-xs">twext yank</dt>
                <dd className="text-muted-foreground">
                  Remove a broken release from the registry.
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="text-sm font-medium">Documentation</h2>
            <div className="mt-2 flex flex-col gap-2 text-sm">
              <ExternalLink
                href="https://github.com/twextjs/twext/blob/main/docs/cli.md"
                label="CLI reference"
              />
              <ExternalLink
                href="https://github.com/twextjs/twext/blob/main/docs/twexthub.md"
                label={`Publishing to ${product.name}`}
              />
              <ExternalLink
                href="https://github.com/twextjs/twext"
                label="Twext on GitHub"
              />
            </div>
          </section>
        </aside>
      </section>

      <section className="rounded-lg border bg-muted/30 p-5">
        <h2 className="text-base font-medium">Prefer to publish from CI?</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Create an automation token with the publish scope, then pass it to the
          CLI as an environment variable. Keep the token in your CI provider’s
          secret store, not in the repository.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Command value={TOKEN_CREATE} />
          <Command value={CI_PUBLISH} />
        </div>
      </section>
    </div>
  )
}

function GuideStep({
  step,
  title,
  description,
  children,
}: {
  step: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted/40 font-mono text-xs">
        {step}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="text-base font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    </section>
  )
}

function Command({ value, className }: { value: string; className?: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border bg-muted/40 p-1.5 pl-3 ${className ?? ""}`}
    >
      <code className="min-w-0 flex-1 font-mono text-xs break-words whitespace-pre-wrap">
        <span className="text-muted-foreground">$ </span>
        {value}
      </code>
      <CopyButton value={value} label="Copy command" size="icon-sm" />
    </div>
  )
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
    >
      {label} <ExternalLinkIcon className="size-3.5" />
    </a>
  )
}
