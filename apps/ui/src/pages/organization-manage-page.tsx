import { ExternalLinkIcon, Trash2Icon, UserPlusIcon } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import type { Organization } from "@twextjs/twexthubkit"

import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import { ButtonLink } from "@/components/common/button-link"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { PageHeader } from "@/components/common/page-header"
import { UserAvatar } from "@/components/common/user-avatar"
import { WebhookManager } from "@/components/settings/webhook-manager"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/context/auth"
import { useAsync } from "@/hooks/use-async"
import { organizationKeys } from "@/lib/preload"
import { assetUrl, errorMessage, th } from "@/lib/twexthub"
import { cn } from "@/lib/utils"

const ORG_TABS = ["profile", "owners", "webhooks", "settings"] as const
type OrgTab = (typeof ORG_TABS)[number]

const ORG_TAB_ALIASES: Record<string, OrgTab> = {
  access: "owners",
  people: "owners",
  delivery: "webhooks",
  automation: "webhooks",
  danger: "settings",
}

function resolveOrgTab(value: string | null): OrgTab {
  if (value && (ORG_TABS as readonly string[]).includes(value)) {
    return value as OrgTab
  }
  if (value && ORG_TAB_ALIASES[value]) {
    return ORG_TAB_ALIASES[value]
  }
  return "profile"
}

export function OrganizationManagePage() {
  const { namespace = "" } = useParams()
  const { user, isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = resolveOrgTab(params.get("tab"))

  const access = useAsync(
    async (signal) => {
      const [org, owners] = await Promise.all([
        th.orgs.get(namespace, { signal }),
        th.orgs.listOwners(namespace, { signal }),
      ])
      const allowed =
        isAdmin ||
        owners.data.some((owner) => owner.namespace === user?.namespace)
      return { org, owners: owners.data, allowed }
    },
    [namespace, user?.namespace, isAdmin],
    organizationKeys.access(namespace, user?.namespace, isAdmin)
  )

  if (access.status === "error") {
    return (
      <ErrorState
        message={access.error ?? "We couldn’t load this organization."}
        onRetry={access.reload}
      />
    )
  }

  if (access.status === "loading" || !access.data) {
    return (
      <PageHeader title="Manage organization" description="Checking access…" />
    )
  }

  if (!access.data.allowed) {
    return (
      <EmptyState
        title="You do not manage this organization"
        description="Only its owners and registry administrators can change it."
        action={
          <ButtonLink variant="outline" to={`/@${namespace}`}>
            Back to the profile
          </ButtonLink>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`@${access.data.org.namespace}`}
        title={access.data.org.displayName}
        description="Manage this organization’s profile, access, delivery notifications, and settings."
        actions={
          <ButtonLink variant="outline" to={`/@${namespace}`}>
            <ExternalLinkIcon /> Public page
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
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="owners">Owners</TabsTrigger>
          <TabsTrigger value="webhooks">Delivery</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <OrgProfile namespace={namespace} initial={access.data.org} />
        </TabsContent>
        <TabsContent value="owners">
          <OrgOwners namespace={namespace} />
        </TabsContent>
        <TabsContent value="webhooks" className="flex w-full flex-col">
          <WebhookManager
            title="Delivery notifications"
            preloadKey={organizationKeys.webhooks(namespace)}
            actions={{
              list: () => th.orgs.webhooks.list(namespace),
              create: (payload) => th.orgs.webhooks.create(namespace, payload),
              remove: (id) => th.orgs.webhooks.delete(namespace, id),
              listDeliveries: (id) =>
                th.orgs.webhooks.listDeliveries(namespace, id, { limit: 10 }),
              redeliver: (id, deliveryId) =>
                th.orgs.webhooks.redeliver(namespace, id, deliveryId),
            }}
          />
        </TabsContent>
        <TabsContent value="settings" className="w-full">
          <OrgDanger namespace={namespace} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OrgProfile({
  namespace,
  initial,
}: {
  namespace: string
  initial: Organization
}) {
  const [org, setOrg] = useState(initial)
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [bio, setBio] = useState(initial.bio)
  const [website, setWebsite] = useState(initial.website ?? "")
  const [github, setGithub] = useState(initial.github ?? "")
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null)
  const [stamp, setStamp] = useState(() => Date.now())

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const updated = await th.orgs.update(namespace, {
        displayName: displayName.trim(),
        bio: bio.trim(),
        website: website.trim() || null,
        github: github.trim() || null,
      })
      setOrg(updated)
      toast.success("Organization saved.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function upload(kind: "avatar" | "banner", file: File) {
    setUploading(kind)
    try {
      const resource = kind === "avatar" ? th.orgs.avatar : th.orgs.banner
      const updated = await resource.upload(namespace, file, {
        contentType: file.type,
      })
      setOrg(updated)
      setStamp(Date.now())
      toast.success("Image updated.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUploading(null)
    }
  }

  async function remove(kind: "avatar" | "banner") {
    setUploading(kind)
    try {
      const resource = kind === "avatar" ? th.orgs.avatar : th.orgs.banner
      const updated = await resource.delete(namespace)
      setOrg(updated)
      setStamp(Date.now())
      toast.success("Image removed.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUploading(null)
    }
  }

  const avatar = withStamp(assetUrl(org.avatarUrl), stamp)
  const banner = withStamp(assetUrl(org.bannerUrl), stamp)

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <UserAvatar name={org.displayName} src={avatar} size="lg" />
        <div className="flex flex-wrap gap-2">
          <label
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              uploading !== null && "pointer-events-none opacity-50"
            )}
          >
            {uploading === "avatar" ? "Uploading…" : "Change avatar"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void upload("avatar", file)
                }
                event.target.value = ""
              }}
            />
          </label>
          <label
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              uploading !== null && "pointer-events-none opacity-50"
            )}
            title="Banner image, 3000 × 1000 px"
          >
            {uploading === "banner" ? "Uploading…" : "Upload banner"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void upload("banner", file)
                }
                event.target.value = ""
              }}
            />
          </label>
          {org.avatarUrl ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void remove("avatar")}
              disabled={uploading !== null}
            >
              Remove avatar
            </Button>
          ) : null}
          {org.bannerUrl ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void remove("banner")}
              disabled={uploading !== null}
            >
              Remove banner
            </Button>
          ) : null}
        </div>
      </div>
      {banner ? (
        <img
          src={banner}
          alt=""
          className="aspect-[3/1] w-full rounded-lg border object-cover"
        />
      ) : null}

      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-display-name-manage">Display name</Label>
            <Input
              id="org-display-name-manage"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-namespace-manage">Handle</Label>
            <Input
              id="org-namespace-manage"
              value={namespace}
              readOnly
              disabled
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-bio-manage">Description</Label>
          <Textarea
            id="org-bio-manage"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={280}
            rows={3}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-website-manage">Website</Label>
            <Input
              id="org-website-manage"
              type="url"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-github-manage">GitHub username</Label>
            <Input
              id="org-github-manage"
              value={github}
              onChange={(event) => setGithub(event.target.value)}
              placeholder="octocat"
            />
          </div>
        </div>
        <Button type="submit" className="self-start" disabled={pending}>
          {pending ? "Saving…" : "Save organization"}
        </Button>
      </form>
    </div>
  )
}

