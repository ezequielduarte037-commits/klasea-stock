import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Copy, Plug, PlugZap, Send, Trash2, ArrowLeft, AlertTriangle, Check } from "lucide-react";
import { C } from "@/theme";
import { BAUD_RATES, aAscii, aHex, balanzaCompartida, extraerTramasKretz, parsearPeso, partirLineas, serialSoportado } from "@/lib/balanzaSerial";

/**
 * BalanzaDebugScreen — sniffer del puerto serie. Ruta: /balanza
 *
 * Objetivo: DESCUBRIR el protocolo de salida de la balanza Kretz. No sabemos
 * todavía a qué velocidad habla ni con qué formato de trama, y no se puede
 * escribir el parser sin ver los bytes reales. Esta pantalla abre el puerto,
 * vuelca todo lo que llega (hex + ascii) y permite mandar comandos de sondeo.
 *
 * Una vez que veamos las tramas, el parser definitivo va en lib/balanzaSerial.js
 * y esta pantalla queda como herramienta de diagnóstico.
 */

const MAX_LINEAS = 400;

// Comandos de sondeo típicos: muchas balanzas no emiten nada hasta que se las interroga.
// Kretz AUN EB30P (manual 15.3.3): el pedido de peso es UN SOLO caracter, sin CR/LF.
const COMANDOS = [
  { label: "P", value: "P", hint: "Kretz — pedido de peso (ASCII 80)" },
  { label: "p", value: "p", hint: "Kretz — pedido de peso (ASCII 112)" },
  { label: "W", value: "W", hint: "Kretz — pedido de peso (ASCII 87)" },
  { label: "w", value: "w", hint: "Kretz — pedido de peso (ASCII 119)" },
  { label: "ENQ (0x05)", value: "\x05", hint: "Genérico, otras balanzas" },
];

// Escape/unescape del campo de comando manual, para poder tipear \r \n \x05 a mano.
const ENQ = String.fromCharCode(5);
const escaparCmd = (s) => s.split("\r").join("\\r").split("\n").join("\\n").split(ENQ).join("\\x05");
const desescaparCmd = (s) => s.split("\\r").join("\r").split("\\n").join("\n").split("\\x05").join(ENQ);

const CARD = { border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, padding: 14, boxShadow: "var(--elev-1)" };
const LBL = { fontSize: 11, color: C.dim, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5, display: "block" };
const INP = { width: "100%", boxSizing: "border-box", minHeight: 38, background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: C.sans, outline: "none" };
const CHIP = { borderRadius: 999, minHeight: 32, padding: "0 12px", fontSize: 12, fontWeight: 600, fontFamily: C.mono };

