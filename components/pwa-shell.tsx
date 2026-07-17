"use client";

import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaShell() {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("beforeinstallprompt", installHandler);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").then((registration) => {
        if (registration.waiting) setUpdateReady(true);
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", () => {
            if (registration.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
          });
        });
      });
    }
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("beforeinstallprompt", installHandler);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }

  return <>
    {!online && <div className="offline-banner" role="status"><WifiOff size={14} /><span><strong>You’re offline.</strong> Saved projects remain available and changes will sync after reconnecting.</span></div>}
    {updateReady && <div className="pwa-update" role="status"><RefreshCw size={14} /><span>A newer version of Orbit is ready.</span><button onClick={() => window.location.reload()}>Refresh</button></div>}
    {installPrompt && !dismissed && <aside className="install-prompt"><span className="brand-mark">O</span><span><strong>Install Orbit</strong><small>Open projects faster from your home screen.</small></span><button onClick={() => void install()}><Download size={14} /> Install</button><button className="install-dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss install prompt"><X size={14} /></button></aside>}
  </>;
}
