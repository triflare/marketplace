import { useState } from "react"
import { toast } from "sonner"

import { ErrorState } from "@/components/common/async-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAsync } from "@/hooks/use-async"
import { settingsKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/registry"

// The address the account's email sign-in methods hold. It is the registry's
// to report rather than the profile's to repeat, because only the drivers know
// which inbox a link or a code will reach.
export function EmailSection() {
  const email = useAsync(
    (signal) => th.auth.getEmail({ signal }),
    [],
    settingsKeys.email
  )
  const [busy, setBusy] = useState<"request" | "confirm" | null>(null)
  const [editing, setEditing] = useState(false)
  const [next, setNext] = useState("")
  // The address a code was just sent to, which is not the account's address
  // until the code comes back: the form is split over exactly that boundary.
  const [pending, setPending] = useState<string | null>(null)
  const [code, setCode] = useState("")

  function reset() {
    setEditing(false)
    setNext("")
    setPending(null)
    setCode("")
  }

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = next.trim()
    setBusy("request")
    try {
      await th.auth.requestEmailChange({ email: address })
      setPending(address)
      setCode("")
      toast.success("Confirmation code sent.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pending) {
      return
    }
    setBusy("confirm")
    try {
      await th.auth.confirmEmailChange({ email: pending, code: code.trim() })
      reset()
      email.reload()
      toast.success("Email address updated.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  if (email.status === "error") {
    return (
      <>
        <Separator />
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-medium">Email address</h2>
            <p className="text-sm text-muted-foreground">
              The address sign-in links and codes are sent to.
            </p>
          </div>
          <ErrorState
            message={email.error ?? "We couldn’t load your email address."}
            onRetry={email.reload}
          />
        </section>
      </>
    )
  }

  if (email.status === "loading" || !email.data) {
    return (
      <>
        <Separator />
        <Skeleton className="h-20 w-full" />
      </>
    )
  }

  // An account created with a password alone has no address for a mail-backed
  // method to use, and there is nothing here to show or change.
  if (!email.data.email) {
    return null
  }

  return (
    <>
      <Separator />
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Email address</h2>
          <p className="text-sm text-muted-foreground">
            {email.data.changeable
              ? "Used for sign-in links and codes. Changing it sends a confirmation code to the new address."
              : "Used for sign-in links and codes. This instance cannot deliver mail, so the address cannot be changed here."}
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-sm">{email.data.email}</p>
            {email.data.changeable && !editing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
              >
                Change email
              </Button>
            ) : null}
          </div>

          {editing ? (
            pending ? (
              <form
                onSubmit={confirm}
                className="flex flex-col gap-2 border-t pt-3"
              >
                <p className="text-sm text-muted-foreground">
                  We sent a six-digit code to{" "}
                  <span className="font-mono">{pending}</span>. Enter it to
                  finish the change.
                </p>
                <div className="flex max-w-xs flex-col gap-1.5">
                  <Label htmlFor="email-change-code">Code</Label>
                  <Input
                    id="email-change-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    autoFocus
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy !== null}>
                    {busy === "confirm" ? "Confirming…" : "Confirm email"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={reset}
                    disabled={busy !== null}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={requestCode}
                className="flex flex-col gap-2 border-t pt-3"
              >
                <div className="flex max-w-sm flex-col gap-1.5">
                  <Label htmlFor="email-change-address">
                    New email address
                  </Label>
                  <Input
                    id="email-change-address"
                    type="email"
                    autoComplete="email"
                    value={next}
                    onChange={(event) => setNext(event.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy !== null}>
                    {busy === "request" ? "Sending…" : "Send code"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={reset}
                    disabled={busy !== null}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )
          ) : null}
        </div>
      </section>
    </>
  )
}
