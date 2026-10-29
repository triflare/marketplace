import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { ExtensionDetail } from "@twextjs/twexthubkit"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAsync } from "@/hooks/use-async"
import { manageKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/twexthub"

export function TagsTab({ extension }: { extension: ExtensionDetail }) {
  const [tag, setTag] = useState("")
  const [version, setVersion] = useState(extension.version)
  const [pending, setPending] = useState(false)
  const [deleteTag, setDeleteTag] = useState<string | null>(null)

  const tags = useAsync(
    (signal) =>
      th.extensions.tags.get(extension.namespace, extension.id, { signal }),
    [extension.namespace, extension.id],
    manageKeys.tags(extension.namespace, extension.id)
  )

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await th.extensions.tags.set(
        extension.namespace,
        extension.id,
        tag.trim(),
        version.trim()
      )
      setTag("")
      tags.reload()
      toast.success("Label saved.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (!deleteTag) {
      return
    }
    setPending(true)
    try {
      await th.extensions.tags.delete(
        extension.namespace,
        extension.id,
        deleteTag
      )
      setDeleteTag(null)
      tags.reload()
      toast.success("Label removed.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Version labels</h2>
        <p className="text-sm text-muted-foreground">
          Labels point to a release so people can install a named version such
          as <span className="font-mono">beta</span>. The{" "}
          <span className="font-mono">latest</span> label is maintained
          automatically.
        </p>
      </div>

      {tags.status === "error" ? (
        <ErrorState
          message={tags.error ?? "We couldn’t load version labels."}
          onRetry={tags.reload}
        />
      ) : tags.status === "loading" || !tags.data ? (
        <LoadingRows rows={2} />
      ) : Object.keys(tags.data).length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No version labels yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {Object.entries(tags.data).map(([name, target]) => (
            <li
              key={name}
              className="flex items-center justify-between gap-2 px-4 py-2.5"
            >
              <span className="font-mono text-sm">
                {name} <span className="text-muted-foreground">→</span> {target}
              </span>
              {name === "latest" ? (
                <span className="text-[11px] text-muted-foreground">
                  automatic
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name} label`}
                  onClick={() => setDeleteTag(name)}
                >
                  <Trash2Icon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={save}
        className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          {" "}
          <Label htmlFor="tag-name">Label</Label>
          <Input
            id="tag-name"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            required
            placeholder="beta"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          {" "}
          <Label htmlFor="tag-version">Release</Label>
          <Input
            id="tag-version"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            required
            placeholder="1.2.0"
          />
        </div>
        <Button type="submit" disabled={pending}>
          <PlusIcon /> {pending ? "Saving…" : "Set label"}
        </Button>
      </form>

      <ConfirmDialog
        open={deleteTag !== null}
        onOpenChange={(open) => !open && setDeleteTag(null)}
        title={`Remove the ${deleteTag} label?`}
        description="The release stays available; only the label is removed."
        confirmLabel="Remove label"
        destructive
        pending={pending}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
