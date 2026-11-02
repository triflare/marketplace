import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  ServerIcon,
  TrashIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type {
  AvailableDriver,
  DriverInstance,
  DriverInstanceInput,
  DriverKind,
  DriverOption,
  ReplaceDriversResult,
} from "@/lib/api"
import { ApiError } from "@/lib/api/errors"

import { ErrorState, LoadingRows } from "@/components/common/async-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useAsync } from "@/hooks/use-async"
import { adminKeys } from "@/lib/preload"
import { errorMessage, th } from "@/lib/registry"

// The drivers this registry runs on: auth, mail, storage and the rest. Each
// kind is a list of instances, and the list is what the form edits. A driver's
// settings come from the schema the server publishes with it, so a driver that
// grows an option is editable without a change here.
export function DriversSection() {
  const catalog = useAsync(
    (signal) => th.admin.listDrivers({ signal }),
    [],
    adminKeys.drivers
  )
  const [editing, setEditing] = useState<string | null>(null)
  // What the last save returned. The catalog reload is a second request; until
  // it lands, the section and a reopened form show the saved instances rather
  // than the ones the page loaded with.
  const [saved, setSaved] = useState<{
    kind: string
    instances: DriverInstance[]
    revision: number
  } | null>(null)

  // A soft reload rebuilds the drivers from the file; this reads the new
  // mixture without making the admin reload the document. The callback is held
  // in a ref so the listener is attached once, not on every render.
  const reloadCatalog = useRef(catalog.reload)
  useEffect(() => {
    reloadCatalog.current = catalog.reload
  })
  useEffect(() => {
    const handler = () => reloadCatalog.current()
    window.addEventListener("triflare:config-reloaded", handler)
    return () => window.removeEventListener("triflare:config-reloaded", handler)
  }, [])

  if (catalog.status === "error") {
    return (
      <ErrorState
        message={catalog.error ?? "We couldn’t load the drivers."}
        onRetry={catalog.reload}
      />
    )
  }

  if (catalog.status === "loading" && !catalog.data) {
    return <LoadingRows rows={4} />
  }

  const data = catalog.data
  if (!data) {
    return null
  }

  const kinds = Object.entries(data.drivers)
  const instancesOf = (id: string, entry: DriverKind): DriverInstance[] =>
    saved?.kind === id ? saved.instances : entry.instances
  const revisionOf = (id: string): number =>
    saved?.kind === id ? saved.revision : (data.revision[id] ?? 0)
  const openKind = editing
    ? {
        ...data.drivers[editing],
        instances: instancesOf(editing, data.drivers[editing]),
      }
    : undefined

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-medium">
          <ServerIcon className="size-4" /> Drivers
        </h2>
        <p className="text-sm text-muted-foreground">
          What this registry uses to sign people in, send mail, and run
          everything else. A change is checked before it is applied, and some
          take effect only after a restart.
        </p>
      </div>

      <div className="divide-y rounded-lg border">
        {kinds.map(([id, entry]) => (
          <div
            key={id}
            className="flex flex-wrap items-start justify-between gap-3 p-4"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {entry.label}
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {id}
                </Badge>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {instancesOf(id, entry).length === 0 ? (
                  <span>Nothing configured.</span>
                ) : (
                  instancesOf(id, entry).map((instance) => (
                    <span key={instance.id} className="font-mono">
                      {instance.driver}
                      {instance.state === "error" ? " · failing" : ""}
                    </span>
                  ))
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                revision {revisionOf(id)}
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Change the ${entry.label.toLowerCase()} drivers`}
                onClick={() => setEditing(id)}
              >
                Change
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={openKind !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          {openKind && editing ? (
            // Keyed by kind so switching kinds starts from that kind's stored
            // instances rather than from the last draft.
            <DriverEditor
              key={editing}
              kindId={editing}
              kind={openKind}
              onClose={() => setEditing(null)}
              onSaved={(result) => {
                setSaved({
                  kind: result.kind,
                  instances: result.instances,
                  revision: result.revision,
                })
                catalog.reload()
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}

// What the form holds. Option values are strings while they are being typed, so
// a number can be cleared; secrets never carry a stored value, only whether one
// is set.
interface DraftInstance {
  key: string
  id: string
  driver: string
  options: Record<string, string | boolean>
  secretSet: Record<string, boolean>
}

let draftSequence = 0
function nextKey(): string {
  draftSequence += 1
  return `driver-instance-${draftSequence}`
}

function descriptorFor(
  kind: DriverKind,
  driver: string
): AvailableDriver | undefined {
  return kind.available.find((entry) => entry.driver === driver)
}

function optionsFrom(
  descriptor: AvailableDriver | undefined,
  current: Record<string, unknown> = {}
): Record<string, string | boolean> {
  const options: Record<string, string | boolean> = {}
  for (const option of descriptor?.options ?? []) {
    const value = current[option.key]
    if (option.type === "boolean") {
      options[option.key] =
        typeof value === "boolean" ? value : option.default === true
      continue
    }
    options[option.key] =
      value === null || value === undefined || value === ""
        ? option.default === null || option.default === undefined
          ? ""
          : String(option.default)
        : String(value)
  }
  return options
}

function toDraft(instance: DriverInstance, kind: DriverKind): DraftInstance {
  const descriptor = descriptorFor(kind, instance.driver)
  const options: Record<string, string | boolean> = {}
  const secretSet: Record<string, boolean> = {}
  for (const option of descriptor?.options ?? []) {
    const value = instance.options[option.key]
    if (option.secret) {
      options[option.key] = ""
      secretSet[option.key] =
        (value as { set?: boolean } | undefined)?.set === true
      continue
    }
    options[option.key] =
      typeof value === "boolean"
        ? value
        : value === null || value === undefined
          ? ""
          : String(value)
  }
  return {
    key: nextKey(),
    id: instance.id,
    driver: instance.driver,
    options,
    secretSet,
  }
}

function emptyDraft(kind: DriverKind): DraftInstance {
  const descriptor = kind.available[0]
  return {
    key: nextKey(),
    id: "",
    driver: descriptor?.driver ?? "",
    options: optionsFrom(descriptor),
    secretSet: {},
  }
}

// The body the endpoint takes. A blank option is left out rather than sent as
// an empty string: the server reads that as the driver's default, and for a
// secret it means "keep the one already stored".
function toPayload(
  drafts: DraftInstance[],
  kind: DriverKind
): DriverInstanceInput[] {
  return drafts.map((draft) => {
    const descriptor = descriptorFor(kind, draft.driver)
    const options: Record<string, unknown> = {}
    for (const option of descriptor?.options ?? []) {
      const value = draft.options[option.key]
      if (option.type === "boolean") {
        options[option.key] = value === true
        continue
      }
      const text = typeof value === "string" ? value.trim() : ""
      if (text === "") {
        // A stored secret the form never held goes back as the mask it was
        // given, which is how the server knows to keep it rather than clear it.
        if (option.secret && draft.secretSet[option.key]) {
          options[option.key] = { set: true }
        }
        continue
      }
      options[option.key] = option.type === "number" ? Number(text) : text
    }
    const id = draft.id.trim()
    return { ...(id ? { id } : {}), driver: draft.driver, options }
  })
}

function isMissingRequired(drafts: DraftInstance[], kind: DriverKind): boolean {
  return drafts.some((draft) =>
    (descriptorFor(kind, draft.driver)?.options ?? []).some((option) => {
      if (!option.required) return false
      if (option.type === "boolean") return false
      const value = draft.options[option.key]
      if (option.secret) {
        return value === "" && !draft.secretSet[option.key]
      }
      return typeof value !== "string" || value.trim() === ""
    })
  )
}

// The registry's own words, plus any field errors it named. The generic message
// a 5xx gets would hide a provider that refused its settings.
function describeFailure(error: unknown): string {
  if (error instanceof ApiError) {
    const errors = error.problem?.errors
    if (errors && errors.length > 0) {
      return errors
        .map((entry) => `${entry.field}: ${entry.message}`)
        .join("\n")
    }
    return error.message
  }
  return errorMessage(error)
}

function DriverEditor({
  kindId,
  kind,
  onClose,
  onSaved,
}: {
  kindId: string
  kind: DriverKind
  onClose: () => void
  onSaved: (result: ReplaceDriversResult) => void
}) {
  const [drafts, setDrafts] = useState<DraftInstance[]>(() =>
    kind.instances.map((instance) => toDraft(instance, kind))
  )
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  function update(next: DraftInstance[]) {
    setDrafts(next)
    setFailure(null)
    setConfirmation(null)
  }

  function changeDriver(index: number, driver: string) {
    update(
      drafts.map((draft, current) =>
        current === index
          ? {
              ...draft,
              driver,
              options: optionsFrom(descriptorFor(kind, driver)),
              secretSet: {},
            }
          : draft
      )
    )
  }

  // secretSet keeps saying whether the registry holds a secret for the field,
  // not whether the input is empty: clearing what was typed has to fall back to
  // keeping the stored one, not to erasing it.
  function setOption(index: number, key: string, value: string | boolean) {
    update(
      drafts.map((draft, current) =>
        current === index
          ? { ...draft, options: { ...draft.options, [key]: value } }
          : draft
      )
    )
  }

  function setId(index: number, id: string) {
    update(
      drafts.map((draft, current) =>
        current === index ? { ...draft, id } : draft
      )
    )
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= drafts.length) return
    const next = [...drafts]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    update(next)
  }

  function remove(index: number) {
    update(drafts.filter((_, current) => current !== index))
  }

  async function save(confirm = false) {
    setPending(true)
    setFailure(null)
    try {
      const result = await th.admin.replaceDrivers(kindId, {
        instances: toPayload(drafts, kind),
        ...(confirm ? { confirm: true } : {}),
      })
      toast.success(
        result.applied === "restart"
          ? "Drivers saved. Restart the process to apply them."
          : "Drivers updated."
      )
      onSaved(result)
      onClose()
    } catch (error) {
      // A change that would strand linked identities is refused until it is
      // confirmed; anything else is a failure to show as it came.
      if (
        !confirm &&
        error instanceof ApiError &&
        error.status === 409 &&
        error.problem?.title === "Confirmation Required"
      ) {
        setConfirmation(error.message)
        return
      }
      setFailure(describeFailure(error))
    } finally {
      setPending(false)
    }
  }

  const missingRequired = isMissingRequired(drafts, kind)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Change the {kind.label.toLowerCase()} drivers</DialogTitle>
        <DialogDescription>
          Instances are tried in this order: the first that accepts is used.
          Leave a secret blank to keep the one already stored — secrets are
          never shown.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        {drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            No instances. Nothing in this registry will work without one.
          </p>
        ) : null}

        {drafts.map((draft, index) => {
          const descriptor = descriptorFor(kind, draft.driver)
          return (
            <div
              key={draft.key}
              className="flex flex-col gap-3 rounded-lg border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  items={kind.available.map((entry) => ({
                    value: entry.driver,
                    label: entry.label,
                  }))}
                  value={draft.driver}
                  onValueChange={(value) => changeDriver(index, String(value))}
                >
                  <SelectTrigger
                    className="w-52"
                    aria-label={`Driver for instance ${index + 1}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kind.available.map((entry) => (
                      <SelectItem key={entry.driver} value={entry.driver}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={draft.id}
                  onChange={(event) => setId(index, event.target.value)}
                  placeholder={`${draft.driver} (auto)`}
                  aria-label={`Instance id ${index + 1}`}
                  className="w-40 font-mono text-xs"
                />
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move up"
                    disabled={index === 0 || pending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move down"
                    disabled={index === drafts.length - 1 || pending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove instance"
                    disabled={pending}
                    onClick={() => remove(index)}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </div>

              {descriptor && descriptor.options.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {descriptor.options.map((option) => (
                    <OptionField
                      key={`${draft.key}-${option.key}`}
                      fieldId={`${draft.key}-${option.key}`}
                      option={option}
                      value={draft.options[option.key]}
                      secretIsSet={draft.secretSet[option.key] === true}
                      disabled={pending}
                      onChange={(value) => setOption(index, option.key, value)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This driver takes no settings.
                </p>
              )}
            </div>
          )
        })}

        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={kind.available.length === 0 || pending}
          onClick={() => update([...drafts, emptyDraft(kind)])}
        >
          <PlusIcon /> Add instance
        </Button>
      </div>

      {confirmation ? (
        <Alert>
          <AlertTitle>Confirm this change</AlertTitle>
          <AlertDescription>{confirmation}</AlertDescription>
        </Alert>
      ) : null}

      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>That change was not applied</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {failure}
          </AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        {missingRequired ? (
          <p className="mr-auto text-xs text-muted-foreground">
            Fill in the required settings first.
          </p>
        ) : null}
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        {confirmation ? (
          <Button onClick={() => void save(true)} disabled={pending}>
            {pending ? "Applying…" : "Apply anyway"}
          </Button>
        ) : (
          <Button
            onClick={() => void save()}
            disabled={pending || missingRequired}
          >
            {pending ? "Saving…" : "Save drivers"}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

function OptionField({
  fieldId,
  option,
  value,
  secretIsSet,
  disabled,
  onChange,
}: {
  fieldId: string
  option: DriverOption
  value: string | boolean | undefined
  secretIsSet: boolean
  disabled: boolean
  onChange: (value: string | boolean) => void
}) {
  if (option.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={fieldId} className="text-xs font-normal">
          {option.label}
        </Label>
        <Switch
          id={fieldId}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </div>
    )
  }

  const placeholder = option.secret
    ? secretIsSet
      ? "Set — leave blank to keep"
      : "Not set"
    : option.default === null || option.default === undefined
      ? undefined
      : String(option.default)

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId} className="text-xs font-normal">
        {option.label}
      </Label>
      <Input
        id={fieldId}
        type={
          option.type === "secret"
            ? "password"
            : option.type === "number"
              ? "number"
              : "text"
        }
        value={typeof value === "string" ? value : ""}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />
    </div>
  )
}
