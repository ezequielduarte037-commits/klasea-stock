import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { fetchPanolCatalogMini, fetchMaterialesEgreso } from "@/features/panol/panolApi";
import { stockPorMaterial } from "@/features/panol/panolMovimientos";
import { agregarCodigoBarraMaterial } from "@/features/materiales/api";
import { addRequestItem, createComprasAviso, createPurchaseRequest } from "@/features/compras/purchaseRequestsApi";

/**
 * ScanPedidoScreen — aviso a compras desde el colector. Ruta: /scan-pedido
 *
 * Pañol escanea lo que se está por acabar y manda UN pedido a compras con todos
 * los ítems juntos. Cada ítem queda VINCULADO al material del catálogo
 * (`material_id`), así compras no tiene que adivinar a qué producto se refiere
 * el texto — que es lo que produjo casos como "Heladerita" vs el ítem real.
 *
 * Restricciones del colector (mismas que ScanEgresoScreen):
 *   - Pantalla chica y Chrome viejo: layout simple, sin `inset`, targets grandes.
 *   - El lector físico (HID) tipea el código + Enter en el campo enfocado, así que
 *     el input de escaneo tiene que recuperar el foco después de cada acción.
 *   - Se usa en taller: feedback por vibración, porque no se escucha nada.
 */

const CART_KEY = "klasea:scan-pedido";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s ?? "").trim().toLowerCase();

const field = {
  width: "100%", boxSizing: "border-box", background: C.panelSolid,
  border: `1px solid ${C.border}`, color: C.text, borderRadius: 9,
  padding: "10px 11px", fontSize: 15, fontFamily: C.sans, outline: "none",
};
const lbl = { margin: "0 0 5px", color: C.dim, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 };
const qbtn = {
  width: 46, height: 40, background: C.panel, border: `1px solid ${C.border}`,
  color: C.text, borderRadius: 9, fontSize: 22, fontWeight: 800, lineHeight: 1, padding: 0,
};

// Códigos de barra de un material (columna directa + tabla de códigos extra).
function codigosDe(mat) {
  const out = [];
  if (mat.codigo_barra) out.push(String(mat.codigo_barra));
  for (const c of mat.codigos_barra || []) if (c?.codigo) out.push(String(c.codigo));
  return out;
}

function buzz(ms = 40) {
  try { navigator.vibrate?.(ms); } catch { /* sin vibrador */ }
}

