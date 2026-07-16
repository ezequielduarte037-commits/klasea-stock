import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import AjusteMaderasModal from "@/features/inventario/AjusteMaderasModal";
import { Check, Package, Plus, Trash2, X, RotateCcw, Download, AlertTriangle, ChevronDown, ChevronRight, FileText, ClipboardList, Search, RefreshCw, Edit2, ShoppingCart } from "lucide-react";
import PedidosMaderaScreen from "@/features/inventario/PedidosMaderaScreen";
import { C } from "@/theme";

const TABS = ["Stock", "Ingresos", "Egresos", "Movimientos", "Pedidos"];

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(ts)
    ? new Date(ts + "T00:00:00")
    : new Date(ts);
  return d.toLocaleDateString("es-AR");
}

function hoyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function movDelta(m = {}) {
  if (m.delta != null && m.delta !== "") return num(m.delta);
  const cantidad = num(m.cantidad);
  const tipo = String(m.tipo || "").toLowerCase();
  if (tipo === "ingreso" || tipo === "entrada") return cantidad;
  if (tipo === "egreso" || tipo === "salida") return -cantidad;
  return 0;
}

function movTipo(m = {}) {
  const tipo = String(m.tipo || "").toLowerCase();
  if (tipo === "ingreso" || tipo === "entrada") return "ingreso";
  if (tipo === "egreso" || tipo === "salida") return "egreso";
  return movDelta(m) >= 0 ? "ingreso" : "egreso";
}

function movCantidad(m = {}) {
  return Math.abs(movDelta(m));
}

function fmtQty(value) {
  const n = num(value);
  if (!n) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function pedidoItemCantidadTotal(item) {
  return num(item?.cantidad);
}

function pedidoItemCantidadRecibida(item) {
  const total = pedidoItemCantidadTotal(item);
  const recibida = num(item?.cantidad_recibida);
  if (item?.nota_recepcion && recibida <= 0) return total;
  return Math.min(recibida, total);
}

function pedidoItemCantidadPendiente(item) {
  return Math.max(0, pedidoItemCantidadTotal(item) - pedidoItemCantidadRecibida(item));
}

function pedidoItemPendiente(item) {
  return !item?.nota_recepcion && pedidoItemCantidadPendiente(item) > 0;
}

function movPersona(m = {}) {
  return m.nombre_persona || m.usuario || m.recibe || m.entregado_por || "";
}

function movObs(m = {}) {
  return m.observaciones || m.obs || m.obs_ui || "";
}

function tint(color, amount = 12) {
  return `color-mix(in srgb, ${color} ${amount}%, transparent)`;
}

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
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  a.click();
  URL.revokeObjectURL(url);
}

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

function RingKpi({ label, value, total, color, sub }) {
  const pct = total > 0 ? value / total : 0;
  const r = 22; const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--panel-2)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, borderLeft: `2px solid ${color}` }}>
      <svg width={54} height={54} style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
        <circle cx={27} cy={27} r={r} fill="none" stroke="var(--panel-2)" strokeWidth={3.5} />
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

