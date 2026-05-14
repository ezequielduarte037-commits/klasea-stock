/**
 * EncargadosTab.jsx
 *
 * Tab "Encargados" para ObrasLaminacionScreen.
 * Replica la hoja "Encargados y a encargar" del excel.
 * Muestra todas las obras con:
 *   - Estado visual ⚠️ / ⏳ / ✅
 *   - Fecha pedido de material
 *   - Fecha desmolde estimada / real
 *   - Ubicación (En Chubut / En Pierri / etc.)
 *
 * CÓMO USARLO en ObrasLaminacionScreen.jsx:
 *   1. Importar: import EncargadosTab from "@/features/inventario/EncargadosTab";
 *   2. Agregar un tab "Encargados" a los tabs existentes:
 *      const TABS_OBRAS = ["Obras", "Encargados"];  // (o como estén nombrados)
 *   3. Renderizar condicionalmente:
 *      {tabActual === "Encargados" && <EncargadosTab />}
 *
 * COLUMNAS DE SUPABASE necesarias (ejecutar una sola vez):
 *   ALTER TABLE laminacion_obras ADD COLUMN IF NOT EXISTS fecha_pedido_material date;
 *   ALTER TABLE laminacion_obras ADD COLUMN IF NOT EXISTS fecha_desmolde_estimada date;
 *   ALTER TABLE laminacion_obras ADD COLUMN IF NOT EXISTS fecha_desmolde_real date;
 *   ALTER TABLE laminacion_obras ADD COLUMN IF NOT EXISTS materiales_pedidos boolean DEFAULT false;
 *   ALTER TABLE laminacion_obras ADD COLUMN IF NOT EXISTS ubicacion text;
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmtDate(d) {
  if (!d) return null;
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T00:00:00") : new Date(d);
  return dt.toLocaleDateString("es-AR");
}

const C = {
  bg:    "#0f0f12",
  card:  "rgba(255,255,255,0.03)",
  b0:    "rgba(255,255,255,0.08)",
  t0:    "#f4f4f5",
  t1:    "#a1a1aa",
  t2:    "#52525b",
  red:   "#ff453a",
  amber: "#ffbe35",
  green: "#30d158",
  blue:  "#3b82f6",
  mono:  "'JetBrains Mono', monospace",
  sans:  "'Outfit', system-ui",
};

// Determina el estado visual de una obra basado en sus campos
function getEstadoVisual(obra) {
  if (obra.estado === "terminada") return "terminada";
  if (obra.estado === "pausada") return "pausada";
  // Activa: ¿tiene materiales comprados?
  if (obra.materiales_pedidos) return "en_proceso"; // ⏳
  return "sin_material"; // ⚠️
}

const ESTADO_META = {
  sin_material: { emoji: "⚠️", label: "Sin material", color: "#ffbe35" },
  en_proceso:   { emoji: "⏳", label: "En proceso",   color: "#3b82f6" },
  terminada:    { emoji: "✅", label: "Terminada",     color: "#30d158" },
  pausada:      { emoji: "⏸️", label: "Pausada",       color: "#71717a" },
};

const INP = {
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${C.b0}`,
  color: C.t0,
  padding: "6px 9px",
  borderRadius: 7,
  fontSize: 12,
  fontFamily: C.sans,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const UBICACIONES = ["", "En Chubut", "En Pierri", "En Buenos Aires", "En tránsito", "Otro"];

// ── Fila editable de obra ───────────────────────────────────────
function FilaObra({ obra, onSave }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    fecha_pedido_material:   obra.fecha_pedido_material   ?? "",
    fecha_desmolde_estimada: obra.fecha_desmolde_estimada ?? "",
    fecha_desmolde_real:     obra.fecha_desmolde_real     ?? "",
    materiales_pedidos:      obra.materiales_pedidos      ?? false,
    ubicacion:               obra.ubicacion               ?? "",
  });
  const [saving, setSaving] = useState(false);

  const estadoV = getEstadoVisual({ ...obra, materiales_pedidos: form.materiales_pedidos });
  const meta = ESTADO_META[estadoV];

  async function guardar() {
    setSaving(true);
    const upd = {
      fecha_pedido_material:   form.fecha_pedido_material   || null,
      fecha_desmolde_estimada: form.fecha_desmolde_estimada || null,
      fecha_desmolde_real:     form.fecha_desmolde_real     || null,
      materiales_pedidos:      form.materiales_pedidos,
      ubicacion:               form.ubicacion               || null,
    };
    await onSave(obra.id, upd);
    setSaving(false);
    setEditing(false);
  }

  const TD = { padding: "10px 12px", borderBottom: `1px solid rgba(255,255,255,0.035)`, verticalAlign: "middle", fontSize: 12, fontFamily: C.sans };

  return (
    <>
      <tr style={{ transition: "background .15s" }}>
        {/* Nombre obra */}
        <td style={{ ...TD, fontWeight: 700, color: C.t0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>{meta.emoji}</span>
            <div>
              <div>{obra.nombre}</div>
              {obra.descripcion && <div style={{ fontSize: 10, color: C.t2, marginTop: 1 }}>{obra.descripcion}</div>}
            </div>
          </div>
        </td>

        {/* Estado visual */}
        <td style={TD}>
          <span style={{
            display: "inline-block", padding: "3px 9px", borderRadius: 5,
            fontSize: 10, fontWeight: 700,
            background: meta.color + "22", color: meta.color,
            border: `1px solid ${meta.color}44`,
            fontFamily: C.sans,
          }}>
            {meta.label}
          </span>
        </td>

        {/* Materiales pedidos toggle */}
        <td style={{ ...TD, textAlign: "center" }}>
          {editing ? (
            <label style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <input
                type="checkbox"
                checked={form.materiales_pedidos}
                onChange={e => setForm(f => ({ ...f, materiales_pedidos: e.target.checked }))}
                style={{ accentColor: C.blue, width: 15, height: 15 }}
              />
              <span style={{ fontSize: 11, color: C.t1 }}>{form.materiales_pedidos ? "Sí" : "No"}</span>
            </label>
          ) : (
            <span style={{ fontSize: 14 }}>{obra.materiales_pedidos ? "✅" : "⚠️"}</span>
          )}
        </td>

        {/* Fecha pedido material */}
        <td style={TD}>
          {editing ? (
            <input type="date" style={INP}
              value={form.fecha_pedido_material}
              onChange={e => setForm(f => ({ ...f, fecha_pedido_material: e.target.value }))}
            />
          ) : (
            <span style={{ color: obra.fecha_pedido_material ? C.t0 : C.t2, fontFamily: C.mono, fontSize: 12 }}>
              {fmtDate(obra.fecha_pedido_material) ?? "—"}
            </span>
          )}
        </td>

        {/* Fecha desmolde estimada */}
        <td style={TD}>
          {editing ? (
            <input type="date" style={INP}
              value={form.fecha_desmolde_estimada}
              onChange={e => setForm(f => ({ ...f, fecha_desmolde_estimada: e.target.value }))}
            />
          ) : (
            <span style={{ color: obra.fecha_desmolde_estimada ? C.t0 : C.t2, fontFamily: C.mono, fontSize: 12 }}>
              {fmtDate(obra.fecha_desmolde_estimada) ?? "—"}
            </span>
          )}
        </td>

        {/* Fecha desmolde real */}
        <td style={TD}>
          {editing ? (
            <input type="date" style={INP}
              value={form.fecha_desmolde_real}
              onChange={e => setForm(f => ({ ...f, fecha_desmolde_real: e.target.value }))}
            />
          ) : (
            <span style={{ color: obra.fecha_desmolde_real ? C.green : C.t2, fontFamily: C.mono, fontSize: 12 }}>
              {fmtDate(obra.fecha_desmolde_real) ?? "—"}
            </span>
          )}
        </td>

        {/* Ubicación */}
        <td style={TD}>
          {editing ? (
            <select style={{ ...INP, cursor: "pointer" }}
              value={form.ubicacion}
              onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))}
            >
              {UBICACIONES.map(u => <option key={u} value={u}>{u || "— Sin asignar —"}</option>)}
            </select>
          ) : (
            <span style={{ color: obra.ubicacion ? C.t1 : C.t2, fontSize: 12 }}>
              {obra.ubicacion || "—"}
            </span>
          )}
        </td>

        {/* Acciones */}
        <td style={{ ...TD, textAlign: "right" }}>
          {editing ? (
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button
                onClick={guardar}
                disabled={saving}
                style={{
                  border: `1px solid ${C.green}44`, background: `${C.green}18`, color: C.green,
                  padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans,
                }}
              >
                {saving ? "…" : "Guardar"}
              </button>
              <button
                onClick={() => { setEditing(false); setForm({ fecha_pedido_material: obra.fecha_pedido_material ?? "", fecha_desmolde_estimada: obra.fecha_desmolde_estimada ?? "", fecha_desmolde_real: obra.fecha_desmolde_real ?? "", materiales_pedidos: obra.materiales_pedidos ?? false, ubicacion: obra.ubicacion ?? "" }); }}
                style={{
                  border: `1px solid ${C.b0}`, background: "transparent", color: C.t2,
                  padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.sans,
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              style={{
                border: `1px solid ${C.b0}`, background: "transparent", color: C.t1,
                padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.sans,
              }}
            >
              Editar
            </button>
          )}
        </td>
      </tr>
    </>
  );
}

