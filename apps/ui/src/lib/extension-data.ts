import type {
  ApiClient,
  ExtensionDetail,
  ExtensionOwner,
  VersionInfo,
} from "@/lib/api"

export interface ExtensionData {
  extension: ExtensionDetail
  tags: Record<string, string>
  owners: Array<ExtensionOwner & { avatarUrl?: string | null }>
  isOrgOwner: boolean
  /**
   * The address has no published release yet, so this page was built from the
   * releases only an owner may read. A visitor never sees this: the same
   * requests that carry the rows are also the ones that decide who may read
   * them.
   */
  unpublished: boolean
}

/**
 * The releases an owner can see and a visitor cannot. A project whose first
 * release is still waiting has no public page at all — the registry answers a
 * stale 404 for it and leaves it out of every listing — but reading it by
 * status is both the request that hands the rows back and the one that proves
 * the caller holds the address, so it is what stands in for that 404.
 *
 * `null` means this account does not hold the address, and the caller's own
 * error is the honest answer.
 */
export async function loadUnpublishedVersions(
  api: ApiClient,
  namespace: string,
  id: string,
  signal?: AbortSignal
): Promise<VersionInfo[] | null> {
  const pages = await Promise.all(
    (["pending", "rejected"] as const).map((status) =>
      api.extensions.versions
        .list(namespace, id, { status, limit: 50, signal })
        .then((page) => page.data)
        .catch(() => null)
    )
  )

  if (pages.every((rows) => rows === null)) {
    return null
  }

  const rows = pages.flatMap((page) => page ?? [])
  if (rows.length === 0) {
    return null
  }

  // A submission is newest-first by when it was uploaded: versions are strictly
  // increasing per address, so creation order reads as release order here.
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * The public detail shape, assembled from what an unpublished release row
 * carries. Colors and the sandbox flag are recorded on the published detail and
 * nowhere else, so they stay unset rather than guessed at.
 */
export function detailFromUnpublished(
  namespace: string,
  id: string,
  versions: VersionInfo[]
): ExtensionDetail {
  const latest = versions[0]
  return {
    namespace,
    id,
    name: latest.name || id,
    version: latest.version,
    description: latest.description ?? "",
    publishedAt: latest.publishedAt ?? latest.createdAt,
    downloads: 0,
    author: latest.author ?? null,
    license: latest.license ?? "",
    isUnsandboxed: null,
    versions,
  }
}

export async function loadExtensionData(
  api: ApiClient,
  namespace: string,
  id: string,
  viewerNamespace: string | undefined,
  signal?: AbortSignal
): Promise<ExtensionData> {
  let extension: ExtensionDetail
  let unpublished = false
  try {
    extension = await api.extensions.get(namespace, id, { signal })
  } catch (error) {
    const waiting = await loadUnpublishedVersions(api, namespace, id, signal)
    if (!waiting) {
      throw error
    }
    extension = detailFromUnpublished(namespace, id, waiting)
    unpublished = true
  }

  const [tags, owners] = await Promise.all([
    api.extensions.tags.get(namespace, id, { signal }).catch(() => null),
    api.extensions.owners.list(namespace, id, { signal }).catch(() => null),
  ])

  // Owner rows carry no image, so resolve each account's avatar for the
  // sidebar; a failed lookup still leaves a usable initials fallback.
  const ownerRows = owners?.data ?? []
  const ownersWithAvatars = await Promise.all(
    ownerRows.map(async (owner) => {
      try {
        const account = await api.users.get(owner.namespace, { signal })
        return { ...owner, avatarUrl: account.avatarUrl }
      } catch {
        return owner
      }
    })
  )

  // An organization owner can manage the extension even when the extension
  // owner list only names the organization itself.
  const isListedOwner = ownerRows.some(
    (owner) => owner.namespace === viewerNamespace
  )
  const isOrgExtension = ownerRows.some(
    (owner) => owner.kind === "organization"
  )
  let isOrgOwner = false
  if (
    isOrgExtension &&
    viewerNamespace &&
    !isListedOwner &&
    viewerNamespace !== namespace
  ) {
    try {
      const orgOwners = await api.orgs.listOwners(namespace, { signal })
      isOrgOwner = orgOwners.data.some(
        (owner) => owner.namespace === viewerNamespace
      )
    } catch {
      // Personal namespaces have no organization owner list.
    }
  }

  return {
    extension,
    tags: tags ?? {},
    owners: ownersWithAvatars,
    isOrgOwner,
    unpublished,
  }
}
