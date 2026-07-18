"use client";

import { useEffect } from "react";
import { reportBrowserError } from "@/lib/error-monitoring";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { void reportBrowserError(error, { source: "next-global-boundary", digest: error.digest }); }, [error]);
  return <html lang="en"><body><main style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", padding: 24 }}><section style={{ maxWidth: 460, textAlign: "center" }}><h1>Orbit needs a fresh start</h1><p>An unexpected error was recorded. Reload this screen to continue.</p><button onClick={reset} style={{ minHeight: 44, padding: "0 18px" }}>Reload Orbit</button></section></main></body></html>;
}
