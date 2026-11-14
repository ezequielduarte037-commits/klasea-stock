import { createElement, useCallback, useEffect, useId, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, Check, ClipboardList, Layers, Package, RefreshCw, ShoppingCart } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { hasAdminAccess } from "@/lib/permissions";
import Cargando from "@/components/ui/Cargando";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import AjusteMaderasModal from "@/features/inventario/AjusteMaderasModal";
import PedirAComprasModal from "@/features/compras/PedirAComprasModal";
import { addRequestItem, createPurchaseRequest, notifyComprasEmail } from "@/features/compras/purchaseRequestsApi";
import { CSS_LAMINACION } from "@/features/laminacion/estilos";
import { fmtNum, hoyISO, num } from "@/features/laminacion/obras";
import { Aviso, Modal } from "@/features/laminacion/ui";
import { CSS_MADERAS } from "./estilos";
import {
  PEDIDO_ABIERTO, STOCK_MADERAS, estadoPedido, itemFalta, itemPendiente, itemRecibido, itemTotal,
  movCantidad, movDelta, movEntregadoPor, movFecha, movObs, movPersona, movTipo, obraDeCategoria,
  obrasDeMaderas, obsVisible, personaVisible,
} from "./datos";
import { borradorVacio } from "./pedidos/borrador";
import { cargarListasMuebles } from "./pedidos/listasMuebles";
import { useRetiroNfc } from "./retiroNfc";
import StockTab from "./tabs/StockTab";
import IngresosTab from "./tabs/IngresosTab";
import EgresosTab from "./tabs/EgresosTab";
import MovimientosTab from "./tabs/MovimientosTab";
import PedidosTab from "./tabs/PedidosTab";

const ICONOS = { Stock: Boxes, Ingresos: ArrowDownToLine, Egresos: ArrowUpFromLine, Movimientos: Layers, Pedidos: ShoppingCart };
const CORTO = { Movimientos: "Movim." };
// Estados de Compras en los que todavía no se compró nada.
const SIN_COMPRAR = new Set(["nuevo", "en_revision", "cotizando"]);
const EGRESO_VACIO =(fecha = hoyISO()) => ({ material_id: "", cantidad: "", fecha, destino: "", nombre_persona: "", observaciones: "" });

// Dos tablones con su veta: el mismo dibujo del menú lateral.
function Tablones({ size = 17 }) {
  const p = { stroke: "currentColor", fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="4" width="13" height="3.4" rx="1.2" {...p} />
      <rect x="1.5" y="8.6" width="13" height="3.4" rx="1.2" {...p} />
      <path d="M4.5 5.7h4M4.5 10.3h6" {...p} />
    </svg>
  );
}

/**
 * Maderas: stock, ingresos, egresos, movimientos y pedidos del depósito de
 * maderas. Mismo lenguaje que Laminación (usa sus estilos .lam-… y sus piezas)
 * con lo propio de maderas en estilos.js (.mad-…).
 *
 * El stock es `materiales.stock_actual`; cada entrada o salida queda en
 * `movimientos` con su delta. Los pedidos (`pedidos` + `pedido_items`) salen a
 * Compras al crearse y se reciben en Ingresos, renglón por renglón.
 */
