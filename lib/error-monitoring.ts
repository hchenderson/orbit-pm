import { httpsCallable } from "firebase/functions";
import { getFirebaseAuth, getFirebaseFunctions, isDemoMode } from "./firebase";

const recentlyReported = new Map<string, number>();

function errorDetails(value: unknown) {
  if (value instanceof Error) return { message: value.message || value.name, stack: value.stack ?? value.message };
  if (typeof value === "string") return { message: value, stack: value };
  try {
    const message = JSON.stringify(value);
    return { message, stack: message };
  } catch {
    return { message: "Unknown browser error", stack: "Unknown browser error" };
  }
}

export async function reportBrowserError(value: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production" || isDemoMode || !getFirebaseAuth()?.currentUser) return;
  const functions = getFirebaseFunctions();
  if (!functions) return;
  const details = errorDetails(value);
  const signature = `${details.message}:${details.stack.slice(0, 250)}`;
  const now = Date.now();
  if ((recentlyReported.get(signature) ?? 0) > now - 60_000) return;
  recentlyReported.set(signature, now);
  try {
    const report = httpsCallable(functions, "reportClientError");
    await report({
      message: details.message.slice(0, 1_500),
      stack: details.stack.slice(0, 12_000),
      // Never include query parameters: invitation links contain secret acceptance tokens.
      route: window.location.pathname.slice(0, 300),
      release: process.env.NEXT_PUBLIC_APP_RELEASE ?? "orbit-web",
      userAgent: navigator.userAgent.slice(0, 500),
      context,
    });
  } catch {
    // Error reporting must never trigger another visible application failure.
  }
}
