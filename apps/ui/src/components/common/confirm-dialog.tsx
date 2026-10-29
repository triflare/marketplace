import { useState } from "react"

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

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  pending = false,
  confirmPhrase,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  pending?: boolean
  /** When set, the confirm button stays disabled until this exact text is typed. */
  confirmPhrase?: string
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ConfirmBody
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          destructive={destructive}
          pending={pending}
          confirmPhrase={confirmPhrase}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  )
}

// The body only mounts while the dialog is open, so the typed text starts empty
// every time without an effect resetting it.
function ConfirmBody({
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  confirmPhrase,
  onCancel,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  destructive: boolean
  pending: boolean
  confirmPhrase?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState("")
  const matched = !confirmPhrase || typed.trim() === confirmPhrase

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {confirmPhrase ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-phrase">
            Type <span className="font-mono">{confirmPhrase}</span> to confirm
          </Label>
          <Input
            id="confirm-phrase"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby="confirm-phrase-help"
          />
          <p id="confirm-phrase-help" className="text-xs text-muted-foreground">
            This cannot be undone, so it asks for the exact name.
          </p>
        </div>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          onClick={onConfirm}
          disabled={pending || !matched}
        >
          {pending ? "Working…" : confirmLabel}
        </Button>
      </DialogFooter>
    </>
  )
}
