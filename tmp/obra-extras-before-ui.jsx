import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Clock, ExternalLink, ImagePlus, X, ChevronLeft, ChevronRight, Trash2, Star } from "lucide-react";
import { BTN, BTN_PRIMARY } from "@/features/rrhh/ui";
import { C } from "@/theme";
import { precioDesactualizado, precioVigente, uploadMaterialImage, setMainMaterialImage, deleteMaterialImage } from "./api";
import { fmtDate, fmtMoney } from "./format";

export function MaterialThumb({ material, size = 42 }) {
  const url = material?.imagen_url || material?.imagenes?.[0]?.url;
  const imagenes = material?.imagenes || (url ? [{ id: 'main', url }] : []);
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
  const multiple = imagenes.length > 1;

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
        {multiple && (
          <div style={{ position: "absolute", bottom: 0, right: 0, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 9, fontWeight: 900, padding: "2px 5px", borderTopLeftRadius: 6, backdropFilter: "blur(2px)" }}>
            {imagenes.length} <Camera size={8} style={{ display: "inline", verticalAlign: "middle" }} />
          </div>
        )}
      </div>
      {open && <MaterialImageLightbox material={material} imagenes={imagenes} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

export function MaterialImageLightbox({ material, imagenes = [], alt = "Imagen del material", onClose }) {
  const [idx, setIdx] = useState(() => {
    if (!material?.imagen_url) return 0;
    const found = imagenes.findIndex(i => i.url === material.imagen_url);
    return found >= 0 ? found : 0;
  });
  const [loading, setLoading] = useState(false);
  const current = imagenes[idx];
  const url = current?.url;
  
  useEffect(() => {
    const onKeyDown = (event) => { 
      if (event.key === "Escape") onClose?.(); 
      if (event.key === "ArrowLeft") setIdx(i => (i > 0 ? i - 1 : imagenes.length - 1));
      if (event.key === "ArrowRight") setIdx(i => (i < imagenes.length - 1 ? i + 1 : 0));
    };

    const onPaste = async (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const file = Array.from(items).find(item => item.type.startsWith("image/"))?.getAsFile();
      if (!file || loading) return;
      
      setLoading(true);
      try {
        await uploadMaterialImage(material.id, file);
        // Refresh? We don't have a direct callback here to refresh the parent list,
        // but adding it to the local array works for the lightbox view immediately.
        const url = URL.createObjectURL(file);
        material.imagenes = [...(material.imagenes || []), { id: Date.now(), url }];
        material.imagen_url = url;
        setIdx(material.imagenes.length - 1);
      } catch(e) {
        alert("Error al pegar imagen: " + e.message);
      }
      setLoading(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    }
  }, [onClose, imagenes.length, material, loading]);

  if (!url && imagenes.length === 0) return null;

  async function makeMain() {
    if (loading) return;
    setLoading(true);
    try {
      await setMainMaterialImage(material.id, url);
      material.imagen_url = url;
    } catch(e) {
      alert("Error: " + e.message);
    }
    setLoading(false);
  }

  async function deleteImg() {
    if (loading || !window.confirm("¿Eliminar esta foto permanentemente?")) return;
    setLoading(true);
    try {
      await deleteMaterialImage(current.id, url);
      const index = material.imagenes.findIndex(i => i.id === current.id);
      if (index >= 0) material.imagenes.splice(index, 1);
      if (material.imagen_url === url) {
        material.imagen_url = material.imagenes?.[0]?.url || null;
      }
      onClose();
    } catch(e) {
      alert("Error: " + e.message);
    }
    setLoading(false);
  }

  const isMain = material?.imagen_url === url;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={(event) => { event.stopPropagation(); onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(2,6,23,0.88)", backdropFilter: "blur(7px)", display: "grid", placeItems: "center", padding: 20 }}
    >
      <div onClick={(event) => event.stopPropagation()} style={{ width: "min(1100px, 96vw)", height: "min(820px, 90vh)", minHeight: 240, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(15,23,42,0.94)", borderRadius: 12, boxShadow: "0 28px 90px rgba(0,0,0,0.55)", overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto" }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <div title={alt} style={{ color: "#f8fafc", fontSize: 13, fontWeight: 850, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alt}</div>
          
          <button type="button" onClick={makeMain} disabled={loading || isMain} title={isMain ? "Ya es la foto principal" : "Hacer foto principal"} style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: isMain ? "rgba(250,204,21,0.2)" : "transparent", color: isMain ? "#facc15" : "#cbd5e1", display: "flex", alignItems: "center", gap: 6, cursor: loading || isMain ? "default" : "pointer" }}>
            <Star size={15} fill={isMain ? "currentColor" : "none"} /> <span style={{ fontSize: 12, fontWeight: 700 }}>{isMain ? "Principal" : "Hacer Principal"}</span>
          </button>
          
          {current?.id && current.id !== 'main' && (
            <button type="button" onClick={deleteImg} disabled={loading} title="Eliminar foto" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#ef4444", display: "grid", placeItems: "center", cursor: loading ? "default" : "pointer" }}>
              <Trash2 size={15} />
            </button>
          )}

          <a href={url} target="_blank" rel="noreferrer" title="Abrir archivo original" aria-label="Abrir archivo original" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", color: "#cbd5e1", display: "grid", placeItems: "center" }}>
            <ExternalLink size={15} />
          </a>
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar imagen" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "transparent", color: "#f8fafc", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <X size={17} />
          </button>
        </div>
        <div style={{ position: "relative", minHeight: 0, padding: 14, display: "grid", placeItems: "center", overflow: "hidden" }}>
          {imagenes.length > 1 && (
            <button type="button" onClick={() => setIdx(i => (i > 0 ? i - 1 : imagenes.length - 1))} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", zIndex: 10 }}>
              <ChevronLeft size={24} />
            </button>
          )}
          <img src={url} alt={alt} style={{ display: "block", maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", borderRadius: 6 }} />
          {imagenes.length > 1 && (
            <button type="button" onClick={() => setIdx(i => (i < imagenes.length - 1 ? i + 1 : 0))} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", zIndex: 10 }}>
              <ChevronRight size={24} />
            </button>
          )}
        </div>
        {imagenes.length > 1 && (
          <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", gap: 8, overflowX: "auto" }}>
            {imagenes.map((img, i) => (
              <div 
                key={img.id || i} 
                onClick={() => setIdx(i)}
                style={{ width: 48, height: 48, borderRadius: 6, overflow: "hidden", border: `2px solid ${i === idx ? "#3b82f6" : "transparent"}`, cursor: "pointer", flexShrink: 0, opacity: i === idx ? 1 : 0.6 }}
              >
                <img src={img.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}
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
    <div 
      style={{ display: "grid", gap: 6, outline: "none" }}
      onPaste={(e) => {
        const file = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"))?.getAsFile();
        if (file) {
          e.preventDefault();
          onFile(file);
        }
      }}
    >
      <button 
        type="button" 
        onClick={() => inputRef.current?.click()} 
        disabled={uploading} 
        title="Click para subir o Ctrl+V para pegar"
        style={{
          ...(compact ? BTN : BTN_PRIMARY),
          padding: compact ? "5px 8px" : "7px 12px",
          opacity: uploading ? 0.65 : 1,
        }}
      >
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