export default function ScanPedidoScreen({ profile }) {
  const nav = useNavigate();
  const [catalogo, setCatalogo] = useState([]);
  const [stockMap, setStockMap] = useState(new Map());
  const [obras, setObras] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [code, setCode] = useState("");
  const [cart, setCart] = useState(() => {
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [obra, setObra] = useState("");
  // "pedido" = purchase_request con un ítem por producto (entra al circuito formal
  // de compras). "aviso" = un compras_avisos por producto (heads-up suelto, se
  // resuelve o descarta individualmente). Los mira gente distinta, por eso se elige.
  const [tipo, setTipo] = useState("pedido");
  const [prioridad, setPrioridad] = useState("media");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState(null);      // {ok, text}
  const [enviando, setEnviando] = useState(false);
  const [pendienteCodigo, setPendienteCodigo] = useState(""); // código escaneado sin dueño
  const [buscar, setBuscar] = useState("");
  const codeRef = useRef(null);

  const foco = useCallback(() => { setTimeout(() => codeRef.current?.focus(), 30); }, []);

  useEffect(() => {
    (async () => {
      try {
        const [cat, ledger, obrasRes] = await Promise.all([
          fetchPanolCatalogMini({ q: "", limit: 5000 }),
          fetchMaterialesEgreso({ estados: ["en_panol", "recibido", "parcial", "egresado"] }).catch(() => []),
          supabase.from("produccion_obras").select("codigo,estado").neq("estado", "archivada"),
        ]);
        setCatalogo(cat ?? []);
        setStockMap(stockPorMaterial(ledger ?? []));
        setObras((obrasRes?.data ?? []).map((o) => o.codigo).filter(Boolean));
      } catch (err) {
        setMsg({ ok: false, text: err.message || "No se pudo cargar el catálogo." });
      } finally {
        setCargando(false);
        foco();
      }
    })();
  }, [foco]);

  // El carrito sobrevive a que se apague la pantalla o se recargue: en el taller
  // se interrumpe todo el tiempo y perder 15 escaneos sería fatal.
  useEffect(() => {
    try {
      if (cart.length) window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
      else window.localStorage.removeItem(CART_KEY);
    } catch { /* sin storage */ }
  }, [cart]);

  const stockDe = useCallback((id) => num(stockMap.get(id)?.total), [stockMap]);

  function agregar(mat) {
    setCart((prev) => {
      const i = prev.findIndex((x) => x.id === mat.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, {
        id: mat.id,
        nombre: mat.descripcion,
        codigo: mat.codigo || "",
        unidad: mat.unidad_medida || "unidad",
        stock: stockDe(mat.id),
        qty: 1,
      }];
    });
    buzz();
    setMsg({ ok: true, text: `+ ${mat.descripcion}` });
    setBuscar("");
    setPendienteCodigo("");
    foco();
  }

  function onScan(e) {
    e.preventDefault();
    const raw = code.trim();
    if (!raw) return;
    const q = norm(raw);
    // 1) match exacto por código de barra o código interno
    const exacto = catalogo.find((m) => codigosDe(m).some((c) => norm(c) === q) || norm(m.codigo) === q);
    if (exacto) { agregar(exacto); setCode(""); if (codeRef.current) codeRef.current.value = ""; return; }
    // 2) sin dueño: ofrecemos vincularlo a un producto (así se van codificando)
    setPendienteCodigo(raw);
    setBuscar("");
    setMsg({ ok: false, text: `Código ${raw} sin producto` });
    buzz(120);
    setCode("");
    if (codeRef.current) codeRef.current.value = "";
  }

  const sugerencias = useMemo(() => {
    const t = norm(buscar);
    if (t.length < 2) return [];
    const toks = t.split(/\s+/).filter(Boolean);
    return catalogo
      .filter((m) => { const txt = norm(`${m.descripcion} ${m.codigo || ""}`); return toks.every((k) => txt.includes(k)); })
      .slice(0, 8);
  }, [buscar, catalogo]);

  async function vincularCodigo(mat) {
    const codigo = pendienteCodigo;
    try {
      if (codigo) {
        await agregarCodigoBarraMaterial(mat.id, codigo, { etiqueta: "Colector" });
        setCatalogo((prev) => prev.map((m) => (
          m.id === mat.id ? { ...m, codigos_barra: [...(m.codigos_barra || []), { codigo }] } : m
        )));
      }
      agregar(mat);
      if (codigo) setMsg({ ok: true, text: `Código ${codigo} vinculado a ${mat.descripcion}` });
    } catch (err) {
      setMsg({ ok: false, text: err.message || "No se pudo vincular el código." });
    }
  }

  const setQty = (id, v) => setCart((prev) => prev.map((x) => (x.id === id ? { ...x, qty: Math.max(1, num(v) || 1) } : x)));
  const quitar = (id) => { setCart((prev) => prev.filter((x) => x.id !== id)); foco(); };

  async function enviar() {
    if (!cart.length || enviando) return;
    setEnviando(true);
    setMsg(null);
    try {
      if (tipo === "aviso") {
        // Un aviso por producto: `compras_avisos` tiene un solo campo `material`,
        // y así compras puede resolver o descartar cada uno por separado.
        for (const it of cart) {
          await createComprasAviso({
            titulo: `Reponer: ${it.nombre}`,
            detalle: [
              `Quedan ${it.stock} en pañol. Pedir ${it.qty} ${it.unidad}.`,
              nota.trim(),
              `Avisado desde el colector por ${profile?.username || "pañol"}.`,
            ].filter(Boolean).join("\n"),
            material: it.nombre,
            destino: obra.trim() || null,
            prioridad,
            // `origen` tiene un CHECK en la base y sólo acepta los valores ya
            // usados por la app; se deja el default ('web'). La procedencia real
            // va en source_ref, que es texto libre.
            source_ref: "colector",
          });
        }
        setCart([]);
        setNota("");
        setMsg({ ok: true, text: `✓ ${cart.length} aviso${cart.length === 1 ? "" : "s"} enviado${cart.length === 1 ? "" : "s"} a compras` });
        buzz(200);
        return;
      }

      const titulo = `Pañol: ${cart.length} ítem${cart.length === 1 ? "" : "s"} para reponer`;
      const detalle = [
        nota.trim(),
        `Pedido desde el colector por ${profile?.username || "pañol"}.`,
        ...cart.map((it) => `• ${it.nombre} — pedir ${it.qty} ${it.unidad} (en pañol: ${it.stock})`),
      ].filter(Boolean).join("\n");

      const request = await createPurchaseRequest({
        form: {
          title: titulo,
          description: detalle,
          priority: prioridad,
          project_id: null,
          destino: obra.trim() || null,
          source: "panol",          // valor ya usado por la app
          source_ref: "colector",   // para distinguir los que salen del lector
        },
      });

      // Un ítem por producto, ya VINCULADO al catálogo para que compras no adivine.
      for (const it of cart) {
        await addRequestItem(request.id, {
          description: it.nombre,
          quantity: String(it.qty),
          unit: it.unidad || "unidad",
          material_id: it.id,
          notes: `Stock en pañol al pedir: ${it.stock}${obra.trim() ? ` · para ${obra.trim()}` : ""}`,
        });
      }

      setCart([]);
      setNota("");
      setMsg({ ok: true, text: `✓ Pedido enviado a compras (${cart.length} ítems)` });
      buzz(200);
    } catch (err) {
      setMsg({ ok: false, text: err.message || "No se pudo enviar el pedido." });
    } finally {
      setEnviando(false);
      foco();
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans, paddingBottom: 78 }}>
      <div style={{ padding: 11 }}>

        {/* Cabecera */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>Pedir a compras</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>Escaneá lo que se está acabando</div>
          </div>
          <div>
            <button onClick={() => nav("/scan")} style={{ background: "transparent", color: C.blue, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11, marginRight: 5 }}>Egresar</button>
            <button onClick={() => nav("/colector")} style={{ background: "transparent", color: C.dim, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11 }}>Menú</button>
          </div>
        </div>

        {msg && (
          <div style={{
            padding: "9px 11px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, marginBottom: 9,
            background: msg.ok ? "rgba(16,185,129,0.16)" : "rgba(239,68,68,0.16)",
            border: `1px solid ${msg.ok ? C.green : C.red}`, color: msg.ok ? C.green : C.red,
          }}>{msg.text}</div>
        )}

        {/* Pedido o aviso: se elige antes de escanear porque cambia a dónde cae */}
        <div style={{ display: "flex", marginBottom: 4 }}>
          {[
            ["pedido", "Pedido", "Entra al circuito de compras"],
            ["aviso", "Aviso", "Solo avisar que queda poco"],
          ].map(([k, label], i) => (
            <button key={k} type="button" onClick={() => setTipo(k)}
              style={{
                flex: 1, marginRight: i === 0 ? 6 : 0, padding: "9px 4px", borderRadius: 9,
                fontSize: 13.5, fontWeight: 900, fontFamily: C.sans,
                border: `1px solid ${tipo === k ? C.blue : C.border}`,
                background: tipo === k ? "rgba(59,130,246,0.16)" : C.panel,
                color: tipo === k ? C.blue : C.dim,
              }}>{label}</button>
          ))}
        </div>
        <p style={{ ...lbl, textTransform: "none", letterSpacing: 0, fontWeight: 600, marginBottom: 10 }}>
          {tipo === "pedido"
            ? "Un pedido con todos los ítems juntos, para que compras lo cotice."
            : "Un aviso suelto por producto. Compras lo resuelve o descarta de a uno."}
        </p>

        {/* Escaneo */}
        <form onSubmit={onScan} style={{ marginBottom: 10 }}>
          <p style={lbl}>{cargando ? "Cargando catálogo…" : "Disparó el lector o escribí el código"}</p>
          <div style={{ display: "flex" }}>
            <input
              ref={codeRef} defaultValue="" onChange={(e) => setCode(e.target.value)}
              autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              enterKeyHint="enter" placeholder="Escaneá…" disabled={cargando}
              style={{ ...field, flex: 1, fontSize: 19, marginRight: 6 }}
            />
            <button type="submit" style={{ ...qbtn, width: 62, fontSize: 15, fontWeight: 800, background: C.blue, color: "#fff", border: "none" }}>OK</button>
          </div>
        </form>

        {/* Código sin dueño: se busca el producto y se vincula en el momento */}
        {pendienteCodigo && (
          <div style={{ border: `1px solid ${C.amberB}`, background: "rgba(245,158,11,0.10)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: C.amber, marginBottom: 7 }}>
              El código <b>{pendienteCodigo}</b> no está en ningún producto. Buscalo y lo dejamos vinculado.
            </div>
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto por nombre…" style={{ ...field, marginBottom: 6 }} />
            {sugerencias.map((s) => (
              <button key={s.id} type="button" onClick={() => vincularCodigo(s)}
                style={{ display: "block", width: "100%", textAlign: "left", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", color: C.text, marginBottom: 5 }}>
                <b style={{ fontSize: 13.5 }}>{s.descripcion}</b>
                <span style={{ float: "right", color: C.dim, fontSize: 11 }}>{s.codigo || ""}</span>
              </button>
            ))}
            <button type="button" onClick={() => { setPendienteCodigo(""); setBuscar(""); foco(); }}
              style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 8, padding: "7px 12px", fontSize: 12 }}>
              Cancelar
            </button>
          </div>
        )}

        {/* Carrito */}
        <p style={lbl}>A pedir {cart.length > 0 ? `· ${cart.length}` : ""}</p>
        {cart.length === 0 ? (
          <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "18px 12px", textAlign: "center", color: C.dim, fontSize: 13, marginBottom: 10 }}>
            Escaneá los productos que haya que reponer…
          </div>
        ) : (
          <div style={{ marginBottom: 10 }}>
            {cart.map((it) => {
              const poco = it.stock <= 0;
              return (
                <div key={it.id} style={{ background: C.panel, border: `1px solid ${poco ? C.redB : C.border}`, borderRadius: 10, padding: "8px 9px", marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0, flex: 1, marginRight: 6 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.nombre}</div>
                      <div style={{ color: poco ? C.red : C.dim, fontSize: 11, marginTop: 2 }}>
                        {it.codigo ? `${it.codigo} · ` : ""}en pañol: {it.stock}{poco ? " ⚠ sin stock" : ""}
                      </div>
                    </div>
                    <button onClick={() => quitar(it.id)} style={{ background: "none", border: "none", color: C.dim, fontSize: 22, padding: "0 4px", lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", marginTop: 7 }}>
                    <button onClick={() => setQty(it.id, it.qty - 1)} style={{ ...qbtn, marginRight: 6 }}>−</button>
                    <input type="number" inputMode="numeric" value={it.qty}
                      onChange={(e) => setQty(it.id, e.target.value)}
                      style={{ ...field, textAlign: "center", fontSize: 20, fontWeight: 800, padding: "7px 4px", flex: 1, marginRight: 6 }} />
                    <button onClick={() => setQty(it.id, it.qty + 1)} style={{ ...qbtn, marginRight: 6 }}>+</button>
                    <span style={{ fontSize: 11, color: C.dim, width: 46, textAlign: "right" }}>{it.unidad}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Datos del pedido */}
        <div style={{ marginBottom: 9 }}>
          <p style={lbl}>¿Para qué obra? (opcional)</p>
          <input value={obra} onChange={(e) => setObra(e.target.value)} list="pedido-obras" placeholder="Ej: 55-1" style={field} autoComplete="off" />
          <datalist id="pedido-obras">{obras.map((o) => <option key={o} value={o} />)}</datalist>
        </div>

        <div style={{ marginBottom: 9 }}>
          <p style={lbl}>Urgencia</p>
          <div style={{ display: "flex" }}>
            {[["baja", "Baja"], ["media", "Normal"], ["alta", "Urgente"]].map(([k, label], i) => (
              <button key={k} type="button" onClick={() => setPrioridad(k)}
                style={{
                  flex: 1, marginRight: i < 2 ? 6 : 0, padding: "10px 4px", borderRadius: 9, fontSize: 13, fontWeight: 800,
                  border: `1px solid ${prioridad === k ? (k === "alta" ? C.red : C.blue) : C.border}`,
                  background: prioridad === k ? (k === "alta" ? "rgba(239,68,68,0.16)" : "rgba(59,130,246,0.16)") : C.panel,
                  color: prioridad === k ? (k === "alta" ? C.red : C.blue) : C.dim,
                }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 9 }}>
          <p style={lbl}>Nota (opcional)</p>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: para el lunes" style={field} autoComplete="off" />
        </div>
      </div>

      {/* Barra fija de confirmación */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, padding: 9,
        background: C.panelSolid, borderTop: `1px solid ${C.border}`,
      }}>
        <button onClick={enviar} disabled={!cart.length || enviando}
          style={{
            width: "100%", padding: "14px 10px", borderRadius: 11, border: "none",
            background: cart.length && !enviando ? C.green : C.panel2,
            color: cart.length && !enviando ? "#fff" : C.dim,
            fontSize: 16, fontWeight: 900, fontFamily: C.sans,
          }}>
          {enviando
            ? "Enviando…"
            : `${tipo === "aviso" ? "Avisar a compras" : "Enviar pedido"}${cart.length ? ` (${cart.length})` : ""}`}
        </button>
      </div>
    </div>
  );
}
