import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Check, ContactRound, LoaderCircle, Minus, Nfc, Plus, RotateCcw, ScanBarcode, Search, Trash2, TriangleAlert, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";
import useNfcBridge from "@/features/panol/useNfcBridge";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { buscarEmpleadoPorNfc, normalizeNfcUid } from "@/features/rrhh/api";
import { cargarKiosco, normalizarCodigo, registrarMovimiento, ultimosMovimientos, vincularCodigo } from "@/features/panol/kioscoApi";

/**
 * Egreso de consumibles — la caja del pañol.
 *
 * Dos pasos, y el orden importa:
 *
 *   1. SE MARCA.    Se pasan los productos por la pistola y el carrito se arma
 *                   solo. Nadie tiene que identificarse todavia: primero hay
 *                   que ver que se esta llevando.
 *   2. SE FIRMA.    Recien ahi la tarjeta. La tarjeta no es el login, es lo que
 *                   da derecho a confirmar: apoyarla ES la firma del retiro.
 *
 * Al principio estaba al reves -tarjeta primero- y estaba mal: obligaba a
 * identificarse para ver que iba a marcar, que es como pedir el DNI antes de
 * dejar entrar al supermercado.
 *
 * El foco manda en las dos pantallas. En la de marcar, el campo de escaneo lo
 * tiene siempre, porque el lector es un teclado que escribe rapido y manda
 * Enter: si el foco esta en otro lado el escaneo se pierde. En la de firmar
 * escucha el lector de tarjetas, y ahi el de codigos se apaga para que no se
 * peleen por el mismo teclado.
 */

const fmt = (n) => String(Math.round(Number(n || 0) * 100) / 100).replace(".", ",");
const limpio = (v) => String(v ?? "").trim();
const tieneApellido = (v) => limpio(v).split(/\s+/).filter(Boolean).length >= 2;

