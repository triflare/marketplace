import { useState } from "react"
import { Link, Navigate, useNavigate } from "react-router"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/context/auth"
import { usePageMeta } from "@/hooks/use-page-meta"
import { product } from "@/lib/product"
import { errorMessage } from "@/lib/twexthub"

export function SignupPage() {
  const navigate = useNavigate()
  const { user, loading, signUp } = useAuth()
  const [namespace, setNamespace] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  usePageMeta(
    "Create an account",
    `Create a ${product.name} account to publish and manage TurboWarp extensions.`
  )

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
            Letters, numbers, dashes, and underscores. You can’t change this
            later.
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
      </form>

      <p className="text-sm text-muted-foreground">
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
