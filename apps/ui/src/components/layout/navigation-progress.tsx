import { useNavigation } from "react-router"

// Client navigations wait for the next route's loader, and until then the page
// is unchanged. A thin bar at the top is the only honest signal that something
// is happening. The delay lives in CSS so a quick navigation never flashes it.
export function NavigationProgress() {
  const navigation = useNavigation()
  const pending = navigation.state !== "idle"

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
      >
        {pending ? (
          <div
            data-testid="navigation-progress"
            className="nav-progress-mount h-full w-full"
          >
            <div className="nav-progress-bar h-full w-full bg-primary" />
          </div>
        ) : null}
      </div>
      <span role="status" className="sr-only">
        {pending ? "Loading page" : ""}
      </span>
    </>
  )
}
