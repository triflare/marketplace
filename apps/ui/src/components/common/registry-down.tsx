import { RefreshCwIcon } from "lucide-react"
import { useState, useSyncExternalStore, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { product } from "@/lib/product"
import {
  isRegistryUnreachable,
  reportRegistryReachable,
  subscribeRegistryStatus,
} from "@/lib/registry-status"
import { th } from "@/lib/registry"

const SERVER_SNAPSHOT = () => false

/**
 * Replaces the routed page once the registry stops answering. A page that
 * cannot reach it has nothing to show and no way to recover, so the whole
 * screen becomes the one thing worth saying, with the one action worth taking.
 */
export function RegistryGate({ children }: { children: ReactNode }) {
  const unreachable = useSyncExternalStore(
    subscribeRegistryStatus,
    isRegistryUnreachable,
    SERVER_SNAPSHOT
  )

  if (!unreachable) {
    return <>{children}</>
  }

  return <RegistryDown />
}

function RegistryDown() {
  const [checking, setChecking] = useState(false)
  const [stillDown, setStillDown] = useState(false)

  async function check() {
    setChecking(true)
    setStillDown(false)
    try {
      // The cheapest call the registry answers without a token, so a retry
      // cannot be refused for a reason that has nothing to do with the outage.
      await th.instance.meta()
    } catch {
      setStillDown(true)
      setChecking(false)
      return
    }

    reportRegistryReachable()
    // The pages that failed already gave up on their own requests, so the
    // document is reloaded rather than left showing their error states.
    window.location.reload()
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {product.name}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {product.name} is down
      </h1>
      <p className="text-sm text-muted-foreground">
        The registry isn’t answering right now, so extension pages, search, and
        publishing can’t load. Nothing you did caused this, and everything
        already published is safe.
      </p>
      {stillDown ? (
        <p role="status" className="text-sm text-destructive">
          Still unreachable. Give it a moment, then try again.
        </p>
      ) : null}
      <Button onClick={() => void check()} disabled={checking}>
        <RefreshCwIcon /> {checking ? "Checking…" : "Try again"}
      </Button>
    </div>
  )
}
