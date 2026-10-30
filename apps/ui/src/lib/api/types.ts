// Response and request shapes for the registry API. They mirror the v1 OpenAPI
// document and, where the live server differs (for example downloads arriving
// as a string), the wider observed type is used. Every type here is
// compile-time only.
//
// Adapted from @twextjs/twexthubkit's type declarations (Apache-2.0), the client
// this app used before it spoke to the API directly.

export interface ProblemDetails {
  type?: string
  title: string
  status: number
  detail?: string
  instance?: string
  errors?: Array<{ field: string; message: string }>
  buildLog?: string
  buildError?: string
}

export type UserRole = "admin" | "normal"
export type NamespaceKind = "user" | "organization"
export type TokenScope =
  | "publish"
  | "yank"
  | "read:source"
  | "manage:account"
  | "manage:orgs"
  | "manage:sessions"
  | "manage:tokens"
  | "admin"

export type ModerationStatus =
  "staging" | "pending" | "published" | "rejected" | "yanked" | "deprecated"

export type VersionStatus = ModerationStatus
export type SortOrder = "recent" | "downloads" | "updated" | "name"
export type PageDirection = "back"
export type BadgeField = "version" | "downloads" | "license"

export type WebhookEvent =
  | "version.published"
  | "version.yanked"
  | "version.deprecated"
  | "version.rejected"
  | "owners.invited"
  | "owners.changed"
  | "extension.transferred"

export type NotificationKind =
  | "review.approved"
  | "review.rejected"
  | "terms.bumped"
  | "tokens.revoked"
  | "role.changed"
  | "broadcast"
  | "extension.owner.invited"
  | "extension.owner.withdrawn"
  | "extension.owner.added"
  | "extension.owner.removed"
  | "extension.transfer.requested"
  | "extension.transfer.completed"
  | "organization.owner.added"
  | "organization.owner.removed"

export type ReportTargetType = "user" | "organization" | "extension"
export type ReportReason =
  | "spam"
  | "harassment"
  | "malicious_code"
  | "copyright"
  | "impersonation"
  | "other"
export type ReportStatus = "open" | "resolved" | "dismissed"

export interface PageLinks {
  self: string
  next: string | null
  prev: string | null
}

export interface Page<T> {
  data: T[]
  _links: PageLinks
}

export interface Collection<T> {
  data: T[]
}

export interface RequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

// Where a client keeps the revision of each document it has read. The API
// refuses a write that names none (428) and one that names a superseded
// revision (412), so a caller that builds a client per request supplies a store
// that outlives it — keyed by whatever separates its callers' credentials.
export interface EtagStore {
  get(path: string): string | undefined
  set(path: string, tag: string): void
  delete(path: string): void
}

export interface ApiClientOptions {
  timeoutMs?: number
  baseUrl?: string | URL
  token?: string | null
  headers?: Record<string, string>
  fetch?: typeof fetch
  etags?: EtagStore
}

export interface PageQuery extends RequestOptions {
  cursor?: string
  limit?: number
  dir?: PageDirection
}

export interface User {
  namespace: string
  kind?: NamespaceKind
  displayName: string
  role?: UserRole
  hasPublished: boolean
  bio?: string
  website?: string | null
  github?: string | null
  avatarUrl?: string | null
  bannerUrl?: string | null
  createdAt: string
  termsAcceptedVersion?: number | null
}

export interface Organization {
  namespace: string
  displayName: string
  bio: string
  website?: string | null
  github?: string | null
  avatarUrl?: string | null
  bannerUrl?: string | null
  createdAt: string
  _links: {
    self: string
    extensions: string
    owners: string
    avatar: string
    banner: string
  }
}

export interface OrganizationOwner {
  namespace: string
  displayName: string
  avatarUrl?: string | null
  addedAt: string
}

export interface Session {
  id: string
  createdAt: string
  expiresAt: string
  lastUsedAt?: string | null
}

export interface AuthSession {
  session: Session
  user: User
  token: string
}

export interface MfaRequired {
  mfaRequired: true
  mfaToken: string
  methods: Array<"passkey" | "backup_code">
}