export default function MaderasScreen({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const confirmar = useConfirm();
  const idCanal = useId();
  const role = profile?.role ?? "invitado";
  const isAdmin = hasAdminAccess(profile);
  const puedeCargar = isAdmin || role === "panol";
  const puedeGestionar = isAdmin || role === "admin" || role === "oficina" || role === "tecnica";

  // Pañol ve Stock, Ingresos y Egresos.
  const esPanol = role === "panol" && !isAdmin;
  const tabsDisponibles = esPanol ? ["Stock", "Ingresos", "Egresos"] : ["Stock", "Ingresos", "Egresos", "Movimientos", "Pedidos"];
  const pedida = new URLSearchParams(location.search).get("tab");
  const tab = tabsDisponibles.includes(pedida) ? pedida : tabsDisponibles[0];
  // La pestaña queda en la URL: al recargar o compartir el link se vuelve a la misma.
  const irA = useCallback((t) => navigate({ search: `?tab=${t}` }, { replace: true }), [navigate]);

  const [materiales, setMateriales] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [pedidoItems, setPedidoItems] = useState([]);
  const [estadoCompras, setEstadoCompras] = useState({});
  const [estadoRenglonesCompras, setEstadoRenglonesCompras] = useState({});
  const [obrasProduccion, setObrasProduccion] = useState([]);
  const [muebles, setMuebles] = useState({ lineas: [], ots: [], lotes: [] });
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [showAjuste, setShowAjuste] = useState(false);
  const [conf, setConf] = useState(null);
  const [recibiendo, setRecibiendo] = useState(false);
  const [comprasModal, setComprasModal] = useState({ open: false, prefilled: null });
  const [borrador, setBorrador] = useState(borradorVacio);
  const [recienCreado, setRecienCreado] = useState(null);
  const [formEgreso, setFormEgreso] = useState(() => EGRESO_VACIO());

  // ── Carga ──────────────────────────────────────────────────────────────
  const cargarStock = useCallback(async () => {
    const [mats, movs] = await Promise.all([
      supabase.from("materiales").select("*").order("nombre"),
      supabase.from("movimientos").select("*, materiales(nombre, unidad_medida)").order("created_at", { ascending: false }).limit(10000),
    ]);
    if (mats.error || movs.error) {
      setErr((mats.error || movs.error).message || "No se pudo leer el stock de maderas.");
      return;
    }
    setMateriales(mats.data ?? []);
    setMovimientos(movs.data ?? []);
  }, []);

  const cargarPedidos = useCallback(async () => {
    const { data: peds, error } = await supabase
      .from("pedidos")
      .select("*")
      .order("fecha_pedido", { ascending: false })
      .order("creado_en", { ascending: false })
      .limit(300);
    if (error) { setErr(error.message); return; }
    const filas = peds ?? [];
    const ids = filas.map((p) => p.id);
    const prIds = [...new Set(filas.map((p) => p.purchase_request_id).filter(Boolean))];
    const [items, prs] = await Promise.all([
      ids.length ? supabase.from("pedido_items").select("*").in("pedido_id", ids).order("creado_en") : { data: [] },
      prIds.length ? supabase.from("purchase_requests").select("id,status").in("id", prIds) : { data: [] },
    ]);
    // Estado de cada renglón en Compras: si Compras cancela uno (o el pedido
    // entero), acá deja de esperarse. Sólo hacen falta los de pedidos abiertos.
    const abiertos = new Set(filas.filter((p) => PEDIDO_ABIERTO.has(String(p.estado || "").toLowerCase())).map((p) => p.id));
    const priIds = (items.data ?? []).filter((it) => abiertos.has(it.pedido_id) && it.purchase_request_item_id).map((it) => it.purchase_request_item_id);
    const pris = priIds.length ? await supabase.from("purchase_request_items").select("id,status").in("id", priIds) : { data: [] };
    setPedidos(filas);
    setPedidoItems(items.data ?? []);
    setEstadoCompras(Object.fromEntries((prs.data ?? []).map((r) => [r.id, r.status])));
    setEstadoRenglonesCompras(Object.fromEntries((pris.data ?? []).map((r) => [r.id, r.status])));
  }, []);

  // Obras de Producción y, de Muebles, las listas estándar de maderas por
  // línea y en qué etapa está cada barco (para "Barcos que faltan pedir").
  const cargarObras = useCallback(async () => {
    const [{ data }, listas] = await Promise.all([
      supabase
        .from("produccion_obras")
        .select("id,codigo,linea_nombre,estado,desmolde_estimado,desmolde_real,solo_stock")
        .neq("estado", "archivada")
        .order("codigo"),
      cargarListasMuebles(),
    ]);
    setObrasProduccion(data ?? []);
    setMuebles(listas);
  }, []);

  const cargar = useCallback(async () => {
    setErr("");
    await Promise.all([cargarStock(), cargarPedidos(), cargarObras()]);
    setCargando(false);
  }, [cargarStock, cargarPedidos, cargarObras]);

  // Un solo canal, con recarga por tabla y sin recargar en segundo plano:
  // "movimientos" es de las tablas con más movimiento del sistema.
  useEffect(() => {
    const inicial = window.setTimeout(() => { void cargar(); }, 0);
    const timers = new Map();
    const pendientes = new Set();
    const tareas = { stock: cargarStock, pedidos: cargarPedidos, obras: cargarObras };
    const programar = (clave) => {
      if (document.visibilityState !== "visible") { pendientes.add(clave); return; }
      window.clearTimeout(timers.get(clave));
      timers.set(clave, window.setTimeout(() => { timers.delete(clave); void tareas[clave](); }, 500));
    };
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      for (const clave of pendientes) programar(clave);
      pendientes.clear();
    };
    document.addEventListener("visibilitychange", alVolver);
    const ch = supabase
      .channel(`rt-maderas-${idCanal}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "materiales" }, () => programar("stock"))
      .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, () => programar("stock"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => programar("pedidos"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_items" }, () => programar("pedidos"))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "purchase_requests" }, () => programar("pedidos"))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "purchase_request_items" }, () => programar("pedidos"))
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_obras" }, () => programar("obras"))
      .subscribe();
    return () => {
      window.clearTimeout(inicial);
      timers.forEach((t) => window.clearTimeout(t));
      document.removeEventListener("visibilitychange", alVolver);
      supabase.removeChannel(ch);
    };
  }, [cargar, cargarStock, cargarPedidos, cargarObras, idCanal]);

  // ── Derivados ──────────────────────────────────────────────────────────
  const stockPorMaterial = useMemo(() => {
    const map = {};
    for (const m of materiales) map[m.id] = num(m.stock_actual);
    return map;
  }, [materiales]);

  const movs = useMemo(() => movimientos.map((m) => {
    const delta = movDelta(m);
    const obs = movObs(m);
    return {
      ...m,
      _tipo: movTipo(m),
      _delta: delta,
      _cant: movCantidad(m),
      _fecha: movFecha(m),
      _persona: personaVisible(movPersona(m)),
      _entrego: personaVisible(movEntregadoPor(m)),
      _obs: obs,
      _obsVisible: obsVisible(obs),
      _material: m.materiales?.nombre ?? "—",
      _unidad: m.materiales?.unidad_medida ?? "",
    };
  }), [movimientos]);

  const obras = useMemo(() => obrasDeMaderas(obrasProduccion), [obrasProduccion]);

  const pedidosVistos = useMemo(() => {
    const porPedido = new Map();
    for (const it of pedidoItems) {
      if (!porPedido.has(it.pedido_id)) porPedido.set(it.pedido_id, []);
      porPedido.get(it.pedido_id).push(it);
    }
    return pedidos.map((p) => {
      const pedidoCancelado = estadoCompras[p.purchase_request_id] === "cancelado";
      const items = (porPedido.get(p.id) ?? []).map((it) => {
        const enCompras = estadoRenglonesCompras[it.purchase_request_item_id];
        // Lo que ya llegó entero no se "cancela": quedó recibido.
        const cancelado = (pedidoCancelado || enCompras === "cancelado") && itemFalta(it) > 0 && !it.nota_recepcion;
        return cancelado ? { ...it, _cancelado: true } : it;
      });
      return { ...p, items, estadoVisto: estadoPedido(p, items) };
    });
  }, [pedidos, pedidoItems, estadoCompras, estadoRenglonesCompras]);

  const pedidosParaRecibir = useMemo(() => pedidosVistos
    .filter((p) => PEDIDO_ABIERTO.has(String(p.estado || "").toLowerCase()))
    .map((p) => ({ ...p, pendientes: p.items.filter(itemPendiente) }))
    .filter((p) => p.pendientes.length > 0), [pedidosVistos]);

  // Lo que todavía tiene que llegar de cada material.
  const enCaminoPorMaterial = useMemo(() => {
    const map = {};
    for (const p of pedidosParaRecibir) {
      for (const it of p.pendientes) {
        if (it.material_id) map[it.material_id] = (map[it.material_id] ?? 0) + itemFalta(it);
      }
    }
    return map;
  }, [pedidosParaRecibir]);

  const renglonesParaRecibir = pedidosParaRecibir.reduce((s, p) => s + p.pendientes.length, 0);

  async function getUserId() {
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    return data?.session?.user?.id ?? null;
  }

  // ── Movimientos de stock ───────────────────────────────────────────────
  // Primero la función de la base (la misma que usa el pañol); si no está,
  // stock + movimiento a mano. El stock se lee recién antes de escribirlo: con
  // el que había en pantalla, dos cargas seguidas se pisaban.
  async function insertarMovimientoMadera({ materialId, delta, fecha, proveedor, persona, obra, observaciones }) {
    const nota = [observaciones || "", fecha && fecha !== hoyISO() ? `Fecha operativa: ${fecha}` : ""]
      .filter(Boolean).join(" · ") || null;

    const rpc = await supabase.rpc("registrar_movimiento", {
      p_material_id: materialId,
      p_delta: delta,
      p_obra: obra || null,
      p_usuario: delta < 0 ? (persona || null) : null,
      p_entregado_por: null,
      p_proveedor: delta > 0 ? (proveedor || null) : null,
      p_recibe: delta > 0 ? (persona || null) : null,
      p_obs: nota,
    });
    if (!rpc.error) return;

    const { data: actual, error: errLectura } = await supabase.from("materiales").select("stock_actual").eq("id", materialId).maybeSingle();
    if (errLectura) throw errLectura;
    const base = actual ? num(actual.stock_actual) : num(materiales.find((m) => String(m.id) === String(materialId))?.stock_actual);
    const up = await supabase.from("materiales").update({ stock_actual: base + delta }).eq("id", materialId);
    if (up.error) throw up.error;

    const { error } = await supabase.from("movimientos").insert({
      material_id: materialId,
      delta,
      obra: obra || null,
      usuario: delta < 0 ? (persona || null) : null,
      proveedor: delta > 0 ? (proveedor || null) : null,
      recibe: delta > 0 ? (persona || null) : null,
      obs: nota,
    });
    if (error) throw error;
  }

  async function crearIngreso(form) {
    const mat = materiales.find((m) => String(m.id) === String(form.material_id));
    const cantidad = num(form.cantidad);
    if (!mat) { toast.error("Elegí un material."); return false; }
    if (cantidad <= 0 || !Number.isInteger(cantidad)) { toast.error("La cantidad tiene que ser un número entero mayor a cero."); return false; }
    try {
      await insertarMovimientoMadera({
        materialId: mat.id,
        delta: cantidad,
        fecha: form.fecha,
        proveedor: form.proveedor.trim(),
        obra: form.obra.trim(),
        observaciones: form.observaciones.trim(),
      });
    } catch (error) {
      toast.error(error.message || "No se pudo registrar el ingreso.");
      return false;
    }
    toast.success(`Ingreso registrado · +${fmtNum(cantidad)} ${mat.unidad_medida} de ${mat.nombre}`);
    void cargarStock();
    return true;
  }

  // ── Egreso ─────────────────────────────────────────────────────────────
  // La tarjeta completa el nombre tal cual está en RRHH (el DNI y la tarjeta
  // quedan en la nota del movimiento).
  const alLeerTarjeta = useCallback((emp) => {
    setFormEgreso((f) => ({ ...f, nombre_persona: String(emp.nombre || "").trim() }));
    toast.success(`Retira: ${emp.nombre}`);
  }, [toast]);
  const alFallarTarjeta = useCallback((texto) => toast.error(texto), [toast]);
  const nfc = useRetiroNfc({ enabled: puedeCargar && tab === "Egresos", onEmpleado: alLeerTarjeta, onError: alFallarTarjeta });

  async function crearEgreso() {
    const form = formEgreso;
    const mat = materiales.find((m) => String(m.id) === String(form.material_id));
    const cantidad = num(form.cantidad);
    if (!form.destino.trim()) { toast.error("Elegí para qué obra o destino sale."); return false; }
    if (!mat) { toast.error("Elegí un material."); return false; }
    if (cantidad <= 0 || !Number.isInteger(cantidad)) { toast.error("La cantidad tiene que ser un número entero mayor a cero."); return false; }
    const disponible = num(stockPorMaterial[mat.id]);
    if (cantidad > disponible) {
      const ok = await confirmar({
        title: "La salida supera el stock",
        message: `Hay ${fmtNum(disponible)} ${mat.unidad_medida} de ${mat.nombre} y estás retirando ${fmtNum(cantidad)}. El stock va a quedar en ${fmtNum(disponible - cantidad)}. ¿Registrar igual?`,
        confirmLabel: "Registrar igual",
      });
      if (!ok) return false;
    }
    const nfcObs = nfc.empleado
      ? `Retiro NFC: ${nfc.empleado.nombre}${nfc.empleado.dni ? ` DNI ${nfc.empleado.dni}` : ""}${nfc.code ? ` tarjeta ${nfc.code}` : ""}`
      : "";
    try {
      await insertarMovimientoMadera({
        materialId: mat.id,
        delta: -cantidad,
        fecha: form.fecha,
        obra: form.destino.trim(),
        persona: form.nombre_persona.trim(),
        observaciones: [form.observaciones.trim(), nfcObs].filter(Boolean).join(" · "),
      });
    } catch (error) {
      toast.error(error.message || "No se pudo registrar el egreso.");
      return false;
    }
    toast.success(`Egreso registrado · ${fmtNum(cantidad)} ${mat.unidad_medida} de ${mat.nombre} para ${form.destino.trim()}`);
    setFormEgreso((f) => EGRESO_VACIO(f.fecha));
    nfc.clear();
    void cargarStock();
    return true;
  }

  // ── Recepción de pedidos ───────────────────────────────────────────────
  // entregas = [{ item, cantidad }]. Por renglón: se marca lo recibido y se
  // suma al stock; si el stock falla, el renglón vuelve como estaba (antes
  // quedaba "recibido" sin haber sumado nada). Al final, el estado del pedido.
  async function recibirRenglones(pedido, entregas) {
    const userId = await getUserId();
    const fechaTexto = new Date().toLocaleDateString("es-AR");
    const cambios = new Map();
    let unidades = 0;
    for (const { item, cantidad } of entregas) {
      const mat = materiales.find((m) => String(m.id) === String(item.material_id));
      if (!mat) continue;
      const total = itemTotal(item);
      const recibidoAntes = itemRecibido(item);
      const cant = Math.min(num(cantidad), Math.max(0, total - recibidoAntes));
      if (cant <= 0) continue;
      const recibidoNuevo = recibidoAntes + cant;
      const completo = recibidoNuevo >= total;
      const unidad = item.unidad || mat.unidad_medida || "";
      const patch = {
        cantidad_recibida: completo ? total : recibidoNuevo,
        nota_recepcion: completo ? `Recibido: ${fmtNum(total)} ${unidad} - ${fechaTexto}` : null,
      };
      const { data: hecho, error: errItem } = await supabase.from("pedido_items").update(patch).eq("id", item.id).select("id").maybeSingle();
      if (errItem || !hecho) throw new Error(`No se pudo marcar ${item.descripcion} como recibido${errItem ? `: ${errItem.message}` : "."}`);
      try {
        await insertarMovimientoMadera({
          materialId: mat.id,
          delta: cant,
          fecha: hoyISO(),
          proveedor: pedido.proveedor && pedido.proveedor !== "Pendiente" ? pedido.proveedor : "Compras",
          obra: obraDeCategoria(item.categoria) || item.categoria || pedido.nota || "",
          observaciones: [
            completo
              ? `Recepción completa pedido madera ${pedido.nota || pedido.id}`
              : `Recepción parcial pedido madera ${pedido.nota || pedido.id}: ${fmtNum(recibidoNuevo)} de ${fmtNum(total)} ${unidad}`,
            `pedido_item:${item.id}`,
          ].join(" · "),
        });
      } catch (error) {
        await supabase.from("pedido_items")
          .update({ cantidad_recibida: num(item.cantidad_recibida), nota_recepcion: item.nota_recepcion ?? null })
          .eq("id", item.id);
        throw new Error(`${item.descripcion}: no se pudo sumar al stock (${error.message || "error"}). El renglón quedó como estaba.`);
      }
      cambios.set(item.id, patch);
      unidades += cant;
    }
    if (!cambios.size) return { renglones: 0, unidades: 0, quedan: null };

    const quedan = pedido.items
      .map((it) => (cambios.has(it.id) ? { ...it, ...cambios.get(it.id) } : it))
      .filter(itemPendiente).length;
    const patchPedido = quedan > 0
      ? { estado: "parcial" }
      : { estado: "recibido", recibido_en: new Date().toISOString(), recibido_por: userId };
    const { error: errPedido } = await supabase.from("pedidos").update(patchPedido).eq("id", pedido.id);
    if (errPedido) throw new Error(`Se recibió, pero no se pudo actualizar el estado del pedido: ${errPedido.message}`);
    return { renglones: cambios.size, unidades, quedan };
  }

  async function confirmarRecepcion() {
    if (!conf || recibiendo) return;
    const { tipo, pedido } = conf;
    let entregas = [];
    if (tipo === "entero") entregas = [{ item: conf.item, cantidad: itemFalta(conf.item) }];
    else if (tipo === "parcial") {
      const cant = num(conf.cantidad);
      const falta = itemFalta(conf.item);
      if (cant <= 0 || !Number.isInteger(cant)) { toast.error("Cargá cuánto llegó (número entero)."); return; }
      if (cant > falta) { toast.error(`Llegó más de lo que falta (${fmtNum(falta)}). Si vino de más, registrá el resto como ingreso manual.`); return; }
      entregas = [{ item: conf.item, cantidad: cant }];
    } else if (tipo === "pedido_completo") {
      // conf.items: los renglones de la tarjeta (un destino del pedido).
      entregas = (conf.items ?? pedido.pendientes).filter((it) => it.material_id).map((it) => ({ item: it, cantidad: itemFalta(it) }));
    } else if (tipo === "pedido_parcial") {
      for (const it of (conf.items ?? pedido.pendientes).filter((x) => x.material_id)) {
        const cant = num(conf.cantidades[it.id]);
        if (cant <= 0) continue;
        if (!Number.isInteger(cant)) { toast.error(`${it.descripcion}: la cantidad va en números enteros.`); return; }
        if (cant > itemFalta(it)) { toast.error(`${it.descripcion}: llegó más de lo que falta (${fmtNum(itemFalta(it))}).`); return; }
        entregas.push({ item: it, cantidad: cant });
      }
      if (!entregas.length) { toast.error("Cargá al menos una cantidad."); return; }
    }

    setRecibiendo(true);
    try {
      const res = await recibirRenglones(pedido, entregas);
      if (!res.renglones) toast.info("No había nada para sumar.");
      else if (res.quedan === 0) toast.success(`Pedido completo · ${res.renglones} ${res.renglones === 1 ? "material sumado" : "materiales sumados"} al stock`);
      else toast.success(`Recibido · ${fmtNum(res.unidades)} ${res.unidades === 1 ? "unidad" : "unidades"} al stock · ${res.quedan} ${res.quedan === 1 ? "renglón sigue" : "renglones siguen"} pendiente${res.quedan === 1 ? "" : "s"}`);
      setConf(null);
    } catch (error) {
      toast.error(error.message || "No se pudo registrar la recepción.");
    } finally {
      setRecibiendo(false);
      void cargarPedidos();
      void cargarStock();
    }
  }

  async function vincularRenglon(item, materialId) {
    const mat = materiales.find((m) => String(m.id) === String(materialId));
    if (!mat) return;
    const ok = await confirmar({
      title: "Vincular con el catálogo",
      message: `«${item.descripcion}» se va a recibir como ${mat.nombre} (${mat.unidad_medida}) y va a sumar a su stock.`,
      confirmLabel: "Vincular",
    });
    if (!ok) return;
    const { error } = await supabase.from("pedido_items").update({ material_id: mat.id }).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Vinculado con ${mat.nombre}`);
    void cargarPedidos();
  }

  // ── Pedidos ────────────────────────────────────────────────────────────
  // Crea las tres cosas que tienen que existir juntas: el pedido (lo recibe el
  // pañol en Ingresos), el pedido en Compras y un renglón de Compras por
  // material, atado al renglón del pedido. Compras va como best-effort: si
  // falla, el pedido queda y se puede mandar después desde la lista.
  async function generarPedido({ grupos, mail, urgente }) {
    const userId = await getUserId();
    const nombresObras = grupos.filter((g) => g.tipo === "obra").map((g) => g.obra);
    const hayStock = grupos.some((g) => g.tipo === "stock");
    const nota = [nombresObras.length ? `Obras: ${nombresObras.join(", ")}` : "", hayStock ? "Stock" : ""]
      .filter(Boolean).join(" + ") || "Pedido de madera";
    const titulo = `Pedido Maderas — ${nota}`;

    const { data: ped, error: errPed } = await supabase
      .from("pedidos")
      .insert({ proveedor: "Pendiente", nota, estado: "pedido", fecha_pedido: hoyISO(), creado_por: userId })
      .select("*")
      .single();
    if (errPed) { toast.error(errPed.message); return false; }

    let request = null;
    try {
      request = await createPurchaseRequest({
        form: { title: titulo, description: mail, priority: urgente ? "urgente" : "media", project_id: null, source: "madera", source_ref: ped.id },
      });
      await supabase.from("pedidos").update({ purchase_request_id: request.id }).eq("id", ped.id);
    } catch (e) {
      console.warn("[Maderas] no se pudo crear el pedido a Compras:", e);
    }

    const filas = [];
    for (const g of grupos) {
      const categoria = g.tipo === "stock" ? "Stock" : `Obra: ${g.obra}`;
      for (const it of g.items) {
        let reqItemId = null;
        if (request) {
          try {
            const reqItem = await addRequestItem(request.id, {
              description: it.descripcion,
              quantity: it.cantidad,
              unit: it.unidad,
              destination: g.tipo === "stock" ? STOCK_MADERAS : `Obra ${g.obra}`,
              notes: g.recibirEn ? `${categoria} · recibir en ${g.recibirEn}` : categoria,
              material_id: it.material_id || null,
              catalog_source: "madera",
            });
            reqItemId = reqItem?.id || null;
          } catch (e) {
            console.warn("[Maderas] no se pudo crear el renglón en Compras:", e);
          }
        }
        filas.push({
          pedido_id: ped.id,
          material_id: it.material_id || null,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          unidad: it.unidad,
          categoria,
          purchase_request_item_id: reqItemId,
        });
      }
    }
    const { error: errItems } = await supabase.from("pedido_items").insert(filas);
    if (errItems) {
      // Sin renglones el pedido no sirve: se borra para no dejar uno vacío.
      await supabase.from("pedidos").delete().eq("id", ped.id);
      toast.error(`No se pudo guardar el pedido: ${errItems.message}${request ? " (en Compras quedó creado: avisales)" : ""}`);
      void cargarPedidos();
      return false;
    }

    if (request) {
      notifyComprasEmail({
        type: "new_request",
        requestId: request.id,
        requestTitle: titulo,
        changedBy: userId,
        createdByName: profile?.username || "Usuario",
        source: "madera",
      });
      toast.success(`Pedido mandado a Compras · ${filas.length} ${filas.length === 1 ? "material" : "materiales"}`);
    } else {
      toast.warning("El pedido quedó registrado, pero no se pudo mandar a Compras. Mandalo desde la lista de pedidos.");
    }
    setRecienCreado(ped.id);
    void cargarPedidos();
    return true;
  }

  async function cerrarPedido(p) {
    const faltan = p.items.filter(itemPendiente);
    const ok = await confirmar({
      title: "¿Cerrar el pedido sin completarlo?",
      message: `${faltan.length} ${faltan.length === 1 ? "material no llegó" : "materiales no llegaron"} (${faltan.map((it) => it.descripcion).join(", ")}). Sale de Ingresos y deja de contar como «en camino». No toca el stock ni Compras.`,
      confirmLabel: "Cerrar pedido",
    });
    if (!ok) return;
    const userId = await getUserId();
    const { error } = await supabase.from("pedidos").update({ estado: "recibido", recibido_por: userId }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pedido cerrado");
    void cargarPedidos();
  }

  async function reabrirPedido(p) {
    const algo = p.items.some((it) => itemRecibido(it) > 0);
    const { error } = await supabase.from("pedidos").update({ estado: algo ? "parcial" : "pedido", recibido_en: null, recibido_por: null }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pedido reabierto: vuelve a Ingresos para recibir lo que falta");
    void cargarPedidos();
  }

  // Si Compras todavía no lo compró, borrar acá también lo cancela allá: si no,
  // Compras compraría algo que ya no se necesita. Si ya lo compró, no se toca
  // (hay que avisarles).
  async function eliminarPedido(p) {
    const recibidos = p.items.filter((it) => itemRecibido(it) > 0).length;
    const estadoPr = estadoCompras[p.purchase_request_id];
    const cancelaEnCompras = Boolean(p.purchase_request_id) && SIN_COMPRAR.has(estadoPr);
    const ok = await confirmar({
      title: "¿Eliminar el pedido?",
      message: [
        `Se borra el pedido del ${new Date(`${p.fecha_pedido}T00:00:00`).toLocaleDateString("es-AR")} con sus ${p.items.length} ${p.items.length === 1 ? "material" : "materiales"}.`,
        recibidos ? `Ya se recibieron ${recibidos}: lo que sumaron al stock no se toca.` : "",
        cancelaEnCompras ? "Compras todavía no lo compró: el pedido también queda cancelado en Compras." : "",
        estadoPr === "comprado" ? "Ojo: Compras ya lo compró. Allá sigue como está; avisales." : "",
        "No se puede deshacer.",
      ].filter(Boolean).join(" "),
      confirmLabel: cancelaEnCompras ? "Eliminar y cancelar en Compras" : "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    if (cancelaEnCompras) {
      const { error: errPr } = await supabase.from("purchase_requests").update({ status: "cancelado" }).eq("id", p.purchase_request_id);
      if (errPr) { toast.error(`No se pudo cancelar en Compras: ${errPr.message}. El pedido no se borró.`); return; }
    }
    const { data, error } = await supabase.from("pedidos").delete().eq("id", p.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("No se pudo eliminar el pedido."); return; }
    toast.success(cancelaEnCompras ? "Pedido eliminado y cancelado en Compras" : "Pedido eliminado");
    void cargarPedidos();
  }

  // Sacar un renglón que no va (por ejemplo, algo que se cargó de más). En
  // Compras el renglón queda cancelado para que no lo compren.
  async function quitarRenglon(p, item) {
    const vivos = p.items.filter((it) => !it._cancelado);
    if (vivos.length <= 1) { void eliminarPedido(p); return; }
    const estadoPr = estadoCompras[p.purchase_request_id];
    const avisoCompras = !item.purchase_request_item_id ? ""
      : estadoPr === "comprado" ? " Compras ya compró el pedido: el renglón queda cancelado allá, pero avisales."
      : " En Compras el renglón queda cancelado.";
    const ok = await confirmar({
      title: `¿Sacar ${item.descripcion} del pedido?`,
      message: `${fmtNum(item.cantidad)} ${item.unidad} · ${obraDeCategoria(item.categoria) ? `obra ${obraDeCategoria(item.categoria)}` : "stock"}.${avisoCompras}`,
      confirmLabel: "Sacar del pedido",
      tone: "danger",
    });
    if (!ok) return;
    if (item.purchase_request_item_id) {
      const { error: errPri } = await supabase.from("purchase_request_items").update({ status: "cancelado" }).eq("id", item.purchase_request_item_id);
      if (errPri) { toast.error(`No se pudo cancelar en Compras: ${errPri.message}. El renglón no se sacó.`); return; }
    }
    const { error } = await supabase.from("pedido_items").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${item.descripcion} salió del pedido`);
    void cargarPedidos();
  }

  // Pedidos viejos que nunca llegaron a Compras: se vinculan sus renglones (no
  // se duplican) gracias a maderaPedidoItemId.
  function mandarACompras(p) {
    const items = p.items.filter(itemPendiente);
    setComprasModal({
      open: true,
      prefilled: {
        title: `Pedido Maderas — ${p.nota || "Pedido de madera"}`,
        description: `Pedido de maderas del ${new Date(`${p.fecha_pedido}T00:00:00`).toLocaleDateString("es-AR")}${p.nota ? `\n${p.nota}` : ""}`,
        source: "madera",
        source_ref: p.id,
        sourceLabel: "Maderas",
        defaultDestination: STOCK_MADERAS,
        items: items.map((it) => {
          const obra = obraDeCategoria(it.categoria);
          return {
            maderaPedidoItemId: it.id,
            maderaPedidoId: p.id,
            material_id: it.material_id || null,
            description: it.descripcion || "",
            quantity: itemFalta(it) || it.cantidad || "",
            unit: it.unidad || "unidad",
            destination: obra ? `Obra ${obra}` : STOCK_MADERAS,
            category: it.categoria || "",
            catalogSource: "madera",
            notes: "",
          };
        }),
      },
    });
  }

  async function cambiarMinimo(material, valor) {
    const { error } = await supabase.from("materiales").update({ stock_minimo: valor }).eq("id", material.id);
    if (error) { toast.error(error.message); return false; }
    toast.success(`Mínimo de ${material.nombre}: ${fmtNum(valor)}`);
    void cargarStock();
    return true;
  }

  return (
    <div className="lam mad">
      <style href="klasea-laminacion" precedence="default">{CSS_LAMINACION}</style>
      <style href="klasea-maderas" precedence="default">{CSS_MADERAS}</style>

      <nav className="lam-nav" aria-label="Maderas">
        <span className="lam-nav-marca">
          <Tablones /> <span className="lam-nav-txt">Maderas</span>
        </span>
        <span className="lam-nav-sep" />
        <div className="ui-tabs" role="tablist">
          {tabsDisponibles.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className="ui-tab"
              style={{ position: "relative" }}
              onClick={() => irA(t)}
            >
              {createElement(ICONOS[t] || ClipboardList, { size: 15 })}
              {CORTO[t] ? <span><span className="txt-largo">{t}</span><span className="txt-corto">{CORTO[t]}</span></span> : <span>{t}</span>}
              {t === "Ingresos" && renglonesParaRecibir > 0 && <span className="n" title="Materiales pedidos para recibir">{renglonesParaRecibir}</span>}
            </button>
          ))}
        </div>
        <div className="lam-nav-acc">
          <button type="button" className="lam-btn-ic" onClick={() => cargar()} title="Volver a leer los datos" aria-label="Volver a leer los datos">
            <RefreshCw size={15} />
          </button>
        </div>
      </nav>

      <div className="lam-vista" key={tab}>
        <div className="lam-pagina">
          {err && <Aviso onCerrar={() => setErr("")}>{err}</Aviso>}

          {cargando ? <Cargando texto="Trayendo maderas…" /> : (
            <>
              {tab === "Stock" && (
                <StockTab
                  materiales={materiales}
                  stockPorMaterial={stockPorMaterial}
                  enCaminoPorMaterial={enCaminoPorMaterial}
                  isAdmin={isAdmin}
                  onAjuste={() => setShowAjuste(true)}
                  onCambiarMinimo={cambiarMinimo}
                />
              )}
              {tab === "Ingresos" && (
                <IngresosTab
                  materiales={materiales}
                  movs={movs}
                  pedidosParaRecibir={pedidosParaRecibir}
                  stockPorMaterial={stockPorMaterial}
                  obras={obras}
                  estadoCompras={estadoCompras}
                  puedeCargar={puedeCargar}
                  onRecibir={setConf}
                  onVincular={vincularRenglon}
                  onCrearIngreso={crearIngreso}
                />
              )}
              {tab === "Egresos" && (
                <EgresosTab
                  materiales={materiales}
                  movs={movs}
                  stockPorMaterial={stockPorMaterial}
                  enCaminoPorMaterial={enCaminoPorMaterial}
                  obras={obras}
                  puedeCargar={puedeCargar}
                  sedePreferida={["Pampa", "Chubut"].includes(profile?.sede) ? profile.sede : null}
                  form={formEgreso}
                  setForm={setFormEgreso}
                  nfc={nfc}
                  onLimpiarNfc={() => { nfc.clear(); setFormEgreso((f) => ({ ...f, nombre_persona: "" })); }}
                  onCrearEgreso={crearEgreso}
                />
              )}
              {tab === "Movimientos" && <MovimientosTab materiales={materiales} movs={movs} obras={obras} />}
              {tab === "Pedidos" && (
                <PedidosTab
                  materiales={materiales}
                  movimientos={movimientos}
                  stockPorMaterial={stockPorMaterial}
                  enCaminoPorMaterial={enCaminoPorMaterial}
                  obras={obras}
                  pedidos={pedidosVistos}
                  estadoCompras={estadoCompras}
                  muebles={muebles}
                  puedeGestionar={puedeGestionar}
                  borrador={borrador}
                  setBorrador={setBorrador}
                  recienCreado={recienCreado}
                  onGenerar={generarPedido}
                  onCerrar={cerrarPedido}
                  onReabrir={reabrirPedido}
                  onEliminar={eliminarPedido}
                  onQuitarRenglon={quitarRenglon}
                  onEnviarACompras={mandarACompras}
                  onIrIngresos={() => irA("Ingresos")}
                />
              )}
            </>
          )}
        </div>
      </div>

      {showAjuste && (
        <AjusteMaderasModal
          materiales={materiales}
          onClose={() => setShowAjuste(false)}
          onDone={() => { setShowAjuste(false); void cargarStock(); toast.success("Ajuste de inventario aplicado"); }}
        />
      )}

      {conf && (
        <ModalRecepcion
          conf={conf}
          setConf={setConf}
          materiales={materiales}
          stockPorMaterial={stockPorMaterial}
          recibiendo={recibiendo}
          onConfirmar={confirmarRecepcion}
        />
      )}

      <PedirAComprasModal
        open={comprasModal.open}
        prefilled={comprasModal.prefilled}
        profile={profile}
        origen="maderas"
        onClose={(created) => {
          setComprasModal({ open: false, prefilled: null });
          if (created) { toast.success("Pedido mandado a Compras"); void cargarPedidos(); }
        }}
      />
    </div>
  );
}

// ── Confirmar recepción ──────────────────────────────────────────────────
function ModalRecepcion({ conf, setConf, materiales, stockPorMaterial, recibiendo, onConfirmar }) {
  const { tipo, pedido } = conf;
  const matDe = (it) => materiales.find((m) => String(m.id) === String(it.material_id));
  const cerrar = () => setConf(null);
  const ref = `Pedido del ${new Date(`${pedido.fecha_pedido}T00:00:00`).toLocaleDateString("es-AR")}`;
  // La tarjeta de Ingresos es un destino del pedido (una obra o el stock).
  const renglones = conf.items ?? pedido.pendientes;
  const destino = conf.destino || pedido.nota || "maderas";

  if (tipo === "pedido_completo") {
    const recibibles = renglones.filter((it) => it.material_id);
    const sinVinculo = renglones.length - recibibles.length;
    return (
      <Modal
        onCerrar={cerrar}
        bloqueado={recibiendo}
        icono={ArrowDownToLine}
        tono="verde"
        titulo={`Llegó todo · ${destino}`}
        sub={ref}
        pie={(
          <>
            <button type="button" className="ui-btn" onClick={cerrar} disabled={recibiendo}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-primario" onClick={onConfirmar} disabled={recibiendo}>{recibiendo ? "Registrando…" : "Confirmar recepción"}</button>
          </>
        )}
      >
        <div className="lam-lista-mod">
          {recibibles.map((it) => {
            const mat = matDe(it);
            return (
              <div key={it.id}>
                <span>
                  <b style={{ fontWeight: 600 }}>{mat?.nombre ?? it.descripcion}</b>
                  <span className="lam-ayuda" style={{ marginLeft: 8 }}>hay {fmtNum(stockPorMaterial[mat?.id])}</span>
                </span>
                <span className="lam-cant" data-tono="verde">+{fmtNum(itemFalta(it))} <small>{it.unidad}</small></span>
              </div>
            );
          })}
        </div>
        <Aviso tono="verde" icono={Check}>Se suman {recibibles.length} {recibibles.length === 1 ? "material" : "materiales"} al stock y Compras se entera.</Aviso>
        {sinVinculo > 0 && <Aviso tono="violeta">{sinVinculo} {sinVinculo === 1 ? "renglón queda pendiente" : "renglones quedan pendientes"}: no {sinVinculo === 1 ? "está" : "están"} en el catálogo. Vinculalos desde la lista para poder recibirlos.</Aviso>}
      </Modal>
    );
  }

  if (tipo === "pedido_parcial") {
    const recibibles = renglones.filter((it) => it.material_id);
    const alguna = Object.values(conf.cantidades).some((v) => num(v) > 0);
    return (
      <Modal
        ancho
        onCerrar={cerrar}
        bloqueado={recibiendo}
        icono={Package}
        tono="cian"
        titulo={`Llegó una parte · ${destino}`}
        sub={`${ref}. Cargá lo que llegó de cada material; dejá vacío lo que no llegó.`}
        pie={(
          <>
            <button type="button" className="ui-btn" onClick={cerrar} disabled={recibiendo}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-primario" disabled={!alguna || recibiendo} onClick={onConfirmar}>{recibiendo ? "Registrando…" : "Confirmar"}</button>
          </>
        )}
      >
        <div className="lam-lista-mod">
          {recibibles.map((it) => {
            const mat = matDe(it);
            const falta = itemFalta(it);
            const recibido = itemRecibido(it);
            return (
              <div key={it.id}>
                <span>
                  <b style={{ fontWeight: 600 }}>{mat?.nombre ?? it.descripcion}</b>
                  <span style={{ display: "block", fontSize: 12, color: "var(--dim)", marginTop: 2 }}>
                    Pedido {fmtNum(it.cantidad)} {it.unidad}{recibido > 0 ? ` · ya llegaron ${fmtNum(recibido)}` : ""} · faltan {fmtNum(falta)}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number" step="1" min="0" max={falta} inputMode="numeric" placeholder="0"
                    className="ui-input num"
                    style={{ width: 84, minHeight: 36, textAlign: "right" }}
                    value={conf.cantidades[it.id] ?? ""}
                    aria-label={`Cantidad recibida de ${mat?.nombre ?? it.descripcion}`}
                    onChange={(e) => setConf((prev) => ({ ...prev, cantidades: { ...prev.cantidades, [it.id]: e.target.value } }))}
                  />
                  <button type="button" className="ui-btn chico ui-btn-fantasma" title="Llegó todo lo que faltaba" onClick={() => setConf((prev) => ({ ...prev, cantidades: { ...prev.cantidades, [it.id]: String(falta) } }))}>Todo</button>
                </span>
              </div>
            );
          })}
        </div>
        <p className="lam-ayuda">Lo que completa un material lo cierra; lo que no, queda pendiente con lo recibido a la vista.</p>
      </Modal>
    );
  }

  const { item } = conf;
  const mat = matDe(item);
  const falta = itemFalta(item);
  const recibido = itemRecibido(item);
  return (
    <Modal
      onCerrar={cerrar}
      bloqueado={recibiendo}
      icono={tipo === "entero" ? ArrowDownToLine : Package}
      tono={tipo === "entero" ? "verde" : "cian"}
      titulo={tipo === "entero" ? "Llegó el material" : "Llegó una parte"}
      sub={`${mat?.nombre ?? item.descripcion} · pedido ${fmtNum(item.cantidad)} ${item.unidad}${recibido ? ` · ya llegaron ${fmtNum(recibido)}` : ""}`}
      pie={(
        <>
          <button type="button" className="ui-btn" onClick={cerrar} disabled={recibiendo}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" disabled={recibiendo || (tipo === "parcial" && num(conf.cantidad) <= 0)} onClick={onConfirmar}>{recibiendo ? "Registrando…" : "Confirmar"}</button>
        </>
      )}
    >
      {tipo === "parcial" ? (
        <label className="lam-campo c6"><span>Cantidad que llegó ({item.unidad})</span>
          <input
            autoFocus
            className="ui-input num"
            type="number" step="1" min="1" max={falta} inputMode="numeric"
            placeholder={`Faltan ${fmtNum(falta)}`}
            value={conf.cantidad}
            onChange={(e) => setConf((prev) => ({ ...prev, cantidad: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onConfirmar(); } }}
          />
        </label>
      ) : (
        <Aviso tono="verde" icono={Check}>Se suman {fmtNum(falta)} {item.unidad} de {mat?.nombre ?? item.descripcion} al stock y el renglón queda recibido.</Aviso>
      )}
    </Modal>
  );
}
