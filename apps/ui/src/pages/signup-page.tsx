import { useState } from "react"
import { Link, Navigate, useNavigate } from "react-router"

import type { AuthMethod, MfaRequired, SessionResult } from "@/lib/api"

import { EmailSignInForm } from "@/components/auth/email-signin-form"
import { MfaForm } from "@/components/auth/mfa-form"
import { PasskeyEnrolment } from "@/components/auth/passkey-enrolment"
import { ButtonLink } from "@/components/common/button-link"
import { CopyButton } from "@/components/common/copy-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { usePageMeta } from "@/hooks/use-page-meta"
import {
  emailMethods,
  hasMethod,
  methodNames,
  registrationMethods,
  signInMethods,
} from "@/lib/auth-methods"
import { product } from "@/lib/product"
import { API_BASE_URL, errorMessage, th } from "@/lib/registry"

type Pane = "password" | "generated" | "email"

function defaultPane(methods: AuthMethod[]): Pane | null {
  if (hasMethod(methods, "password")) return "password"
  if (hasMethod(methods, "magic-password")) return "generated"
  if (emailMethods(methods).length > 0) return "email"
  return null
}

function paneLabel(pane: Pane, methods: AuthMethod[]): string {
  if (pane === "password") return "Create an account with a password"
  if (pane === "generated") return "Get a generated password"
  return hasMethod(methods, "magic-link")
    ? "Email me a sign-in link"
    : "Email me a sign-in code"
}

