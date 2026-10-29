import {
  BellIcon,
  CheckIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
  UploadIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"
import { Link, useLocation } from "react-router"
import { toast } from "sonner"

import { ButtonLink } from "@/components/common/button-link"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/auth"

export function AccountMenu() {
  const { user, isAdmin, accounts, signOut, switchAccount } = useAuth()
  const { pathname, search } = useLocation()

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <ButtonLink variant="ghost" size="sm" to="/login">
          Sign in
        </ButtonLink>
        <ButtonLink size="sm" to="/signup">
          Create account
        </ButtonLink>
      </div>
    )
  }

  // Signing in again adds an account to this browser rather than replacing the
  // one in use, so the page it lands back on is the one being read.
  const addAccountHref = `/login?add=1&next=${encodeURIComponent(`${pathname}${search}`)}`
  const several = accounts.length > 1

  async function switchTo(namespace: string) {
    try {
      await switchAccount(namespace)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Switch failed.")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Account menu for ${user.displayName}`}
          />
        }
      >
        <UserAvatar name={user.displayName} src={user.avatarUrl} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate text-sm font-medium">
            {user.displayName}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            @{user.namespace}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/dashboard" />}>
            <LayoutDashboardIcon /> Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/notifications" />}>
            <BellIcon /> Notifications
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/publish" />}>
            <UploadIcon /> Publish
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to={`/@${user.namespace}`} />}>
            <UserIcon /> My profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/settings" />}>
            <SettingsIcon /> Settings
          </DropdownMenuItem>
          {isAdmin ? (
            <DropdownMenuItem render={<Link to="/admin" />}>
              <ShieldIcon /> Admin
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UsersIcon />
            Switch accounts
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            <DropdownMenuLabel>
              {several ? "Signed in on this browser" : "This browser"}
            </DropdownMenuLabel>
            {accounts.map((account) => (
              <DropdownMenuItem
                key={account.namespace}
                disabled={account.namespace === user.namespace}
                onClick={() => void switchTo(account.namespace)}
              >
                <UserAvatar
                  name={account.displayName}
                  src={account.avatarUrl}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate">
                  {account.displayName}
                </span>
                {account.namespace === user.namespace ? (
                  <CheckIcon className="text-foreground" />
                ) : (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    @{account.namespace}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to={addAccountHref} />}>
              <UserPlusIcon /> Add another account
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOutIcon />{" "}
          {several ? `Sign out of @${user.namespace}` : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
