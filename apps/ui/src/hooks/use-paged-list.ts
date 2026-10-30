import { useCallback, useEffect, useRef, useState } from "react"

import type { Page } from "@/lib/api"

import { usePreloaded } from "@/lib/preload"
import { cursorFrom, errorMessage } from "@/lib/registry"

interface PagedList<T> {
  items: T[]
  status: "loading" | "success" | "error"
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
  reload: () => void
  setItems: (items: T[]) => void
}

export function usePagedList<T>(
  load: (cursor: string | undefined, signal: AbortSignal) => Promise<Page<T>>,
  deps: ReadonlyArray<unknown>,
  key?: string
): PagedList<T> {
  const loader = useRef(load)
  const preloaded = usePreloaded(key) as Page<T> | undefined
  const initialCursor = preloaded
    ? (cursorFrom(preloaded._links.next) ?? null)
    : null

  const [items, setItems] = useState<T[]>(() => preloaded?.data ?? [])
  const [status, setStatus] = useState<PagedList<T>["status"]>(() =>
    preloaded ? "success" : "loading"
  )
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [bypassPreload, setBypassPreload] = useState(false)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    loader.current = load
  }, [load])

  useEffect(() => {
    if (!bypassPreload && key && preloaded) {
      // The route loader already returned the first page for this URL.
      /* eslint-disable react-hooks/set-state-in-effect */
      setItems(preloaded.data)
      setNextCursor(cursorFrom(preloaded._links.next) ?? null)
      setStatus("success")
      setError(null)
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }

    const current = ++generation.current
    controller.current?.abort()
    const activeController = new AbortController()
    controller.current = activeController

    // A new filter set starts a new cursor chain; keeping the old rows while
    // the next first page loads would show results for the wrong query.
    setStatus("loading")
    setError(null)
    setItems([])
    setNextCursor(null)

    loader
      .current(undefined, activeController.signal)
      .then((page) => {
        if (current !== generation.current) {
          return
        }
        setItems(page.data)
        setNextCursor(cursorFrom(page._links.next) ?? null)
        setStatus("success")
      })
      .catch((reason: unknown) => {
        if (
          current === generation.current &&
          !activeController.signal.aborted
        ) {
          setError(errorMessage(reason))
          setStatus("error")
        }
      })

    return () => {
      activeController.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt, key, preloaded, bypassPreload])

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) {
      return
    }

    const current = generation.current
    setLoadingMore(true)
    loader
      .current(nextCursor, new AbortController().signal)
      .then((page) => {
        if (current !== generation.current) {
          return
        }
        setItems((existing) => [...existing, ...page.data])
        setNextCursor(cursorFrom(page._links.next) ?? null)
      })
      .catch((reason: unknown) => {
        if (current === generation.current) {
          setError(errorMessage(reason))
        }
      })
      .finally(() => {
        if (current === generation.current) {
          setLoadingMore(false)
        }
      })
  }, [nextCursor, loadingMore])

  return {
    items,
    status,
    error,
    hasMore: nextCursor !== null,
    loadingMore,
    loadMore,
    reload: () => {
      setBypassPreload(true)
      setAttempt((value) => value + 1)
    },
    setItems,
  }
}
