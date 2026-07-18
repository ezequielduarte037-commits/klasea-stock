import { useCallback, useEffect, useRef, useState } from "react";

export const DEFAULT_NFC_BRIDGE_URL = "ws://127.0.0.1:17777/nfc";

const STORAGE_KEY = "klasea.nfc.bridgeUrl";

function readStoredUrl() {
  if (typeof window === "undefined") return DEFAULT_NFC_BRIDGE_URL;
  return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_NFC_BRIDGE_URL;
}

function parseMessage(data) {
  const text = String(data ?? "").trim();
  if (!text) return { uid: "" };
  try {
    const json = JSON.parse(text);
    return {
      uid: json.uid || json.nfc_uid || json.cardUid || json.card_uid || json.code || "",
      reader: json.reader || json.device || "",
      message: json.message || "",
      type: json.type || "",
    };
  } catch {
    return { uid: text };
  }
}

export default function useNfcBridge({ enabled = true, onUid } = {}) {
  const [bridgeUrl, setBridgeUrlState] = useState(readStoredUrl);
  const [status, setStatus] = useState("idle");
  const [reader, setReader] = useState("");
  const [lastUid, setLastUid] = useState("");
  const [error, setError] = useState("");
  const [connectTick, setConnectTick] = useState(0);
  const wsRef = useRef(null);
  const retryRef = useRef(null);
  const onUidRef = useRef(onUid);

  useEffect(() => {
    onUidRef.current = onUid;
  }, [onUid]);

  const setBridgeUrl = useCallback((nextUrl) => {
    const clean = String(nextUrl || DEFAULT_NFC_BRIDGE_URL).trim();
    setBridgeUrlState(clean);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, clean);
    setConnectTick((n) => n + 1);
  }, []);

  const reconnect = useCallback(() => {
    setConnectTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let startTimer = null;
    window.clearTimeout(retryRef.current);

    startTimer = window.setTimeout(() => {
      if (disposed) return;
      if (typeof WebSocket === "undefined") {
        setStatus("error");
        setError("Este navegador no soporta WebSocket para el puente NFC.");
        return;
      }

      setStatus("connecting");
      setError("");

      try {
        const ws = new WebSocket(bridgeUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (disposed) return;
          setStatus("connected");
          setError("");
        };

        ws.onmessage = (event) => {
          if (disposed) return;
          const msg = parseMessage(event.data);
          if (msg.reader) setReader(msg.reader);
          if (msg.message && !msg.uid) setError(msg.message);
          const uid = String(msg.uid || "").trim();
          if (!uid) return;
          setLastUid(uid);
          onUidRef.current?.(uid);
        };

        ws.onerror = () => {
          if (disposed) return;
          setStatus("error");
          setError("No se detecto el puente local del lector NFC.");
        };

        ws.onclose = () => {
          if (disposed) return;
          setStatus((prev) => (prev === "error" ? "error" : "disconnected"));
          retryRef.current = window.setTimeout(() => {
            setConnectTick((n) => n + 1);
          }, 2500);
        };
      } catch (err) {
        setStatus("error");
        setError(err.message || "No se pudo abrir el puente NFC.");
      }
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(retryRef.current);
      if (wsRef.current && wsRef.current.readyState <= 1) wsRef.current.close();
      wsRef.current = null;
    };
  }, [bridgeUrl, connectTick, enabled]);

  return {
    bridgeUrl,
    setBridgeUrl,
    status: enabled ? status : "idle",
    reader: enabled ? reader : "",
    lastUid: enabled ? lastUid : "",
    error: enabled ? error : "",
    reconnect,
    connected: status === "connected",
  };
}
