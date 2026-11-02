import { ScaleIcon } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import type { LegalDocument } from "@/lib/api"
import { ApiError } from "@/lib/api/errors"

import { ErrorState, LoadingRows } from "@/components/common/async-state"
import {
  CodeEditor,
  type CodeEditorHandle,
} from "@/components/common/code-editor"
import { Markdown } from "@/components/common/markdown"
import { Button } from "@/components/ui/button"
import { useAsync } from "@/hooks/use-async"
import { formatDate } from "@/lib/format"
import { adminKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/registry"

type LegalKind = "terms" | "privacy"

const LABELS: Record<LegalKind, string> = {
  terms: "Terms of service",
  privacy: "Privacy policy",
}

// A registry that has never published a document answers with 404. That is not
// an error for this tab: it is the empty document an admin is about to write.
async function loadDocument(
  kind: LegalKind,
  signal: AbortSignal
): Promise<LegalDocument | null> {
  try {
    return kind === "terms"
      ? await th.instance.terms({ signal })
      : await th.instance.privacy({ signal })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export function LegalTab() {
  const docs = useAsync(
    async (signal) => {
      const [terms, privacy] = await Promise.all([
        loadDocument("terms", signal),
        loadDocument("privacy", signal),
      ])
      return { terms, privacy }
    },
    [],
    adminKeys.legal
  )
  const [bodies, setBodies] = useState<{ terms?: string; privacy?: string }>({})
  const [editing, setEditing] = useState<LegalKind | null>(null)
  const [pending, setPending] = useState<LegalKind | null>(null)

  // Saving reads the editor itself: a keystroke and a click can land in the same
  // frame, and the editor is the only place that knows the final text.
  const termsHandle = useRef<CodeEditorHandle | null>(null)
  const privacyHandle = useRef<CodeEditorHandle | null>(null)
  const handles = { terms: termsHandle, privacy: privacyHandle }

  if (docs.status === "error") {
    return (
      <ErrorState
        message={docs.error ?? "We couldn’t load legal documents."}
        onRetry={docs.reload}
      />
    )
  }

  if (docs.status === "loading" || !docs.data) {
    return <LoadingRows rows={2} />
  }

  function cancel(kind: LegalKind) {
    setBodies((current) => ({ ...current, [kind]: undefined }))
    setEditing(null)
  }

  async function save(kind: LegalKind) {
    const body = handles[kind].current?.getValue() ?? ""
    if (!body.trim()) {
      toast.error(`${LABELS[kind]} can’t be empty.`)
      return
    }

    setPending(kind)
    try {
      if (kind === "terms") {
        await th.admin.updateTerms({ body })
      } else {
        await th.admin.updatePrivacy({ body })
      }
      toast.success(`${LABELS[kind]} updated.`)
      setBodies((current) => ({ ...current, [kind]: undefined }))
      setEditing(null)
      docs.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-medium">
          <ScaleIcon className="size-4" /> Legal documents
        </h2>
        <p className="text-sm text-muted-foreground">
          Both documents are markdown. Saving bumps the version, and accounts
          must accept it again before publishing.
        </p>
      </div>
      {(["terms", "privacy"] as const).map((kind) => {
        const doc = docs.data![kind]
        return (
          <LegalDocument
            key={kind}
            kind={kind}
            doc={doc}
            value={bodies[kind] ?? doc?.body ?? ""}
            editing={editing === kind}
            onEdit={() => setEditing(kind)}
            onCancel={() => cancel(kind)}
            onChange={(value) =>
              setBodies((current) => ({ ...current, [kind]: value }))
            }
            onSave={() => void save(kind)}
            handleRef={handles[kind]}
            saving={pending === kind}
            disabled={pending !== null}
          />
        )
      })}
    </section>
  )
}

function LegalDocument({
  kind,
  doc,
  value,
  editing,
  onEdit,
  onCancel,
  onChange,
  onSave,
  saving,
  disabled,
  handleRef,
}: {
  kind: LegalKind
  doc: LegalDocument | null
  value: string
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onChange: (value: string) => void
  onSave: () => void
  saving: boolean
  disabled: boolean
  handleRef: React.RefObject<CodeEditorHandle | null>
}) {
  return (
    <section
      aria-label={LABELS[kind]}
      className="flex flex-col gap-2 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{LABELS[kind]}</p>
        <div className="flex items-center gap-2">
          <p className="font-mono text-[11px] text-muted-foreground">
            {doc
              ? `v${doc.version} · updated ${formatDate(doc.updatedAt)}`
              : "Not published yet"}
          </p>
          {editing ? null : (
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <>
          <CodeEditor
            value={value}
            onChange={onChange}
            language="markdown"
            ariaLabel={`${kind} body`}
            readOnly={false}
            className="h-80"
            handleRef={handleRef}
          />
          <div className="flex items-center gap-2">
            <Button onClick={onSave} disabled={disabled}>
              {saving ? "Saving…" : `Update ${kind}`}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={disabled}>
              Cancel
            </Button>
          </div>
        </>
      ) : value.trim() ? (
        <div className="rounded-md border p-4">
          <Markdown>{value}</Markdown>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          This document is empty. Choose Edit to write it.
        </p>
      )}
    </section>
  )
}
