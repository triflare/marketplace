import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("explore", "routes/explore.tsx"),
  route("authors", "routes/authors.tsx"),
  route("organizations", "routes/organizations.tsx"),
  route("saved", "routes/saved.tsx"),
  route("developers", "routes/developers.tsx"),
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("embeds", "routes/embeds.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("stay-signed-in", "routes/stay-signed-in.tsx"),
  route("oidc/callback", "routes/oidc-callback.tsx"),
  route("device", "routes/device.tsx"),

  layout("routes/require-auth.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("notifications", "routes/notifications.tsx"),
    route("settings", "routes/settings.tsx"),
    route("publish", "routes/publish.tsx"),
    route("organizations/:namespace/manage", "routes/organization-manage.tsx"),
    route(":namespace/:id/manage", "routes/extension-manage.tsx"),
  ]),

  layout("routes/require-admin.tsx", [
    route("admin", "routes/admin.tsx"),
    route("admin/users/:namespace", "routes/admin-user.tsx"),
  ]),

  route("__api", "routes/rpc.ts"),
  route("__session/remember", "routes/remember.ts"),
  route("__session/accounts", "routes/session-accounts.ts"),
  route("__oidc/link", "routes/oidc-link.ts"),
  route("__device/:action", "routes/device-flow.ts"),
  route("__asset", "routes/asset.ts"),
  route("__badge/*", "routes/badge.ts"),

  route("embed/:namespace/:id", "routes/embed-extension.tsx"),
  route("embed/:namespace", "routes/embed-profile.tsx"),

  route(":namespace/:id", "routes/extension.tsx"),
  route(":namespace", "routes/author.tsx"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig
