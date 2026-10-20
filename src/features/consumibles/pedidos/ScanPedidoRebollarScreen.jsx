import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, X } from "lucide-react";
import { C } from "@/theme";
import { puedeVerPrecios } from "@/lib/permissions";
import { SEDES, fetchCatalogo, fmtCantidad, fmtPesos, guardarSedeDelEquipo, indexarCodigos, normalizarCodigo, sedeDelEquipo } from "@/features/consumibles/api";
import { coincideBusqueda } from "../conteo/conteoCalculos";
import { agregarAlCarrito, cambiarCantidad, confirmarPedido, fetchPedidos, obtenerCarrito, quitarRenglon } from "./pedidosApi";
import { PROVEEDOR_POR_DEFECTO, renglonesParaMostrar, textoWhatsApp, totalDePedido } from "./pedidosLogica";

/**
 * ScanPedidoRebollarScreen — el pedido a Rebollar desde el colector. Ruta: /scan-rebollar
 *
 * Se escanea la etiqueta del consumible y suma uno al carrito. Es el MISMO
 * carrito de Consumibles → Pedidos (uno por sede y proveedor, guardado en la
 * base): lo que se escanea acá aparece en la compu y al revés. Se puede
 * confirmar desde acá; el texto para WhatsApp queda en Pedidos.
 *
 * Restricciones del colector (como ScanPedidoScreen): Chrome viejo, sin `gap`
 * en flex ni `inset`; el lector tipea el código + Enter en el campo enfocado,
 * así que el campo recupera el foco después de cada acción; vibra al sumar.
 */

const PROVEEDOR = PROVEEDOR_POR_DEFECTO;

const field = {
  width: "100%", boxSizing: "border-box", background: C.panelSolid,
  border: `1px solid ${C.border}`, color: C.text, borderRadius: 9,
  padding: "10px 11px", fontSize: 15, fontFamily: C.sans, outline: "none",
};
const lbl = { margin: "0 0 5px", color: C.dim, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" };
const qbtn = {
  width: 46, height: 40, background: C.panel, border: `1px solid ${C.border}`,
  color: C.text, borderRadius: 9, lineHeight: 1, padding: 0,
  display: "grid", placeItems: "center",
};
const chico = {
  background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
  minHeight: 32, padding: "0 10px", fontFamily: C.sans, fontSize: 12, fontWeight: 600,
};

function buzz(ms = 40) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* sin vibrador */ }
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export default function ScanPedidoRebollarScreen({ profile }) {
  const [sede, setSede] = useState(() => sedeDelEquipo());
  if (!sede) return <ElegirSede onElegir={(s) => { guardarSedeDelEquipo(s); setSede(s); }} />;
  return <Pedido key={sede} sede={sede} verPrecios={puedeVerPrecios(profile)} onCambiarSede={() => setSede(null)} />;
}

function ElegirSede({ onElegir }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans, padding: 14, boxSizing: "border-box" }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>¿En qué pañol estás?</div>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 16 }}>El colector lo recuerda para la próxima.</div>
      {SEDES.map((s) => (
        <button key={s} type="button" onClick={() => onElegir(s)}
          style={{ display: "block", width: "100%", minHeight: 56, marginBottom: 10, borderRadius: 12, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, fontFamily: C.sans, fontSize: 17, fontWeight: 700 }}>
          {s}
        </button>
      ))}
    </div>
  );
}

