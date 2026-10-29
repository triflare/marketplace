import { Component, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

type Props = { children: ReactNode }
type State = { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) {
      return this.props.children
    }

    return (
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col items-start justify-center gap-4 px-4 py-16">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          TwextHub
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          We couldn’t finish loading this page. Try again, or go back to the
          home page.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.assign("/")}>
            Go to home
          </Button>
        </div>
      </div>
    )
  }
}
