/** Foto cargada en el catálogo, con iniciales si falta o no se puede abrir. */
export default function FotoConsumible({ item, size = 40 }) {
  const nombre = item?.descripcion || "Consumible";
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const url = item?.imagenUrl || item?.imagen_url;
  return (
    <span aria-hidden="true" style={{ position: "relative", display: "inline-grid", placeItems: "center", width: size, height: size, flexShrink: 0, overflow: "hidden", borderRadius: 9, background: "var(--panel-2)", color: "var(--dim)", fontSize: 13, fontWeight: 600 }}>
      {iniciales}
      {url ? <img key={url} src={url} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "var(--panel-solid)", padding: 3 }} /> : null}
    </span>
  );
}
