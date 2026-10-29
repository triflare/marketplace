import { serverApi } from "@/lib/api.server"
import { authorExtensionsKey, authorProfileKey } from "@/lib/preload"

export { AuthorPage as default } from "@/pages/author-page"

export async function loader({
  params,
}: {
  params: Record<string, string | undefined>
}) {
  const handle = params.namespace ?? ""
  const namespace = handle.startsWith("@") ? handle.slice(1) : ""
  if (!namespace) {
    return { preload: {} }
  }

  const kit = serverApi()

  try {
    const [account, extensions] = await Promise.all([
      kit.users.get(namespace),
      kit.extensions.list({
        namespace,
        limit: 20,
        sort: "recent",
      }),
    ])

    const profile =
      account.kind === "organization"
        ? await Promise.all([
            kit.orgs.get(namespace),
            kit.orgs.listOwners(namespace),
          ]).then(([organization, owners]) => ({
            account,
            organization,
            owners: owners.data,
          }))
        : { account, organization: null, owners: [] }

    return {
      preload: {
        [authorProfileKey(namespace)]: profile,
        [authorExtensionsKey(namespace)]: extensions,
      },
    }
  } catch {
    return { preload: {} }
  }
}
