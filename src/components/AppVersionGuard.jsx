import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/Toast";

const VERSION_URL = "/version.json";
const CHECK_EVERY_MS = 3 * 60 * 1000;
const RELOAD_DELAY_MS = 3500;

async function fetchBuildId() {
  const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.buildId ? String(data.buildId) : null;
}

export default function AppVersionGuard() {
  const toast = useToast();
  const toastRef = useRef(toast);
  const currentBuildId = useRef(null);
  const reloadScheduled = useRef(false);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    let alive = true;
    let intervalId = null;
    let timeoutId = null;

    async function checkVersion() {
      if (!alive || reloadScheduled.current) return;
      try {
        const nextBuildId = await fetchBuildId();
        if (!nextBuildId) return;

        if (!currentBuildId.current) {
          currentBuildId.current = nextBuildId;
          return;
        }

        if (nextBuildId !== currentBuildId.current) {
          reloadScheduled.current = true;
          toastRef.current.info("Hay una actualizacion nueva. Recargando la pagina...", { ttl: RELOAD_DELAY_MS });
          timeoutId = window.setTimeout(() => {
            window.location.reload();
          }, RELOAD_DELAY_MS);
        }
      } catch {
        // Si esta sin internet o Vercel tarda en servir version.json, no molestamos al usuario.
      }
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations?.()
        .then((regs) => regs.forEach((reg) => reg.unregister()))
        .catch(() => {});
    }

    checkVersion();
    intervalId = window.setInterval(checkVersion, CHECK_EVERY_MS);

    return () => {
      alive = false;
      if (intervalId) window.clearInterval(intervalId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
