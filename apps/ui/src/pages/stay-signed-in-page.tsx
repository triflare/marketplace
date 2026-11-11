import { useState } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth"
import { usePageMeta } from "@/hooks/use-page-meta"
import { product } from "@/lib/product"
import { errorMessage } from "@/lib/registry"
import { safeReturnPath } from "@/lib/return-path"

export function StaySignedInPage() {
  const { user, loading, remember } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [leaving, setLeaving] = useState(false)

  usePageMeta(
    "Stay signed in",
    "Choose how long this browser keeps you signed in."
  )

  const next = safeReturnPath(params.get("next"))

  if (loading) {
    return null
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  async function choose(stay: boolean) {
    setLeaving(true)
    try {
      await remember(stay)
      navigate(next, { replace: true })
    } catch (error) {
      setLeaving(false)
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-12">
      <div className="flex items-center gap-2">
        <img
          src="/assets/icon-light.svg"
          alt=""
          aria-hidden="true"
          className="h-8 w-auto dark:hidden"
        />
        <img
          src="/assets/icon-dark.svg"
          alt=""
          aria-hidden="true"
          className="hidden h-8 w-auto dark:block"
        />
        <span className="text-sm font-semibold tracking-tight">
          {product.name}
        </span>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Stay signed in?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose whether this browser should keep the session after you close
          the tab.
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <UserAvatar name={user.displayName} src={user.avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-medium">{user.displayName}</p>
          <p className="font-mono text-xs text-muted-foreground">
            @{user.namespace}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button onClick={() => choose(true)} disabled={leaving}>
          Yes, stay signed in
        </Button>
        <Button
          variant="outline"
          onClick={() => choose(false)}
          disabled={leaving}
        >
          No, only this tab
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Staying signed in keeps you signed in after you close this tab. Choosing
        not to signs you out when you close or reload it.
      </p>
    </div>
  )
}
