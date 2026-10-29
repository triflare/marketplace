import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  MonitorSmartphoneIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"

import { ButtonLink } from "@/components/common/button-link"
import { UserAvatar } from "@/components/common/user-avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { usePageMeta } from "@/hooks/use-page-meta"
import { product } from "@/lib/product"
import { formatRelative } from "@/lib/format"
import { deviceAuth, errorMessage } from "@/lib/twexthub"

const CODE_LENGTH = 8

function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH)
}

function formatCode(value: string): string {
  return value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4)}` : value
}

function codeFromParams(params: URLSearchParams): string {
  const raw = params.get("user_code") ?? params.get("code") ?? ""
  return normalizeCode(raw)
}

export function DevicePage() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const fromQuery = codeFromParams(params)
  const [code, setCode] = useState(formatCode(fromQuery))
  const [activeCode, setActiveCode] = useState(
    fromQuery.length === CODE_LENGTH ? fromQuery : null
  )
  const [pending, setPending] = useState<"approve" | "deny" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<"approved" | "denied" | null>(null)

  usePageMeta(
    "Device activation",
    "Approve a Twext CLI sign-in from your browser."
  )

  const lookup = useAsync(
    async (signal) => {
      if (!user || !activeCode) {
        return null
      }
      return deviceAuth.lookup(activeCode, { signal })
    },
    [user?.namespace, activeCode]
  )

  const next = `/device?user_code=${encodeURIComponent(
    activeCode ? formatCode(activeCode) : code
  )}`
  const signInHref = `/login?next=${encodeURIComponent(next)}`

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const normalized = normalizeCode(code)
    if (normalized.length !== CODE_LENGTH) {
      setError("Enter the eight-character code shown by the CLI.")
      return
    }

    setError(null)
    setDone(null)
    setActiveCode(normalized)
    setCode(formatCode(normalized))

    if (!user) {
      navigate(
        `/login?next=${encodeURIComponent(
          `/device?user_code=${formatCode(normalized)}`
        )}`
      )
    }
  }

  function reset() {
    setCode("")
    setActiveCode(null)
    setError(null)
    setDone(null)
  }

  async function approve() {
    if (!activeCode) {
      return
    }
    setPending("approve")
    setError(null)
    try {
      await deviceAuth.approve(activeCode)
      setDone("approved")
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setPending(null)
    }
  }

  async function deny() {
    if (!activeCode) {
      return
    }
    setPending("deny")
    setError(null)
    try {
      await deviceAuth.deny(activeCode)
      setDone("denied")
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-8">
      <div className="text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl border bg-muted/40">
          <MonitorSmartphoneIcon className="size-5" />
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Device activation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve a sign-in from the Twext CLI. The code is shown in your
          terminal.
        </p>
      </div>

      {done ? (
        <DeviceResult kind={done} onReset={reset} />
      ) : loading ? (
        <div className="flex flex-col gap-2 rounded-lg border p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : activeCode && !user ? (
        <section className="flex flex-col gap-4 rounded-lg border p-5">
          <div className="flex items-start gap-3">
            <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="font-medium">Sign in to continue</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                You need an account on this registry to approve the code.
              </p>
            </div>
          </div>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-center font-mono text-lg tracking-[0.2em]">
            {formatCode(activeCode)}
          </p>
          <ButtonLink to={signInHref} className="w-full">
            Sign in and continue
          </ButtonLink>
          <Button variant="ghost" onClick={reset}>
            <ArrowLeftIcon /> Use a different code
          </Button>
        </section>
      ) : activeCode && user ? (
        <section className="flex flex-col gap-4 rounded-lg border p-5">
          {lookup.status === "loading" ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : lookup.status === "error" ? (
            <>
              <Alert variant="destructive">
                <AlertTitle>That code can’t be used</AlertTitle>
                <AlertDescription>
                  {lookup.statusCode === 404
                    ? "The code is not valid or has expired. Check the terminal and try again."
                    : (lookup.error ?? "We couldn’t check that code.")}
                </AlertDescription>
              </Alert>
              {lookup.statusCode === 401 ? (
                <ButtonLink to={signInHref}>Sign in again</ButtonLink>
              ) : null}
              <Button variant="outline" onClick={reset}>
                Use a different code
              </Button>
            </>
          ) : lookup.data?.denied ? (
            <DeviceResult kind="denied" onReset={reset} />
          ) : lookup.data?.approved ? (
            <DeviceResult kind="approved" onReset={reset} />
          ) : lookup.data ? (
            <>
              <div className="flex items-start gap-3">
                <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <h2 className="font-medium">
                    Authorize {lookup.data.clientName}?
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    This device will be signed in to your account until the
                    session expires or you revoke it.
                  </p>
                </div>
              </div>

              <dl className="divide-y rounded-md border text-sm">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-muted-foreground">Device</dt>
                  <dd className="text-right font-medium">
                    {lookup.data.clientName}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-muted-foreground">Code</dt>
                  <dd className="font-mono tracking-[0.15em]">
                    {formatCode(activeCode)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-muted-foreground">Account</dt>
                  <dd className="flex min-w-0 items-center gap-2">
                    <UserAvatar
                      name={user.displayName}
                      src={user.avatarUrl}
                      size="sm"
                    />
                    <span className="truncate font-mono text-xs">
                      @{user.namespace}
                    </span>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd>{formatRelative(lookup.data.expiresAt)}</dd>
                </div>
              </dl>

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>We couldn’t approve it</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => void approve()}
                  disabled={pending !== null}
                >
                  <CheckCircle2Icon />
                  {pending === "approve" ? "Authorizing…" : "Authorize device"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void deny()}
                  disabled={pending !== null}
                >
                  <XCircleIcon />{" "}
                  {pending === "deny" ? "Cancelling…" : "Cancel"}
                </Button>
              </div>
            </>
          ) : null}
        </section>
      ) : (
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-lg border p-5"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="device-code">Code</Label>
            <Input
              id="device-code"
              value={code}
              onChange={(event) =>
                setCode(formatCode(normalizeCode(event.target.value)))
              }
              autoFocus
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              maxLength={9}
              placeholder="ABCD-EFGH"
              className="h-11 text-center font-mono text-lg tracking-[0.25em]"
            />
            <p className="text-xs text-muted-foreground">
              Enter the code exactly as the CLI shows it.
            </p>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Check the code</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" className="w-full">
            Continue
          </Button>
          {!user ? (
            <p className="text-center text-xs text-muted-foreground">
              You’ll sign in after entering the code.
            </p>
          ) : null}
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">
              Back to {product.name}
            </Link>
          </p>
        </form>
      )}
    </div>
  )
}

function DeviceResult({
  kind,
  onReset,
}: {
  kind: "approved" | "denied"
  onReset: () => void
}) {
  const approved = kind === "approved"

  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-4 rounded-lg border p-5"
    >
      <div className="flex items-start gap-3">
        {approved ? (
          <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        ) : (
          <XCircleIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        )}
        <div>
          <h2 className="font-medium">
            {approved ? "Device authorized" : "Sign-in declined"}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {approved
              ? "You can close this page and return to the terminal."
              : "The CLI has been told not to sign in. You can close this page."}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-xs text-muted-foreground">
        {approved ? (
          <p>
            Next: return to the terminal, then review every device that can act
            as you in Settings → Security.
          </p>
        ) : (
          <p>
            The CLI will ask for a new code. Nothing else is needed on this
            page.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {approved ? (
          <>
            <ButtonLink to="/dashboard">Go to dashboard</ButtonLink>
            <ButtonLink variant="outline" to="/settings?tab=security">
              Review devices
            </ButtonLink>
          </>
        ) : null}
        <Button variant="ghost" onClick={onReset}>
          Approve another device
        </Button>
      </div>
    </section>
  )
}
