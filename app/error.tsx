"use client";

import { useEffect } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { reportBrowserError } from "@/lib/error-monitoring";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { void reportBrowserError(error, { source: "next-route-boundary", digest: error.digest }); }, [error]);
  return <main className="workspace-loading error"><CircleAlert size={28} /><strong>Orbit hit an unexpected problem</strong><small>The error was recorded. You can safely try this screen again.</small><button className="primary-button" onClick={reset}><RefreshCw size={15} /> Try again</button></main>;
}
