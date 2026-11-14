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
 * Una balanza externa puede usarse anotando los gramos con sus decimales.
 * Para stock por piezas sin referencia, se pesa una pieza una sola vez y se
 * guarda su peso aquí mismo. Las piezas contadas a mano siguen teniendo prioridad.
 */
export default function PesoBalanza({ item, linea, balanza, piezasDesdeGramos, onGuardarReferencia, onAplicar, onCerrar, onRafaga }) {
  const [gramos, setGramos] = useState(() => (linea?.gramos ? String(linea.gramos).replace(".", ",") : ""));
  const [piezasManual, setPiezasManual] = useState("");
  const [errorLectura, setErrorLectura] = useState("");
  const [pesoPiezaManual, setPesoPiezaManual] = useState("");
  const [origenPeso, setOrigenPeso] = useState("manual");
  const [guardando, setGuardando] = useState(false);
  const aplicandoRef = useRef(false);
  const hojaRef = useRef(null);
  useDialogo(hojaRef, onCerrar);
  const gramosRef = useRef(null);
  const vigenteRef = useRef(true);
  useEffect(() => {
    vigenteRef.current = true;
    return () => { vigenteRef.current = false; };
  }, []);
  const lectorPanel = useRafagaLector({ onRafaga });

  const puGuardado = num(item?.pesoUnitarioG);
  const pu = puGuardado > 0 ? puGuardado : num(pesoPiezaManual);
  const tipoUnidad = unidadDePeso(item?.unidad);
  const necesitaReferencia = !tipoUnidad && !(puGuardado > 0);
  const g = num(gramos);
  const piezasCalculadas = pu > 0 && g > 0 ? piezasDesdeGramos(g, pu) : null;
  const resultado = cantidadParaPeso({ gramos: g, unidad: item?.unidad, piezasCalculadas, piezasManual });
  const margen = origenPeso === "balanza" && resultado?.modo === "balanza" ? margenPiezas(pu) : null;

  useEffect(() => {
    gramosRef.current?.focus({ preventScroll: true });
  }, []);

  async function leer() {
    setErrorLectura("");
    try {
      const { gramos: leidos } = await balanza.leerPeso();
      if (!vigenteRef.current) return;
      setGramos(String(leidos));
      setOrigenPeso("balanza");
      setPiezasManual("");
    } catch (e) {
      if (!vigenteRef.current) return;
      setErrorLectura(e?.message || "No se pudo leer la balanza.");
    }
  }

  async function aplicar() {
    if (!resultado || aplicandoRef.current) return;
    aplicandoRef.current = true;
    setGuardando(true);
    setErrorLectura("");
    try {
      if (necesitaReferencia && pu > 0) await onGuardarReferencia(pu);
      if (vigenteRef.current) onAplicar({ gramos: g > 0 ? g : null, cantidad: resultado.cantidad });
    } catch (error) {
      if (vigenteRef.current) setErrorLectura(error?.message || "No se pudo guardar el peso por pieza. Reintentá.");
    } finally {
      aplicandoRef.current = false;
      if (vigenteRef.current) setGuardando(false);
    }
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
  const textoConfirmar = resultado
    ? g > 0 && resultado.modo !== "manual" ? `Aceptar ${fmtNum(g)} g` : `Usar ${fmtNum(resultado.cantidad)} ${etiquetaCantidad}`
    : g > 0 && necesitaReferencia ? "Falta el peso de 1 pieza" : "Falta el peso o las piezas";

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
                : pu > 0
                  ? <>1 pieza ≈ <span className="mst-num">{fmtNum(pu)}</span> g · {puGuardado > 0 ? "referencia guardada" : "referencia a guardar"}</>
                  : "Ingresá los gramos de tu balanza y el peso de una pieza, por única vez."}
            </div>
          </div>
          <button type="button" className="mst-quitar" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="mst-hoja-cuerpo">
          <div className="mst-fila">
            {balanza.conectado ? (
              <button type="button" className="mst-btn-grande" style={{ minHeight: 52 }} onClick={leer} disabled={balanza.leyendo || guardando}>
                {balanza.leyendo ? <LoaderCircle size={18} className="mst-gira" /> : <Scale size={18} />}
                {balanza.leyendo ? "Leyendo la balanza…" : "Tomar el peso"}
              </button>
            ) : balanza.soportado ? (
              <>
                <button type="button" className="ui-btn ui-btn-suave" onClick={() => balanza.conectar()} disabled={guardando} style={{ minHeight: 44 }}>
                  <Plug size={15} /> Conectar la balanza
                </button>
                <span style={{ fontSize: 12.5, color: "var(--dim)" }}>Conexión opcional: podés cargar los gramos de tu balanza a mano.</span>
              </>
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--dim)" }}>Ingresá los gramos que marca tu balanza. No hace falta conectarla a la PC.</span>
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
                inputRef={gramosRef}
                value={gramos}
                disabled={guardando}
                onChange={(valor) => { setGramos(valor); setOrigenPeso("manual"); }}
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
                  value={piezasManual}
                  disabled={guardando}
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

          {necesitaReferencia && <div className="mst-aviso is-cian">
            <Scale size={16} />
            <div className="mst-aviso-texto" style={{ flex:1 }}>
              <label className="mst-etiqueta" htmlFor="mst-peso-pieza">¿Cuánto pesa 1 pieza? (g)</label>
              <CampoTexto id="mst-peso-pieza" value={pesoPiezaManual} onChange={setPesoPiezaManual} disabled={guardando}
                inputMode="decimal" placeholder="Pesá una sola pieza" onRafaga={onRafaga}
                onEnter={(e) => { e.preventDefault(); aplicar(); }} className="mst-num" />
              <span>Se guarda para las próximas pesadas de este producto. También podés ingresar las piezas contadas a mano.</span>
            </div>
          </div>}

          {origenPeso === "balanza" && pu && g > 0 && g < 50 && !num(piezasManual) ? (
            <div className="mst-aviso is-cian">
              <TriangleAlert size={16} />
              <div className="mst-aviso-texto">La balanza de ahora marca de a 5 g: para tan pocas piezas conviene contarlas.</div>
            </div>
          ) : null}

        </div>

        <div className="mst-hoja-pie">
          <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" onClick={aplicar} disabled={!resultado || guardando} style={{ minWidth: 150 }}>
            {guardando ? "Guardando…" : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
