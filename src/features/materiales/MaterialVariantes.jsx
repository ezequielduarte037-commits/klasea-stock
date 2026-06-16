// UI de multi-área + variantes (configurador) para el módulo de materiales.
// Todo degrada elegante si las tablas nuevas (panol_material_categorias,
// panol_opciones, panol_opcion_valores, panol_material_condicion) aún no existen.
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { C } from "@/theme";
import { BTN, BTN_PRIMARY, INP, LBL } from "@/features/rrhh/ui";
import { borrarOpcion, borrarValor, crearOpcion, crearValor, setMaterialAreas, setMaterialCondicion } from "./materialesConfig";

const chipStyle = (on, locked) => ({
  fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: locked ? "default" : "pointer",
  fontFamily: C.sans, transition: "all .12s",
  background: on ? "rgba(59,130,246,0.14)" : C.s0,
  border: `1px solid ${on ? "rgba(59,130,246,0.4)" : C.b0}`,
  color: on ? "#60a5fa" : C.t2,
});

const hint = { fontSize: 11, color: C.amber, marginTop: 5 };

// ── Áreas extra de un material (además de la principal) ─────────────────────
export function AreasEditor({ material, categorias }) {
  const primaryId = material.categoria_id;
  const [extra, setExtra] = useState(() => new Set((material.areas ?? []).filter((id) => id && id !== primaryId)));
  const [err, setErr] = useState(false);

  async function toggle(catId) {
    if (catId === primaryId) return;
    const next = new Set(extra);
    next.has(catId) ? next.delete(catId) : next.add(catId);
    setExtra(next);
    setErr(false);
    try { await setMaterialAreas(material.id, [...next]); }
    catch { setErr(true); }
  }

  return (
    <div>
      <label style={LBL}>Áreas (un mismo ítem puede ir en varias)</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {categorias.map((c) => {
          const isPrimary = c.id === primaryId;
          const on = isPrimary || extra.has(c.id);
          return (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} disabled={isPrimary} style={chipStyle(on, isPrimary)}>
              {c.nombre}{isPrimary ? " ★" : ""}
            </button>
          );
        })}
      </div>
      {err && <div style={hint}>No se pudo guardar el área — falta correr el SQL de variantes.</div>}
    </div>
  );
}

// ── Condición de un material (a qué configuración aplica) ────────────────────
export function CondicionSelect({ material, opciones }) {
  const [val, setVal] = useState(material.condicion_valor_id ?? "");
  const [err, setErr] = useState(false);

  async function change(v) {
    setVal(v);
    setErr(false);
    try { await setMaterialCondicion(material.id, v || null); }
    catch { setErr(true); }
  }

  return (
    <div>
      <label style={LBL}>Aplica a (variante del barco)</label>
      <select value={val} onChange={(e) => change(e.target.value)} style={{ ...INP, width: "100%" }}>
        <option value="">Siempre (base)</option>
        {opciones.map((o) => (
          <optgroup key={o.id} label={o.nombre}>
            {o.valores.map((v) => <option key={v.id} value={v.id}>{o.nombre}: {v.valor}</option>)}
          </optgroup>
        ))}
      </select>
      {!opciones.length && <div style={{ fontSize: 11, color: C.t2, marginTop: 5 }}>Definí motorización/motor/grupo en la pestaña Variantes.</div>}
      {err && <div style={hint}>No se pudo guardar — falta correr el SQL de variantes.</div>}
    </div>
  );
}

// ── Tab de administración de opciones (dimensiones) y sus valores ───────────
export function VariantesTab({ opciones, onChanged }) {
  const [nuevaOpcion, setNuevaOpcion] = useState("");
  const [valorDraft, setValorDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const missing = useMemo(() => !opciones.length, [opciones]);

  async function run(fn) {
    setBusy(true); setErr(null);
    try { await fn(); await onChanged?.(); }
    catch (e) { setErr(e); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.7, marginBottom: 16 }}>
        Las <strong>variantes</strong> son las dimensiones de las que dependen los ítems del barco
        (Motorización: línea de eje / fuera de borda / dentro-fuera · Motor · Grupo electrógeno).
        Después, en la revisión, cada material se marca como <em>base</em> o que <em>aplica</em> a un valor.
      </div>

      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{String(err.message ?? err)}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <input value={nuevaOpcion} onChange={(e) => setNuevaOpcion(e.target.value)} placeholder="Nueva dimensión (ej. Motorización)" style={{ ...INP, flex: "1 1 240px" }} />
        <button type="button" disabled={busy || !nuevaOpcion.trim()} onClick={() => run(async () => { await crearOpcion(nuevaOpcion); setNuevaOpcion(""); })} style={BTN_PRIMARY}>
          <Plus size={14} /> Agregar dimensión
        </button>
      </div>

      {missing ? (
        <div style={{ fontSize: 13, color: C.t2, padding: "20px 0" }}>
          No hay dimensiones todavía. Si recién corriste el SQL ya vienen Motorización, Motor y Grupo electrógeno cargados — tocá Actualizar.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {opciones.map((o) => (
            <div key={o.id} style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.t0 }}>{o.nombre}</div>
                <button type="button" disabled={busy} onClick={() => run(() => borrarOpcion(o.id))} style={{ ...BTN, color: C.red, padding: "4px 8px" }} title="Borrar dimensión">
                  <Trash2 size={13} />
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {o.valores.length ? o.valores.map((v) => (
                  <span key={v.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, background: C.s2, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "4px 6px 4px 11px", color: C.t1 }}>
                    {v.valor}
                    <button type="button" disabled={busy} onClick={() => run(() => borrarValor(v.id))} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", display: "inline-flex" }}>
                      <Trash2 size={11} />
                    </button>
                  </span>
                )) : <span style={{ fontSize: 12, color: C.t2 }}>Sin valores aún.</span>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={valorDraft[o.id] ?? ""}
                  onChange={(e) => setValorDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                  placeholder="Nuevo valor (ej. fuera de borda)"
                  style={{ ...INP, flex: 1 }}
                />
                <button type="button" disabled={busy || !(valorDraft[o.id] ?? "").trim()}
                  onClick={() => run(async () => { await crearValor(o.id, valorDraft[o.id], o.valores.length + 1); setValorDraft((d) => ({ ...d, [o.id]: "" })); })}
                  style={BTN}>
                  <Plus size={13} /> Valor
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
