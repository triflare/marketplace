import { Form, redirect, useActionData, useLoaderData } from "react-router"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ONBOARDING_FIELDS,
  applyOnboarding,
  getConfig,
  onboardingStatus,
  setConfig,
  type OnboardingField,
} from "@/lib/config.server"
import { product } from "@/lib/product"
import { resetSessionStore } from "@/lib/session.server"

export async function loader() {
  return onboardingStatus(getConfig())
}

export async function action({ request }: { request: Request }) {
  const form = await request.formData()
  const settings: Record<string, string | boolean> = {}
  for (const field of ONBOARDING_FIELDS) {
    settings[field.key] =
      field.type === "boolean"
        ? form.get(field.key) === "on"
        : String(form.get(field.key) ?? "")
  }

  try {
    const next = applyOnboarding(getConfig(), settings)
    setConfig(next.config)
    // The cookie the setup screen did not use is rebuilt with the secret the
    // operator just chose, so the first real page load signs a real session.
    resetSessionStore()
    return redirect("/")
  } catch (error) {
    const failure = error as Error & {
      errors?: { field: string; message: string }[]
    }
    return {
      errors: failure.errors ?? [
        { field: "settings", message: failure.message },
      ],
    }
  }
}

function errorFor(
  errors: { field: string; message: string }[] | undefined,
  key: string
) {
  return errors?.find((error) => error.field === key)?.message
}

function Field({
  field,
  error,
}: {
  field: OnboardingField
  error?: string
}) {
  const id = `field-${field.key.replaceAll(".", "-")}`
  const placeholder =
    field.key === "session.secret" && field.configured
      ? "Leave empty to keep the current secret"
      : field.key === "session.secret"
        ? "Leave empty to generate one"
        : (field.placeholder ?? "")

  if (field.type === "boolean") {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          <input
            id={id}
            name={field.key}
            type="checkbox"
            defaultChecked={field.value === true}
            className="size-4 rounded border-input"
          />
          {field.label}
        </label>
        {field.help ? (
          <p className="text-xs text-muted-foreground">{field.help}</p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    )
  }

  if (field.type === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <select
          id={id}
          name={field.key}
          defaultValue={String(field.value ?? "")}
          required={field.required}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {field.help ? (
          <p className="text-xs text-muted-foreground">{field.help}</p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {field.label}
        {field.required ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            required
          </span>
        ) : null}
      </Label>
      <Input
        id={id}
        name={field.key}
        type={field.type === "number" ? "number" : field.secret ? "password" : "text"}
        defaultValue={field.secret ? "" : String(field.value ?? "")}
        placeholder={placeholder}
        min={field.min ?? undefined}
        max={field.max ?? undefined}
        required={field.required}
        autoComplete="off"
        spellCheck={false}
      />
      {field.help ? (
        <p className="text-xs text-muted-foreground">{field.help}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

export default function Onboarding() {
  const status = useLoaderData<typeof loader>()
  const result = useActionData<typeof action>()
  const errors = result?.errors

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {product.name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up the web frontend
        </h1>
        <p className="text-sm text-muted-foreground">{product.tagline}</p>
      </header>

      <section className="rounded-lg border p-4 text-sm">
        <p className="font-medium">Configuration file</p>
        <code className="mt-1 block break-all text-xs">{status.configPath}</code>
        <p className="mt-1 text-xs text-muted-foreground">
          {status.editable
            ? status.persistent
              ? "Writable and persistent."
              : "Writable, but this path is not on a volume, so a change may not survive a redeploy."
            : "Not writable by this process. Fix the file permissions before onboarding can save."}
        </p>
        {status.reason ? (
          <p className="mt-1 text-xs text-amber-600">{status.reason}</p>
        ) : null}
      </section>

      <Form method="post" className="flex flex-col gap-5">
        {status.fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            error={errorFor(errors, field.key)}
          />
        ))}
        {errorFor(errors, "settings") ? (
          <p className="text-sm text-destructive">
            {errorFor(errors, "settings")}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!status.editable}>
            Save and start
          </Button>
          <span className="text-xs text-muted-foreground">
            The first account you create afterwards becomes the administrator.
          </span>
        </div>
      </Form>
    </main>
  )
}
