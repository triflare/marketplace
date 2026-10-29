// Every page leans on the registry, so "it is not answering" is a property of
// the app rather than of one request. The calls report what they saw here and
// the shell reacts once, instead of each page inventing its own wording for the
// same outage.
let unreachable = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

/**
 * A transport failure, or a status the registry only produces when the request
 * never got an answer: the kit keeps 0 for "never reached the server", and the
 * gateway forwards that, plus its own 502 while it cannot reach the registry.
 * A 4xx and a 500 are the registry answering, so they stay page-local errors.
 */
export function isUnreachableStatus(
  status: number | null | undefined
): boolean {
  return status === 0 || status === 502 || status === 503 || status === 504
}

export function subscribeRegistryStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isRegistryUnreachable(): boolean {
  return unreachable
}

export function reportRegistryUnreachable(): void {
  if (unreachable) {
    return
  }
  unreachable = true
  emit()
}

export function reportRegistryReachable(): void {
  if (!unreachable) {
    return
  }
  unreachable = false
  emit()
}
