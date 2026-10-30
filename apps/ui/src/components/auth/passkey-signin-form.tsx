import { startAuthentication } from "@simplewebauthn/browser"
import { KeyRoundIcon } from "lucide-react"
import { useState } from "react"

import type { SessionResult, WebAuthnOptions } from "@/lib/api"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage, th } from "@/lib/registry"

// Signing in with a passkey is one ceremony: the handle names the account, the
// server hands out a challenge, and the authenticator's assertion finishes it.
// The handle is shared with the password form, so switching methods mid-form
// does not lose what was typed.
export function PasskeySignInForm({
  namespace,
  onNamespaceChange,
  onResult,
}: {
  namespace: string
  onNamespaceChange: (value: string) => void
  onResult: (result: SessionResult) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const handle = namespace.trim()
    if (handle === "") {
      setError("Enter the handle for your account.")
      return
    }

    setPending(true)
    setError(null)
    try {
      const { flowToken, options } = await th.auth.createPasskeySigninOptions({
        namespace: handle,
      })
      // The browser prompt runs against the challenge the server just minted;
      // nothing leaves the page but the signed assertion.
      const response = await startAuthentication({
        optionsJSON: options as never,
      })
      const result = await th.auth.verifyPasskeySignin({
        flowToken,
        response: response as unknown as WebAuthnOptions,
      })
      onResult(result)
    } catch (reason) {
      // A dismissed or timed-out prompt is not a failure the server saw, and
      // its own wording ("the operation either timed out or was not allowed")
      // reads like a bug.
      setError(
        reason instanceof Error && reason.name === "NotAllowedError"
          ? "The passkey prompt was dismissed or timed out. Try again."
          : errorMessage(reason)
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signin-passkey-namespace">Handle</Label>
        <Input
          id="signin-passkey-namespace"
          autoFocus
          value={namespace}
          onChange={(event) => onNamespaceChange(event.target.value)}
          autoComplete="username webauthn"
          required
          placeholder="your-name"
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending}>
        <KeyRoundIcon />
        {pending ? "Waiting for your passkey…" : "Use a passkey"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Your browser will ask for the passkey saved for this site.
      </p>
    </form>
  )
}