// ── Componente principal ────────────────────────────────────────
export default function EncargadosTab() {
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("activa"); // activa | terminada | todos
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  async function cargar() {
    setLoading(true);
    const { data } = await supabase
      .from("laminacion_obras")
      .select("*")
      .order("fecha_inicio", { ascending: false });
    setObras(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("enc-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obras" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function handleSave(obraId, upd) {
    const { error } = await supabase.from("laminacion_obras").update(upd).eq("id", obraId);
    if (error) {
      setMsg("❌ Error: " + error.message);
    } else {
      setMsg("✅ Guardado");
      setTimeout(() => setMsg(""), 2000);
      cargar();
    }
  }

  const obrasFiltradas = useMemo(() => {
    let rows = obras;
    if (filtroEstado !== "todos") rows = rows.filter(o => o.estado === filtroEstado);
    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      rows = rows.filter(o => o.nombre.toLowerCase().includes(qq) || (o.descripcion ?? "").toLowerCase().includes(qq) || (o.ubicacion ?? "").toLowerCase().includes(qq));
    }
    return rows;
  }, [obras, filtroEstado, q]);

  // Estadísticas rápidas
  const stats = useMemo(() => {
    const activas = obras.filter(o => o.estado === "activa");
    return {
      sinMaterial: activas.filter(o => !o.materiales_pedidos).length,
      enProceso:   activas.filter(o => o.materiales_pedidos).length,
      terminadas:  obras.filter(o => o.estado === "terminada").length,
    };
  }, [obras]);

  const TH = { textAlign: "left", fontSize: 9, color: C.t2, padding: "10px 12px", textTransform: "uppercase", letterSpacing: 2, fontFamily: C.sans, borderBottom: `1px solid ${C.b0}` };

  return (
    <div style={{ fontFamily: C.sans }}>
      {/* KPIs rápidos */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { label: "Sin material comprado", n: stats.sinMaterial, color: C.amber, emoji: "⚠️" },
          { label: "En proceso",            n: stats.enProceso,   color: C.blue,  emoji: "⏳" },
          { label: "Terminadas",            n: stats.terminadas,  color: C.green, emoji: "✅" },
        ].map(({ label, n, color, emoji }) => (
          <div key={label} style={{
            flex: 1, minWidth: 140,
            border: `1px solid ${color}33`,
            borderLeft: `3px solid ${color}`,
            borderRadius: 10, padding: "12px 16px",
            background: `${color}0a`,
          }}>
            <div style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{emoji} {label}</div>
            <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color }}>{n}</div>
          </div>
        ))}
      </div>

      {/* Mensaje flash */}
      {msg && (
        <div style={{
          border: `1px solid ${msg.startsWith("✅") ? C.green : C.red}44`,
          background: `${msg.startsWith("✅") ? C.green : C.red}11`,
          color: msg.startsWith("✅") ? C.green : C.red,
          borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12,
        }}>
          {msg}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          style={{ ...INP, width: 200 }}
          placeholder="Buscar obra…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        {["activa", "terminada", "todos"].map(v => (
          <button key={v}
            onClick={() => setFiltroEstado(v)}
            style={{
              border: filtroEstado === v ? `1px solid rgba(255,255,255,0.18)` : `1px solid ${C.b0}`,
              background: filtroEstado === v ? "rgba(255,255,255,0.1)" : "transparent",
              color: filtroEstado === v ? C.t0 : C.t2,
              padding: "6px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: filtroEstado === v ? 600 : 400,
              fontFamily: C.sans,
            }}>
            {v === "activa" ? "🔵 Activas" : v === "terminada" ? "✅ Terminadas" : "Todas"}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ padding: 24, color: C.t2, fontSize: 12 }}>Cargando…</div>
      ) : (
        <div style={{
          border: `1px solid ${C.b0}`,
          borderRadius: 12,
          background: C.card,
          overflow: "auto",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                <th style={TH}>Obra</th>
                <th style={TH}>Estado</th>
                <th style={{ ...TH, textAlign: "center" }}>Mat. pedidos</th>
                <th style={TH}>Pedido material</th>
                <th style={TH}>Desmolde est.</th>
                <th style={TH}>Desmolde real</th>
                <th style={TH}>Ubicación</th>
                <th style={{ ...TH, textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {obrasFiltradas.map(obra => (
                <FilaObra key={obra.id} obra={obra} onSave={handleSave} />
              ))}
              {!obrasFiltradas.length && (
                <tr>
                  <td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", color: C.t2, fontSize: 12 }}>
                    Sin obras con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Leyenda */}
      <div style={{ marginTop: 14, padding: "10px 14px", border: `1px solid ${C.b0}`, borderRadius: 8, background: "rgba(255,255,255,0.015)" }}>
        <div style={{ fontSize: 11, color: C.t2, marginBottom: 6 }}>Leyenda de estados:</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {Object.entries(ESTADO_META).map(([k, v]) => (
            <span key={k} style={{ fontSize: 11, color: v.color }}>
              {v.emoji} <span style={{ color: C.t2 }}>{v.label}</span>
            </span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: C.t2, marginTop: 8 }}>
          💡 <strong style={{ color: C.t1 }}>⚠️ Sin material</strong> = obra activa pero los materiales aún no fueron pedidos (aparecerá en "Compras Sugeridas"). 
          Marcá "Mat. pedidos" cuando hagas el pedido para cambiar a ⏳.
        </div>
      </div>
    </div>
  );
}
