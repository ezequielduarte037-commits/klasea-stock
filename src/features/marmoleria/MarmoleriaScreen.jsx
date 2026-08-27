import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import {
  Gem, Download, History, CalendarClock, RotateCcw, AlertTriangle, Send,
  Inbox as InboxIcon, Ship, Table2,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// 👇 Ajustá esta ruta dependiendo de dónde guardes la imagen de Klase A en tu proyecto
import logoKlaseA from "@/assets/logos/logo-klasea.png";

import {
  MARM_CSS, T,
  DESMOLDES_DATA, GAP_POR_LINEA,
  fechaEstPlantilla, diasHastaPlantilla, diasDesde, bucketDesmolde,
  statsDePiezas, uniqueSorted, resolveSectorName, splitPiezas, fmtFecha,
  DEMORADA_DIAS,
} from "./marmShared";
import PiezaModal from "./PiezaModal";
import SqlModal from "./SqlModal";
import ActionInbox from "./ActionInbox";
import TimelineDesmoldes from "./TimelineDesmoldes";
import FleetBoard from "./FleetBoard";
import BoatDetail from "./BoatDetail";
import PlantillaView from "./PlantillaView";
import HistorialView from "./HistorialView";
import GeneralView from "./GeneralView";

// ── CENTRO DE CONTROL DE MARMOLERÍA ───────────────────────────────
export default function MarmoleriaScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const role    = profile?.role ?? "invitado";
  const isAdmin = hasAdminAccess(profile);
  const esAdmin = isAdmin || role === "oficina";

  // ── DATA ──────────────────────────────────────────────────────
  const [lineas,       setLineas]       = useState([]);
  const [unidadesAll,  setUnidadesAll]  = useState([]);   // todas las unidades activas (con linea_id)
  const [flotaPiezas,  setFlotaPiezas]  = useState([]);   // piezas de todas las unidades (para stats/inbox/timeline)
  const [piezas,       setPiezas]       = useState([]);   // checklist completo del barco seleccionado
  const [dashboard,    setDashboard]    = useState([]);   // datos para exportación PDF
  const [plantillaLinea, setPlantillaLinea] = useState([]);
  const [historialEnvios, setHistorialEnvios] = useState([]);

  // ── UI ────────────────────────────────────────────────────────
  // Vista: "centro" | "general" | "historial" | "plantilla"
  const [viewMode, setViewMode] = useState("centro");
  const [lineaId,  setLineaId]  = useState(null);
  const [unidadId, setUnidadId] = useState(null);
  const [mobileTab, setMobileTab] = useState("acciones"); // "acciones" | "flota"
  const [inboxFilter, setInboxFilter] = useState("todas");
  const [bucketFilter, setBucketFilter] = useState("todos");
  const [showPlanning, setShowPlanning] = useState(false);
  const [modalPieza, setModalPieza] = useState(null);
  const [showSQLModal, setShowSQLModal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [plantillaLoading, setPlantillaLoading] = useState(false);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [err, setErr] = useState("");

  // ── CARGA (consultas Supabase — mismas tablas y filtros) ──────
  async function cargarLineas() {
    const { data } = await supabase.from("marm_lineas").select("id,nombre").eq("activa",true).order("nombre");
    setLineas(data ?? []);
  }

  // Flota completa: unidades activas + todas sus piezas (stats, inbox, timeline)
  async function cargarFlota() {
    const { data: unidadesDB } = await supabase.from("marm_unidades").select("id, codigo, linea_id").eq("activa", true).order("codigo");
    const unidades = unidadesDB ?? [];
    setUnidadesAll(unidades);
    if (!unidades.length) { setFlotaPiezas([]); return; }
    const ids = unidades.map(u => u.id);
    const { data: piezasDB } = await supabase.from("marm_unidad_piezas")
      .select("id, unidad_id, pieza, sector, color, estado, prioridad, fecha_envio, fecha_regreso, observaciones, foto_ref, opcional")
      .in("unidad_id", ids);
    const porCodigo = Object.fromEntries(unidades.map(u => [u.id, u.codigo]));
    setFlotaPiezas((piezasDB ?? []).map(p => ({ ...p, codigo_barco: porCodigo[p.unidad_id] ?? "—" })));
  }

  async function cargarPiezas(uid) {
    setLoading(true);
    const { data, error } = await supabase
      .from("marm_unidad_piezas")
      .select("*")
      .eq("unidad_id", uid)
      .order("sector").order("created_at");
    if (error) setErr(error.message);
    setPiezas(data ?? []);
    setLoading(false);
  }

  // Datos para la exportación PDF (Enviado / Rehacer en toda la fábrica)
  async function cargarDashboardGeneral() {
    const { data: unidadesDB } = await supabase.from("marm_unidades").select("id, codigo").eq("activa", true);
    // Sin unidades activas la planilla esta vacia; antes se salia sin tocar el
    // estado y quedaba mostrando lo de la carga anterior.
    if (!unidadesDB?.length) { setDashboard([]); return []; }

    const idsUnidades = unidadesDB.map(u => u.id);
    const { data: piezasDB } = await supabase.from("marm_unidad_piezas")
      .select("*")
      .in("estado", ["Enviado", "Rehacer"])
      .in("unidad_id", idsUnidades)
      .order("fecha_envio", { ascending: false });

    const mapeadas = (piezasDB || []).map(p => {
      const u = unidadesDB.find(x => x.id === p.unidad_id);
      return { ...p, codigo_barco: u?.codigo || '-' };
    });

    setDashboard(mapeadas);
    // Se devuelve ademas de guardarse: el PDF necesita los datos ya, no en el
    // render siguiente.
    return mapeadas;
  }

  async function cargarHistorialEnvios() {
    setHistorialLoading(true);
    const { data: unidadesDB } = await supabase.from("marm_unidades").select("id, codigo, linea_id").eq("activa", true);
    const { data: lineasDB }   = await supabase.from("marm_lineas").select("id, nombre").eq("activa", true);
    const { data: piezas }     = await supabase.from("marm_unidad_piezas")
      .select("unidad_id, pieza, sector, color, fecha_envio, fecha_regreso, estado, observaciones")
      .not("fecha_envio","is",null)
      .order("fecha_envio", { ascending: true });
    const mapped = (piezas || []).map(p => {
      const u = (unidadesDB || []).find(x => x.id === p.unidad_id);
      const l = (lineasDB   || []).find(x => x.id === u?.linea_id);
      return { ...p, codigo_barco: u?.codigo ?? "—", linea: l?.nombre ?? "—" };
    });
    setHistorialEnvios(mapped);
    setHistorialLoading(false);
  }

  async function cargarPlantillaLinea(lid) {
    setPlantillaLoading(true);
    const { data } = await supabase
      .from("marm_linea_piezas")
      .select("*")
      .eq("linea_id", lid)
      .order("sector").order("orden");
    setPlantillaLinea(data ?? []);
    setPlantillaLoading(false);
  }

  useEffect(() => {
    cargarLineas();
    cargarFlota();
    cargarDashboardGeneral();
  }, []);

  useEffect(() => {
    if (lineaId) cargarPlantillaLinea(lineaId);
  }, [lineaId]);

  useEffect(() => {
    if (unidadId) cargarPiezas(unidadId);
    else setPiezas([]);
  }, [unidadId]);

  useEffect(() => {
    if (viewMode === "historial") cargarHistorialEnvios();
    // La planilla general se rearma al entrar, igual que el historial. Depender
    // solo del realtime la dejaba vieja cada vez que el canal no llegaba.
    if (viewMode === "general") cargarDashboardGeneral();
  }, [viewMode]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("rt-marm")
      .on("postgres_changes", { event:"*", schema:"public", table:"marm_unidad_piezas" }, () => {
        if (unidadId) cargarPiezas(unidadId);
        cargarFlota();
        cargarDashboardGeneral();
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [unidadId]);

  // ── DATOS DERIVADOS ───────────────────────────────────────────
  const unidadSel = useMemo(() => unidadesAll.find(u => u.id === unidadId), [unidadesAll, unidadId]);
  const lineaSel  = useMemo(() => lineas.find(l => l.id === lineaId),    [lineas, lineaId]);

  const piezasPorUnidad = useMemo(() => {
    const map = {};
    flotaPiezas.forEach(p => {
      if (!map[p.unidad_id]) map[p.unidad_id] = [];
      map[p.unidad_id].push(p);
    });
    return map;
  }, [flotaPiezas]);

  const statsPorUnidad = useMemo(() => {
    const map = {};
    unidadesAll.forEach(u => { map[u.id] = statsDePiezas(piezasPorUnidad[u.id] ?? []); });
    return map;
  }, [unidadesAll, piezasPorUnidad]);

  const flotaPorCodigo = useMemo(() => {
    const map = {};
    unidadesAll.forEach(u => { map[u.codigo] = statsPorUnidad[u.id]; });
    return map;
  }, [unidadesAll, statsPorUnidad]);

  const unidadesPorLinea = useMemo(() => {
    const map = {};
    unidadesAll.forEach(u => {
      if (!map[u.linea_id]) map[u.linea_id] = [];
      map[u.linea_id].push(u);
    });
    return map;
  }, [unidadesAll]);

  const desmoldesRows = useMemo(() =>
    DESMOLDES_DATA.map(d => {
      const gap = GAP_POR_LINEA[d.linea] ?? 128;
      const estStr = fechaEstPlantilla(d.desmolde, d.linea).toISOString().split("T")[0];
      const dias = diasHastaPlantilla(d.desmolde, d.linea);
      const tieneTemplates = !!flotaPorCodigo[d.barco]?.primerEnvio;
      return { ...d, gap, estStr, dias, tieneTemplates, bucket: bucketDesmolde(dias, tieneTemplates) };
    }).sort((a, b) => a.dias - b.dias),
  [flotaPorCodigo]);

  const desmoldePorCodigo = useMemo(
    () => Object.fromEntries(desmoldesRows.map(r => [r.barco, r])),
  [desmoldesRows]);

  // ── NAVEGACIÓN ────────────────────────────────────────────────
  const seleccionarBarco = useCallback((u) => {
    setLineaId(u.linea_id);
    setUnidadId(u.id);
    setViewMode(v => v === "centro" ? v : "centro");
  }, []);

  function cerrarDetalle() {
    setUnidadId(null);
  }

  function verPlantilla(linea) {
    setUnidadId(null);
    setLineaId(linea.id);
    setViewMode("plantilla");
  }

  function irACentro() {
    setViewMode("centro");
  }

  function irAHistorial() {
    setUnidadId(null);
    setViewMode("historial");
  }

  function irAGeneral() {
    setUnidadId(null);
    setLineaId(null);
    setViewMode("general");
  }

  function filtrarInbox(kind) {
    setViewMode("centro");
    setInboxFilter(kind);
    if (isMobile) { setUnidadId(null); setMobileTab("acciones"); }
  }

  // ── BANDEJA DE ACCIONES ───────────────────────────────────────
  const inbox = useMemo(() => {
    const items = [];
    const abrirBarcoPorCodigo = (codigo) => () => {
      const u = unidadesAll.find(x => x.codigo === codigo);
      if (u) seleccionarBarco(u);
    };

    // 1. Plantillas a pedir ahora
    desmoldesRows.filter(r => r.bucket === "ahora").forEach(r => {
      items.push({
        id:`pedir-${r.barco}`, kind:"pedir",
        color:"var(--red)", icon:<CalendarClock size={14} />,
        titulo:`Pedir plantillas — ${r.barco}`,
        detalle:`${r.linea} · est. ${fmtFecha(r.estStr)} (desmolde ${fmtFecha(r.desmolde)})`,
        meta: r.dias > 0 ? `${r.dias}d` : r.dias === 0 ? "Hoy" : `${Math.abs(r.dias)}d atrás`,
        onOpen: abrirBarcoPorCodigo(r.barco),
      });
    });

    // 2. Piezas a rehacer
    flotaPiezas.filter(p => p.estado === "Rehacer").forEach(p => {
      items.push({
        id:`rehacer-${p.id}`, kind:"rehacer",
        color:"var(--red)", icon:<RotateCcw size={14} />,
        titulo:`Rehacer: ${p.pieza}`,
        detalle:`${p.codigo_barco} · ${p.sector}${p.observaciones ? ` — ${p.observaciones}` : ""}`,
        meta:null,
        onOpen: () => setModalPieza(p),
      });
    });

    // 3. Enviadas demoradas (sin regreso hace más de DEMORADA_DIAS días)
    flotaPiezas
      .filter(p => p.estado === "Enviado" && diasDesde(p.fecha_envio) > DEMORADA_DIAS)
      .sort((a, b) => diasDesde(b.fecha_envio) - diasDesde(a.fecha_envio))
      .forEach(p => {
        const d = diasDesde(p.fecha_envio);
        items.push({
          id:`demorada-${p.id}`, kind:"demorada",
          color:"var(--amber)", icon:<AlertTriangle size={14} />,
          titulo:`Demorada hace ${d}d: ${p.pieza}`,
          detalle:`${p.codigo_barco} · ${p.sector} · enviada ${fmtFecha(p.fecha_envio)}`,
          meta:`${d}d`,
          onOpen: () => setModalPieza(p),
        });
      });

    // 4. Pedidos próximos (31–60 días)
    desmoldesRows.filter(r => r.bucket === "proximos").forEach(r => {
      items.push({
        id:`proximo-${r.barco}`, kind:"proximo",
        color:"var(--amber)", icon:<CalendarClock size={14} />,
        titulo:`Preparar pedido — ${r.barco}`,
        detalle:`${r.linea} · est. ${fmtFecha(r.estStr)}`,
        meta:`${r.dias}d`,
        onOpen: abrirBarcoPorCodigo(r.barco),
      });
    });

    return items;
  }, [desmoldesRows, flotaPiezas, unidadesAll, seleccionarBarco]);

  const inboxCounts = useMemo(() => {
    const c = {};
    inbox.forEach(i => { c[i.kind] = (c[i.kind] ?? 0) + 1; });
    return c;
  }, [inbox]);

  // Señales globales (las 5 preguntas del centro de control)
  const signals = useMemo(() => ({
    pedir:       desmoldesRows.filter(r => r.bucket === "ahora").length,
    demoradas:   flotaPiezas.filter(p => p.estado === "Enviado" && diasDesde(p.fecha_envio) > DEMORADA_DIAS).length,
    enMarmoleria: flotaPiezas.filter(p => p.estado === "Enviado").length,
    rehacer:     flotaPiezas.filter(p => p.estado === "Rehacer").length,
  }), [desmoldesRows, flotaPiezas]);

  const sectoresBarco = useMemo(() => uniqueSorted(piezas.map(p => p.sector)), [piezas]);
  const sectoresPlantilla = useMemo(() => uniqueSorted(plantillaLinea.map(p => p.sector)), [plantillaLinea]);
  const sectoresSugeridos = useMemo(
    () => uniqueSorted([...sectoresPlantilla, ...sectoresBarco]),
    [sectoresPlantilla, sectoresBarco]
  );

  // ── ACCIONES ──────────────────────────────────────────────────
  async function crearLinea(nombre) {
    if (!nombre?.trim()) return;
    const { error } = await supabase.from("marm_lineas").insert({ nombre: nombre.trim().toUpperCase() });
    if (error) return setErr(error.message);
    cargarLineas();
  }

  async function eliminarLinea(lid) {
    if (!window.confirm("¿Eliminar esta línea y todos sus barcos?")) return;
    await supabase.from("marm_lineas").update({ activa:false }).eq("id", lid);
    if (lineaId === lid) { setLineaId(null); setUnidadId(null); if (viewMode === "plantilla") setViewMode("centro"); }
    cargarLineas();
    cargarFlota();
  }

  async function guardarEditLinea(id, nombre) {
    if (!nombre?.trim()) return;
    await supabase.from("marm_lineas").update({ nombre: nombre.trim().toUpperCase() }).eq("id", id);
    cargarLineas();
  }

  async function borrarUnidadReal(uid) {
    const piezas = await supabase.from("marm_unidad_piezas").delete().eq("unidad_id", uid);
    if (piezas.error) return piezas.error;

    const unidad = await supabase.from("marm_unidades").delete().eq("id", uid);
    return unidad.error;
  }

  async function insertarUnidadNueva(lid, codigo) {
    return supabase
      .from("marm_unidades")
      .insert({ linea_id: lid, codigo })
      .select("id,codigo,linea_id,activa")
      .single();
  }

  async function crearUnidad(lid, codigoRaw) {
    const codigo = codigoRaw?.trim();
    if (!codigo || !lid) return;
    setErr("");

    let { data: u, error } = await supabase
      .from("marm_unidades")
      .select("id,codigo,linea_id,activa")
      .eq("linea_id", lid)
      .eq("codigo", codigo)
      .maybeSingle();
    if (error) return setErr(error.message);

    if (u?.activa === false) {
      const borrarError = await borrarUnidadReal(u.id);
      if (borrarError) return setErr(borrarError.message);
      u = null;
    }

    if (u) {
      seleccionarBarco(u);
      return setErr(`Ya existe un barco con codigo "${codigo}" en esta linea.`);
    }

    let ins = await insertarUnidadNueva(lid, codigo);
    if (ins.error) {
      if (ins.error.code === "23505") {
        const retry = await supabase
          .from("marm_unidades")
          .select("id,codigo,linea_id,activa")
          .eq("linea_id", lid)
          .eq("codigo", codigo)
          .maybeSingle();
        if (retry.error) return setErr(ins.error.message);
        if (retry.data?.activa === false) {
          const borrarError = await borrarUnidadReal(retry.data.id);
          if (borrarError) return setErr(borrarError.message);
          ins = await insertarUnidadNueva(lid, codigo);
        } else if (retry.data) {
          seleccionarBarco(retry.data);
          return setErr(`Ya existe un barco con codigo "${codigo}" en esta linea.`);
        }
      }
      if (ins.error) {
        return setErr(ins.error.message);
      }
    }
    u = ins.data;

    // 2. Copiar plantilla de la línea automáticamente
    const { data: plantilla } = await supabase
      .from("marm_linea_piezas")
      .select("*")
      .eq("linea_id", lid)
      .order("orden");

    if (plantilla?.length) {
      const { data: piezasExistentes, error: piezasError } = await supabase
        .from("marm_unidad_piezas")
        .select("pieza_id")
        .eq("unidad_id", u.id)
        .not("pieza_id", "is", null);
      if (piezasError) return setErr(piezasError.message);

      const existentes = new Set((piezasExistentes ?? []).map(p => p.pieza_id));
      const inserts = plantilla.filter(p => !existentes.has(p.id)).map(p => ({
        unidad_id: u.id,
        pieza_id:  p.id,
        pieza:     p.pieza,
        sector:    p.sector,
        opcional:  p.opcional,
        estado:    "Pendiente",
      }));
      if (inserts.length) {
        const { error: insertPiezasError } = await supabase.from("marm_unidad_piezas").insert(inserts);
        if (insertPiezasError) return setErr(insertPiezasError.message);
      }
    }

    await cargarFlota();
    seleccionarBarco(u);
  }

  async function eliminarUnidad(uid) {
    if (!window.confirm("¿Eliminar este barco y su checklist?")) return;
    setErr("");
    const error = await borrarUnidadReal(uid);
    if (error) return setErr(error.message);
    if (unidadId === uid) {
      setUnidadId(null);
      setPiezas([]);
    }
    cargarFlota();
    cargarDashboardGeneral();
  }

  async function guardarEditUnidad(id, codigoRaw) {
    const codigo = codigoRaw?.trim();
    if (!codigo) return;
    const unidad = unidadesAll.find(x => x.id === id);
    const lid = unidad?.linea_id ?? lineaId;
    setErr("");
    const { data: existente, error: existeError } = await supabase
      .from("marm_unidades")
      .select("id")
      .eq("linea_id", lid)
      .eq("codigo", codigo)
      .neq("id", id)
      .maybeSingle();
    if (existeError) return setErr(existeError.message);
    if (existente) return setErr(`Ya existe un barco con codigo "${codigo}" en esta linea.`);

    const { error } = await supabase.from("marm_unidades").update({ codigo }).eq("id", id);
    if (error) return setErr(error.message);
    cargarFlota();
  }

  async function eliminarPiezaPlantilla(piezaId) {
    if (!window.confirm("¿Quitar esta pieza de la plantilla? No afecta barcos existentes.")) return;
    await supabase.from("marm_linea_piezas").delete().eq("id", piezaId);
    setPlantillaLinea(prev => prev.filter(p => p.id !== piezaId));
  }

  async function agregarPiezaDirectaPlantilla(form) {
    const piezasNuevas = splitPiezas(form.pieza);
    const sector = resolveSectorName(form.sector, sectoresPlantilla);
    if (!piezasNuevas.length || !sector || !lineaId) return;
    const payload = piezasNuevas.map((pieza, idx) => ({
      linea_id: lineaId,
      pieza,
      sector,
      opcional: form.opcional,
      orden: plantillaLinea.length + idx + 1,
    }));
    const { data, error } = await supabase.from("marm_linea_piezas").insert(payload).select();
    if (error) return setErr(error.message);
    setPlantillaLinea(prev => [...prev, ...(data ?? [])].sort((a,b) => (a.sector+a.pieza).localeCompare(b.sector+b.pieza)));
  }

  async function editarPiezaPlantilla(id, form) {
    const sector = resolveSectorName(form.sector, sectoresPlantilla);
    if (!form.pieza.trim() || !sector) return;
    const upd = {
      pieza:    form.pieza.trim(),
      sector,
      opcional: form.opcional,
    };
    const { error } = await supabase.from("marm_linea_piezas").update(upd).eq("id", id);
    if (error) return setErr(error.message);
    setPlantillaLinea(prev => prev.map(p => p.id === id ? { ...p, ...upd } : p));
  }

  async function setEstado(piezaId, estado) {
    // Si cambia a Recibido y no tiene fecha_regreso, poner hoy
    const upd = { estado };
    if (estado === "Recibido") upd.fecha_regreso = upd.fecha_regreso || new Date().toISOString().slice(0,10);
    if (estado === "Enviado")  upd.fecha_envio   = upd.fecha_envio   || new Date().toISOString().slice(0,10);
    const { error } = await supabase.from("marm_unidad_piezas").update(upd).eq("id", piezaId);
    if (error) { setErr("No se pudo cambiar el estado: " + error.message); return; }
    setPiezas(prev => prev.map(p => p.id === piezaId ? {...p, ...upd} : p));
    // Marcar una pieza como Enviada cambia la planilla general y el PDF, que
    // salen de otra consulta. Sin esto se actualizaba solo el checklist del
    // barco y la planilla seguia mostrando lo de cuando se abrio la pantalla:
    // se hacian los envios y no aparecian. guardarDetalle ya lo hacia; esto no.
    cargarFlota();
    cargarDashboardGeneral();
  }

  async function guardarDetalle(piezaId, form) {
    // Convertir strings vacíos a null para columnas date
    const formLimpio = {
      ...form,
      fecha_envio:   form.fecha_envio   || null,
      fecha_regreso: form.fecha_regreso || null,
      observaciones: form.observaciones || null,
      foto_ref:      form.foto_ref      || null,
    };

    const { data, error } = await supabase
      .from("marm_unidad_piezas")
      .update(formLimpio)
      .eq("id", piezaId)
      .select()
      .single();

    if (error) { setErr("Error al guardar: " + error.message); return; }

    setPiezas(prev => prev.map(p => p.id === piezaId ? { ...p, ...(data ?? formLimpio) } : p));
    cargarFlota();
    cargarDashboardGeneral();
  }

  async function cambiarColorSector(sector, nuevoColor) {
    const piezasSector = piezas.filter(p => p.sector === sector);
    const ids = piezasSector.map(p => p.id);
    if (!ids.length) return;

    // Actualizar visualmente al instante
    setPiezas(prev => prev.map(p => p.sector === sector ? { ...p, color: nuevoColor } : p));

    // Actualizar en la base de datos
    const { error } = await supabase
      .from("marm_unidad_piezas")
      .update({ color: nuevoColor })
      .in("id", ids);

    if (error) {
      setErr("Error al actualizar el color: " + error.message);
      cargarPiezas(unidadId); // Revierte en caso de error
    }
  }

  async function agregarPiezaManual(form) {
    const piezasNuevas = splitPiezas(form.pieza);
    const sector = resolveSectorName(form.sector, sectoresBarco);
    if (!piezasNuevas.length || !sector || !unidadId) return;
    const { error } = await supabase.from("marm_unidad_piezas").insert(
      piezasNuevas.map((pieza) => ({
        unidad_id: unidadId,
        pieza,
        sector,
        estado: "Pendiente",
      }))
    );
    if (error) return setErr(error.message);
    cargarPiezas(unidadId);
  }

  async function eliminarPieza(piezaId) {
    if (!window.confirm("¿Quitar esta pieza del checklist?")) return;
    await supabase.from("marm_unidad_piezas").delete().eq("id", piezaId);
    setPiezas(prev => prev.filter(p => p.id !== piezaId));
  }

  // Agregar a la plantilla general de la línea
  async function agregarPiezaAPlantilla(form) {
    const piezasNuevas = splitPiezas(form.pieza);
    const sector = resolveSectorName(form.sector, sectoresSugeridos);
    if (!piezasNuevas.length || !sector || !lineaId) return;
    const { data: lps, error } = await supabase.from("marm_linea_piezas").insert(
      piezasNuevas.map((pieza, idx) => ({
        linea_id: lineaId,
        pieza,
        sector,
        orden: plantillaLinea.length + idx + 1,
      }))
    ).select();
    if (error) return setErr(error.message);

    if (unidadId && lps?.length) {
      await supabase.from("marm_unidad_piezas").insert(lps.map((lp) => ({
        unidad_id: unidadId,
        pieza_id:  lp.id,
        pieza:     lp.pieza,
        sector:    lp.sector,
        estado:    "Pendiente",
      })));
    }
    if (lps?.length) {
      setPlantillaLinea(prev => [...prev, ...lps].sort((a,b) => (a.sector+a.pieza).localeCompare(b.sector+b.pieza)));
    }
    if (unidadId) cargarPiezas(unidadId);
  }

  // ── EXPORTACIÓN GLOBAL A PDF CON LOGO ─────────────────────────────
  async function exportarPDFGeneral() {
    setIsExporting(true);
    try {
      // Se relee antes de generar: un PDF con datos viejos no se nota hasta que
      // alguien lo imprime y sale mal.
      const datos = await cargarDashboardGeneral();
      if (!datos.length) {
        alert("No hay piezas enviadas en ninguna de las obras para exportar.");
        setIsExporting(false);
        return;
      }

      const doc = new jsPDF();
      const anchoHoja = doc.internal.pageSize.getWidth();
      const altoHoja = doc.internal.pageSize.getHeight();
      const MARGEN = 14;
      const PIE = 16;

      const img = new Image();
      img.src = logoKlaseA;
      await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });

      // Sin el parametro de compresion jsPDF guarda el PNG crudo y el reporte
      // pesa 6 MB por un logo de 59 KB. Medido: 6.00 MB -> 74 KB.
      const encabezado = () => {
        doc.addImage(img, "PNG", MARGEN, 12, 45, 15, undefined, "FAST");
        doc.setFontSize(15);
        doc.setTextColor(14, 18, 28);
        doc.text("Reporte de Marmolería", MARGEN, 36);
        doc.setFontSize(9);
        doc.setTextColor(120, 128, 140);
        doc.text(`Generado ${new Date().toLocaleDateString("es-AR")}`, MARGEN, 41.5);
      };
      encabezado();

      // Agrupado por obra. Cada una se dibuja como su propia tabla para poder
      // decidir si entra en lo que queda de hoja o arranca en la siguiente: una
      // obra partida al medio es justo lo que hace confuso el reporte.
      const porObra = new Map();
      for (const p of datos) {
        const obra = p.codigo_barco || "Sin obra";
        porObra.set(obra, [...(porObra.get(obra) ?? []), p]);
      }
      const obras = [...porObra.entries()].sort((a, b) => a[0].localeCompare(b[0]));

      const ALTO_TITULO = 11;
      const ALTO_CABECERA = 8;
      const ALTO_RENGLON = 4.1;   // un renglon de texto a 9.5pt
      const RELLENO_FILA = 4.4;   // el padding de arriba y abajo
      const ANCHO_PIEZA = 50;
      const ANCHO_PIEDRA = anchoHoja - MARGEN * 2 - (34 + 50 + 22 + 22);
      let y = 50;

      /** Alto real de una fila, contando lo que se parta en varios renglones. */
      const altoDeFila = (pieza, piedra) => {
        doc.setFontSize(9.5);
        const renglones = Math.max(
          doc.splitTextToSize(String(pieza || "-"), ANCHO_PIEZA - 7).length,
          doc.splitTextToSize(String(piedra || "-"), ANCHO_PIEDRA - 7).length,
          1,
        );
        return renglones * ALTO_RENGLON + RELLENO_FILA;
      };

      obras.forEach(([obra, piezasDeObra], indice) => {
        const piezas = [...piezasDeObra].sort((a, b) => {
          const s = (a.sector || "").localeCompare(b.sector || "");
          return s !== 0 ? s : (a.pieza || "").localeCompare(b.pieza || "");
        });

        const alto = ALTO_TITULO + ALTO_CABECERA + piezas.reduce(
          (total, p) => total + altoDeFila(p.pieza, p.color || p.sector_color),
          0,
        );
        const espacioLibre = altoHoja - PIE - y;
        // Si no entra entera y no estamos recien empezando la hoja, se pasa a la
        // siguiente. Una obra corta nunca queda cortada; una muy larga se parte
        // igual, pero arranca limpia arriba de una hoja.
        if (alto > espacioLibre && y > 50) {
          doc.addPage();
          y = 20;
        } else if (indice > 0) {
          y += 6;
        }

        // Barra de la obra: lo unico fuerte del reporte.
        doc.setFillColor(14, 18, 28);
        doc.rect(MARGEN, y, anchoHoja - MARGEN * 2, ALTO_TITULO, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11.5);
        doc.text(obra, MARGEN + 3.5, y + 7.6);
        doc.setFontSize(8.5);
        doc.setTextColor(190, 198, 210);
        const pendientes = piezas.length;
        const rehacer = piezas.filter((p) => p.estado === "Rehacer").length;
        doc.text(
          `${pendientes} pieza${pendientes === 1 ? "" : "s"}${rehacer ? ` · ${rehacer} a rehacer` : ""}`,
          anchoHoja - MARGEN - 3.5,
          y + 7.4,
          { align: "right" },
        );
        y += ALTO_TITULO;

        // El area se escribe solo cuando cambia: separa sin cortar la lectura.
        // La piedra va en TODAS las filas porque dentro de una misma area puede
        // haber piezas de piedras distintas, y ahi el dato importa por pieza.
        let areaAnterior = "";
        const filas = piezas.map((p) => {
          const area = String(p.sector || "").trim();
          const abre = area !== areaAnterior;
          if (abre) areaAnterior = area;
          return [
            abre ? (area || "—") : "",
            p.pieza || "-",
            p.fecha_envio ? p.fecha_envio.split("-").reverse().join("/") : "-",
            p.estado,
            p.color || p.sector_color || "-",
          ];
        });
        const abrenArea = new Set();
        let previa = "";
        piezas.forEach((p, i) => {
          const area = String(p.sector || "").trim();
          if (area !== previa) { previa = area; abrenArea.add(i); }
        });

        autoTable(doc, {
          startY: y,
          margin: { left: MARGEN, right: MARGEN, top: 20, bottom: PIE },
          rowPageBreak: "avoid",
          head: [["Área", "Pieza", "Enviada", "Estado", "Piedra"]],
          body: filas,
          theme: "plain",
          styles: { fontSize: 9.5, valign: "middle", overflow: "linebreak", cellPadding: { top: 2.2, bottom: 2.2, left: 3.5, right: 3 } },
          headStyles: { fillColor: [240, 243, 247], textColor: [90, 98, 110], fontSize: 8.5, fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: 34, fontStyle: "bold" },
            1: { cellWidth: 50 },
            2: { cellWidth: 22 },
            3: { cellWidth: 22 },
            4: { cellWidth: ANCHO_PIEDRA },
          },
          didParseCell: (data) => {
            if (data.section !== "body") return;
            // Filete finito arriba de cada area: alcanza para separarlas.
            if (abrenArea.has(data.row.index) && data.row.index > 0) {
              data.cell.styles.lineWidth = { top: 0.15 };
              data.cell.styles.lineColor = [220, 226, 234];
            }
            // Rehacer es lo unico que exige una accion.
            if (data.column.index === 3 && String(data.cell.raw) === "Rehacer") {
              data.cell.styles.textColor = [168, 50, 63];
              data.cell.styles.fontStyle = "bold";
            }
            if (data.column.index === 4) data.cell.styles.textColor = [110, 118, 130];
          },
          didDrawPage: (data) => {
            // El encabezado solo va en la primera; en las de continuacion basta
            // el numero de pagina para no comerse media hoja.
            if (data.pageNumber > 1 || doc.getNumberOfPages() > 1) {
              doc.setFontSize(8);
              doc.setTextColor(150, 156, 166);
              doc.text(
                `Marmolería · ${new Date().toLocaleDateString("es-AR")}`,
                MARGEN,
                altoHoja - 8,
              );
              doc.text(`${doc.getCurrentPageInfo().pageNumber}`, anchoHoja - MARGEN, altoHoja - 8, { align: "right" });
            }
          },
        });
        y = doc.lastAutoTable.finalY;
      });

      doc.save(`Marmoleria_${new Date().toLocaleDateString("es-AR").replace(/\//g, "-")}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Hubo un error al generar el PDF.");
    } finally {
      setIsExporting(false);
    }
  }

  // ── RENDER ────────────────────────────────────────────────────
  const enCentro = viewMode === "centro";
  const mostrarDetalle = !!unidadSel;

  return (
    <div style={{ background:"var(--bg)", position:"fixed", inset:0, overflow:"hidden", color:"var(--text)", fontFamily:T.sans }}>
      <style>{MARM_CSS}</style>

      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", height:"100vh", overflow:"hidden", position:"relative", zIndex:1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }}>

          <div style={{
            minHeight:52, background:"var(--panel-solid)", borderBottom:"1px solid var(--border)",
            padding:isMobile ? "8px 12px 8px 52px" : "8px 20px",
            display:"flex", alignItems:"center", gap:14, flexShrink:0, flexWrap:"wrap",
          }}>
            <button
              onClick={() => { irACentro(); cerrarDetalle(); }}
              style={{
                display:"flex", alignItems:"center", gap:8, flexShrink:0,
                padding:0, border:0, background:"transparent", color:"var(--text)",
                cursor:"pointer", fontFamily:T.sans,
              }}
            >
              <Gem size={16} style={{ color:"var(--blue)" }} />
              <span style={{ fontSize:15, fontWeight:700, letterSpacing:-0.2 }}>Marmolería</span>
            </button>

            {!isMobile && enCentro && (
              <div style={{
                display:"flex", alignItems:"center", gap:12,
                paddingLeft:14, borderLeft:"1px solid var(--border)",
              }}>
                {[
                  {
                    key:"pedir", value:signals.pedir, label:"por pedir",
                    color:signals.pedir > 0 ? "var(--red)" : "var(--dim)",
                    icon:<CalendarClock size={11} />, onClick:() => filtrarInbox("pedir"),
                  },
                  {
                    key:"demoradas", value:signals.demoradas, label:"demoradas",
                    color:signals.demoradas > 0 ? "var(--amber)" : "var(--dim)",
                    icon:<AlertTriangle size={11} />, onClick:() => filtrarInbox("demorada"),
                  },
                  {
                    key:"enviadas", value:signals.enMarmoleria, label:"en marmolería",
                    color:signals.enMarmoleria > 0 ? "var(--blue)" : "var(--dim)",
                    icon:<Send size={11} />, onClick:() => {},
                  },
                  {
                    key:"rehacer", value:signals.rehacer, label:"a rehacer",
                    color:signals.rehacer > 0 ? "var(--red)" : "var(--dim)",
                    icon:<RotateCcw size={11} />, onClick:() => filtrarInbox("rehacer"),
                  },
                ].map(signal => (
                  <button
                    key={signal.key}
                    onClick={signal.onClick}
                    style={{
                      display:"inline-flex", alignItems:"center", gap:4,
                      padding:0, border:0, background:"transparent", cursor:"pointer",
                      color:signal.color, fontFamily:T.sans, fontSize:11,
                    }}
                  >
                    {signal.icon}
                    <strong style={{ fontFamily:T.mono }}>{signal.value}</strong>
                    <span style={{ color:"var(--dim)" }}>{signal.label}</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ flex:1 }} />

            <button onClick={irAGeneral} className="mrm-btn-ghost" style={{
              display:"flex", alignItems:"center", gap:6,
              border:`1px solid ${viewMode === "general" ? "var(--blue-border)" : "var(--border)"}`,
              background:viewMode === "general" ? "var(--blue-soft)" : "transparent",
              color:viewMode === "general" ? "var(--blue)" : "var(--muted)",
              padding:"6px 10px", borderRadius:7, cursor:"pointer", fontFamily:T.sans, fontSize:12, transition:"all 0.15s" }}>
              <Table2 size={13} /> {!isMobile && "Planilla general"}
            </button>
            <button onClick={irAHistorial} className="mrm-btn-ghost" style={{
              display:"flex", alignItems:"center", gap:6,
              border:`1px solid ${viewMode === "historial" ? "var(--blue-border)" : "var(--border)"}`,
              background: viewMode === "historial" ? "var(--blue-soft)" : "transparent",
              color: viewMode === "historial" ? "var(--blue)" : "var(--muted)",
              padding:"6px 10px", borderRadius:7, cursor:"pointer", fontFamily:T.sans, fontSize:12, transition:"all 0.15s" }}>
              <History size={13} /> {!isMobile && "Historial"}
            </button>
            <button onClick={exportarPDFGeneral} disabled={isExporting} className="mrm-btn-ghost" style={{
              display:"flex", alignItems:"center", gap:6,
              border:"1px solid var(--border)", background:"transparent",
              color:"var(--muted)", padding:"6px 10px", borderRadius:7, cursor:"pointer",
              fontFamily:T.sans, fontSize:12, fontWeight:700, transition:"opacity 0.15s",
              opacity: isExporting ? 0.6 : 1 }}>
              <Download size={13} /> {isMobile ? "" : (isExporting ? "Generando…" : "Exportar PDF")}
            </button>
          </div>

          {/* ── TABS MOBILE (centro) ── */}
          {isMobile && enCentro && !mostrarDetalle && (
            <div style={{ display:"flex", gap:6, padding:"8px 12px", borderBottom:"1px solid var(--border)", background:"var(--panel-solid)", flexShrink:0 }}>
              {[
                { key:"acciones", label:`Acciones${inbox.length ? ` (${inbox.length})` : ""}`, icon:<InboxIcon size={13} /> },
                { key:"flota",    label:"Flota y timeline",   icon:<Ship size={13} /> },
              ].map(t => (
                <button key={t.key} onClick={() => setMobileTab(t.key)} style={{
                  flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                  padding:"8px", borderRadius:8, cursor:"pointer", fontFamily:T.sans, fontSize:12,
                  fontWeight: mobileTab === t.key ? 700 : 400,
                  border: mobileTab === t.key ? "1px solid var(--blue-border)" : "1px solid var(--border)",
                  background: mobileTab === t.key ? "var(--blue-soft)" : "transparent",
                  color: mobileTab === t.key ? "var(--blue)" : "var(--dim)",
                }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          )}

          {/* ── CUERPO ── */}
          {enCentro ? (
            <div style={{ flex:1, overflow:"hidden", display:"grid", minHeight:0,
              gridTemplateColumns: isMobile
                ? "1fr"
                : mostrarDetalle ? "minmax(0, 1fr) minmax(400px, 460px)" : "minmax(0, 1fr) 310px" }}>

              {/* Bandeja de acciones */}
              <div style={{
                gridColumn:isMobile ? "auto" : 2,
                gridRow:isMobile ? "auto" : 1,
                borderLeft:isMobile ? "none" : "1px solid var(--border)",
                background:"var(--panel-solid)",
                overflow:"hidden",
                display:(isMobile && (mobileTab !== "acciones" || mostrarDetalle)) || (!isMobile && mostrarDetalle) ? "none" : "block",
              }}>
                <ActionInbox items={inbox} filter={inboxFilter} onFilterChange={setInboxFilter} counts={inboxCounts} />
              </div>

              {/* Canvas central: timeline + flota */}
              <div style={{
                gridColumn:isMobile ? "auto" : 1,
                gridRow:isMobile ? "auto" : 1,
                overflowY:"auto", padding:isMobile ? "14px 12px" : "18px 22px 24px",
                display: isMobile && (mobileTab !== "flota" || mostrarDetalle) ? "none" : "block",
              }}>
                {err && !mostrarDetalle && (
                  <div style={{ padding:"9px 13px", borderRadius:9, background:"var(--red-soft)",
                    border:"1px solid var(--red-border)", color:"var(--red)", fontSize:13, marginBottom:14,
                    display:"flex", alignItems:"center", gap:8 }}>
                    <AlertTriangle size={14} /> {err}
                  </div>
                )}
                <div style={{
                  display:"flex", alignItems:"center", justifyContent:"flex-end",
                  marginBottom:showPlanning ? 12 : 8,
                }}>
                  <button
                    onClick={() => setShowPlanning(value => !value)}
                    className="mrm-btn-ghost"
                    style={{
                      display:"inline-flex", alignItems:"center", gap:6,
                      padding:"5px 9px", borderRadius:7, cursor:"pointer",
                      border:"1px solid var(--border)", background:showPlanning ? "var(--panel-2)" : "transparent",
                      color:showPlanning ? "var(--text)" : "var(--muted)",
                      fontFamily:T.sans, fontSize:11,
                    }}
                  >
                    <CalendarClock size={12} />
                    {showPlanning ? "Ocultar planificación" : "Ver planificación"}
                  </button>
                </div>

                {showPlanning && (
                  <div style={{ marginBottom:22, animation:"mrmFade .15s ease" }}>
                    <TimelineDesmoldes
                      rows={desmoldesRows}
                      flotaPorCodigo={flotaPorCodigo}
                      onOpenBoat={(codigo) => {
                        const unidad = unidadesAll.find(item => item.codigo === codigo);
                        if (unidad) seleccionarBarco(unidad);
                      }}
                      bucketFilter={bucketFilter}
                      onBucketFilter={setBucketFilter}
                    />
                  </div>
                )}

                <FleetBoard
                  lineas={lineas}
                  unidadesPorLinea={unidadesPorLinea}
                  statsPorUnidad={statsPorUnidad}
                  desmoldePorCodigo={desmoldePorCodigo}
                  selectedId={unidadId}
                  onSelectBoat={seleccionarBarco}
                  esAdmin={esAdmin}
                  onVerPlantilla={verPlantilla}
                  onCreateLinea={crearLinea}
                  onRenameLinea={guardarEditLinea}
                  onDeleteLinea={eliminarLinea}
                  onCreateUnidad={crearUnidad}
                />
              </div>

              {/* Detalle contextual del barco */}
              {mostrarDetalle && !isMobile && (
                <div style={{ gridColumn:2, gridRow:1, borderLeft:"1px solid var(--border)", overflow:"hidden", animation:"mrmSlideIn .18s ease" }}>
                  <BoatDetail
                    key={unidadSel.id}
                    unidad={unidadSel}
                    lineaNombre={lineaSel?.nombre ?? ""}
                    piezas={piezas}
                    loading={loading}
                    err={err}
                    esAdmin={esAdmin}
                    isMobile={false}
                    onBack={cerrarDetalle}
                    onClose={cerrarDetalle}
                    onVerPlantilla={() => lineaSel && verPlantilla(lineaSel)}
                    onRenameUnidad={guardarEditUnidad}
                    onDeleteUnidad={eliminarUnidad}
                    onSetEstado={setEstado}
                    onOpenPieza={setModalPieza}
                    onDeletePieza={eliminarPieza}
                    onCambiarColorSector={cambiarColorSector}
                    onAddPieza={agregarPiezaManual}
                    onAddPiezaPlantilla={agregarPiezaAPlantilla}
                    sectoresSugeridos={sectoresSugeridos}
                  />
                </div>
              )}
            </div>
          ) : viewMode === "general" ? (
            <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
              <GeneralView
                dashboard={dashboard}
                isMobile={isMobile}
                onBack={irACentro}
                onOpenPieza={setModalPieza}
              />
            </div>
          ) : viewMode === "historial" ? (
            <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
              <HistorialView
                historialEnvios={historialEnvios}
                loading={historialLoading}
                isMobile={isMobile}
                onBack={irACentro}
                onShowSQL={() => setShowSQLModal(true)}
              />
            </div>
          ) : (
            <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
              <PlantillaView
                key={lineaSel?.id ?? "sin-linea"}
                linea={lineaSel}
                plantillaLinea={plantillaLinea}
                loading={plantillaLoading}
                esAdmin={esAdmin}
                isMobile={isMobile}
                onBack={irACentro}
                onAdd={agregarPiezaDirectaPlantilla}
                onEdit={editarPiezaPlantilla}
                onDelete={eliminarPiezaPlantilla}
              />
            </div>
          )}
        </div>
      </div>

      {/* Detalle mobile = pantalla completa */}
      {mostrarDetalle && isMobile && (
        <div style={{ position:"fixed", inset:0, zIndex:60, background:"var(--bg)", animation:"mrmSlideIn .18s ease" }}>
          <BoatDetail
            key={unidadSel.id}
            unidad={unidadSel}
            lineaNombre={lineaSel?.nombre ?? ""}
            piezas={piezas}
            loading={loading}
            err={err}
            esAdmin={esAdmin}
            isMobile={true}
            onBack={cerrarDetalle}
            onClose={cerrarDetalle}
            onVerPlantilla={() => lineaSel && verPlantilla(lineaSel)}
            onRenameUnidad={guardarEditUnidad}
            onDeleteUnidad={eliminarUnidad}
            onSetEstado={setEstado}
            onOpenPieza={setModalPieza}
            onDeletePieza={eliminarPieza}
            onCambiarColorSector={cambiarColorSector}
            onAddPieza={agregarPiezaManual}
            onAddPiezaPlantilla={agregarPiezaAPlantilla}
            sectoresSugeridos={sectoresSugeridos}
          />
        </div>
      )}

      {modalPieza && (
        <PiezaModal
          pieza={modalPieza}
          onClose={() => setModalPieza(null)}
          onSave={guardarDetalle}
        />
      )}

      {showSQLModal && <SqlModal onClose={() => setShowSQLModal(false)} />}
    </div>
  );
}
