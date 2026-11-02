import { useEffect } from "react"

import { product } from "@/lib/product"

const SITE_NAME = product.name

function setMeta(attribute: "name" | "property", key: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`
  )
  if (!element) {
    element = document.createElement("meta")
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.setAttribute("content", value)
}

/**
 * Keeps the tab title and the share description in step with the page the
 * visitor is on. Public pages get a useful preview; account-only pages stay out
 * of the index because the app sends no content to crawlers before sign-in.
 */
export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    const pageTitle = title ? `${title} · ${SITE_NAME}` : SITE_NAME
    document.title = pageTitle

    const summary = description ?? product.tagline

    setMeta("name", "description", summary)
    setMeta("property", "og:title", pageTitle)
    setMeta("property", "og:description", summary)
    setMeta("property", "og:type", "website")
    setMeta("property", "og:site_name", SITE_NAME)
    setMeta("name", "twitter:card", "summary")
    setMeta("name", "twitter:title", pageTitle)
    setMeta("name", "twitter:description", summary)
  }, [title, description])
}
