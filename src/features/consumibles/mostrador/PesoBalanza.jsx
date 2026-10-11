import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plug, Scale, TriangleAlert, X } from "lucide-react";
import CampoTexto from "./CampoTexto";
import useRafagaLector from "./useRafagaLector";
import useDialogo from "../useDialogo";
import { cantidadParaPeso, fmtNum, margenPiezas, num, unidadDePeso } from "./mostradorLogica";

/**
 * Pesar lo que va por peso (tornillería). La balanza da gramos y, si el
 * producto tiene peso por pieza calibrado, el sistema pasa a piezas. Se guardan
 * las dos cosas: los gramos (lo que se midió) y las piezas (lo que descuenta).
 *
 * Hasta el 14/10 solo está la Kretz, que marca de a 5 g: sirve para cajones
 * enteros, no para cuatro tornillos. Por eso siempre se pueden cargar las
 * piezas a mano, y a mano mandan sobre la balanza.
 *
 * Sin balanza conectada (tablet, Firefox, cable suelto) se cargan los gramos o
 * las piezas a mano. Conectarla la primera vez pide un clic (Web Serial).
 */
export default function PesoBalanza({ item, linea, balanza, piezasDesdeGramos, onAplicar, onCerrar, onRafaga }) {
  const [gramos, setGramos] = useState(() => (linea?.gramos ? String(linea.gramos).replace(".", ",") : ""));
  const [piezasManual, setPiezasManual] = useState("");
  const [errorLectura, setErrorLectura] = useState("");
  const hojaRef = useRef(null);
  useDialogo(hojaRef, onCerrar);
  const piezasRef = useRef(null);
  const vigenteRef = useRef(true);
  useEffect(() => {
    vigenteRef.current = true;
    return () => { vigenteRef.current = false; };
  }, []);
  const lectorPanel = useRafagaLector({ onRafaga });

  const pu = item?.pesoUnitarioG ?? null;
  const tipoUnidad = unidadDePeso(item?.unidad);
  const calibrado = Boolean(pu) || Boolean(tipoUnidad);
  const g = num(gramos);
  const piezasCalculadas = pu && g > 0 ? piezasDesdeGramos(g, pu) : null;
  const resultado = cantidadParaPeso({ gramos: g, unidad: item?.unidad, piezasCalculadas, piezasManual });
  const margen = resultado?.modo === "balanza" ? margenPiezas(pu) : null;

  useEffect(() => {
    // Sin calibrar, lo útil es contar: el foco va directo a las piezas.
    if (!calibrado) piezasRef.current?.focus({ preventScroll: true });
    else hojaRef.current?.focus({ preventScroll: true });
  }, [calibrado]);

  async function leer() {
    setErrorLectura("");
    try {
      const { gramos: leidos } = await balanza.leerPeso();
      if (!vigenteRef.current) return;
      setGramos(String(leidos));
      setPiezasManual("");
    } catch (e) {
      if (!vigenteRef.current) return;
      setErrorLectura(e?.message || "No se pudo leer la balanza.");
    }
  }

  function aplicar() {
    if (!resultado) return;
    onAplicar({ gramos: g > 0 ? g : null, cantidad: resultado.cantidad });
  }

  function alTeclear(e) {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") { e.preventDefault(); onCerrar(); return; }
    // Enter sobre el panel (no en un campo): usa lo que hay o pesa.
    if (e.key === "Enter" && e.target === e.currentTarget) {
      e.preventDefault();
      if (resultado) aplicar();
      else if (balanza.conectado && !balanza.leyendo) leer();
    }
  }

  const etiquetaCantidad = tipoUnidad ? item?.unidad : "piezas";

  return (
    <div className="mst-capa" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={hojaRef} className="mst-hoja" role="dialog" aria-modal="true" aria-label={`Pesar ${item?.descripcion ?? ""}`} tabIndex={-1}
        onKeyDownCapture={(e) => {
          if (!["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) lectorPanel.onKeyDown(e);
        }} onKeyDown={alTeclear}>
        <div className="mst-hoja-cab">
          <Scale size={20} aria-hidden="true" style={{ color: "var(--cyan)", marginTop: 2 }} />
          <div>
            <div className="mst-hoja-titulo">{item?.descripcion}</div>
            <div className="mst-hoja-sub">
              {tipoUnidad
                ? `Se entrega en ${item.unidad}: la cantidad es el peso.`
                : pu
                  ? <>1 pieza ≈ <span className="mst-num">{fmtNum(pu)}</span> g · calibrado</>
                  : "Sin calibrar: contá las piezas a mano."}
            </div>
          </div>
          <button type="button" className="mst-quitar" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="mst-hoja-cuerpo">
          <div className="mst-fila">
            {balanza.conectado ? (
              <button type="button" className="mst-btn-grande" style={{ minHeight: 52 }} onClick={leer} disabled={balanza.leyendo}>
                {balanza.leyendo ? <LoaderCircle size={18} className="mst-gira" /> : <Scale size={18} />}
                {balanza.leyendo ? "Leyendo la balanza…" : "Tomar el peso"}
              </button>
            ) : balanza.soportado ? (
              <>
                <button type="button" className="ui-btn ui-btn-suave" onClick={() => balanza.conectar()} style={{ minHeight: 44 }}>
                  <Plug size={15} /> Conectar la balanza
                </button>
                <span style={{ fontSize: 12.5, color: "var(--dim)" }}>o cargá los gramos a mano</span>
              </>
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--dim)" }}>Este equipo no maneja la balanza (hace falta Chrome o Edge de escritorio): cargá los gramos o las piezas a mano.</span>
            )}
          </div>

          {errorLectura || balanza.error ? (
            <div className="mst-aviso is-rojo">
              <TriangleAlert size={16} />
              <div className="mst-aviso-texto">{errorLectura || balanza.error}</div>
            </div>
          ) : null}

          <div className="mst-peso-visor">
            <div className="mst-peso-caja">
              <span>Peso</span>
              <strong>{g > 0 ? fmtNum(g) : "—"}</strong>
              <small>gramos</small>
            </div>
            <div className="mst-peso-caja is-principal">
              <span>{tipoUnidad ? "Cantidad" : "Piezas"}</span>
              <strong>{resultado ? fmtNum(resultado.cantidad) : "—"}</strong>
              <small>
                {resultado?.modo === "manual" ? "contadas a mano" : resultado?.modo === "balanza" ? `por peso${margen ? ` · ± ${margen}` : ""}` : etiquetaCantidad}
              </small>
            </div>
          </div>

          <div className="mst-fila">
            <div style={{ flex: 1, minWidth: 130 }}>
              <label className="mst-etiqueta" htmlFor="mst-gramos">Gramos</label>
              <CampoTexto
                id="mst-gramos"
                value={gramos}
                onChange={setGramos}
                onRafaga={onRafaga}
                onEnter={(e) => { e.preventDefault(); aplicar(); }}
                inputMode="decimal"
                placeholder="0"
                className="mst-num"
              />
            </div>
            {!tipoUnidad ? (
              <div style={{ flex: 1, minWidth: 130 }}>
                <label className="mst-etiqueta" htmlFor="mst-piezas">Piezas a mano</label>
                <CampoTexto
                  id="mst-piezas"
                  inputRef={piezasRef}
                  value={piezasManual}
                  onChange={(v) => setPiezasManual(v.replace(/[^\d]/g, ""))}
                  onRafaga={onRafaga}
                  onEnter={(e) => { e.preventDefault(); aplicar(); }}
                  inputMode="numeric"
                  placeholder={piezasCalculadas ? String(piezasCalculadas) : "0"}
                  className="mst-num"
                />
              </div>
            ) : null}
          </div>

          {pu && g > 0 && g < 50 && !num(piezasManual) ? (
            <div className="mst-aviso is-cian">
              <TriangleAlert size={16} />
              <div className="mst-aviso-texto">La balanza de ahora marca de a 5 g: para tan pocas piezas conviene contarlas.</div>
            </div>
          ) : null}

          {!calibrado ? (
            <div className="mst-aviso is-cian">
              <Scale size={16} />
              <div className="mst-aviso-texto">
                <span>Calibrá este producto y la próxima vez la balanza cuenta sola.</span>
                <a href="/balanza/calibrar" target="_blank" rel="noreferrer" style={{ color: "var(--blue)", fontWeight: 600 }}>Abrir Calibrar pesos</a>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mst-hoja-pie">
          <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" onClick={aplicar} disabled={!resultado} style={{ minWidth: 150 }}>
            {resultado ? `Usar ${fmtNum(resultado.cantidad)} ${etiquetaCantidad}` : "Falta el peso o las piezas"}
          </button>
        </div>
      </div>
    </div>
  );
}
