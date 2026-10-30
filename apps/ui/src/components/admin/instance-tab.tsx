import { ActivityIcon, MegaphoneIcon, SaveIcon } from "lucide-react"
import { useState } from "react"
import { useRevalidator } from "react-router"
import { toast } from "sonner"

import type { ServerSetting } from "@/lib/api"

import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { CopyButton } from "@/components/common/copy-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAsync } from "@/hooks/use-async"
import { adminKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/registry"

export function InstanceTab() {
  return (
    <div className="flex w-full flex-col gap-10">
      <ConfigSection />
      <BroadcastSection />
      <MetricsSection />
    </div>
  )
}

function ConfigSection() {
  const config = useAsync(
    (signal) => th.admin.getConfig({ signal }),
    [],
    adminKeys.config
  )
  const [overrides, setOverrides] = useState<Record<string, unknown>>({})
  const [pending, setPending] = useState(false)
  const [restart, setRestart] = useState<string[]>([])
  const revalidator = useRevalidator()

  if (config.status === "error") {
    return (
      <ErrorState
        message={config.error ?? "We couldn’t load server config."}
        onRetry={config.reload}
      />
    )
  }

  if (config.status === "loading" || !config.data) {
    return <LoadingRows rows={4} />
  }

  const settings = config.data.settings
  const changed = Object.keys(overrides).length > 0

  function setValue(setting: ServerSetting, value: unknown) {
    setOverrides((current) => ({ ...current, [setting.key]: value }))
  }

  async function save() {
    const announced = Object.keys(overrides).some((key) =>
      key.startsWith("banner.")
    )
    setPending(true)
    try {
      const result = await th.admin.updateConfig({ settings: overrides })
      setRestart(result.restartRequired)
      setOverrides({})
      config.reload()
      // The strip is part of the root loader's data, so an announcement saved
      // here would otherwise not appear until the admin navigated somewhere
      // else. Revalidating shows it -- or takes it down -- on save.
      if (announced) {
        revalidator.revalidate()
      }
      toast.success("Configuration saved.")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">Registry settings</h2>
          <p className="text-sm text-muted-foreground">
            {config.data.editable
              ? "Change how this registry behaves. Some settings need a restart."
              : (config.data.reason ??
                "This registry does not allow settings to be edited here.")}
          </p>
        </div>
        <Button
          onClick={() => void save()}
          disabled={!changed || pending || !config.data.editable}
        >
          <SaveIcon /> {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {restart.length > 0 ? (
        <Alert>
          <AlertTitle>Restart required</AlertTitle>
          <AlertDescription>
            Restart to apply: {restart.join(", ")}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="divide-y rounded-lg border">
        {settings.map((setting) => (
          <SettingRow
            key={setting.key}
            setting={setting}
            value={overrides[setting.key] ?? setting.value}
            onChange={(value) => setValue(setting, value)}
          />
        ))}
      </div>
    </section>
  )
}

function SettingRow({
  setting,
  value,
  onChange,
}: {
  setting: ServerSetting
  value: unknown
  onChange: (value: unknown) => void
}) {
  const listValue = Array.isArray(value) ? value.join(", ") : undefined
  // A setting key contains dots, which are legal in an id but read as
  // selectors elsewhere, so the control the label points at gets a flat one.
  const controlId = `setting-${setting.key.replace(/\./g, "-")}`

  return (
    <div
      className={
        setting.type === "longtext"
          ? "grid gap-2 px-4 py-3 sm:items-center"
          : "grid gap-2 px-4 py-3 sm:grid-cols-[1fr_240px] sm:items-center"
      }
    >
      <div>
        {setting.type === "boolean" ? (
          <p className="text-sm font-medium">{setting.label}</p>
        ) : (
          <Label htmlFor={controlId} className="text-sm font-medium">
            {setting.label}
          </Label>
        )}
        <p className="font-mono text-[11px] text-muted-foreground">
          {setting.key}
        </p>
        {setting.help ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{setting.help}</p>
        ) : null}
      </div>
      <div className="flex items-center justify-end">
        {setting.type === "boolean" ? (
          <Switch
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
          />
        ) : setting.type === "origins" ? (
          <Input
            id={controlId}
            value={listValue ?? String(value ?? "")}
            onChange={(event) =>
              onChange(
                event.target.value
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              )
            }
            className="w-full"
          />
        ) : setting.type === "longtext" ? (
          <Textarea
            id={controlId}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
            rows={2}
            maxLength={setting.max ?? undefined}
            className="w-full"
          />
        ) : setting.type === "number" || setting.type === "bytes" ? (
          <Input
            id={controlId}
            type="number"
            value={String(value ?? "")}
            onChange={(event) =>
              onChange(
                event.target.value === "" ? null : Number(event.target.value)
              )
            }
            className="w-full"
          />
        ) : (
          <Input
            id={controlId}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
            className="w-full"
          />
        )}
      </div>
    </div>
  )
}

function BroadcastSection() {
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const result = await th.admin.broadcastNotification({
        message: message.trim(),
      })
      toast.success(`Broadcast sent to ${result.created} accounts.`)
      setMessage("")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-medium">
          <MegaphoneIcon className="size-4" /> Broadcast
        </h2>
        <p className="text-sm text-muted-foreground">
          Sends a notification to every account on this registry.
        </p>
      </div>
      <form
        onSubmit={send}
        className="flex flex-col gap-3 rounded-lg border p-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="broadcast-message">Message</Label>
          <Textarea
            id="broadcast-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            rows={3}
            maxLength={500}
          />
        </div>
        <Button type="submit" className="self-start" disabled={pending}>
          {pending ? "Sending…" : "Send broadcast"}
        </Button>
      </form>
    </section>
  )
}

function MetricsSection() {
  const [metrics, setMetrics] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function load() {
    setPending(true)
    try {
      setMetrics(await th.admin.getMetrics())
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-medium">
            <ActivityIcon className="size-4" /> Usage data
          </h2>
          <p className="text-sm text-muted-foreground">
            Metrics from this registry, ready to copy into your monitoring
            tools.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={pending}
          >
            {pending ? "Loading…" : metrics ? "Refresh" : "Load metrics"}
          </Button>
          {metrics ? <CopyButton value={metrics} label="Copy" /> : null}
        </div>
      </div>
      {metrics ? (
        <pre className="max-h-80 overflow-auto rounded-lg border p-3 font-mono text-[11px] whitespace-pre-wrap">
          {metrics}
        </pre>
      ) : null}
    </section>
  )
}
