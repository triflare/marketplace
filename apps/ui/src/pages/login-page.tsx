import { useCallback, useEffect, useRef, useState } from "react"
import {
  Link,
  Navigate,
  useNavigate,
  useRouteLoaderData,
  useSearchParams,
} from "react-router"

import type { AuthMethod, MfaRequired, SessionResult } from "@/lib/api"

import { EmailSignInForm } from "@/components/auth/email-signin-form"
import { MfaForm } from "@/components/auth/mfa-form"
import { PasskeySignInForm } from "@/components/auth/passkey-signin-form"
import { ButtonLink } from "@/components/common/button-link"
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
  signInMethods,
} from "@/lib/auth-methods"
import { product } from "@/lib/product"
import { API_BASE_URL, errorMessage, th } from "@/lib/registry"

// The forms this page has, in the order it offers them. A driver that is
// advertised but not in this list is named in the copy instead of being given a
// form that could not finish.
type Pane = "password" | "passkey" | "email"

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard"
  }
  return value
}

function defaultPane(methods: AuthMethod[]): Pane | null {
  if (hasMethod(methods, "password")) return "password"
  if (hasMethod(methods, "passkey")) return "passkey"
  if (emailMethods(methods).length > 0) return "email"
  return null
}

function paneLabel(pane: Pane, methods: AuthMethod[]): string {
  if (pane === "password") return "Use a password"
  if (pane === "passkey") return "Use a passkey"
  return hasMethod(methods, "magic-link")
    ? "Email me a sign-in link"
    : "Email me a sign-in code"
}

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user, loading, signIn, acceptSession } = useAuth()
  const next = safeNext(params.get("next"))
  // Signing in from the account menu adds to the accounts this browser holds
  // instead of replacing the one in use.
  const adding = params.get("add") === "1"

  const [namespace, setNamespace] = useState("")
  const [password, setPassword] = useState("")
  const [challenge, setChallenge] = useState<MfaRequired | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [oidcPending, setOidcPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // Null until a method is picked, so the pane the method set implies can be
  // shown without this state overriding it.
  const [chosen, setChosen] = useState<Pane | null>(null)

  const descriptor = useAsync((signal) => th.auth.describe({ signal }), [])
  // Nothing is rendered until the method set is known: a form that is about to
  // be replaced would otherwise take a half-typed handle with it.
  const methods = descriptor.data ? signInMethods(descriptor.data) : null
  const pane = methods ? (chosen ?? defaultPane(methods)) : null
  const sso = Boolean(descriptor.data?.oidc)
  const devices = methods ? hasMethod(methods, "device-code") : false
  const registrationClosed = descriptor.data?.registration === "closed"
  const alternatives =
    methods && pane !== null
      ? (["password", "passkey", "email"] as const).filter(
          (candidate): candidate is Pane =>
            candidate !== pane &&
            (candidate === "password"
              ? hasMethod(methods, "password")
              : candidate === "passkey"
                ? hasMethod(methods, "passkey")
                : emailMethods(methods).length > 0)
        )
      : []

  const rootData = useRouteLoaderData("root") as
    { apiBaseUrl?: string } | undefined
  const apiBaseUrl = rootData?.apiBaseUrl ?? API_BASE_URL

  usePageMeta(
    adding ? "Add an account" : "Sign in",
    "Sign in to publish and manage TurboWarp extensions."
  )

  const finish = useCallback(
    (result: SessionResult) => {
      if ("mfaRequired" in result) {
        setChallenge(result)
        return
      }
      // Stops the signed-in redirect from racing the choice of session length:
      // this page navigates once the account is in hand.
      setSubmitted(true)
      acceptSession(result)
      navigate(`/stay-signed-in?next=${encodeURIComponent(next)}`)
    },
    [acceptSession, navigate, next]
  )

  // A link mailed by the registry lands back here with a one-time code, which
  // is traded for the session so the token never appears in a URL.
  const magicCode = params.get("magic_link_code")
  const exchanged = useRef(false)
  useEffect(() => {
    if (!magicCode || exchanged.current) {
      return
    }
    exchanged.current = true
    th.auth
      .exchangeMagicLink({ code: magicCode })
      .then(finish)
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }, [finish, magicCode])

  if (!loading && user && !submitted && !adding) {
    return <Navigate to={next} replace />
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setPending(true)
    setError(null)
    try {
      const result = await signIn({ namespace, password })
      if (result.kind === "mfa") {
        setChallenge(result.challenge)
        return
      }
      navigate(`/stay-signed-in?next=${encodeURIComponent(next)}`)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setPending(false)
    }
  }

  function startOidc() {
    setOidcPending(true)
    setError(null)
    // The provider flow is bound to a cookie the API sets on this navigation.
    // A top-level redirect keeps that cookie on the API's callback path; a
    // server-side fetch would lose it.
    const returnTo = `${window.location.origin}/oidc/callback`
    const query = new URLSearchParams({ returnTo }).toString()
    window.location.assign(`${apiBaseUrl}/auth/oidc/authorize?${query}`)
  }

  function pick(nextPane: Pane) {
    setChosen(nextPane)
    setError(null)
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-8">
      <div>
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          {product.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {adding ? "Add another account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {adding
            ? `@${user?.namespace ?? ""} stays signed in. Use the credentials for the account you want to add.`
            : "Sign in to publish and manage TurboWarp extensions."}
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
            navigate(`/stay-signed-in?next=${encodeURIComponent(next)}`)
          }
        />
      ) : !methods ? (
        descriptor.status === "error" ? (
          <div className="flex flex-col gap-3">
            <Alert variant="destructive">
              <AlertTitle>Sign-in options couldn’t load</AlertTitle>
              <AlertDescription>
                {descriptor.error ??
                  "We couldn’t ask the registry how to sign in."}
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
                <Label htmlFor="signin-namespace">Handle</Label>
                <Input
                  id="signin-namespace"
                  autoFocus
                  value={namespace}
                  onChange={(event) => setNamespace(event.target.value)}
                  autoComplete="username"
                  required
                  placeholder="your-name"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending
                  ? adding
                    ? "Adding…"
                    : "Signing in…"
                  : adding
                    ? "Add account"
                    : "Sign in"}
              </Button>
            </form>
          ) : pane === "passkey" ? (
            <PasskeySignInForm
              namespace={namespace}
              onNamespaceChange={setNamespace}
              onResult={finish}
            />
          ) : pane === "email" ? (
            <EmailSignInForm
              methods={emailMethods(methods)}
              mode="sign-in"
              next={next}
              onResult={finish}
            />
          ) : (
            <Alert>
              <AlertTitle>
                {methods.length > 0
                  ? "Use another sign-in method"
                  : "Sign-in is turned off"}
              </AlertTitle>
              <AlertDescription>
                {methods.length > 0
                  ? `This registry signs in with ${methodNames(methods)} instead of a password.`
                  : "This registry has no sign-in method enabled. Contact its administrator."}
              </AlertDescription>
            </Alert>
          )}

          {pane === null && devices ? (
            <ButtonLink variant="outline" to="/device">
              Approve a device code
            </ButtonLink>
          ) : null}

          {alternatives.length > 0 || sso ? (
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
                  onClick={() => pick(candidate)}
                >
                  {paneLabel(candidate, methods)}
                </Button>
              ))}
            </div>
          ) : null}

          {sso ? (
            <Button
              variant="outline"
              onClick={() => void startOidc()}
              disabled={oidcPending}
            >
              {oidcPending ? "Redirecting…" : "Continue with single sign-on"}
            </Button>
          ) : null}
        </>
      )}

      <p className="text-sm text-muted-foreground">
        {registrationClosed ? (
          <>No account? This registry isn’t accepting new ones.</>
        ) : (
          <>
            No account?{" "}
            <Link to="/signup" className="text-foreground hover:underline">
              Create one
            </Link>
            .
          </>
        )}
      </p>
    </div>
  )
}
