import { extensionPath, pathValue, pickQuery, requestOptions } from "./http"
import type { HttpClient } from "./http"
import type {
  AccountEmail,
  AdminReportQuery,
  AuditEntry,
  AuthDescriptor,
  AuthSession,
  AutomationToken,
  AutomationTokenCreated,
  BackupCodes,
  BinaryData,
  BroadcastNotificationPayload,
  Collection,
  CreateOrganizationPayload,
  CreateReportPayload,
  CreateSessionPayload,
  CreateTokenPayload,
  CreateUserPayload,
  DecideReportPayload,
  DeprecateVersionPayload,
  DistTags,
  GeneratedPasswordSession,
  DriverCatalog,
  MailOutboxDetail,
  MailOutboxEntry,
  MailOutboxQuery,
  MailOutboxRetryResult,
  ExtensionDetail,
  ExtensionListQuery,
  ExtensionOwner,
  ExtensionOwnerInvite,
  ExtensionSummary,
  ExtensionTransfer,
  ImageOptions,
  LegalDocument,
  MarkNotificationsReadResult,
  Meta,
  MfaRequired,
  Notification,
  NotificationListQuery,
  NotificationPage,
  OidcAuthorizeOptions,
  OidcAuthorizeResult,
  OidcCallbackParams,
  OidcCallbackResult,
  OidcIdentity,
  OidcLinkOptions,
  Organization,
  OrganizationOwner,
  Page,
  PageQuery,
  Passkey,
  PasskeyRegistration,
  PasskeySigninChallenge,
  Passkeys,
  PendingVersion,
  PendingVersionQuery,
  PublishOptions,
  Quota,
  RedirectResult,
  Report,
  ReportOwnerView,
  ReplaceDriversPayload,
  ReplaceDriversResult,
  RequestOptions,
  RotatedPassword,
  SystemReloadResult,
  SystemStatus,
  ReviewVersionPayload,
  SearchOptions,
  ServerConfig,
  ServerConfigUpdate,
  Session,
  SessionListQuery,
  SessionResult,
  SetQuotaPayload,
  Stats,
  TokenListQuery,
  TrendingOptions,
  UpdateConfigPayload,
  UpdateOrganizationPayload,
  UpdateTokenPayload,
  UpdateUserPayload,
  UploadImageOptions,
  User,
  VersionInfo,
  VersionListQuery,
  WebAuthnOptions,
  Webhook,
  WebhookCreated,
  WebhookDelivery,
  WebhookInput,
} from "./types"

const PAGE_KEYS = ["cursor", "limit", "dir"]
const EXTENSION_KEYS = ["sort", "license", "cursor", "limit", "dir"]

function versionPath(namespace: string, id: string, version: string) {
  return `${extensionPath(namespace, id)}/versions/${pathValue(version, "version")}`
}

// ---------------------------------------------------------------------------
// Account and session surfaces
// ---------------------------------------------------------------------------

