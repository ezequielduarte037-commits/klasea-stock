import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  ensureAdminActivitySession,
  isTrackedAdmin,
  registerAdminActivity,
} from "@/features/configuracion/adminActivityApi";

const HEARTBEAT_MS = 5 * 60 * 1000;

export default function AdminActivityTracker({ profile }) {
  const location = useLocation();
  const sessionRef = useRef(null);
  const lastRouteRef = useRef("");
  const routeEnteredAtRef = useRef(0);
  const tracked = isTrackedAdmin(profile);

  useEffect(() => {
    if (!tracked || !profile?.id) {
      sessionRef.current = null;
      lastRouteRef.current = "";
      return;
    }

    const session = ensureAdminActivitySession();
    const route = window.location.pathname || "/";
    sessionRef.current = session;
    lastRouteRef.current = route;
    routeEnteredAtRef.current = Date.now();
    void registerAdminActivity({
      sessionId: session.id,
      eventType: session.isNew ? "session_start" : "page_view",
      route,
      metadata: session.isNew ? { source: "login" } : { source: "reload" },
    });
  }, [profile?.id, tracked]); // La ruta se registra en el efecto siguiente.

  useEffect(() => {
    if (!tracked || !sessionRef.current?.id) return;
    const route = location.pathname || "/";
    const currentSession = sessionRef.current;
    if (route === lastRouteRef.current) {
      currentSession.isNew = false;
      return;
    }
    if (route === lastRouteRef.current) return;

    const previousRoute = lastRouteRef.current;
    const durationSeconds = Math.max(0, Math.round((Date.now() - routeEnteredAtRef.current) / 1000));
    lastRouteRef.current = route;
    routeEnteredAtRef.current = Date.now();
    void registerAdminActivity({
      sessionId: sessionRef.current.id,
      eventType: "page_view",
      route,
      durationSeconds,
      metadata: previousRoute ? { previous_route: previousRoute } : {},
    });
  }, [location.pathname, tracked]);

  useEffect(() => {
    if (!tracked) return undefined;
    const heartbeat = () => {
      if (document.visibilityState !== "visible" || !sessionRef.current?.id) return;
      void registerAdminActivity({
        sessionId: sessionRef.current.id,
        eventType: "heartbeat",
        route: location.pathname || "/",
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    const timer = window.setInterval(heartbeat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [location.pathname, tracked]);

  return null;
}
