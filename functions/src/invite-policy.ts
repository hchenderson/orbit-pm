export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function bootstrapEmails(raw?: string) {
  return new Set((raw ?? "").split(",").map(normalizeEmail).filter(Boolean));
}

export function isBootstrapEmail(email: string, raw?: string) {
  return bootstrapEmails(raw).has(normalizeEmail(email));
}
