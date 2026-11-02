import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import type { User } from "@/lib/api"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/context/auth"
import { assetUrl, errorMessage, th } from "@/lib/registry"
import { cn } from "@/lib/utils"

export function ProfileForm({
  account,
  canEditImages = true,
  canDelete = true,
}: {
  account?: User
  canEditImages?: boolean
  canDelete?: boolean
} = {}) {
  const { user, setUser, signOut } = useAuth()
  const navigate = useNavigate()
  const profile = account ?? user
  const isSelf =
    profile !== null && user !== null && profile.namespace === user.namespace
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "")
  const [bio, setBio] = useState(profile?.bio ?? "")
  const [website, setWebsite] = useState(profile?.website ?? "")
  const [github, setGithub] = useState(profile?.github ?? "")
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null)
  const [stamp, setStamp] = useState(() => Date.now())
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!profile) {
    return null
  }
  const target = profile

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const updated = await th.users.update(target.namespace, {
        displayName: displayName.trim(),
        bio: bio.trim(),
        website: website.trim() || null,
        github: github.trim() || null,
      })
      if (isSelf) {
        setUser(updated)
      }
      toast.success("Profile saved.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function uploadImage(kind: "avatar" | "banner", file: File) {
    if (!isSelf) {
      return
    }
    setUploading(kind)
    try {
      const resource = kind === "avatar" ? th.users.avatar : th.users.banner
      const updated = await resource.upload(target.namespace, file, {
        contentType: file.type,
      })
      setUser(updated)
      setStamp(Date.now())
      toast.success(`${kind === "avatar" ? "Avatar" : "Banner"} updated.`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUploading(null)
    }
  }

  async function removeImage(kind: "avatar" | "banner") {
    if (!isSelf) {
      return
    }
    setUploading(kind)
    try {
      const resource = kind === "avatar" ? th.users.avatar : th.users.banner
      const updated = await resource.delete(target.namespace)
      setUser(updated)
      setStamp(Date.now())
      toast.success(`${kind === "avatar" ? "Avatar" : "Banner"} removed.`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUploading(null)
    }
  }

  async function deleteAccount() {
    if (!isSelf) {
      return
    }
    setDeleting(true)
    try {
      await th.users.delete(target.namespace)
      await signOut()
      navigate("/")
    } catch (error) {
      toast.error(errorMessage(error))
      setDeleting(false)
    }
  }

  const avatarSrc = withStamp(assetUrl(profile.avatarUrl), stamp)
  const bannerSrc = withStamp(assetUrl(profile.bannerUrl), stamp)

  return (
    <div className="flex w-full flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-medium">Public profile</h2>
          <p className="text-sm text-muted-foreground">
            {isSelf
              ? "Shown on your profile and on the extensions you publish."
              : `Shown on @${profile.namespace}’s profile and on the extensions they publish.`}
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={profile.displayName} src={avatarSrc} size="lg" />
            {canEditImages && isSelf ? (
              <div className="flex flex-wrap gap-2">
                <label
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    uploading !== null && "pointer-events-none opacity-50"
                  )}
                >
                  <UploadIcon />{" "}
                  {uploading === "avatar" ? "Uploading…" : "Change avatar"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void uploadImage("avatar", file)
                      }
                      event.target.value = ""
                    }}
                  />
                </label>
                {profile.avatarUrl ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeImage("avatar")}
                    disabled={uploading !== null}
                  >
                    <Trash2Icon /> Remove
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
              <span className="flex items-center gap-2">
                <ImageIcon className="size-4" /> Banner
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                3000 × 1000 px
              </span>
            </div>
            {bannerSrc ? (
              <img
                src={bannerSrc}
                alt=""
                className="aspect-[3/1] w-full rounded-md border object-cover"
              />
            ) : (
              <div className="flex aspect-[3/1] w-full items-center justify-center rounded-md border bg-muted/40 text-xs text-muted-foreground">
                No banner
              </div>
            )}
            {canEditImages && isSelf ? (
              <div className="flex flex-wrap gap-2">
                <label
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    uploading !== null && "pointer-events-none opacity-50"
                  )}
                >
                  <UploadIcon />{" "}
                  {uploading === "banner" ? "Uploading…" : "Upload banner"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void uploadImage("banner", file)
                      }
                      event.target.value = ""
                    }}
                  />
                </label>
                {profile.bannerUrl ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeImage("banner")}
                    disabled={uploading !== null}
                  >
                    <Trash2Icon /> Remove
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-display-name">Display name</Label>
              <Input
                id="profile-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={80}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-namespace">Handle</Label>
              <Input
                id="profile-namespace"
                value={profile.namespace}
                readOnly
                disabled
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-bio">Bio</Label>
            <Textarea
              id="profile-bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={280}
              rows={3}
            />
            <p className="text-right text-xs text-muted-foreground">
              {bio.length}/280
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-website">Website</Label>
              <Input
                id="profile-website"
                type="url"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-github">GitHub username</Label>
              <Input
                id="profile-github"
                value={github}
                onChange={(event) => setGithub(event.target.value)}
                placeholder="octocat"
              />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </form>
      </section>

      {canDelete && isSelf ? (
        <>
          <Separator />

          <section className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-4">
            <h2 className="text-base font-medium text-destructive">
              Delete account
            </h2>
            <p className="text-sm text-muted-foreground">
              Deletes @{profile.namespace}, every extension it owns, and all
              sessions and tokens. This cannot be undone.
            </p>
            <Button
              variant="destructive"
              className="self-start"
              onClick={() => setDeleteOpen(true)}
            >
              Delete account
            </Button>
          </section>

          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={`Delete @${profile.namespace}?`}
            description="All extensions and versions owned by this account are deleted too. There is no undo."
            confirmLabel="Delete permanently"
            confirmPhrase={`@${profile.namespace}`}
            destructive
            pending={deleting}
            onConfirm={() => void deleteAccount()}
          />
        </>
      ) : null}
    </div>
  )
}

function withStamp(url: string | null, stamp: number): string | null {
  if (!url) {
    return null
  }
  return `${url}${url.includes("?") ? "&" : "?"}v=${stamp}`
}