export default function EgresoConsumiblesScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const escaneoRef = useRef(null);
  const nombreRef = useRef(null);
  const firmaRef = useRef(null);

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [modo, setModo] = useState("egreso");
  const [paso, setPaso] = useState("marcando");     // marcando | firmando | listo
  const pasoRef = useRef(paso);
  pasoRef.current = paso;
  const [carrito, setCarrito] = useState([]);
  const [codigo, setCodigo] = useState("");
  const [ultimo, setUltimo] = useState(null);
  const [desconocido, setDesconocido] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [sector, setSector] = useState("");
  const [obraId, setObraId] = useState("");

  const [persona, setPersona] = useState(null);
  const [nombreLibre, setNombreLibre] = useState("");
  const [aMano, setAMano] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [comprobante, setComprobante] = useState(null);
  const [historial, setHistorial] = useState([]);

  const esEgreso = modo === "egreso";
  const tono = esEgreso ? C.red : C.green;
  const quien = persona?.nombre || limpio(nombreLibre);
  const puedeFirmar = Boolean(persona) || tieneApellido(nombreLibre);
  const totalItems = carrito.reduce((s, x) => s + x.cantidad, 0);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await cargarKiosco();
      setDatos(d);
      setError("");
      setHistorial(await ultimosMovimientos(12));
    } catch (e) {
      setError(e.message || "No se pudo abrir la caja.");
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // ── El foco, que es lo que hace que los lectores funcionen ────────────────
  const enfocarEscaneo = useCallback(() => {
    if (pasoRef.current !== "marcando" || desconocido || guardando) return;
    escaneoRef.current?.focus();
  }, [desconocido, guardando]);
  useEffect(() => { enfocarEscaneo(); }, [enfocarEscaneo, paso, carrito.length, cargando]);

  // ── La tarjeta: solo escucha cuando toca firmar ───────────────────────────
  const resolverTarjeta = useCallback(async (raw) => {
    const uid = normalizeNfcUid(raw);
    if (!uid) return;
    try {
      const emp = await buscarEmpleadoPorNfc(uid);
      if (!emp) { toast.error(`Tarjeta ${uid} sin empleado asignado.`); return; }
      setPersona({ nombre: emp.nombre, dni: emp.dni, uid });
      setNombreLibre("");
    } catch (e) {
      toast.error(e.message || "No se pudo leer la tarjeta.");
    }
  }, [toast]);

  const escuchandoTarjeta = paso === "firmando" && !persona && !guardando;
  const { status: lector } = useNfcBridge({ enabled: escuchandoTarjeta, onUid: resolverTarjeta });
  useKeyboardWedge({ enabled: escuchandoTarjeta, onScan: resolverTarjeta, minLength: 4, timeoutMs: 65 });

  // ── Carrito ───────────────────────────────────────────────────────────────
  function sumar(material, cantidad = 1) {
    setCarrito((prev) => {
      const i = prev.findIndex((x) => x.id === material.id);
      if (i < 0) return [{ ...material, cantidad }, ...prev];
      const copia = [...prev];
      copia[i] = { ...copia[i], cantidad: copia[i].cantidad + cantidad };
      copia.unshift(copia.splice(i, 1)[0]);
      return copia;
    });
    setUltimo({ id: material.id, en: Date.now() });
  }

  function procesarEscaneo(valor) {
    const k = normalizarCodigo(valor);
    setCodigo("");
    if (!k || !datos) return;
    const id = datos.porCodigo.get(k);
    const material = id ? datos.porId.get(id) : null;
    if (material) { sumar(material); return; }
    setDesconocido(k);
    setBuscar("");
  }

  async function asignarCodigo(material) {
    try {
      await vincularCodigo({ materialId: material.id, codigo: desconocido });
      setDatos((prev) => {
        const porCodigo = new Map(prev.porCodigo);
        porCodigo.set(desconocido, material.id);
        return { ...prev, porCodigo, conCodigo: new Set(porCodigo.values()).size };
      });
      sumar(material);
      setDesconocido(null);
      toast.success(`Código vinculado a ${material.descripcion}.`);
    } catch (e) {
      toast.error(e.message || "No se pudo vincular el código.");
    }
  }

  const cambiar = (id, delta) => setCarrito((prev) => prev
    .map((x) => (x.id === id ? { ...x, cantidad: Math.max(0, x.cantidad + delta) } : x))
    .filter((x) => x.cantidad > 0));

  /**
   * Pasar a firmar es, sobre todo, mover el foco.
   *
   * El lector de tarjetas escribe como un teclado y el hook lo ignora cuando el
   * foco esta en un campo de texto. Si el cursor se queda en el escaneo -o peor,
   * si se enfoca solo el campo de nombre- la tarjeta escribe su UID adentro del
   * input y nadie entiende por que no lee. Por eso el foco va al panel, que no
   * es editable, y escribir el nombre hay que pedirlo a proposito.
   */
  function irAFirmar() {
    setPaso("firmando");
    setAMano(false);
    escaneoRef.current?.blur();
    setTimeout(() => firmaRef.current?.focus(), 180);
  }

  function volverAMarcar() {
    setPaso("marcando");
    setPersona(null);
    setNombreLibre("");
    setAMano(false);
    setTimeout(enfocarEscaneo, 80);
  }

  function empezarDeNuevo() {
    setCarrito([]);
    setUltimo(null);
    setPersona(null);
    setNombreLibre("");
    setAMano(false);
    setSector("");
    setObraId("");
    setComprobante(null);
    setPaso("marcando");
    setTimeout(enfocarEscaneo, 80);
  }

  async function firmar() {
    if (!carrito.length || (esEgreso && !puedeFirmar)) return;
    setGuardando(true);
    try {
      await registrarMovimiento({
        modo, items: carrito, quien: quien || (profile?.username ?? "pañol"),
        dni: persona?.dni || "", sector, obraId: obraId || null,
      });
      setDatos((prev) => {
        if (!prev) return prev;
        const signo = esEgreso ? -1 : 1;
        const porId = new Map(prev.porId);
        for (const item of carrito) {
          const m = porId.get(item.id);
          if (m) porId.set(item.id, { ...m, stock: Math.round((m.stock + signo * item.cantidad) * 100) / 100 });
        }
        return { ...prev, porId, consumibles: prev.consumibles.map((c) => porId.get(c.id) || c) };
      });
      setComprobante({
        quien: quien || "pañol",
        porTarjeta: Boolean(persona),
        items: carrito,
        total: totalItems,
        cuando: new Date(),
      });
      setPaso("listo");
      setHistorial(await ultimosMovimientos(12));
    } catch (e) {
      toast.error(e.message || "No se pudo registrar.");
    } finally {
      setGuardando(false);
    }
  }

  const candidatos = useMemo(() => {
    if (!datos) return [];
    const q = buscar.trim().toLowerCase();
    if (!q) return datos.consumibles.slice(0, 40);
    return datos.consumibles.filter((c) => c.descripcion.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q)).slice(0, 40);
  }, [datos, buscar]);

  const panel = { background: "var(--panel-solid)", border: `1px solid ${C.border}`, borderRadius: 14, backdropFilter: "var(--glass-filter)", WebkitBackdropFilter: "var(--glass-filter)" };
  const campo = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.border2}`, background: "var(--panel-2)", color: C.text, borderRadius: 10, padding: "10px 12px", fontFamily: C.sans, fontSize: 14, fontWeight: 700, outline: "none" };
  const etiqueta = { display: "block", fontSize: 10, fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase", color: C.dim, marginBottom: 5 };

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <style>{`
        .caja-item { transition: background .12s ease; }
        .caja-item:hover { background: var(--panel-2); }
        .caja-btn { transition: border-color .14s ease, color .14s ease; }
        .caja-btn:hover { border-color: ${C.blueB}; color: ${C.blue}; }
        @keyframes caja-entra { from { background: ${C.greenB}; } to { background: transparent; } }
        .caja-nuevo { animation: caja-entra 1s ease-out; }
        @keyframes caja-late { 0%,100% { opacity: .4; transform: scale(1) } 50% { opacity: 1; transform: scale(1.06) } }
        .caja-late { animation: caja-late 1.9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .caja-nuevo, .caja-late { animation: none; } }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px minmax(0,1fr)", height: "100%" }}>
        <Sidebar profile={profile} signOut={signOut} />

        <main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <header style={{ minHeight: 54, display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "9px 12px 9px 54px" : "9px 18px", borderBottom: `1px solid ${C.border}`, background: C.topbar, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", color: tono, background: esEgreso ? C.redL : "var(--green-soft)", border: `1px solid ${esEgreso ? C.redB : C.greenB}` }}>
              {esEgreso ? <ArrowUpFromLine size={17} /> : <ArrowDownToLine size={17} />}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>{esEgreso ? "Egreso de consumibles" : "Ingreso de consumibles"}</div>
              <div style={{ color: C.dim, fontSize: 10.5, marginTop: 1 }}>
                {esEgreso ? "Pasá los productos, después firmás con la tarjeta" : "Lo que entra al pañol, también por la pistola"}
                {datos ? ` · ${datos.conCodigo} de ${datos.consumibles.length} con código` : ""}
              </div>
            </div>
            {paso === "marcando" ? (
              <div style={{ display: "inline-flex", padding: 2, gap: 2, borderRadius: 9, border: `1px solid ${C.border2}`, background: "var(--panel-2)" }}>
                {[{ v: "egreso", t: "Sale" }, { v: "ingreso", t: "Entra" }].map((o) => (
                  <button key={o.v} type="button" onClick={() => { setModo(o.v); setCarrito([]); }} aria-pressed={modo === o.v}
                    style={{ border: "none", borderRadius: 7, padding: "6px 13px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5,
                      fontWeight: modo === o.v ? 900 : 700,
                      background: modo === o.v ? (o.v === "egreso" ? C.redL : "var(--green-soft)") : "transparent",
                      color: modo === o.v ? (o.v === "egreso" ? C.red : C.green) : C.dim }}>{o.t}</button>
                ))}
              </div>
            ) : null}
            <button type="button" onClick={cargar} disabled={cargando} aria-label="Actualizar"
              style={{ border: `1px solid ${C.border2}`, background: "var(--panel-solid)", color: C.text, borderRadius: 9, padding: "8px 10px", cursor: "pointer" }}>
              {cargando ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}
            </button>
          </header>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: isMobile ? 12 : 16, display: "grid", gap: 14, gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.35fr) minmax(0,1fr)", alignContent: "start" }}>
            {error ? <div style={{ ...panel, gridColumn: "1 / -1", borderColor: C.redB, background: C.redL, padding: "12px 15px", color: C.red, fontSize: 13, fontWeight: 800 }}>{error}</div> : null}

            <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
              <section style={{ ...panel, padding: 16, borderColor: tono }}>
                <label style={etiqueta} htmlFor="caja-scan">{esEgreso ? "Pasá los productos" : "Pasá lo que entra"}</label>
                <div style={{ position: "relative" }}>
                  <ScanBarcode size={20} color={tono} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  <input
                    id="caja-scan" ref={escaneoRef} value={codigo} autoComplete="off"
                    onChange={(e) => setCodigo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); procesarEscaneo(codigo); } }}
                    onBlur={() => setTimeout(enfocarEscaneo, 120)}
                    placeholder="Uno atrás del otro…"
                    style={{ ...campo, padding: "16px 14px 16px 44px", fontSize: 17, fontFamily: C.mono, letterSpacing: 1 }}
                  />
                </div>
                <p style={{ margin: "9px 0 0", color: C.dim, fontSize: 11.5, fontWeight: 750 }}>
                  {esEgreso ? "Marcá todo primero. La tarjeta va al final, para firmar." : "Cargá lo que llegó y confirmá."}
                </p>
              </section>

              <section style={{ ...panel, padding: 14, display: "grid", gap: 11, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
                <div>
                  <label style={etiqueta} htmlFor="caja-sector">Sector</label>
                  <input id="caja-sector" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Taller, laminación…" style={campo} />
                </div>
                <div>
                  <label style={etiqueta} htmlFor="caja-obra">Obra</label>
                  <select id="caja-obra" value={obraId} onChange={(e) => setObraId(e.target.value)} style={campo}>
                    <option value="">Sin obra · consumo general</option>
                    {(datos?.obras ?? []).map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
                  </select>
                </div>
              </section>

              <section style={{ ...panel, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 15px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 14, fontWeight: 950, color: C.text }}>{esEgreso ? "Se lleva" : "Entra"}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 900, color: carrito.length ? tono : C.dim }}>{totalItems || "—"}</span>
                  {carrito.length ? (
                    <button type="button" onClick={() => { setCarrito([]); enfocarEscaneo(); }} className="caja-btn"
                      style={{ marginLeft: "auto", border: `1px solid ${C.border2}`, background: "transparent", color: C.dim, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: C.sans }}>Vaciar</button>
                  ) : null}
                </div>

                {!carrito.length ? (
                  <div style={{ padding: "38px 16px", textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
                    Todavía no pasó nada por la pistola.
                  </div>
                ) : (
                  <div>
                    {carrito.map((x) => {
                      const m = datos?.porId.get(x.id);
                      const quedan = (m?.stock ?? 0) + (esEgreso ? -x.cantidad : x.cantidad);
                      return (
                        <div key={x.id} className={`caja-item${ultimo?.id === x.id ? " caja-nuevo" : ""}`}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 15px", borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: C.text, fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.descripcion}</div>
                            <div style={{ color: esEgreso && quedan < 0 ? C.red : C.dim, fontSize: 11, fontWeight: 750 }}>
                              {x.unidad}
                              {esEgreso && quedan < 0 ? ` · el sistema dice ${fmt(m?.stock)}, se lleva más` : ` · queda${quedan === 1 ? "" : "n"} ${fmt(quedan)}`}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                            <button type="button" onClick={() => cambiar(x.id, -1)} aria-label="Uno menos" className="caja-btn"
                              style={{ border: `1px solid ${C.border2}`, background: "var(--panel-2)", color: C.text, borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "grid", placeItems: "center" }}><Minus size={14} /></button>
                            <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 950, minWidth: 36, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{fmt(x.cantidad)}</span>
                            <button type="button" onClick={() => cambiar(x.id, 1)} aria-label="Uno más" className="caja-btn"
                              style={{ border: `1px solid ${C.border2}`, background: "var(--panel-2)", color: C.text, borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "grid", placeItems: "center" }}><Plus size={14} /></button>
                            <button type="button" onClick={() => setCarrito((p) => p.filter((y) => y.id !== x.id))} aria-label="Sacar" className="caja-btn"
                              style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 5, marginLeft: 2 }}><Trash2 size={14} /></button>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ padding: 14 }}>
                      <button type="button"
                        onClick={() => { if (esEgreso) irAFirmar(); else firmar(); }}
                        disabled={guardando}
                        style={{ width: "100%", border: "none", borderRadius: 11, padding: "16px 18px", cursor: guardando ? "default" : "pointer",
                          background: tono, color: "#fff", fontFamily: C.sans, fontSize: 15.5, fontWeight: 950,
                          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                        {guardando ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
                        {esEgreso ? `Terminé · ${totalItems} para firmar` : "Confirmar el ingreso"}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <section style={{ ...panel, overflow: "hidden", alignSelf: "start" }}>
              <div style={{ padding: "12px 15px", borderBottom: `1px solid ${C.border}`, fontSize: 13.5, fontWeight: 900, color: C.text }}>Lo último que pasó</div>
              {!historial.length ? (
                <div style={{ padding: "28px 16px", textAlign: "center", color: C.dim, fontSize: 12.5, fontWeight: 750 }}>Todavía no hay movimientos.</div>
              ) : historial.map((h) => {
                const entra = String(h.source || "").includes("stock");
                return (
                  <div key={h.id} style={{ padding: "9px 15px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <span style={{ flexShrink: 0, marginTop: 2, color: entra ? C.green : C.red }}>
                      {entra ? <ArrowDownToLine size={13} /> : <ArrowUpFromLine size={13} />}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontFamily: C.mono, fontSize: 12.5, fontWeight: 900, color: C.text }}>{fmt(h.cantidad_egresada || h.cantidad)}</span>
                        <span style={{ color: C.text, fontSize: 12.5, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.descripcion}</span>
                      </div>
                      <div style={{ color: C.dim, fontSize: 11, fontWeight: 700, marginTop: 1 }}>
                        {h.retirado_por || "sin nombre"}
                        {h.sector_destino ? ` · ${h.sector_destino}` : ""}
                        {h.egreso_at ? ` · ${new Date(h.egreso_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        </main>
      </div>

      {/* ══ Paso 2: la firma ══════════════════════════════════════════════ */}
      {paso === "firmando" ? (
        <div role="dialog" aria-modal="true" aria-label="Firmar el retiro"
          style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(4,10,16,.8)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 16 }}>
          <div ref={firmaRef} tabIndex={-1}
            onKeyDown={(e) => { if (e.key === "Escape") volverAMarcar(); }}
            style={{ ...panel, width: "100%", maxWidth: 680, maxHeight: "min(92vh, 860px)", display: "flex", flexDirection: "column", overflow: "hidden", outline: "none" }}>

            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" onClick={volverAMarcar} className="caja-btn"
                style={{ border: `1px solid ${C.border2}`, background: "var(--panel-2)", color: C.text, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <ArrowLeft size={14} /> Seguir marcando
              </button>
              <div style={{ minWidth: 0, flex: 1, textAlign: "right" }}>
                <div style={{ color: C.text, fontSize: 16.5, fontWeight: 950 }}>Se lleva {totalItems} {totalItems === 1 ? "cosa" : "cosas"}</div>
                <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>{carrito.length === 1 ? "un solo producto" : `${carrito.length} productos distintos`}</div>
              </div>
            </div>

            {/* Lo que se lleva, para leerlo antes de firmar */}
            <div style={{ flex: "0 1 auto", overflowY: "auto", borderBottom: `1px solid ${C.border}`, maxHeight: 230 }}>
              {carrito.map((x) => (
                <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 950, color: tono, minWidth: 34, fontVariantNumeric: "tabular-nums" }}>{fmt(x.cantidad)}</span>
                  <span style={{ color: C.text, fontSize: 13.5, fontWeight: 800, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.descripcion}</span>
                  <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>{x.unidad}</span>
                </div>
              ))}
              {sector || obraId ? (
                <div style={{ padding: "9px 20px", color: C.dim, fontSize: 12, fontWeight: 750 }}>
                  Para {sector || "el taller"}{obraId ? ` · obra ${datos?.obras.find((o) => o.id === obraId)?.codigo ?? ""}` : ""}
                </div>
              ) : null}
            </div>

            {/* La firma */}
            <div style={{ padding: 20, display: "grid", gap: 15 }}>
              {persona ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, border: `1px solid ${C.greenB}`, background: "var(--green-soft)" }}>
                  <ContactRound size={24} color={C.green} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: C.text, fontSize: 15.5, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{persona.nombre}</div>
                    <div style={{ color: C.green, fontSize: 11.5, fontWeight: 800 }}>tarjeta {persona.uid}{persona.dni ? ` · DNI ${persona.dni}` : ""}</div>
                  </div>
                  <button type="button" onClick={() => setPersona(null)} className="caja-btn"
                    style={{ border: `1px solid ${C.border2}`, background: "var(--panel-solid)", color: C.dim, borderRadius: 8, padding: "5px 11px", cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: C.sans }}>No soy yo</button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 18px", borderRadius: 12, border: `1px solid ${C.blueB}`, background: C.blueL }}>
                    <Nfc size={32} color={C.blue} className={aMano ? "" : "caja-late"} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Apoyá la tarjeta para firmar</div>
                      <div style={{ color: C.dim, fontSize: 12, fontWeight: 750, marginTop: 2 }}>
                        {aMano
                          ? "Mientras escribís el nombre la tarjeta no lee"
                          : lector === "open"
                            ? `Lector listo${datos ? ` · ${datos.conTarjeta} personas tienen tarjeta` : ""}`
                            : "Buscando el lector… igual podés pasarla, algunos escriben como teclado"}
                      </div>
                    </div>
                  </div>

                  {aMano ? (
                    <div>
                      <label style={etiqueta} htmlFor="caja-nombre">Nombre y apellido</label>
                      <input id="caja-nombre" ref={nombreRef} value={nombreLibre} autoComplete="off"
                        onChange={(e) => setNombreLibre(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && puedeFirmar) firmar(); }}
                        placeholder="Los dos, para saber quién fue" style={{ ...campo, fontSize: 15 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
                        <span style={{ color: limpio(nombreLibre) && !tieneApellido(nombreLibre) ? C.red : C.dim, fontSize: 11.5, fontWeight: 800 }}>
                          {limpio(nombreLibre) && !tieneApellido(nombreLibre) ? "Falta el apellido." : "Queda anotado a mano, sin tarjeta."}
                        </span>
                        <button type="button" onClick={() => { setAMano(false); setNombreLibre(""); firmaRef.current?.focus(); }} className="caja-btn"
                          style={{ marginLeft: "auto", border: "none", background: "transparent", color: C.blue, cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 850, padding: 0 }}>
                          Mejor uso la tarjeta
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setAMano(true); setTimeout(() => nombreRef.current?.focus(), 40); }} className="caja-btn"
                      style={{ border: `1px dashed ${C.border2}`, background: "transparent", color: C.dim, borderRadius: 11, padding: "11px 14px", cursor: "pointer", fontFamily: C.sans, fontSize: 13, fontWeight: 800 }}>
                      No tengo tarjeta · escribo nombre y apellido
                    </button>
                  )}
                </>
              )}

              <button type="button" onClick={firmar} disabled={guardando || !puedeFirmar}
                style={{ width: "100%", border: "none", borderRadius: 12, padding: "17px 18px", cursor: guardando || !puedeFirmar ? "default" : "pointer",
                  background: puedeFirmar ? C.green : "var(--panel-2)", color: puedeFirmar ? "#fff" : C.dim,
                  fontFamily: C.sans, fontSize: 16, fontWeight: 950, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                {guardando ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />}
                {puedeFirmar ? `Firmar y llevarme las ${totalItems}` : "Falta la tarjeta o el nombre"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ══ Paso 3: el comprobante ════════════════════════════════════════ */}
      {paso === "listo" && comprobante ? (
        <div role="dialog" aria-modal="true" aria-label="Retiro registrado"
          style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(4,10,16,.8)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ ...panel, width: "100%", maxWidth: 520, overflow: "hidden", textAlign: "center", padding: "30px 24px 24px" }}>
            <div style={{ width: 58, height: 58, borderRadius: "50%", margin: "0 auto 15px", display: "grid", placeItems: "center", background: "var(--green-soft)", border: `2px solid ${C.greenB}` }}>
              <Check size={30} color={C.green} />
            </div>
            <div style={{ color: C.text, fontSize: 20, fontWeight: 950 }}>Listo</div>
            <div style={{ color: C.dim, fontSize: 13.5, fontWeight: 750, marginTop: 4 }}>
              {comprobante.total} {comprobante.total === 1 ? "cosa" : "cosas"} a nombre de <strong style={{ color: C.text, fontWeight: 900 }}>{comprobante.quien}</strong>
            </div>
            <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 700, marginTop: 3 }}>
              {comprobante.porTarjeta ? "firmado con tarjeta" : "cargado a mano"} · {comprobante.cuando.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div style={{ margin: "18px 0 20px", textAlign: "left", border: `1px solid ${C.border}`, borderRadius: 11, overflow: "hidden", maxHeight: 190, overflowY: "auto" }}>
              {comprobante.items.map((x) => (
                <div key={x.id} style={{ display: "flex", gap: 9, padding: "8px 13px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 900, color: C.text, minWidth: 30 }}>{fmt(x.cantidad)}</span>
                  <span style={{ color: C.text, fontSize: 12.5, fontWeight: 750, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.descripcion}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={empezarDeNuevo}
              style={{ width: "100%", border: "none", borderRadius: 12, padding: "15px 18px", cursor: "pointer", background: C.blue, color: "#fff", fontFamily: C.sans, fontSize: 15, fontWeight: 950 }}>
              Sigue el próximo
            </button>
          </div>
        </div>
      ) : null}

      {/* ══ Código desconocido ════════════════════════════════════════════ */}
      {desconocido ? (
        <div role="dialog" aria-modal="true" aria-label="Código sin cargar"
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(4,10,16,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setDesconocido(null); setTimeout(enfocarEscaneo, 60); } }}>
          <div style={{ ...panel, width: "100%", maxWidth: 560, maxHeight: "min(88vh, 720px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", gap: 11 }}>
              <TriangleAlert size={19} color={C.violet} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>Este código no está cargado</div>
                <div style={{ color: C.dim, fontSize: 12, fontWeight: 750, marginTop: 2, fontFamily: C.mono }}>{desconocido}</div>
                <div style={{ color: C.dim, fontSize: 12, fontWeight: 700, marginTop: 6 }}>Elegí de qué producto es y queda vinculado para siempre.</div>
              </div>
              <button type="button" onClick={() => { setDesconocido(null); setTimeout(enfocarEscaneo, 60); }} aria-label="Cerrar"
                style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 3 }}><X size={18} /></button>
            </div>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, position: "relative" }}>
              <Search size={15} color={C.dim} style={{ position: "absolute", left: 29, top: "50%", transform: "translateY(-50%)" }} />
              <input autoFocus value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre…" style={{ ...campo, paddingLeft: 34 }} />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {!candidatos.length ? (
                <div style={{ padding: "28px 18px", textAlign: "center", color: C.dim, fontSize: 12.5, fontWeight: 750 }}>
                  Ninguno coincide. Si es nuevo hay que darlo de alta en el catálogo.
                </div>
              ) : candidatos.map((m) => (
                <button key={m.id} type="button" className="caja-item" onClick={() => asignarCodigo(m)}
                  style={{ width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", padding: "10px 18px", fontFamily: C.sans, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: C.text, fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.descripcion}</div>
                    <div style={{ color: C.dim, fontSize: 11, fontWeight: 700 }}>{m.rubro} · {m.unidad}</div>
                  </div>
                  <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 850, color: m.stock > 0 ? C.text : C.dim, flexShrink: 0 }}>{fmt(m.stock)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
