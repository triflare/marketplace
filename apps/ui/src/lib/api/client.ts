import { HttpClient } from "./http"
import {
  AdminResource,
  AuthResource,
  ExtensionsResource,
  InstanceResource,
  NotificationsResource,
  OrgsResource,
  ReportsResource,
  SessionsResource,
  TokensResource,
  UsersResource,
} from "./resources"
import type {
  AdminResource as AdminResourceShape,
  ApiClientOptions,
  AuthResource as AuthResourceShape,
  ExtensionsResource as ExtensionsResourceShape,
  InstanceResource as InstanceResourceShape,
  NotificationsResource as NotificationsResourceShape,
  OrgsResource as OrgsResourceShape,
  ReportsResource as ReportsResourceShape,
  SessionsResource as SessionsResourceShape,
  TokensResource as TokensResourceShape,
  UsersResource as UsersResourceShape,
} from "./types"

// The public client. It owns the transport and exposes the API as resource
// groups, mirroring the registry's URL structure one level down.
export class ApiClient {
  readonly auth: AuthResourceShape
  readonly sessions: SessionsResourceShape
  readonly tokens: TokensResourceShape
  readonly users: UsersResourceShape
  readonly orgs: OrgsResourceShape
  readonly notifications: NotificationsResourceShape
  readonly reports: ReportsResourceShape
  readonly extensions: ExtensionsResourceShape
  readonly instance: InstanceResourceShape
  readonly admin: AdminResourceShape

  #http: HttpClient

  constructor(baseUrl: string | URL, options: ApiClientOptions = {}) {
    this.#http = new HttpClient(baseUrl, options)
    this.auth = new AuthResource(this.#http)
    this.sessions = new SessionsResource(this.#http)
    this.tokens = new TokensResource(this.#http)
    this.users = new UsersResource(this.#http)
    this.orgs = new OrgsResource(this.#http)
    this.notifications = new NotificationsResource(this.#http)
    this.reports = new ReportsResource(this.#http)
    this.extensions = new ExtensionsResource(this.#http)
    this.instance = new InstanceResource(this.#http)
    this.admin = new AdminResource(this.#http)
  }

  get baseUrl(): string {
    return this.#http.baseUrl
  }

  get token(): string | null {
    return this.#http.token
  }

  setToken(token: string | null | undefined): this {
    this.#http.setToken(token)
    return this
  }
}
