import { useEffect, useRef, useState } from "react";
import { Camera, X, ScanLine } from "lucide-react";
import { C } from "@/theme";

// Escáner de código de barras / QR con la cámara del dispositivo.
// Usa la API nativa BarcodeDetector (Chrome/Android). Si no está soportada,
// cae a input manual. Requiere HTTPS + permiso de cámara.
export default function BarcodeScanner({ open, onClose, onScan }) {
  const videoRef = useRef(null);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");

  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!open || !supported) return undefined;
    let stream = null;
    let raf = null;
    let alive = true;
    let done = false;

    (async () => {
      try {
        const detector = new window.BarcodeDetector();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const tick = async () => {
          if (!alive || done || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const val = codes && codes.length ? String(codes[0].rawValue || "").trim() : "";
            if (val) {
              done = true;
              onScanRef.current?.(val);
              return;
            }
          } catch {
            /* frame sin código */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setError(e?.name === "NotAllowedError" ? "Permiso de cámara denegado." : `No se pudo abrir la cámara (${e?.message || e?.name || "error"}).`);
      }
    })();

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [open, supported]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.72)", display: "grid", placeItems: "center", padding: 16, fontFamily: C.sans }}
    >
      <div style={{ width: "100%", maxWidth: 460, background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 48px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
          <ScanLine size={18} style={{ color: C.blue }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, flex: 1 }}>Escanear código</div>
          <button type="button" onClick={() => onClose?.()} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4, display: "grid", placeItems: "center" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          {supported ? (
            <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "4 / 3" }}>
              <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: "18% 12%", border: `2px solid ${C.blue}`, borderRadius: 10, boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)" }} />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", border: `1px solid ${C.amberB}`, background: C.amberL, color: C.amber, borderRadius: 10, padding: "10px 11px", fontSize: 12.5, lineHeight: 1.4 }}>
              <Camera size={16} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>Este navegador no soporta escaneo con cámara. Escribí el código a mano abajo. (Funciona en Chrome / Android.)</span>
            </div>
          )}

          {error && (
            <div style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: "9px 11px", fontSize: 12.5 }}>{error}</div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) onScan?.(manual.trim()); }}
              placeholder="o escribí el código…"
              autoFocus={!supported}
              style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "10px 11px", fontSize: 13, fontFamily: C.sans, outline: "none", minWidth: 0 }}
            />
            <button
              type="button"
              disabled={!manual.trim()}
              onClick={() => manual.trim() && onScan?.(manual.trim())}
              style={{ border: `1px solid ${C.blueB}`, background: manual.trim() ? C.blue : C.panel, color: manual.trim() ? "#fff" : C.dim, borderRadius: 9, padding: "10px 16px", cursor: manual.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 850, fontFamily: C.sans }}
            >
              Usar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
