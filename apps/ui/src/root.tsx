import { useEffect, type ReactNode } from "react"
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router"

import "./index.css"

import { ErrorBoundary as AppErrorBoundary } from "@/components/common/error-boundary"
import { RegistryGate } from "@/components/common/registry-down"
import { AppShell } from "@/components/layout/app-shell"
import { ThemeProvider } from "@/components/theme-provider"
import { ButtonLink } from "@/components/common/button-link"
import { AuthProvider } from "@/context/auth"
import { resolveActiveAccount } from "@/lib/accounts.server"
import { SERVER_API_URL, serverApi } from "@/lib/api.server"
import { PreloadProvider } from "@/lib/preload"
import { product } from "@/lib/product"
import { readSession, requireSessionSecret } from "@/lib/session.server"

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.remove("light","dark");r.classList.add(d?"dark":"light")}catch(e){}})()`

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#1B1A1F" />
        <link
          rel="icon"
          type="image/svg+xml"
          href="/assets/icon-light.svg"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          type="image/svg+xml"
          href="/assets/icon-dark.svg"
          media="(prefers-color-scheme: dark)"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export async function loader({ request }: { request: Request }) {
  requireSessionSecret()

  const session = await readSession(request)
  // Every account this browser is signed in to, which one is active, and a new
  // cookie whenever the registry disagreed with what was stored. The banner
  // comes along on the same load, so the announcement is in the first paint
  // rather than sliding in after hydration.
  const [{ user, accounts, cookie }, banner] = await Promise.all([
    resolveActiveAccount(session),
    readBanner(),
  ])
  const payload = { user, accounts, apiBaseUrl: SERVER_API_URL, banner }

  return cookie
    ? Response.json(payload, { headers: { "Set-Cookie": cookie } })
    : payload
}

type Banner = { message: string; link: string | null }

// The instance announcement is a nicety, not a dependency: an unreachable
// registry must still render the page (the gate handles saying so), so a
// failure here is simply no banner.
async function readBanner(): Promise<Banner | null> {
  try {
    const meta = await serverApi().instance.meta({ timeoutMs: 2000 })
    return meta.banner ?? null
  } catch {
    return null
  }
}

export function meta() {
  return [
    { title: `${product.name} — Extensions for TurboWarp` },
    { name: "description", content: product.tagline },
    { property: "og:title", content: product.name },
    { property: "og:description", content: product.tagline },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: product.name },
    { name: "twitter:card", content: "summary" },
  ]
}

export default function App() {
  const { user, accounts } = useLoaderData<typeof loader>()
  const { pathname } = useLocation()

  // Embed documents are rendered inside someone else's page, so they skip the
  // site header, footer and toaster and keep only the providers.
  const embedded = pathname.startsWith("/embed/")

  // A reliable signal for browser tests and progressive-enhancement styling:
  // the document has finished hydrating and event handlers are attached.
  useEffect(() => {
    document.documentElement.dataset.clientReady = "true"
  }, [])

  return (
    <ThemeProvider>
      <PreloadProvider>
        <AuthProvider initialUser={user} initialAccounts={accounts}>
          <RegistryGate>
            <AppErrorBoundary>
              {embedded ? <Outlet /> : <AppShell />}
            </AppErrorBoundary>
          </RegistryGate>
        </AuthProvider>
      </PreloadProvider>
    </ThemeProvider>
  )
}

export function ErrorBoundary() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {product.name}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {notFound ? "Page not found" : "Something went wrong"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {notFound
          ? `This page isn’t available on ${product.name}.`
          : "We couldn’t finish loading this page. Try again, or go back to the home page."}
      </p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink to="/">Go to home</ButtonLink>
        <ButtonLink variant="outline" to="/explore">
          Browse extensions
        </ButtonLink>
      </div>
    </div>
  )
}
