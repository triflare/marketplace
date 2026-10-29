import { ExternalLinkIcon } from "lucide-react"
import { useParams } from "react-router"

import { EmptyState, ErrorState } from "@/components/common/async-state"
import { ButtonLink } from "@/components/common/button-link"
import { PageHeader } from "@/components/common/page-header"
import { ProfileForm } from "@/components/settings/profile-form"
import { NotFoundPage } from "@/pages/not-found-page"
import { useAsync } from "@/hooks/use-async"
import { adminUserKey } from "@/lib/preload"
import { usePageMeta } from "@/hooks/use-page-meta"
import { th } from "@/lib/twexthub"

export function AdminUserPage() {
  const { namespace = "" } = useParams()

  const account = useAsync(
    (signal) => th.users.get(namespace, { signal }),
    [namespace],
    adminUserKey(namespace)
  )

  usePageMeta(
    account.data ? `Edit @${account.data.namespace}` : "Edit account",
    "Update an account profile as a registry administrator."
  )

  if (!namespace) {
    return <NotFoundPage />
  }

  if (account.status === "error") {
    return (
      <ErrorState
        message={account.error ?? "We couldn’t load this account."}
        onRetry={account.reload}
      />
    )
  }

  if (account.status === "loading" || !account.data) {
    return <PageHeader title="Edit account" description="Loading…" />
  }

  if (account.data.kind === "organization") {
    return (
      <EmptyState
        title="This is an organization"
        description="Organizations have their own management page."
        action={
          <ButtonLink
            variant="outline"
            to={`/organizations/${account.data.namespace}/manage`}
          >
            Manage organization
          </ButtonLink>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration"
        title={`Edit @${account.data.namespace}`}
        description="Update this account’s public profile. Images stay under the account owner’s control."
        actions={
          <ButtonLink variant="outline" to={`/@${account.data.namespace}`}>
            <ExternalLinkIcon /> View public profile
          </ButtonLink>
        }
      />

      <ProfileForm
        key={account.data.namespace}
        account={account.data}
        canEditImages={false}
        canDelete={false}
      />
    </div>
  )
}
