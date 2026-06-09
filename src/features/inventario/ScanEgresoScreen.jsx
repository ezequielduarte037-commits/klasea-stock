import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";

/**
 * ScanEgresoScreen — Egreso de madera por escáner (PDA de pañol). Ruta: /scan
 *
 * Diseñado EXCLUSIVAMENTE para el colector (pantalla chica, Chrome viejo ~73):
 *   - Sin `inset` (no soportado < Chrome 87): se usan top/left/right/bottom.
 *   - Layout compacto, scroll propio confiable, barra de confirmar fija abajo.
 *   - Carrito multi-ítem: escanean varios productos, ponen obra/persona UNA vez,
 *     y "Confirmar" egresa todo junto (un movimiento por ítem, misma obra/persona).
 *   - El lector físico (HID) tipea el código + Enter en el campo enfocado.
 */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s ?? "").trim().toLowerCase();

export default function ScanEgresoScreen({ profile }) {
  const nav = useNavigate();
  const [materiales, setMateriales] = useState([]);
  const [obras, setObras] = useState([]);
  const [recientes, setRecientes] = useState([]);
  const [code, setCode] = useState("");
  const [cart, setCart] = useState([]);     // [{id, nombre, codigo, unidad, stock, qty}]
  const [obra, setObra] = useState("");
  const [retira, setRetira] = useState("");
  const [msg, setMsg] = useState(null);     // {ok, text}
  const [busy, setBusy] = useState(false);
  const [hechos, setHechos] = useState(0);  // egresos confirmados en la sesión
  const codeRef = useRef(null);

  async function cargarMateriales() {
    const { data } = await supabase.from("materiales")
      .select("id,nombre,codigo,unidad_medida,stock_actual").order("nombre");
    setMateriales(data ?? []);
    return data ?? [];
  }
  async function cargar() {
    const [{ data: obs }, { data: movs }] = await Promise.all([
      supabase.from("produccion_obras").select("codigo,estado").neq("estado", "archivada"),
      supabase.from("movimientos").select("usuario,created_at").not("usuario", "is", null)
        .order("created_at", { ascending: false }).limit(250),
    ]);
    setObras([...new Set((obs ?? []).filter(o => o.estado !== "terminada").map(o => o.codigo).filter(Boolean))].sort());
    const rec = [];
    for (const m of (movs ?? [])) { const u = (m.usuario || "").trim(); if (u && !rec.includes(u)) rec.push(u); if (rec.length >= 10) break; }
    setRecientes(rec);
    await cargarMateriales();
  }
  useEffect(() => { cargar(); focusCode(); }, []);
  function focusCode() { setTimeout(() => codeRef.current?.focus(), 50); }

  const porCodigo = useMemo(() => {
    const m = {}; materiales.forEach(x => { if (x.codigo) m[norm(x.codigo)] = x; }); return m;
  }, [materiales]);

  function resolver(raw) {
    const q = norm(raw); if (!q) return null;
    if (porCodigo[q]) return porCodigo[q];
    const exact = materiales.find(x => norm(x.nombre) === q);
    if (exact) return exact;
    const hits = materiales.filter(x => norm(x.nombre).includes(q));
    return hits.length === 1 ? hits[0] : null;
  }

  function addMaterial(m) {
    setCart(prev => {
      const i = prev.findIndex(x => x.id === m.id);
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], qty: c[i].qty + 1 }; return c; }
      return [...prev, { id: m.id, nombre: m.nombre, codigo: m.codigo, unidad: m.unidad_medida, stock: num(m.stock_actual), qty: 1 }];
    });
    setMsg({ ok: true, text: `+ ${m.nombre}` });
    setCode(""); if (codeRef.current) codeRef.current.value = ""; focusCode();
  }

  function onScan(e) {
    e?.preventDefault?.();
    // Leemos del DOM (no del estado): el lector tipea muy rápido y el estado
    // controlado pierde caracteres → por eso llegaba vacío ("No encontré '').
    const raw = (codeRef.current?.value ?? code ?? "").trim();
    if (!raw) { focusCode(); return; }   // Enter vacío del lector → ignorar
    const m = resolver(raw);
    if (!m) { setMsg({ ok: false, text: `No encontré "${raw}"` }); setCode(""); if (codeRef.current) codeRef.current.value = ""; focusCode(); return; }
    addMaterial(m);
  }

  function setQty(id, q) { setCart(prev => prev.map(x => x.id === id ? { ...x, qty: Math.max(1, q) } : x)); }
  function quitar(id) { setCart(prev => prev.filter(x => x.id !== id)); }

  const sugerencias = useMemo(() => {
    const q = norm(code);
    if (q.length < 2 || porCodigo[q]) return [];
    return materiales.filter(x => norm(x.nombre).includes(q) || norm(x.codigo).includes(q)).slice(0, 5);
  }, [code, materiales, porCodigo]);

  const totalItems = cart.reduce((a, x) => a + x.qty, 0);

  async function confirmar() {
    if (busy || cart.length === 0) return;
    if (!obra.trim()) { setMsg({ ok: false, text: "Indicá para qué obra." }); return; }
    setBusy(true); setMsg(null);
    let okN = 0;
    try {
      for (const it of cart) {
        const qty = Math.abs(num(it.qty)); if (qty <= 0) continue;
        const args = { p_material_id: it.id, p_delta: -qty, p_obra: obra.trim(),
          p_usuario: retira.trim() || null, p_entregado_por: profile?.username || null,
          p_proveedor: null, p_recibe: null, p_obs: null };
        const rpc = await supabase.rpc("registrar_movimiento", args);
        if (rpc.error) {
          const nuevo = num(it.stock) - qty;
          await supabase.from("materiales").update({ stock_actual: nuevo }).eq("id", it.id);
          const ins = await supabase.from("movimientos").insert({
            material_id: it.id, delta: -qty, obra: obra.trim(),
            usuario: retira.trim() || null, entregado_por: profile?.username || null });
          if (ins.error) throw ins.error;
        }
        okN++;
      }
      setHechos(h => h + okN);
      setMsg({ ok: true, text: `✓ Egresados ${okN} ítem${okN !== 1 ? "s" : ""} → ${obra.trim()}` });
      setCart([]); setCode("");
      cargarMateriales();
      focusCode();
    } catch (err) {
      setMsg({ ok: false, text: "Error: " + (err?.message || err) + ` (ok: ${okN}/${cart.length})` });
    } finally { setBusy(false); }
  }

  // ── Estilos compactos para el colector ───────────────────────────────────────
  const scroll = { position: "fixed", top: 0, left: 0, right: 0, bottom: 60, overflowY: "auto",
    WebkitOverflowScrolling: "touch", background: C.bg, color: C.text,
    fontFamily: "'Outfit', system-ui, sans-serif", padding: 10 };
  const field = { width: "100%", boxSizing: "border-box", background: C.panel, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 12px", fontSize: 16, outline: "none" };
  const lbl = { fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: C.dim, fontWeight: 700, margin: "0 0 4px" };
  const qbtn = { width: 44, minWidth: 44, height: 40, border: `1px solid ${C.border}`, background: C.panel,
    color: C.text, borderRadius: 8, fontSize: 22, fontWeight: 800, cursor: "pointer", lineHeight: 1 };

  return (
    <>
      <div style={scroll}>
        {/* Header compacto */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
            <b style={{ fontSize: 14 }}>Egreso · Pañol</b>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hechos > 0 && <span style={{ fontSize: 11, color: C.green }}>{hechos} listos</span>}
            <button onClick={() => nav("/panol")} style={{ background: "transparent", color: C.dim, border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 9px", fontSize: 11 }}>Menú</button>
          </div>
        </div>

        {/* Banner */}
        {msg && (
          <div style={{ padding: "8px 11px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, marginBottom: 8,
            background: msg.ok ? "rgba(16,185,129,0.16)" : "rgba(239,68,68,0.16)",
            border: `1px solid ${msg.ok ? C.green : C.red}`, color: msg.ok ? C.green : C.red }}>{msg.text}</div>
        )}

        {/* Escaneo */}
        <form onSubmit={onScan} style={{ marginBottom: 10 }}>
          <p style={lbl}>Escaneá el material (o escribí el código y OK)</p>
          <div style={{ display: "flex", gap: 6 }}>
            <input ref={codeRef} defaultValue="" onChange={e => setCode(e.target.value)}
              autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="enter"
              placeholder="Dispará el lector…" style={{ ...field, flex: 1, fontSize: 18 }} />
            <button type="submit" style={{ ...qbtn, width: 64, fontSize: 14, fontWeight: 700, background: C.blue, color: "#fff", border: "none" }}>OK</button>
          </div>
          {sugerencias.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {sugerencias.map(s => (
                <button key={s.id} type="button" onClick={() => addMaterial(s)}
                  style={{ textAlign: "left", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.text }}>
                  <b style={{ fontSize: 14 }}>{s.nombre}</b>
                  <span style={{ float: "right", color: C.dim, fontSize: 11 }}>{s.codigo} · {num(s.stock_actual)}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Carrito */}
        <p style={lbl}>Ítems a egresar {cart.length > 0 ? `· ${cart.length}` : ""}</p>
        {cart.length === 0 ? (
          <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "16px 12px", textAlign: "center", color: C.dim, fontSize: 13, marginBottom: 10 }}>
            Escaneá uno o varios materiales…
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {cart.map(it => (
              <div key={it.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 9px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.nombre}</div>
                    <div style={{ color: it.qty > it.stock ? C.amber : C.dim, fontSize: 11 }}>
                      {it.codigo ? it.codigo + " · " : ""}stock {it.stock}{it.qty > it.stock ? " ⚠ supera stock" : ""}
                    </div>
                  </div>
                  <button onClick={() => quitar(it.id)} style={{ background: "none", border: "none", color: C.dim, fontSize: 20, padding: "0 4px", lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                  <button onClick={() => setQty(it.id, it.qty - 1)} style={qbtn}>−</button>
                  <input type="number" inputMode="numeric" value={it.qty}
                    onChange={e => setQty(it.id, num(e.target.value))}
                    style={{ ...field, textAlign: "center", fontSize: 20, fontWeight: 800, padding: "7px 4px", flex: 1 }} />
                  <button onClick={() => setQty(it.id, it.qty + 1)} style={qbtn}>+</button>
                  <span style={{ fontSize: 11, color: C.dim, width: 44, textAlign: "right" }}>{it.unidad || ""}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Obra + Persona (compartidos) */}
        <div style={{ marginBottom: 9 }}>
          <p style={lbl}>¿Para qué obra?</p>
          <input value={obra} onChange={e => setObra(e.target.value)} list="scan-obras" placeholder="Ej: 55-1" style={field} autoComplete="off" />
          <datalist id="scan-obras">{obras.map(o => <option key={o} value={o} />)}</datalist>
        </div>
        <div style={{ marginBottom: 6 }}>
          <p style={lbl}>¿Quién retira?</p>
          <input value={retira} onChange={e => setRetira(e.target.value)} list="scan-personas" placeholder="Nombre" style={field} autoComplete="off" />
          <datalist id="scan-personas">{recientes.map(r => <option key={r} value={r} />)}</datalist>
          {recientes.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
              {recientes.slice(0, 6).map(r => (
                <button key={r} type="button" onClick={() => setRetira(r)}
                  style={{ background: retira === r ? C.blue : C.panel, color: retira === r ? "#fff" : C.dim,
                    border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 10px", fontSize: 12 }}>{r}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Barra fija de confirmar (siempre visible, sin depender del scroll) */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: 60, padding: 8,
        background: C.panelSolid, borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
        {cart.length > 0 && (
          <button onClick={() => setCart([])} style={{ width: 90, borderRadius: 12, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, fontSize: 13, fontWeight: 700 }}>Vaciar</button>
        )}
        <button onClick={confirmar} disabled={busy || cart.length === 0}
          style={{ flex: 1, borderRadius: 12, border: "none", fontSize: 17, fontWeight: 800, color: "#fff",
            background: cart.length === 0 ? "#3a3a3f" : C.green, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Registrando…" : cart.length === 0 ? "Escaneá para empezar" : `Confirmar egreso · ${totalItems}`}
        </button>
      </div>
    </>
  );
}
