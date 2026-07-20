import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Clock, ExternalLink, ImagePlus, X } from "lucide-react";
import { BTN, BTN_PRIMARY } from "@/features/rrhh/ui";
import { C } from "@/theme";
import { precioDesactualizado, precioVigente, uploadMaterialImage } from "./api";
import { fmtDate, fmtMoney } from "./format";

export function MaterialThumb({ material, size = 42 }) {
  const url = material?.imagen_url || material?.imagenes?.[0]?.url;
  const [open, setOpen] = useState(false);
  const frameStyle = {
      width: size,
      height: size,
      borderRadius: 8,
      border: `1px solid ${C.b0}`,
      background: C.s0,
      overflow: "hidden",
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
      padding: 0,
      position: "relative",
  };

  if (!url) {
    return <div style={frameStyle}><Camera size={Math.max(14, Math.round(size * 0.38))} color={C.t2} /></div>;
  }

  const alt = material?.descripcion || "Material";
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Abrir imagen de ${alt}`}
        title="Abrir imagen"
        style={{ ...frameStyle, cursor: "zoom-in", outline: "none" }}
      >
        <img src={url} loading="lazy" alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      {open && <MaterialImageLightbox url={url} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

export function MaterialImageLightbox({ url, alt = "Imagen del material", onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!url || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={(event) => { event.stopPropagation(); onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(2,6,23,0.88)", backdropFilter: "blur(7px)", display: "grid", placeItems: "center", padding: 20 }}
    >
      <div onClick={(event) => event.stopPropagation()} style={{ width: "min(1100px, 96vw)", height: "min(820px, 90vh)", minHeight: 240, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(15,23,42,0.94)", borderRadius: 12, boxShadow: "0 28px 90px rgba(0,0,0,0.55)", overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0,1fr)" }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <div title={alt} style={{ color: "#f8fafc", fontSize: 13, fontWeight: 850, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alt}</div>
          <a href={url} target="_blank" rel="noreferrer" title="Abrir archivo original" aria-label="Abrir archivo original" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", color: "#cbd5e1", display: "grid", placeItems: "center" }}>
            <ExternalLink size={15} />
          </a>
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar imagen" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "transparent", color: "#f8fafc", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <X size={17} />
          </button>
        </div>
        <div style={{ minHeight: 0, padding: 14, display: "grid", placeItems: "center", overflow: "auto" }}>
          <img src={url} alt={alt} style={{ display: "block", maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", borderRadius: 6 }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function MaterialImageUploader({ material, onUploaded, compact = false }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);

  async function onFile(file) {
    if (!file || uploading) return;
    setUploading(true);
    setErr(null);
    try {
      await uploadMaterialImage(material.id, file);
      await onUploaded?.();
    } catch (e) {
      setErr(e);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} style={{
        ...(compact ? BTN : BTN_PRIMARY),
        padding: compact ? "5px 8px" : "7px 12px",
        opacity: uploading ? 0.65 : 1,
      }}>
        <ImagePlus size={13} /> {uploading ? "Subiendo…" : compact ? "Foto" : "Subir imagen"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      {err && <span style={{ fontSize: 11, color: C.red }}>{String(err.message ?? err)}</span>}
    </div>
  );
}

export function PriceBadge({ material }) {
  const price = precioVigente(material);
  const stale = precioDesactualizado(material);
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      borderRadius: 999,
      border: `1px solid ${stale ? "rgba(245,158,11,0.35)" : "rgba(16,185,129,0.3)"}`,
      background: stale ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)",
      color: stale ? C.amber : C.green,
      padding: "3px 8px",
      fontSize: 11,
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      <Clock size={12} />
      {price?.precio_unitario ? `${fmtMoney(price.precio_unitario, price.moneda)} · ${fmtDate(price.fecha)}` : "Sin precio"}
    </span>
  );
}

export function PriceHistory({ material }) {
  const [open, setOpen] = useState(false);
  const rows = material?.precio_historial ?? [];
  if (!rows.length) {
    return <span style={{ fontSize: 11, color: C.t2 }}>sin historial</span>;
  }
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...BTN, padding: "4px 8px", fontSize: 11 }}>
        Historial {rows.length}
      </button>
      {open && (
        <div style={{
          position: "absolute",
          zIndex: 50,
          top: "calc(100% + 6px)",
          right: 0,
          minWidth: 280,
          background: C.panelSolid,
          border: `1px solid ${C.b1}`,
          borderRadius: 10,
          boxShadow: "0 18px 60px rgba(0,0,0,.32)",
          padding: 10,
        }}>
          <div style={{ fontSize: 11, color: C.t2, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
            Últimos precios
          </div>
          {rows.slice(0, 8).map((row) => (
            <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.b0}` }}>
              <div>
                <div style={{ fontSize: 12, color: C.t0, fontWeight: 700 }}>{fmtMoney(row.precio_unitario, row.moneda)}</div>
                <div style={{ fontSize: 11, color: C.t2 }}>{row.proveedor || "Sin proveedor"} · {row.fuente || "manual"}</div>
              </div>
              <div style={{ fontSize: 11, color: C.t2, fontFamily: C.mono }}>{fmtDate(row.fecha || row.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