export function SignupPage() {
  const navigate = useNavigate()
  const { user, loading, signUp, acceptSession } = useAuth()
  const next = "/dashboard"
  const [namespace, setNamespace] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [challenge, setChallenge] = useState<MfaRequired | null>(null)
  const [chosen, setChosen] = useState<Pane | null>(null)
  const [generated, setGenerated] = useState<{
    namespace: string
    password: string
  } | null>(null)
  const [email, setEmail] = useState("")
  const [enrolling, setEnrolling] = useState(false)

  const descriptor = useAsync((signal) => th.auth.describe({ signal }), [])
  // Password registration is refused when the method set leaves the password
  // driver out, and each other pane is offered only while its driver is
  // advertised. Nothing renders until the set is known.
  const methods = descriptor.data ? registrationMethods(descriptor.data) : null
  const pane = methods ? (chosen ?? defaultPane(methods)) : null
  const sso = Boolean(descriptor.data?.oidc)
  // Closed means no form on this page can create an account, whatever the
  // method set says, so the page says that instead of offering one.
  const closed = descriptor.data?.registration === "closed"
  // A passkey is a second way in, not a way to register, so the enrolment step
  // follows a passwordless sign-up rather than standing in for one.
  const passkeyOffered = descriptor.data
    ? hasMethod(signInMethods(descriptor.data), "passkey")
    : false
  const alternatives =
    methods && pane !== null
      ? (["password", "generated", "email"] as const).filter(
          (candidate): candidate is Pane =>
            candidate !== pane &&
            (candidate === "password"
              ? hasMethod(methods, "password")
              : candidate === "generated"
                ? hasMethod(methods, "magic-password")
                : emailMethods(methods).length > 0)
        )
      : []

  usePageMeta(
    "Create an account",
    `Create a ${product.name} account to publish and manage TurboWarp extensions.`
  )

  function finish(result: SessionResult) {
    setSubmitted(true)
    if ("mfaRequired" in result) {
      setChallenge(result)
      return
    }
    acceptSession(result)
    if (passkeyOffered) {
      setEnrolling(true)
      return
    }
    navigate(`/stay-signed-in?next=${encodeURIComponent(next)}`)
  }

  // The generated password has been shown; the passkey offer is the next step
  // when the registry has one, and the session-length choice otherwise.
  function continueAfterSignup() {
    if (passkeyOffered) {
      setGenerated(null)
      setEnrolling(true)
      return
    }
    navigate(`/stay-signed-in?next=${encodeURIComponent(next)}`)
  }

  if (!loading && user && !submitted) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      setError("The passwords do not match.")
      return
    }

    setSubmitted(true)
    setPending(true)
    setError(null)
    try {
      await signUp({
        namespace: namespace.trim(),
        password,
        displayName: displayName.trim() || undefined,
      })
      navigate("/stay-signed-in?next=%2Fdashboard")
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setPending(false)
    }
  }

  async function handleGenerated(event: React.FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (address === "") {
      setError("Enter the email address to register with.")
      return
    }

    setSubmitted(true)
    setPending(true)
    setError(null)
    try {
      const result = await th.auth.registerWithGeneratedPassword({
        email: address,
      })
      acceptSession(result)
      setGenerated({
        namespace: result.user.namespace,
        password: result.password,
      })
    } catch (reason) {
      setSubmitted(false)
      setError(errorMessage(reason))
    } finally {
      setPending(false)
    }
  }

  function startOidc() {
    setError(null)
    const returnTo = `${window.location.origin}/oidc/callback`
    const query = new URLSearchParams({ returnTo }).toString()
    window.location.assign(`${API_BASE_URL}/auth/oidc/authorize?${query}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-8">
      <div>
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          {product.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Create an account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your handle becomes part of every extension link you publish.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {challenge ? (
        <MfaForm
          challenge={challenge}
          onSuccess={() =>
            navigate("/stay-signed-in?next=%2Fdashboard", { replace: true })
          }
        />
      ) : enrolling ? (
        <PasskeyEnrolment
          onDone={() =>
            navigate(`/stay-signed-in?next=${encodeURIComponent(next)}`)
          }
        />
      ) : closed ? (
        <div className="flex flex-col gap-3">
          <Alert>
            <AlertTitle>Registration is closed</AlertTitle>
            <AlertDescription>
              This registry isn’t accepting new accounts. If you already have
              one, sign in instead.
            </AlertDescription>
          </Alert>
          <ButtonLink to="/login">Go to sign in</ButtonLink>
        </div>
      ) : generated ? (
        <section className="flex flex-col gap-4 rounded-lg border p-4">
          <div>
            <h2 className="font-medium">Your generated password</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              This is the only time it is shown. Save it now — you sign in as{" "}
              <span className="font-mono">@{generated.namespace}</span> with it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm break-all">
              {generated.password}
            </code>
            <CopyButton value={generated.password} label="Copy password" />
          </div>
          <Button onClick={continueAfterSignup}>Continue</Button>
        </section>
      ) : !methods ? (
        descriptor.status === "error" ? (
          <div className="flex flex-col gap-3">
            <Alert variant="destructive">
              <AlertTitle>Registration options couldn’t load</AlertTitle>
              <AlertDescription>
                {descriptor.error ??
                  "We couldn’t ask the registry how to register."}
              </AlertDescription>
            </Alert>
            <Button variant="outline" onClick={descriptor.reload}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )
      ) : (
        <>
          {pane === "password" ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-namespace">Handle</Label>
                <Input
                  id="signup-namespace"
                  autoFocus
                  value={namespace}
                  onChange={(event) => setNamespace(event.target.value)}
                  autoComplete="username"
                  required
                  pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]*"
                  placeholder="your-name"
                />
                <p className="text-xs text-muted-foreground">
                  Letters, numbers, dashes, and underscores. You can’t change
                  this later.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-display-name">Display name</Label>
                <Input
                  id="signup-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="nickname"
                  maxLength={80}
                  placeholder="Optional"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-confirm">Confirm password</Label>
                <Input
                  id="signup-confirm"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating account…" : "Create account"}
              </Button>
              <p className="text-xs text-muted-foreground">
                By creating an account you agree to the{" "}
                <Link to="/terms" className="text-foreground hover:underline">
                  terms
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="text-foreground hover:underline">
                  privacy policy
                </Link>
                .
              </p>
            </form>
          ) : pane === "generated" ? (
            <form onSubmit={handleGenerated} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating account…" : "Create account"}
              </Button>
              <p className="text-xs text-muted-foreground">
                The registry generates a password and shows it once. Keep it
                somewhere safe: it is how you sign in.
              </p>
            </form>
          ) : pane === "email" ? (
            <EmailSignInForm
              methods={emailMethods(methods)}
              mode="sign-up"
              next={next}
              onResult={finish}
            />
          ) : (
            <Alert>
              <AlertTitle>
                {methods.length > 0
                  ? "Accounts are created by signing in"
                  : "Registration is turned off"}
              </AlertTitle>
              <AlertDescription>
                {methods.length > 0
                  ? `This registry doesn’t take passwords here. Sign in with ${methodNames(methods)} and your account is created on the first visit.`
                  : "This registry isn’t accepting new accounts. Contact its administrator."}
              </AlertDescription>
            </Alert>
          )}

          {pane === null ? (
            <ButtonLink to="/login">Go to sign in</ButtonLink>
          ) : null}

          {alternatives.length > 0 || (sso && pane !== null) ? (
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
          ) : null}

          {alternatives.length > 0 ? (
            <div className="flex flex-col gap-2">
              {alternatives.map((candidate) => (
                <Button
                  key={candidate}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setChosen(candidate)
                    setError(null)
                  }}
                >
                  {paneLabel(candidate, methods)}
                </Button>
              ))}
            </div>
          ) : null}

          {sso ? (
            <Button variant="outline" onClick={startOidc}>
              Continue with single sign-on
            </Button>
          ) : null}
        </>
      )}

      <p className="text-sm text-muted-foreground">
        Already registered?{" "}
        <Link to="/login" className="text-foreground hover:underline">
          Sign in
        </Link>
        .
      </p>
    </div>
  )
}
