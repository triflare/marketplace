import "@/lib/env.server"

import TwextHubKit from "@twextjs/twexthubkit"

const OFFICIAL_API = "https://twexts.sdisk.us/api/v2"
const LOCAL_API = "http://localhost:3000/v2"

const configured =
  process.env.TWEXTHUB_API_URL?.trim() ??
  process.env.VITE_TWEXTHUB_API_URL?.trim()

const fallback =
  process.env.NODE_ENV === "production" ? OFFICIAL_API : LOCAL_API

export const SERVER_API_URL = (configured || fallback).replace(/\/+$/, "")

export function serverApi(token?: string | null): TwextHubKit {
  const kit = new TwextHubKit(SERVER_API_URL)
  if (token) {
    kit.setToken(token)
  }
  return kit
}
