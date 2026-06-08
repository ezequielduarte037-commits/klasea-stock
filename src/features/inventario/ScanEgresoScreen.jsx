import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";

/**
 * ScanEgresoScreen — Egreso de madera por escáner (PDA de pañol)
 * Ruta: /scan
 *
 * Flujo: escanean el QR del material (que codifica `materiales.codigo`) → la pantalla
 * lo reconoce, eligen obra + quién retira + cantidad, y confirma un EGRESO en `movimientos`
 * (vía RPC registrar_movimiento, igual que Pañol). Obra y persona se mantienen entre
 * egresos para cargar varios ítems seguidos sin re-tipear.
 *
 * El lector físico funciona como teclado (HID): "tipea" el código + Enter en el campo
 * con foco. Por eso el input arranca y vuelve siempre enfocado.
 */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s ?? "").trim().toLowerCase();

export default function ScanEgresoScreen({ profile, signOut }) {
  const nav = useNavigate();
  const [materiales, setMateriales] = useState([]);
  const [obras, setObras] = useState([]);
  const [recientes, setRecientes] = useState([]);
  const [code, setCode] = useState("");
  const [sel, setSel] = useState(null);        // material seleccionado
  const [cantidad, setCantidad] = useState(1);
  const [obra, setObra] = useState("");
  const [retira, setRetira] = useState("");
  const [hoy, setHoy] = useState([]);          // egresos de esta sesión
  const [msg, setMsg] = useState(null);        // {ok, text}
  const [busy, setBusy] = useState(false);
  const codeRef = useRef(null);

  // ── Carga ──────────────────────────────────────────────────────────────────
  async function cargarMateriales() {
    const { data } = await supabase.from("materiales")
      .select("id,nombre,codigo,unidad_medida,stock_actual").order("nombre");
    setMateriales(data ?? []);
  }
  async function cargar() {
    const [{ data: obs }, { data: movs }] = await Promise.all([
      supabase.from("produccion_obras").select("codigo,estado").neq("estado", "archivada"),
      supabase.from("movimientos").select("usuario,created_at").not("usuario", "is", null)
        .order("created_at", { ascending: false }).limit(250),
    ]);
    const obrasOrd = [...new Set((obs ?? [])
      .filter(o => o.estado !== "terminada").map(o => o.codigo).filter(Boolean))].sort();
    setObras(obrasOrd);
    const rec = [];
    for (const m of (movs ?? [])) { const u = (m.usuario || "").trim(); if (u && !rec.includes(u)) rec.push(u); if (rec.length >= 12) break; }
    setRecientes(rec);
    await cargarMateriales();
  }
  useEffect(() => { cargar(); focusCode(); }, []);

  function focusCode() { setTimeout(() => codeRef.current?.focus(), 60); }

  // ── Buscar material por código (o por nombre como fallback) ──────────────────
  const porCodigo = useMemo(() => {
    const m = {}; materiales.forEach(x => { if (x.codigo) m[norm(x.codigo)] = x; }); return m;
  }, [materiales]);

  function resolver(raw) {
    const q = norm(raw);
    if (!q) return null;
    if (porCodigo[q]) return porCodigo[q];
    // fallback: por nombre exacto o que contenga
    const exact = materiales.find(x => norm(x.nombre) === q);
    if (exact) return exact;
    const hits = materiales.filter(x => norm(x.nombre).includes(q));
    return hits.length === 1 ? hits[0] : null;
  }

  function onScan(e) {
    e?.preventDefault?.();
    const m = resolver(code);
    if (!m) { setMsg({ ok: false, text: `No encontré "${code.trim()}". Probá de nuevo o buscá por nombre.` }); return; }
    setSel(m); setCantidad(1); setCode(""); setMsg(null);
  }

  // sugerencias de nombre cuando escriben (no escanean)
  const sugerencias = useMemo(() => {
    const q = norm(code);
    if (q.length < 2 || porCodigo[q]) return [];
    return materiales.filter(x => norm(x.nombre).includes(q) || norm(x.codigo).includes(q)).slice(0, 6);
  }, [code, materiales, porCodigo]);

  // ── Confirmar egreso ─────────────────────────────────────────────────────────
  async function confirmar() {
    if (!sel || busy) return;
    const qty = Math.abs(num(cantidad));
    if (qty <= 0) { setMsg({ ok: false, text: "Cantidad inválida." }); return; }
    if (!obra.trim()) { setMsg({ ok: false, text: "Indicá para qué obra." }); return; }
    setBusy(true); setMsg(null);
    try {
      const args = {
        p_material_id: sel.id, p_delta: -qty, p_obra: obra.trim(),
        p_usuario: retira.trim() || null, p_entregado_por: profile?.username || null,
        p_proveedor: null, p_recibe: null, p_obs: null,
      };
      const rpc = await supabase.rpc("registrar_movimiento", args);
      if (rpc.error) {
        // fallback: actualizar stock + insertar movimiento
        const nuevo = num(sel.stock_actual) - qty;
        await supabase.from("materiales").update({ stock_actual: nuevo }).eq("id", sel.id);
        const ins = await supabase.from("movimientos").insert({
          material_id: sel.id, delta: -qty, obra: obra.trim(),
          usuario: retira.trim() || null, entregado_por: profile?.username || null,
        });
        if (ins.error) throw ins.error;
      }
      setHoy(prev => [{ id: Date.now(), nombre: sel.nombre, qty, unidad: sel.unidad_medida, obra: obra.trim(), retira: retira.trim(), hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) }, ...prev]);
      setMsg({ ok: true, text: `−${qty} ${sel.nombre} → ${obra.trim()}` });
      setSel(null); setCode("");
      cargarMateriales();   // refresca stock
      focusCode();
    } catch (err) {
      setMsg({ ok: false, text: "Error al registrar: " + (err?.message || err) });
    } finally { setBusy(false); }
  }

  function cancelarItem() { setSel(null); setCode(""); setMsg(null); focusCode(); }

  // ── Estilos ──────────────────────────────────────────────────────────────────
  const wrap = { position: "fixed", inset: 0, background: C.bg, color: C.text,
    fontFamily: "'Outfit', system-ui, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" };
  const field = { width: "100%", boxSizing: "border-box", background: C.panel, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 16px", fontSize: 20, outline: "none" };
  const bigBtn = (bg, fg = "#fff") => ({ width: "100%", padding: "18px", borderRadius: 14, border: "none",
    background: bg, color: fg, fontSize: 19, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3 });
  const lbl = { fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.dim, fontWeight: 700, marginBottom: 6 };

  return (
    <div style={wrap}>
      {/* Topbar */}
      <div style={{ flexShrink: 0, height: 52, background: C.panelSolid, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.5 }}>Egreso · Pañol</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.dim }}>{profile?.username}</span>
          <button onClick={() => nav("/")} style={{ background: "transparent", color: C.dim, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>Inicio</button>
        </div>
      </div>

      {/* Cuerpo scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Banner de resultado */}
        {msg && (
          <div style={{ padding: "12px 14px", borderRadius: 12, fontSize: 15, fontWeight: 600,
            background: msg.ok ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
            border: `1px solid ${msg.ok ? C.green : C.red}`, color: msg.ok ? C.green : C.red }}>
            {msg.ok ? "✓ " : "⚠ "}{msg.text}
          </div>
        )}

        {!sel ? (
          /* ── PASO 1: escanear / buscar ── */
          <form onSubmit={onScan}>
            <div style={lbl}>Escaneá el código del material</div>
            <input
              ref={codeRef} value={code} onChange={e => setCode(e.target.value)}
              placeholder="Apuntá y dispará el lector…  (o escribí)"
              inputMode="text" autoComplete="off" autoCapitalize="off" spellCheck={false}
              style={{ ...field, fontSize: 22 }}
            />
            {/* sugerencias por nombre */}
            {sugerencias.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {sugerencias.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => { setSel(s); setCantidad(1); setCode(""); setMsg(null); }}
                    style={{ textAlign: "left", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", color: C.text, cursor: "pointer" }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{s.nombre}</span>
                    <span style={{ float: "right", color: C.dim, fontSize: 13 }}>{s.codigo} · stock {num(s.stock_actual)}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <button type="submit" style={bigBtn(C.blue)}>Buscar</button>
            </div>
          </form>
        ) : (
          /* ── PASO 2: material seleccionado → obra / persona / cantidad ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{sel.nombre}</div>
              <div style={{ marginTop: 4, color: C.dim, fontSize: 14 }}>
                {sel.codigo ? `${sel.codigo} · ` : ""}Stock actual: <b style={{ color: num(sel.stock_actual) > 0 ? C.green : C.red }}>{num(sel.stock_actual)}</b> {sel.unidad_medida || ""}
              </div>
            </div>

            {/* Cantidad */}
            <div>
              <div style={lbl}>Cantidad</div>
              <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                <button onClick={() => setCantidad(c => Math.max(1, num(c) - 1))} style={{ ...bigBtn(C.panel, C.text), width: 64, fontSize: 28, border: `1px solid ${C.border}` }}>−</button>
                <input type="number" inputMode="numeric" value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  style={{ ...field, textAlign: "center", fontSize: 30, fontWeight: 800, flex: 1 }} />
                <button onClick={() => setCantidad(c => num(c) + 1)} style={{ ...bigBtn(C.panel, C.text), width: 64, fontSize: 28, border: `1px solid ${C.border}` }}>+</button>
              </div>
            </div>

            {/* Obra */}
            <div>
              <div style={lbl}>¿Para qué obra?</div>
              <input value={obra} onChange={e => setObra(e.target.value)} list="scan-obras"
                placeholder="Ej: 55-1" style={field} autoComplete="off" />
              <datalist id="scan-obras">{obras.map(o => <option key={o} value={o} />)}</datalist>
            </div>

            {/* Retira */}
            <div>
              <div style={lbl}>¿Quién retira?</div>
              <input value={retira} onChange={e => setRetira(e.target.value)} list="scan-personas"
                placeholder="Nombre de quien lleva el material" style={field} autoComplete="off" />
              <datalist id="scan-personas">{recientes.map(r => <option key={r} value={r} />)}</datalist>
              {recientes.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {recientes.slice(0, 6).map(r => (
                    <button key={r} type="button" onClick={() => setRetira(r)}
                      style={{ background: retira === r ? C.blue : C.panel, color: retira === r ? "#fff" : C.dim,
                        border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>{r}</button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={cancelarItem} style={{ ...bigBtn(C.panel, C.dim), flex: "0 0 34%", border: `1px solid ${C.border}` }}>Cancelar</button>
              <button onClick={confirmar} disabled={busy} style={{ ...bigBtn(C.green), flex: 1, opacity: busy ? 0.6 : 1 }}>
                {busy ? "Registrando…" : "Confirmar egreso"}
              </button>
            </div>
          </div>
        )}

        {/* Egresos de esta sesión */}
        {hoy.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ ...lbl, marginBottom: 8 }}>Egresos de esta sesión · {hoy.length}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {hoy.map(h => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.nombre}</div>
                    <div style={{ color: C.dim, fontSize: 12 }}>{h.obra}{h.retira ? ` · ${h.retira}` : ""} · {h.hora}</div>
                  </div>
                  <div style={{ color: C.red, fontWeight: 800, fontSize: 16, marginLeft: 10 }}>−{h.qty}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
