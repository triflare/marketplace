import { useState } from "react"
import { Link } from "react-router"

import type { AuthMethod, SessionResult } from "@/lib/api"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { API_ORIGIN, errorMessage, th } from "@/lib/registry"

// The two email drivers differ only in what the message carries: a link the
// reader opens, or a code they type. Both prove the address, and both create the
// account on first use when registration is open, so one form serves sign-in
// and sign-up.
export function EmailSignInForm({
  methods,
  mode,
  next,
  onResult,
  privacyVersion,
  disabled = false,
}: {
  methods: AuthMethod[]
  mode: "sign-in" | "sign-up"
  next: string
  onResult: (result: SessionResult) => void
  privacyVersion?: number
  disabled?: boolean
}) {
  const link = methods.find((method) => method.driver === "magic-link")
  const code = methods.find((method) => method.driver === "email-otp")

  const [email, setEmail] = useState("")
  const [sent, setSent] = useState<"link" | "code" | null>(null)
  const [value, setValue] = useState("")
  const [pending, setPending] = useState<"link" | "code" | "verify" | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)

  const address = email.trim()
  const signingUp = mode === "sign-up"
  const privacyOffered = privacyVersion !== undefined
  // Signing in is open to accounts that predate the policy, so the box is only
  // required when this request may create one.
  const privacyRequired = signingUp && privacyOffered

  async function send(kind: "link" | "code") {
    if (disabled) {
      return
    }
    if (address === "") {
      setError("Enter the email address to send it to.")
      return
    }
    if (privacyRequired && !acceptedPrivacy) {
      setError("Accept the privacy policy to create an account.")
      return
    }

    setPending(kind)
    setError(null)
    try {
      if (kind === "link") {
        // The link lands on the API, which sends the browser back here with a
        // one-time code. A page served from the API's own origin can ask for a
        // path; one on another origin has to name itself, which the instance
        // has to trust (the same list a passkey ceremony uses).
        const path = `/login?next=${encodeURIComponent(next)}`
        const origin = window.location.origin
        await th.auth.requestMagicLink({
          email: address,
          returnTo: origin === API_ORIGIN ? path : `${origin}${path}`,
          privacyAcceptedVersion: acceptedPrivacy ? privacyVersion : undefined,
        })
      } else {
        await th.auth.requestEmailCode({
          email: address,
          privacyAcceptedVersion: acceptedPrivacy ? privacyVersion : undefined,
        })
      }
      setSent(kind)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setPending(null)
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    setPending("verify")
    setError(null)
    try {
      onResult(
        await th.auth.verifyEmailCode({ email: address, code: value.trim() })
      )
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setPending(null)
    }
  }

  function reset() {
    setSent(null)
    setValue("")
    setError(null)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            {sent === "link"
              ? `We sent a sign-in link to ${address}. It works once and expires in 15 minutes.`
              : `We sent a six-digit code to ${address}. It works once and expires in 10 minutes.`}
            {signingUp
              ? " Your account is created the first time you use it."
              : ""}
          </AlertDescription>
        </Alert>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {sent === "code" ? (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signin-email-code">Code</Label>
              <Input
                id="signin-email-code"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                placeholder="123456"
                className="text-center font-mono text-lg tracking-[0.3em]"
              />
            </div>
            <Button type="submit" disabled={pending !== null}>
              {pending === "verify" ? "Checking…" : "Sign in"}
            </Button>
          </form>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void send(sent)}
            disabled={pending !== null || disabled}
          >
            {pending === sent
              ? "Sending…"
              : sent === "link"
                ? "Send another link"
                : "Send another code"}
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            Use a different address
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>

      {privacyOffered ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id="signup-email-privacy"
            checked={acceptedPrivacy}
            onCheckedChange={(checked) => setAcceptedPrivacy(checked === true)}
            disabled={disabled}
          />
          <label
            htmlFor="signup-email-privacy"
            className="text-xs text-muted-foreground"
          >
            I have read and agree to the{" "}
            <Link to="/privacy" className="text-foreground hover:underline">
              privacy policy
            </Link>
            .
            {!signingUp ? (
              <span className="block">
                Only needed when creating an account.
              </span>
            ) : null}
          </label>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        {link ? (
          <Button
            type="button"
            onClick={() => void send("link")}
            disabled={
              pending !== null ||
              disabled ||
              (privacyRequired && !acceptedPrivacy)
            }
          >
            {pending === "link" ? "Sending…" : "Email me a sign-in link"}
          </Button>
        ) : null}
        {code ? (
          <Button
            type="button"
            variant={link ? "outline" : "default"}
            onClick={() => void send("code")}
            disabled={
              pending !== null ||
              disabled ||
              (privacyRequired && !acceptedPrivacy)
            }
          >
            {pending === "code" ? "Sending…" : "Email me a sign-in code"}
          </Button>
        ) : null}
      </div>

      {signingUp ? (
        <p className="text-xs text-muted-foreground">
          An account is created the first time you sign in this way. There is no
          password to remember.
        </p>
      ) : null}
    </div>
  )
}
