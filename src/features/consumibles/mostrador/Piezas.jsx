import { Repeat2, Ruler, Scale, Undo2 } from "lucide-react";

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
 */
export function FotoItem({ item }) {
  return (
    <>
      <span className="mst-inicial" aria-hidden="true">{iniciales(item?.descripcion)}</span>
      {item?.imagenUrl ? (
        <img
          src={item.imagenUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      ) : null}
    </>
  );
}

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
