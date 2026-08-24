// Maestro de empleados: clasificación casa/contratista, flag "ficha",
// alta/edición, y administración de contratistas (jefes).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import useNfcBridge from "@/features/panol/useNfcBridge";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { EMPLEADO_SELECT, fetchConfig, isMissingColumn, normalizeNfcUid, SEDES, subirFotoEmpleado } from "./api";
import { SeguimientoPersonaModal } from "./PresentismoTab";
import { BTN, BTN_PRIMARY, GrupoBadge, INP, KpiCard, LBL, Td, Th } from "./ui";
import CapturaFotoModal from "@/components/CapturaFotoModal";
import { Archive, Camera, CalendarSearch, ImageUp, RotateCcw, UsersRound } from "lucide-react";

const FORM_VACIO = { dni: "", nombre: "", grupo: "casa", sede: "", contratista_id: "", ficha: true, activo: true, notas: "", nfc_uid: "", foto_url: "" };

function searchText(value) {
  return String(value ?? "").toLowerCase();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function initials(nombre) {
  const parts = String(nombre ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]).join("").toUpperCase() || "?";
}

function EmpleadoAvatar({ emp, size = 30 }) {
  const foto = String(emp?.foto_url ?? "").trim();
  return (
    <div style={{ width: size, height: size, borderRadius: size >= 44 ? 16 : 10, overflow: "hidden", border: `1px solid ${C.b0}`, background: "linear-gradient(135deg, rgba(59,130,246,0.16), rgba(16,185,129,0.14))", color: C.blue, display: "grid", placeItems: "center", flexShrink: 0, fontWeight: 950, fontSize: size >= 44 ? 18 : 11 }}>
      {foto ? <img src={foto} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(emp?.nombre)}
    </div>
  );
}

