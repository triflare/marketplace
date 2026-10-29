import { useState } from "react"
import { toast } from "sonner"

import { EmptyState, ErrorState } from "@/components/common/async-state"
import { Markdown } from "@/components/common/markdown"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { formatDate } from "@/lib/format"
import { legalKey } from "@/lib/preload"
import { errorMessage, th } from "@/lib/twexthub"

export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const { user, refresh } = useAuth()
  const [accepting, setAccepting] = useState(false)

  const document = useAsync(
    (signal) =>
      kind === "terms"
        ? th.instance.terms({ signal })
        : th.instance.privacy({ signal }),
    [kind],
    legalKey(kind)
  )

  const needsAcceptance =
    kind === "terms" &&
    user &&
    document.data &&
    String(user.termsAcceptedVersion ?? "") !== String(document.data.version)

  async function acceptTerms() {
    if (!user || !document.data) {
      return
    }

    setAccepting(true)
    try {
      await th.users.update(user.namespace, {
        termsAcceptedVersion: document.data.version,
      })
      await refresh()
      toast.success("Terms accepted.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setAccepting(false)
    }
  }

  const title = kind === "terms" ? "Terms of Service" : "Privacy Policy"
  const missing = document.statusCode === 404

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow="Legal"
        title={title}
        description="Published by the registry that runs this site."
      />

      {missing ? (
        <EmptyState
          title={`No ${kind} document`}
          description={`This registry doesn’t publish a ${kind} document.`}
        />
      ) : document.status === "error" ? (
        <ErrorState
          message={document.error ?? "We couldn’t load the document."}
          onRetry={document.reload}
        />
      ) : document.status === "loading" || !document.data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="font-mono">Version {document.data.version}</span>
            <span>Updated {formatDate(document.data.updatedAt)}</span>
          </div>
          <article className="rounded-lg border p-5">
            <Markdown>{document.data.body}</Markdown>
          </article>
          {needsAcceptance ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <p className="text-sm">
                This account has not accepted version {document.data.version}{" "}
                yet. Publishing and organization changes are gated until it
                does.
              </p>
              <Button onClick={() => void acceptTerms()} disabled={accepting}>
                {accepting ? "Saving…" : "Accept terms"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
