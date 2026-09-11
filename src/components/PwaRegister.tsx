"use client";

import { useEffect } from "react";

/**
 * PwaRegister — registers the LookaMusic Service Worker for offline capability
 * and installs updates in the background.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Register service worker after window load to not impact initial critical rendering
    const onWindowLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          // Check for background updates
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                // New update available, activate silently
                installing.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch((err) => {
          // Graceful fallback — app still runs normally without offline caching
          console.warn("[LookaMusic PWA] Service Worker registration skipped:", err);
        });
    };

    if (document.readyState === "complete") {
      onWindowLoad();
    } else {
      window.addEventListener("load", onWindowLoad);
      return () => window.removeEventListener("load", onWindowLoad);
    }
  }, []);

  return null;
}
