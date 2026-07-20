import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, Check, X, AlertTriangle } from "lucide-react";
import { C } from "@/theme";

/**
 * CapturaFotoModal — saca una foto con la cámara de la PC.
 *
 * Se usa para cargar la cara del empleado y poder validar visualmente quién
 * retira material (una tarjeta sin foto no prueba nada: se presta o se copia).
 *
 * Detalles que importan:
 *   - Recorta CUADRADO desde el centro, porque la foto se muestra en avatares
 *     redondos/cuadrados; si no, quedan caras deformadas o cortadas.
 *   - Apaga la cámara al cerrar. Si no, la luz del webcam queda prendida y el
 *     dispositivo sigue tomado (y en la PC del pañol eso asusta con razón).
 *   - Permite elegir cámara si hay más de una.
 *
 * Devuelve un Blob JPEG por `onCapturar`.
 */

const LADO = 640;       // foto cuadrada de 640x640: suficiente para una cara, liviana
const CALIDAD = 0.86;

export default function CapturaFotoModal({ open, titulo = "Sacar foto", onCapturar, onClose, guardando = false }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [dispositivos, setDispositivos] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);
  const [captura, setCaptura] = useState(null); // { url, blob }

  // Corta el stream SIN tocar estado: se llama desde el efecto, y ahí un setState
  // sincrónico dispara renders en cascada.
  const detenerStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      for (const track of s.getTracks()) { try { track.stop(); } catch { /* ya cortado */ } }
      streamRef.current = null;
    }
  }, []);

  // Versión para handlers: apaga y refleja que ya no hay imagen viva.
  const apagar = useCallback(() => {
    detenerStream();
    setListo(false);
  }, [detenerStream]);

  // Enciende la cámara elegida. Ojo: nada de setState ANTES del primer await,
  // porque esto se llama desde un efecto y encadenaría renders.
  const encender = useCallback(async (id = "") => {
    detenerStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: id
          ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setError("");
      setCaptura(null);
      setListo(true);
      // La lista de cámaras sólo trae nombres DESPUÉS de dar permiso.
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      setDispositivos(devs);
      if (!id && devs[0]?.deviceId) setDeviceId(devs[0].deviceId);
    } catch (err) {
      const name = err?.name || "";
      if (name === "NotAllowedError") setError("Diste permiso denegado a la cámara. Habilitala en el candado de la barra de direcciones.");
      else if (name === "NotFoundError") setError("No se detectó ninguna cámara conectada.");
      else if (name === "NotReadableError") setError("La cámara está siendo usada por otro programa. Cerralo y reintentá.");
      else setError(err?.message || "No se pudo abrir la cámara.");
      setListo(false);
    }
  }, [detenerStream]);

  // Derivado, no estado: setState dentro del efecto dispara renders en cascada.
  const soportado = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!open || !soportado) { detenerStream(); return undefined; }
    // Abrir la cámara es sincronizar con un dispositivo externo, que es el uso
    // legítimo de un efecto. `encender` no toca estado hasta despues del await
    // de getUserMedia, pero la regla marca igual cualquier función con setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    encender("");
    return () => detenerStream();
  }, [open, soportado, encender, detenerStream]);

  // Libero la preview anterior para no acumular blobs en memoria.
  useEffect(() => () => { if (captura?.url) URL.revokeObjectURL(captura.url); }, [captura]);

  function sacar() {
    const video = videoRef.current;
    if (!video || !listo) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    // Recorte cuadrado centrado.
    const lado = Math.min(w, h);
    const sx = (w - lado) / 2;
    const sy = (h - lado) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = LADO;
    canvas.height = LADO;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, sx, sy, lado, lado, 0, 0, LADO, LADO);
    canvas.toBlob((blob) => {
      if (!blob) { setError("No se pudo procesar la foto."); return; }
      setCaptura({ blob, url: URL.createObjectURL(blob) });
      apagar(); // congelo la imagen y suelto la cámara mientras deciden
    }, "image/jpeg", CALIDAD);
  }

  function repetir() {
    if (captura?.url) URL.revokeObjectURL(captura.url);
    setCaptura(null);
    encender(deviceId);
  }

  function confirmar() {
    if (captura?.blob) onCapturar?.(captura.blob);
  }

  if (!open) return null;

  const marco = { width: "min(420px, 78vw)", aspectRatio: "1 / 1", borderRadius: 16, overflow: "hidden", background: "#000", border: `1px solid ${C.border}`, display: "grid", placeItems: "center" };

  return (
    <div
      onClick={guardando ? undefined : onClose}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 18, padding: 18, width: "min(480px, 96vw)", maxHeight: "94vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(59,130,246,0.12)", border: `1px solid ${C.blueB}`, color: C.blue }}>
            <Camera size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 900, color: C.text }}>{titulo}</div>
            <div style={{ fontSize: 11.5, color: C.dim, marginTop: 1 }}>Mirá a la cámara de frente, con la cara despejada.</div>
          </div>
          <button type="button" onClick={onClose} disabled={guardando} style={{ background: "transparent", border: "none", color: C.dim, cursor: guardando ? "default" : "pointer", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {(error || !soportado) && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", border: `1px solid ${C.redB}`, background: "rgba(239,68,68,0.09)", color: C.red, borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            {soportado ? error : "Este navegador no permite usar la cámara. Usá Chrome o Edge de escritorio."}
          </div>
        )}

        <div style={{ display: "grid", placeItems: "center", marginBottom: 12 }}>
          <div style={marco}>
            {captura ? (
              <img src={captura.url} alt="Foto tomada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </div>
        </div>

        {/* Selector de cámara: sólo si hay más de una */}
        {!captura && dispositivos.length > 1 && (
          <select
            value={deviceId}
            onChange={(e) => { setDeviceId(e.target.value); encender(e.target.value); }}
            style={{ width: "100%", boxSizing: "border-box", background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12.5, marginBottom: 12, cursor: "pointer" }}
          >
            {dispositivos.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Cámara ${i + 1}`}</option>)}
          </select>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {captura ? (
            <>
              <button type="button" onClick={repetir} disabled={guardando}
                style={{ flex: 1, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 11, padding: "12px 14px", cursor: guardando ? "default" : "pointer", fontSize: 13.5, fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <RefreshCw size={16} /> Repetir
              </button>
              <button type="button" onClick={confirmar} disabled={guardando}
                style={{ flex: 1.4, border: "none", background: guardando ? C.panel2 : C.green, color: guardando ? C.dim : "#fff", borderRadius: 11, padding: "12px 14px", cursor: guardando ? "default" : "pointer", fontSize: 13.5, fontWeight: 950, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <Check size={16} /> {guardando ? "Guardando…" : "Usar esta foto"}
              </button>
            </>
          ) : (
            <button type="button" onClick={sacar} disabled={!listo}
              style={{ flex: 1, border: "none", background: listo ? C.blue : C.panel2, color: listo ? "#fff" : C.dim, borderRadius: 11, padding: "13px 14px", cursor: listo ? "pointer" : "default", fontSize: 14.5, fontWeight: 950, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Camera size={18} /> {listo ? "Sacar foto" : "Abriendo cámara…"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
