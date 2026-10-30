import type { AuthDescriptor, AuthMethod } from "@/lib/api"

// What GET /auth advertises, in the order the instance offers it. A driver the
// configured method set leaves out is absent from the list, which is what makes
// a page able to hide a form the server would refuse anyway.
export function signInMethods(descriptor: AuthDescriptor | null): AuthMethod[] {
  return (descriptor?.methods ?? []).filter(
    (method) => method.capabilities?.signIn !== false
  )
}

// The methods that can also make an account. A driver can sign in without
// taking new registrations, which is the difference this page needs.
export function registrationMethods(
  descriptor: AuthDescriptor | null
): AuthMethod[] {
  return signInMethods(descriptor).filter(
    (method) => method.capabilities?.register !== false
  )
}

export function hasMethod(methods: AuthMethod[], driver: string): boolean {
  return methods.some((method) => method.driver === driver)
}

// The methods that need an email address, which one form can serve together.
export function emailMethods(methods: AuthMethod[]): AuthMethod[] {
  return methods.filter(
    (method) => method.driver === "magic-link" || method.driver === "email-otp"
  )
}

// "Password, email link and passkey" -- the names to show when the page itself
// has no form for a method, so a person is told what the registry accepts
// instead of being left at a form that would be refused.
export function methodNames(methods: AuthMethod[]): string {
  const labels = methods.map((method) => method.label || method.driver)
  if (labels.length <= 1) {
    return labels[0] ?? ""
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
}
