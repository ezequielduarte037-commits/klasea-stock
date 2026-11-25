import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Repeat2, Ruler, Scale, Undo2, X } from "lucide-react";

/** Dos iniciales: "Lija al agua 600" → "LA". Para cuando no hay foto. */
function iniciales(texto) {
  return String(texto || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";
}

/**
 * La foto del consumible, o sus iniciales. Si la imagen no carga (link roto en
 * el catálogo), se esconde y quedan las iniciales que están debajo.
 *
 * Con `zoom`, tocar la foto la agranda en pantalla (sin sumar al carrito ni
 * abrir la fila: el toque no llega al botón de abajo). El contenedor tiene que
 * tener `position: relative`, como `.mst-res-foto`.
 */
export function FotoItem({ item, zoom = false }) {
  const [abierta, setAbierta] = useState(false);
  const [rota, setRota] = useState(false);
  const url = item?.imagenUrl || "";
  const puedeAgrandar = zoom && url && !rota;
  const abrir = (e) => { e.preventDefault(); e.stopPropagation(); setAbierta(true); };
  return (
    <>
      <span className="mst-inicial" aria-hidden="true">{iniciales(item?.descripcion)}</span>
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => { e.currentTarget.style.display = "none"; setRota(true); }}
        />
      ) : null}
      {puedeAgrandar ? (
        <span
          role="button"
          tabIndex={0}
          className="foto-zoom-tocar"
          aria-label={`Ver la foto de ${item?.descripcion || "el producto"} más grande`}
          title="Ver la foto más grande"
          onClick={abrir}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") abrir(e); }}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, cursor: "zoom-in", zIndex: 1 }}
        />
      ) : null}
      {abierta ? <FotoGrande url={url} titulo={item?.descripcion || ""} onCerrar={() => setAbierta(false)} /> : null}
    </>
  );
}

/** La foto a pantalla casi completa. Se cierra tocando en cualquier lado o con Escape. */
function FotoGrande({ url, titulo, onCerrar }) {
  useEffect(() => {
    const alTeclear = (e) => { if (e.key === "Escape") { e.stopPropagation(); onCerrar(); } };
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, [onCerrar]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="foto-zoom-capa"
      role="dialog"
      aria-modal="true"
      aria-label={titulo ? `Foto de ${titulo}` : "Foto"}
      onClick={(e) => { e.stopPropagation(); onCerrar(); }}
    >
      <style href="klasea-foto-zoom" precedence="default">{CSS_FOTO_ZOOM}</style>
      <button type="button" className="foto-zoom-cerrar" aria-label="Cerrar" onClick={(e) => { e.stopPropagation(); onCerrar(); }}>
        <X size={20} />
      </button>
      <figure className="foto-zoom-figura">
        <img src={url} alt={titulo} />
        {titulo ? <figcaption>{titulo}</figcaption> : null}
      </figure>
    </div>,
    document.body,
  );
}

// Sin `inset` ni `gap`: también se abre en el colector del pañol (Chrome viejo).
const CSS_FOTO_ZOOM = `
.foto-zoom-capa {
  position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 10000;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  background: var(--overlay-strong); cursor: zoom-out;
  animation: foto-zoom-aparece .16s ease-out;
}
.foto-zoom-figura { margin: 0; display: flex; flex-direction: column; align-items: center; max-width: min(880px, 100%); }
.foto-zoom-figura img {
  max-width: 100%; max-height: 78vh; object-fit: contain; border-radius: 14px;
  background: #fff; padding: 10px; box-sizing: border-box; box-shadow: var(--elev-2);
}
.foto-zoom-figura figcaption { margin-top: 12px; color: #fff; font-family: 'Outfit', system-ui, sans-serif; font-size: 17px; font-weight: 500; text-align: center; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
.foto-zoom-cerrar {
  position: absolute; top: 16px; right: 16px; width: 44px; height: 44px; border-radius: 12px;
  border: 1px solid rgba(255,255,255,.25); background: rgba(0,0,0,.35); color: #fff;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
@keyframes foto-zoom-aparece { from { opacity: 0; } to { opacity: 1; } }
`;

export function Avatar({ persona }) {
  return (
    <div className="mst-avatar" aria-hidden="true">
      {iniciales(persona?.nombre)}
      {persona?.fotoUrl ? (
        <img src={persona.fotoUrl} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : null}
    </div>
  );
}

const FORMAS = {
  peso: { Icono: Scale, texto: "Peso" },
  canje: { Icono: Repeat2, texto: "Canje" },
  prestamo: { Icono: Undo2, texto: "Préstamo" },
  fraccionado: { Icono: Ruler, texto: "Fracc." },
};

/** Marca la forma de entrega cuando no es la común (por unidad). */
export function FormaEtiqueta({ forma }) {
  const f = FORMAS[forma];
  if (!f) return null;
  const { Icono, texto } = f;
  return (
    <span className={`mst-forma is-${forma}`}>
      <Icono size={11} strokeWidth={2.2} aria-hidden="true" />
      {texto}
    </span>
  );
}

/** El stock como se lee en el mostrador: número, o "sin contar". */
export function StockTexto({ aviso, unidad = "" }) {
  if (!aviso) return null;
  if (aviso.nivel === "sin_conteo") return <span className="mst-stock is-sin_conteo">sin contar</span>;
  return (
    <span className={`mst-stock is-${aviso.nivel}`} title={aviso.texto}>
      {aviso.queda != null ? aviso.queda.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
      {unidad ? <span style={{ fontFamily: "inherit", fontWeight: 500 }}> {unidad}</span> : null}
    </span>
  );
}
