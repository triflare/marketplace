import { useSearchParams } from "react-router"

import { AuditTab } from "@/components/admin/audit-tab"
import { InstanceTab } from "@/components/admin/instance-tab"
import { LegalTab } from "@/components/admin/legal-tab"
import { AdminReportsTab } from "@/components/admin/reports-tab"
import { ReviewTab } from "@/components/admin/review-tab"
import { UsersTab } from "@/components/admin/users-tab"
import { PageHeader } from "@/components/common/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TABS = [
  "users",
  "review",
  "reports",
  "audit",
  "instance",
  "legal",
] as const
type AdminTab = (typeof TABS)[number]

export function AdminPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get("tab")
  const tab: AdminTab = TABS.includes(requested as AdminTab)
    ? (requested as AdminTab)
    : "review"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Administration"
        description="Manage accounts, review submissions, handle reports, read the audit log, and manage registry settings and legal documents."
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
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="review">Review queue</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="instance">Registry</TabsTrigger>
          <TabsTrigger value="legal">Legal</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="review">
          <ReviewTab />
        </TabsContent>
        <TabsContent value="reports">
          <AdminReportsTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
        <TabsContent value="instance">
          <InstanceTab />
        </TabsContent>
        <TabsContent value="legal">
          <LegalTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
