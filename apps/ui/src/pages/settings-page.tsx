import { useSearchParams } from "react-router"

import { PageHeader } from "@/components/common/page-header"
import { OrganizationsTab } from "@/components/settings/organizations-tab"
import { ProfileForm } from "@/components/settings/profile-form"
import { ReportsTab } from "@/components/settings/reports-tab"
import { SecurityTab } from "@/components/settings/security-tab"
import { TokensTab } from "@/components/settings/tokens-tab"
import { WebhookManager } from "@/components/settings/webhook-manager"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/context/auth"
import { settingsKeys } from "@/lib/preload"
import { th } from "@/lib/twexthub"

const TABS = [
  "profile",
  "security",
  "tokens",
  "webhooks",
  "reports",
  "organizations",
] as const
type SettingsTab = (typeof TABS)[number]

export function SettingsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const requested = params.get("tab")
  const tab: SettingsTab = TABS.includes(requested as SettingsTab)
    ? (requested as SettingsTab)
    : "profile"

  if (!user) {
    return null
  }

  const namespace = user.namespace

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description={`Manage your public profile, account security, automation, and organizations for @${user.namespace}.`}
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
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="tokens">Automation</TabsTrigger>
          <TabsTrigger value="webhooks">Delivery</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="organizations">Organizations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileForm />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="tokens">
          <TokensTab />
        </TabsContent>
        <TabsContent value="webhooks" className="flex w-full flex-col">
          <WebhookManager
            title="Delivery notifications"
            preloadKey={settingsKeys.webhooks}
            actions={{
              list: () => th.users.webhooks.list(namespace),
              create: (payload) => th.users.webhooks.create(namespace, payload),
              remove: (id) => th.users.webhooks.delete(namespace, id),
              listDeliveries: (id) =>
                th.users.webhooks.listDeliveries(namespace, id, { limit: 10 }),
              redeliver: (id, deliveryId) =>
                th.users.webhooks.redeliver(namespace, id, deliveryId),
            }}
          />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
        <TabsContent value="organizations">
          <OrganizationsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
