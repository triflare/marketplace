import { Navigate, Outlet, useLocation } from "react-router"

import { useAuth } from "@/context/auth"
import { Skeleton } from "@/components/ui/skeleton"

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return <Outlet />
}

export function RequireAdmin() {
  const { user, loading, isAdmin } = useAuth()

  if (loading) {
    return <Skeleton className="h-64 w-full" />
  }

  if (!user) {
    return <Navigate to="/login?next=%2Fadmin" replace />
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