export class AuthResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  describe(options: RequestOptions = {}): Promise<AuthDescriptor> {
    return this.client.request("/auth", requestOptions(options))
  }

  // The email methods answer the same way for a known and an unknown address,
  // so a page shows "check your email" rather than whether an account exists.
  requestMagicLink(
    payload: { email: string; returnTo?: string },
    options: RequestOptions = {}
  ): Promise<{ sent: true }> {
    return this.client.request("/auth/magic-link", {
      method: "POST",
      json: { email: payload.email, returnTo: payload.returnTo },
      ...requestOptions(options),
    })
  }

  exchangeMagicLink(
    payload: { code: string },
    options: RequestOptions = {}
  ): Promise<SessionResult> {
    return this.client.request("/auth/magic-link/exchange", {
      method: "POST",
      json: { code: payload.code },
      ...requestOptions(options),
    })
  }

  requestEmailCode(
    payload: { email: string },
    options: RequestOptions = {}
  ): Promise<{ sent: true }> {
    return this.client.request("/auth/email-otp", {
      method: "POST",
      json: { email: payload.email },
      ...requestOptions(options),
    })
  }

  verifyEmailCode(
    payload: { email: string; code: string },
    options: RequestOptions = {}
  ): Promise<SessionResult> {
    return this.client.request("/auth/email-otp/verify", {
      method: "POST",
      json: { email: payload.email, code: payload.code },
      ...requestOptions(options),
    })
  }

  // Sign-in with a passkey alone: the handle names the account, the challenge
  // names the ceremony, and the assertion finishes it in one call.
  createPasskeySigninOptions(
    payload: { namespace: string },
    options: RequestOptions = {}
  ): Promise<PasskeySigninChallenge> {
    return this.client.request("/auth/passkey/options", {
      method: "POST",
      json: { namespace: payload.namespace },
      ...requestOptions(options),
    })
  }

  verifyPasskeySignin(
    payload: { flowToken: string; response: WebAuthnOptions },
    options: RequestOptions = {}
  ): Promise<SessionResult> {
    return this.client.request("/auth/passkey/verify", {
      method: "POST",
      json: { flowToken: payload.flowToken, response: payload.response },
      ...requestOptions(options),
    })
  }

  // Registration that hands back the only copy of the password: the account is
  // created and signed in, and the page has to show the secret before leaving.
  registerWithGeneratedPassword(
    payload: { email: string },
    options: RequestOptions = {}
  ): Promise<GeneratedPasswordSession> {
    return this.client.request("/auth/magic-password/register", {
      method: "POST",
      json: { email: payload.email },
      ...requestOptions(options),
    })
  }

  // A new generated password replaces the stored one. The response is the only
  // copy, so the page shows it before moving on. Recent authentication is the
  // server's requirement, and its refusal names what to do about it.
  rotateGeneratedPassword(
    options: RequestOptions = {}
  ): Promise<RotatedPassword> {
    return this.client.request("/auth/magic-password/rotate", {
      method: "POST",
      ...requestOptions(options),
    })
  }

  getOidcAuthorizeUrl(
    options: OidcAuthorizeOptions = {}
  ): Promise<OidcAuthorizeResult> {
    return this.client.request("/auth/oidc/authorize", {
      query: pickQuery(options, ["returnTo"]),
      ...requestOptions(options),
    })
  }

  async oidcCallback(
    params: OidcCallbackParams,
    options: RequestOptions = {}
  ): Promise<
    OidcCallbackResult | AuthSession | MfaRequired | RedirectResult | undefined
  > {
    const response = await this.client.raw("/auth/oidc/callback", {
      query: pickQuery(params, ["code", "state", "error"]),
      responseType: "raw",
      redirect: "manual",
      ...requestOptions(options),
    })

    if (response.type === "opaqueredirect") {
      return { redirectUrl: null }
    }
    if (response.status >= 300 && response.status < 400) {
      return { redirectUrl: response.headers.get("location") }
    }
    const text = await response.text()
    return text === "" ? undefined : JSON.parse(text)
  }

  exchangeOidcCode(
    payload: { code: string },
    options: RequestOptions = {}
  ): Promise<SessionResult> {
    return this.client.request("/auth/oidc/exchange", {
      method: "POST",
      json: { code: payload.code },
      ...requestOptions(options),
    })
  }

  linkOidc(options: OidcLinkOptions = {}): Promise<OidcAuthorizeResult> {
    return this.client.request("/auth/oidc/link", {
      method: "POST",
      json: { returnTo: options.returnTo },
      ...requestOptions(options),
    })
  }

  listOidcIdentities(
    options: RequestOptions = {}
  ): Promise<Collection<OidcIdentity>> {
    return this.client.request("/auth/oidc/identities", requestOptions(options))
  }

  deleteOidcIdentity(
    id: string | number,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(
      `/auth/oidc/identities/${pathValue(id, "OIDC identity id")}`,
      {
        method: "DELETE",
        responseType: "none",
        ...requestOptions(options),
      }
    )
  }

  // The address the account signs in with by email, and whether this instance
  // can move it. Read from the account itself rather than guessed from the
  // driver list: a password-only account has no address at all.
  getEmail(options: RequestOptions = {}): Promise<AccountEmail> {
    return this.client.request("/auth/email", requestOptions(options))
  }

  // The new address is not attached until the code mailed to it is redeemed.
  requestEmailChange(
    payload: { email: string },
    options: RequestOptions = {}
  ): Promise<{ sent: true }> {
    return this.client.request("/auth/email/change", {
      method: "POST",
      json: { email: payload.email },
      ...requestOptions(options),
    })
  }

  confirmEmailChange(
    payload: { email: string; code: string },
    options: RequestOptions = {}
  ): Promise<{ email: string }> {
    return this.client.request("/auth/email/confirm", {
      method: "POST",
      json: { email: payload.email, code: payload.code },
      ...requestOptions(options),
    })
  }

  getMfaState(options: RequestOptions = {}): Promise<Passkeys> {
    return this.client.request("/auth/mfa", requestOptions(options))
  }

  createPasskeyOptions(
    options: RequestOptions = {}
  ): Promise<{ options: WebAuthnOptions }> {
    return this.client.request("/auth/mfa/passkeys/options", {
      method: "POST",
      ...requestOptions(options),
    })
  }

  registerPasskey(
    payload: { response: WebAuthnOptions; label?: string },
    options: RequestOptions = {}
  ): Promise<PasskeyRegistration> {
    return this.client.request("/auth/mfa/passkeys", {
      method: "POST",
      json: { response: payload.response, label: payload.label },
      ...requestOptions(options),
    })
  }

  renamePasskey(
    id: string | number,
    payload: { label: string },
    options: RequestOptions = {}
  ): Promise<Passkey> {
    return this.client.request(
      `/auth/mfa/passkeys/${pathValue(id, "passkey id")}`,
      {
        method: "PATCH",
        json: { label: payload.label },
        ...requestOptions(options),
      }
    )
  }

  deletePasskey(
    id: string | number,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(
      `/auth/mfa/passkeys/${pathValue(id, "passkey id")}`,
      {
        method: "DELETE",
        responseType: "none",
        ...requestOptions(options),
      }
    )
  }

  regenerateBackupCodes(options: RequestOptions = {}): Promise<BackupCodes> {
    return this.client.request("/auth/mfa/backup-codes", {
      method: "POST",
      ...requestOptions(options),
    })
  }

  getSigninOptions(
    payload: { mfaToken: string },
    options: RequestOptions = {}
  ): Promise<{ options: WebAuthnOptions }> {
    return this.client.request("/auth/mfa/options", {
      method: "POST",
      json: { mfaToken: payload.mfaToken },
      ...requestOptions(options),
    })
  }

  verifyMfa(
    payload: {
      mfaToken: string
      response?: WebAuthnOptions
      backupCode?: string
    },
    options: RequestOptions = {}
  ): Promise<AuthSession> {
    return this.client.request("/auth/mfa/verify", {
      method: "POST",
      json: {
        mfaToken: payload.mfaToken,
        response: payload.response,
        backupCode: payload.backupCode,
      },
      ...requestOptions(options),
    })
  }

  getReauthOptions(
    options: RequestOptions = {}
  ): Promise<{ options: WebAuthnOptions }> {
    return this.client.request("/auth/mfa/reauth/options", {
      method: "POST",
      ...requestOptions(options),
    })
  }

  reauth(
    payload: { response: WebAuthnOptions },
    options: RequestOptions = {}
  ): Promise<{ reauthenticatedAt: string }> {
    return this.client.request("/auth/mfa/reauth", {
      method: "POST",
      json: { response: payload.response },
      ...requestOptions(options),
    })
  }
}

