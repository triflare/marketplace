import { useEffect } from "react"
import { useLocation } from "react-router"

export function ScrollToTop() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [pathname, search])

  return null
}
