import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import AjusteInventarioModal from "@/features/inventario/AjusteInventarioModal";
import ComprasSugeridasPanel from "@/features/inventario/ComprasSugeridasPanel";
import EncargadosTab from "@/features/inventario/EncargadosTab";
import OrdenCompraGenerator from "@/features/inventario/OrdenCompraGenerator";
import BarcoCalendarioPanel from "@/features/calendario/BarcoCalendarioPanel";
import { Check, Package, Plus, Trash2, X, RotateCcw, Download, AlertTriangle, ChevronDown, ChevronRight, FileText, ClipboardList, Search, RefreshCw, Edit2, ShoppingCart } from "lucide-react";
import PedirAComprasModal from "@/features/compras/PedirAComprasModal";
import { C } from "@/theme";


const TABS = ["Stock", "Ingresos", "Egresos", "Pedidos"];

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtDate(ts) {
  if (!ts) return "—";
  // Fechas solo-fecha (YYYY-MM-DD) se parsean como UTC midnight por JS.
  // Agregamos T00:00:00 SIN 'Z' para que las tome como hora local (Argentina UTC-3)
  // y no muestre el día anterior.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(ts)
    ? new Date(ts + "T00:00:00")
    : new Date(ts);
  return d.toLocaleDateString("es-AR");
}

// Fecha de hoy en hora LOCAL (evita que UTC-3 dé el día siguiente al usar toISOString)
function hoyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extraerCodigoLinea(obra) {
  const nombre = String(obra?.nombre ?? "");
  const descripcion = String(obra?.descripcion ?? "");
  const byName = nombre.match(/^K?(\d+)/i);
  if (byName) return `K${byName[1]}`;
  const byDescription = descripcion.match(/\b(K\d+)\b/i);
  if (byDescription) return byDescription[1].toUpperCase();
  return null;
}

function destinoObraLaminacion(obra) {
  const nombre = String(obra?.nombre ?? "").trim();
  const codigo = extraerCodigoLinea(obra);
  if (!nombre) return codigo ? `Obra ${codigo}` : "Obra";
  if (!codigo) return `Obra ${nombre}`;
  const upper = nombre.toUpperCase();
  const numero = codigo.replace(/^K/i, "");
  if (upper.startsWith(codigo)) return `Obra ${nombre}`;
  if (upper.startsWith(`${numero}-`)) return `Obra K${nombre}`;
  if (upper === numero) return `Obra ${codigo}`;
  return `Obra ${codigo}-${nombre}`;
}

function fmtTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-AR");
}

// ── EXPORT UTIL ─────────────────────────────────────────────────
function descargarCSV(filas, nombre) {
  if (!filas.length) return;
  const encabezado = Object.keys(filas[0]);
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    encabezado.map(escape).join(","),
    ...filas.map(row => encabezado.map(k => escape(row[k])).join(",")),
  ].join("\n");
  // BOM UTF-8 para que Excel abra acentos correctamente
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: nombre });
  a.click();
  URL.revokeObjectURL(url);
}

// ── ANIMATED NUMBER ──────────────────────────────────────────────
function AnimatedNum({ value, color = "var(--text)", size = 28 }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    const start = prev.current;
    const end = value;
    const diff = end - start;
    const dur = Math.min(600, Math.abs(diff) * 30);
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + diff * ease));
      if (p < 1) requestAnimationFrame(tick);
      else { prev.current = end; setDisplay(end); }
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: size, fontWeight: 700, color, lineHeight: 1 }}>{display}</span>;
}

// ── RING KPI ─────────────────────────────────────────────────────
function RingKpi({ label, value, total, color, sub }) {
  const pct = total > 0 ? value / total : 0;
  const r = 22; const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  return (
    <div className="lam-kpi" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, borderLeft: `2px solid ${color}` }}>
      <svg width={54} height={54} style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
        <circle cx={27} cy={27} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3.5} />
        <circle cx={27} cy={27} r={r} fill="none" stroke={color} strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray .7s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div>
        <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: "var(--dim)", marginBottom: 5 }}>{label}</div>
        <AnimatedNum value={value} color={color} size={26} />
        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 3 }}>{sub}</div>
      </div>
    </div>
  );
}

