import { useState } from "react"
import {
  Link,
  Navigate,
  useNavigate,
  useRouteLoaderData,
  useSearchParams,
} from "react-router"

import type { MfaRequired } from "@twextjs/twexthubkit"

import { MfaForm } from "@/components/auth/mfa-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { usePageMeta } from "@/hooks/use-page-meta"
import { API_BASE_URL, errorMessage, th } from "@/lib/twexthub"

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard"
  }
  return value
}

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user, loading, signIn } = useAuth()
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

  const descriptor = useAsync((signal) => th.auth.describe({ signal }), [])
  const rootData = useRouteLoaderData("root") as
    { apiBaseUrl?: string } | undefined
  const apiBaseUrl = rootData?.apiBaseUrl ?? API_BASE_URL

  usePageMeta(
    adding ? "Add an account" : "Sign in",
    "Sign in to publish and manage TurboWarp extensions."
  )

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

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-8">
      <div>
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          TwextHub
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {adding ? "Add another account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {adding
            ? `@${user?.namespace ?? ""} stays signed in. Use the handle and password for the account you want to add.`
            : "Use the handle and password for your account."}
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
      ) : (
        <>
          {descriptor.data && !descriptor.data.passwordAuth ? (
            <p className="text-sm text-muted-foreground">
              This registry doesn’t accept passwords. Sign in with single
              sign-on instead.
            </p>
          ) : (
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
          )}

          {descriptor.data?.oidc ? (
            <>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>
              <Button
                variant="outline"
                onClick={() => void startOidc()}
                disabled={oidcPending}
              >
                {oidcPending ? "Redirecting…" : "Continue with single sign-on"}
              </Button>
            </>
          ) : null}
        </>
      )}

      <p className="text-sm text-muted-foreground">
        No account?{" "}
        <Link to="/signup" className="text-foreground hover:underline">
          Create one
        </Link>
        .
      </p>
    </div>
  )
}
