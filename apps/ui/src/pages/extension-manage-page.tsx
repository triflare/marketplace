import { ExternalLinkIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { EmptyState, ErrorState } from "@/components/common/async-state"
import { ButtonLink } from "@/components/common/button-link"
import { NotFoundPage } from "@/pages/not-found-page"
import { PageHeader } from "@/components/common/page-header"
import { OwnersTab } from "@/components/manage/owners-tab"
import { TagsTab } from "@/components/manage/tags-tab"
import { TransfersTab } from "@/components/manage/transfers-tab"
import { VersionsTab } from "@/components/manage/versions-tab"
import { WebhookManager } from "@/components/settings/webhook-manager"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { resolveManageAccess } from "@/lib/extension-access"
import { manageKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/registry"

const MANAGE_TABS = [
  "releases",
  "labels",
  "access",
  "automation",
  "settings",
] as const
type ManageTab = (typeof MANAGE_TABS)[number]

// Older links, notifications, and bookmarks used other names for the same
// panels; keep them working now that the tab lives in the URL.
const TAB_ALIASES: Record<string, ManageTab> = {
  versions: "releases",
  tags: "labels",
  owners: "access",
  people: "access",
  webhooks: "automation",
  delivery: "automation",
  danger: "settings",
}

function resolveTab(value: string | null): ManageTab {
  if (value && (MANAGE_TABS as readonly string[]).includes(value)) {
    return value as ManageTab
  }
  if (value && TAB_ALIASES[value]) {
    return TAB_ALIASES[value]
  }
  return "releases"
}

export function ExtensionManagePage() {
  const { namespace: handle = "", id = "" } = useParams()
  const namespace = handle.startsWith("@") ? handle.slice(1) : ""

  if (!namespace) {
    return <NotFoundPage />
  }

  return (
    <ExtensionManage key={`${namespace}/${id}`} namespace={namespace} id={id} />
  )
}

function ExtensionManage({ namespace, id }: { namespace: string; id: string }) {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = resolveTab(params.get("tab"))
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const access = useAsync(
    async (signal) => {
      if (!user) {
        throw new Error("Sign in to manage this extension.")
      }
      // A project whose first release is still waiting has no published detail,
      // so the resolver reaches it through the releases only an owner can read.
      return resolveManageAccess(th, namespace, id, user, isAdmin, signal)
    },
    [namespace, id, user?.namespace, isAdmin],
    manageKeys.access(namespace, id, user?.namespace, isAdmin)
  )

  if (access.status === "error") {
    return (
      <ErrorState
        message={access.error ?? "We couldn’t load this extension."}
        onRetry={access.reload}
      />
    )
  }

  if (access.status === "loading" || !access.data) {
    return (
      <PageHeader title="Manage extension" description="Checking access…" />
    )
  }

  const { extension, allowed } = access.data

  if (!allowed) {
    return (
      <EmptyState
        title="You do not manage this extension"
        description="Only an owner of this extension, an owner of its organization, or a registry administrator can change it."
        action={
          <ButtonLink
            variant="outline"
            to={`/@${extension.namespace}/${extension.id}`}
          >
            Back to the extension
          </ButtonLink>
        }
      />
    )
  }

  async function deleteExtension() {
    setDeleting(true)
    try {
      await th.extensions.delete(extension.namespace, extension.id)
      toast.success("Extension deleted.")
      navigate(`/@${extension.namespace}`)
    } catch (error) {
      toast.error(errorMessage(error))
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`@${extension.namespace}/${extension.id}`}
        title={extension.name}
        description="Manage releases, access, delivery notifications, and this extension’s settings."
        actions={
          <ButtonLink
            variant="outline"
            to={`/@${extension.namespace}/${extension.id}`}
          >
            <ExternalLinkIcon /> View public page
          </ButtonLink>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params)
          next.set("tab", value)
          setParams(next, { replace: true })
        }}
        className="gap-6"
      >
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto"
        >
          <TabsTrigger value="releases">Releases</TabsTrigger>
          <TabsTrigger value="labels">Version labels</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="releases">
          <VersionsTab extension={extension} />
        </TabsContent>
        <TabsContent value="labels">
          <TagsTab extension={extension} />
        </TabsContent>
        <TabsContent value="access">
          <div className="flex w-full flex-col gap-10">
            <OwnersTab extension={extension} />
            <TransfersTab extension={extension} />
          </div>
        </TabsContent>
        <TabsContent value="automation" className="flex w-full flex-col">
          <WebhookManager
            title="Delivery notifications"
            preloadKey={manageKeys.webhooks(extension.namespace, extension.id)}
            actions={{
              list: () =>
                th.extensions.webhooks.list(extension.namespace, extension.id),
              create: (payload) =>
                th.extensions.webhooks.create(
                  extension.namespace,
                  extension.id,
                  payload
                ),
              remove: (webhookId) =>
                th.extensions.webhooks.delete(
                  extension.namespace,
                  extension.id,
                  webhookId
                ),
              listDeliveries: (webhookId) =>
                th.extensions.webhooks.listDeliveries(
                  extension.namespace,
                  extension.id,
                  webhookId,
                  {
                    limit: 10,
                  }
                ),
              redeliver: (webhookId, deliveryId) =>
                th.extensions.webhooks.redeliver(
                  extension.namespace,
                  extension.id,
                  webhookId,
                  deliveryId
                ),
            }}
          />
        </TabsContent>
        <TabsContent value="settings" className="w-full">
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-4">
            <h2 className="text-base font-medium text-destructive">
              Delete this extension
            </h2>
            <p className="text-sm text-muted-foreground">
              Removes @{extension.namespace}/{extension.id} and every release,
              label, transfer, and delivery destination attached to it. This
              cannot be undone.
            </p>
            <Button
              variant="destructive"
              className="self-start"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon /> Delete extension
            </Button>
          </div>
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={`Delete ${extension.name}?`}
            description="Every version and build is deleted with it. There is no undo."
            confirmLabel="Delete permanently"
            confirmPhrase={`@${extension.namespace}/${extension.id}`}
            destructive
            pending={deleting}
            onConfirm={() => void deleteExtension()}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
