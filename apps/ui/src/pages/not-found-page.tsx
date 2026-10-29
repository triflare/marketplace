import { ButtonLink } from "@/components/common/button-link"
import { usePageMeta } from "@/hooks/use-page-meta"

export function NotFoundPage() {
  usePageMeta("Page not found", "This page isn’t available on TwextHub.")

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-start gap-4 py-16">
      <p className="font-mono text-xs text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        This page isn’t here
      </h1>
      <p className="text-sm text-muted-foreground">
        The link may be old, or the extension may have been removed or renamed.
      </p>
      <div className="flex gap-2">
        <ButtonLink to="/">Go home</ButtonLink>
        <ButtonLink variant="outline" to="/explore">
          Browse extensions
        </ButtonLink>
      </div>
    </div>
  )
}
