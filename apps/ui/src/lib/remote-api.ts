import type TwextHubKit from "@twextjs/twexthubkit"
import { TwextHubError } from "@twextjs/twexthubkit"

import {
  isUnreachableStatus,
  reportRegistryReachable,
  reportRegistryUnreachable,
} from "@/lib/registry-status"
import {
  RPC_PATH,
  decodeValue,
  encodeArgs,
  type RpcFailure,
  type RpcSuccess,
} from "@/lib/rpc"

function findSignal(args: unknown[]): AbortSignal | undefined {
  for (const arg of args) {
    if (arg === null || typeof arg !== "object") {
      continue
    }
    const signal = (arg as { signal?: unknown }).signal
    if (signal instanceof AbortSignal) {
      return signal
    }
  }
  return undefined
}

async function callApi(path: string[], args: unknown[]): Promise<unknown> {
  const signal = findSignal(args)
  let response: Response
  try {
    response = await fetch(RPC_PATH, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ path, args: await encodeArgs(args) }),
      signal,
      credentials: "same-origin",
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error
    }
    // The call never left the browser, which is the same outage to the person
    // waiting for the page.
    reportRegistryUnreachable()
    throw new TwextHubError("We couldn’t reach TwextHub. Try again.", {
      status: 502,
    })
  }

  const text = await response.text()
  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const failure = payload as RpcFailure | null
    const status = failure?.error?.status ?? response.status
    if (isUnreachableStatus(status) || isUnreachableStatus(response.status)) {
      reportRegistryUnreachable()
    } else {
      // The registry answered, and said no. Its pages are still usable.
      reportRegistryReachable()
    }
    throw new TwextHubError(
      failure?.error?.message ?? `HTTP ${response.status}`,
      {
        status,
      }
    )
  }

  reportRegistryReachable()

  const success = payload as RpcSuccess | null
  if (!success || !("result" in success)) {
    throw new TwextHubError("The server returned an unreadable response.", {
      status: response.status,
    })
  }

  return decodeValue(success.result)
}

function remote(path: string[]): unknown {
  return new Proxy(function remoteCall() {}, {
    get(_target, property) {
      if (typeof property !== "string") {
        return undefined
      }
      if (property === "then") {
        return undefined
      }
      if (path.length === 0 && property === "token") {
        return null
      }
      if (path.length === 0 && property === "setToken") {
        // The token lives in an HTTP-only cookie now, so there is nothing for
        // the browser to set.
        return () => {}
      }
      return remote([...path, property])
    },
    apply(_target, _thisArg, args: unknown[]) {
      return callApi(path, args)
    },
  })
}

/**
 * Drop-in replacement for TwextHubKit in the browser. Every method and nested
 * resource is a proxy that posts to the server, which owns the token and talks
 * to the registry.
 */
export const th = remote([]) as unknown as TwextHubKit
