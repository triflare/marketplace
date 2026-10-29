import { startAuthentication, startRegistration } from "@simplewebauthn/browser"
import {
  KeyRoundIcon,
  LaptopIcon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { CopyButton } from "@/components/common/copy-button"
import { ErrorState } from "@/components/common/async-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { formatDate, formatRelative } from "@/lib/format"
import { settingsKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/twexthub"

export function SecurityTab() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [passkeyLabel, setPasskeyLabel] = useState("")
  const [renamePasskeyId, setRenamePasskeyId] = useState<string | null>(null)
  const [renameLabel, setRenameLabel] = useState("")
  const [deletePasskeyId, setDeletePasskeyId] = useState<string | null>(null)
  const [revokeSessionId, setRevokeSessionId] = useState<string | null>(null)

  const mfa = useAsync(
    (signal) => th.auth.getMfaState({ signal }),
    [],
    settingsKeys.mfa
  )
  const sessions = useAsync(
    (signal) => th.sessions.list({ limit: 50, signal }),
    [],
    settingsKeys.sessions
  )
  const descriptor = useAsync(
    (signal) => th.auth.describe({ signal }),
    [],
    settingsKeys.auth
  )
  const identities = useAsync(
    async (signal) => {
      const auth = await th.auth.describe({ signal })
      if (!auth.oidc) {
        return null
      }
      const list = await th.auth.listOidcIdentities({ signal })
      return list.data
    },
    [],
    settingsKeys.identities
  )

  if (!user) {
    return null
  }

  async function addPasskey() {
    setBusy("passkey")
    try {
      const { options } = await th.auth.createPasskeyOptions()
      const response = await startRegistration({
        optionsJSON: options as never,
      })
      const result = await th.auth.registerPasskey({
        response: response as unknown as Record<string, unknown>,
        label: passkeyLabel.trim() || undefined,
      })
      setPasskeyLabel("")
      setBackupCodes(result.backupCodes)
      mfa.reload()
      toast.success("Passkey registered.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function renamePasskey(id: string) {
    const label = renameLabel.trim()
    if (!label) {
      return
    }
    setBusy("rename-passkey")
    try {
      await th.auth.renamePasskey(id, { label })
      setRenamePasskeyId(null)
      setRenameLabel("")
      mfa.reload()
      toast.success("Passkey renamed.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function removePasskey() {
    if (!deletePasskeyId) {
      return
    }
    setBusy("delete-passkey")
    try {
      await th.auth.deletePasskey(deletePasskeyId)
      setDeletePasskeyId(null)
      mfa.reload()
      toast.success("Passkey removed.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function reauthenticate() {
    setBusy("reauth")
    try {
      const { options } = await th.auth.getReauthOptions()
      const response = await startAuthentication({
        optionsJSON: options as never,
      })
      await th.auth.reauth({
        response: response as unknown as Record<string, unknown>,
      })
      toast.success("Recent sign-in confirmed.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function regenerateCodes() {
    setBusy("codes")
    try {
      const result = await th.auth.regenerateBackupCodes()
      setBackupCodes(result.backupCodes)
      mfa.reload()
      toast.success("New backup codes created.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get("new-password") ?? "")
    const confirm = String(form.get("confirm-password") ?? "")
    const currentPassword = String(form.get("current-password") ?? "")

    if (password !== confirm) {
      toast.error("The new passwords do not match.")
      return
    }

    setBusy("password")
    try {
      await th.users.update(user!.namespace, { password, currentPassword })
      toast.success("Password changed. Sign in again with the new one.")
      await signOut()
      navigate("/login")
    } catch (error) {
      toast.error(errorMessage(error))
      setBusy(null)
    }
  }

  async function revokeSession() {
    if (!revokeSessionId) {
      return
    }
    setBusy("revoke")
    try {
      await th.sessions.delete(revokeSessionId)
      setRevokeSessionId(null)
      sessions.reload()
      toast.success("Session revoked.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function unlinkIdentity(id: string) {
    setBusy(`identity-${id}`)
    try {
      await th.auth.deleteOidcIdentity(id)
      identities.reload()
      toast.success("Identity unlinked.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function linkIdentity() {
    setBusy("identity-link")
    try {
      const response = await fetch("/__oidc/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          returnTo: `${window.location.origin}/oidc/callback`,
        }),
      })
      const result = (await response.json()) as {
        authorizationUrl?: string
        detail?: string
        error?: string
      }
      if (!response.ok || !result.authorizationUrl) {
        throw new Error(
          result.detail ??
            result.error ??
            "The identity provider is unavailable."
        )
      }
      window.location.assign(result.authorizationUrl)
    } catch (error) {
      toast.error(errorMessage(error))
      setBusy(null)
    }
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Password</h2>
          <p className="text-sm text-muted-foreground">
            Changing the password revokes every existing token and session.
          </p>
        </div>
        <form
          onSubmit={changePassword}
          className="flex flex-col gap-3 rounded-lg border p-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">Confirm</Label>
              <Input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>
          <Button type="submit" className="self-start" disabled={busy !== null}>
            {busy === "password" ? "Saving…" : "Change password"}
          </Button>
        </form>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-medium">Passkeys and backup codes</h2>
            <p className="text-sm text-muted-foreground">
              A passkey turns on two-factor authentication for this account.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reauthenticate()}
            disabled={busy !== null}
          >
            <RefreshCwIcon /> Confirm it’s you
          </Button>
        </div>

        {mfa.status === "error" ? (
          <ErrorState
            message={mfa.error ?? "We couldn’t load your security settings."}
            onRetry={mfa.reload}
          />
        ) : mfa.status === "loading" || !mfa.data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                {mfa.data.enabled
                  ? `${mfa.data.passkeys.length} passkey${mfa.data.passkeys.length === 1 ? "" : "s"} · ${mfa.data.backupCodesRemaining} backup codes left`
                  : "Two-factor authentication is off. Add the first passkey to turn it on."}
              </p>
              {mfa.data.enabled ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void regenerateCodes()}
                  disabled={busy !== null}
                >
                  Regenerate codes
                </Button>
              ) : null}
            </div>

            {mfa.data.passkeys.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {mfa.data.passkeys.map((passkey) =>
                  renamePasskeyId === passkey.id ? (
                    <li key={passkey.id} className="px-3 py-2">
                      <form
                        className="flex flex-col gap-2 sm:flex-row sm:items-end"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void renamePasskey(passkey.id)
                        }}
                      >
                        <div className="flex flex-1 flex-col gap-1.5">
                          <Label htmlFor={`rename-passkey-${passkey.id}`}>
                            Passkey label
                          </Label>
                          <Input
                            id={`rename-passkey-${passkey.id}`}
                            value={renameLabel}
                            onChange={(event) =>
                              setRenameLabel(event.target.value)
                            }
                            maxLength={80}
                            autoFocus
                            required
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="submit"
                            size="sm"
                            disabled={
                              busy !== null || renameLabel.trim() === ""
                            }
                          >
                            {busy === "rename-passkey" ? "Saving…" : "Save"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setRenamePasskeyId(null)}
                            disabled={busy !== null}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </li>
                  ) : (
                    <li
                      key={passkey.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          {passkey.label || "Passkey"}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          added {formatDate(passkey.createdAt)}
                          {passkey.lastUsedAt
                            ? ` · last used ${formatRelative(passkey.lastUsedAt)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Rename passkey"
                          onClick={() => {
                            setRenamePasskeyId(passkey.id)
                            setRenameLabel(passkey.label ?? "")
                          }}
                          disabled={busy !== null}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove passkey"
                          onClick={() => setDeletePasskeyId(passkey.id)}
                          disabled={busy !== null}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </li>
                  )
                )}
              </ul>
            ) : null}

            <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="passkey-label">New passkey label</Label>
                <Input
                  id="passkey-label"
                  value={passkeyLabel}
                  onChange={(event) => setPasskeyLabel(event.target.value)}
                  placeholder="Laptop"
                  maxLength={80}
                />
              </div>
              <Button
                onClick={() => void addPasskey()}
                disabled={busy !== null}
              >
                <KeyRoundIcon />{" "}
                {busy === "passkey" ? "Waiting…" : "Add passkey"}
              </Button>
            </div>

            {backupCodes ? (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
                <p className="text-sm font-medium">
                  Save these backup codes now
                </p>
                <p className="text-xs text-muted-foreground">
                  They are shown once. Each code works a single time.
                </p>
                <div className="grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-5">
                  {backupCodes.map((code) => (
                    <span key={code}>{code}</span>
                  ))}
                </div>
                <CopyButton
                  value={backupCodes.join("\n")}
                  label="Copy codes"
                  className="self-start"
                />
              </div>
            ) : null}
          </div>
        )}
      </section>

      {descriptor.data?.oidc ? (
        <>
          <Separator />
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-medium">Linked identities</h2>
                <p className="text-sm text-muted-foreground">
                  Identities from {descriptor.data.oidc.issuer}.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void linkIdentity()}
                disabled={busy !== null}
              >
                {busy === "identity-link" ? "Redirecting…" : "Link identity"}
              </Button>
            </div>
            {identities.data === null ? null : identities.status === "error" ? (
              <ErrorState
                message={identities.error ?? "We couldn’t load identities."}
                onRetry={identities.reload}
              />
            ) : (
              <ul className="divide-y rounded-lg border">
                {(identities.data ?? []).map((identity) => (
                  <li
                    key={identity.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {identity.email ?? identity.subject}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {identity.issuer}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Unlink identity"
                      onClick={() => void unlinkIdentity(identity.id)}
                      disabled={busy !== null}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
                {(identities.data ?? []).length === 0 ? (
                  <li className="px-3 py-4 text-sm text-muted-foreground">
                    No linked identities.
                  </li>
                ) : null}
              </ul>
            )}
          </section>
        </>
      ) : null}

      <Separator />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Sessions</h2>
          <p className="text-sm text-muted-foreground">
            Browsers signed in with this account.
          </p>
        </div>
        {sessions.status === "error" ? (
          <ErrorState
            message={sessions.error ?? "We couldn’t load sessions."}
            onRetry={sessions.reload}
          />
        ) : sessions.status === "loading" ? (
          <Skeleton className="h-20 w-full" />
        ) : sessions.data && sessions.data.data.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {sessions.data.data.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <LaptopIcon className="size-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">
                      {session.id.slice(0, 12)}…
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      created {formatDate(session.createdAt)} · expires{" "}
                      {formatDate(session.expiresAt)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Revoke session"
                  onClick={() => setRevokeSessionId(session.id)}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        )}
      </section>

      <ConfirmDialog
        open={deletePasskeyId !== null}
        onOpenChange={(open) => !open && setDeletePasskeyId(null)}
        title="Remove this passkey?"
        description="Removing the last passkey turns MFA off and discards the backup codes."
        confirmLabel="Remove passkey"
        destructive
        pending={busy === "delete-passkey"}
        onConfirm={() => void removePasskey()}
      />
      <ConfirmDialog
        open={revokeSessionId !== null}
        onOpenChange={(open) => !open && setRevokeSessionId(null)}
        title="Revoke this session?"
        description="That browser will need to sign in again. This browser stays signed in."
        confirmLabel="Revoke"
        destructive
        pending={busy === "revoke"}
        onConfirm={() => void revokeSession()}
      />
    </div>
  )
}
