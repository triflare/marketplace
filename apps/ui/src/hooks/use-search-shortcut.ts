import { useEffect, useRef } from "react"

// One document listener serves every search field on the page. Handlers are
// ranked so the most specific surface wins: the Explore filters beat the header
// search, and the header search beats nothing at all.
interface SearchHandler {
  id: symbol
  priority: number
  run: () => void
}

const handlers: SearchHandler[] = []
let listening = false

const TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
])

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }

  const tag = target.tagName
  if (tag === "TEXTAREA" || tag === "SELECT") {
    return true
  }
  if (tag !== "INPUT") {
    return false
  }

  return !TEXT_INPUT_TYPES.has((target as HTMLInputElement).type)
}

function handleKeyDown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.metaKey ||
    event.ctrlKey
  ) {
    return
  }

  // A slash is a normal character while typing, so only act outside fields.
  // Ctrl/Cmd+K belongs to the command palette, which listens separately.
  if (event.key !== "/" || isTextField(event.target)) {
    return
  }

  const handler = handlers.reduce<SearchHandler | null>(
    (best, entry) => (!best || entry.priority > best.priority ? entry : best),
    null
  )
  if (!handler) {
    return
  }

  event.preventDefault()
  handler.run()
}

/**
 * Focuses search with `/`. Later callers can pass a higher priority to claim
 * the shortcut on a page with its own search field.
 */
export function useSearchShortcut(run: () => void, priority = 0) {
  const latest = useRef(run)

  useEffect(() => {
    latest.current = run
  })

  useEffect(() => {
    const id = Symbol("search-shortcut")
    handlers.push({ id, priority, run: () => latest.current() })

    if (!listening) {
      document.addEventListener("keydown", handleKeyDown)
      listening = true
    }

    return () => {
      const index = handlers.findIndex((entry) => entry.id === id)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }, [priority])
}
