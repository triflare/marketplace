import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"

import type { MfaRequired } from "@/lib/api"

import { MfaForm } from "@/components/auth/mfa-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/auth"
import { usePageMeta } from "@/hooks/use-page-meta"
import { product } from "@/lib/product"
import { errorMessage, th } from "@/lib/registry"

export function OidcCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { acceptSession } = useAuth()
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  const [challenge, setChallenge] = useState<MfaRequired | null>(null)
  const started = useRef(false)

  usePageMeta("Signing in", `Finishing sign-in to ${product.name}.`)

  const oidcError = params.get("oidc_error")
  const code = params.get("oidc_code")
  const error = oidcError
    ? `The identity provider returned an error: ${oidcError}`
    : !code
      ? "This callback is missing its one-time code. Start signing in again."
      : exchangeError

  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true

    const linked = params.get("oidc_linked")
    if (linked) {
      navigate("/settings?tab=security", { replace: true })
      return
    }

    if (oidcError || !code) {
      return
    }

    th.auth
      .exchangeOidcCode({ code })
      .then((result) => {
        if ("mfaRequired" in result) {
          setChallenge(result)
          return
        }
        acceptSession(result)
        navigate("/stay-signed-in?next=%2Fdashboard", { replace: true })
      })
      .catch((reason: unknown) => setExchangeError(errorMessage(reason)))
  }, [acceptSession, code, navigate, oidcError, params])

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Finishing sign-in
      </h1>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : challenge ? (
        <MfaForm
          challenge={challenge}
          onSuccess={() =>
            navigate("/stay-signed-in?next=%2Fdashboard", { replace: true })
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      )}
    </div>
  )
}
