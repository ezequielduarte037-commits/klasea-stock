import { Repeat2, Ruler, Scale, Undo2 } from "lucide-react";
import { iniciales } from "./solicitudesLogica";

export function Avatar({ persona }) {
  const foto = persona?.foto_url || persona?.fotoUrl;
  return (
    <div className="sol-avatar" aria-hidden="true">
      {iniciales(persona?.nombre)}
      {foto ? <img src={foto} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
    </div>
  );
}

/** La ubicación en el pañol, grande: es lo que se lee para ir al estante. */
export function Ubicacion({ valor, chica = false }) {
  const u = String(valor ?? "").trim().toUpperCase();
  if (!u) return <span className={`sol-ubic is-sin${chica ? " is-chica" : ""}`} title="Sin ubicación cargada">sin ubic.</span>;
  return <span className={`sol-ubic${chica ? " is-chica" : ""}`} title="Ubicación en el pañol">{u}</span>;
}

const FORMAS = {
  peso: { Icono: Scale, texto: "por peso" },
  canje: { Icono: Repeat2, texto: "canje 1 por 1" },
  prestamo: { Icono: Undo2, texto: "préstamo" },
  fraccionado: { Icono: Ruler, texto: "fraccionado" },
};

/** Marca la forma de entrega cuando no es la común (por cantidad). */
export function FormaTag({ forma }) {
  const f = FORMAS[forma];
  if (!f) return null;
  const { Icono, texto } = f;
  return (
    <span className={`sol-tag${forma === "canje" ? " is-violeta" : forma === "peso" ? " is-cian" : ""}`}>
      <Icono size={11} strokeWidth={2.2} aria-hidden="true" />
      {texto}
    </span>
  );
}