// Fila de item en la recepcion de pedidos de maderas. Una sola linea: nombre + progreso
// recibido/pedido + saldo pendiente + acciones (todo / parcial), sin huecos muertos.
function ItemRecepcionRow({
  item, material, S, isMobile, puedeCargar,
  totalItem, recibidoItem, pendienteItem, unidadItem,
  parcialValue, onParcialChange, onRecibir,
}) {
  const [hover, setHover] = useState(false);
  const vinculado = Boolean(material?.id);
  const parcialNum = num(parcialValue);
  const puedeRecibirItem = Boolean(puedeCargar && vinculado && pendienteItem > 0);
  const puedeRecibirParcial = Boolean(puedeRecibirItem && parcialNum > 0 && parcialNum <= pendienteItem);
  const completo = pendienteItem <= 0;
  const pct = totalItem > 0 ? Math.min(100, Math.round((recibidoItem / totalItem) * 100)) : 0;
  const acento = !vinculado ? C.amber : completo ? C.green : C.blue;

  const chip = (color, texto) => (
    <span style={{
      flexShrink: 0, borderRadius: 999, padding: "2px 7px", fontSize: 9,
      fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase",
      color, background: tint(color, 12), border: `1px solid ${tint(color, 30)}`,
    }}>{texto}</span>
  );

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 9 : 12,
        flexWrap: isMobile ? "wrap" : "nowrap",
        border: `1px solid ${hover ? tint(acento, 34) : vinculado ? C.border : tint(C.amber, 32)}`,
        borderRadius: 11,
        padding: isMobile ? 11 : "9px 12px 9px 15px",
        background: !vinculado ? tint(C.amber, 7) : hover ? tint(acento, 5) : C.panel,
        transition: "border-color .14s, background .14s",
        overflow: "hidden",
      }}
    >
      {!isMobile && (
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: acento, opacity: completo ? 0.9 : 0.5 }} />
      )}

      {/* Nombre + vinculo al catalogo */}
      <div style={{ flex: "1 1 190px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ color: C.text, fontSize: 13.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.descripcion || material?.nombre || "Ítem sin descripción"}
          </span>
          {!vinculado && chip(C.amber, "Sin vínculo")}
          {completo && chip(C.green, "Completo")}
        </div>
        <div style={{ ...S.small, marginTop: 2, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {vinculado ? `Catálogo: ${material.nombre}` : "Sin vínculo al catálogo — vinculalo para poder ingresarlo"}
        </div>
      </div>

      {/* Progreso recibido / pedido */}
      <div style={{ flex: isMobile ? "1 1 100%" : "0 0 134px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, fontSize: 10, color: C.dim, fontWeight: 800, marginBottom: 3 }}>
          <span style={{ whiteSpace: "nowrap" }}>{fmtQty(recibidoItem)} de {fmtQty(totalItem)} {unidadItem}</span>
          <span style={{ color: pct > 0 ? C.green : C.dim, fontFamily: C.mono }}>{pct}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 999, background: C.panel2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: completo ? C.green : tint(C.green, 65), borderRadius: 999, transition: "width .2s" }} />
        </div>
      </div>

      {/* Saldo pendiente */}
      <div style={{ flex: "0 0 auto", textAlign: isMobile ? "left" : "right", minWidth: 60 }}>
        <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 900, lineHeight: 1, color: completo ? C.green : C.amber }}>
          {fmtQty(pendienteItem)}
        </div>
        <div style={{ fontSize: 9, color: C.dim, fontWeight: 850, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 3 }}>
          Pendiente
        </div>
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
        <button
          type="button"
          onClick={() => onRecibir(pendienteItem)}
          disabled={!puedeRecibirItem}
          title={vinculado ? "Recibir todo el saldo pendiente" : "Primero hay que vincular el ítem al catálogo"}
          style={{
            ...S.btnPrimary,
            border: `1px solid ${tint(puedeRecibirItem ? C.green : C.border, 36)}`,
            background: puedeRecibirItem ? tint(C.green, hover ? 18 : 13) : C.panel2,
            color: puedeRecibirItem ? C.green : C.dim,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "7px 11px",
            fontSize: 12.5,
            whiteSpace: "nowrap",
            flex: isMobile ? "1 1 auto" : "0 0 auto",
            transition: "background .14s",
          }}
        >
          <Check size={14} /> Recibir todo
        </button>
        <div style={{
          display: "flex", alignItems: "center",
          border: `1px solid ${puedeRecibirParcial ? tint(C.amber, 34) : C.border}`,
          borderRadius: 9, overflow: "hidden", background: C.bg,
          opacity: puedeRecibirItem ? 1 : 0.6,
          transition: "border-color .14s",
        }}>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={pendienteItem || undefined}
            value={parcialValue}
            onChange={(e) => onParcialChange(e.target.value)}
            placeholder="Parcial"
            disabled={!puedeRecibirItem}
            title="Cantidad para un ingreso parcial"
            style={{
              ...S.input, width: isMobile ? "100%" : 72, height: 30, border: "none", background: "transparent",
              padding: "6px 8px", fontFamily: C.mono, fontWeight: 850, fontSize: 12, outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => onRecibir(parcialValue)}
            disabled={!puedeRecibirParcial}
            title={vinculado ? "Registrar ingreso parcial" : "Primero hay que vincular el ítem al catálogo"}
            style={{
              border: "none",
              borderLeft: `1px solid ${puedeRecibirParcial ? tint(C.amber, 34) : C.border}`,
              background: puedeRecibirParcial ? tint(C.amber, 13) : "transparent",
              color: puedeRecibirParcial ? C.amber : C.dim,
              padding: "0 9px", height: 30, cursor: puedeRecibirParcial ? "pointer" : "default",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              transition: "background .14s",
            }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MaderasScreen({ profile, signOut }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile } = useResponsive();
  const role = profile?.role ?? "invitado";
  const isAdmin = hasAdminAccess(profile);
  const puedeCargar = isAdmin || role === "panol";

  const esPanol = role === "panol" && !isAdmin;
  const tabsDisponibles = esPanol
    ? ["Stock", "Ingresos", "Egresos"]
    : ["Stock", "Ingresos", "Egresos", "Movimientos", "Pedidos"];

  function tabFromSearch(search) {
    const t = new URLSearchParams(search).get("tab");
    if (tabsDisponibles.includes(t)) return t;
    return tabsDisponibles[0];
  }
  const tab = tabFromSearch(location.search);
  const setActiveTab = (nextTab) => {
    const params = new URLSearchParams(location.search);
    params.set("tab", nextTab);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  };

  const [materiales, setMateriales] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [pedidoItems, setPedidoItems] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [showAjuste, setShowAjuste] = useState(false);
  const [recepcionParcial, setRecepcionParcial] = useState({});

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

  const [qMov, setQMov] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroMatId, setFiltroMatId] = useState("");
  const [movSort, setMovSort] = useState("fecha_desc");

  const cargarMateriales = useCallback(async () => {
    const { data } = await supabase.from("materiales").select("*").order("nombre");
    setMateriales(data ?? []);
  }, []);

  const cargarMovimientos = useCallback(async () => {
    const { data } = await supabase
      .from("movimientos")
      .select("*, materiales(nombre, unidad_medida)")
      .order("created_at", { ascending: false });
    setMovimientos(data ?? []);
  }, []);

  const cargarPedidos = useCallback(async () => {
    const { data: peds } = await supabase
      .from("pedidos")
      .select("*")
      .order("fecha_pedido", { ascending: false })
      .limit(300);
    const rows = peds ?? [];
    setPedidos(rows);
    const ids = rows.map((p) => p.id).filter(Boolean);
    if (!ids.length) {
      setPedidoItems([]);
      return;
    }
    const { data: items } = await supabase
      .from("pedido_items")
      .select("*")
      .in("pedido_id", ids)
      .order("creado_en", { ascending: true });
    setPedidoItems(items ?? []);
  }, []);

  const cargar = useCallback(async () => {
    setErr("");
    await Promise.all([cargarMateriales(), cargarMovimientos(), cargarPedidos()]);
  }, [cargarMateriales, cargarMovimientos, cargarPedidos]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void cargar(); }, 0);
    const ch = supabase
      .channel("rt-maderas")
      .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, () => { void cargar(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "materiales" }, () => { void cargar(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => { void cargar(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_items" }, () => { void cargar(); })
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [cargar]);

  const stockPorMaterial = useMemo(() => {
    const map = {};
    const sumas = {};
    const tieneMovimiento = {};
    for (const mv of movimientos) {
      if (!mv.material_id) continue;
      sumas[mv.material_id] = (sumas[mv.material_id] ?? 0) + movDelta(mv);
      tieneMovimiento[mv.material_id] = true;
    }
    for (const m of materiales) {
      const stockTabla = num(m.stock_actual);
      map[m.id] = stockTabla !== 0 ? stockTabla : (tieneMovimiento[m.id] ? sumas[m.id] ?? 0 : stockTabla);
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
    let rows = [...movimientos];
    if (filtroTipo !== "todos") rows = rows.filter(m => movTipo(m) === filtroTipo);
    if (filtroMatId) rows = rows.filter(m => m.material_id === filtroMatId);
    const qq = qMov.trim().toLowerCase();
    if (qq) rows = rows.filter(m => {
      const t = [
        m.materiales?.nombre,
        m.proveedor, m.destino, movPersona(m), m.obra, movObs(m),
        movTipo(m),
      ].filter(Boolean).join(" ").toLowerCase();
      return t.includes(qq);
    });
    rows.sort((a, b) => {
      const da = new Date(a.fecha || a.created_at).getTime();
      const db = new Date(b.fecha || b.created_at).getTime();
      return movSort === "fecha_asc" ? da - db : db - da;
    });
    return rows;
  }, [movimientos, filtroTipo, filtroMatId, qMov, movSort]);

  async function insertarMovimientoMadera({ materialId, delta, fecha, proveedor, destino, persona, obra, observaciones }) {
    const destinoObra = obra || destino || null;
    const nota = [
      observaciones || "",
      fecha && fecha !== hoyLocal() ? `Fecha operativa: ${fecha}` : "",
    ].filter(Boolean).join(" · ") || null;

    const rpc = await supabase.rpc("registrar_movimiento", {
      p_material_id: materialId,
      p_delta: delta,
      p_obra: destinoObra,
      p_usuario: delta < 0 ? (persona || null) : null,
      p_entregado_por: null,
      p_proveedor: delta > 0 ? (proveedor || null) : null,
      p_recibe: delta > 0 ? (persona || null) : null,
      p_obs: nota,
    });
    if (!rpc.error) return;

    const matActual = materiales.find((m) => String(m.id) === String(materialId));
    const nuevoStock = num(matActual?.stock_actual) + delta;
    const up = await supabase
      .from("materiales")
      .update({ stock_actual: nuevoStock })
      .eq("id", materialId);
    if (up.error) throw up.error;

    const minimal = {
      material_id: materialId,
      delta,
      obra: destinoObra,
      usuario: delta < 0 ? (persona || null) : null,
      proveedor: delta > 0 ? (proveedor || null) : null,
      recibe: delta > 0 ? (persona || null) : null,
      obs: nota,
    };
    const { error: minimalError } = await supabase.from("movimientos").insert(minimal);
    if (minimalError) throw minimalError;
  }

  async function registrarIngreso(e) {
    e.preventDefault();
    if (!formIngreso.material_id || !formIngreso.cantidad) {
      setErr("Material y cantidad son obligatorios");
      return;
    }
    setErr("");
    try {
      await insertarMovimientoMadera({
        materialId: formIngreso.material_id,
        delta: num(formIngreso.cantidad),
        fecha: formIngreso.fecha,
        proveedor: formIngreso.proveedor,
        obra: formIngreso.obra,
        observaciones: formIngreso.observaciones,
      });
    } catch (error) {
      setErr(error.message || "No se pudo registrar el ingreso");
      return;
    }
    setMsg("Ingreso registrado");
    setFormIngreso({ material_id: "", cantidad: "", fecha: hoyLocal(), proveedor: "", obra: "", observaciones: "" });
    setTimeout(() => setMsg(""), 3000);
    await cargar();
  }

  async function registrarEgreso(e) {
    e.preventDefault();
    if (!formEgreso.material_id || !formEgreso.cantidad) {
      setErr("Material y cantidad son obligatorios");
      return;
    }
    const stockActual = stockPorMaterial[formEgreso.material_id] ?? 0;
    if (num(formEgreso.cantidad) > stockActual) {
      if (!confirm(`Stock insuficiente (${stockActual}). ¿Continuar igual?`)) return;
    }
    setErr("");
    try {
      await insertarMovimientoMadera({
        materialId: formEgreso.material_id,
        delta: -num(formEgreso.cantidad),
        fecha: formEgreso.fecha,
        destino: formEgreso.destino,
        persona: formEgreso.nombre_persona,
        observaciones: formEgreso.observaciones,
      });
    } catch (error) {
      setErr(error.message || "No se pudo registrar el egreso");
      return;
    }
    setMsg("Egreso registrado");
    setFormEgreso({ material_id: "", cantidad: "", fecha: hoyLocal(), destino: "", nombre_persona: "", observaciones: "" });
    setTimeout(() => setMsg(""), 3000);
    await cargar();
  }

  const S = {
    tab: (active) => ({
      padding: "8px 16px",
      borderRadius: 8,
      border: "none",
      background: active ? "var(--panel-2)" : "transparent",
      color: active ? "var(--text)" : "var(--muted)",
      fontWeight: active ? 700 : 500,
      cursor: "pointer",
      fontSize: 13,
      transition: "all 0.15s",
    }),
    input: {
      background: "var(--panel)",
      border: `1px solid var(--border)`,
      color: "var(--text)",
      padding: "9px 12px",
      borderRadius: 8,
      fontSize: 13,
      outline: "none",
      width: "100%",
      fontFamily: "'Outfit', system-ui",
      boxSizing: "border-box",
    },
    select: {
      background: "var(--panel)",
      border: `1px solid var(--border)`,
      color: "var(--text)",
      padding: "9px 12px",
      borderRadius: 8,
      fontSize: 13,
      outline: "none",
      width: "100%",
      fontFamily: "'Outfit', system-ui",
      boxSizing: "border-box",
      cursor: "pointer",
    },
    btn: {
      padding: "8px 16px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: "var(--panel)",
      color: "var(--text)",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 600,
      transition: "all 0.15s",
    },
    btnPrimary: {
      padding: "10px 16px",
      borderRadius: 10,
      border: "none",
      background: "var(--blue)",
      color: "#fff",
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 800,
      transition: "all 0.15s",
    },
    btnExport: {
      padding: "8px 16px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: "var(--panel)",
      color: "var(--text)",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 600,
      transition: "all 0.15s",
    },
    card: {
      background: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 13,
    },
    th: {
      textAlign: "left",
      padding: "10px 12px",
      borderBottom: "1px solid var(--border)",
      color: "var(--dim)",
      fontSize: 11,
      letterSpacing: 1,
      textTransform: "uppercase",
      fontWeight: 700,
    },
    td: {
      padding: "10px 12px",
      borderBottom: "1px solid var(--border)",
      color: "var(--text)",
    },
    small: {
      fontSize: 11,
      color: "var(--dim)",
    },
    label: {
      fontSize: 10,
      letterSpacing: 1.3,
      textTransform: "uppercase",
      color: "var(--dim)",
      marginBottom: 5,
      display: "block",
      fontWeight: 700,
    },
    pillStock: (estado) => ({
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      background: estado === "CRITICO" ? "rgba(239,68,68,0.1)" : estado === "ATENCION" ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)",
      color: estado === "CRITICO" ? "#ef4444" : estado === "ATENCION" ? "#f59e0b" : "#10b981",
      border: `1px solid ${estado === "CRITICO" ? "rgba(239,68,68,0.25)" : estado === "ATENCION" ? "rgba(245,158,11,0.25)" : "rgba(16,185,129,0.25)"}`,
    }),
  };

  const matOptions = materiales.map(m => (
    <option key={m.id} value={m.id}>{m.nombre} ({m.unidad_medida})</option>
  ));

  const materialEgresoSeleccionado = materiales.find(m => String(m.id) === String(formEgreso.material_id));
  const egresoStockActual = materialEgresoSeleccionado ? (stockPorMaterial[materialEgresoSeleccionado.id] ?? 0) : 0;
  const egresoCantidadPreview = num(formEgreso.cantidad);
  const egresoStockFinal = egresoStockActual - egresoCantidadPreview;
  const egresoDejaNegativo = egresoStockFinal < 0;

  const egresosStats = useMemo(() => ({
    total: movimientos.filter(m => movTipo(m) === "egreso").length,
    hoy: movimientos.filter(m => movTipo(m) === "egreso" && (m.fecha || m.created_at)?.startsWith(hoyLocal())).length,
    filtrados: movFiltrados.filter(m => movTipo(m) === "egreso").length,
    destinos: new Set(movimientos.filter(m => movTipo(m) === "egreso" && (m.destino || m.obra)).map(m => m.destino || m.obra)).size,
  }), [movimientos, movFiltrados]);

  const materialByName = useMemo(() => {
    const map = new Map();
    for (const material of materiales) {
      map.set(String(material.nombre || "").trim().toLowerCase(), material);
    }
    return map;
  }, [materiales]);

  const pedidoItemsByPedido = useMemo(() => {
    const map = new Map();
    for (const item of pedidoItems) {
      const list = map.get(item.pedido_id) || [];
      list.push(item);
      map.set(item.pedido_id, list);
    }
    return map;
  }, [pedidoItems]);

  const pedidosPendientesIngreso = useMemo(() => {
    const activos = new Set(["pedido", "transito", "parcial", "pendiente", "solicitada", "aprobada", "en_camino", "comprado", "enviado"]);
    return pedidos
      .filter((pedido) => activos.has(String(pedido.estado || "").toLowerCase()))
      .map((pedido) => ({
        ...pedido,
        items: (pedidoItemsByPedido.get(pedido.id) || []).filter(pedidoItemPendiente),
      }))
      .filter((pedido) => pedido.items.length > 0);
  }, [pedidos, pedidoItemsByPedido]);

  function materialParaPedidoItem(item) {
    if (item.material_id) {
      return materiales.find((m) => String(m.id) === String(item.material_id));
    }
    return materialByName.get(String(item.descripcion || "").trim().toLowerCase());
  }

  async function recibirItemMadera(pedido, item, cantidadARecibir = null) {
    setErr("");
    const { data: auth } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const userId = auth?.session?.user?.id ?? null;
    const material = materialParaPedidoItem(item);
    const totalPedido = pedidoItemCantidadTotal(item);
    const recibidoActual = pedidoItemCantidadRecibida(item);
    const pendienteActual = pedidoItemCantidadPendiente(item);
    const cantidadIngreso = cantidadARecibir == null ? pendienteActual : num(cantidadARecibir);
    if (!material?.id) {
      setErr("No se puede recibir este item: falta vincularlo a un material del catalogo de maderas.");
      return;
    }
    if (totalPedido <= 0) {
      setErr("No se puede recibir este item: la cantidad no es valida.");
      return;
    }
    if (pendienteActual <= 0) {
      setErr("Este item ya esta recibido completo.");
      return;
    }
    if (cantidadIngreso <= 0) {
      setErr("Ingresa una cantidad mayor a 0 para recibir.");
      return;
    }
    if (cantidadIngreso > pendienteActual) {
      setErr(`La cantidad supera el saldo pendiente (${fmtQty(pendienteActual)}).`);
      return;
    }
    const recibidoNuevo = recibidoActual + cantidadIngreso;
    const completo = recibidoNuevo >= totalPedido;
    const unidad = item.unidad || item.unidad_medida || material?.unidad_medida || "";
    const fechaTexto = new Date().toLocaleDateString("es-AR");
    try {
      await insertarMovimientoMadera({
        materialId: material.id,
        delta: cantidadIngreso,
        fecha: hoyLocal(),
        proveedor: pedido.proveedor || "Compras",
        obra: item.categoria || pedido.nota || "",
        observaciones: completo
          ? `Recepcion completa pedido madera ${pedido.nota || pedido.proveedor || pedido.id}`
          : `Recepcion parcial pedido madera ${pedido.nota || pedido.proveedor || pedido.id}: ${fmtQty(recibidoNuevo)} de ${fmtQty(totalPedido)} ${unidad}`.trim(),
      });
      await supabase.from("pedido_items").update({
        cantidad_recibida: completo ? totalPedido : recibidoNuevo,
        nota_recepcion: completo
          ? `Recibido: ${fmtQty(totalPedido)} ${unidad} - ${fechaTexto}`
          : null,
      }).eq("id", item.id);

      const pendientesRestantes = (pedidoItemsByPedido.get(pedido.id) || [])
        .map((it) => (String(it.id) === String(item.id)
          ? { ...it, cantidad_recibida: completo ? totalPedido : recibidoNuevo, nota_recepcion: completo ? "recibido" : null }
          : it))
        .filter(pedidoItemPendiente)
        .length;
      const patch = pendientesRestantes > 0
        ? { estado: "parcial" }
        : { estado: "recibido", recibido_en: new Date().toISOString(), recibido_por: userId };
      await supabase.from("pedidos").update(patch).eq("id", pedido.id);

      setRecepcionParcial((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setMsg(completo
        ? (pendientesRestantes > 0
          ? `Item recibido completo. Quedan ${pendientesRestantes} pendiente${pendientesRestantes === 1 ? "" : "s"} en este pedido.`
          : "Ultimo item recibido. Pedido completo.")
        : `Ingreso parcial registrado: ${fmtQty(cantidadIngreso)} ${unidad}. Queda pendiente ${fmtQty(totalPedido - recibidoNuevo)} ${unidad}.`);
      setTimeout(() => setMsg(""), 3500);
      await cargar();
    } catch (error) {
      setErr(error.message || "No se pudo recibir el item");
    }
  }

  const ingresosStats = useMemo(() => ({
    total: movimientos.filter(m => movTipo(m) === "ingreso").length,
    hoy: movimientos.filter(m => movTipo(m) === "ingreso" && (m.fecha || m.created_at)?.startsWith(hoyLocal())).length,
    filtrados: movFiltrados.filter(m => movTipo(m) === "ingreso").length,
    pendientes: pedidosPendientesIngreso.reduce((sum, pedido) => sum + (pedido.items?.length || 0), 0),
  }), [movimientos, movFiltrados, pedidosPendientesIngreso]);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)", fontFamily: "'Outfit', system-ui" }}>
      <div style={{ width: isMobile ? 0 : 280, flexShrink: 0, height: "100vh", overflow: "visible" }}>
        <Sidebar profile={profile} signOut={signOut} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", minWidth: 0 }}>
        {/* Topbar */}
        <div style={{
          height: 54, flexShrink: 0,
          background: "rgba(7,8,13,0.94)",
          backdropFilter: "blur(32px) saturate(130%)",
          borderBottom: "1px solid var(--border)",
          padding: isMobile ? "0 12px 0 52px" : "0 22px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 3, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>Inventario</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Maderas</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {msg && (
              <div style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", fontSize: 12, fontWeight: 600 }}>
                {msg}
              </div>
            )}
            {err && (
              <div style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontSize: 12, fontWeight: 600 }}>
                {err}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 12 : 24 }}>
          {/* Buscador + Tabs */}
          <div style={S.card}>
            <input style={S.input} placeholder="Buscar material, proveedor, persona, obra, destino..."
              value={q} onChange={e => setQ(e.target.value)} />
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {tabsDisponibles.map(t => (
                <button key={t} style={S.tab(tab === t)} onClick={() => { setActiveTab(t); setQ(""); }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* TAB STOCK */}
          {tab === "Stock" && (
            <div>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginBottom: 12 }}>
                <RingKpi label="Total" value={stockRows.length} total={stockRows.length} color="var(--muted)" sub="materiales" />
                <RingKpi label="OK" value={stockRows.filter(r=>r.estado==="OK").length} total={stockRows.length} color="#10b981" sub={`${Math.round(stockRows.filter(r=>r.estado==="OK").length/Math.max(1,stockRows.length)*100)}% del stock`} />
                <RingKpi label="Atención" value={stockRows.filter(r=>r.estado==="ATENCION").length} total={stockRows.length} color="#f59e0b" sub="bajo mínimo" />
                <RingKpi label="Crítico" value={stockRows.filter(r=>r.estado==="CRITICO").length} total={stockRows.length} color="#ef4444" sub="sin stock" />
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
                        Ajuste de inventario
                      </button>
                    )}
                    <button onClick={() => {
                      const filas = stockRows.map(m => ({
                        Material: m.nombre,
                        Categoria: m.categoria ?? "—",
                        Unidad: m.unidad_medida ?? "—",
                        Stock_actual: m.stock,
                        Stock_minimo: m.stock_minimo ?? 0,
                        Estado: m.estado,
                      }));
                      const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
                      descargarCSV(filas, `stock_maderas_${hoy}.csv`);
                    }} disabled={!stockRows.length} style={S.btnExport}>
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
                      <tr key={m.id} style={m.estado==="CRITICO"?{background:"rgba(239,68,68,0.04)"}:{}}>
                        <td style={S.td}>
                          <b style={{ color: "var(--text)" }}>{m.nombre}</b>
                          <div style={S.small}>{m.unidad_medida}</div>
                        </td>
                        <td style={S.td}><span style={S.small}>{m.categoria || "—"}</span></td>
                        <td style={S.td}>
                          <b style={{
                            fontSize: 16,
                            color: m.stock <= 0 ? "#ef4444" : m.stock <= num(m.stock_minimo) ? "#ffd60a" : "#30d158",
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
                              ? "Sin materiales cargados."
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

          {/* TAB INGRESOS */}
          {tab === "Ingresos" && (
            <div style={{ display: "grid", gap: 14 }}>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                {[
                  { label: "Ingresos hoy", value: ingresosStats.hoy, sub: "movimientos registrados", color: C.green, icon: Check },
                  { label: "Historial", value: ingresosStats.filtrados, sub: q.trim() ? "en la búsqueda actual" : "ingresos visibles", color: C.blue, icon: FileText },
                  { label: "Total ingresos", value: ingresosStats.total, sub: "desde el inicio", color: C.teal, icon: Package },
                  { label: "Pendientes", value: ingresosStats.pendientes, sub: "items por recibir", color: C.amber, icon: ShoppingCart },
                ].map(({ label, value, sub, color, icon: Icon }) => (
                  <div key={label} style={{
                    border: `1px solid ${tint(color, 28)}`,
                    borderRadius: 14,
                    background: `linear-gradient(135deg, ${tint(color, 10)}, var(--panel) 54%)`,
                    padding: 14,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    minHeight: 86,
                  }}>
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      display: "grid",
                      placeItems: "center",
                      background: tint(color, 16),
                      border: `1px solid ${tint(color, 30)}`,
                      color,
                      flexShrink: 0,
                    }}>
                      {React.createElement(Icon, { size: 18 })}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...S.label, marginBottom: 3 }}>{label}</div>
                      <div style={{ fontFamily: C.mono, fontSize: 24, lineHeight: 1, fontWeight: 850, color }}>{value}</div>
                      <div style={{ ...S.small, marginTop: 5 }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <section style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                <div style={{
                  padding: 16,
                  borderBottom: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      display: "grid",
                      placeItems: "center",
                      color: C.amber,
                      background: tint(C.amber, 13),
                      border: `1px solid ${tint(C.amber, 32)}`,
                      flexShrink: 0,
                    }}>
                      <ShoppingCart size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, color: C.text, fontSize: 16, fontWeight: 850 }}>Recepcion de pedidos de maderas</h3>
                      <p style={{ margin: "4px 0 0", color: C.dim, fontSize: 13 }}>
                        Pedidos enviados a compras que todavia tienen items para ingresar al stock.
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={cargar} style={{ ...S.btn, display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <RefreshCw size={14} /> Actualizar
                  </button>
                </div>

                <div style={{ padding: 14, display: "grid", gap: 10 }}>
                  {pedidosPendientesIngreso.length === 0 ? (
                    <div style={{
                      border: `1px dashed ${C.border}`,
                      borderRadius: 12,
                      padding: 18,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: C.dim,
                      fontSize: 13,
                    }}>
                      <Check size={17} style={{ color: C.green }} />
                      No hay pedidos pendientes de recepcion para maderas.
                    </div>
                  ) : pedidosPendientesIngreso.map((pedido) => {
                    const items = pedido.items || [];
                    const vinculados = items.filter((item) => {
                      if (item.material_id) return true;
                      return materialByName.has(String(item.descripcion || "").trim().toLowerCase());
                    }).length;
                    const sinVinculo = Math.max(0, items.length - vinculados);
                    const vieneDeCompras = pedido.purchase_request_id || items.some((item) => item.purchase_request_item_id);
                    const itemsCompletos = items.filter((item) => pedidoItemCantidadPendiente(item) <= 0).length;
                    return (
                      <article key={pedido.id} style={{
                        border: `1px solid ${sinVinculo ? tint(C.amber, 34) : C.border}`,
                        borderRadius: 12,
                        background: sinVinculo ? tint(C.amber, 7) : C.panel,
                        padding: 14,
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        gap: 12,
                        alignItems: "center",
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <b style={{ color: C.text, fontSize: 15 }}>{pedido.nota || pedido.proveedor || "Pedido de maderas"}</b>
                            <span style={{
                              borderRadius: 999,
                              padding: "3px 9px",
                              fontSize: 10,
                              fontWeight: 850,
                              letterSpacing: 1,
                              textTransform: "uppercase",
                              color: vieneDeCompras ? C.blue : C.amber,
                              background: tint(vieneDeCompras ? C.blue : C.amber, 12),
                              border: `1px solid ${tint(vieneDeCompras ? C.blue : C.amber, 30)}`,
                            }}>
                              {vieneDeCompras ? "Compras" : pedido.estado || "Pedido"}
                            </span>
                            {sinVinculo > 0 && (
                              <span style={{
                                borderRadius: 999,
                                padding: "3px 9px",
                                fontSize: 10,
                                fontWeight: 850,
                                color: C.amber,
                                background: tint(C.amber, 12),
                                border: `1px solid ${tint(C.amber, 30)}`,
                              }}>
                                {sinVinculo} sin vincular
                              </span>
                            )}
                            {itemsCompletos > 0 && (
                              <span style={{
                                borderRadius: 999,
                                padding: "3px 9px",
                                fontSize: 10,
                                fontWeight: 850,
                                color: C.green,
                                background: tint(C.green, 12),
                                border: `1px solid ${tint(C.green, 30)}`,
                              }}>
                                {itemsCompletos} de {items.length} recibido{itemsCompletos === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                          <div style={{ ...S.small, marginTop: 4 }}>
                            {pedido.proveedor || "Sin proveedor"} · {fmtDate(pedido.fecha_pedido || pedido.creado_en)} · {items.length} ítem{items.length === 1 ? "" : "s"}
                          </div>
                          <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
                            {items.map((item) => {
                              const material = materialParaPedidoItem(item);
                              return (
                                <ItemRecepcionRow
                                  key={item.id}
                                  item={item}
                                  material={material}
                                  S={S}
                                  isMobile={isMobile}
                                  puedeCargar={puedeCargar}
                                  totalItem={pedidoItemCantidadTotal(item)}
                                  recibidoItem={pedidoItemCantidadRecibida(item)}
                                  pendienteItem={pedidoItemCantidadPendiente(item)}
                                  unidadItem={item.unidad || item.unidad_medida || material?.unidad_medida || ""}
                                  parcialValue={recepcionParcial[item.id] ?? ""}
                                  onParcialChange={(valor) => setRecepcionParcial((prev) => ({ ...prev, [item.id]: valor }))}
                                  onRecibir={(cantidad) => recibirItemMadera(pedido, item, cantidad)}
                                />
                              );
                            })}
                          </div>
                          {sinVinculo > 0 && (
                            <p style={{ margin: "9px 0 0", color: C.amber, fontSize: 12, lineHeight: 1.4 }}>
                              Los items sin vinculo se dejan pendientes para no crear stock duplicado.
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              {puedeCargar && (
                <section style={{ ...S.card, padding: 0, overflow: "hidden", borderColor: C.border }}>
                  <div style={{
                    padding: 16,
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      display: "grid",
                      placeItems: "center",
                      color: C.green,
                      background: tint(C.green, 13),
                      border: `1px solid ${tint(C.green, 30)}`,
                      flexShrink: 0,
                    }}>
                      <Package size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, color: C.text, fontSize: 16, fontWeight: 850 }}>Registrar ingreso</h3>
                      <p style={{ margin: "4px 0 0", color: C.dim, fontSize: 13 }}>
                        Entrada de material al stock de maderas.
                      </p>
                    </div>
                  </div>

                  <div style={{ padding: 16 }}>
                    <form onSubmit={registrarIngreso} style={{ display: "grid", gap: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) 120px 150px", gap: 10 }}>
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
                          <input style={{ ...S.input, fontFamily: C.mono, fontWeight: 800 }} type="number" step="0.01" placeholder="0"
                            value={formIngreso.cantidad}
                            onChange={e => setFormIngreso(f => ({ ...f, cantidad: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Fecha</label>
                          <input style={S.input} type="date" value={formIngreso.fecha}
                            onChange={e => setFormIngreso(f => ({ ...f, fecha: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={S.label}>Proveedor</label>
                          <input style={S.input} placeholder="Nombre del proveedor..."
                            value={formIngreso.proveedor}
                            onChange={e => setFormIngreso(f => ({ ...f, proveedor: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Obra (opcional)</label>
                          <input style={S.input} placeholder="H167 / 37-26..."
                            value={formIngreso.obra}
                            onChange={e => setFormIngreso(f => ({ ...f, obra: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <label style={S.label}>Observaciones</label>
                        <input style={S.input} placeholder="Remito, aclaración..."
                          value={formIngreso.observaciones}
                          onChange={e => setFormIngreso(f => ({ ...f, observaciones: e.target.value }))} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button type="submit" style={{
                          ...S.btnPrimary,
                          border: `1px solid ${tint(C.green, 36)}`,
                          background: tint(C.green, 13),
                          color: C.green,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 15px",
                        }}>
                          <Check size={15} /> Registrar ingreso
                        </button>
                      </div>
                    </form>
                  </div>
                </section>
              )}

              <section style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                <div style={{
                  padding: 16,
                  borderBottom: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}>
                  <div>
                    <h3 style={{ margin: 0, color: C.text, fontSize: 16, fontWeight: 850 }}>Historial de ingresos</h3>
                    <p style={{ margin: "4px 0 0", color: C.dim, fontSize: 13 }}>Últimos 50 movimientos de entrada</p>
                  </div>
                </div>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Fecha</th>
                      <th style={S.th}>Material</th>
                      <th style={S.th}>Cantidad</th>
                      <th style={S.th}>Proveedor</th>
                      <th style={S.th}>Obra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.filter(m => movTipo(m) === "ingreso").slice(0, 50).map(m => (
                      <tr key={m.id}>
                        <td style={S.td}>{fmtDate(m.fecha || m.created_at)}</td>
                        <td style={S.td}>{m.materiales?.nombre ?? "—"}</td>
                        <td style={S.td}><b style={{ color: "#10b981" }}>+{fmtQty(movCantidad(m))}</b></td>
                        <td style={S.td}>{m.proveedor ?? "—"}</td>
                        <td style={S.td}>{m.obra ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          )}

          {/* TAB EGRESOS */}
          {tab === "Egresos" && (
            <div style={{ display: "grid", gap: 14 }}>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                {[
                  { label: "Egresos hoy", value: egresosStats.hoy, sub: "salidas registradas", color: C.red, icon: Package },
                  { label: "Historial", value: egresosStats.filtrados, sub: q.trim() ? "en la búsqueda actual" : "egresos visibles", color: C.blue, icon: FileText },
                  { label: "Destinos", value: egresosStats.destinos, sub: "con movimientos", color: C.violet, icon: ClipboardList },
                  { label: "Total egresos", value: egresosStats.total, sub: "desde el inicio", color: C.amber, icon: RotateCcw },
                ].map(({ label, value, sub, color, icon: Icon }) => (
                  <div key={label} style={{
                    border: `1px solid ${tint(color, 28)}`,
                    borderRadius: 14,
                    background: `linear-gradient(135deg, ${tint(color, 10)}, var(--panel) 54%)`,
                    padding: 14,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    minHeight: 86,
                  }}>
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      display: "grid",
                      placeItems: "center",
                      background: tint(color, 16),
                      border: `1px solid ${tint(color, 30)}`,
                      color,
                      flexShrink: 0,
                    }}>
                      {React.createElement(Icon, { size: 18 })}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...S.label, marginBottom: 3 }}>{label}</div>
                      <div style={{ fontFamily: C.mono, fontSize: 24, lineHeight: 1, fontWeight: 850, color }}>{value}</div>
                      <div style={{ ...S.small, marginTop: 5 }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {puedeCargar && (
                <section style={{ ...S.card, padding: 0, overflow: "hidden", borderColor: egresoDejaNegativo ? tint(C.red, 44) : C.border }}>
                  <div style={{
                    padding: 16,
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: egresoDejaNegativo ? tint(C.red, 7) : "transparent",
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      display: "grid",
                      placeItems: "center",
                      color: C.red,
                      background: tint(C.red, 13),
                      border: `1px solid ${tint(C.red, 30)}`,
                      flexShrink: 0,
                    }}>
                      <RotateCcw size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, color: C.text, fontSize: 16, fontWeight: 850 }}>Registrar egreso</h3>
                      <p style={{ margin: "4px 0 0", color: C.dim, fontSize: 13 }}>
                        Salida de material hacia obra, persona o destino operativo.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 300px", gap: 14, padding: 16 }}>
                    <form onSubmit={registrarEgreso} style={{ display: "grid", gap: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) 120px 150px", gap: 10 }}>
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
                          <input style={{ ...S.input, fontFamily: C.mono, fontWeight: 800 }} type="number" step="0.01" placeholder="0"
                            value={formEgreso.cantidad}
                            onChange={e => setFormEgreso(f => ({ ...f, cantidad: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Fecha</label>
                          <input style={S.input} type="date" value={formEgreso.fecha}
                            onChange={e => setFormEgreso(f => ({ ...f, fecha: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={S.label}>Destino / Barco</label>
                          <input style={S.input} placeholder="H167 / 37-26 / Chubut..."
                            value={formEgreso.destino}
                            onChange={e => setFormEgreso(f => ({ ...f, destino: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Persona que retira</label>
                          <input style={S.input} placeholder="Nombre del operario..."
                            value={formEgreso.nombre_persona}
                            onChange={e => setFormEgreso(f => ({ ...f, nombre_persona: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <label style={S.label}>Observaciones</label>
                        <input style={S.input} placeholder="Se tomó de stock, reemplazo, aclaración..."
                          value={formEgreso.observaciones}
                          onChange={e => setFormEgreso(f => ({ ...f, observaciones: e.target.value }))} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button type="submit" style={{
                          ...S.btnPrimary,
                          border: `1px solid ${tint(C.red, 36)}`,
                          background: tint(C.red, 13),
                          color: C.red,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 15px",
                        }}>
                          <RotateCcw size={15} /> Registrar egreso
                        </button>
                      </div>
                    </form>

                    <aside style={{
                      border: `1px solid ${egresoDejaNegativo ? tint(C.red, 44) : C.border}`,
                      borderRadius: 12,
                      background: egresoDejaNegativo ? tint(C.red, 7) : C.panel,
                      padding: 14,
                      minHeight: 178,
                    }}>
                      <div style={{ ...S.label, marginBottom: 10 }}>Control de stock</div>
                      {materialEgresoSeleccionado ? (
                        <div style={{ display: "grid", gap: 10 }}>
                          <div>
                            <div style={{ color: C.text, fontSize: 15, fontWeight: 850, lineHeight: 1.25 }}>{materialEgresoSeleccionado.nombre}</div>
                            <div style={{ ...S.small, marginTop: 3 }}>{materialEgresoSeleccionado.categoria || "Sin categoría"}</div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 9 }}>
                              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.1 }}>Disponible</div>
                              <div style={{ fontFamily: C.mono, fontWeight: 850, color: egresoStockActual > 0 ? C.green : C.red, marginTop: 3 }}>{egresoStockActual}</div>
                            </div>
                            <div style={{ border: `1px solid ${egresoDejaNegativo ? tint(C.red, 40) : C.border}`, borderRadius: 10, padding: 9 }}>
                              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.1 }}>Después</div>
                              <div style={{ fontFamily: C.mono, fontWeight: 850, color: egresoDejaNegativo ? C.red : C.text, marginTop: 3 }}>{egresoStockFinal}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: egresoDejaNegativo ? C.red : C.dim, lineHeight: 1.45 }}>
                            {egresoDejaNegativo ? <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <Check size={15} style={{ flexShrink: 0, marginTop: 1, color: C.green }} />}
                            <span>
                              {egresoDejaNegativo
                                ? "La salida supera el stock actual. El sistema va a pedir confirmación antes de registrar."
                                : <>Se va a descontar <b style={{ color: C.red }}>{egresoCantidadPreview} {materialEgresoSeleccionado.unidad_medida}</b> del stock.</>}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", placeItems: "center", minHeight: 120, textAlign: "center", color: C.dim, fontSize: 13, lineHeight: 1.45 }}>
                          Elegí un material para ver cuánto stock hay antes de retirarlo.
                        </div>
                      )}
                    </aside>
                  </div>
                </section>
              )}

              <section style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                <div style={{
                  padding: 16,
                  borderBottom: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}>
                  <div>
                    <h3 style={{ margin: 0, color: C.text, fontSize: 16, fontWeight: 850 }}>Historial de egresos</h3>
                    <p style={{ margin: "4px 0 0", color: C.dim, fontSize: 13 }}>Últimos 50 movimientos de salida</p>
                  </div>
                </div>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Fecha</th>
                      <th style={S.th}>Material</th>
                      <th style={S.th}>Cantidad</th>
                      <th style={S.th}>Destino</th>
                      <th style={S.th}>Persona</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.filter(m => movTipo(m) === "egreso").slice(0, 50).map(m => (
                      <tr key={m.id}>
                        <td style={S.td}>{fmtDate(m.fecha || m.created_at)}</td>
                        <td style={S.td}>{m.materiales?.nombre ?? "—"}</td>
                        <td style={S.td}><b style={{ color: "#ef4444" }}>-{fmtQty(movCantidad(m))}</b></td>
                        <td style={S.td}>{m.destino ?? m.obra ?? "—"}</td>
                        <td style={S.td}>{movPersona(m) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          )}

          {/* TAB MOVIMIENTOS */}
          {tab === "Movimientos" && (
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ margin: 0, color: "var(--text)" }}>
                  Historial de movimientos
                  <span style={{ ...S.small, marginLeft: 8 }}>({movFiltrados.length} de {movimientos.length})</span>
                </h3>
                <button onClick={() => {
                  const filas = movFiltrados.map(m => ({
                    Fecha: m.fecha || m.created_at ? new Date(m.fecha || m.created_at).toLocaleDateString("es-AR") : "—",
                    Tipo: movTipo(m) === "ingreso" ? "Ingreso" : "Egreso",
                    Material: m.materiales?.nombre ?? "—",
                    Cantidad: movTipo(m) === "ingreso" ? movCantidad(m) : -movCantidad(m),
                    Unidad: m.materiales?.unidad_medida ?? "—",
                    Proveedor: movTipo(m) === "ingreso" ? (m.proveedor ?? m.obra ?? "—") : "—",
                    Destino: movTipo(m) === "egreso" ? (m.destino ?? m.obra ?? "—") : "—",
                    Persona: movPersona(m) || "—",
                    Obra: m.obra ?? "—",
                    Observaciones: movObs(m) || "—",
                  }));
                  const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
                  descargarCSV(filas, `movimientos_maderas_${hoy}.csv`);
                }} disabled={!movFiltrados.length} style={S.btnExport}>
                  CSV
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                <select style={S.input} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                  <option value="todos">Todos los tipos</option>
                  <option value="ingreso">Solo ingresos</option>
                  <option value="egreso">Solo egresos</option>
                </select>
                <select style={S.input} value={filtroMatId} onChange={e => setFiltroMatId(e.target.value)}>
                  <option value="">Todos los materiales</option>
                  {materiales.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
                <input style={S.input} placeholder="Buscar en movimientos..." value={qMov} onChange={e => setQMov(e.target.value)} />
                <select style={S.input} value={movSort} onChange={e => setMovSort(e.target.value)}>
                  <option value="fecha_desc">Más recientes</option>
                  <option value="fecha_asc">Más antiguos</option>
                </select>
              </div>

              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Fecha</th>
                    <th style={S.th}>Tipo</th>
                    <th style={S.th}>Material</th>
                    <th style={S.th}>Cantidad</th>
                    <th style={S.th}>Proveedor/Destino</th>
                    <th style={S.th}>Persona</th>
                    <th style={S.th}>Obra</th>
                  </tr>
                </thead>
                <tbody>
                  {movFiltrados.slice(0, 100).map(m => (
                    <tr key={m.id}>
                      <td style={S.td}>{fmtDate(m.fecha || m.created_at)}</td>
                      <td style={S.td}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background: movTipo(m) === "ingreso" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                          color: movTipo(m) === "ingreso" ? "#10b981" : "#ef4444",
                        }}>
                          {movTipo(m) === "ingreso" ? "Ingreso" : "Egreso"}
                        </span>
                      </td>
                      <td style={S.td}>{m.materiales?.nombre ?? "—"}</td>
                      <td style={S.td}>
                        <b style={{ color: movTipo(m) === "ingreso" ? "#10b981" : "#ef4444" }}>
                          {movTipo(m) === "ingreso" ? "+" : "-"}{fmtQty(movCantidad(m))}
                        </b>
                      </td>
                      <td style={S.td}>{movTipo(m) === "ingreso" ? (m.proveedor ?? m.obra ?? "—") : (m.destino ?? m.obra ?? "—")}</td>
                      <td style={S.td}>{movPersona(m) || "—"}</td>
                      <td style={S.td}>{m.obra ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB PEDIDOS */}
          {tab === "Pedidos" && (
            <PedidosMaderaScreen profile={profile} signOut={signOut} embedded />
          )}
        </div>
      </div>

      {showAjuste && (
        <AjusteMaderasModal
          materiales={materiales}
          stockPorMaterial={stockPorMaterial}
          onClose={() => setShowAjuste(false)}
          onAdjusted={cargar}
        />
      )}
    </div>
  );
}
