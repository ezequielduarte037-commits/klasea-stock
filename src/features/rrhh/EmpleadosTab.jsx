// Maestro de empleados: clasificación casa/contratista, flag "ficha",
// alta/edición, y administración de contratistas (jefes).
import { useCallback, useMemo, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import useNfcBridge from "@/features/panol/useNfcBridge";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { isMissingColumn, normalizeNfcUid, SEDES, subirFotoEmpleado } from "./api";
import { BTN, BTN_PRIMARY, GrupoBadge, INP, KpiCard, LBL, Td, Th } from "./ui";
import CapturaFotoModal from "@/components/CapturaFotoModal";
import { Camera, ImageUp } from "lucide-react";

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
  }, [empleados, q, filtroGrupo, filtroSede, verInactivos, verNoFichan]);

  const stats = useMemo(() => {
    const act = (empleados ?? []).filter(e => e.activo !== false);
    return {
      total: act.length,
      casa: act.filter(e => e.grupo === "casa").length,
      contr: act.filter(e => e.grupo === "contratista").length,
      sin: act.filter(e => e.grupo === "sin_asignar").length,
      noFichan: act.filter(e => e.ficha === false).length,
      conNfc: act.filter(e => normalizeNfcUid(e.nfc_uid)).length,
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
        <KpiCard label="NFC" value={stats.conNfc} color={C.green} sub="tarjetas asignadas" />
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
              <Th>Nombre</Th><Th>DNI</Th><Th>NFC</Th><Th>Sede</Th><Th>Grupo</Th><Th>Ficha</Th><Th>Estado</Th><Th> </Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(e => (
              <tr key={e.id} style={{ opacity: e.activo === false ? 0.5 : 1 }}>
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
    nfc_uid: emp.nfc_uid ?? "", foto_url: emp.foto_url ?? "",
  } : FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fotoInputRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
    const nfcUid = normalizeNfcUid(form.nfc_uid);
    const currentNfc = normalizeNfcUid(emp?.nfc_uid);
    const nfcChanged = nfcUid !== currentNfc;
    const auth = nfcChanged ? await supabase.auth.getUser() : null;
    const payload = {
      dni: form.dni.trim(), nombre: form.nombre.trim(), grupo: form.grupo,
      sede: form.sede || null,
      contratista_id: form.grupo === "contratista" && form.contratista_id ? form.contratista_id : null,
      ficha: form.ficha, activo: form.activo, notas: form.notas.trim() || null,
      nfc_uid: nfcUid || null,
      foto_url: form.foto_url.trim() || null,
      ...(nfcChanged ? { nfc_asignado_at: nfcUid ? new Date().toISOString() : null, nfc_asignado_por: auth?.data?.user?.id ?? null } : {}),
    };
    const res = emp
      ? await supabase.from("rrhh_empleados").update(payload).eq("id", emp.id)
      : await supabase.from("rrhh_empleados").insert(payload);
    setSaving(false);
    if (res.error) {
      onError?.(isMissingColumn(res.error) ? new Error("Falta correr la migracion NFC de RRHH antes de guardar tarjetas o fotos.") : res.error);
      return;
    }
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
