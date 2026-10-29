import type TwextHubKit from "@twextjs/twexthubkit"
import type { ExtensionDetail, User } from "@twextjs/twexthubkit"

import {
  detailFromUnpublished,
  loadUnpublishedVersions,
} from "@/lib/extension-data"

export interface ManageAccess {
  extension: ExtensionDetail
  allowed: boolean
}

/**
 * One answer to "may this account manage this address", shared by the route
 * loader and the page so a preloaded decision is the same one the client would
 * reach on its own.
 *
 * A project whose first release is waiting for review has no published detail
 * for anyone, so the address is resolved through the releases only its owners
 * may read. Holding those rows *is* the ownership check: the registry refuses
 * the same request to every other account.
 */
export async function resolveManageAccess(
  kit: TwextHubKit,
  namespace: string,
  id: string,
  user: User,
  isAdmin: boolean,
  signal?: AbortSignal
): Promise<ManageAccess> {
  let extension: ExtensionDetail
  try {
    extension = await kit.extensions.get(namespace, id, { signal })
  } catch (error) {
    const waiting = await loadUnpublishedVersions(kit, namespace, id, signal)
    if (!waiting) {
      throw error
    }
    return {
      extension: detailFromUnpublished(namespace, id, waiting),
      allowed: true,
    }
  }

  if (isAdmin || extension.namespace === user.namespace) {
    return { extension, allowed: true }
  }

  const owners = await kit.extensions.owners
    .list(namespace, id, { signal })
    .catch(() => null)
  if (owners?.data.some((owner) => owner.namespace === user.namespace)) {
    return { extension, allowed: true }
  }

  if (extension.namespace !== user.namespace) {
    const orgOwners = await kit.orgs
      .listOwners(extension.namespace, { signal })
      .catch(() => null)
    if (orgOwners?.data.some((owner) => owner.namespace === user.namespace)) {
      return { extension, allowed: true }
    }
  }

  return { extension, allowed: false }
}
