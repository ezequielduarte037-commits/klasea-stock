import { useRef, useState } from "react";
import { fmtCantidad } from "@/features/consumibles/api";

/**
 * Número editable en el lugar (mínimo y máximo). Guarda al salir del campo o
 * con Enter; Escape deja como estaba. Vacío = sin valor.
 *
 *   compacto  en la tabla se ve como texto y se vuelve campo al tocarlo
 *
 * El estado interno se reinicia cuando cambia el valor de afuera (key).
 */
export function CampoNumero(props) {
  return <CampoNumeroInterno key={String(props.valor ?? "")} {...props} />;
}

const aTexto = (v) => (v == null || v === "" ? "" : String(v).replace(".", ","));
const aValor = (t) => {
  const limpio = String(t ?? "").trim().replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

function CampoNumeroInterno({ valor, onGuardar, etiqueta, compacto = false, placeholder = "—", sugerido = null }) {
  const [editando, setEditando] = useState(!compacto);
  const [texto, setTexto] = useState(aTexto(valor));
  const [guardando, setGuardando] = useState(false);
  const cancelado = useRef(false);

  const guardar = async () => {
    if (cancelado.current) {
      cancelado.current = false;
      setTexto(aTexto(valor));
      if (compacto) setEditando(false);
      return;
    }
    const nuevo = aValor(texto);
    const actual = valor == null || valor === "" ? null : Number(valor);
    if (Number.isNaN(nuevo)) {
      setTexto(aTexto(valor));
      if (compacto) setEditando(false);
      return;
    }
    if (nuevo === actual) {
      if (compacto) setEditando(false);
      return;
    }
    setGuardando(true);
    try {
      await onGuardar(nuevo);
    } catch {
      setTexto(aTexto(valor));
    } finally {
      setGuardando(false);
      if (compacto) setEditando(false);
    }
  };

  if (compacto && !editando) {
    return (
      <button type="button" className={`stk-editable stk-num${valor == null ? " is-vacio" : ""}`} onClick={() => setEditando(true)} aria-label={`${etiqueta}: ${valor == null ? "sin cargar" : fmtCantidad(valor)}. Tocá para cambiar`}>
        {valor == null ? (sugerido != null ? <span className="stk-sug">sug. {fmtCantidad(sugerido)}</span> : placeholder) : fmtCantidad(valor)}
      </button>
    );
  }

  return (
    <input
      className={`ui-input stk-input stk-num${guardando ? " is-guardando" : ""}`}
      inputMode="decimal"
      value={texto}
      autoFocus={compacto}
      disabled={guardando}
      placeholder={sugerido != null ? `sug. ${fmtCantidad(sugerido)}` : ""}
      aria-label={etiqueta}
      onChange={(e) => setTexto(e.target.value.replace(/[^\d.,]/g, ""))}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { e.preventDefault(); cancelado.current = true; e.currentTarget.blur(); }
      }}
    />
  );
}
