// Maestro de empleados: clasificación casa/contratista, flag "ficha",
// alta/edición, y administración de contratistas (jefes).
import { useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { SEDES } from "./api";
import { BTN, BTN_PRIMARY, GrupoBadge, INP, KpiCard, LBL, Td, Th } from "./ui";

const FORM_VACIO = { dni: "", nombre: "", grupo: "casa", sede: "", contratista_id: "", ficha: true, activo: true, notas: "" };

export default function EmpleadosTab({ empleados, contratistas, onChanged, esAdmin }) {
  const [q, setQ] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [filtroSede, setFiltroSede] = useState("todas");
  const [verInactivos, setVerInactivos] = useState(false);
  const [verNoFichan, setVerNoFichan] = useState(false);
  const [modal, setModal] = useState(null);     // null | {emp|null}
  const [showContratistas, setShowContratistas] = useState(false);
  const [err, setErr] = useState(null);
  const [selIds, setSelIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkGrupo, setBulkGrupo] = useState("casa");
  const [bulkContratistaId, setBulkContratistaId] = useState("");
  const [bulkSede, setBulkSede] = useState("Pampa");

  const filtrados = useMemo(() => {
    let rows = empleados ?? [];
    if (!verInactivos) rows = rows.filter(e => e.activo !== false);
    if (!verNoFichan) rows = rows.filter(e => e.ficha !== false);
    if (filtroSede !== "todas") rows = rows.filter(e => e.sede === filtroSede);
    if (filtroGrupo === "casa") rows = rows.filter(e => e.grupo === "casa");
    else if (filtroGrupo === "contratistas") rows = rows.filter(e => e.grupo === "contratista");
    else if (filtroGrupo === "sin_asignar") rows = rows.filter(e => e.grupo === "sin_asignar");
    else if (filtroGrupo.startsWith("c:")) rows = rows.filter(e => e.contratista_id === filtroGrupo.slice(2));
    if (q.trim()) {
      const qq = q.toLowerCase();
      rows = rows.filter(e => e.nombre.toLowerCase().includes(qq) || e.dni.includes(qq));
    }
    return [...rows].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [empleados, q, filtroGrupo, filtroSede, verInactivos, verNoFichan]);

  const stats = useMemo(() => {
    const act = (empleados ?? []).filter(e => e.activo !== false);
    return {
      total: act.length,
      casa: act.filter(e => e.grupo === "casa").length,
      contr: act.filter(e => e.grupo === "contratista").length,
      sin: act.filter(e => e.grupo === "sin_asignar").length,
      noFichan: act.filter(e => e.ficha === false).length,
    };
  }, [empleados]);

  function toggleSel(id) {
    setSelIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selAll() {
    setSelIds(new Set(filtrados.map(e => e.id)));
  }

  function selNone() {
    setSelIds(new Set());
  }

  async function bulkUpdate(patch) {
    const ids = [...selIds];
    if (!ids.length) return;
    setBulkLoading(true);
    setErr(null);
    try {
      // Por lotes: un .in() con cientos de UUIDs puede pasar el límite de URL.
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase.from("rrhh_empleados").update(patch).in("id", ids.slice(i, i + 100));
        if (error) throw error;
      }
      setSelIds(new Set());
      onChanged?.();
    } catch (e) {
      setErr(e);
    } finally {
      setBulkLoading(false);
    }
  }

  async function aplicarGrupo() {
    if (bulkGrupo === "contratista" && !bulkContratistaId) return;
    await bulkUpdate({
      grupo: bulkGrupo,
      contratista_id: bulkGrupo === "contratista" ? bulkContratistaId : null,
    });
  }

  async function borrarEmpleado(emp) {
    if (!esAdmin || !emp?.id) return;
    const ok = window.confirm(`¿Borrar a ${emp.nombre} de la lista de empleados?\n\nSe marca como inactivo y deja de fichar, pero no se borra el historial.`);
    if (!ok) return;
    setErr(null);
    const { error } = await supabase
      .from("rrhh_empleados")
      .update({ activo: false, ficha: false })
      .eq("id", emp.id);
    if (error) {
      setErr(error);
      return;
    }
    setSelIds(prev => {
      const next = new Set(prev);
      next.delete(emp.id);
      return next;
    });
    onChanged?.();
  }

  async function borrarSeleccionados() {
    if (!selIds.size) return;
    const ok = window.confirm(`¿Borrar ${selIds.size} empleado${selIds.size !== 1 ? "s" : ""} de la lista?\n\nSe marcan como inactivos y dejan de fichar, sin borrar historial.`);
    if (!ok) return;
    await bulkUpdate({ activo: false, ficha: false });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <KpiCard label="Activos" value={stats.total} />
        <KpiCard label="Casa" value={stats.casa} color="#60a5fa" />
        <KpiCard label="Contratistas" value={stats.contr} color="#fbbf24" sub={`${(contratistas ?? []).length} jefes`} />
        <KpiCard label="Sin asignar" value={stats.sin} color={stats.sin ? "#f87171" : C.green} sub={stats.sin ? "clasificar acá abajo" : "todo clasificado"} />
        <KpiCard label="No fichan" value={stats.noFichan} sub="ignorados en informes" />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select style={{ ...INP, minWidth: 170 }} value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}>
          <option value="todos">Todos los grupos</option>
          <option value="casa">Gente de la casa</option>
          <option value="contratistas">Todos los contratistas</option>
          <option value="sin_asignar">⚠ Sin asignar</option>
          {(contratistas ?? []).map(c => <option key={c.id} value={`c:${c.id}`}>↳ {c.nombre}</option>)}
        </select>
        <select style={{ ...INP, minWidth: 140 }} value={filtroSede} onChange={e => setFiltroSede(e.target.value)}>
          <option value="todas">Todas las sedes</option>
          {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input style={{ ...INP, flex: 1, minWidth: 150 }} placeholder="Buscar nombre o DNI…" value={q} onChange={e => setQ(e.target.value)} />
        <label style={{ fontSize: 12, color: C.t2, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={verNoFichan} onChange={e => setVerNoFichan(e.target.checked)} /> ver no-fichan
        </label>
        <label style={{ fontSize: 12, color: C.t2, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} /> ver inactivos
        </label>
        {esAdmin && <button style={BTN} onClick={() => setShowContratistas(true)}>Contratistas</button>}
        {esAdmin && <button style={BTN_PRIMARY} onClick={() => setModal({ emp: null })}>+ Empleado</button>}
      </div>

      {err && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 10 }}>{String(err.message ?? err)}</div>}

      {esAdmin && selIds.size > 0 && (
        <div style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "var(--panel-solid)",
          backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(59,130,246,0.30)",
          borderRadius: 10, padding: "10px 12px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        }}>
          <span style={{ fontFamily: C.mono, fontSize: 13, color: "#60a5fa", fontWeight: 700, minWidth: 70 }}>
            {selIds.size} selec.
          </span>
          <button type="button" onClick={selAll} style={{ ...BTN, padding: "4px 10px" }}>Todos del filtro</button>
          <button type="button" onClick={selNone} style={{ ...BTN, padding: "4px 10px" }}>Ninguno</button>
          <div style={{ width: 1, height: 26, background: C.b0, margin: "0 2px" }} />

          <select style={{ ...INP, padding: "5px 8px" }} value={bulkGrupo} onChange={e => setBulkGrupo(e.target.value)}>
            <option value="casa">Grupo: casa</option>
            <option value="contratista">Grupo: contratista</option>
          </select>
          {bulkGrupo === "contratista" && (
            <select style={{ ...INP, padding: "5px 8px", minWidth: 150 }} value={bulkContratistaId} onChange={e => setBulkContratistaId(e.target.value)}>
              <option value="">Elegir contratista</option>
              {(contratistas ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          <button type="button" disabled={bulkLoading || !selIds.size || (bulkGrupo === "contratista" && !bulkContratistaId)} onClick={aplicarGrupo} style={{ ...BTN_PRIMARY, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1 }}>
            Aplicar grupo
          </button>

          <select style={{ ...INP, padding: "5px 8px" }} value={bulkSede} onChange={e => setBulkSede(e.target.value)}>
            {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" disabled={bulkLoading || !selIds.size} onClick={() => bulkUpdate({ sede: bulkSede })} style={{ ...BTN, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1 }}>Asignar sede</button>
          <button type="button" disabled={bulkLoading || !selIds.size} onClick={() => bulkUpdate({ ficha: true })} style={{ ...BTN, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1 }}>Ficha si</button>
          <button type="button" disabled={bulkLoading || !selIds.size} onClick={() => bulkUpdate({ ficha: false })} style={{ ...BTN, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1 }}>Ficha no</button>
          <button type="button" disabled={bulkLoading || !selIds.size} onClick={() => bulkUpdate({ activo: true })} style={{ ...BTN, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1 }}>Activo si</button>
          <button type="button" disabled={bulkLoading || !selIds.size} onClick={() => bulkUpdate({ activo: false })} style={{ ...BTN, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1 }}>Activo no</button>
          <button type="button" disabled={bulkLoading || !selIds.size} onClick={borrarSeleccionados} style={{ ...BTN, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1, color: "#f87171", border: "1px solid rgba(248,113,113,0.35)" }}>Borrar</button>
        </div>
      )}

      <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>{filtrados.length} empleado{filtrados.length !== 1 ? "s" : ""}</div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {esAdmin && <Th><input type="checkbox" checked={filtrados.length > 0 && filtrados.every(e => selIds.has(e.id))} onChange={e => e.target.checked ? selAll() : selNone()} /></Th>}
              <Th>Nombre</Th><Th>DNI</Th><Th>Sede</Th><Th>Grupo</Th><Th>Ficha</Th><Th>Estado</Th><Th> </Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(e => (
              <tr key={e.id} style={{ opacity: e.activo === false ? 0.5 : 1 }}>
                {esAdmin && <Td><input type="checkbox" checked={selIds.has(e.id)} onChange={() => toggleSel(e.id)} /></Td>}
                <Td>{e.nombre}{e.notas && <span title={e.notas} style={{ marginLeft: 6, fontSize: 11, color: C.t2 }}>✎</span>}</Td>
                <Td mono color={C.t1}>{e.dni}</Td>
                <Td color={e.sede ? C.t1 : C.t2}>{e.sede ?? "—"}</Td>
                <Td><GrupoBadge grupo={e.grupo} contratistaNombre={e.contratista?.nombre} /></Td>
                <Td color={e.ficha === false ? C.t2 : C.green} style={{ fontSize: 12 }}>{e.ficha === false ? "no ficha" : "ficha"}</Td>
                <Td color={e.activo === false ? "#f87171" : C.green} style={{ fontSize: 12 }}>{e.activo === false ? "inactivo" : "activo"}</Td>
                <Td>
                  {esAdmin && (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button style={{ ...BTN, padding: "4px 11px", fontSize: 11 }} onClick={() => setModal({ emp: e })}>Editar</button>
                      {e.activo !== false && (
                        <button style={{ ...BTN, padding: "4px 11px", fontSize: 11, color: "#f87171", border: "1px solid rgba(248,113,113,0.35)" }} onClick={() => borrarEmpleado(e)}>Borrar</button>
                      )}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <EmpleadoModal
          emp={modal.emp}
          contratistas={contratistas}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onChanged?.(); }}
          onError={setErr}
        />
      )}
      {showContratistas && (
        <ContratistasModal contratistas={contratistas} onClose={() => setShowContratistas(false)} onChanged={onChanged} />
      )}
    </div>
  );
}

// ─── Modal alta/edición de empleado ─────────────────────────────────────────
function EmpleadoModal({ emp, contratistas, onClose, onSaved, onError }) {
  const [form, setForm] = useState(emp ? {
    dni: emp.dni, nombre: emp.nombre, grupo: emp.grupo,
    sede: emp.sede ?? "", contratista_id: emp.contratista_id ?? "", ficha: emp.ficha !== false,
    activo: emp.activo !== false, notas: emp.notas ?? "",
  } : FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function guardar() {
    if (!form.nombre.trim() || !/^\d{5,10}$/.test(form.dni.trim())) return;
    setSaving(true);
    const payload = {
      dni: form.dni.trim(), nombre: form.nombre.trim(), grupo: form.grupo,
      sede: form.sede || null,
      contratista_id: form.grupo === "contratista" && form.contratista_id ? form.contratista_id : null,
      ficha: form.ficha, activo: form.activo, notas: form.notas.trim() || null,
    };
    const res = emp
      ? await supabase.from("rrhh_empleados").update(payload).eq("id", emp.id)
      : await supabase.from("rrhh_empleados").insert(payload);
    setSaving(false);
    if (res.error) { onError?.(res.error); return; }
    onSaved();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, background: "var(--overlay-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 24, width: "min(440px,94vw)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.t0, marginBottom: 14 }}>{emp ? "Editar empleado" : "Nuevo empleado"}</div>

        <label style={LBL}>Nombre *</label>
        <input style={{ ...INP, width: "100%", marginBottom: 10 }} value={form.nombre} onChange={e => set("nombre", e.target.value)} autoFocus />

        <label style={LBL}>DNI * <span style={{ color: C.t2, textTransform: "none", letterSpacing: 0 }}>(es la llave con el fichero — solo números)</span></label>
        <input style={{ ...INP, width: "100%", marginBottom: 10, fontFamily: C.mono }} value={form.dni}
          onChange={e => set("dni", e.target.value.replace(/\D/g, ""))} disabled={!!emp} />

        <label style={LBL}>Sede</label>
        <select style={{ ...INP, width: "100%", marginBottom: 10 }} value={form.sede} onChange={e => set("sede", e.target.value)}>
          <option value="">Sin sede</option>
          {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label style={LBL}>Grupo</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[["casa", "Casa"], ["contratista", "Contratista"], ["sin_asignar", "Sin asignar"]].map(([v, l]) => (
            <button key={v} onClick={() => set("grupo", v)} style={{
              ...BTN, flex: 1,
              background: form.grupo === v ? "rgba(59,130,246,0.13)" : C.s0,
              border: `1px solid ${form.grupo === v ? "rgba(59,130,246,0.35)" : C.b0}`,
              color: form.grupo === v ? "#60a5fa" : C.t2,
            }}>{l}</button>
          ))}
        </div>

        {form.grupo === "contratista" && (
          <>
            <label style={LBL}>Contratista (jefe)</label>
            <select style={{ ...INP, width: "100%", marginBottom: 10 }} value={form.contratista_id} onChange={e => set("contratista_id", e.target.value)}>
              <option value="">— Sin asignar —</option>
              {(contratistas ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </>
        )}

        <div style={{ display: "flex", gap: 18, margin: "4px 0 10px" }}>
          <label style={{ fontSize: 13, color: C.t1, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={form.ficha} onChange={e => set("ficha", e.target.checked)} /> Ficha en el reloj
          </label>
          <label style={{ fontSize: 13, color: C.t1, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={form.activo} onChange={e => set("activo", e.target.checked)} /> Activo
          </label>
        </div>

        <label style={LBL}>Notas</label>
        <input style={{ ...INP, width: "100%", marginBottom: 16 }} value={form.notas} onChange={e => set("notas", e.target.value)} placeholder="Opcional" />

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={guardar} disabled={saving || !form.nombre.trim() || !/^\d{5,10}$/.test(form.dni)} style={{ ...BTN_PRIMARY, flex: 1, padding: "10px", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <button onClick={onClose} style={BTN}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de contratistas (jefes) ──────────────────────────────────────────
function ContratistasModal({ contratistas, onClose, onChanged }) {
  const [form, setForm] = useState({ nombre: "", dni: "", celular: "" });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function guardar() {
    if (!form.nombre.trim()) return;
    setSaving(true); setErr(null);
    const payload = { nombre: form.nombre.trim(), dni: form.dni.trim() || null, celular: form.celular.trim() || null };
    const res = editId
      ? await supabase.from("rrhh_contratistas").update(payload).eq("id", editId)
      : await supabase.from("rrhh_contratistas").insert(payload);
    setSaving(false);
    if (res.error) { setErr(res.error); return; }
    setForm({ nombre: "", dni: "", celular: "" }); setEditId(null);
    onChanged?.();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, background: "var(--overlay-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 24, width: "min(520px,94vw)", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.t0, marginBottom: 14 }}>Contratistas (jefes)</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 120px auto", gap: 6, marginBottom: 14 }}>
          <input style={INP} placeholder="Nombre *" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          <input style={{ ...INP, fontFamily: C.mono }} placeholder="DNI" value={form.dni} onChange={e => setForm(f => ({ ...f, dni: e.target.value.replace(/\D/g, "") }))} />
          <input style={{ ...INP, fontFamily: C.mono }} placeholder="Celular" value={form.celular} onChange={e => setForm(f => ({ ...f, celular: e.target.value }))} />
          <button onClick={guardar} disabled={saving || !form.nombre.trim()} style={BTN_PRIMARY}>{editId ? "Guardar" : "+"}</button>
        </div>
        {editId && <button style={{ ...BTN, marginBottom: 10 }} onClick={() => { setEditId(null); setForm({ nombre: "", dni: "", celular: "" }); }}>Cancelar edición</button>}
        {err && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 10 }}>{String(err.message ?? err)}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(contratistas ?? []).map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8, padding: "7px 12px" }}>
              <span style={{ fontSize: 13, color: C.t0, flex: 1 }}>{c.nombre}</span>
              {c.dni && <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono }}>{c.dni}</span>}
              {c.celular && <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono }}>📱{c.celular}</span>}
              <button style={{ ...BTN, padding: "3px 9px", fontSize: 11 }}
                onClick={() => { setEditId(c.id); setForm({ nombre: c.nombre, dni: c.dni ?? "", celular: c.celular ?? "" }); }}>
                Editar
              </button>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{ ...BTN, width: "100%", marginTop: 14, padding: "9px" }}>Cerrar</button>
      </div>
    </div>
  );
}