function OrgOwners({ namespace }: { namespace: string }) {
  const [invite, setInvite] = useState("")
  const [pending, setPending] = useState(false)
  const [removeOwner, setRemoveOwner] = useState<string | null>(null)

  const owners = useAsync(
    (signal) => th.orgs.listOwners(namespace, { signal }),
    [namespace],
    organizationKeys.owners(namespace)
  )

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await th.orgs.addOwner(namespace, invite.trim())
      setInvite("")
      owners.reload()
      toast.success("Owner added.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (!removeOwner) {
      return
    }
    setPending(true)
    try {
      await th.orgs.removeOwner(namespace, removeOwner)
      setRemoveOwner(null)
      owners.reload()
      toast.success("Owner removed.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {owners.status === "error" ? (
        <ErrorState
          message={owners.error ?? "We couldn’t load owners."}
          onRetry={owners.reload}
        />
      ) : owners.status === "loading" || !owners.data ? (
        <LoadingRows rows={2} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {owners.data.data.map((owner) => (
            <li
              key={owner.namespace}
              className="flex items-center justify-between gap-2 px-4 py-2.5"
            >
              <Link
                to={`/@${owner.namespace}`}
                className="flex items-center gap-2 text-sm hover:underline"
              >
                <UserAvatar
                  name={owner.displayName}
                  src={owner.avatarUrl}
                  size="sm"
                />
                {owner.displayName}
                <span className="font-mono text-xs text-muted-foreground">
                  @{owner.namespace}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${owner.namespace}`}
                onClick={() => setRemoveOwner(owner.namespace)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={add}
        className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="org-owner-namespace">Add an owner</Label>
          <Input
            id="org-owner-namespace"
            value={invite}
            onChange={(event) => setInvite(event.target.value)}
            required
            placeholder="account-handle"
          />
        </div>
        <Button type="submit" disabled={pending}>
          <UserPlusIcon /> {pending ? "Adding…" : "Add owner"}
        </Button>
      </form>
      <ConfirmDialog
        open={removeOwner !== null}
        onOpenChange={(open) => !open && setRemoveOwner(null)}
        title={`Remove @${removeOwner}?`}
        description="An organization needs at least one owner; the API refuses to remove the last one."
        confirmLabel="Remove owner"
        confirmPhrase={removeOwner ? `@${removeOwner}` : undefined}
        destructive
        pending={pending}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function OrgDanger({ namespace }: { namespace: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function remove() {
    setPending(true)
    try {
      await th.orgs.delete(namespace)
      toast.success("Organization deleted.")
      navigate("/")
    } catch (error) {
      toast.error(errorMessage(error))
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-4">
      <h2 className="text-base font-medium text-destructive">
        Delete organization
      </h2>
      <p className="text-sm text-muted-foreground">
        Deletes @{namespace} and every extension it owns. This cannot be undone.
      </p>
      <Button
        variant="destructive"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        <Trash2Icon /> Delete organization
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete @${namespace}?`}
        description="All extensions under this handle are deleted with it. There is no undo."
        confirmLabel="Delete permanently"
        confirmPhrase={`@${namespace}`}
        destructive
        pending={pending}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function withStamp(url: string | null, stamp: number): string | null {
  if (!url) {
    return null
  }
  return `${url}${url.includes("?") ? "&" : "?"}v=${stamp}`
}
