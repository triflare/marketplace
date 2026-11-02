import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/registry"
import { cn } from "@/lib/utils"

export function CopyButton({
  value,
  label = "Copy",
  className,
  variant = "outline",
  size = "sm",
  disabled = false,
}: {
  value: string
  label?: string
  className?: string
  variant?: "outline" | "ghost" | "secondary" | "default"
  size?: "sm" | "xs" | "icon-sm"
  disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await copyText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={cn(className)}
      aria-live="polite"
      disabled={disabled}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {size === "icon-sm" ? (
        <span className="sr-only">{label}</span>
      ) : copied ? (
        "Copied"
      ) : (
        label
      )}
    </Button>
  )
}