function Pedido({ sede, verPrecios, onCambiarSede }) {
  const nav = useNavigate();
  const codeRef = useRef(null);
  const [catalogo, setCatalogo] = useState(null);
  const [carrito, setCarrito] = useState(null);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [ocupado, setOcupado] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [hecho, setHecho] = useState(null); // pedido recién confirmado

  const foco = useCallback(() => { setTimeout(() => { if (codeRef.current) codeRef.current.focus(); }, 30); }, []);

  const traerCarrito = useCallback(async () => {
    const { pedidos } = await fetchPedidos(sede, { limite: 20 });
    setCarrito(pedidos.find((p) => p.estado === "borrador" && String(p.proveedor).toLowerCase() === PROVEEDOR.toLowerCase()) || null);
  }, [sede]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [cat] = await Promise.all([fetchCatalogo({ sede }), traerCarrito()]);
        if (vivo) setCatalogo(cat || []);
      } catch (err) {
        if (vivo) { setCatalogo([]); setMsg({ ok: false, text: err.message || "No se pudo cargar el catálogo." }); }
      } finally {
        foco();
      }
    })();
    return () => { vivo = false; };
  }, [sede, traerCarrito, foco]);

  const porId = useMemo(() => new Map((catalogo || []).map((i) => [i.id, i])), [catalogo]);
  const indice = useMemo(() => indexarCodigos(catalogo || []), [catalogo]);
  const lineas = useMemo(() => (carrito ? renglonesParaMostrar(carrito, porId) : []), [carrito, porId]);
  const { total } = totalDePedido(lineas);

  const sugerencias = useMemo(() => {
    const q = buscar.trim();
    if (q.length < 2 || !catalogo) return [];
    return catalogo.filter((i) => coincideBusqueda(i, q)).slice(0, 8);
  }, [buscar, catalogo]);

  const aplicar = (renglon) => setCarrito((c) => {
    if (!c) return c;
    const items = c.items || [];
    return { ...c, items: items.some((r) => r.id === renglon.id) ? items.map((r) => (r.id === renglon.id ? renglon : r)) : [...items, renglon] };
  });

  async function sumar(item) {
    if (ocupado) return;
    setOcupado(true);
    try {
      let c = carrito;
      if (!c) {
        c = await obtenerCarrito(sede, PROVEEDOR);
        setCarrito(c);
      }
      const renglon = await agregarAlCarrito(c.id, item, 1);
      if (!carrito) setCarrito({ ...c, items: [...(c.items || []).filter((r) => r.id !== renglon.id), renglon] });
      else aplicar(renglon);
      buzz();
      setHecho(null);
      setMsg({ ok: true, text: `+ ${item.descripcion} (${fmtCantidad(renglon.cantidad)} ${renglon.unidad_compra || ""})` });
      setBuscar("");
    } catch (err) {
      buzz(120);
      setMsg({ ok: false, text: err.message || "No se pudo sumar." });
      await traerCarrito().catch(() => {});
    } finally {
      setOcupado(false);
      foco();
    }
  }

  function onScan(e) {
    e.preventDefault();
    const raw = codeRef.current ? codeRef.current.value.trim() : "";
    if (codeRef.current) codeRef.current.value = "";
    if (!raw) return;
    const item = indice.get(normalizarCodigo(raw));
    if (item) { sumar(item); return; }
    buzz(120);
    setBuscar(raw);
    setMsg({ ok: false, text: `El código ${raw} no es de ningún consumible. Buscalo por nombre abajo.` });
  }

  async function fijar(linea, cantidad) {
    if (ocupado) return;
    setOcupado(true);
    try {
      if (!(cantidad > 0)) {
        await quitarRenglon(linea.id);
        setCarrito((c) => (c ? { ...c, items: (c.items || []).filter((r) => r.id !== linea.id) } : c));
      } else {
        aplicar(await cambiarCantidad(linea.id, cantidad));
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message || "No se pudo cambiar la cantidad." });
      await traerCarrito().catch(() => {});
    } finally {
      setOcupado(false);
      foco();
    }
  }

  async function confirmar() {
    if (!carrito || !lineas.length || ocupado) return;
    if (!window.confirm(`¿Confirmar el pedido a ${PROVEEDOR}? ${lineas.length} producto${lineas.length === 1 ? "" : "s"} para ${sede}.`)) return;
    setOcupado(true);
    try {
      const p = await confirmarPedido(carrito.id, "");
      setHecho({ ...p, renglones: renglonesParaMostrar(p, porId) });
      setCarrito(null);
      setMsg({ ok: true, text: `✓ Pedido N° ${p.numero} confirmado` });
      buzz(200);
    } catch (err) {
      setMsg({ ok: false, text: err.message || "No se pudo confirmar el pedido." });
    } finally {
      setOcupado(false);
      foco();
    }
  }

  async function copiarHecho() {
    const ok = await copiar(textoWhatsApp({ pedido: hecho, renglones: hecho.renglones }));
    setMsg(ok ? { ok: true, text: "Texto copiado: pegalo en WhatsApp." } : { ok: false, text: "No se pudo copiar." });
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans, paddingBottom: 78 }}>
      <div style={{ padding: 11 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Pedido a {PROVEEDOR}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>
              Pañol {sede} · <button type="button" onClick={onCambiarSede} style={{ background: "none", border: 0, padding: 0, color: C.blue, fontFamily: C.sans, fontSize: 11, fontWeight: 600 }}>cambiar</button>
            </div>
          </div>
          <button type="button" onClick={() => nav("/colector")} style={{ ...chico, color: C.dim }}>Menú</button>
        </div>

        {msg && (
          <div style={{
            padding: "9px 11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, marginBottom: 9,
            background: msg.ok ? C.greenL : C.redL,
            border: `1px solid ${msg.ok ? C.greenB : C.redB}`, color: msg.ok ? C.green : C.red,
          }}>{msg.text}</div>
        )}

        {hecho && (
          <div style={{ border: `1px solid ${C.greenB}`, background: C.greenL, borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Pedido N° {hecho.numero}: {hecho.renglones.length} productos. Mandalo por WhatsApp o desde la compu en Consumibles → Pedidos. Cuando llegue, se recibe en Ingresos.
            </div>
            <button type="button" onClick={copiarHecho} style={{ ...chico, minHeight: 40, color: C.green, borderColor: C.greenB, marginRight: 6 }}>Copiar para WhatsApp</button>
            <button type="button" onClick={() => setHecho(null)} style={{ ...chico, minHeight: 40, color: C.dim }}>Listo</button>
          </div>
        )}

        <form onSubmit={onScan} style={{ marginBottom: 10 }}>
          <p style={lbl}>{catalogo == null ? "Cargando catálogo…" : "Disparó el lector o escribí el código"}</p>
          <div style={{ display: "flex" }}>
            <input
              ref={codeRef} defaultValue=""
              autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              enterKeyHint="enter" placeholder="Escaneá…" disabled={catalogo == null}
              style={{ ...field, flex: 1, fontSize: 19, marginRight: 6 }}
            />
            <button type="submit" disabled={catalogo == null} style={{ ...qbtn, width: 62, fontFamily: C.sans, fontSize: 15, fontWeight: 600, background: C.blue, color: "var(--inverse-text)", border: "none" }}>OK</button>
          </div>
        </form>

        <div style={{ marginBottom: 10 }}>
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="O buscá por nombre…" style={field} autoComplete="off" />
          {sugerencias.map((s) => (
            <button key={s.id} type="button" onClick={() => sumar(s)} disabled={ocupado}
              style={{ display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", color: C.text, fontFamily: C.sans, marginTop: 5 }}>
              <b style={{ fontSize: 13.5, fontWeight: 600 }}>{s.descripcion}</b>
              <span style={{ float: "right", color: C.dim, fontSize: 11 }}>{s.codigoEtiqueta || ""}</span>
            </button>
          ))}
        </div>

        <p style={lbl}>En el carrito {lineas.length > 0 ? `· ${lineas.length}` : ""}{verPrecios && total > 0 ? ` · ${fmtPesos(total)} sin IVA` : ""}</p>
        {lineas.length === 0 ? (
          <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "18px 12px", textAlign: "center", color: C.dim, fontSize: 13, marginBottom: 10 }}>
            Escaneá lo que haga falta pedirle a {PROVEEDOR}…
          </div>
        ) : (
          <div style={{ marginBottom: 10 }}>
            {lineas.map((l) => (
              <div key={l.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 9px", marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0, flex: 1, marginRight: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.descripcion}</div>
                    <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
                      {[l.codigoEtiqueta, l.codigoProveedor ? `Cód. ${l.codigoProveedor}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <button type="button" onClick={() => fijar(l, 0)} disabled={ocupado} aria-label={`Quitar ${l.descripcion}`}
                    style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", background: "none", border: "none", color: C.dim, padding: 0 }}>
                    <X size={18} />
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", marginTop: 7 }}>
                  <button type="button" onClick={() => fijar(l, Number(l.cantidad) - 1)} disabled={ocupado} aria-label="Uno menos" style={{ ...qbtn, marginRight: 6 }}><Minus size={18} /></button>
                  <div style={{ ...field, textAlign: "center", fontSize: 20, fontWeight: 600, padding: "7px 4px", flex: 1, marginRight: 6 }}>{fmtCantidad(l.cantidad)}</div>
                  <button type="button" onClick={() => fijar(l, Number(l.cantidad) + 1)} disabled={ocupado} aria-label="Uno más" style={{ ...qbtn, marginRight: 6 }}><Plus size={18} /></button>
                  <span style={{ fontSize: 11, color: C.dim, width: 54, textAlign: "right" }}>
                    {l.unidad_compra}{l.factor > 1 ? ` x${fmtCantidad(l.factor)}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: 9, background: C.panelSolid, borderTop: `1px solid ${C.border}` }}>
        <button type="button" onClick={confirmar} disabled={!lineas.length || ocupado}
          style={{
            width: "100%", padding: "14px 10px", borderRadius: 11, border: "none",
            background: lineas.length && !ocupado ? C.green : C.panel2,
            color: lineas.length && !ocupado ? "var(--inverse-text)" : C.dim,
            fontSize: 16, fontWeight: 600, fontFamily: C.sans,
          }}>
          {ocupado ? "Guardando…" : `Confirmar pedido${lineas.length ? ` (${lineas.length})` : ""}`}
        </button>
      </div>
    </div>
  );
}
