import { useSyncExternalStore } from "react"

import type { ExtensionSummary } from "@twextjs/twexthubkit"

const STORAGE_KEY = "twexthub.saved"

export interface SavedExtension extends ExtensionSummary {
  savedAt: string
}

type Listener = () => void

const listeners = new Set<Listener>()
let saved: SavedExtension[] = typeof window === "undefined" ? [] : readStorage()

function readStorage(): SavedExtension[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isSavedExtension)
  } catch {
    return []
  }
}

function isSavedExtension(value: unknown): value is SavedExtension {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<SavedExtension>
  return (
    typeof candidate.namespace === "string" && typeof candidate.id === "string"
  )
}

function publish(next: SavedExtension[]) {
  saved = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  for (const listener of listeners) {
    listener()
  }
}

export function isSaved(namespace: string, id: string): boolean {
  return saved.some((entry) => entry.namespace === namespace && entry.id === id)
}

export function toggleSaved(extension: ExtensionSummary): boolean {
  if (isSaved(extension.namespace, extension.id)) {
    publish(
      saved.filter(
        (entry) =>
          !(
            entry.namespace === extension.namespace && entry.id === extension.id
          )
      )
    )
    return false
  }

  publish([{ ...extension, savedAt: new Date().toISOString() }, ...saved])
  return true
}

export function removeSaved(namespace: string, id: string): void {
  publish(
    saved.filter((entry) => !(entry.namespace === namespace && entry.id === id))
  )
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): SavedExtension[] {
  return saved
}

export function useSaved(): SavedExtension[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
