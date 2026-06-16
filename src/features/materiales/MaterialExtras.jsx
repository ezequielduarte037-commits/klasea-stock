import { useRef, useState } from "react";
import { Camera, Clock, ImagePlus } from "lucide-react";
import { BTN, BTN_PRIMARY } from "@/features/rrhh/ui";
import { C } from "@/theme";
import { precioDesactualizado, precioVigente, uploadMaterialImage } from "./api";
import { fmtDate, fmtMoney } from "./format";

export function MaterialThumb({ material, size = 42 }) {
  const url = material?.imagen_url || material?.imagenes?.[0]?.url;
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 8,
      border: `1px solid ${C.b0}`,
      background: C.s0,
      overflow: "hidden",
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
    }}>
      {url ? (
        <img src={url} loading="lazy" alt={material?.descripcion || "Material"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Camera size={Math.max(14, Math.round(size * 0.38))} color={C.t2} />
      )}
    </div>
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
