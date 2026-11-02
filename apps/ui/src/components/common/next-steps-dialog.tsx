import { ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface NextStep {
  title: string
  description?: ReactNode
  /** Navigates away and closes the dialog. */
  to?: string
  /** Runs in place, for example to clear a form, and closes the dialog. */
  onSelect?: () => void
}

// After an action that changed something, the useful question is no longer
// "did it work" but "what now". This lists the two or three sensible follow-ups
// instead of leaving people on a success message with no way forward.
export function NextStepsDialog({
  open,
  onOpenChange,
  title,
  description,
  steps,
  doneLabel = "Done",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  steps: NextStep[]
  doneLabel?: string
}) {
  const close = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <ul className="flex flex-col gap-2">
          {steps.map((step) => (
            <li key={step.title}>
              {step.to ? (
                <StepLink to={step.to} onClick={close}>
                  <StepText step={step} />
                </StepLink>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                  onClick={() => {
                    step.onSelect?.()
                    close()
                  }}
                >
                  <StepText step={step} />
                  <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {doneLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StepLink({
  to,
  onClick,
  children,
}: {
  to: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
    >
      {children}
      <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}

function StepText({ step }: { step: NextStep }) {
  return (
    <span className="min-w-0">
      <span className="block text-sm font-medium">{step.title}</span>
      {step.description ? (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {step.description}
        </span>
      ) : null}
    </span>
  )
}