function NfcBadge({ uid }) {
  const clean = normalizeNfcUid(uid);
  return clean ? (
    <span title={`Tarjeta ${clean}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 999, padding: "3px 8px", fontSize: 10.5, fontWeight: 850, fontFamily: C.mono }}>
      NFC {clean.slice(-6)}
    </span>
  ) : (
    <span style={{ color: C.t2, fontSize: 11 }}>sin tarjeta</span>
  );
}

export default function EmpleadosTab({ empleados, contratistas, onChanged, esAdmin, initialQuery = "", initialView = "activos" }) {
  const [q, setQ] = useState(initialQuery);
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [filtroSede, setFiltroSede] = useState("todas");
  const [vista, setVista] = useState(initialView === "ex" ? "ex" : "activos");
  const [verNoFichan, setVerNoFichan] = useState(false);
  const [modal, setModal] = useState(null);     // null | {emp|null}
  const [showContratistas, setShowContratistas] = useState(false);
  const [seguimiento, setSeguimiento] = useState(null); // null | empleado
  // El modal necesita la config de RRHH (tolerancia de tarde) igual que en
  // Presentismo; se pide recien cuando alguien abre el seguimiento.
  const [configRrhh, setConfigRrhh] = useState(null);
  const [err, setErr] = useState(null);
  const [selIds, setSelIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkGrupo, setBulkGrupo] = useState("casa");
  const [bulkContratistaId, setBulkContratistaId] = useState("");
  const [bulkSede, setBulkSede] = useState("Pampa");

  useEffect(() => {
    setQ(initialQuery || "");
    setVista(initialView === "ex" ? "ex" : "activos");
    setSelIds(new Set());
  }, [initialQuery, initialView]);

  const filtrados = useMemo(() => {
    let rows = empleados ?? [];
    rows = rows.filter(e => vista === "ex" ? e.activo === false : e.activo !== false);
    if (vista === "activos" && !verNoFichan) rows = rows.filter(e => e.ficha !== false);
    if (filtroSede !== "todas") rows = rows.filter(e => e.sede === filtroSede);
    if (filtroGrupo === "casa") rows = rows.filter(e => e.grupo === "casa");
    else if (filtroGrupo === "contratistas") rows = rows.filter(e => e.grupo === "contratista");
    else if (filtroGrupo === "sin_asignar") rows = rows.filter(e => e.grupo === "sin_asignar");
    else if (filtroGrupo.startsWith("c:")) rows = rows.filter(e => e.contratista_id === filtroGrupo.slice(2));
    if (q.trim()) {
      const qq = searchText(q);
      const qDni = digits(q);
      rows = rows.filter(e =>
        searchText(e.nombre).includes(qq)
        || searchText(e.dni).includes(qq)
        || searchText(e.nfc_uid).includes(qq)
        || (!!qDni && digits(e.dni).includes(qDni))
      );
    }
    return [...rows].sort((a, b) => searchText(a.nombre).localeCompare(searchText(b.nombre), "es"));
  }, [empleados, q, filtroGrupo, filtroSede, vista, verNoFichan]);

  const stats = useMemo(() => {
    const act = (empleados ?? []).filter(e => e.activo !== false);
    return {
      total: act.length,
      casa: act.filter(e => e.grupo === "casa").length,
      contr: act.filter(e => e.grupo === "contratista").length,
      sin: act.filter(e => e.grupo === "sin_asignar").length,
      noFichan: act.filter(e => e.ficha === false).length,
      conNfc: act.filter(e => normalizeNfcUid(e.nfc_uid)).length,
      ex: (empleados ?? []).filter(e => e.activo === false).length,
    };
  }, [empleados]);

  function cambiarVista(next) {
    setVista(next);
    setSelIds(new Set());
  }

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

  async function darDeBajaEmpleado(emp) {
    if (!esAdmin || !emp?.id) return;
    const ok = window.confirm(`¿Dar de baja a ${emp.nombre}?\n\nPasará a Ex empleados y dejará de fichar. Su legajo, foto, NFC e historial quedarán guardados.`);
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

  async function darDeBajaSeleccionados() {
    if (!selIds.size) return;
    const ok = window.confirm(`¿Dar de baja ${selIds.size} empleado${selIds.size !== 1 ? "s" : ""}?\n\nPasarán a Ex empleados sin perder su historial.`);
    if (!ok) return;
    await bulkUpdate({ activo: false, ficha: false });
  }

  async function reactivarEmpleado(emp) {
    if (!esAdmin || !emp?.id) return;
    const ok = window.confirm(`¿Reactivar a ${emp.nombre}?\n\nVolverá al equipo activo y quedará habilitado para fichar.`);
    if (!ok) return;
    setErr(null);
    const { error } = await supabase
      .from("rrhh_empleados")
      .update({ activo: true, ficha: true })
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

  async function reactivarSeleccionados() {
    if (!selIds.size) return;
    const ok = window.confirm(`¿Reactivar ${selIds.size} ex empleado${selIds.size !== 1 ? "s" : ""}?\n\nVolverán al equipo activo y quedarán habilitados para fichar.`);
    if (!ok) return;
    await bulkUpdate({ activo: true, ficha: true });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <KpiCard label="Activos" value={stats.total} />
        <KpiCard label="Casa" value={stats.casa} color="#60a5fa" />
        <KpiCard label="Contratistas" value={stats.contr} color="#fbbf24" sub={`${(contratistas ?? []).length} jefes`} />
        <KpiCard label="Sin asignar" value={stats.sin} color={stats.sin ? "#f87171" : C.green} sub={stats.sin ? "clasificar acá abajo" : "todo clasificado"} />
        <KpiCard label="No fichan" value={stats.noFichan} sub="ignorados en informes" />
        <KpiCard label="NFC" value={stats.conNfc} color={C.green} sub="tarjetas asignadas" />
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        marginBottom: 12, padding: 5, border: `1px solid ${C.b0}`, borderRadius: 11, background: C.s0,
      }}>
        <div style={{ display: "flex", gap: 4, minWidth: 0 }}>
          {[
            { key: "activos", label: "Equipo activo", count: stats.total, icon: UsersRound },
            { key: "ex", label: "Ex empleados", count: stats.ex, icon: Archive },
          ].map(item => {
            const active = vista === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => cambiarVista(item.key)}
                style={{
                  ...BTN,
                  display: "inline-flex", alignItems: "center", gap: 7, minHeight: 36, padding: "7px 11px",
                  color: active ? C.t0 : C.t2,
                  background: active ? C.panelSolid : "transparent",
                  borderColor: active ? C.b1 : "transparent",
                  boxShadow: active ? "0 1px 4px rgba(0,0,0,.10)" : "none",
                }}
              >
                <Icon size={14} strokeWidth={1.9} />
                {item.label}
                <span style={{
                  minWidth: 22, padding: "2px 6px", borderRadius: 999, textAlign: "center",
                  background: active ? C.blueL : "var(--panel-2)", color: active ? C.blue : C.t2,
                  fontFamily: C.mono, fontSize: 10.5, fontWeight: 800,
                }}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ color: C.t2, fontSize: 11.5, lineHeight: 1.35, padding: "0 7px" }}>
          {vista === "ex"
            ? "Las bajas conservan legajo, foto, NFC e historial."
            : "Personal habilitado para operar y fichar."}
        </div>
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
        {vista === "activos" && (
          <label style={{ fontSize: 12, color: C.t2, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={verNoFichan} onChange={e => setVerNoFichan(e.target.checked)} /> ver no-fichan
          </label>
        )}
        {esAdmin && <button style={BTN} onClick={() => setShowContratistas(true)}>Contratistas</button>}
        {esAdmin && <button style={BTN_PRIMARY} onClick={() => { setErr(null); setModal({ emp: null }); }}>+ Empleado</button>}
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

          {vista === "ex" ? (
            <button type="button" disabled={bulkLoading || !selIds.size} onClick={reactivarSeleccionados} style={{ ...BTN_PRIMARY, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1 }}>
              <RotateCcw size={13} /> Reactivar seleccionados
            </button>
          ) : (
            <>
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
              <button type="button" disabled={bulkLoading || !selIds.size} onClick={() => bulkUpdate({ ficha: true })} style={{ ...BTN, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1 }}>Ficha sí</button>
              <button type="button" disabled={bulkLoading || !selIds.size} onClick={() => bulkUpdate({ ficha: false })} style={{ ...BTN, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1 }}>Ficha no</button>
              <button type="button" disabled={bulkLoading || !selIds.size} onClick={darDeBajaSeleccionados} style={{ ...BTN, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", opacity: bulkLoading || !selIds.size ? 0.5 : 1, color: "#f87171", border: "1px solid rgba(248,113,113,0.35)" }}>
                <Archive size={13} /> Dar de baja
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>
        {filtrados.length} {vista === "ex" ? "ex empleado" : "empleado"}{filtrados.length !== 1 ? "s" : ""}
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {esAdmin && <Th><input type="checkbox" checked={filtrados.length > 0 && filtrados.every(e => selIds.has(e.id))} onChange={e => e.target.checked ? selAll() : selNone()} /></Th>}
              <Th>Nombre</Th><Th>DNI</Th><Th>NFC</Th><Th>Sede</Th><Th>Grupo</Th><Th>Ficha</Th><Th>Estado</Th><Th> </Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={esAdmin ? 9 : 8} style={{ padding: "34px 18px", textAlign: "center", color: C.t2 }}>
                  <div style={{ display: "grid", placeItems: "center", gap: 7 }}>
                    {vista === "ex" ? <Archive size={22} strokeWidth={1.6} /> : <UsersRound size={22} strokeWidth={1.6} />}
                    <span style={{ fontSize: 12.5 }}>
                      {q.trim() ? "No hay resultados para esta búsqueda." : vista === "ex" ? "Todavía no hay ex empleados." : "No hay empleados en este filtro."}
                    </span>
                  </div>
                </td>
              </tr>
            )}
            {filtrados.map(e => (
              <tr key={e.id} style={{ opacity: e.activo === false && vista !== "ex" ? 0.5 : 1, background: vista === "ex" ? "rgba(148,163,184,0.025)" : "transparent" }}>
                {esAdmin && <Td><input type="checkbox" checked={selIds.has(e.id)} onChange={() => toggleSel(e.id)} /></Td>}
                <Td>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 190 }}>
                    <EmpleadoAvatar emp={e} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.t0, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.nombre}{e.notas && <span title={e.notas} style={{ marginLeft: 6, fontSize: 11, color: C.t2 }}>nota</span>}
                      </div>
                      {e.foto_url && <div style={{ color: C.t2, fontSize: 10.5, marginTop: 1 }}>foto cargada</div>}
                    </div>
                  </div>
                </Td>
                <Td mono color={C.t1}>{e.dni}</Td>
                <Td><NfcBadge uid={e.nfc_uid} /></Td>
                <Td color={e.sede ? C.t1 : C.t2}>{e.sede ?? "—"}</Td>
                <Td><GrupoBadge grupo={e.grupo} contratistaNombre={e.contratista?.nombre} /></Td>
                <Td color={e.ficha === false ? C.t2 : C.green} style={{ fontSize: 12 }}>{e.ficha === false ? "no ficha" : "ficha"}</Td>
                <Td color={e.activo === false ? "#f87171" : C.green} style={{ fontSize: 12 }}>{e.activo === false ? "inactivo" : "activo"}</Td>
                <Td>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      style={{ ...BTN, padding: "4px 11px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}
                      title="Ver e imprimir la asistencia de esta persona entre dos fechas"
                      onClick={() => {
                        setSeguimiento(e);
                        if (!configRrhh) fetchConfig().then(setConfigRrhh).catch(() => setConfigRrhh({}));
                      }}
                    >
                      <CalendarSearch size={12} /> Seguimiento
                    </button>
                  </div>
                  {esAdmin && (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
                      <button style={{ ...BTN, padding: "4px 11px", fontSize: 11 }} onClick={() => { setErr(null); setModal({ emp: e }); }}>Editar</button>
                      {e.activo === false ? (
                        <button style={{ ...BTN_PRIMARY, display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", fontSize: 11 }} onClick={() => reactivarEmpleado(e)}>
                          <RotateCcw size={12} /> Reactivar
                        </button>
                      ) : (
                        <button style={{ ...BTN, display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", fontSize: 11, color: "#f87171", border: "1px solid rgba(248,113,113,0.35)" }} onClick={() => darDeBajaEmpleado(e)}>
                          <Archive size={12} /> Dar de baja
                        </button>
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
          empleados={empleados}
          contratistas={contratistas}
          onClose={() => setModal(null)}
          onSaved={() => { setErr(null); setModal(null); onChanged?.(); }}
          onError={setErr}
        />
      )}
      {showContratistas && (
        <ContratistasModal contratistas={contratistas} onClose={() => setShowContratistas(false)} onChanged={onChanged} />
      )}
      {seguimiento && (
        <SeguimientoPersonaModal
          empleados={empleados}
          config={configRrhh ?? {}}
          empleadoInicial={seguimiento}
          onClose={() => setSeguimiento(null)}
        />
      )}
    </div>
  );
}

// ─── Modal alta/edición de empleado ─────────────────────────────────────────
function EmpleadoModal({ emp, empleados, contratistas, onClose, onSaved, onError }) {
  const [form, setForm] = useState(emp ? {
    dni: emp.dni, nombre: emp.nombre, grupo: emp.grupo,
    sede: emp.sede ?? "", contratista_id: emp.contratista_id ?? "", ficha: emp.ficha !== false,
    activo: emp.activo !== false, notas: emp.notas ?? "",
    nfc_uid: emp.nfc_uid ?? "", foto_url: emp.foto_url ?? "",
  } : FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [saveError, setSaveError] = useState("");
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fotoInputRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const empleadoMismoDni = useMemo(() => {
    if (emp) return null;
    const dni = digits(form.dni);
    if (!dni) return null;
    return (empleados ?? []).find(item => digits(item.dni) === dni) ?? null;
  }, [emp, empleados, form.dni]);
  const reactivacionDetectada = empleadoMismoDni?.activo === false;
  const duplicadoActivoDetectado = empleadoMismoDni?.activo !== false && !!empleadoMismoDni;

  async function cargarFotoDesdeArchivo(event) {
    const archivo = event.target.files?.[0];
    event.target.value = "";
    if (!archivo || !emp?.id) return;

    const tiposPermitidos = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!tiposPermitidos.has(archivo.type)) {
      onError?.(new Error("La foto debe ser JPG, PNG o WebP."));
      return;
    }
    if (archivo.size > 8 * 1024 * 1024) {
      onError?.(new Error("La foto supera los 8 MB. Elegí una imagen más liviana."));
      return;
    }

    setSubiendoFoto(true);
    try {
      const url = await subirFotoEmpleado(emp.id, archivo);
      set("foto_url", url);
    } catch (err) {
      onError?.(err);
    } finally {
      setSubiendoFoto(false);
    }
  }

  const onBridgeUid = useCallback((uid) => {
    const clean = normalizeNfcUid(uid);
    if (!clean) return;
    setForm((f) => ({ ...f, nfc_uid: clean }));
    setScanMsg(`Tarjeta detectada por ACR122U: ${clean}`);
  }, []);
  const nfcBridge = useNfcBridge({ enabled: true, onUid: onBridgeUid });
  const bridgeOk = nfcBridge.status === "connected";
  const bridgeLabel = bridgeOk
    ? "ACR122U conectado"
    : nfcBridge.status === "connecting"
      ? "Buscando ACR122U"
      : "Puente ACR122U no detectado";
  const bridgeColor = bridgeOk ? C.green : nfcBridge.status === "connecting" ? C.blue : C.amber;
  const bridgeBg = bridgeOk ? C.greenL : nfcBridge.status === "connecting" ? C.blueL : C.amberL;
  const bridgeBorder = bridgeOk ? C.greenB : nfcBridge.status === "connecting" ? C.blueB : C.amberB;

  useKeyboardWedge({
    enabled: true,
    ignoreEditable: false,
    minLength: 4,
    timeoutMs: 65,
    onScan: (code) => {
      const clean = normalizeNfcUid(code);
      if (!clean) return;
      set("nfc_uid", clean);
      setScanMsg(`Tarjeta detectada: ${clean}`);
    },
  });

  async function guardar() {
    if (!form.nombre.trim() || !/^\d{5,10}$/.test(form.dni.trim())) return;
    setSaving(true);
    setSaveError("");
    try {
      let registroExistente = emp ?? null;
      if (!emp) {
        const { data, error } = await supabase
          .from("rrhh_empleados")
          .select(EMPLEADO_SELECT)
          .eq("dni", form.dni.trim())
          .maybeSingle();
        if (error) throw error;
        registroExistente = data ?? null;

        if (registroExistente?.activo !== false && registroExistente) {
          throw new Error(`El DNI ${form.dni.trim()} ya pertenece a ${registroExistente.nombre}. Buscalo en Equipo activo para editar su legajo.`);
        }
      }

      const esReactivacion = !emp && registroExistente?.activo === false;
      const nfcUidIngresado = normalizeNfcUid(form.nfc_uid);
      const nfcUid = nfcUidIngresado || (esReactivacion ? normalizeNfcUid(registroExistente.nfc_uid) : "");
      const currentNfc = normalizeNfcUid(registroExistente?.nfc_uid);
      const nfcChanged = nfcUid !== currentNfc;
      const auth = nfcChanged ? await supabase.auth.getUser() : null;
      const payload = {
        dni: form.dni.trim(), nombre: form.nombre.trim(), grupo: form.grupo,
        sede: form.sede || null,
        contratista_id: form.grupo === "contratista" && form.contratista_id ? form.contratista_id : null,
        ficha: form.ficha,
        activo: esReactivacion ? true : form.activo,
        notas: form.notas.trim() || (esReactivacion ? registroExistente.notas : null) || null,
        nfc_uid: nfcUid || null,
        foto_url: form.foto_url.trim() || (esReactivacion ? registroExistente.foto_url : null) || null,
        ...(nfcChanged ? { nfc_asignado_at: nfcUid ? new Date().toISOString() : null, nfc_asignado_por: auth?.data?.user?.id ?? null } : {}),
      };
      const res = registroExistente
        ? await supabase.from("rrhh_empleados").update(payload).eq("id", registroExistente.id)
        : await supabase.from("rrhh_empleados").insert(payload);
      if (res.error) throw res.error;
      onSaved();
    } catch (error) {
      const message = String(error?.message ?? error);
      if (error?.code === "23505" || message.includes("rrhh_empleados_dni_key")) {
        setSaveError(`El DNI ${form.dni.trim()} ya está guardado. Revisá Equipo activo o Ex empleados antes de crear otro legajo.`);
      } else if (isMissingColumn(error)) {
        setSaveError("Falta correr la migración NFC de RRHH antes de guardar tarjetas o fotos.");
      } else {
        setSaveError(message);
      }
    } finally {
      setSaving(false);
    }
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

        {!emp && empleadoMismoDni && (
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 11px", margin: "-2px 0 10px",
            borderRadius: 10,
            border: `1px solid ${reactivacionDetectada ? C.amberB : "rgba(248,113,113,0.35)"}`,
            background: reactivacionDetectada ? C.amberL : "rgba(248,113,113,0.08)",
          }}>
            {reactivacionDetectada
              ? <RotateCcw size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              : <UsersRound size={16} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ color: reactivacionDetectada ? C.amber : "#f87171", fontSize: 12, fontWeight: 850 }}>
                {reactivacionDetectada ? "Este DNI está en Ex empleados" : "Este DNI ya está activo"}
              </div>
              <div style={{ color: C.t1, fontSize: 11.5, lineHeight: 1.4, marginTop: 2 }}>
                Pertenece a <strong>{empleadoMismoDni.nombre}</strong>.{" "}
                {reactivacionDetectada
                  ? "Al guardar se reactivará el mismo legajo y conservará su historial, foto y NFC."
                  : "No se puede crear un segundo legajo; buscalo en Equipo activo para editarlo."}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center", border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 12, padding: 10, marginBottom: 10 }}>
          <EmpleadoAvatar emp={{ nombre: form.nombre, foto_url: form.foto_url }} size={56} />
          <div style={{ minWidth: 0 }}>
            <label style={LBL}>Foto del empleado</label>
            <input style={{ ...INP, width: "100%", marginBottom: 6 }} value={form.foto_url} onChange={e => set("foto_url", e.target.value)} placeholder="URL de foto / ficha visual" />
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={cargarFotoDesdeArchivo}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                disabled={!emp || subiendoFoto}
                title={emp ? "Elegir una foto JPG, PNG o WebP" : "Guardá el empleado antes de cargar la foto"}
                style={{ border: `1px solid ${C.b1}`, background: emp ? C.panelSolid : "transparent", color: emp ? C.t0 : C.t2, borderRadius: 8, minHeight: 34, padding: "0 11px", cursor: emp && !subiendoFoto ? "pointer" : "default", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", opacity: subiendoFoto ? 0.65 : 1 }}
              >
                <ImageUp size={14} /> {subiendoFoto ? "Cargando..." : "Cargar imagen"}
              </button>
              <button
                type="button"
                onClick={() => setCamaraAbierta(true)}
                disabled={!emp || subiendoFoto}
                title={emp ? "Sacar la foto con la cámara de la PC" : "Guardá el empleado primero y después sacale la foto"}
                style={{ border: `1px solid ${C.b1}`, background: emp ? C.s0 : "transparent", color: emp ? C.blue : C.t2, borderRadius: 8, minHeight: 34, padding: "0 11px", cursor: emp && !subiendoFoto ? "pointer" : "default", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", opacity: subiendoFoto ? 0.65 : 1 }}
              >
                <Camera size={14} /> Sacar
              </button>
            </div>
            <div style={{ color: C.t2, fontSize: 11, lineHeight: 1.35 }}>
              Se muestra al egresar material para confirmar visualmente quien retira.
              {!emp && " (Primero guardá el empleado.)"}
            </div>
          </div>
        </div>

        <CapturaFotoModal
          open={camaraAbierta}
          titulo={`Foto de ${form.nombre || "empleado"}`}
          guardando={subiendoFoto}
          onClose={() => setCamaraAbierta(false)}
          onCapturar={async (blob) => {
            if (!emp?.id) return;
            setSubiendoFoto(true);
            try {
              const url = await subirFotoEmpleado(emp.id, blob);
              set("foto_url", url);
              setCamaraAbierta(false);
            } catch (err) {
              onError?.(err);
            } finally {
              setSubiendoFoto(false);
            }
          }}
        />

        <div style={{ border: `1px solid ${form.nfc_uid ? C.greenB : C.b0}`, background: form.nfc_uid ? C.greenL : C.s0, borderRadius: 12, padding: 10, marginBottom: 10 }}>
          <label style={LBL}>Tarjeta NFC/RFID</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", border: `1px solid ${bridgeBorder}`, background: bridgeBg, borderRadius: 10, padding: "7px 8px", marginBottom: 8 }}>
            <span style={{ color: bridgeColor, fontSize: 10.5, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.5 }}>{bridgeLabel}</span>
            {nfcBridge.reader && <span style={{ color: C.t2, fontSize: 10.5 }}>{nfcBridge.reader}</span>}
            {nfcBridge.lastUid && <span style={{ color: C.t2, fontSize: 10.5, fontFamily: C.mono }}>Ultima {normalizeNfcUid(nfcBridge.lastUid).slice(-8)}</span>}
            {!bridgeOk && (
              <button type="button" onClick={nfcBridge.reconnect} style={{ ...BTN, marginLeft: "auto", padding: "5px 8px", color: bridgeColor, borderColor: bridgeBorder, fontSize: 10.5 }}>
                Reintentar
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input style={{ ...INP, width: "100%", fontFamily: C.mono, background: C.panelSolid }} value={form.nfc_uid} onChange={e => { set("nfc_uid", normalizeNfcUid(e.target.value)); setScanMsg(""); }} placeholder="Apoya la tarjeta o pega el UID" />
            <button type="button" onClick={() => { set("nfc_uid", ""); setScanMsg(""); }} style={{ ...BTN, whiteSpace: "nowrap" }}>Limpiar</button>
          </div>
          <div style={{ color: form.nfc_uid ? C.green : C.t2, fontSize: 11, lineHeight: 1.35, marginTop: 7 }}>
            {scanMsg || "Con el modal abierto, apoya la tarjeta. Si el puente local esta activo, el UID se completa solo."}
          </div>
        </div>

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

        {saveError && (
          <div role="alert" style={{ color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.28)", borderRadius: 9, padding: "8px 10px", marginBottom: 10, fontSize: 11.5, lineHeight: 1.4 }}>
            {saveError}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={guardar} disabled={saving || duplicadoActivoDetectado || !form.nombre.trim() || !/^\d{5,10}$/.test(form.dni)} style={{ ...BTN_PRIMARY, flex: 1, padding: "10px", opacity: saving || duplicadoActivoDetectado ? 0.55 : 1 }}>
            {saving ? "Guardando…" : reactivacionDetectada ? "Reactivar empleado" : "Guardar"}
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
