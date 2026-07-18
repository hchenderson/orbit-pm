export const RECENT_LOGIN_SECONDS = 10 * 60;

export function hasRecentLogin(authTime: unknown, nowSeconds = Math.floor(Date.now() / 1000)) {
  const signedInAt = Number(authTime);
  return Number.isFinite(signedInAt) && signedInAt > 0 && nowSeconds - signedInAt <= RECENT_LOGIN_SECONDS;
}

export function safeErrorText(value: unknown, fallback = "Unknown error") {
  if (value instanceof Error) return value.message.slice(0, 1_500);
  if (typeof value === "string") return value.slice(0, 1_500);
  return fallback;
}
