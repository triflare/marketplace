import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { UserAvatar } from "@/components/common/user-avatar"
import { ButtonLink } from "@/components/common/button-link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAsync } from "@/hooks/use-async"
import { settingsKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/registry"

export function OrganizationsTab() {
  const navigate = useNavigate()
  const [namespace, setNamespace] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [pending, setPending] = useState(false)

  const orgs = useAsync(
    (signal) => th.orgs.list({ limit: 30, signal }),
    [],
    settingsKeys.organizations
  )

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const org = await th.orgs.create({
        namespace: namespace.trim(),
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      })
      toast.success("Organization created. You are its first owner.")
      navigate(`/organizations/${org.namespace}/manage`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Create an organization</h2>
          <p className="text-sm text-muted-foreground">
            An organization owns extensions and can have several owners. It
            cannot sign in.
          </p>
        </div>
        <form
          onSubmit={create}
          className="flex flex-col gap-3 rounded-lg border p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-namespace">Handle</Label>
              <Input
                id="org-namespace"
                value={namespace}
                onChange={(event) => setNamespace(event.target.value)}
                required
                placeholder="my-org"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-display-name">Display name</Label>
              <Input
                id="org-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={80}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-bio">Description</Label>
            <Textarea
              id="org-bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={280}
              rows={2}
            />
          </div>
          <Button type="submit" className="self-start" disabled={pending}>
            <PlusIcon /> {pending ? "Creating…" : "Create organization"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Creating an organization needs the current terms accepted. You can
            add owners after it exists.
          </p>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium">Your organizations</h2>
          <ButtonLink variant="ghost" size="sm" to="/organizations">
            Directory
          </ButtonLink>
        </div>
        {orgs.status === "error" ? (
          <ErrorState
            message={orgs.error ?? "We couldn’t load organizations."}
            onRetry={orgs.reload}
          />
        ) : orgs.status === "loading" ? (
          <LoadingRows rows={2} />
        ) : orgs.data && orgs.data.data.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {orgs.data.data.map((org) => (
              <li key={org.namespace}>
                <Link
                  to={`/@${org.namespace}`}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/40"
                >
                  <UserAvatar
                    name={org.displayName}
                    src={org.avatarUrl}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {org.displayName}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    @{org.namespace}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            You don’t own any organizations yet.
          </p>
        )}
      </section>
    </div>
  )
}