export default function BalanzaDebugScreen() {
  const nav = useNavigate();
  const soportado = serialSoportado();

  const [baudRate, setBaudRate] = useState(9600);
  const [dataBits, setDataBits] = useState(8);
  const [parity, setParity] = useState("none");
  const [stopBits, setStopBits] = useState(2); // la Kretz AUN EB30P usa 2 (manual 15.5)

  const [conectado, setConectado] = useState(false);
  const [error, setError] = useState("");
  const [lineas, setLineas] = useState([]);   // [{ts, hex, ascii, peso}]
  const [bytesTotal, setBytesTotal] = useState(0);
  const [cmd, setCmd] = useState("\x05");
  const [autoScroll, setAutoScroll] = useState(true);
  const [dtr, setDtr] = useState(true);
  const [rts, setRts] = useState(true);

  const bufferRef = useRef("");
  const logRef = useRef(null);

  // Conexión COMPARTIDA con el resto de la app: si esta pantalla abriera la suya,
  // pelearía el puerto con la de calibración y quedaría trabado.
  const getBalanza = useCallback(() => balanzaCompartida(), []);

  const push = useCallback((entrada) => {
    setLineas((prev) => {
      const next = [...prev, { ts: new Date().toLocaleTimeString("es-AR", { hour12: false }), ...entrada }];
      return next.length > MAX_LINEAS ? next.slice(-MAX_LINEAS) : next;
    });
  }, []);

  useEffect(() => {
    const bal = getBalanza();
    const onChunk = (bytes) => {
      setBytesTotal((n) => n + bytes.length);
      // Log crudo de cada chunk, tal cual llega del puerto.
      push({ hex: aHex(bytes), ascii: aAscii(bytes), peso: null, tipo: "rx" });
      bufferRef.current += Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
      // 1) Protocolo Kretz real: STX + peso + CR.
      const [tramas, restoKretz] = extraerTramasKretz(bufferRef.current);
      if (tramas.length) {
        bufferRef.current = restoKretz;
        for (const t of tramas) {
          push({ hex: "", ascii: `KRETZ ${t.crudo} kg`, tipo: "parse", peso: { valor: t.kg, unidad: "kg", gramos: t.gramos, estable: true, crudo: t.crudo } });
        }
        return;
      }
      // 2) Fallback genérico por líneas, por si viniera en otro formato.
      const [completas, resto] = partirLineas(bufferRef.current);
      bufferRef.current = resto.length > 512 ? "" : resto;
      for (const l of completas) {
        const peso = parsearPeso(l);
        if (peso) push({ hex: "", ascii: l, peso, tipo: "parse" });
      }
    };
    const offChunk = bal.on("chunk", onChunk);
    const offError = bal.on("error", (err) => setError(err?.message || String(err)));
    const offClose = bal.on("close", () => setConectado(false));
    // Sólo me desuscribo: la conexión es compartida y tiene que sobrevivir a
    // que esta pantalla se desmonte (si no, se traba el puerto).
    return () => { offChunk(); offError(); offClose(); };
  }, [push, getBalanza]);

  // Refleja el estado si el puerto ya venía abierto desde otra pantalla.
  useEffect(() => { setConectado(getBalanza().conectado); }, [getBalanza]);

  useEffect(() => {
    if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lineas, autoScroll]);

  const ultimoPeso = useMemo(() => {
    for (let i = lineas.length - 1; i >= 0; i -= 1) if (lineas[i].peso) return lineas[i].peso;
    return null;
  }, [lineas]);

  async function conectar() {
    setError("");
    try {
      await getBalanza().conectar({ baudRate, dataBits, parity, stopBits });
      setConectado(true);
      push({ hex: "", ascii: `── Puerto abierto a ${baudRate} ${dataBits}${parity[0].toUpperCase()}${stopBits} ──`, peso: null, tipo: "info" });
    } catch (err) {
      // Si el usuario cancela el diálogo de puertos no es un error real.
      if (err?.name !== "NotFoundError") setError(err?.message || String(err));
    }
  }

  async function desconectar() {
    await getBalanza().desconectar();
    setConectado(false);
    push({ hex: "", ascii: "── Puerto cerrado ──", peso: null, tipo: "info" });
  }

  async function enviar(texto = cmd) {
    setError("");
    try {
      await getBalanza().enviar(texto);
      push({ hex: aHex(new TextEncoder().encode(texto)), ascii: aAscii(new TextEncoder().encode(texto)), peso: null, tipo: "tx" });
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function aplicarSenales(dtr, rts) {
    setDtr(dtr); setRts(rts);
    if (!conectado) return;
    try {
      await getBalanza().señales({ dataTerminalReady: dtr, requestToSend: rts });
      push({ hex: "", ascii: `── DTR=${dtr ? "1" : "0"} RTS=${rts ? "1" : "0"} ──`, peso: null, tipo: "info" });
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function copiarLog() {
    const txt = lineas.map((l) => `[${l.ts}] ${l.tipo.toUpperCase().padEnd(5)} ${l.hex ? `HEX ${l.hex}  ` : ""}${l.ascii}`).join("\n");
    navigator.clipboard?.writeText(`Balanza Kretz — ${baudRate} ${dataBits}${parity[0].toUpperCase()}${stopBits}\n${txt}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: 16, fontFamily: C.sans }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gap: 12 }}>

        {/* Cabecera */}
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <button type="button" onClick={() => nav(-1)} className="ui-btn ui-btn-fantasma">
            <ArrowLeft size={15} /> Volver
          </button>
          <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 13, display: "grid", placeItems: "center", background: `linear-gradient(145deg, ${C.blueL}, ${C.cyanL})`, border: `1px solid ${C.blueB}`, color: C.blue }}>
            <Activity size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim }}>Pañol</div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: C.text }}>Balanza · diagnóstico del puerto serie</h1>
            <div style={{ fontSize: 13, color: C.dim, marginTop: 3 }}>Conectá la balanza y mirá qué manda. Con eso escribimos el parser definitivo.</div>
          </div>
        </div>

        {!soportado && (
          <div style={{ ...CARD, borderColor: C.redB, background: C.redL, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertTriangle size={18} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: C.text }}>
              <b>Este navegador no soporta Web Serial.</b>
              <div style={{ color: C.dim, marginTop: 3, fontSize: 12.5 }}>Hay que abrir esta página en <b>Chrome o Edge de escritorio</b>. No funciona en Firefox, Safari, ni en celular.</div>
            </div>
          </div>
        )}

        {/* Configuración del puerto */}
        <div style={CARD}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={LBL}>Velocidad (baud)</label>
              <select value={baudRate} onChange={(e) => setBaudRate(Number(e.target.value))} disabled={conectado} style={{ ...INP, cursor: conectado ? "default" : "pointer" }}>
                {BAUD_RATES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Data bits</label>
              <select value={dataBits} onChange={(e) => setDataBits(Number(e.target.value))} disabled={conectado} style={{ ...INP, cursor: conectado ? "default" : "pointer" }}>
                <option value={8}>8</option><option value={7}>7</option>
              </select>
            </div>
            <div>
              <label style={LBL}>Paridad</label>
              <select value={parity} onChange={(e) => setParity(e.target.value)} disabled={conectado} style={{ ...INP, cursor: conectado ? "default" : "pointer" }}>
                <option value="none">none</option><option value="even">even</option><option value="odd">odd</option>
              </select>
            </div>
            <div>
              <label style={LBL}>Stop bits</label>
              <select value={stopBits} onChange={(e) => setStopBits(Number(e.target.value))} disabled={conectado} style={{ ...INP, cursor: conectado ? "default" : "pointer" }}>
                <option value={1}>1</option><option value={2}>2</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {!conectado ? (
              <button type="button" onClick={conectar} disabled={!soportado}
                style={{ border: "none", background: soportado ? C.green : C.panel2, color: soportado ? "var(--inverse-text)" : C.dim, borderRadius: 10, minHeight: 40, padding: "0 16px", cursor: soportado ? "pointer" : "default", fontFamily: C.sans, fontSize: 13.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Plug size={16} /> Conectar balanza
              </button>
            ) : (
              <button type="button" onClick={desconectar} className="ui-btn ui-btn-peligro">
                <PlugZap size={16} /> Desconectar
              </button>
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: conectado ? C.green : C.dim }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: conectado ? C.green : C.dim }} />
              {conectado ? "Conectado" : "Sin conectar"}
              {conectado && <span style={{ color: C.dim, fontFamily: C.mono }}>· {bytesTotal} bytes</span>}
            </span>
          </div>

          {error && (
            <div style={{ marginTop: 10, border: `1px solid ${C.redB}`, background: C.redL, borderRadius: 9, padding: "8px 11px", color: C.red, fontSize: 12.5, fontWeight: 600 }}>
              {error}
            </div>
          )}
        </div>

        {/* Peso detectado (best-effort, para confirmar que leemos bien) */}
        {ultimoPeso && (
          <div style={{ ...CARD, borderColor: C.greenB, background: C.greenL, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Check size={20} color={C.green} />
            <div>
              <div style={LBL}>Peso detectado</div>
              <div style={{ fontFamily: C.mono, fontSize: 26, fontWeight: 700, color: C.green, lineHeight: 1.1 }}>
                {ultimoPeso.valor} <span style={{ fontSize: 14, color: C.dim }}>{ultimoPeso.unidad}</span>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: C.dim, fontFamily: C.mono }}>
              ≈ {Math.round(ultimoPeso.gramos)} g{ultimoPeso.estable !== null && ` · ${ultimoPeso.estable ? "estable" : "inestable"}`}
              <div style={{ marginTop: 2 }}>de: <b style={{ color: C.text }}>{ultimoPeso.crudo}</b></div>
            </div>
          </div>
        )}

        {/* Líneas de control: algunas balanzas no transmiten sin DTR/RTS activos */}
        <div style={CARD}>
          <label style={LBL}>Líneas de control (si no llega nada, probá combinaciones)</label>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
            {[[true, true], [true, false], [false, true], [false, false]].map(([d, r]) => {
              const activo = dtr === d && rts === r;
              return (
                <button key={`${d}${r}`} type="button" onClick={() => aplicarSenales(d, r)} disabled={!conectado}
                  style={{
                    ...CHIP,
                    border: `1px solid ${activo ? C.blueB : C.border}`,
                    background: !conectado ? C.panel2 : activo ? C.blueL : C.panel,
                    color: !conectado ? C.dim : activo ? C.blue : C.dim,
                    cursor: conectado ? "pointer" : "default",
                  }}>
                  DTR={d ? 1 : 0} RTS={r ? 1 : 0}
                </button>
              );
            })}
            <span style={{ fontSize: 11, color: C.dim }}>Probá cada una y mirá si entra algo.</span>
          </div>
        </div>

        {/* Comandos de sondeo */}
        <div style={CARD}>
          <label style={LBL}>Si no llega nada, probá interrogar la balanza</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
            {COMANDOS.map((c) => (
              <button key={c.label} type="button" onClick={() => { setCmd(c.value); enviar(c.value); }} disabled={!conectado} title={c.hint}
                style={{ ...CHIP, border: `1px solid ${C.border}`, background: conectado ? C.panel : C.panel2, color: conectado ? C.blue : C.dim, cursor: conectado ? "pointer" : "default" }}>
                {c.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <input value={escaparCmd(cmd)}
              onChange={(e) => setCmd(desescaparCmd(e.target.value))}
              placeholder="Comando manual (usá \r \n \x05)" style={{ ...INP, flex: 1, fontFamily: C.mono }} />
            <button type="button" onClick={() => enviar()} disabled={!conectado} className="ui-btn" style={{ flexShrink: 0, color: conectado ? C.blue : C.dim }}>
              <Send size={14} /> Enviar
            </button>
          </div>
        </div>

        {/* Log crudo */}
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 13.5, fontWeight: 650, color: C.text }}>Lo que manda la balanza</b>
            <span style={{ fontSize: 11.5, color: C.dim, fontFamily: C.mono }}>{lineas.length} líneas</span>
            <label style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.dim, cursor: "pointer", fontWeight: 600 }}>
              <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> Auto-scroll
            </label>
            <button type="button" onClick={copiarLog} disabled={!lineas.length} className="ui-btn" style={{ minHeight: 32, padding: "0 11px", fontSize: 12, color: lineas.length ? C.blue : C.dim }}>
              <Copy size={13} /> Copiar
            </button>
            <button type="button" onClick={() => { setLineas([]); setBytesTotal(0); bufferRef.current = ""; }} className="ui-btn" style={{ minHeight: 32, padding: "0 11px", fontSize: 12, color: C.dim }}>
              <Trash2 size={13} /> Limpiar
            </button>
          </div>
          <div ref={logRef} style={{ height: 340, overflowY: "auto", background: C.bg, padding: "8px 12px", fontFamily: C.mono, fontSize: 11.5, lineHeight: 1.7 }}>
            {lineas.length === 0 ? (
              <div style={{ color: C.dim, fontFamily: C.sans, fontSize: 12.5, padding: "10px 0" }}>
                Todavía no llegó nada. Conectá el puerto y poné/sacá peso de la balanza. Si sigue vacío, probá otra velocidad o mandá un comando de sondeo.
              </div>
            ) : lineas.map((l, i) => {
              const color = l.tipo === "tx" ? C.violet : l.tipo === "parse" ? C.green : l.tipo === "info" ? C.dim : C.text;
              return (
                <div key={i} style={{ display: "flex", gap: 8, color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  <span style={{ color: C.dim, flexShrink: 0 }}>{l.ts}</span>
                  <span style={{ color: C.dim, flexShrink: 0, width: 34 }}>{l.tipo === "tx" ? "→" : l.tipo === "parse" ? "✓" : l.tipo === "info" ? "" : "←"}</span>
                  <span style={{ minWidth: 0 }}>{l.hex && <span style={{ color: C.dim }}>{l.hex}   </span>}{l.ascii}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.6, padding: "0 4px 20px" }}>
          <b style={{ color: C.text }}>Cómo usarlo:</b> conectá el cable, apretá "Conectar balanza" y elegí el puerto (en Windows aparece como COM3, COM4, etc.).
          Poné peso arriba de la balanza y mirá si aparecen líneas. Si no aparece nada, cambiá la velocidad (probá 9600 → 2400 → 4800 → 19200)
          o mandá un comando de sondeo. Cuando veas datos, apretá <b style={{ color: C.text }}>Copiar</b> y pasámelos: con eso escribo el parser exacto.
        </div>
      </div>
    </div>
  );
}
