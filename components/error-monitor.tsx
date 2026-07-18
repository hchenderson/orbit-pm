"use client";

import { useEffect } from "react";
import { reportBrowserError } from "@/lib/error-monitoring";

export function ErrorMonitor() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => void reportBrowserError(event.error ?? event.message, { source: "window.error" });
    const onRejection = (event: PromiseRejectionEvent) => void reportBrowserError(event.reason, { source: "unhandledrejection" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