export class SessionsResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  create(
    payload: CreateSessionPayload,
    options: RequestOptions = {}
  ): Promise<SessionResult> {
    return this.client.request("/sessions", {
      method: "POST",
      json: { namespace: payload.namespace, password: payload.password },
      ...requestOptions(options),
    })
  }

  list(query: SessionListQuery = {}): Promise<Page<Session>> {
    return this.client.request("/sessions", {
      query: pickQuery(query, ["namespace", ...PAGE_KEYS]),
      ...requestOptions(query),
    })
  }

  revokeCurrent(options: RequestOptions = {}): Promise<void> {
    return this.client.request("/sessions/current", {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }

  delete(id: string, options: RequestOptions = {}): Promise<void> {
    return this.client.request(`/sessions/${pathValue(id, "session id")}`, {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }
}

export class TokensResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  list(query: TokenListQuery = {}): Promise<Page<AutomationToken>> {
    return this.client.request("/tokens", {
      query: pickQuery(query, ["namespace", ...PAGE_KEYS]),
      ...requestOptions(query),
    })
  }

  create(
    payload: CreateTokenPayload,
    options: RequestOptions = {}
  ): Promise<AutomationTokenCreated> {
    return this.client.request("/tokens", {
      method: "POST",
      json: {
        name: payload.name,
        scopes: payload.scopes,
        expiresInDays: payload.expiresInDays,
      },
      ...requestOptions(options),
    })
  }

  update(
    id: string,
    payload: UpdateTokenPayload,
    options: RequestOptions = {}
  ): Promise<AutomationToken> {
    return this.client.request(`/tokens/${pathValue(id, "token id")}`, {
      method: "PATCH",
      json: { name: payload.name, scopes: payload.scopes },
      ...requestOptions(options),
    })
  }

  delete(id: string, options: RequestOptions = {}): Promise<void> {
    return this.client.request(`/tokens/${pathValue(id, "token id")}`, {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }

  revokeCurrent(options: RequestOptions = {}): Promise<void> {
    return this.client.request("/tokens/current", {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }
}

// Avatar and banner endpoints are identical for accounts and organizations;
// only the path and the profile type returned after a write differ.
class ImageResource<T> {
  client: HttpClient
  buildPath: (namespace: string) => string

  constructor(client: HttpClient, buildPath: (namespace: string) => string) {
    this.client = client
    this.buildPath = buildPath
  }

  get(namespace: string, options: ImageOptions = {}): Promise<Blob> {
    return this.client.request(this.buildPath(namespace), {
      query: pickQuery(options, ["v"]),
      responseType: "blob",
      ...requestOptions(options),
    })
  }

  upload(
    namespace: string,
    data: BinaryData,
    options: UploadImageOptions = {}
  ): Promise<T> {
    if (data === undefined || data === null) {
      throw new TypeError("Image data is required")
    }
    const contentType =
      options.contentType ??
      (data instanceof Blob ? data.type : undefined) ??
      "application/octet-stream"
    return this.client.request(this.buildPath(namespace), {
      method: "PUT",
      body: data as BodyInit,
      contentType,
      query: pickQuery(options, ["v"]),
      ...requestOptions(options),
    })
  }

  delete(namespace: string, options: ImageOptions = {}): Promise<T> {
    return this.client.request(this.buildPath(namespace), {
      method: "DELETE",
      query: pickQuery(options, ["v"]),
      ...requestOptions(options),
    })
  }
}

// ---------------------------------------------------------------------------
// Webhooks: one shape, three owner types
// ---------------------------------------------------------------------------

function webhookBase(base: string) {
  return `${base}/webhooks`
}

function webhookPath(base: string, webhookId: number) {
  return `${webhookBase(base)}/${pathValue(webhookId, "webhook id")}`
}

function deliveryPath(base: string, webhookId: number) {
  return `${webhookPath(base, webhookId)}/deliveries`
}

export class AccountWebhooksResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  list(
    namespace: string,
    options: RequestOptions = {}
  ): Promise<Collection<Webhook>> {
    return this.client.request(webhookBase(accountBase(namespace)), {
      ...requestOptions(options),
    })
  }

  create(
    namespace: string,
    payload: WebhookInput,
    options: RequestOptions = {}
  ): Promise<WebhookCreated> {
    return this.client.request(webhookBase(accountBase(namespace)), {
      method: "POST",
      json: {
        url: payload.url,
        events: payload.events,
        active: payload.active,
      },
      ...requestOptions(options),
    })
  }

  delete(
    namespace: string,
    webhookId: number,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(webhookPath(accountBase(namespace), webhookId), {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }

  listDeliveries(
    namespace: string,
    webhookId: number,
    query: PageQuery = {}
  ): Promise<Page<WebhookDelivery>> {
    return this.client.request(
      deliveryPath(accountBase(namespace), webhookId),
      {
        query: pickQuery(query, PAGE_KEYS),
        ...requestOptions(query),
      }
    )
  }

  redeliver(
    namespace: string,
    webhookId: number,
    deliveryId: number,
    options: RequestOptions = {}
  ): Promise<WebhookDelivery> {
    return this.client.request(
      `${deliveryPath(accountBase(namespace), webhookId)}/${pathValue(deliveryId, "delivery id")}/redeliver`,
      { method: "POST", ...requestOptions(options) }
    )
  }
}

export class OrganizationWebhooksResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  list(
    namespace: string,
    options: RequestOptions = {}
  ): Promise<Collection<Webhook>> {
    return this.client.request(webhookBase(organizationBase(namespace)), {
      ...requestOptions(options),
    })
  }

  create(
    namespace: string,
    payload: WebhookInput,
    options: RequestOptions = {}
  ): Promise<WebhookCreated> {
    return this.client.request(webhookBase(organizationBase(namespace)), {
      method: "POST",
      json: {
        url: payload.url,
        events: payload.events,
        active: payload.active,
      },
      ...requestOptions(options),
    })
  }

  delete(
    namespace: string,
    webhookId: number,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(
      webhookPath(organizationBase(namespace), webhookId),
      {
        method: "DELETE",
        responseType: "none",
        ...requestOptions(options),
      }
    )
  }

  listDeliveries(
    namespace: string,
    webhookId: number,
    query: PageQuery = {}
  ): Promise<Page<WebhookDelivery>> {
    return this.client.request(
      deliveryPath(organizationBase(namespace), webhookId),
      { query: pickQuery(query, PAGE_KEYS), ...requestOptions(query) }
    )
  }

  redeliver(
    namespace: string,
    webhookId: number,
    deliveryId: number,
    options: RequestOptions = {}
  ): Promise<WebhookDelivery> {
    return this.client.request(
      `${deliveryPath(organizationBase(namespace), webhookId)}/${pathValue(deliveryId, "delivery id")}/redeliver`,
      { method: "POST", ...requestOptions(options) }
    )
  }
}

export class ExtensionWebhooksResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  list(
    namespace: string,
    id: string,
    options: RequestOptions = {}
  ): Promise<Collection<Webhook>> {
    return this.client.request(webhookBase(extensionPath(namespace, id)), {
      ...requestOptions(options),
    })
  }

  create(
    namespace: string,
    id: string,
    payload: WebhookInput,
    options: RequestOptions = {}
  ): Promise<WebhookCreated> {
    return this.client.request(webhookBase(extensionPath(namespace, id)), {
      method: "POST",
      json: {
        url: payload.url,
        events: payload.events,
        active: payload.active,
      },
      ...requestOptions(options),
    })
  }

  delete(
    namespace: string,
    id: string,
    webhookId: number,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(
      webhookPath(extensionPath(namespace, id), webhookId),
      {
        method: "DELETE",
        responseType: "none",
        ...requestOptions(options),
      }
    )
  }

  listDeliveries(
    namespace: string,
    id: string,
    webhookId: number,
    query: PageQuery = {}
  ): Promise<Page<WebhookDelivery>> {
    return this.client.request(
      deliveryPath(extensionPath(namespace, id), webhookId),
      { query: pickQuery(query, PAGE_KEYS), ...requestOptions(query) }
    )
  }

  redeliver(
    namespace: string,
    id: string,
    webhookId: number,
    deliveryId: number,
    options: RequestOptions = {}
  ): Promise<WebhookDelivery> {
    return this.client.request(
      `${deliveryPath(extensionPath(namespace, id), webhookId)}/${pathValue(deliveryId, "delivery id")}/redeliver`,
      { method: "POST", ...requestOptions(options) }
    )
  }
}

function accountBase(namespace: string) {
  return `/users/${pathValue(namespace, "namespace")}`
}

function organizationBase(namespace: string) {
  return `/orgs/${pathValue(namespace, "namespace")}`
}

// ---------------------------------------------------------------------------
// Accounts and organizations
// ---------------------------------------------------------------------------

export class UsersResource {
  client: HttpClient
  webhooks: AccountWebhooksResource
  avatar: ImageResource<User>
  banner: ImageResource<User>

  constructor(client: HttpClient) {
    this.client = client
    this.webhooks = new AccountWebhooksResource(client)
    this.avatar = new ImageResource<User>(
      client,
      (namespace) => `/users/${pathValue(namespace, "namespace")}/avatar`
    )
    this.banner = new ImageResource<User>(
      client,
      (namespace) => `/users/${pathValue(namespace, "namespace")}/banner`
    )
  }

  create(
    payload: CreateUserPayload,
    options: RequestOptions = {}
  ): Promise<AuthSession> {
    return this.client.request("/users", {
      method: "POST",
      json: {
        namespace: payload.namespace,
        password: payload.password,
        displayName: payload.displayName,
      },
      ...requestOptions(options),
    })
  }

  list(query: PageQuery = {}): Promise<Page<User>> {
    return this.client.request("/users", {
      query: pickQuery(query, PAGE_KEYS),
      ...requestOptions(query),
    })
  }

  get(namespace: string, options: RequestOptions = {}): Promise<User> {
    return this.client.request(`/users/${pathValue(namespace, "namespace")}`, {
      ...requestOptions(options),
    })
  }

  me(options: RequestOptions = {}): Promise<User> {
    return this.client.request("/me", requestOptions(options))
  }

  update(
    namespace: string,
    payload: UpdateUserPayload,
    options: RequestOptions = {}
  ): Promise<User> {
    return this.client.request(`/users/${pathValue(namespace, "namespace")}`, {
      method: "PATCH",
      json: {
        displayName: payload.displayName,
        password: payload.password,
        currentPassword: payload.currentPassword,
        role: payload.role,
        bio: payload.bio,
        website: payload.website,
        github: payload.github,
        avatarUrl: payload.avatarUrl,
        bannerUrl: payload.bannerUrl,
        termsAcceptedVersion: payload.termsAcceptedVersion,
      },
      ...requestOptions(options),
    })
  }

  delete(namespace: string, options: RequestOptions = {}): Promise<void> {
    return this.client.request(`/users/${pathValue(namespace, "namespace")}`, {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }
}

export class OrgsResource {
  client: HttpClient
  webhooks: OrganizationWebhooksResource
  avatar: ImageResource<Organization>
  banner: ImageResource<Organization>

  constructor(client: HttpClient) {
    this.client = client
    this.webhooks = new OrganizationWebhooksResource(client)
    this.avatar = new ImageResource<Organization>(
      client,
      (namespace) => `/orgs/${pathValue(namespace, "namespace")}/avatar`
    )
    this.banner = new ImageResource<Organization>(
      client,
      (namespace) => `/orgs/${pathValue(namespace, "namespace")}/banner`
    )
  }

  create(
    payload: CreateOrganizationPayload,
    options: RequestOptions = {}
  ): Promise<Organization> {
    return this.client.request("/orgs", {
      method: "POST",
      json: {
        namespace: payload.namespace,
        displayName: payload.displayName,
        bio: payload.bio,
        website: payload.website,
        github: payload.github,
        avatarUrl: payload.avatarUrl,
        bannerUrl: payload.bannerUrl,
      },
      ...requestOptions(options),
    })
  }

  list(query: PageQuery = {}): Promise<Page<Organization>> {
    return this.client.request("/orgs", {
      query: pickQuery(query, PAGE_KEYS),
      ...requestOptions(query),
    })
  }

  get(namespace: string, options: RequestOptions = {}): Promise<Organization> {
    return this.client.request(`/orgs/${pathValue(namespace, "namespace")}`, {
      ...requestOptions(options),
    })
  }

  update(
    namespace: string,
    payload: UpdateOrganizationPayload,
    options: RequestOptions = {}
  ): Promise<Organization> {
    return this.client.request(`/orgs/${pathValue(namespace, "namespace")}`, {
      method: "PATCH",
      json: {
        displayName: payload.displayName,
        bio: payload.bio,
        website: payload.website,
        github: payload.github,
        avatarUrl: payload.avatarUrl,
        bannerUrl: payload.bannerUrl,
      },
      ...requestOptions(options),
    })
  }

  delete(namespace: string, options: RequestOptions = {}): Promise<void> {
    return this.client.request(`/orgs/${pathValue(namespace, "namespace")}`, {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }

  listOwners(
    namespace: string,
    options: RequestOptions = {}
  ): Promise<Collection<OrganizationOwner>> {
    return this.client.request(
      `/orgs/${pathValue(namespace, "namespace")}/owners`,
      {
        ...requestOptions(options),
      }
    )
  }

  addOwner(
    namespace: string,
    ownerNamespace: string,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(
      `/orgs/${pathValue(namespace, "namespace")}/owners/${pathValue(ownerNamespace, "owner namespace")}`,
      { method: "PUT", responseType: "none", ...requestOptions(options) }
    )
  }

  removeOwner(
    namespace: string,
    ownerNamespace: string,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(
      `/orgs/${pathValue(namespace, "namespace")}/owners/${pathValue(ownerNamespace, "owner namespace")}`,
      { method: "DELETE", responseType: "none", ...requestOptions(options) }
    )
  }

  listExtensions(
    namespace: string,
    query: ExtensionListQuery = {}
  ): Promise<Page<ExtensionSummary>> {
    return this.client.request(
      `/orgs/${pathValue(namespace, "namespace")}/extensions`,
      {
        query: pickQuery(query, EXTENSION_KEYS),
        ...requestOptions(query),
      }
    )
  }
}

// ---------------------------------------------------------------------------
// Notifications, reports, and the public instance surface
// ---------------------------------------------------------------------------

function toNotificationId(id: string | number): number {
  const isNumericString =
    typeof id === "string" && id.trim() !== "" && !Number.isNaN(Number(id))
  if (typeof id !== "number" && !isNumericString) {
    throw new TypeError("notification ids must be integers")
  }
  const value = Number(id)
  if (!Number.isInteger(value)) {
    throw new TypeError("notification ids must be integers")
  }
  return value
}

export class NotificationsResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  list(query: NotificationListQuery = {}): Promise<NotificationPage> {
    return this.client.request("/notifications", {
      query: pickQuery(query, ["unread", ...PAGE_KEYS]),
      ...requestOptions(query),
    })
  }

  markRead(
    payload: { ids: Array<string | number> } | { all: true },
    options: RequestOptions = {}
  ): Promise<MarkNotificationsReadResult> {
    let body: { all: true } | { ids: number[] }
    if ("all" in payload && payload.all === true) {
      body = { all: true }
    } else {
      const ids = "ids" in payload ? payload.ids : []
      body = { ids: Array.from(ids, toNotificationId) }
    }
    return this.client.request("/notifications", {
      method: "PATCH",
      json: body,
      ...requestOptions(options),
    })
  }

  markOneRead(id: string, options: RequestOptions = {}): Promise<Notification> {
    return this.client.request(
      `/notifications/${pathValue(id, "notification id")}`,
      { method: "PATCH", ...requestOptions(options) }
    )
  }
}

export class ReportsResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  create(
    payload: CreateReportPayload,
    options: RequestOptions = {}
  ): Promise<ReportOwnerView> {
    return this.client.request("/reports", {
      method: "POST",
      json: {
        targetType: payload.targetType,
        targetNamespace: payload.targetNamespace,
        targetExtensionId: payload.targetExtensionId,
        reason: payload.reason,
        description: payload.description,
      },
      ...requestOptions(options),
    })
  }

  list(query: PageQuery = {}): Promise<Page<ReportOwnerView>> {
    return this.client.request("/reports", {
      query: pickQuery(query, PAGE_KEYS),
      ...requestOptions(query),
    })
  }

  get(id: string, options: RequestOptions = {}): Promise<ReportOwnerView> {
    return this.client.request(`/reports/${pathValue(id, "report id")}`, {
      ...requestOptions(options),
    })
  }
}

export class InstanceResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  meta(options: RequestOptions = {}): Promise<Meta> {
    return this.client.request("/meta", requestOptions(options))
  }

  stats(options: RequestOptions = {}): Promise<Stats> {
    return this.client.request("/stats", requestOptions(options))
  }

  terms(options: RequestOptions = {}): Promise<LegalDocument> {
    return this.client.request("/terms", requestOptions(options))
  }

  privacy(options: RequestOptions = {}): Promise<LegalDocument> {
    return this.client.request("/privacy", requestOptions(options))
  }

  atomFeed(options: RequestOptions = {}): Promise<string> {
    return this.client.request("/feed.atom", {
      responseType: "text",
      ...requestOptions(options),
    })
  }
}

// ---------------------------------------------------------------------------
// Extensions and everything that hangs off one
// ---------------------------------------------------------------------------

export class ExtensionVersionsResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  list(
    namespace: string,
    id: string,
    query: VersionListQuery = {}
  ): Promise<Page<VersionInfo>> {
    return this.client.request(`${extensionPath(namespace, id)}/versions`, {
      query: pickQuery(query, ["range", "status", ...PAGE_KEYS]),
      ...requestOptions(query),
    })
  }

  get(
    namespace: string,
    id: string,
    version: string,
    options: RequestOptions = {}
  ): Promise<VersionInfo> {
    return this.client.request(versionPath(namespace, id, version), {
      ...requestOptions(options),
    })
  }

  publish(
    namespace: string,
    id: string,
    tarball: BinaryData,
    options: PublishOptions = {}
  ): Promise<VersionInfo> {
    if (tarball === undefined || tarball === null) {
      throw new TypeError("A gzipped project tarball is required")
    }
    return this.client.request(`${extensionPath(namespace, id)}/versions`, {
      method: "POST",
      body: tarball as BodyInit,
      contentType: options.contentType ?? "application/gzip",
      ...requestOptions(options),
    })
  }

  review(
    namespace: string,
    id: string,
    version: string,
    payload: ReviewVersionPayload | DeprecateVersionPayload,
    options: RequestOptions = {}
  ): Promise<VersionInfo> {
    const body =
      "status" in payload
        ? { status: payload.status, reason: payload.reason }
        : { deprecationMessage: payload.deprecationMessage }
    return this.client.request(versionPath(namespace, id, version), {
      method: "PATCH",
      json: body,
      ...requestOptions(options),
    })
  }

  delete(
    namespace: string,
    id: string,
    version: string,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(versionPath(namespace, id, version), {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }

  source(
    namespace: string,
    id: string,
    version: string,
    options: RequestOptions = {}
  ): Promise<Blob> {
    return this.client.request(
      `${versionPath(namespace, id, version)}/source`,
      {
        responseType: "blob",
        ...requestOptions(options),
      }
    )
  }

  download(
    namespace: string,
    id: string,
    version: string,
    options: RequestOptions = {}
  ): Promise<Blob> {
    return this.client.request(
      `${versionPath(namespace, id, version)}/download`,
      { responseType: "blob", ...requestOptions(options) }
    )
  }
}

export class ExtensionTagsResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  get(
    namespace: string,
    id: string,
    options: RequestOptions = {}
  ): Promise<DistTags> {
    return this.client.request(`${extensionPath(namespace, id)}/tags`, {
      ...requestOptions(options),
    })
  }

  set(
    namespace: string,
    id: string,
    tag: string,
    version: string,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(
      `${extensionPath(namespace, id)}/tags/${pathValue(tag, "tag")}`,
      {
        method: "PUT",
        json: { version },
        responseType: "none",
        ...requestOptions(options),
      }
    )
  }

  delete(
    namespace: string,
    id: string,
    tag: string,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(
      `${extensionPath(namespace, id)}/tags/${pathValue(tag, "tag")}`,
      { method: "DELETE", responseType: "none", ...requestOptions(options) }
    )
  }
}

export class ExtensionOwnersResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  list(
    namespace: string,
    id: string,
    options: RequestOptions = {}
  ): Promise<Collection<ExtensionOwner>> {
    return this.client.request(`${extensionPath(namespace, id)}/owners`, {
      ...requestOptions(options),
    })
  }

  listInvites(
    namespace: string,
    id: string,
    options: RequestOptions = {}
  ): Promise<Collection<ExtensionOwnerInvite>> {
    return this.client.request(
      `${extensionPath(namespace, id)}/owners/pending`,
      {
        ...requestOptions(options),
      }
    )
  }

  invite(
    namespace: string,
    id: string,
    ownerNamespace: string,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(ownerPath(namespace, id, ownerNamespace), {
      method: "PUT",
      responseType: "none",
      ...requestOptions(options),
    })
  }

  remove(
    namespace: string,
    id: string,
    ownerNamespace: string,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(ownerPath(namespace, id, ownerNamespace), {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }

  accept(
    namespace: string,
    id: string,
    ownerNamespace: string,
    options: RequestOptions = {}
  ): Promise<{ data: { namespace: string; id: string; owner: string } }> {
    return this.client.request(
      `${ownerPath(namespace, id, ownerNamespace)}/accept`,
      { method: "POST", ...requestOptions(options) }
    )
  }
}

function ownerPath(namespace: string, id: string, ownerNamespace: string) {
  return `${extensionPath(namespace, id)}/owners/${pathValue(ownerNamespace, "owner namespace")}`
}

export class ExtensionTransfersResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  list(
    namespace: string,
    id: string,
    options: RequestOptions = {}
  ): Promise<Collection<ExtensionTransfer>> {
    return this.client.request(`${extensionPath(namespace, id)}/transfers`, {
      ...requestOptions(options),
    })
  }

  offer(
    namespace: string,
    id: string,
    to: string,
    options: RequestOptions = {}
  ): Promise<{ data: { namespace: string; id: string; to: string } }> {
    return this.client.request(`${extensionPath(namespace, id)}/transfers`, {
      method: "POST",
      json: { to },
      ...requestOptions(options),
    })
  }

  withdraw(
    namespace: string,
    id: string,
    toNamespace: string,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(transferPath(namespace, id, toNamespace), {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }

  accept(
    namespace: string,
    id: string,
    toNamespace: string,
    options: RequestOptions = {}
  ): Promise<{
    data: { namespace: string; id: string; from: string; versions: number }
  }> {
    return this.client.request(
      `${transferPath(namespace, id, toNamespace)}/accept`,
      {
        method: "POST",
        ...requestOptions(options),
      }
    )
  }
}

function transferPath(namespace: string, id: string, toNamespace: string) {
  return `${extensionPath(namespace, id)}/transfers/${pathValue(toNamespace, "destination namespace")}`
}

export class ExtensionsResource {
  client: HttpClient
  versions: ExtensionVersionsResource
  tags: ExtensionTagsResource
  owners: ExtensionOwnersResource
  transfers: ExtensionTransfersResource
  webhooks: ExtensionWebhooksResource

  constructor(client: HttpClient) {
    this.client = client
    this.versions = new ExtensionVersionsResource(client)
    this.tags = new ExtensionTagsResource(client)
    this.owners = new ExtensionOwnersResource(client)
    this.transfers = new ExtensionTransfersResource(client)
    this.webhooks = new ExtensionWebhooksResource(client)
  }

  list(query: ExtensionListQuery = {}): Promise<Page<ExtensionSummary>> {
    return this.client.request("/extensions", {
      query: pickQuery(query, ["sort", "license", "namespace", ...PAGE_KEYS]),
      ...requestOptions(query),
    })
  }

  // `q` on the listing is the supported search: `/search` is deprecated and
  // sends `Deprecation` and `Sunset`. The method keeps its name because that is
  // what a caller is doing, not which URL it happens to hit.
  search(
    text: string,
    options: SearchOptions = {}
  ): Promise<Page<ExtensionSummary>> {
    return this.client.request("/extensions", {
      query: {
        q: text,
        ...pickQuery(options, ["sort", "license", ...PAGE_KEYS]),
      },
      ...requestOptions(options),
    })
  }

  trending(options: TrendingOptions = {}): Promise<Page<ExtensionSummary>> {
    return this.client.request("/extensions/trending", {
      query: pickQuery(options, ["limit"]),
      ...requestOptions(options),
    })
  }

  get(
    namespace: string,
    id: string,
    options: RequestOptions = {}
  ): Promise<ExtensionDetail> {
    return this.client.request(extensionPath(namespace, id), {
      ...requestOptions(options),
    })
  }

  delete(
    namespace: string,
    id: string,
    options: RequestOptions = {}
  ): Promise<void> {
    return this.client.request(extensionPath(namespace, id), {
      method: "DELETE",
      responseType: "none",
      ...requestOptions(options),
    })
  }
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export class AdminResource {
  client: HttpClient

  constructor(client: HttpClient) {
    this.client = client
  }

  updateTerms(
    payload: { body: string },
    options: RequestOptions = {}
  ): Promise<LegalDocument> {
    return this.client.request("/admin/terms", {
      method: "PATCH",
      json: { body: payload.body },
      ...requestOptions(options),
    })
  }

  updatePrivacy(
    payload: { body: string },
    options: RequestOptions = {}
  ): Promise<LegalDocument> {
    return this.client.request("/admin/privacy", {
      method: "PATCH",
      json: { body: payload.body },
      ...requestOptions(options),
    })
  }

  listAudit(query: PageQuery = {}): Promise<Page<AuditEntry>> {
    return this.client.request("/admin/audit", {
      query: pickQuery(query, PAGE_KEYS),
      ...requestOptions(query),
    })
  }

  getQuota(namespace: string, options: RequestOptions = {}): Promise<Quota> {
    return this.client.request(
      `/admin/users/${pathValue(namespace, "namespace")}/quota`,
      { ...requestOptions(options) }
    )
  }

  setQuota(
    namespace: string,
    payload: SetQuotaPayload,
    options: RequestOptions = {}
  ): Promise<Quota> {
    return this.client.request(
      `/admin/users/${pathValue(namespace, "namespace")}/quota`,
      {
        method: "PATCH",
        json: { maxBlobBytes: payload.maxBlobBytes },
        ...requestOptions(options),
      }
    )
  }

  getMetrics(options: RequestOptions = {}): Promise<string> {
    return this.client.request("/admin/metrics", {
      responseType: "text",
      ...requestOptions(options),
    })
  }

  getConfig(options: RequestOptions = {}): Promise<ServerConfig> {
    return this.client.request("/admin/config", requestOptions(options))
  }

  updateConfig(
    payload: UpdateConfigPayload,
    options: RequestOptions = {}
  ): Promise<ServerConfigUpdate> {
    return this.client.request("/admin/config", {
      method: "PUT",
      json: { settings: payload.settings },
      ...requestOptions(options),
    })
  }

  // The configured instances of every driver kind, and what could be swapped
  // in. Secret options arrive masked, so the form never holds a stored key.
  listDrivers(options: RequestOptions = {}): Promise<DriverCatalog> {
    return this.client.request("/admin/drivers", requestOptions(options))
  }

  replaceDrivers(
    kind: string,
    payload: ReplaceDriversPayload,
    options: RequestOptions = {}
  ): Promise<ReplaceDriversResult> {
    return this.client.request(
      `/admin/drivers/${pathValue(kind, "driver kind")}`,
      {
        method: "PUT",
        json: {
          instances: payload.instances,
          ...(payload.confirm ? { confirm: true } : {}),
        },
        ...requestOptions(options),
      }
    )
  }

  // The running process: what a change needs in order to reach this build, and
  // the two ways to make it do so.
  getSystem(options: RequestOptions = {}): Promise<SystemStatus> {
    return this.client.request("/admin/system", requestOptions(options))
  }

  reloadSystem(options: RequestOptions = {}): Promise<SystemReloadResult> {
    return this.client.request("/admin/system/reload", {
      method: "POST",
      ...requestOptions(options),
    })
  }

  restartSystem(options: RequestOptions = {}): Promise<{ restarting: true }> {
    return this.client.request("/admin/system/restart", {
      method: "POST",
      // The API refuses to exit unsupervised, and asks for this word so a
      // restart is never the result of a stray click.
      json: { confirm: "restart" },
      ...requestOptions(options),
    })
  }

  listMailOutbox(query: MailOutboxQuery = {}): Promise<Page<MailOutboxEntry>> {
    return this.client.request("/admin/mail/outbox", {
      query: pickQuery(query, ["status", "purpose", ...PAGE_KEYS]),
      ...requestOptions(query),
    })
  }

  getMailOutboxEntry(
    id: string,
    options: RequestOptions = {}
  ): Promise<MailOutboxDetail> {
    return this.client.request(
      `/admin/mail/outbox/${pathValue(id, "outbox id")}`,
      { ...requestOptions(options) }
    )
  }

  retryMailOutboxEntry(
    id: string,
    options: RequestOptions = {}
  ): Promise<MailOutboxRetryResult> {
    return this.client.request(
      `/admin/mail/outbox/${pathValue(id, "outbox id")}/retry`,
      { method: "POST", ...requestOptions(options) }
    )
  }

  broadcastNotification(
    payload: BroadcastNotificationPayload,
    options: RequestOptions = {}
  ): Promise<{ created: number }> {
    return this.client.request("/admin/notifications", {
      method: "POST",
      json: { message: payload.message },
      ...requestOptions(options),
    })
  }

  listReports(query: AdminReportQuery = {}): Promise<Page<Report>> {
    return this.client.request("/admin/reports", {
      query: pickQuery(query, ["status", "targetType", ...PAGE_KEYS]),
      ...requestOptions(query),
    })
  }

  getReport(id: string, options: RequestOptions = {}): Promise<Report> {
    return this.client.request(`/admin/reports/${pathValue(id, "report id")}`, {
      ...requestOptions(options),
    })
  }

  decideReport(
    id: string,
    payload: DecideReportPayload,
    options: RequestOptions = {}
  ): Promise<Report> {
    return this.client.request(`/admin/reports/${pathValue(id, "report id")}`, {
      method: "PATCH",
      json: { status: payload.status, note: payload.note },
      ...requestOptions(options),
    })
  }

  listPendingVersions(
    query: PendingVersionQuery = {}
  ): Promise<Page<PendingVersion>> {
    return this.client.request("/versions", {
      query: {
        status: query.status ?? "pending",
        ...pickQuery(query, PAGE_KEYS),
      },
      ...requestOptions(query),
    })
  }
}
