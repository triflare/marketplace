import { useEffect, useRef, useState } from "react"

import { ApiError } from "@/lib/api/errors"

import { usePreloaded } from "@/lib/preload"
import { errorMessage } from "@/lib/registry"

type AsyncStatus = "loading" | "success" | "error"

export interface AsyncResult<T> {
  status: AsyncStatus
  data: T | null
  error: string | null
  statusCode?: number
  reload: () => void
}

export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
  key?: string
): AsyncResult<T> {
  const loader = useRef(load)
  const preloaded = usePreloaded(key) as T | undefined
  const [attempt, setAttempt] = useState(0)
  const [bypassPreload, setBypassPreload] = useState(false)
  const [state, setState] = useState<Omit<AsyncResult<T>, "reload">>(() =>
    key && preloaded !== undefined
      ? { status: "success", data: preloaded, error: null }
      : { status: "loading", data: null, error: null }
  )

  useEffect(() => {
    loader.current = load
  }, [load])

  useEffect(() => {
    if (!bypassPreload && key && preloaded !== undefined) {
      // The route loader already fetched this for the current URL, including
      // on client navigations, so rendering it again would duplicate the call.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "success", data: preloaded, error: null })
      return
    }

    const controller = new AbortController()
    let current = true

    // Clear stale results as soon as the dependency set changes, before the
    // replacement request settles. The request itself is the external system
    // this effect talks to, so the reset belongs here.
    setState((previous) => ({
      status: "loading",
      data: previous.data,
      error: null,
    }))

    loader
      .current(controller.signal)
      .then((data) => {
        if (current) {
          setState({ status: "success", data, error: null })
        }
      })
      .catch((error: unknown) => {
        if (current && !controller.signal.aborted) {
          setState({
            status: "error",
            data: null,
            error: errorMessage(error),
            statusCode: error instanceof ApiError ? error.status : undefined,
          })
        }
      })

    return () => {
      current = false
      controller.abort()
    }
    // The caller owns the dependency list, mirroring how the request is built.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt, key, preloaded, bypassPreload])

  return {
    ...state,
    reload: () => {
      setBypassPreload(true)
      setAttempt((value) => value + 1)
    },
  }
}
