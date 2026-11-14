import { useEffect, useRef, useState } from "react";
import { Delete, X } from "lucide-react";
import { fmtNum, num, separarRafaga } from "./mostradorLogica";
import useDialogo from "../useDialogo";

/**
 * Teclado numérico para la cantidad. Sirve con el dedo (tablet) y con el
 * teclado de la PC. La primera tecla reemplaza lo que había, como en una caja.
 *
 * Si mientras está abierto pasa un código por el lector, el teclado se cierra y
 * el código se procesa: no se pierde el escaneo ni queda "7791234" como cantidad.
 */
export default function TecladoNumerico({ titulo, unidad = "", valorInicial = 0, decimales = false, onListo, onCerrar, onRafaga }) {
  const [valor, setValor] = useState(() => (valorInicial > 0 ? String(valorInicial).replace(".", ",") : ""));
  const [reemplazar, setReemplazar] = useState(true);
  const hojaRef = useRef(null);
  useDialogo(hojaRef, onCerrar);
  const teclasRef = useRef([]);
  const estadoRef = useRef({ valor, reemplazar });

  useEffect(() => {
    estadoRef.current = { valor, reemplazar };
  }, [valor, reemplazar]);

  useEffect(() => {
    hojaRef.current?.focus({ preventScroll: true });
  }, []);

  function tocar(t) {
    setValor((v) => {
      const base = reemplazar ? "" : v;
      if (t === "borrar") return reemplazar ? "" : v.slice(0, -1);
      if (t === ",") {
        if (!decimales || base.includes(",")) return base;
        return `${base || "0"},`;
      }
      const siguiente = `${base}${t}`.replace(/^0+(?=\d)/, "");
      const [ent, dec = ""] = siguiente.split(",");
      if (ent.length > 5 || dec.length > 3) return base;
      return siguiente;
    });
    setReemplazar(false);
  }

  function listo() {
    const n = num(estadoRef.current.valor);
    if (n == null) {
      onCerrar();
      return;
    }
    onListo(n);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1) teclasRef.current = [...teclasRef.current, { k: e.key, t: performance.now() }].slice(-64);
      if (e.key === "Enter" || e.key === "Tab") {
        const { rafaga } = separarRafaga(teclasRef.current);
        teclasRef.current = [];
        if (rafaga && onRafaga) { e.preventDefault(); e.stopPropagation(); onRafaga(rafaga); return; }
        if (e.key === "Tab" || e.target?.tagName === "BUTTON") return;
        e.preventDefault();
        listo();
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); onCerrar(); return; }
      if (e.key === "Backspace") { e.preventDefault(); tocar("borrar"); return; }
      if (/^\d$/.test(e.key)) { e.preventDefault(); tocar(e.key); return; }
      if (e.key === "," || e.key === ".") { e.preventDefault(); tocar(","); }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimales ? "," : "", "0", "borrar"];

  return (
    <div className="mst-capa" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={hojaRef} className="mst-hoja is-chica" role="dialog" aria-modal="true" aria-label={`Cantidad de ${titulo}`} tabIndex={-1}>
        <div className="mst-hoja-cab">
          <div>
            <div className="mst-hoja-titulo">{titulo}</div>
            <div className="mst-hoja-sub">Cantidad en {unidad || "unidades"}{valorInicial > 0 ? ` · antes ${fmtNum(valorInicial)}` : ""}</div>
          </div>
          <button type="button" className="mst-quitar" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="mst-hoja-cuerpo">
          <div className="mst-teclado-visor" aria-live="polite">
            <strong style={{ color: reemplazar ? "var(--dim)" : "var(--text)" }}>{valor || "0"}</strong>
            <span>{unidad}</span>
          </div>
          <div className="mst-teclado">
            {teclas.map((t, i) => (t ? (
              <button key={t} type="button" onClick={() => tocar(t)} aria-label={t === "borrar" ? "Borrar" : t}>
                {t === "borrar" ? <Delete size={22} /> : t}
              </button>
            ) : <span key={`vacio-${i}`} />))}
          </div>
        </div>
        <div className="mst-hoja-pie">
          <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" onClick={listo} style={{ minWidth: 120 }}>Listo</button>
        </div>
      </div>
    </div>
  );
}