export type SessionResult = AuthSession | MfaRequired

export interface Passkey {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

export interface Passkeys {
  enabled: boolean
  passkeys: Passkey[]
  backupCodesRemaining: number
}

export type WebAuthnOptions = Record<string, unknown>

export interface PasskeyRegistration {
  passkey: Passkey
  backupCodes: string[] | null
}

export interface BackupCodes {
  backupCodes: string[]
}

// What a driver says about itself, as the server publishes it. A method set
// that leaves a driver out does not advertise it at all, so the pages read the
// list rather than guessing from the older flags.
export interface AuthMethodCapabilities {
  signIn?: boolean
  register?: boolean
  link?: boolean
  mfa?: boolean
  browser?: boolean
}

export interface AuthMethod {
  kind: string
  driver: string
  id: string
  label: string
  capabilities: AuthMethodCapabilities
  requirements: { mail?: boolean }
  describe: Record<string, unknown>
}

export interface AuthDescriptor {
  // One entry per configured auth driver. Optional so a page still renders
  // against a server that predates the registry.
  methods?: AuthMethod[]
  passwordAuth: boolean
  // "closed" means no form on this page can create an account.
  registration?: "open" | "closed"
  oidc: {
    issuer: string
    required: boolean
  } | null
  device: {
    verificationUrl: string
  } | null
}

// The address the account's mail-backed sign-in methods hold. `email` is null
// for an account that has none, and `changeable` is false when there is no
// address to move or the instance has no mail driver to send a code with.
export interface AccountEmail {
  email: string | null
  changeable: boolean
}

// Registration through the generated-password driver: the response is the only
// place the password appears, so a page has to show it before moving on.
export interface GeneratedPasswordSession extends AuthSession {
  password: string
  passwordShownOnce: true
}

// The challenge a passkey sign-in is verified against, and the token that names
// it. The browser's assertion never touches the session token.
export interface PasskeySigninChallenge {
  flowToken: string
  options: WebAuthnOptions
}

export interface OidcIdentity {
  id: string
  issuer: string
  subject: string
  email: string | null
  createdAt: string
}

export interface OidcAuthorizeResult {
  authorizationUrl: string
}

export interface OidcCallbackResult {
  linked: boolean
  issuer?: string
  subject?: string
}

export interface RedirectResult {
  redirectUrl: string | null
}

export interface AutomationToken {
  id: string
  name: string
  scopes: TokenScope[]
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
}

export interface AutomationTokenCreated extends AutomationToken {
  token: string
}

export interface WebhookInput {
  url: string
  events: WebhookEvent[]
  active?: boolean
}

export interface Webhook {
  id: number
  namespace: string
  extension_id: string | null
  url: string
  events: WebhookEvent[]
  active: boolean
  last_delivery_status?: string | null
  last_delivery_at?: string | null
  created_at: string
}

export interface WebhookCreated extends Webhook {
  secret: string
}

export interface WebhookDelivery {
  id: number
  event: WebhookEvent
  payload: Record<string, unknown>
  attempt: number
  max_attempts: number
  status: "pending" | "delivering" | "retrying" | "delivered" | "failed"
  next_attempt_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface BuildWarning {
  code: "fetch" | "eval" | "new-function" | "xmlhttprequest" | "insecure-http"
  file: string
  line: number
  message: string
}

export interface VersionInfo {
  namespace: string
  id: string
  version: string
  status: VersionStatus
  name?: string
  license?: string
  description?: string
  author?: string | null
  createdAt: string
  downloads: number | string
  publishedAt?: string
  deprecation?: string | null
  rejectionReason?: string | null
  dist?: {
    downloadUrl: string
    digest?: string
    integrity?: string
  }
  buildLog?: string
  warnings?: BuildWarning[]
  sourceUrl?: string
  _links?: {
    self: string
    extension: string
    author: string
    download?: string
    source?: string
  }
}

export interface PendingVersion extends VersionInfo {
  ownerNamespace: string
}

export interface ExtensionSummary {
  namespace: string
  id: string
  name: string
  version: string
  description: string
  publishedAt: string
  downloads?: number | string
}

export interface ExtensionDetail extends ExtensionSummary {
  author: string | null
  license: string
  color1?: string
  color2?: string
  color3?: string
  isUnsandboxed?: boolean | null
  versions: VersionInfo[]
}

export interface ExtensionOwner {
  namespace: string
  display_name: string
  kind: NamespaceKind
  role?: UserRole
  added_at?: string
}

export interface ExtensionOwnerInvite {
  namespace: string
  display_name: string
  kind: NamespaceKind
  created_at?: string
  invited_by?: string | null
}

export interface ExtensionTransfer {
  to: string
  display_name: string
  kind: NamespaceKind
  created_at: string
  requested_by?: string | null
}

export type DistTags = Record<string, string>

export interface Notification {
  id: string
  kind: NotificationKind
  message: string
  payload: Record<string, unknown>
  read: boolean
  createdAt: string
}

export interface NotificationPage extends Page<Notification> {
  unreadCount: number
}

export interface MarkNotificationsReadResult {
  updated: number
}

export interface ReportTarget {
  type: ReportTargetType
  namespace: string
  id: string | null
}

export interface Report {
  id: string
  reporter: string
  target: ReportTarget
  reason: ReportReason
  description: string
  status: ReportStatus
  reviewedBy: string | null
  reviewedAt: string | null
  resolutionNote: string | null
  createdAt: string
  updatedAt: string
}

export interface ReportOwnerView {
  id: string
  target: ReportTarget
  reason: ReportReason
  status: ReportStatus
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AuditEntry {
  id: string
  actor: string
  action: string
  target: {
    namespace?: string | null
    id?: string | null
    version?: string | null
  }
  detail: Record<string, unknown>
  createdAt: string
}

export interface Quota {
  namespace: string
  blobBytes: number
  maxBlobBytes: number | null
}

export interface Meta {
  name: string
  version: string
  tagline: string
  homepage: string
  // The instance announcement the shell shows across the top, or null.
  banner?: { message: string; link: string | null } | null
}

export interface Stats {
  published: number
  pending: number
  authors: number
  downloads: number
}

export interface LegalDocument {
  version: number
  body: string
  updatedAt: string
}

export type ServerSettingType =
  "string" | "longtext" | "number" | "bytes" | "boolean" | "url" | "origins"

export interface ServerSetting {
  key: string
  label: string
  help?: string | null
  type: ServerSettingType
  min?: number | null
  max?: number | null
  restartRequired: boolean
  value: unknown
}

export interface ServerConfig {
  editable: boolean
  reason?: string | null
  configPath: string
  settings: ServerSetting[]
}

export interface ServerConfigUpdate {
  changed: Record<string, { before: unknown; after: unknown }>
  restartRequired: string[]
  settings: ServerSetting[]
}

export type DriverOptionType = "text" | "number" | "boolean" | "url" | "secret"

// One setting a driver takes, as the server describes it. The admin form is
// generated from this schema rather than written per driver, so a driver that
// gains an option needs no change here.
export interface DriverOption {
  key: string
  label: string
  type: DriverOptionType
  required?: boolean
  secret?: boolean
  default?: unknown
}

// An instance that is running. Secret options come back masked as
// `{ set: true }` rather than as their value.
export interface DriverInstance {
  id: string
  driver: string
  label: string
  capabilities: Record<string, unknown>
  requirements: Record<string, unknown>
  options: Record<string, unknown>
  state: "active" | "error"
}

export interface AvailableDriver {
  driver: string
  label: string
  capabilities: Record<string, unknown>
  requirements: Record<string, unknown>
  options: DriverOption[]
}

export interface DriverKind {
  label: string
  instances: DriverInstance[]
  available: AvailableDriver[]
}

// Keyed by kind id (`auth`, `mail`, `storage`, ...).
export interface DriverCatalog {
  drivers: Record<string, DriverKind>
  revision: Record<string, number>
}

// What the form sends. A blank option is omitted, which the server reads as its
// default; a blank secret leaves the stored one in place.
export interface DriverInstanceInput {
  id?: string
  driver: string
  options?: Record<string, unknown>
}

export interface ReplaceDriversPayload {
  instances: DriverInstanceInput[]
  confirm?: boolean
}

export interface ReplaceDriversResult {
  kind: string
  applied: "live" | "restart"
  revision: number
  instances: DriverInstance[]
}

export interface SystemStatus {
  supervised: boolean
  startedAt: string
  configPath: string | null
  driversRevision: Record<string, number>
  lastReload: string | null
}

export interface SystemReloadResult {
  reloaded: true
  driversRevision: Record<string, number>
}

export type MailOutboxStatus = "pending" | "sent" | "failed"

// One outbound message as the list reports it. The body is not here: it is
// what was sent, which for a sign-in notice is a one-time link.
export interface MailOutboxEntry {
  id: string
  to: string
  subject: string
  purpose: string | null
  driver: string | null
  status: MailOutboxStatus
  attempts: number
  lastError: string | null
  createdAt: string
  updatedAt: string
  sentAt: string | null
}

export interface MailOutboxMessage {
  to?: string
  subject?: string
  text?: string
  html?: string
  replyTo?: string
  purpose?: string
}

export interface MailOutboxDetail extends MailOutboxEntry {
  message: MailOutboxMessage
}

export interface MailOutboxQuery extends PageQuery {
  status?: MailOutboxStatus
  purpose?: string
}

export interface MailOutboxRetryResult extends MailOutboxDetail {
  result: Record<string, unknown> | null
}

export interface CreateUserPayload {
  namespace: string
  password: string
  displayName?: string
}

export interface UpdateUserPayload {
  displayName?: string
  password?: string
  currentPassword?: string
  role?: UserRole
  bio?: string | null
  website?: string | null
  github?: string | null
  avatarUrl?: string | null
  bannerUrl?: string | null
  termsAcceptedVersion?: number | string
}

export interface CreateOrganizationPayload {
  namespace: string
  displayName?: string
  bio?: string | null
  website?: string | null
  github?: string | null
  avatarUrl?: string | null
  bannerUrl?: string | null
}

export interface UpdateOrganizationPayload {
  displayName?: string
  bio?: string | null
  website?: string | null
  github?: string | null
  avatarUrl?: string | null
  bannerUrl?: string | null
}

export interface CreateSessionPayload {
  namespace: string
  password: string
}

export interface CreateTokenPayload {
  name: string
  scopes: TokenScope[]
  expiresInDays?: number
}

export interface UpdateTokenPayload {
  name?: string
  scopes?: TokenScope[]
}

export interface CreateReportPayload {
  targetType: ReportTargetType
  targetNamespace: string
  targetExtensionId?: string
  reason: ReportReason
  description: string
}

export interface ReviewVersionPayload {
  status: "approved" | "rejected"
  reason?: string
}

export interface DeprecateVersionPayload {
  deprecationMessage: string | null
}

export interface SetQuotaPayload {
  maxBlobBytes: number | null
}

export interface UpdateConfigPayload {
  settings: Record<string, unknown>
}

export interface BroadcastNotificationPayload {
  message: string
}

export interface DecideReportPayload {
  status: "resolved" | "dismissed"
  note?: string
}

export type BinaryData = Blob | ArrayBuffer | Uint8Array

export interface SessionListQuery extends PageQuery {
  namespace?: string
}

export interface TokenListQuery extends PageQuery {
  namespace?: string
}

export interface ExtensionListQuery extends PageQuery {
  sort?: SortOrder
  license?: string
  namespace?: string
}

export interface SearchOptions extends PageQuery {
  sort?: SortOrder
  license?: string
}

export interface VersionListQuery extends PageQuery {
  range?: string
  status?: VersionStatus
}

export interface NotificationListQuery extends PageQuery {
  unread?: true
}

export interface AdminReportQuery extends PageQuery {
  status?: ReportStatus
  targetType?: ReportTargetType
}

export interface PendingVersionQuery extends PageQuery {
  status?: "pending"
}

export interface TrendingOptions extends RequestOptions {
  limit?: number
}

export interface ImageOptions extends RequestOptions {
  v?: string
}

export interface UploadImageOptions extends ImageOptions {
  contentType?: string
}

export interface PublishOptions extends RequestOptions {
  contentType?: "application/gzip" | "application/octet-stream"
}

export interface BadgeOptions extends RequestOptions {
  label?: string
}

export interface OidcAuthorizeOptions extends RequestOptions {
  returnTo?: string
}

export interface OidcLinkOptions extends RequestOptions {
  returnTo?: string
}

export interface OidcCallbackParams {
  code?: string
  state: string
  error?: string
}

export interface AuthResource {
  describe(options?: RequestOptions): Promise<AuthDescriptor>
  // Mails a single-use link. `returnTo` is where the browser lands once the
  // link proves the address, so the web client passes its own origin.
  requestMagicLink(
    payload: { email: string; returnTo?: string },
    options?: RequestOptions
  ): Promise<{ sent: true }>
  exchangeMagicLink(
    payload: { code: string },
    options?: RequestOptions
  ): Promise<SessionResult>
  requestEmailCode(
    payload: { email: string },
    options?: RequestOptions
  ): Promise<{ sent: true }>
  verifyEmailCode(
    payload: { email: string; code: string },
    options?: RequestOptions
  ): Promise<SessionResult>
  createPasskeySigninOptions(
    payload: { namespace: string },
    options?: RequestOptions
  ): Promise<PasskeySigninChallenge>
  verifyPasskeySignin(
    payload: { flowToken: string; response: WebAuthnOptions },
    options?: RequestOptions
  ): Promise<SessionResult>
  registerWithGeneratedPassword(
    payload: { email: string },
    options?: RequestOptions
  ): Promise<GeneratedPasswordSession>
  getOidcAuthorizeUrl(
    options?: OidcAuthorizeOptions
  ): Promise<OidcAuthorizeResult>
  oidcCallback(
    params: OidcCallbackParams,
    options?: RequestOptions
  ): Promise<
    OidcCallbackResult | AuthSession | MfaRequired | RedirectResult | undefined
  >
  exchangeOidcCode(
    payload: { code: string },
    options?: RequestOptions
  ): Promise<SessionResult>
  linkOidc(options?: OidcLinkOptions): Promise<OidcAuthorizeResult>
  listOidcIdentities(
    options?: RequestOptions
  ): Promise<Collection<OidcIdentity>>
  deleteOidcIdentity(
    id: string | number,
    options?: RequestOptions
  ): Promise<void>
  getEmail(options?: RequestOptions): Promise<AccountEmail>
  requestEmailChange(
    payload: { email: string },
    options?: RequestOptions
  ): Promise<{ sent: true }>
  confirmEmailChange(
    payload: { email: string; code: string },
    options?: RequestOptions
  ): Promise<{ email: string }>
  getMfaState(options?: RequestOptions): Promise<Passkeys>
  createPasskeyOptions(
    options?: RequestOptions
  ): Promise<{ options: WebAuthnOptions }>
  registerPasskey(
    payload: { response: WebAuthnOptions; label?: string },
    options?: RequestOptions
  ): Promise<PasskeyRegistration>
  renamePasskey(
    id: string | number,
    payload: { label: string },
    options?: RequestOptions
  ): Promise<Passkey>
  deletePasskey(id: string | number, options?: RequestOptions): Promise<void>
  regenerateBackupCodes(options?: RequestOptions): Promise<BackupCodes>
  getSigninOptions(
    payload: { mfaToken: string },
    options?: RequestOptions
  ): Promise<{ options: WebAuthnOptions }>
  verifyMfa(
    payload: {
      mfaToken: string
      response?: WebAuthnOptions
      backupCode?: string
    },
    options?: RequestOptions
  ): Promise<AuthSession>
  getReauthOptions(
    options?: RequestOptions
  ): Promise<{ options: WebAuthnOptions }>
  reauth(
    payload: { response: WebAuthnOptions },
    options?: RequestOptions
  ): Promise<{ reauthenticatedAt: string }>
}

export interface SessionsResource {
  create(
    payload: CreateSessionPayload,
    options?: RequestOptions
  ): Promise<SessionResult>
  list(query?: SessionListQuery): Promise<Page<Session>>
  revokeCurrent(options?: RequestOptions): Promise<void>
  delete(id: string, options?: RequestOptions): Promise<void>
}

export interface TokensResource {
  list(query?: TokenListQuery): Promise<Page<AutomationToken>>
  create(
    payload: CreateTokenPayload,
    options?: RequestOptions
  ): Promise<AutomationTokenCreated>
  update(
    id: string,
    payload: UpdateTokenPayload,
    options?: RequestOptions
  ): Promise<AutomationToken>
  delete(id: string, options?: RequestOptions): Promise<void>
  revokeCurrent(options?: RequestOptions): Promise<void>
}

export interface AccountWebhooksResource {
  list(
    namespace: string,
    options?: RequestOptions
  ): Promise<Collection<Webhook>>
  create(
    namespace: string,
    payload: WebhookInput,
    options?: RequestOptions
  ): Promise<WebhookCreated>
  delete(
    namespace: string,
    webhookId: number,
    options?: RequestOptions
  ): Promise<void>
  listDeliveries(
    namespace: string,
    webhookId: number,
    query?: PageQuery
  ): Promise<Page<WebhookDelivery>>
  redeliver(
    namespace: string,
    webhookId: number,
    deliveryId: number,
    options?: RequestOptions
  ): Promise<WebhookDelivery>
}

export interface OrganizationWebhooksResource {
  list(
    namespace: string,
    options?: RequestOptions
  ): Promise<Collection<Webhook>>
  create(
    namespace: string,
    payload: WebhookInput,
    options?: RequestOptions
  ): Promise<WebhookCreated>
  delete(
    namespace: string,
    webhookId: number,
    options?: RequestOptions
  ): Promise<void>
  listDeliveries(
    namespace: string,
    webhookId: number,
    query?: PageQuery
  ): Promise<Page<WebhookDelivery>>
  redeliver(
    namespace: string,
    webhookId: number,
    deliveryId: number,
    options?: RequestOptions
  ): Promise<WebhookDelivery>
}

export interface ExtensionWebhooksResource {
  list(
    namespace: string,
    id: string,
    options?: RequestOptions
  ): Promise<Collection<Webhook>>
  create(
    namespace: string,
    id: string,
    payload: WebhookInput,
    options?: RequestOptions
  ): Promise<WebhookCreated>
  delete(
    namespace: string,
    id: string,
    webhookId: number,
    options?: RequestOptions
  ): Promise<void>
  listDeliveries(
    namespace: string,
    id: string,
    webhookId: number,
    query?: PageQuery
  ): Promise<Page<WebhookDelivery>>
  redeliver(
    namespace: string,
    id: string,
    webhookId: number,
    deliveryId: number,
    options?: RequestOptions
  ): Promise<WebhookDelivery>
}

export interface UserImageResource {
  get(namespace: string, options?: ImageOptions): Promise<Blob>
  upload(
    namespace: string,
    data: BinaryData,
    options?: UploadImageOptions
  ): Promise<User>
  delete(namespace: string, options?: ImageOptions): Promise<User>
}

export interface OrganizationImageResource {
  get(namespace: string, options?: ImageOptions): Promise<Blob>
  upload(
    namespace: string,
    data: BinaryData,
    options?: UploadImageOptions
  ): Promise<Organization>
  delete(namespace: string, options?: ImageOptions): Promise<Organization>
}

export interface UsersResource {
  create(
    payload: CreateUserPayload,
    options?: RequestOptions
  ): Promise<AuthSession>
  list(query?: PageQuery): Promise<Page<User>>
  get(namespace: string, options?: RequestOptions): Promise<User>
  me(options?: RequestOptions): Promise<User>
  update(
    namespace: string,
    payload: UpdateUserPayload,
    options?: RequestOptions
  ): Promise<User>
  delete(namespace: string, options?: RequestOptions): Promise<void>
  webhooks: AccountWebhooksResource
  avatar: UserImageResource
  banner: UserImageResource
}

export interface OrgsResource {
  create(
    payload: CreateOrganizationPayload,
    options?: RequestOptions
  ): Promise<Organization>
  list(query?: PageQuery): Promise<Page<Organization>>
  get(namespace: string, options?: RequestOptions): Promise<Organization>
  update(
    namespace: string,
    payload: UpdateOrganizationPayload,
    options?: RequestOptions
  ): Promise<Organization>
  delete(namespace: string, options?: RequestOptions): Promise<void>
  listOwners(
    namespace: string,
    options?: RequestOptions
  ): Promise<Collection<OrganizationOwner>>
  addOwner(
    namespace: string,
    ownerNamespace: string,
    options?: RequestOptions
  ): Promise<void>
  removeOwner(
    namespace: string,
    ownerNamespace: string,
    options?: RequestOptions
  ): Promise<void>
  listExtensions(
    namespace: string,
    query?: ExtensionListQuery
  ): Promise<Page<ExtensionSummary>>
  webhooks: OrganizationWebhooksResource
  avatar: OrganizationImageResource
  banner: OrganizationImageResource
}

export interface NotificationsResource {
  list(query?: NotificationListQuery): Promise<NotificationPage>
  markRead(
    payload: { ids: Array<string | number> } | { all: true },
    options?: RequestOptions
  ): Promise<MarkNotificationsReadResult>
  markOneRead(id: string, options?: RequestOptions): Promise<Notification>
}

export interface ReportsResource {
  create(
    payload: CreateReportPayload,
    options?: RequestOptions
  ): Promise<ReportOwnerView>
  list(query?: PageQuery): Promise<Page<ReportOwnerView>>
  get(id: string, options?: RequestOptions): Promise<ReportOwnerView>
}

export interface ExtensionVersionsResource {
  list(
    namespace: string,
    id: string,
    query?: VersionListQuery
  ): Promise<Page<VersionInfo>>
  get(
    namespace: string,
    id: string,
    version: string,
    options?: RequestOptions
  ): Promise<VersionInfo>
  publish(
    namespace: string,
    id: string,
    tarball: BinaryData,
    options?: PublishOptions
  ): Promise<VersionInfo>
  review(
    namespace: string,
    id: string,
    version: string,
    payload: ReviewVersionPayload | DeprecateVersionPayload,
    options?: RequestOptions
  ): Promise<VersionInfo>
  delete(
    namespace: string,
    id: string,
    version: string,
    options?: RequestOptions
  ): Promise<void>
  source(
    namespace: string,
    id: string,
    version: string,
    options?: RequestOptions
  ): Promise<Blob>
  download(
    namespace: string,
    id: string,
    version: string,
    options?: RequestOptions
  ): Promise<Blob>
}

export interface ExtensionTagsResource {
  get(
    namespace: string,
    id: string,
    options?: RequestOptions
  ): Promise<DistTags>
  set(
    namespace: string,
    id: string,
    tag: string,
    version: string,
    options?: RequestOptions
  ): Promise<void>
  delete(
    namespace: string,
    id: string,
    tag: string,
    options?: RequestOptions
  ): Promise<void>
}

export interface ExtensionOwnersResource {
  list(
    namespace: string,
    id: string,
    options?: RequestOptions
  ): Promise<Collection<ExtensionOwner>>
  listInvites(
    namespace: string,
    id: string,
    options?: RequestOptions
  ): Promise<Collection<ExtensionOwnerInvite>>
  invite(
    namespace: string,
    id: string,
    ownerNamespace: string,
    options?: RequestOptions
  ): Promise<void>
  remove(
    namespace: string,
    id: string,
    ownerNamespace: string,
    options?: RequestOptions
  ): Promise<void>
  accept(
    namespace: string,
    id: string,
    ownerNamespace: string,
    options?: RequestOptions
  ): Promise<{ data: { namespace: string; id: string; owner: string } }>
}

export interface ExtensionTransfersResource {
  list(
    namespace: string,
    id: string,
    options?: RequestOptions
  ): Promise<Collection<ExtensionTransfer>>
  offer(
    namespace: string,
    id: string,
    to: string,
    options?: RequestOptions
  ): Promise<{ data: { namespace: string; id: string; to: string } }>
  withdraw(
    namespace: string,
    id: string,
    toNamespace: string,
    options?: RequestOptions
  ): Promise<void>
  accept(
    namespace: string,
    id: string,
    toNamespace: string,
    options?: RequestOptions
  ): Promise<{
    data: { namespace: string; id: string; from: string; versions: number }
  }>
}

export interface ExtensionsResource {
  list(query?: ExtensionListQuery): Promise<Page<ExtensionSummary>>
  search(text: string, options?: SearchOptions): Promise<Page<ExtensionSummary>>
  trending(options?: TrendingOptions): Promise<Page<ExtensionSummary>>
  get(
    namespace: string,
    id: string,
    options?: RequestOptions
  ): Promise<ExtensionDetail>
  delete(namespace: string, id: string, options?: RequestOptions): Promise<void>
  versions: ExtensionVersionsResource
  tags: ExtensionTagsResource
  owners: ExtensionOwnersResource
  transfers: ExtensionTransfersResource
  webhooks: ExtensionWebhooksResource
}

export interface BadgesResource {
  get(namespace: string, id: string, options?: BadgeOptions): Promise<string>
  getField(
    namespace: string,
    id: string,
    field: BadgeField,
    options?: BadgeOptions
  ): Promise<string>
}

export interface InstanceResource {
  meta(options?: RequestOptions): Promise<Meta>
  stats(options?: RequestOptions): Promise<Stats>
  terms(options?: RequestOptions): Promise<LegalDocument>
  privacy(options?: RequestOptions): Promise<LegalDocument>
  atomFeed(options?: RequestOptions): Promise<string>
}

export interface BlobsResource {
  get(digest: string, options?: RequestOptions): Promise<Blob>
}

export interface AdminResource {
  updateTerms(
    payload: { body: string },
    options?: RequestOptions
  ): Promise<LegalDocument>
  updatePrivacy(
    payload: { body: string },
    options?: RequestOptions
  ): Promise<LegalDocument>
  listAudit(query?: PageQuery): Promise<Page<AuditEntry>>
  getQuota(namespace: string, options?: RequestOptions): Promise<Quota>
  setQuota(
    namespace: string,
    payload: SetQuotaPayload,
    options?: RequestOptions
  ): Promise<Quota>
  getMetrics(options?: RequestOptions): Promise<string>
  getConfig(options?: RequestOptions): Promise<ServerConfig>
  updateConfig(
    payload: UpdateConfigPayload,
    options?: RequestOptions
  ): Promise<ServerConfigUpdate>
  listDrivers(options?: RequestOptions): Promise<DriverCatalog>
  replaceDrivers(
    kind: string,
    payload: ReplaceDriversPayload,
    options?: RequestOptions
  ): Promise<ReplaceDriversResult>
  getSystem(options?: RequestOptions): Promise<SystemStatus>
  reloadSystem(options?: RequestOptions): Promise<SystemReloadResult>
  restartSystem(options?: RequestOptions): Promise<{ restarting: true }>
  listMailOutbox(query?: MailOutboxQuery): Promise<Page<MailOutboxEntry>>
  getMailOutboxEntry(
    id: string,
    options?: RequestOptions
  ): Promise<MailOutboxDetail>
  retryMailOutboxEntry(
    id: string,
    options?: RequestOptions
  ): Promise<MailOutboxRetryResult>
  broadcastNotification(
    payload: BroadcastNotificationPayload,
    options?: RequestOptions
  ): Promise<{ created: number }>
  listReports(query?: AdminReportQuery): Promise<Page<Report>>
  getReport(id: string, options?: RequestOptions): Promise<Report>
  decideReport(
    id: string,
    payload: DecideReportPayload,
    options?: RequestOptions
  ): Promise<Report>
  listPendingVersions(
    query?: PendingVersionQuery
  ): Promise<Page<PendingVersion>>
}
