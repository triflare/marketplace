import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { AutomationTokenCreated, TokenScope } from "@twextjs/twexthubkit"

import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { CopyButton } from "@/components/common/copy-button"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { formatDate } from "@/lib/format"
import { settingsKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/twexthub"

const SCOPES: Array<{ value: TokenScope; label: string; description: string }> =
  [
    { value: "publish", label: "publish", description: "Upload new versions." },
    {
      value: "yank",
      label: "yank",
      description: "Remove versions and extensions.",
    },
    {
      value: "read:source",
      label: "read:source",
      description: "Download retained source tarballs.",
    },
    {
      value: "manage:account",
      label: "manage:account",
      description: "Edit the account profile.",
    },
    {
      value: "manage:orgs",
      label: "manage:orgs",
      description: "Edit organizations and owners.",
    },
    {
      value: "manage:sessions",
      label: "manage:sessions",
      description: "List and revoke sessions.",
    },
    {
      value: "manage:tokens",
      label: "manage:tokens",
      description: "Create and revoke tokens.",
    },
    { value: "admin", label: "admin", description: "Instance administration." },
  ]

export function TokensTab() {
  const { isAdmin } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<TokenScope[]>(["publish"])
  const [expires, setExpires] = useState("30")
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<AutomationTokenCreated | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)

  const tokens = useAsync(
    (signal) => th.tokens.list({ limit: 50, signal }),
    [],
    settingsKeys.tokens
  )

  function toggleScope(scope: TokenScope, checked: boolean) {
    setScopes((current) =>
      checked ? [...current, scope] : current.filter((value) => value !== scope)
    )
  }

  async function createToken(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const result = await th.tokens.create({
        name: name.trim(),
        scopes,
        expiresInDays: expires ? Number(expires) : undefined,
      })
      setCreated(result)
      setCreateOpen(false)
      setName("")
      setScopes(["publish"])
      tokens.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function deleteToken() {
    if (!deleteTarget) {
      return
    }
    setPending(true)
    try {
      await th.tokens.delete(deleteTarget.id)
      setDeleteTarget(null)
      tokens.reload()
      toast.success("Token revoked.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Automation tokens</h2>
          <p className="text-sm text-muted-foreground">
            For scripts and CI. A token is shown once when it is created.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon /> New token
        </Button>
      </div>

      {tokens.status === "error" ? (
        <ErrorState
          message={tokens.error ?? "We couldn’t load tokens."}
          onRetry={tokens.reload}
        />
      ) : tokens.status === "loading" ? (
        <LoadingRows rows={3} />
      ) : tokens.data && tokens.data.data.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {tokens.data.data.map((token) => (
            <li
              key={token.id}
              className="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{token.name}</p>
                <p className="mt-0.5 flex flex-wrap gap-1">
                  {token.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded border px-1 font-mono text-[10px] text-muted-foreground"
                    >
                      {scope}
                    </span>
                  ))}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  created {formatDate(token.createdAt)}
                  {token.expiresAt
                    ? ` · expires ${formatDate(token.expiresAt)}`
                    : " · no expiry"}
                  {token.lastUsedAt
                    ? ` · last used ${formatDate(token.lastUsedAt)}`
                    : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Revoke ${token.name}`}
                onClick={() =>
                  setDeleteTarget({ id: token.id, name: token.name })
                }
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No tokens yet.
        </p>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New automation token</DialogTitle>
            <DialogDescription>
              Grant only the scopes a job needs. The secret is displayed once.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createToken} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                placeholder="Release workflow"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="token-expiry">Expires in days</Label>
              <Input
                id="token-expiry"
                type="number"
                min={1}
                value={expires}
                onChange={(event) => setExpires(event.target.value)}
                placeholder="Leave empty for no expiry"
              />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Scopes</legend>
              {SCOPES.map((scope) => {
                const disabled = scope.value === "admin" && !isAdmin
                return (
                  <label
                    key={scope.value}
                    className="flex items-start gap-2 text-sm has-disabled:opacity-50"
                  >
                    <Checkbox
                      checked={scopes.includes(scope.value)}
                      onCheckedChange={(checked) =>
                        toggleScope(scope.value, checked === true)
                      }
                      disabled={disabled}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-mono text-xs">{scope.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {scope.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </fieldset>
            <DialogFooter>
              <Button type="submit" disabled={pending || scopes.length === 0}>
                {pending ? "Creating…" : "Create token"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={created !== null}
        onOpenChange={(open) => !open && setCreated(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy the token now</DialogTitle>
            <DialogDescription>
              This is the only time the secret is available. Store it where the
              job can read it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">
              {created?.token}
            </code>
            <CopyButton value={created?.token ?? ""} />
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium">Next steps</p>
            <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4 text-xs text-muted-foreground">
              <li>
                Store it as a secret named{" "}
                <code className="font-mono">TWEXTHUB_TOKEN</code> in your CI.
              </li>
              <li>
                Send it as{" "}
                <code className="font-mono">Authorization: Bearer …</code> on
                each API request.
              </li>
              <li>
                Revoke it here if it leaks. Jobs using it stop working at once.
              </li>
            </ol>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Revoke “${deleteTarget?.name}”?`}
        description="Anything using it stops working immediately. This cannot be undone."
        confirmLabel="Revoke token"
        confirmPhrase={deleteTarget?.name}
        destructive
        pending={pending}
        onConfirm={() => void deleteToken()}
      />
    </div>
  )
}
