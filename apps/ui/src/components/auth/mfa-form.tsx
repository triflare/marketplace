import { startAuthentication } from "@simplewebauthn/browser"
import { KeyRoundIcon } from "lucide-react"
import { useState } from "react"

import type { AuthSession, MfaRequired } from "@/lib/api"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/context/auth"
import { errorMessage, th } from "@/lib/registry"

export function MfaForm({
  challenge,
  onSuccess,
}: {
  challenge: MfaRequired
  onSuccess: (session: AuthSession) => void
}) {
  const { completeMfa } = useAuth()
  const [backupCode, setBackupCode] = useState("")
  const [pending, setPending] = useState<"code" | "passkey" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasPasskey = challenge.methods.includes("passkey")

  async function submitCode(event: React.FormEvent) {
    event.preventDefault()
    setPending("code")
    setError(null)
    try {
      const session = await completeMfa({
        mfaToken: challenge.mfaToken,
        backupCode,
      })
      onSuccess(session)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setPending(null)
    }
  }

  async function passkeySignIn() {
    setPending("passkey")
    setError(null)
    try {
      const { options } = await th.auth.getSigninOptions({
        mfaToken: challenge.mfaToken,
      })
      const response = await startAuthentication({
        optionsJSON: options as never,
      })
      const session = await completeMfa({
        mfaToken: challenge.mfaToken,
        response: response as unknown as Record<string, unknown>,
      })
      onSuccess(session)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          This account needs a second factor before the session can be used.
        </p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {hasPasskey ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => void passkeySignIn()}
          disabled={pending !== null}
        >
          <KeyRoundIcon />{" "}
          {pending === "passkey" ? "Waiting for passkey…" : "Use a passkey"}
        </Button>
      ) : null}
      <form onSubmit={submitCode} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="backup-code">Backup code</Label>
          <Input
            id="backup-code"
            value={backupCode}
            onChange={(event) => setBackupCode(event.target.value)}
            autoComplete="one-time-code"
            required
          />
        </div>
        <Button type="submit" disabled={pending !== null}>
          {pending === "code" ? "Checking…" : "Continue"}
        </Button>
      </form>
    </div>
  )
}