export default function LaminacionScreen({ profile, signOut }) {
  const location = useLocation();
  const { isMobile } = useResponsive();
  const role = profile?.role ?? "invitado";
  const isAdmin = hasAdminAccess(profile);
  const puedeCargar = isAdmin || role === "panol";

  // Tabs disponibles según rol: pañol ve Stock (solo lectura), Ingresos y Egresos
  const esPanol = role === "panol" && !isAdmin;
  const tabsDisponibles = esPanol
    ? ["Stock", "Ingresos", "Egresos"]
    : ["Stock", "Ingresos", "Egresos", "Movimientos", "Pedidos"];

  function tabFromSearch(search) {
    const t = new URLSearchParams(search).get("tab");
    if (tabsDisponibles.includes(t)) return t;
    return tabsDisponibles[0]; // default: Stock para gestión, Ingresos para pañol
  }
  const [tab, setTab] = useState(() => tabFromSearch(location.search));

  // Sincronizar tab cuando el usuario navega desde el Sidebar
  useEffect(() => {
    setTab(tabFromSearch(location.search));
  }, [location.search]);
  const [materiales, setMateriales] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [obrasLam, setObrasLam] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [showNuevoMaterial, setShowNuevoMaterial] = useState(false);
  const [showAjuste, setShowAjuste] = useState(false);

  const [formIngreso, setFormIngreso] = useState({
    material_id: "", cantidad: "",
    fecha: hoyLocal(),
    proveedor: "", obra: "", observaciones: "",
  });
  const [formEgreso, setFormEgreso] = useState({
    material_id: "", cantidad: "",
    fecha: hoyLocal(),
    destino: "", nombre_persona: "", observaciones: "",
  });
  const [formPedido, setFormPedido] = useState({ material_id: "", cantidad: "", observaciones: "", categoria: "estándar" });
  const [formMaterial, setFormMaterial] = useState({ nombre: "", categoria: "", unidad: "unidad", stock_minimo: 0 });

  // Modal de recepción de pedidos (pañolero)
  // confModal = { pedido, tipo: "entero" | "parcial", cantParcial: "" }
  const [confModal, setConfModal] = useState(null);
  const [comprasModal, setComprasModal] = useState({ open: false, prefilled: null });
  const [compraSelector, setCompraSelector] = useState({ open: false, selected: "stock" });
  const [loadingPlantillaCompra, setLoadingPlantillaCompra] = useState(false);
  // Órdenes expandidas en la tab Pedidos
  const [expandedOrdenes, setExpandedOrdenes] = useState(new Set());

  // ── Estado específico del tab Movimientos ────────────────────
  const [qMov,        setQMov]        = useState("");
  const [filtroTipo,  setFiltroTipo]  = useState("todos");   // todos | ingreso | egreso
  const [filtroMatId, setFiltroMatId] = useState("");        // "" = todos
  const [movSort,     setMovSort]     = useState("fecha_desc"); // fecha_desc | fecha_asc

  async function cargarMateriales() {
    const { data } = await supabase.from("laminacion_materiales").select("*").order("nombre");
    setMateriales(data ?? []);
  }
 async function cargarMovimientos() {
  const { data } = await supabase
    .from("laminacion_movimientos")
    .select("*, laminacion_materiales(nombre, unidad)")
    .order("created_at", { ascending: false });
    // Sin .limit()
  setMovimientos(data ?? []);
}
  async function cargarPedidos() {
    const { data } = await supabase
      .from("laminacion_pedidos")
      .select("*, laminacion_materiales(nombre, unidad)")
      .order("created_at", { ascending: false })
      .limit(300);
    setPedidos(data ?? []);
  }
  async function cargarObrasLam() {
    const { data } = await supabase
      .from("laminacion_obras")
      .select("id,nombre,descripcion,estado")
      .eq("estado", "activa")
      .order("nombre");
    setObrasLam(data ?? []);
  }
  async function cargar() {
    setErr("");
    await Promise.all([cargarMateriales(), cargarMovimientos(), cargarPedidos(), cargarObrasLam()]);
  }

  useEffect(() => {
    cargar();
    const ch = supabase
      .channel("rt-laminacion")
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_movimientos" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_pedidos" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_materiales" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obras" }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const stockPorMaterial = useMemo(() => {
    const map = {};
    for (const m of materiales) map[m.id] = 0;
    for (const mv of movimientos) {
      if (!mv.material_id) continue;
      let delta;
      if (mv.tipo === "ajuste") delta = num(mv.cantidad); // ya positivo o negativo
      else delta = mv.tipo === "ingreso" ? +num(mv.cantidad) : -num(mv.cantidad);
      map[mv.material_id] = (map[mv.material_id] ?? 0) + delta;
    }
    return map;
  }, [materiales, movimientos]);

  const stockRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return materiales
      .map(m => ({
        ...m,
        stock: num(stockPorMaterial[m.id]),
        estado: (stockPorMaterial[m.id] ?? 0) <= 0 ? "CRITICO"
          : (stockPorMaterial[m.id] ?? 0) <= num(m.stock_minimo) ? "ATENCION"
          : "OK",
      }))
      .filter(m => !qq || m.nombre.toLowerCase().includes(qq));
  }, [materiales, stockPorMaterial, q]);

  const movFiltrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return movimientos;
    return movimientos.filter(m => {
      const t = [m.laminacion_materiales?.nombre, m.proveedor, m.nombre_persona, m.destino, m.obra, m.observaciones]
        .filter(Boolean).join(" ").toLowerCase();
      return t.includes(qq);
    });
  }, [movimientos, q]);

  // Filtrado específico del tab Movimientos (independiente del buscador global)
  const movimientosFiltrados = useMemo(() => {
    let rows = [...movimientos];
    // Filtro tipo
    if (filtroTipo !== "todos") rows = rows.filter(m => m.tipo === filtroTipo);
    // Filtro material
    if (filtroMatId) rows = rows.filter(m => m.material_id === filtroMatId);
    // Búsqueda texto
    const qq = qMov.trim().toLowerCase();
    if (qq) rows = rows.filter(m => {
      const t = [
        m.laminacion_materiales?.nombre,
        m.proveedor, m.destino, m.nombre_persona, m.obra, m.observaciones,
        m.tipo,
      ].filter(Boolean).join(" ").toLowerCase();
      return t.includes(qq);
    });
    // Orden
    rows.sort((a, b) => {
      const da = new Date(a.fecha || a.created_at).getTime();
      const db = new Date(b.fecha || b.created_at).getTime();
      return movSort === "fecha_asc" ? da - db : db - da;
    });
    return rows;
  }, [movimientos, filtroTipo, filtroMatId, qMov, movSort]);

  // Stats de movimientos
  const movStats = useMemo(() => ({
    total:     movimientos.length,
    ingresos:  movimientos.filter(m => m.tipo === "ingreso").length,
    egresos:   movimientos.filter(m => m.tipo === "egreso").length,
    enFiltro:  movimientosFiltrados.length,
  }), [movimientos, movimientosFiltrados]);

  // ── Funciones de exportación ────────────────────────────────────
  function exportarMovimientos(soloFiltrados = true) {
    const datos = soloFiltrados ? movimientosFiltrados : movimientos;
    const filas = datos.map(m => ({
      Fecha:        m.fecha || m.created_at
                      ? new Date(m.fecha || m.created_at).toLocaleDateString("es-AR")
                      : "—",
      Hora:         m.created_at
                      ? new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
                      : "—",
      Tipo:         m.tipo === "ingreso" ? "Ingreso" : "Egreso",
      Material:     m.laminacion_materiales?.nombre ?? "—",
      Cantidad:     m.tipo === "ingreso" ? m.cantidad : -m.cantidad,
      Unidad:       m.laminacion_materiales?.unidad ?? "—",
      Proveedor:    m.tipo === "ingreso" ? (m.proveedor ?? "—") : "—",
      Destino:      m.tipo === "egreso"  ? (m.destino  ?? "—") : "—",
      Persona:      m.nombre_persona ?? "—",
      Obra:         m.obra ?? "—",
      Observaciones: m.observaciones ?? "—",
    }));
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    const sufijo = soloFiltrados && movStats.enFiltro !== movStats.total ? "_filtrado" : "";
    descargarCSV(filas, `movimientos_laminacion${sufijo}_${hoy}.csv`);
  }

  function exportarStock() {
    const filas = materiales.map(m => ({
      Material:       m.nombre,
      Categoria:      m.categoria ?? "—",
      Unidad:         m.unidad ?? "—",
      Stock_actual:   stockPorMaterial[m.id] ?? 0,
      Stock_minimo:   m.stock_minimo ?? 0,
      Estado: (stockPorMaterial[m.id] ?? 0) <= 0 ? "CRITICO"
        : (stockPorMaterial[m.id] ?? 0) <= num(m.stock_minimo) ? "ATENCION"
        : "OK",
    }));
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    descargarCSV(filas, `stock_laminacion_${hoy}.csv`);
  }

  function exportarPedidos() {
    const filas = pedidosFiltrados.map(p => ({
      Fecha:         new Date(p.created_at).toLocaleDateString("es-AR"),
      Material:      p.laminacion_materiales?.nombre ?? "—",
      Unidad:        p.laminacion_materiales?.unidad  ?? "—",
      Cantidad:      p.cantidad,
      Estado:        p.estado,
      Observaciones: p.observaciones ?? "—",
    }));
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    descargarCSV(filas, `pedidos_laminacion_${hoy}.csv`);
  }

  const [filtroPedidoEstado, setFiltroPedidoEstado] = useState("todos");

  const pedidosFiltrados = useMemo(() => {
    let rows = pedidos;
    if (filtroPedidoEstado !== "todos") rows = rows.filter(p => p.estado === filtroPedidoEstado);
    const qq = q.trim().toLowerCase();
    if (qq) rows = rows.filter(p => {
      const t = [p.laminacion_materiales?.nombre, p.estado, p.observaciones]
        .filter(Boolean).join(" ").toLowerCase();
      return t.includes(qq);
    });
    return rows;
  }, [pedidos, q, filtroPedidoEstado]);

  function flash(m) { setMsg(m); setTimeout(() => setMsg(""), 2500); }

  async function getUserId() {
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    return data?.session?.user?.id ?? null;
  }

  function abrirModalCompra(prefilled) {
    setComprasModal({ open: true, prefilled });
    setCompraSelector({ open: false, selected: "stock" });
  }

  async function abrirPedidoComprasDesdeSelector() {
    const selected = compraSelector.selected;
    const base = {
      title: "Solicitud Compra Materiales Laminación",
      source: "laminacion",
      sourceLabel: "Laminación",
    };

    if (selected === "stock") {
      abrirModalCompra({ ...base, defaultDestination: "Stock Pampa 1050" });
      return;
    }

    if (selected === "general") {
      abrirModalCompra({ ...base, defaultDestination: "" });
      return;
    }

    const obra = obrasLam.find((o) => o.id === selected);
    if (!obra) {
      setErr("Seleccioná una obra válida.");
      return;
    }

    const codigo = extraerCodigoLinea(obra);
    const defaultDestination = destinoObraLaminacion(obra);
    const emptyPrefill = {
      ...base,
      title: `Solicitud Compra Materiales Laminación ${defaultDestination.replace(/^Obra\s+/i, "")}`,
      defaultDestination,
      source_ref: obra.id,
    };

    if (!codigo) {
      abrirModalCompra(emptyPrefill);
      return;
    }

    setLoadingPlantillaCompra(true);
    setErr("");
    try {
      const { data: plantilla, error: plantillaError } = await supabase
        .from("linea_plantillas")
        .select("id,linea,nombre")
        .eq("linea", codigo)
        .eq("activa", true)
        .maybeSingle();
      if (plantillaError) throw plantillaError;

      if (!plantilla) {
        abrirModalCompra(emptyPrefill);
        return;
      }

      const { data: templateItems, error: itemsError } = await supabase
        .from("linea_plantilla_items")
        .select("material_id,cantidad,orden,notas,material:laminacion_materiales(id,nombre,unidad)")
        .eq("plantilla_id", plantilla.id)
        .order("orden", { ascending: true });
      if (itemsError) throw itemsError;

      const mapped = (templateItems ?? [])
        .filter((it) => it.material_id)
        .map((it) => ({
          material_id: it.material_id,
          description: it.material?.nombre || "Material de laminación",
          quantity: it.cantidad ?? "",
          unit: it.material?.unidad || "unidad",
          destination: defaultDestination,
          notes: it.notas || "",
          catalogSource: "laminacion",
        }));

      if (!mapped.length) {
        abrirModalCompra(emptyPrefill);
        return;
      }

      const ok = window.confirm(`¿Cargo los materiales de la plantilla ${codigo} (${mapped.length} ítems)?`);
      abrirModalCompra(ok ? { ...emptyPrefill, items: mapped } : emptyPrefill);
    } catch (error) {
      setErr(error.message || "No se pudo cargar la plantilla de la obra.");
    } finally {
      setLoadingPlantillaCompra(false);
    }
  }

  async function crearIngreso(e) {
    e.preventDefault();
    if (!formIngreso.material_id) return setErr("Seleccioná un material");
    if (!formIngreso.cantidad || num(formIngreso.cantidad) <= 0) return setErr("Cantidad inválida");
    setErr("");
    const userId = await getUserId();
    const { error } = await supabase.from("laminacion_movimientos").insert({
      material_id: formIngreso.material_id,
      tipo: "ingreso",
      cantidad: num(formIngreso.cantidad),
      fecha: formIngreso.fecha,
      proveedor: formIngreso.proveedor.trim() || null,
      obra: formIngreso.obra.trim() || null,
      observaciones: formIngreso.observaciones.trim() || null,
      creado_por: userId,
    });
    if (error) return setErr(error.message);
    flash(" Ingreso registrado");
    setFormIngreso(f => ({ ...f, cantidad: "", proveedor: "", obra: "", observaciones: "" }));
    cargar();
  }

  async function crearEgreso(e) {
    e.preventDefault();
    if (!formEgreso.material_id) return setErr("Seleccioná un material");
    if (!formEgreso.cantidad || num(formEgreso.cantidad) <= 0) return setErr("Cantidad inválida");
    setErr("");

    // ── Validación de excedente por obra ─────────────────────────────────────
    const normDest = (s) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
    const destinoNorm = normDest(formEgreso.destino);

    // K55 se omite porque su lista de materiales está en construcción
    const omitirValidacion = !destinoNorm || destinoNorm.includes("K55");

    if (!omitirValidacion) {
      // 1. Buscar la obra cuyo nombre (normalizado) coincida con el destino ingresado
      const { data: obrasData } = await supabase
        .from("laminacion_obras")
        .select("id, nombre");

      const obraMatch = (obrasData ?? []).find(
        (o) => normDest(o.nombre) === destinoNorm
      );

      if (obraMatch) {
        // 2. Obtener cantidad_necesaria para este material en esa obra
        const { data: obraMat } = await supabase
          .from("laminacion_obra_materiales")
          .select("cantidad_necesaria")
          .eq("obra_id", obraMatch.id)
          .eq("material_id", formEgreso.material_id)
          .maybeSingle();

        const necesaria = num(obraMat?.cantidad_necesaria ?? 0);

        if (necesaria > 0) {
          // 3. Sumar todos los egresos previos del mismo material hacia esa obra/destino
          const { data: movsPrevios } = await supabase
            .from("laminacion_movimientos")
            .select("cantidad, destino, obra")
            .eq("tipo", "egreso")
            .eq("material_id", formEgreso.material_id);

          const yaEgresado = (movsPrevios ?? [])
            .filter(
              (m) =>
                normDest(m.destino) === destinoNorm ||
                normDest(m.obra) === destinoNorm
            )
            .reduce((s, m) => s + num(m.cantidad), 0);

          const intentando     = num(formEgreso.cantidad);
          const totalConNuevo  = yaEgresado + intentando;

          if (totalConNuevo > necesaria) {
            const mat      = materiales.find((m) => String(m.id) === String(formEgreso.material_id));
            const excedente = +(totalConNuevo - necesaria).toFixed(2);
            const unidad    = mat?.unidad ?? "";

            const continuar = window.confirm(
              `⚠️ Advertencia: Estás intentando retirar más de lo planificado.\n\n` +
              `La obra ${obraMatch.nombre} tiene un límite de ${necesaria} ${unidad} para este material ` +
              `y ya se han retirado ${yaEgresado} ${unidad}.\n` +
              `Excedente: ${excedente} ${unidad}.\n\n` +
              `Por favor, consultar a técnica antes de continuar.\n` +
              `¿Deseas registrar el egreso de todas formas?`
            );

            if (!continuar) return;
          }
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const userId = await getUserId();
    const { error } = await supabase.from("laminacion_movimientos").insert({
      material_id:    formEgreso.material_id,
      tipo:           "egreso",
      cantidad:       num(formEgreso.cantidad),
      fecha:          formEgreso.fecha,
      destino:        formEgreso.destino.trim() || null,
      nombre_persona: formEgreso.nombre_persona.trim() || null,
      observaciones:  formEgreso.observaciones.trim() || null,
      creado_por:     userId,
    });
    if (error) return setErr(error.message);
    flash("✔ Egreso registrado");
    setFormEgreso(f => ({ ...f, cantidad: "", destino: "", nombre_persona: "", observaciones: "" }));
    cargar();
  }

  // Avisa por mail a compras cuando se reciben pedidos de laminación que
  // vinieron de "Pedir a compras" (tienen purchase_request_item_id). Best-effort.
  async function avisarComprasRecibido(pedidoIds) {
    try {
      const ids = (pedidoIds ?? []).filter(Boolean);
      if (!ids.length) return;
      const { data: peds } = await supabase
        .from("laminacion_pedidos").select("purchase_request_item_id").in("id", ids);
      const itemIds = [...new Set((peds ?? []).map(p => p.purchase_request_item_id).filter(Boolean))];
      if (!itemIds.length) return;
      const { data: items } = await supabase
        .from("purchase_request_items").select("request_id").in("id", itemIds);
      const reqIds = [...new Set((items ?? []).map(i => i.request_id).filter(Boolean))];
      const hoy = new Date().toLocaleDateString("es-AR");
      for (const reqId of reqIds) {
        supabase.functions.invoke("notificar-email-compras", {
          body: {
            type: "pedido_recibido", requestId: reqId,
            requestTitle: "Pedido de laminación", source: "laminacion",
            message: `Recibido en laminación el ${hoy}.`,
          },
        }).catch(() => {});
      }
    } catch { /* best-effort */ }
  }

  // ── Recepción de pedido desde tab Ingresos (pañolero) ───────────
  async function recibirPedido() {
    if (!confModal) return;
    const { tipo } = confModal;
    setErr("");
    const userId = await getUserId();

    if (tipo === "orden_completa") {
      const { grupo } = confModal;
      // Insertar ingreso por cada ítem de la orden
      const movs = grupo.items.map(p => ({
        material_id:  p.material_id,
        tipo:         "ingreso",
        cantidad:     num(p.cantidad),
        fecha:        hoyLocal(),
        observaciones: `Recepción completa — ${grupo.ref}`,
        creado_por:   userId,
      }));
      const { error } = await supabase.from("laminacion_movimientos").insert(movs);
      if (error) { setErr(error.message); return; }
      // Marcar todos como entregado
      await supabase.from("laminacion_pedidos")
        .update({ estado: "entregado" })
        .in("id", grupo.items.map(p => p.id));
      avisarComprasRecibido(grupo.items.map(p => p.id));
      flash(`Orden ${grupo.ref} recibida — stock actualizado`);
      setConfModal(null);
      cargar();
      return;
    }

    if (tipo === "orden_parcial") {
      const { grupo, cantsParciales } = confModal;
      const movs = [];
      const idsCerrar = [];
      const idsParciales = [];
      for (const p of grupo.items) {
        const cant = num(cantsParciales[p.id]);
        if (cant <= 0) continue;
        movs.push({
          material_id:  p.material_id,
          tipo:         "ingreso",
          cantidad:     cant,
          fecha:        hoyLocal(),
          observaciones: `Recepción parcial (${cant} de ${num(p.cantidad)}) — ${grupo.ref}`,
          creado_por:   userId,
        });
        if (cant >= num(p.cantidad)) idsCerrar.push(p.id);
        else idsParciales.push({ id: p.id, obs: p.observaciones });
      }
      if (!movs.length) { setErr("Ingresá al menos una cantidad mayor a 0"); return; }
      const { error } = await supabase.from("laminacion_movimientos").insert(movs);
      if (error) { setErr(error.message); return; }
      if (idsCerrar.length) {
        await supabase.from("laminacion_pedidos").update({ estado: "entregado" }).in("id", idsCerrar);
        avisarComprasRecibido(idsCerrar);
      }
      for (const { id, obs } of idsParciales) {
        const cant = num(cantsParciales[id]);
        const obsAnterior = obs ? obs + " | " : "";
        await supabase.from("laminacion_pedidos").update({
          observaciones: `${obsAnterior}Parcial recibido: ${cant}`,
        }).eq("id", id);
      }
      flash(`Recepción parcial — ${movs.length} material${movs.length !== 1 ? "es" : ""} ingresado${movs.length !== 1 ? "s" : ""}`);
      setConfModal(null);
      cargar();
      return;
    }

    // Pedido individual (legacy)
    const { pedido, cantParcial } = confModal;
    const cantRecibida = tipo === "entero" ? num(pedido.cantidad) : num(cantParcial);
    if (cantRecibida <= 0) return setErr("Cantidad inválida");
    const obsBase = tipo === "entero"
      ? `Recepción completa — pedido #${pedido.id}`
      : `Recepción parcial (${cantRecibida} de ${pedido.cantidad}) — pedido #${pedido.id}`;
    const { error } = await supabase.from("laminacion_movimientos").insert({
      material_id: pedido.material_id, tipo: "ingreso", cantidad: cantRecibida,
      fecha: hoyLocal(), observaciones: obsBase, creado_por: userId,
    });
    if (error) { setErr(error.message); return; }
    if (tipo === "entero") {
      await supabase.from("laminacion_pedidos").update({ estado: "entregado" }).eq("id", pedido.id);
      avisarComprasRecibido([pedido.id]);
      flash("Recepción completa — stock actualizado");
    } else {
      const obsAnterior = pedido.observaciones ? pedido.observaciones + " | " : "";
      await supabase.from("laminacion_pedidos").update({
        observaciones: `${obsAnterior}Parcial recibido: ${cantRecibida} de ${pedido.cantidad}`,
      }).eq("id", pedido.id);
      flash("Recepción parcial — pedido sigue pendiente");
    }
    setConfModal(null);
    cargar();
  }

  async function crearPedido(e) {
    e.preventDefault();
    if (!formPedido.material_id) return setErr("Seleccioná un material");
    if (!formPedido.cantidad || num(formPedido.cantidad) <= 0) return setErr("Cantidad inválida");
    setErr("");
    const userId = await getUserId();
    const { error } = await supabase.from("laminacion_pedidos").insert({
      material_id: formPedido.material_id,
      cantidad: num(formPedido.cantidad),
      estado: "pendiente",
      solicitado_por: userId,
      observaciones: formPedido.observaciones.trim() || null,
      categoria: formPedido.categoria || "estándar",
    });
    if (error) return setErr(error.message);
    flash("Pedido creado");
    setFormPedido({ material_id: "", cantidad: "", observaciones: "", categoria: "estándar" });
    cargar();
  }

  async function setEstadoPedido(id, estado) {
    const { error } = await supabase.from("laminacion_pedidos").update({ estado }).eq("id", id);
    if (error) setErr(error.message);
    else cargar();
  }

  async function eliminarPedido(id) {
    if (!window.confirm("¿Eliminar este ítem definitivamente? No se puede deshacer.")) return;
    const { data, error } = await supabase
      .from("laminacion_pedidos")
      .delete()
      .eq("id", id)
      .select();
    if (error) return setErr(error.message);
    if (!data?.length) return setErr("No se pudo eliminar. Verificá los permisos en Supabase (política DELETE en laminacion_pedidos).");
    flash("Ítem eliminado");
    cargarPedidos();
  }

  async function eliminarOrden(items) {
    if (!window.confirm(`¿Eliminar esta orden completa (${items.length} ítem${items.length !== 1 ? "s" : ""})? No se puede deshacer.`)) return;
    const { data, error } = await supabase
      .from("laminacion_pedidos")
      .delete()
      .in("id", items.map(p => p.id))
      .select();
    if (error) return setErr(error.message);
    if (!data?.length) return setErr("No se pudo eliminar. Verificá los permisos en Supabase (política DELETE en laminacion_pedidos).");
    flash("Orden eliminada");
    cargarPedidos();
  }

  async function crearMaterial(e) {
    e.preventDefault();
    if (!formMaterial.nombre.trim()) return setErr("Nombre es obligatorio");
    setErr("");
    const { error } = await supabase.from("laminacion_materiales").insert({
      nombre: formMaterial.nombre.trim(),
      categoria: formMaterial.categoria.trim() || null,
      unidad: formMaterial.unidad.trim() || "unidad",
      stock_minimo: num(formMaterial.stock_minimo),
    });
    if (error) return setErr(error.message);
    flash(" Material creado");
    setFormMaterial({ nombre: "", categoria: "", unidad: "unidad", stock_minimo: 0 });
    setShowNuevoMaterial(false);
    cargar();
  }

  const S = {
    page: { background: "var(--bg)", color: "var(--text)", fontFamily: "'Outfit', system-ui, sans-serif", width: "100%", minWidth: "100vw" },
    layout: { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", height: "100vh", width: "100%", minWidth: isMobile ? 0 : "100vw" },
    main: { padding: isMobile ? "18px 12px 12px" : 18, paddingLeft: isMobile ? 52 : 18, display: "flex", justifyContent: "center", overflowY: "auto", height: "100%", minWidth: 0 },
    content: { width: "min(1300px, 100%)", minWidth: 0 },
    card: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "rgba(255,255,255,0.03)", padding: 16, marginBottom: 12 },
    input: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text)", padding: "9px 12px", borderRadius: 8, width: "100%", outline: "none", fontSize: 14, boxSizing: "border-box", fontFamily: "'Outfit', system-ui" },
    select: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text)", padding: "9px 12px", borderRadius: 8, width: "100%", outline: "none", fontSize: 14, boxSizing: "border-box", fontFamily: "'Outfit', system-ui" },
    btn: { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "var(--text)", padding: "9px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'Outfit', system-ui" },
    btnPrimary: { border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'Outfit', system-ui" },
    btnSmall: (color) => ({ border: `1px solid ${color}40`, background: `${color}15`, color, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 12, marginRight: 4, fontFamily: "'Outfit', system-ui" }),
    row2: { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 },
    row3: { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 10, color: "var(--dim)", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", textTransform: "uppercase", letterSpacing: 1.3 },
    td: { padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "middle", fontSize: 13 },
    small: { fontSize: 12, color: "var(--dim)" },
    label: { display: "block", fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1.3, marginBottom: 6 },
    tab: (active) => ({
      padding: "6px 14px", borderRadius: 7,
      border: active ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.04)",
      background: active ? "rgba(255,255,255,0.08)" : "transparent",
      color: active ? "var(--text)" : "var(--dim)",
      cursor: "pointer", fontWeight: active ? 600 : 400, fontSize: 12, fontFamily: "'Outfit', system-ui",
    }),
    pillStock: (st) => {
      const cfg = { OK: ["rgba(16,185,129,0.1)","#10b981"], ATENCION: ["rgba(245,158,11,0.1)","#f59e0b"], CRITICO: ["rgba(239,68,68,0.1)","#ef4444"] }[st] || ["rgba(255,255,255,0.05)","var(--muted)"];
      return { display: "inline-block", padding: "2px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: cfg[0], color: cfg[1] };
    },
    btnExport: {
      border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
      color: "var(--muted)", padding: "6px 14px", borderRadius: 8,
      cursor: "pointer", fontWeight: 700, fontSize: 12,
      display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Outfit', system-ui",
    },
    pillPedido: (st) => {
      const cfg = { pendiente: ["rgba(245,158,11,0.1)","#f59e0b"], entregado: ["rgba(16,185,129,0.1)","#10b981"], cancelado: ["rgba(239,68,68,0.1)","#ef4444"] }[st] || ["rgba(255,255,255,0.05)","var(--muted)"];
      return { display: "inline-block", padding: "2px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: cfg[0], color: cfg[1] };
    },
  };

  const matOptions = materiales.map(m => (
    <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>
  ));

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: #0f0f12; color: var(--muted); }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        button:not([disabled]):hover { opacity: 0.8; }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
            radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
        .lam-row:hover td { background: rgba(255,255,255,0.025) !important; transition: background .15s; }
        .lam-row { animation: rowIn .3s ease both; }
        .lam-row:nth-child(1)  { animation-delay: .02s }
        .lam-row:nth-child(2)  { animation-delay: .04s }
        .lam-row:nth-child(3)  { animation-delay: .06s }
        .lam-row:nth-child(4)  { animation-delay: .08s }
        .lam-row:nth-child(5)  { animation-delay: .10s }
        .lam-row:nth-child(6)  { animation-delay: .12s }
        .lam-row:nth-child(7)  { animation-delay: .14s }
        .lam-row:nth-child(8)  { animation-delay: .16s }
        .lam-row:nth-child(9)  { animation-delay: .18s }
        .lam-row:nth-child(10) { animation-delay: .20s }
        .lam-row:nth-child(n+11) { animation-delay: .22s }
        @keyframes rowIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes kpiIn { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
        @keyframes pulse-dot { 0%,100% { opacity: 1; box-shadow: 0 0 0 0 currentColor; } 50% { opacity: .6; box-shadow: 0 0 6px 2px currentColor; } }
        @keyframes spin-ring { to { stroke-dashoffset: 0; } }
        .lam-kpi { animation: kpiIn .4s ease both; }
        .lam-kpi:nth-child(1) { animation-delay: .05s }
        .lam-kpi:nth-child(2) { animation-delay: .12s }
        .lam-kpi:nth-child(3) { animation-delay: .19s }
        .lam-kpi:nth-child(4) { animation-delay: .26s }
        .lam-kpi:nth-child(5) { animation-delay: .33s }
        .lam-tab-content { animation: fadeUp .25s ease both; }
        .critico-glow { box-shadow: 0 0 0 1px rgba(239,68,68,0.3), 0 2px 12px rgba(239,68,68,0.08); }
        .stock-num { font-variant-numeric: tabular-nums; }
      `}</style>
      <div className="bg-glow" />
      <div style={{ ...S.layout, position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <main style={S.main}>
          <div style={S.content}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 10, flexDirection: isMobile ? "column" : "row", marginBottom: 14 }}>
              <div>
                <h1 style={{ fontFamily: "'Outfit', system-ui", fontSize: 18, margin: 0, color: "var(--text)", fontWeight: 700 }}>
                  Laminación
                </h1>
                <div style={S.small}>{esPanol ? "Ingresos · Egresos" : "Control de stock · Ingresos · Egresos · Pedidos"}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  style={{
                    ...S.btn,
                    border: "1px solid rgba(96,165,250,0.35)",
                    background: "rgba(96,165,250,0.12)",
                    color: "var(--blue)",
                    fontWeight: 700,
                  }}
                  onClick={() => setCompraSelector({ open: true, selected: "stock" })}
                  title="Crear pedido a compras"
                >
                  Pedir a compras
                </button>
                {isAdmin && (
                  <button style={S.btn} onClick={() => setShowNuevoMaterial(v => !v)}>
                    {showNuevoMaterial ? " Cancelar" : "+ Nuevo material"}
                  </button>
                )}
                <button style={S.btn} onClick={cargar}>Refrescar</button>
              </div>
            </div>

            {err && <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd" }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "#1d5a2d", color: "#a6ffbf" }}>{msg}</div>}

            {/* Nuevo material */}
            {showNuevoMaterial && isAdmin && (
              <div style={S.card}>
                <h3 style={{ marginTop: 0, color: "var(--text)" }}>Nuevo material</h3>
                <form onSubmit={crearMaterial}>
                  <div style={S.row3}>
                    <div>
                      <label style={S.label}>Nombre</label>
                      <input style={S.input} placeholder="Ej: Mat 300"
                        value={formMaterial.nombre} onChange={e => setFormMaterial(f => ({ ...f, nombre: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Categoría</label>
                      <input style={S.input} placeholder="Telas / Resinas / Núcleos / Gel coats..."
                        value={formMaterial.categoria} onChange={e => setFormMaterial(f => ({ ...f, categoria: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Unidad</label>
                      <input style={S.input} placeholder="unidad / kg / m / l"
                        value={formMaterial.unidad} onChange={e => setFormMaterial(f => ({ ...f, unidad: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <div style={{ width: 200 }}>
                      <label style={S.label}>Stock mínimo</label>
                      <input style={S.input} type="number" step="0.01" value={formMaterial.stock_minimo}
                        onChange={e => setFormMaterial(f => ({ ...f, stock_minimo: e.target.value }))} />
                    </div>
                    <button type="submit" style={S.btnPrimary}>Crear material</button>
                  </div>
                </form>
              </div>
            )}

            {/* Buscador + Tabs */}
            <div style={S.card}>
              <input style={S.input} placeholder="Buscar material, proveedor, persona, obra, destino..."
                value={q} onChange={e => setQ(e.target.value)} />
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                {tabsDisponibles.map(t => (
                  <button key={t} style={S.tab(tab === t)} onClick={() => { setTab(t); setQ(""); }}>
                    {t}
                    {t === "Pedidos" && pedidos.filter(p => p.estado === "pendiente").length > 0 && (
                      <span style={{ marginLeft: 6, background: "#ffe7a6", color: "#000", borderRadius: 999, padding: "1px 6px", fontSize: 11, fontWeight: 900 }}>
                        {pedidos.filter(p => p.estado === "pendiente").length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ===== TAB STOCK ===== */}
            {tab === "Stock" && (
              <div className="lam-tab-content">
                {/* KPI ring bar */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginBottom: 12 }}>
                  <RingKpi label="Total" value={stockRows.length} total={stockRows.length} color="var(--muted)" sub="materiales" />
                  <RingKpi label="OK" value={stockRows.filter(r=>r.estado==="OK").length} total={stockRows.length} color="#10b981" sub={`${Math.round(stockRows.filter(r=>r.estado==="OK").length/Math.max(1,stockRows.length)*100)}% del stock`} />
                  <RingKpi label="Atención" value={stockRows.filter(r=>r.estado==="ATENCION").length} total={stockRows.length} color="#f59e0b" sub="bajo mínimo" />
                  <RingKpi label="Crítico" value={stockRows.filter(r=>r.estado==="CRITICO").length} total={stockRows.length} color="#ef4444" sub="sin stock" />
                  <div className="lam-kpi" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, borderLeft: "2px solid #3b82f6" }}>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: "var(--dim)", marginBottom: 5 }}>Pedidos pend.</div>
                      <AnimatedNum value={pedidos.filter(p=>p.estado==="pendiente").length} color="#3b82f6" size={26} />
                      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 3 }}>en espera</div>
                    </div>
                  </div>
                </div>

                <div style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                    <h3 style={{ margin: 0, color: "var(--text)" }}>
                      Stock actual
                      <span style={{ ...S.small, marginLeft: 8 }}>({stockRows.length} materiales)</span>
                    </h3>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {isAdmin && (
                        <button onClick={() => setShowAjuste(true)} style={S.btn}>
                          ⊟ Ajuste de inventario
                        </button>
                      )}
                      <button onClick={exportarStock} disabled={!stockRows.length} style={S.btnExport}>
                         CSV
                      </button>
                    </div>
                  </div>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Material</th>
                        <th style={S.th}>Categoría</th>
                        <th style={S.th}>Stock actual</th>
                        <th style={S.th}>Mínimo</th>
                        <th style={S.th}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockRows.map(m => (
                        <tr key={m.id} className={`lam-row${m.estado==="CRITICO"?" critico-glow":""}`}
                          style={m.estado==="CRITICO"?{background:"rgba(239,68,68,0.04)"}:{}}>
                          <td style={S.td}>
                            <b style={{ color: "var(--text)" }}>{m.nombre}</b>
                            <div style={S.small}>{m.unidad}</div>
                          </td>
                          <td style={S.td}><span style={S.small}>{m.categoria || "—"}</span></td>
                          <td style={S.td}>
                            <b className="stock-num" style={{
                              fontSize: 16,
                              color: m.stock <= 0 ? "#ef4444" : m.stock <= num(m.stock_minimo) ? "#ffd60a" : "#30d158",
                              textShadow: m.stock <= 0 ? "0 0 12px rgba(239,68,68,0.5)" : m.stock <= num(m.stock_minimo) ? "0 0 10px rgba(253,224,10,0.35)" : "0 0 10px rgba(48,209,88,0.3)",
                            }}>
                              {m.stock % 1 === 0 ? m.stock : m.stock.toFixed(2)}
                            </b>
                          </td>
                          <td style={S.td}><span style={S.small}>{num(m.stock_minimo)}</span></td>
                          <td style={S.td}><span style={S.pillStock(m.estado)}>{m.estado}</span></td>
                        </tr>
                      ))}
                      {!stockRows.length && (
                        <tr>
                          <td style={S.td} colSpan={5}>
                            <span style={S.small}>
                              {materiales.length === 0
                                ? "Sin materiales cargados. Usá '+ Nuevo material' o ejecutá el SQL de inicialización en Supabase."
                                : "Sin resultados para la búsqueda."}
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== TAB INGRESOS ===== */}
            {tab === "Ingresos" && (
              <>
                {/* ── Pedidos pendientes agrupados por orden ── */}
                {(() => {
                  const pendientes = pedidos.filter(p => p.estado === "pendiente");
                  if (!pendientes.length) return (
                    <div style={{ ...S.card, borderColor: "rgba(16,185,129,0.2)", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#10b981" }}>
                        <span style={{ fontSize: 20 }}></span>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>Sin órdenes pendientes de recepción</span>
                      </div>
                    </div>
                  );

                  // Agrupar por ordenRef (prefijo OC-... en observaciones)
                  const grupos = {};
                  for (const p of pendientes) {
                    const obs = p.observaciones ?? "";
                    const match = obs.match(/^(OC-\d{8}-[A-Z0-9]+)/);
                    const ref = match ? match[1] : "__manual__";
                    const label = match ? obs.replace(ref + " | ", "") : (obs || "Pedido manual");
                    if (!grupos[ref]) grupos[ref] = { ref, label, items: [], createdAt: p.created_at };
                    grupos[ref].items.push(p);
                  }

                  return (
                    <div style={{ ...S.card, borderColor: "rgba(245,158,11,0.3)", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                        <span style={{ fontSize: 20 }}></span>
                        <h3 style={{ margin: 0, color: "var(--text)", fontSize: 14 }}>
                          Órdenes pendientes de recepción
                          <span style={{ marginLeft: 8, background: "#ffe7a6", color: "#000", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 900 }}>
                            {Object.keys(grupos).length}
                          </span>
                        </h3>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {Object.values(grupos).map(grupo => {
                          const todosLosIds = grupo.items.map(p => p.id);
                          return (
                            <div key={grupo.ref} style={{ border: "1px solid rgba(245,158,11,0.22)", borderRadius: 12, overflow: "hidden" }}>
                              {/* Header de la orden */}
                              <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.07)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <div style={{ flex: 1 }}>
                                  <span style={{ fontWeight: 700, color: "#f59e0b", fontSize: 14 }}>
                                    {grupo.ref === "__manual__" ? " Pedido manual" : ` ${grupo.ref}`}
                                  </span>
                                  {grupo.ref !== "__manual__" && (
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>{grupo.label}</span>
                                  )}
                                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--dim)" }}>{fmtTs(grupo.createdAt)}</span>
                                </div>
                                <span style={{ fontSize: 12, color: "var(--dim)" }}>{grupo.items.length} {grupo.items.length === 1 ? "material" : "materiales"}</span>
                                {grupo.items.some(p => p.categoria === "extra") && (
                                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "1px 6px" }}>Incluye extras</span>
                                )}
                              </div>

                              {/* Acciones de grupo */}
                              <div style={{ display: "flex", gap: 6, padding: "6px 14px", background: "rgba(245,158,11,0.03)", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                <button style={{ border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)", color: "#10b981", fontSize: 12, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontWeight: 700 }}
                                  onClick={() => setConfModal({ tipo: "orden_completa", grupo })}>
                                  Recibir completa
                                </button>
                                <button style={{ border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.06)", color: "#f59e0b", fontSize: 12, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontWeight: 700 }}
                                  onClick={() => setConfModal({ tipo: "orden_parcial", grupo, cantsParciales: {} })}>
                                  ◐ Recibir parcial
                                </button>
                              </div>

                              {/* Lista de materiales de la orden */}
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                  {grupo.items.map((p, i) => {
                                      const mat = materiales.find(m => String(m.id) === String(p.material_id));
                                      const stockActual = num(stockPorMaterial[p.material_id]);
                                      const esExtra = p.categoria === "extra";
                                      return (
                                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap", background: esExtra ? "rgba(245,158,11,0.04)" : "transparent" }}>
                                          {/* Nombre */}
                                          <div style={{ flex: 1, minWidth: 160 }}>
                                        <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{mat?.nombre ?? "Material desconocido"}</span>
                                          </div>
                                          {/* Tipo */}
                                          <div style={{ fontSize: 11 }}>
                                            {esExtra
                                              ? <span style={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#f59e0b", background: "rgba(245,158,11,0.15)", borderRadius: 5, padding: "1px 7px" }}>Extra</span>
                                              : <span style={{ color: "var(--dim)" }}>Estándar</span>
                                            }
                                          </div>
                                      {/* Cantidades */}
                                      <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--dim)", alignItems: "center" }}>
                                        <span>Pedido: <b style={{ color: "#f59e0b" }}>{num(p.cantidad)} {mat?.unidad}</b></span>
                                        <span>Stock: <b style={{ color: stockActual > 0 ? "#10b981" : "#ff453a" }}>{stockActual}</b></span>
                                      </div>
                                      {/* Botones por ítem */}
                                      <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                                        <button
                                          style={{ border: "1px solid rgba(16,185,129,0.38)", background: "rgba(16,185,129,0.1)", color: "#10b981", fontSize: 12, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontWeight: 700 }}
                                          onClick={() => setConfModal({ pedido: p, tipo: "entero", cantParcial: "" })}
                                        ><Check size={12} style={{marginRight:4}}/>Llegó</button>
                                        <button
                                          style={{ border: "1px solid rgba(245,158,11,0.38)", background: "rgba(245,158,11,0.07)", color: "#f59e0b", fontSize: 12, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontWeight: 700 }}
                                          onClick={() => setConfModal({ pedido: p, tipo: "parcial", cantParcial: "" })}
                                        ><Package size={12} style={{marginRight:4}}/>Parcial</button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {puedeCargar && (
                  <div style={S.card}>
                    <h3 style={{ marginTop: 0, color: "var(--text)" }}>Registrar ingreso</h3>
                    <form onSubmit={crearIngreso}>
                      <div style={S.row3}>
                        <div>
                          <label style={S.label}>Material</label>
                          <select style={S.select} value={formIngreso.material_id}
                            onChange={e => setFormIngreso(f => ({ ...f, material_id: e.target.value }))}>
                            <option value="">— Seleccionar —</option>
                            {matOptions}
                          </select>
                        </div>
                        <div>
                          <label style={S.label}>Cantidad</label>
                          <input style={S.input} type="number" step="0.01" placeholder="0"
                            value={formIngreso.cantidad}
                            onChange={e => setFormIngreso(f => ({ ...f, cantidad: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Fecha</label>
                          <input style={S.input} type="date" value={formIngreso.fecha}
                            onChange={e => setFormIngreso(f => ({ ...f, fecha: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ ...S.row3, marginTop: 10 }}>
                        <div>
                          <label style={S.label}>Proveedor</label>
                          <input style={S.input} placeholder="ADS / Plaquimet / Del Bajo / Riedel..."
                            value={formIngreso.proveedor}
                            onChange={e => setFormIngreso(f => ({ ...f, proveedor: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Obra / Destino</label>
                          <input style={S.input} placeholder="STOCK / H167 / 37-26..."
                            value={formIngreso.obra}
                            onChange={e => setFormIngreso(f => ({ ...f, obra: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Observaciones</label>
                          <input style={S.input} placeholder="Nº de remito, lote, etc."
                            value={formIngreso.observaciones}
                            onChange={e => setFormIngreso(f => ({ ...f, observaciones: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button type="submit" style={S.btnPrimary}>Registrar ingreso</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={S.card}>
                  <h3 style={{ marginTop: 0, color: "var(--text)" }}>
                    Historial de ingresos
                    <span style={{ ...S.small, marginLeft: 8 }}>
                      ({movFiltrados.filter(m => m.tipo === "ingreso").length})
                    </span>
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                  <table style={{ ...S.table, minWidth: isMobile ? 560 : undefined }}>
                    <thead>
                      <tr>
                        <th style={S.th}>Fecha</th>
                        <th style={S.th}>Material</th>
                        <th style={S.th}>Cantidad</th>
                        <th style={S.th}>Proveedor</th>
                        <th style={S.th}>Obra</th>
                        <th style={S.th}>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movFiltrados.filter(m => m.tipo === "ingreso").map(m => (
                        <tr key={m.id} className="lam-row">
                          <td style={S.td}>
                            <span style={S.small}>{fmtDate(m.fecha || m.created_at)}</span>
                            {m.created_at && (
                              <div style={{ fontSize: 11, color: "#555", marginTop: 2, fontFamily: "monospace" }}>
                                {new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            )}
                          </td>
                          <td style={S.td}>
                            <b style={{ color: "var(--text)" }}>{m.laminacion_materiales?.nombre ?? "—"}</b>
                            <div style={S.small}>{m.laminacion_materiales?.unidad}</div>
                          </td>
                          <td style={S.td}><b style={{ color: "#30d158", fontSize: 15 }}>+{num(m.cantidad)}</b></td>
                          <td style={S.td}><span style={S.small}>{m.proveedor || "—"}</span></td>
                          <td style={S.td}><span style={S.small}>{m.obra || "—"}</span></td>
                          <td style={S.td}><span style={S.small}>{m.observaciones || "—"}</span></td>
                        </tr>
                      ))}
                      {!movFiltrados.filter(m => m.tipo === "ingreso").length && (
                        <tr><td style={S.td} colSpan={6}><span style={S.small}>Sin ingresos registrados.</span></td></tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </>
            )}

            {/* ===== TAB EGRESOS ===== */}
            {tab === "Egresos" && (
              <>
                {puedeCargar && (
                  <div style={S.card}>
                    <h3 style={{ marginTop: 0, color: "var(--text)" }}>Registrar egreso</h3>
                    <form onSubmit={crearEgreso}>
                      <div style={S.row3}>
                        <div>
                          <label style={S.label}>Material</label>
                          <select style={S.select} value={formEgreso.material_id}
                            onChange={e => setFormEgreso(f => ({ ...f, material_id: e.target.value }))}>
                            <option value="">— Seleccionar —</option>
                            {matOptions}
                          </select>
                        </div>
                        <div>
                          <label style={S.label}>Cantidad</label>
                          <input style={S.input} type="number" step="0.01" placeholder="0"
                            value={formEgreso.cantidad}
                            onChange={e => setFormEgreso(f => ({ ...f, cantidad: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Fecha</label>
                          <input style={S.input} type="date" value={formEgreso.fecha}
                            onChange={e => setFormEgreso(f => ({ ...f, fecha: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ ...S.row3, marginTop: 10 }}>
                        <div>
                          <label style={S.label}>Destino / Barco</label>
                          <input style={S.input} placeholder="H167 / 37-26 / CHUBUT / OTROS..."
                            value={formEgreso.destino}
                            onChange={e => setFormEgreso(f => ({ ...f, destino: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Persona que retira</label>
                          <input style={S.input} placeholder="Nombre del operario..."
                            value={formEgreso.nombre_persona}
                            onChange={e => setFormEgreso(f => ({ ...f, nombre_persona: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Observaciones</label>
                          <input style={S.input} placeholder="SE TOMO DE STOCK / SE TOMO DE H167..."
                            value={formEgreso.observaciones}
                            onChange={e => setFormEgreso(f => ({ ...f, observaciones: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button type="submit" style={S.btnPrimary}>Registrar egreso</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={S.card}>
                  <h3 style={{ marginTop: 0, color: "var(--text)" }}>
                    Historial de egresos
                    <span style={{ ...S.small, marginLeft: 8 }}>
                      ({movFiltrados.filter(m => m.tipo === "egreso").length})
                    </span>
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                  <table style={{ ...S.table, minWidth: isMobile ? 560 : undefined }}>
                    <thead>
                      <tr>
                        <th style={S.th}>Fecha</th>
                        <th style={S.th}>Material</th>
                        <th style={S.th}>Cantidad</th>
                        <th style={S.th}>Persona</th>
                        <th style={S.th}>Destino</th>
                        <th style={S.th}>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movFiltrados.filter(m => m.tipo === "egreso").map(m => (
                        <tr key={m.id} className="lam-row">
                          <td style={S.td}>
                            <span style={S.small}>{fmtDate(m.fecha || m.created_at)}</span>
                            {m.created_at && (
                              <div style={{ fontSize: 11, color: "#555", marginTop: 2, fontFamily: "monospace" }}>
                                {new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            )}
                          </td>
                          <td style={S.td}>
                            <b style={{ color: "var(--text)" }}>{m.laminacion_materiales?.nombre ?? "—"}</b>
                            <div style={S.small}>{m.laminacion_materiales?.unidad}</div>
                          </td>
                          <td style={S.td}><b style={{ color: "#ff453a", fontSize: 15 }}>-{num(m.cantidad)}</b></td>
                          <td style={S.td}><span style={S.small}>{m.nombre_persona || "—"}</span></td>
                          <td style={S.td}><span style={S.small}>{m.destino || "—"}</span></td>
                          <td style={S.td}><span style={S.small}>{m.observaciones || "—"}</span></td>
                        </tr>
                      ))}
                      {!movFiltrados.filter(m => m.tipo === "egreso").length && (
                        <tr><td style={S.td} colSpan={6}><span style={S.small}>Sin egresos registrados.</span></td></tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </>
            )}

            {/* ===== TAB MOVIMIENTOS ===== */}
            {tab === "Movimientos" && (
              <>
                {/* ── Stats bar ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
                  {[
                    { label: "Total registros", val: movStats.total,    color: "#a0aabe" },
                    { label: "Ingresos",         val: movStats.ingresos, color: "#30d158" },
                    { label: "Egresos",          val: movStats.egresos,  color: "#ff453a" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{
                      ...S.card, marginBottom: 0, padding: "12px 16px",
                      borderLeft: `3px solid ${color}55`,
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{val}</span>
                      <span style={{ ...S.small, letterSpacing: 1 }}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* ── Buscador y filtros ── */}
                <div style={{ ...S.card, marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {/* Búsqueda */}
                    <div style={{ flex: "1 1 220px", position: "relative" }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.35, fontSize: 14, pointerEvents: "none" }}></span>
                      <input
                        style={{ ...S.input, paddingLeft: 34, fontSize: 14 }}
                        placeholder="Buscar material, persona, obra, proveedor…"
                        value={qMov}
                        onChange={e => setQMov(e.target.value)}
                      />
                    </div>

                    {/* Filtro tipo */}
                    <div style={{ display: "flex", gap: 4 }}>
                      {[
                        { val: "todos",   label: "Todos"    },
                        { val: "ingreso", label: " Ing",   color: "#30d158" },
                        { val: "egreso",  label: " Egr",   color: "#ff453a" },
                      ].map(({ val, label, color }) => (
                        <button key={val} onClick={() => setFiltroTipo(val)} style={{
                          padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
                          border: filtroTipo === val
                            ? `1px solid ${color ?? "rgba(255,255,255,0.15)"}`
                            : "1px solid rgba(255,255,255,0.04)",
                          background: filtroTipo === val
                            ? color ? `${color}18` : "rgba(255,255,255,0.06)"
                            : "transparent",
                          color: filtroTipo === val ? (color ?? "var(--text)") : "var(--dim)",
                          fontFamily: "'Outfit', system-ui",
                        }}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Filtro material */}
                    <select
                      value={filtroMatId}
                      onChange={e => setFiltroMatId(e.target.value)}
                      style={{ ...S.select, flex: "1 1 180px", maxWidth: 220, fontSize: 14 }}
                    >
                      <option value="">Todos los materiales</option>
                      {materiales.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>

                    {/* Orden fecha */}
                    <button onClick={() => setMovSort(s => s === "fecha_desc" ? "fecha_asc" : "fecha_desc")} style={{
                      ...S.btn, padding: "8px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 5,
                      color: "#aaa", flexShrink: 0,
                    }}>
                      {movSort === "fecha_desc" ? " Más reciente" : " Más antiguo"}
                    </button>

                    {/* Reset filtros */}
                    {(qMov || filtroTipo !== "todos" || filtroMatId) && (
                      <button onClick={() => { setQMov(""); setFiltroTipo("todos"); setFiltroMatId(""); }}
                        style={{ ...S.btn, padding: "8px 12px", fontSize: 13, color: "#888", flexShrink: 0 }}>
                         Limpiar
                      </button>
                    )}
                    <button onClick={exportarMovimientos} disabled={!movimientosFiltrados.length} style={{ ...S.btnExport, flexShrink: 0 }}>
                       Exportar CSV
                    </button>
                  </div>

                  {/* Resultado del filtro */}
                  {movStats.enFiltro !== movStats.total && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                      Mostrando <strong style={{ color: "#aaa" }}>{movStats.enFiltro}</strong> de {movStats.total} registros
                    </div>
                  )}

                  {/* ── Exportar ── */}
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1a1a1a", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#444", letterSpacing: 1.1, textTransform: "uppercase", marginRight: 2 }}>Exportar</span>
                    <button
                      onClick={() => exportarMovimientos(true)}
                      disabled={movimientosFiltrados.length === 0}
                      style={{
                        border: movimientosFiltrados.length > 0 ? "1px solid rgba(48,209,88,0.28)" : "1px solid #2a2a2a",
                        background: movimientosFiltrados.length > 0 ? "rgba(48,209,88,0.07)" : "transparent",
                        color: movimientosFiltrados.length > 0 ? "#a6ffbf" : "#444",
                        padding: "7px 14px", borderRadius: 10, cursor: movimientosFiltrados.length > 0 ? "pointer" : "not-allowed",
                        fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                       CSV
                      <span style={{ fontSize: 11, opacity: 0.7 }}>
                        {movStats.enFiltro !== movStats.total
                          ? `${movStats.enFiltro} filtrados`
                          : `${movStats.total} registros`}
                      </span>
                    </button>
                    {movStats.enFiltro !== movStats.total && (
                      <button
                        onClick={() => exportarMovimientos(false)}
                        style={{
                          border: "1px solid #2a2a2a", background: "transparent",
                          color: "#666", padding: "7px 14px", borderRadius: 10,
                          cursor: "pointer", fontSize: 13, fontWeight: 700,
                        }}
                      >
                         CSV completo ({movStats.total})
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Tabla ── */}
                <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ ...S.table, fontSize: 14, minWidth: 700 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1e1e1e" }}>
                          {[
                            { key: "fecha",    label: "Fecha"            },
                            { key: "tipo",     label: "Tipo"             },
                            { key: "material", label: "Material"         },
                            { key: "cantidad", label: "Cantidad"         },
                            { key: "origen",   label: "Proveedor / Dest" },
                            { key: "persona",  label: "Persona"          },
                            { key: "obra",     label: "Obra"             },
                            { key: "obs",      label: "Obs"              },
                          ].map(col => (
                            <th key={col.key} style={{
                              ...S.th, padding: "12px 14px",
                              background: "rgba(0,0,0,0.4)",
                              position: "sticky", top: 0,
                              whiteSpace: "nowrap",
                            }}>
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {movimientosFiltrados.map((m, idx) => {
                          const esIngreso = m.tipo === "ingreso";
                          return (
                            <tr key={m.id} className="lam-row" style={{
                              borderBottom: "1px solid #111",
                              background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)",
                              transition: "background 0.1s",
                            }}>
                              <td style={{ ...S.td, padding: "10px 14px", whiteSpace: "nowrap", color: "#888", fontFamily: "monospace", fontSize: 13 }}>
                                {fmtDate(m.fecha || m.created_at)}
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px" }}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: 1,
                                  background: esIngreso ? "rgba(48,209,88,0.1)" : "rgba(255,69,58,0.09)",
                                  color: esIngreso ? "#30d158" : "#ff453a",
                                  border: esIngreso ? "1px solid rgba(48,209,88,0.22)" : "1px solid rgba(255,69,58,0.22)",
                                }}>
                                  {esIngreso ? "" : ""} {esIngreso ? "ING" : "EGR"}
                                </span>
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px" }}>
                                <span style={{ color: "#e0e0e0", fontWeight: 500 }}>
                                  {m.laminacion_materiales?.nombre ?? <span style={{ opacity: 0.3 }}>—</span>}
                                </span>
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px", whiteSpace: "nowrap" }}>
                                <span style={{
                                  fontFamily: "monospace", fontSize: 14, fontWeight: 700,
                                  color: esIngreso ? "#30d158" : "#ff453a",
                                }}>
                                  {esIngreso ? "+" : "−"}{m.cantidad}
                                </span>
                                <span style={{ fontSize: 12, color: "#555", marginLeft: 4 }}>
                                  {m.laminacion_materiales?.unidad ?? ""}
                                </span>
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px", maxWidth: 160 }}>
                                <span style={{ color: "#aaa", fontSize: 13 }}>
                                  {esIngreso ? (m.proveedor || <span style={{ opacity: 0.25 }}>—</span>) : (m.destino || <span style={{ opacity: 0.25 }}>—</span>)}
                                </span>
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px" }}>
                                <span style={{ color: "#aaa", fontSize: 13 }}>{m.nombre_persona || <span style={{ opacity: 0.25 }}>—</span>}</span>
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px" }}>
                                {m.obra
                                  ? <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "#ccc", fontSize: 12, fontFamily: "monospace" }}>{m.obra}</span>
                                  : <span style={{ opacity: 0.2, fontSize: 13 }}>—</span>
                                }
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px", maxWidth: 180 }}>
                                <span style={{ color: "#666", fontSize: 12, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {m.observaciones || <span style={{ opacity: 0.2 }}>—</span>}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {movimientosFiltrados.length === 0 && (
                      <div style={{ padding: "40px 20px", textAlign: "center" }}>
                        <div style={{ fontSize: 14, color: "#444", letterSpacing: 1 }}>
                          {movimientos.length === 0
                            ? "Sin movimientos registrados"
                            : "Sin resultados · probá cambiando los filtros"}
                        </div>
                        {(qMov || filtroTipo !== "todos" || filtroMatId) && (
                          <button onClick={() => { setQMov(""); setFiltroTipo("todos"); setFiltroMatId(""); }}
                            style={{ marginTop: 12, ...S.btn, fontSize: 13 }}>
                            Limpiar filtros
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ===== TAB PEDIDOS ===== */}
            {tab === "Pedidos" && (
              <>
			  <BarcoCalendarioPanel />
			    <OrdenCompraGenerator
  materiales={materiales}
  stockPorMaterial={stockPorMaterial}
  onCrearOrden={async (items, { plantillaLabel, obraNumero, ordenRef }) => {
    const obs = `${ordenRef} | ${plantillaLabel}${obraNumero ? ` — Obra ${obraNumero}` : ""}`;
    const rows = items.map(it => ({
      material_id: it.material_id,
      cantidad: it.cantidad,
      observaciones: obs,
      estado: "pendiente",
      categoria: it.categoria || "estándar",
    }));
    const { error } = await supabase.from("laminacion_pedidos").insert(rows);
    if (error) { flash(`Error: ${error.message}`); return; }
    cargarPedidos();
    flash(`Orden ${ordenRef} generada — ${items.length} materiales`);
  }}
/>
			   <ComprasSugeridasPanel
      materiales={materiales}
      movimientos={movimientos}
      stockPorMaterial={stockPorMaterial}
      onCrearPedido={async (materialId, cantidad, obs) => {
        await supabase.from("laminacion_pedidos").insert({
          material_id: materialId, cantidad, observaciones: obs, estado: "pendiente"
        });
        cargarPedidos();
        flash("Pedido creado");
      }}
    />		  
                {puedeCargar && (
                  <div style={S.card}>
                    <h3 style={{ marginTop: 0, color: "var(--text)" }}>Nuevo pedido</h3>
                    <form onSubmit={crearPedido}>
                      <div style={S.row3}>
                        <div>
                          <label style={S.label}>Material</label>
                          <select style={S.select} value={formPedido.material_id}
                            onChange={e => setFormPedido(f => ({ ...f, material_id: e.target.value }))}>
                            <option value="">— Seleccionar —</option>
                            {matOptions}
                          </select>
                        </div>
                        <div>
                          <label style={S.label}>Cantidad</label>
                          <input style={S.input} type="number" step="0.01" placeholder="0"
                            value={formPedido.cantidad}
                            onChange={e => setFormPedido(f => ({ ...f, cantidad: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Observaciones</label>
                          <input style={S.input} placeholder="Urgente, para barco X, ref. anterior..."
                            value={formPedido.observaciones}
                            onChange={e => setFormPedido(f => ({ ...f, observaciones: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "var(--muted)", userSelect: "none" }}>
                          <input type="checkbox" checked={formPedido.categoria === "extra"}
                            onChange={e => setFormPedido(f => ({ ...f, categoria: e.target.checked ? "extra" : "estándar" }))}
                            style={{ accentColor: "#f59e0b" }} />
                          Material extra (fuera de la lista estándar)
                        </label>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button type="submit" style={S.btnPrimary}>Crear pedido</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ margin: 0, color: "var(--text)" }}>Pedidos</h3>
                    <button onClick={exportarPedidos} disabled={!pedidosFiltrados.length} style={S.btnExport}>
                       Exportar CSV
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    {["todos", "pendiente", "entregado", "cancelado"].map(st => (
                      <button
                        key={st}
                        style={S.tab(filtroPedidoEstado === st)}
                        onClick={() => setFiltroPedidoEstado(st)}
                      >
                        {st === "todos" ? "Todos" : st.charAt(0).toUpperCase() + st.slice(1)}
                        {st === "pendiente" && pedidos.filter(p => p.estado === "pendiente").length > 0 && (
                          <span style={{ marginLeft: 6, background: "#ffe7a6", color: "#000", borderRadius: 999, padding: "1px 6px", fontSize: 11, fontWeight: 900 }}>
                            {pedidos.filter(p => p.estado === "pendiente").length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {/* Agrupar pedidosFiltrados por ordenRef */}
                  {(() => {
                    const grupos = {};
                    for (const p of pedidosFiltrados) {
                      const obs   = p.observaciones ?? "";
                      const match = obs.match(/^(OC-\d{8}-[A-Z0-9]+)/);
                      const ref   = match ? match[1] : `__manual_${p.id}`;
                      const label = match ? obs.replace(ref + " | ", "") : (obs || "Pedido manual");
                      if (!grupos[ref]) grupos[ref] = { ref, label, items: [], createdAt: p.created_at };
                      grupos[ref].items.push(p);
                    }
                    const listaGrupos = Object.values(grupos);
                    if (!listaGrupos.length)
                      return <div style={{ padding: "20px 0", textAlign: "center", color: "var(--dim)", fontSize: 14 }}>Sin pedidos registrados.</div>;

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {listaGrupos.map(grupo => {
                          const isExpanded  = expandedOrdenes.has(grupo.ref);
                          const pendientes  = grupo.items.filter(p => p.estado === "pendiente").length;
                          const entregados  = grupo.items.filter(p => p.estado === "entregado").length;
                          const cancelados  = grupo.items.filter(p => p.estado === "cancelado").length;
                          const estadoColor = pendientes > 0 ? "#f59e0b" : entregados === grupo.items.length ? "#10b981" : "var(--dim)";
                          const estadoLabel = pendientes > 0
                            ? `${pendientes} pendiente${pendientes !== 1 ? "s" : ""}`
                            : entregados === grupo.items.length ? "Completo" : "Cerrado";
                          const esManual    = grupo.ref.startsWith("__manual_");
                          const comprasPrefilled = pendientes > 0 ? (() => {
                            const pend = grupo.items.filter(p => p.estado === "pendiente");
                            const estandar = pend.filter(p => p.categoria !== "extra");
                            const extra = pend.filter(p => p.categoria === "extra");
                            const label = grupo.ref.startsWith("__manual_") ? "" : (grupo.label ? grupo.label + "\n" : "");
                            let desc = "";
                            if (label) desc += `${grupo.ref} — ${label}\n`;
                            if (estandar.length) {
                              desc += `\nMateriales:\n`;
                              desc += estandar.map(p => `  • ${p.laminacion_materiales?.nombre || "Material"}: ${p.cantidad} ${p.laminacion_materiales?.unidad || ""}`).join("\n");
                            }
                            if (extra.length) {
                              desc += `\n\nExtra:\n`;
                              desc += extra.map(p => `  • ${p.laminacion_materiales?.nombre || "Material"}: ${p.cantidad} ${p.laminacion_materiales?.unidad || ""}`).join("\n");
                            }
                            return {
                              title: grupo.ref.startsWith("__manual_") ? `Pedido manual — Laminación` : `${grupo.ref} — Laminación`,
                              description: desc,
                              source: "laminacion",
                              source_ref: grupo.ref,
                              sourceLabel: "Laminación",
                            };
                          })() : null;

                          return (
                            <div key={grupo.ref} style={{ border: `1px solid ${estadoColor}30`, borderRadius: 12, overflow: "hidden" }}>
                              {/* Fila de la orden — clickeable para expandir */}
                              <div
                                onClick={() => setExpandedOrdenes(prev => {
                                  const n = new Set(prev);
                                  n.has(grupo.ref) ? n.delete(grupo.ref) : n.add(grupo.ref);
                                  return n;
                                })}
                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: `${estadoColor}08`, cursor: "pointer", userSelect: "none", flexWrap: "wrap" }}
                              >
                                <span style={{ fontSize: 14 }}>{isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</span>

                                <div style={{ flex: 1, minWidth: 180 }}>
                                  <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>
                                    {esManual ? " Pedido manual" : ` ${grupo.ref}`}
                                  </div>
                                  {!esManual && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{grupo.label}</div>}
                                </div>
                                {/* debug: raw categoria values */}
                                <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace", marginLeft: 8 }}>
                                  [{grupo.items.map(p => (p.categoria || "null")).join(", ")}]
                                </div>

                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 12, color: "var(--dim)" }}>{grupo.items.length} material{grupo.items.length !== 1 ? "es" : ""}</span>
                                  {(() => { const n = grupo.items.filter(p => p.categoria === "extra").length; return n > 0 ? <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#f59e0b", background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 5, padding: "1px 8px" }}>{n} Extra{n !== 1 ? "s" : ""}</span> : null; })()}
                                  <span style={{ fontSize: 12, fontWeight: 700, color: estadoColor, background: `${estadoColor}18`, border: `1px solid ${estadoColor}44`, borderRadius: 999, padding: "2px 10px" }}>
                                    {estadoLabel}
                                  </span>
                                  <span style={{ fontSize: 11, color: "var(--dim)" }}>{fmtTs(grupo.createdAt)}</span>
                                                  {pendientes > 0 && (
                                                    <button
                                                      onClick={e => { e.stopPropagation(); setComprasModal({ open: true, prefilled: comprasPrefilled }); }}
                                                      title="Pedir a Compras"
                                                      style={{ border: "1px solid rgba(96,165,250,0.3)", background: "rgba(96,165,250,0.08)", color: "#60a5fa", borderRadius: 7, cursor: "pointer", padding: "4px 8px", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
                                                    >
                                                      <ShoppingCart size={12}/> Compras
                                                    </button>
                                                  )}
                                                  {(isAdmin || role === "admin" || role === "oficina" || role === "tecnica") && (
                                                    <button
                                                      onClick={e => { e.stopPropagation(); eliminarOrden(grupo.items); }}
                                                      title="Eliminar orden completa"
                                                      style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#ef4444", borderRadius: 7, cursor: "pointer", padding: "4px 8px", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
                                                    >
                                                      <Trash2 size={12}/> Eliminar orden
                                                    </button>
                                                  )}
                                                </div>
                              </div>

                              {/* Detalle expandido */}
                              {isExpanded && (
                                <div style={{ borderTop: `1px solid rgba(255,255,255,0.05)` }}>
                                  <table style={{ ...S.table, margin: 0 }}>
                                    <thead>
                                      <tr>
                                        <th style={S.th}>Material</th>
                                        <th style={S.th}>Tipo</th>
                                        <th style={S.th}>Cantidad</th>
                                        <th style={S.th}>Estado</th>
                                        <th style={S.th}>Acción</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {grupo.items.map(p => {
                                        const esExtra = p.categoria === "extra";
                                        return (
                                        <tr key={p.id} className="lam-row" style={esExtra ? { background: "rgba(245,158,11,0.06)" } : {}}>
                                          <td style={S.td}>
                                            <b style={{ color: "var(--text)", fontSize: 13 }}>{p.laminacion_materiales?.nombre ?? "—"}</b>
                                            <div style={S.small}>{p.laminacion_materiales?.unidad}</div>
                                          </td>
                                          <td style={S.td}>
                                            {esExtra
                                              ? <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#f59e0b", background: "rgba(245,158,11,0.15)", borderRadius: 5, padding: "2px 8px" }}>EXTRA</span>
                                              : <span style={{ fontSize: 11, color: "var(--dim)" }}>estándar</span>
                                            }
                                          </td>
                                          <td style={{ ...S.td, fontFamily: "monospace", fontSize: 14, color: "var(--text)" }}>{num(p.cantidad)}</td>
                                          <td style={S.td}><span style={S.pillPedido(p.estado)}>{p.estado}</span></td>
                                          <td style={S.td}>
                                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                              {p.estado === "pendiente" && (isAdmin || role === "admin" || role === "oficina" || role === "tecnica") && (
                                                <>
                                                  <button style={S.btnSmall("#30d158")} onClick={() => setEstadoPedido(p.id, "entregado")}><Check size={12} style={{marginRight:4}}/>Entregado</button>
                                                  <button style={S.btnSmall("#ff453a")} onClick={() => setEstadoPedido(p.id, "cancelado")}>Cancelar</button>
                                                </>
                                              )}
                                              {p.estado !== "pendiente" && (isAdmin || role === "admin" || role === "oficina" || role === "tecnica") && (
                                                <button style={S.btnSmall("#ffd60a")} onClick={() => setEstadoPedido(p.id, "pendiente")}><RotateCcw size={12} style={{marginRight:4}}/>Reabrir</button>
                                              )}
                                              {(isAdmin || role === "admin" || role === "oficina" || role === "tecnica") && (
                                                <button style={{ ...S.btnSmall("#ef4444"), padding: "4px 8px" }} onClick={e => { e.stopPropagation(); eliminarPedido(p.id); }} title="Eliminar ítem definitivamente">
                                                  <Trash2 size={12}/>
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )})}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}

          </div>
        </main>
      </div>
      {showAjuste && (
        <AjusteInventarioModal
          materiales={materiales}
          stockPorMaterial={stockPorMaterial}
          onClose={() => setShowAjuste(false)}
          onDone={() => { setShowAjuste(false); cargar(); flash("Ajuste aplicado"); }}
        />
      )}

      {/* ── Modal de confirmación de recepción ─────────────────── */}
      {confModal && (() => {
        const { tipo } = confModal;

        // ── Orden completa ──────────────────────────────────────
        if (tipo === "orden_completa") {
          const { grupo } = confModal;
          return (
            <div style={{ position: "fixed", inset: 0, background: "var(--overlay-strong)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
              <div style={{ background: "var(--panel-solid)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 28, width: "min(520px, 94vw)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)", maxHeight: "85vh", overflow: "auto" }}>
                <h3 style={{ margin: "0 0 4px", color: "var(--text)", fontSize: 16 }}>Confirmar recepción</h3>
                <p style={{ margin: "0 0 16px", color: "var(--dim)", fontSize: 13 }}>
                  Se registra ingreso por todos los materiales y la orden queda cerrada.
                </p>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
                  <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.07)", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>
                    {grupo.ref} — {grupo.label}
                  </div>
                  {grupo.items.map((p, i) => {
                    const mat = materiales.find(m => String(m.id) === String(p.material_id));
                    return (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)", fontSize: 13 }}>
                        <span style={{ color: "var(--text)" }}>
                          {mat?.nombre ?? "—"}
                          {p.categoria === "extra" && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "1px 5px" }}>Extra</span>}
                        </span>
                        <span style={{ color: "#10b981", fontWeight: 700 }}>{num(p.cantidad)} {mat?.unidad}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, fontSize: 13, color: "#10b981", marginBottom: 20 }}>
                   Se registran <b>{grupo.items.length} ingresos</b> y la orden queda como <b>Entregada</b>.
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "var(--muted)", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'Outfit', system-ui" }} onClick={() => setConfModal(null)}>Cancelar</button>
                  <button style={{ border: "1px solid rgba(16,185,129,0.5)", background: "rgba(16,185,129,0.2)", color: "#10b981", padding: "9px 22px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'Outfit', system-ui" }} onClick={recibirPedido}>Confirmar recepción</button>
                </div>
              </div>
            </div>
          );
        }

        // ── Orden parcial ───────────────────────────────────────
        if (tipo === "orden_parcial") {
          const { grupo, cantsParciales } = confModal;
          const algunaCant = Object.values(cantsParciales).some(v => num(v) > 0);
          return (
            <div style={{ position: "fixed", inset: 0, background: "var(--overlay-strong)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
              <div style={{ background: "var(--panel-solid)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 28, width: "min(560px, 94vw)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)", maxHeight: "85vh", overflow: "auto" }}>
                <h3 style={{ margin: "0 0 4px", color: "var(--text)", fontSize: 16 }}>Recepción parcial</h3>
                <p style={{ margin: "0 0 4px", color: "var(--dim)", fontSize: 13 }}>
                  Ingresá la cantidad que llegó de cada material. Dejá en 0 los que no llegaron.
                </p>
                <div style={{ fontSize: 12, color: "#f59e0b", marginBottom: 16 }}>{grupo.ref} — {grupo.label}</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {grupo.items.map(p => {
                    const mat = materiales.find(m => String(m.id) === String(p.material_id));
                    const val = cantsParciales[p.id] ?? "";
                    const cantNum = num(val);
                    const pedidoNum = num(p.cantidad);
                    const color = cantNum <= 0 ? "var(--dim)" : cantNum >= pedidoNum ? "#10b981" : "#f59e0b";
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 9 }}>
                        <div style={{ flex: 1, fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
                          {mat?.nombre ?? "—"}
                          {p.categoria === "extra" && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "1px 5px" }}>Extra</span>}
                          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>pedido: {pedidoNum} {mat?.unidad}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="number" step="0.01" min="0" max={pedidoNum}
                            placeholder="0"
                            value={val}
                            onChange={e => setConfModal(prev => ({
                              ...prev,
                              cantsParciales: { ...prev.cantsParciales, [p.id]: e.target.value }
                            }))}
                            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${color}55`, color: "var(--text)", padding: "7px 10px", borderRadius: 7, width: 80, outline: "none", fontSize: 14, fontFamily: "'JetBrains Mono', monospace", textAlign: "right", boxSizing: "border-box" }}
                          />
                          <span style={{ fontSize: 11, color: "var(--dim)", minWidth: 28 }}>{mat?.unidad}</span>
                          {cantNum > 0 && (
                            <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 60 }}>
                              {cantNum >= pedidoNum ? "completo " : `${Math.round(cantNum/pedidoNum*100)}%`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {err && <div style={{ marginBottom: 12, color: "#ff453a", fontSize: 13 }}>{err}</div>}

                <div style={{ padding: "9px 14px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, fontSize: 13, color: "#f59e0b", marginBottom: 20 }}>
                   Los materiales con cantidad &gt; 0 se registran como ingreso. Los que lleguen completos cierran el ítem; los parciales quedan pendientes.
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "var(--muted)", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'Outfit', system-ui" }} onClick={() => { setConfModal(null); setErr(""); }}>Cancelar</button>
                  <button
                    style={{ border: "1px solid rgba(245,158,11,0.5)", background: "rgba(245,158,11,0.18)", color: "#f59e0b", padding: "9px 22px", borderRadius: 8, cursor: algunaCant ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "'Outfit', system-ui", opacity: algunaCant ? 1 : 0.4 }}
                    disabled={!algunaCant}
                    onClick={recibirPedido}
                  >
                    Confirmar parcial
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // ── Pedido individual legacy ─────────────────────────────
        const { pedido, cantParcial } = confModal;
        const mat = materiales.find(m => m.id === pedido?.material_id);
        const cantFinal = tipo === "entero" ? num(pedido?.cantidad) : num(cantParcial);
        const esValido = cantFinal > 0;
        return (
          <div style={{ position: "fixed", inset: 0, background: "var(--overlay-strong)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
            <div style={{ background: "var(--panel-solid)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 28, width: "min(480px, 94vw)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
              <h3 style={{ margin: "0 0 4px", color: "var(--text)", fontSize: 16 }}>
                {tipo === "entero" ? "Confirmar recepción completa" : " Confirmar recepción parcial"}
              </h3>
              <p style={{ margin: "0 0 20px", color: "var(--dim)", fontSize: 13 }}>Esto registra un ingreso y actualiza el stock.</p>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
                <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 700, marginBottom: 6 }}>{mat?.nombre ?? "Material"}</div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Cantidad pedida: <b style={{ color: "#f59e0b" }}>{num(pedido?.cantidad)} {mat?.unidad}</b></div>
              </div>
              {tipo === "parcial" && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1.3, marginBottom: 6 }}>Cantidad que llegó ({mat?.unidad})</label>
                  <input autoFocus style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(245,158,11,0.4)", color: "var(--text)", padding: "10px 12px", borderRadius: 8, width: "100%", outline: "none", fontSize: 15, fontFamily: "'Outfit', system-ui", boxSizing: "border-box" }}
                    type="number" step="0.01" min="0.01" max={num(pedido?.cantidad)} placeholder={`Máx. ${num(pedido?.cantidad)}`}
                    value={cantParcial}
                    onChange={e => setConfModal(prev => ({ ...prev, cantParcial: e.target.value }))}
                  />
                </div>
              )}
              {tipo === "entero" && (
                <div style={{ marginBottom: 20, padding: "10px 14px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 8, fontSize: 13, color: "#10b981" }}>
                   Se registra ingreso de <b>{num(pedido?.cantidad)} {mat?.unidad}</b> · Pedido  <b>Entregado</b>.
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "var(--muted)", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'Outfit', system-ui" }} onClick={() => setConfModal(null)}>Cancelar</button>
                <button style={{ border: `1px solid ${tipo === "entero" ? "rgba(16,185,129,0.5)" : "rgba(245,158,11,0.5)"}`, background: tipo === "entero" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)", color: tipo === "entero" ? "#10b981" : "#f59e0b", padding: "9px 22px", borderRadius: 8, cursor: esValido ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "'Outfit', system-ui", opacity: esValido ? 1 : 0.5 }}
                  disabled={!esValido} onClick={recibirPedido}>
                  {tipo === "entero" ? " Confirmar" : "Confirmar parcial"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {compraSelector.open && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !loadingPlantillaCompra) {
              setCompraSelector({ open: false, selected: "stock" });
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9998,
            background: "var(--overlay-strong)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            backdropFilter: "blur(5px)",
          }}
        >
          <div style={{
            width: "min(440px, 94vw)",
            borderRadius: 14,
            border: `1px solid ${C.border}`,
            background: C.panelSolid,
            boxShadow: "0 24px 70px var(--shadow-strong)",
            padding: 18,
            color: C.text,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
              <ShoppingCart size={16} color={C.blue} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 850 }}>Pedir a compras</div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Elegí destino para precargar la plantilla si corresponde.</div>
              </div>
            </div>

            <label style={{ display: "grid", gap: 6, marginBottom: 14 }}>
              <span style={{ color: C.dim, fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>
                Destino
              </span>
              <select
                value={compraSelector.selected}
                disabled={loadingPlantillaCompra}
                onChange={(e) => setCompraSelector((prev) => ({ ...prev, selected: e.target.value }))}
                style={{
                  width: "100%",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  background: C.panel,
                  color: C.text,
                  padding: "10px 11px",
                  outline: "none",
                  fontSize: 14,
                  fontFamily: "'Outfit', system-ui",
                }}
              >
                <option value="stock">Stock Pampa 1050</option>
                <option value="general">Sin obra (general)</option>
                {obrasLam.map((obra) => {
                  const codigo = extraerCodigoLinea(obra);
                  return (
                    <option key={obra.id} value={obra.id}>
                      {codigo ? `${codigo} · ` : ""}{obra.nombre}{obra.descripcion ? ` — ${obra.descripcion}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                disabled={loadingPlantillaCompra}
                onClick={() => setCompraSelector({ open: false, selected: "stock" })}
                style={{
                  border: `1px solid ${C.border}`,
                  background: "transparent",
                  color: C.dim,
                  borderRadius: 8,
                  padding: "9px 13px",
                  cursor: loadingPlantillaCompra ? "default" : "pointer",
                  fontSize: 13,
                  fontWeight: 750,
                  fontFamily: "'Outfit', system-ui",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loadingPlantillaCompra}
                onClick={abrirPedidoComprasDesdeSelector}
                style={{
                  border: `1px solid ${C.blue}`,
                  background: C.panel2,
                  color: C.blue,
                  borderRadius: 8,
                  padding: "9px 14px",
                  cursor: loadingPlantillaCompra ? "default" : "pointer",
                  fontSize: 13,
                  fontWeight: 850,
                  fontFamily: "'Outfit', system-ui",
                  opacity: loadingPlantillaCompra ? 0.65 : 1,
                }}
              >
                {loadingPlantillaCompra ? "Cargando..." : "Continuar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <PedirAComprasModal
        open={comprasModal.open}
        prefilled={comprasModal.prefilled}
        profile={profile}
        onClose={(created) => {
          setComprasModal({ open: false, prefilled: null });
          if (created) flash("Pedido enviado a Compras");
        }}
      />
    </div>
  );
}
