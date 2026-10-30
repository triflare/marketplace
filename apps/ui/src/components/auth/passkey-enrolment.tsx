import { startRegistration } from "@simplewebauthn/browser"
import { KeyRoundIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { WebAuthnOptions } from "@/lib/api"

import { CopyButton } from "@/components/common/copy-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { errorMessage, th } from "@/lib/registry"

// The step after a passwordless sign-up. The account exists and is signed in;
// a passkey is what makes signing in again possible without another email. It
// stays opt-in: not every device has an authenticator, and the same button
// lives in Settings → Security for anybody who skips it now.
export function PasskeyEnrolment({ onDone }: { onDone: () => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

  async function enrol() {
    setPending(true)
    setError(null)
    try {
      const { options } = await th.auth.createPasskeyOptions()
      const response = await startRegistration({
        optionsJSON: options as never,
      })
      const created = await th.auth.registerPasskey({
        response: response as unknown as WebAuthnOptions,
        label: "This device",
      })
      toast.success("Passkey added.")

      // The first passkey is what turns MFA on, and the codes that stand in for
      // it are shown exactly once — this is that once.
      if (created.backupCodes && created.backupCodes.length > 0) {
        setBackupCodes(created.backupCodes)
        return
      }
      onDone()
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name === "NotAllowedError"
          ? "The passkey prompt was dismissed or timed out. Try again."
          : errorMessage(reason)
      )
    } finally {
      setPending(false)
    }
  }

  if (backupCodes) {
    return (
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-medium">Save your backup codes</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Each code signs you in once if the passkey is unavailable. This is
            the only time they are shown.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <pre className="min-w-0 flex-1 rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {backupCodes.join("\n")}
          </pre>
          <CopyButton value={backupCodes.join("\n")} label="Copy" />
        </div>
        <Button onClick={onDone}>Continue</Button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Add a passkey?</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A passkey signs you in on this device without waiting for another
          email. You can add one later in Settings → Security.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button onClick={() => void enrol()} disabled={pending}>
          <KeyRoundIcon />
          {pending ? "Waiting for your passkey…" : "Create a passkey"}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Not now
        </Button>
      </div>
    </section>
  )
}
