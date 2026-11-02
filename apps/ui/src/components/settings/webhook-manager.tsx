import { PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type {
  Collection,
  Page,
  Webhook,
  WebhookCreated,
  WebhookDelivery,
  WebhookEvent,
  WebhookInput,
} from "@/lib/api"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { CopyButton } from "@/components/common/copy-button"
import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { product } from "@/lib/product"
import { useAsync } from "@/hooks/use-async"
import { formatDate } from "@/lib/format"
import { errorMessage } from "@/lib/registry"

const EVENTS: Array<{ value: WebhookEvent; label: string }> = [
  { value: "version.published", label: "Release published" },
  { value: "version.yanked", label: "Release removed" },
  { value: "version.deprecated", label: "Release deprecated" },
  { value: "version.rejected", label: "Release declined" },
  { value: "owners.invited", label: "Owner invited" },
  { value: "owners.changed", label: "Owners changed" },
  { value: "extension.transferred", label: "Ownership transferred" },
]

export interface WebhookActions {
  list: () => Promise<Collection<Webhook>>
  create: (payload: WebhookInput) => Promise<WebhookCreated>
  remove: (webhookId: number) => Promise<void>
  listDeliveries: (webhookId: number) => Promise<Page<WebhookDelivery>>
  redeliver: (webhookId: number, deliveryId: number) => Promise<WebhookDelivery>
}

export function WebhookManager({
  actions,
  title,
  preloadKey,
}: {
  actions: WebhookActions
  title: string
  preloadKey?: string
}) {
  const webhooks = useAsync(() => actions.list(), [], preloadKey)
  const [createOpen, setCreateOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [events, setEvents] = useState<WebhookEvent[]>(["version.published"])
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<WebhookCreated | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  function toggleEvent(event: WebhookEvent, checked: boolean) {
    setEvents((current) =>
      checked ? [...current, event] : current.filter((value) => value !== event)
    )
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const result = await actions.create({
        url: url.trim(),
        events,
        active: true,
      })
      setCreated(result)
      setCreateOpen(false)
      setUrl("")
      setEvents(["version.published"])
      webhooks.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (deleteId === null) {
      return
    }
    setPending(true)
    try {
      await actions.remove(deleteId)
      setDeleteId(null)
      webhooks.reload()
      toast.success("Destination removed.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Send a notification to another service when a release or access
            change happens.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon /> Add destination
        </Button>
      </div>

      {webhooks.status === "error" ? (
        <ErrorState
          message={webhooks.error ?? "We couldn’t load delivery notifications."}
          onRetry={webhooks.reload}
        />
      ) : webhooks.status === "loading" ? (
        <LoadingRows rows={2} />
      ) : webhooks.data && webhooks.data.data.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {webhooks.data.data.map((webhook) => (
            <li key={webhook.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{webhook.url}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {webhook.events.map((event) => (
                      <span
                        key={event}
                        className="rounded border px-1 font-mono text-[10px] text-muted-foreground"
                      >
                        {eventLabel(event)}
                      </span>
                    ))}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {webhook.active ? "Active" : "Paused"} · added{" "}
                    {formatDate(webhook.created_at)}
                    {webhook.last_delivery_status
                      ? ` · last delivery ${webhook.last_delivery_status}`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove destination"
                  onClick={() => setDeleteId(webhook.id)}
                >
                  <Trash2Icon />
                </Button>
              </div>
              <DeliveryList webhook={webhook} actions={actions} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No delivery notifications set up.
        </p>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a destination</DialogTitle>
            <DialogDescription>
              We’ll send a JSON request to this address when a selected event
              happens. Use the secret to verify each request.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="webhook-url">Destination URL</Label>
              <Input
                id="webhook-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required
                placeholder="https://example.com/hooks/marketplace"
              />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Events</legend>
              {EVENTS.map((event) => (
                <label
                  key={event.value}
                  className="flex items-center gap-2 text-xs"
                >
                  <Checkbox
                    checked={events.includes(event.value)}
                    onCheckedChange={(checked) =>
                      toggleEvent(event.value, checked === true)
                    }
                  />
                  {event.label}
                </label>
              ))}
            </fieldset>
            <DialogFooter>
              <Button type="submit" disabled={pending || events.length === 0}>
                {pending ? "Adding…" : "Add destination"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={created !== null}
        onOpenChange={(open) => !open && setCreated(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signing secret</DialogTitle>
            <DialogDescription>
              Shown once. Use it to verify that each delivery came from
              {product.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">
              {created?.secret}
            </code>
            <CopyButton value={created?.secret ?? ""} />
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium">Next steps</p>
            <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4 text-xs text-muted-foreground">
              <li>
                Put the secret in the service that receives deliveries and use
                it to check every signature.
              </li>
              <li>
                Answer each delivery quickly with a 2xx. Failed attempts retry
                on their own.
              </li>
              <li>
                Open the destination afterwards and choose “Show deliveries” to
                inspect attempts or send one again.
              </li>
            </ol>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remove this destination?"
        description="No further notifications are sent to its address."
        confirmLabel="Remove destination"
        destructive
        pending={pending}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function eventLabel(event: WebhookEvent): string {
  return EVENTS.find((entry) => entry.value === event)?.label ?? event
}

function DeliveryList({
  webhook,
  actions,
}: {
  webhook: Webhook
  actions: WebhookActions
}) {
  const [open, setOpen] = useState(false)
  const deliveries = useAsync(
    () => (open ? actions.listDeliveries(webhook.id) : Promise.resolve(null)),
    [open]
  )
  const [redelivering, setRedelivering] = useState<number | null>(null)

  async function redeliver(deliveryId: number) {
    setRedelivering(deliveryId)
    try {
      await actions.redeliver(webhook.id, deliveryId)
      deliveries.reload()
      toast.success("Delivery queued again.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setRedelivering(null)
    }
  }

  return (
    <div className="border-t pt-2">
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide deliveries" : "Show deliveries"}
      </Button>
      {open ? (
        deliveries.status === "error" ? (
          <p className="text-xs text-destructive">{deliveries.error}</p>
        ) : deliveries.status === "loading" || !deliveries.data ? (
          <p className="text-xs text-muted-foreground">Loading deliveries…</p>
        ) : deliveries.data.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No deliveries yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {deliveries.data.data.map((delivery) => (
              <li
                key={delivery.id}
                className="flex items-center justify-between gap-2 rounded border px-2 py-1"
              >
                <div className="min-w-0 font-mono text-[11px]">
                  <span>{delivery.event}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {delivery.status} · attempt {delivery.attempt}/
                    {delivery.max_attempts} · {formatDate(delivery.created_at)}
                  </span>
                  {delivery.last_error ? (
                    <span className="block truncate text-destructive">
                      {delivery.last_error}
                    </span>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Redeliver"
                  onClick={() => void redeliver(delivery.id)}
                  disabled={redelivering !== null}
                >
                  <RefreshCwIcon />
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}
