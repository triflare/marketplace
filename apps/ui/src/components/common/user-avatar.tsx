import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { initials } from "@/lib/format"
import { assetUrl } from "@/lib/twexthub"

export function UserAvatar({
  name,
  src,
  size = "default",
  className,
}: {
  name: string
  src?: string | null
  size?: "sm" | "default" | "lg"
  className?: string
}) {
  const resolved = assetUrl(src)
  const textSize =
    size === "lg" ? "text-xl" : size === "sm" ? "text-[10px]" : undefined

  return (
    <Avatar size={size} className={className}>
      {resolved ? <AvatarImage src={resolved} alt="" /> : null}
      <AvatarFallback className={textSize}>
        {initials(name) || "?"}
      </AvatarFallback>
    </Avatar>
  )
}
