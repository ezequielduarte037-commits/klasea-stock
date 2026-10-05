import { createElement, useEffect, useId, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardList, Layers, Package, Plus, RefreshCw, ShoppingCart } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { hasAdminAccess } from "@/lib/permissions";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import AjusteInventarioModal from "@/features/inventario/AjusteInventarioModal";
import PedirAComprasModal from "@/features/compras/PedirAComprasModal";
import { createPurchaseRequest, addRequestItem, notifyComprasEmail } from "@/features/compras/purchaseRequestsApi";
import TrasladosPanel from "@/features/laminacion/TrasladosPanel";
import { OTRA_SEDE, guardarMinimo } from "@/features/laminacion/trasladosApi";
import { CSS_LAMINACION } from "./estilos";
import { buscarObra, claveObra, construirObras, esDeObra, esDestinoStock, fmtNum, hoyISO, num, stockDeSede } from "./obras";
import { Aviso, Modal } from "./ui";
import StockTab from "./tabs/StockTab";
import IngresosTab from "./tabs/IngresosTab";
import EgresosTab from "./tabs/EgresosTab";
import MovimientosTab from "./tabs/MovimientosTab";
import PedidosTab from "./tabs/PedidosTab";

/**
 * Traduce el error de Postgres a algo accionable.
 *
 * 42703 = columna inexistente, 42P01 = tabla inexistente. En esta pantalla eso
 * significa una sola cosa: el código multi-sede está desplegado y la migración
 * no corrió todavía. Decirlo con todas las letras evita que alguien crea que se
 * borró el stock.
 */
function avisoDeMigracion(error) {
  const codigo = String(error?.code ?? "");
  if (codigo === "42703" || codigo === "42P01" || /sede|stock_minimos|traslados/i.test(error?.message ?? "")) {
    return "Falta correr la migración de laminación multi-sede en la base. El stock que se ve NO es real hasta que se aplique.";
  }
  return error?.message || "No se pudieron cargar los datos.";
}

// Desde el destino de un pedido ("Obra K52-27", "52-27"…) al nombre de la obra
// con el que se registra el ingreso.
function obraMovimientoDesdeDestino(destino, obras = []) {
  const raw = String(destino || "").trim();
  if (!raw || esDestinoStock(raw)) return null;
  const limpio = raw.replace(/^Obra\s+/i, "").trim();
  if (!limpio) return null;
  return buscarObra(obras, limpio)?.valor || limpio;
}

/**
 * Pantalla de laminación de UN galpón.
 *
 * El mismo componente sirve a Pampa y a Chubut: son dos rutas distintas que lo
 * montan con otra sede. No son dos archivos porque son la misma operación
 * -stock, ingresos, egresos, pedidos- y mantener todo por duplicado termina,
 * siempre, en que un arreglo queda hecho en un galpón y no en el otro.
 *
 * Todo lo que se lee viene filtrado por sede desde la consulta, así que el
 * resto no tiene que acordarse de nada: el stock, los números y las
 * exportaciones ya son de este galpón y de ninguno más.
 */
export default function LaminacionScreen({ profile, sede = "Pampa" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const confirmar = useConfirm();
  const idCanal = useId();
  const role = profile?.role ?? "invitado";
  const isAdmin = hasAdminAccess(profile);
  const puedeCargar = isAdmin || role === "panol";
  const puedeGestionar = isAdmin || role === "admin" || role === "oficina" || role === "tecnica";
  const stockLabel = stockDeSede(sede);

  // Pañol ve Stock (sólo lectura), Ingresos, Egresos y Traslados.
  const esPanol = role === "panol" && !isAdmin;
  const tabsDisponibles = esPanol
    ? ["Stock", "Ingresos", "Egresos", "Traslados"]
    : ["Stock", "Ingresos", "Egresos", "Movimientos", "Traslados", "Pedidos"];

  function tabFromSearch(search) {
    const t = new URLSearchParams(search).get("tab");
    if (tabsDisponibles.includes(t)) return t;
    return tabsDisponibles[0];
  }
  const [tabPedida, setTabPedida] = useState(() => tabFromSearch(location.search));
  // Si el menú lateral cambia la pestaña por la URL, manda la URL.
  const [busquedaVista, setBusquedaVista] = useState(location.search);
  if (busquedaVista !== location.search) {
    setBusquedaVista(location.search);
    setTabPedida(tabFromSearch(location.search));
  }
  const tab = tabsDisponibles.includes(tabPedida) ? tabPedida : tabsDisponibles[0];
  // La pestaña queda en la URL: al recargar o compartir el link se vuelve a la misma.
  function irA(t) {
    setTabPedida(t);
    navigate({ search: `?tab=${t}` }, { replace: true });
  }

  const [materiales, setMateriales] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [obrasProduccion, setObrasProduccion] = useState([]);
  const [obrasLamTodas, setObrasLamTodas] = useState([]);
  const [obraMateriales, setObraMateriales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [showNuevoMaterial, setShowNuevoMaterial] = useState(false);
  const [showAjuste, setShowAjuste] = useState(false);
  const [formMaterial, setFormMaterial] = useState({ nombre: "", categoria: "", unidad: "unidad", stock_minimo: 0 });
  // confModal = { tipo: "orden_completa" | "orden_parcial" | "entero" | "parcial" | "archivar", … }
  const [confModal, setConfModal] = useState(null);
  const [recibiendo, setRecibiendo] = useState(false);
  const [comprasModal, setComprasModal] = useState({ open: false, prefilled: null });

  // El catálogo es uno solo para los dos galpones -si no, "¿hay en el otro?" no
  // se podría contestar- pero el mínimo de reposición es de cada uno. Se
  // resuelve acá y se escribe encima de stock_minimo para que todas las
  // lecturas sigan leyendo el mismo campo. Dejar dos fuentes para el mismo
  // número es exactamente como se cuela el bug de que Pampa muestre el mínimo
  // de Chubut.
  async function cargarMateriales() {
    const [{ data: mats, error: errorMats }, { data: minimos, error: errorMinimos }] = await Promise.all([
      supabase.from("laminacion_materiales").select("*").order("nombre"),
      supabase.from("laminacion_stock_minimos").select("material_id,minimo").eq("sede", sede),
    ]);
    if (errorMats) return setErr(avisoDeMigracion(errorMats));
    if (errorMinimos) setErr(avisoDeMigracion(errorMinimos));
    const porMaterial = new Map((minimos ?? []).map((r) => [r.material_id, num(r.minimo)]));
    setMateriales((mats ?? []).map((m) => ({ ...m, stock_minimo: porMaterial.get(m.id) ?? 0 })));
  }
  async function cargarMovimientos() {
    const { data, error } = await supabase
      .from("laminacion_movimientos")
      .select("*, laminacion_materiales(nombre, unidad)")
      .eq("sede", sede)
      .order("created_at", { ascending: false });
    // Sin movimientos el stock da cero en todo. Si la consulta falló, mejor
    // decirlo y dejar en pantalla lo que había que pintar un cero que no es cero.
    if (error) return setErr(avisoDeMigracion(error));
    setMovimientos(data ?? []);
  }
  async function cargarPedidos() {
    const { data } = await supabase
      .from("laminacion_pedidos")
      .select("*, laminacion_materiales(nombre, unidad)")
      .eq("sede", sede)
      .order("created_at", { ascending: false })
      .limit(300);
    setPedidos(data ?? []);
  }
  // Obras: las de Producción traen las fechas de desmolde; las de laminación,
  // el plan de materiales por obra.
  async function cargarObras() {
    const [prod, lam, plan] = await Promise.all([
      supabase.from("produccion_obras").select("id,codigo,linea_nombre,estado,desmolde_estimado,desmolde_real,botada,botada_real,solo_stock").order("codigo"),
      supabase.from("laminacion_obras").select("id,nombre,descripcion,estado,produccion_obra_id,fecha_desmolde_estimada,fecha_desmolde_real").order("nombre"),
      supabase.from("laminacion_obra_materiales").select("obra_id,material_id,cantidad_necesaria"),
    ]);
    setObrasProduccion(prod.data ?? []);
    setObrasLamTodas(lam.data ?? []);
    setObraMateriales(plan.data ?? []);
  }
  async function cargar() {
    setErr("");
    await Promise.all([cargarMateriales(), cargarMovimientos(), cargarPedidos(), cargarObras()]);
    setCargando(false);
  }

  useEffect(() => {
    const initialTimer = window.setTimeout(() => { void cargar(); }, 0);
    const timers = new Map();
    const schedule = (key, fn) => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timers.get(key));
      timers.set(key, window.setTimeout(() => {
        timers.delete(key);
        void fn();
      }, 500));
    };
    const handleVisible = () => {
      if (document.visibilityState === "visible") schedule("all", cargar);
    };
    document.addEventListener("visibilitychange", handleVisible);
    const ch = supabase
      .channel(`rt-laminacion-${sede}-${idCanal}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_movimientos" }, () => schedule("movimientos", cargarMovimientos))
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_pedidos" }, () => schedule("pedidos", cargarPedidos))
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_materiales" }, () => schedule("materiales", cargarMateriales))
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obras" }, () => schedule("obras", cargarObras))
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_obras" }, () => schedule("obras", cargarObras))
      .subscribe();
    return () => {
      window.clearTimeout(initialTimer);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      document.removeEventListener("visibilitychange", handleVisible);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las funciones de carga se redefinen en cada render; lo que tiene que disparar la recarga es el galpon
  }, [sede]);

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

  const obras = useMemo(
    () => construirObras({ produccion: obrasProduccion, laminacion: obrasLamTodas }),
    [obrasProduccion, obrasLamTodas],
  );

  // Archivado es una decisión de pantalla, no un estado del pedido: sigue
  // "pendiente" en la base, pero deja de aparecer en la recepción y de contar
  // como pendiente. Si el material aparece, se desarchiva y vuelve tal cual.
  const pedidosPendientesRecepcion = useMemo(
    () => pedidos.filter((p) => p.estado === "pendiente" && !p.archivado_at),
    [pedidos],
  );

  // Lo que todavía tiene que llegar de cada material.
  const enCaminoPorMaterial = useMemo(() => {
    const map = {};
    for (const p of pedidosPendientesRecepcion) {
      const falta = Math.max(0, num(p.cantidad) - num(p.cantidad_recibida));
      if (falta > 0) map[p.material_id] = (map[p.material_id] ?? 0) + falta;
    }
    return map;
  }, [pedidosPendientesRecepcion]);

  async function getUserId() {
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    return data?.session?.user?.id ?? null;
  }

  // ── Ingreso manual ───────────────────────────────────────────
  async function crearIngreso(form) {
    if (!form.material_id) { toast.error("Elegí un material."); return false; }
    if (!form.cantidad || num(form.cantidad) <= 0) { toast.error("La cantidad tiene que ser mayor a cero."); return false; }
    const userId = await getUserId();
    const { error } = await supabase.from("laminacion_movimientos").insert({
      material_id: form.material_id,
      tipo: "ingreso",
      cantidad: num(form.cantidad),
      fecha: form.fecha,
      proveedor: form.proveedor.trim() || null,
      obra: form.obra.trim() || null,
      observaciones: form.observaciones.trim() || null,
      creado_por: userId,
      sede,
    });
    if (error) { toast.error(error.message); return false; }
    toast.success("Ingreso registrado");
    cargar();
    return true;
  }

  // ── Egreso ───────────────────────────────────────────────────
  // Plan de la obra para un material: cuánto estaba previsto y cuánto ya se
  // retiró de este galpón. Lo usan el panel del formulario y el control final.
  function planDeObra(obra, materialId) {
    if (!obra?.loId || !materialId) return null;
    const plan = obraMateriales.find((om) => om.obra_id === obra.loId && om.material_id === materialId);
    const necesaria = num(plan?.cantidad_necesaria);
    if (necesaria <= 0) return null;
    const retirado = movimientos
      .filter((m) => m.tipo === "egreso" && m.material_id === materialId
        && (esDeObra(obra, m.destino) || esDeObra(obra, m.obra)))
      .reduce((s, m) => s + num(m.cantidad), 0);
    return { necesaria, retirado, queda: necesaria - retirado };
  }

  async function crearEgreso(form, obra) {
    if (!form.material_id) { toast.error("Elegí un material."); return false; }
    if (!form.cantidad || num(form.cantidad) <= 0) { toast.error("La cantidad tiene que ser mayor a cero."); return false; }
    if (!form.destino.trim()) { toast.error("Elegí para qué obra es."); return false; }

    const mat = materiales.find((m) => String(m.id) === String(form.material_id));
    const unidad = mat?.unidad ?? "";
    const disponible = num(stockPorMaterial[form.material_id]);
    const intentando = num(form.cantidad);

    // Más de lo que hay: se avisa, la persona decide.
    if (intentando > disponible) {
      const ok = await confirmar({
        title: "La salida supera el stock",
        message: `En ${sede} hay ${fmtNum(disponible)} ${unidad} de ${mat?.nombre ?? "este material"} y estás retirando ${fmtNum(intentando)}. El stock va a quedar en ${fmtNum(disponible - intentando)}. ¿Registrar igual?`,
        confirmLabel: "Registrar igual",
      });
      if (!ok) return false;
    }

    // Excedente sobre lo planificado para la obra. K55 se omite porque su
    // lista de materiales está en construcción.
    const omitirValidacion = !obra || obra.linea === "K55" || claveObra(form.destino).startsWith("55-");
    if (!omitirValidacion) {
      const plan = obraMateriales.find((om) => om.obra_id === obra.loId && om.material_id === form.material_id);
      const necesaria = num(plan?.cantidad_necesaria);
      if (obra.loId && necesaria > 0) {
        // Se suma con los egresos de la base, no con lo que hay en pantalla:
        // si otra persona retiró recién, también cuenta.
        const { data: movsPrevios } = await supabase
          .from("laminacion_movimientos")
          .select("cantidad, destino, obra")
          .eq("tipo", "egreso")
          .eq("sede", sede)
          .eq("material_id", form.material_id);
        const yaEgresado = (movsPrevios ?? [])
          .filter((m) => esDeObra(obra, m.destino) || esDeObra(obra, m.obra))
          .reduce((s, m) => s + num(m.cantidad), 0);
        const totalConNuevo = yaEgresado + intentando;
        if (totalConNuevo > necesaria) {
          const excedente = +(totalConNuevo - necesaria).toFixed(2);
          const ok = await confirmar({
            title: "Más de lo planificado para la obra",
            message: `La obra ${obra.codigo} tiene previstos ${fmtNum(necesaria)} ${unidad} de ${mat?.nombre ?? "este material"} y ya se retiraron ${fmtNum(yaEgresado)}. Con este egreso se pasa por ${fmtNum(excedente)} ${unidad}. Consultá a Técnica antes de continuar.`,
            confirmLabel: "Registrar igual",
          });
          if (!ok) return false;
        }
      }
    }

    const userId = await getUserId();
    const { error } = await supabase.from("laminacion_movimientos").insert({
      material_id: form.material_id,
      tipo: "egreso",
      cantidad: intentando,
      fecha: form.fecha,
      destino: form.destino.trim() || null,
      nombre_persona: form.nombre_persona.trim() || null,
      observaciones: form.observaciones.trim() || null,
      creado_por: userId,
      sede,
    });
    if (error) { toast.error(error.message); return false; }
    toast.success(`Egreso registrado · ${fmtNum(intentando)} ${unidad} para ${obra?.codigo || form.destino.trim()}`);
    cargar();
    return true;
  }

  // Avisa a compras que llegó material. `parcial` cambia el mensaje: antes
  // siempre decía "Pedido recibido" aunque hubiera llegado la mitad, así que
  // compras no se enteraba de que faltaba mercadería. Best-effort.
  async function avisarCompras(pedidoIds, { parcial = false, detalle = "" } = {}) {
    try {
      const ids = (pedidoIds ?? []).filter(Boolean);
      if (!ids.length) return;
      const { data: peds } = await supabase
        .from("laminacion_pedidos").select("purchase_request_item_id").in("id", ids);
      const itemIds = [...new Set((peds ?? []).map((p) => p.purchase_request_item_id).filter(Boolean))];
      if (!itemIds.length) return;
      const { data: items } = await supabase
        .from("purchase_request_items").select("request_id").in("id", itemIds);
      const reqIds = [...new Set((items ?? []).map((i) => i.request_id).filter(Boolean))];
      const hoy = new Date().toLocaleDateString("es-AR");
      const message = parcial
        ? `Recepción PARCIAL en laminación el ${hoy}${detalle ? ` (${detalle}). ` : ". "}El pedido sigue abierto: falta mercadería por entregar.`
        : `Recibido completo en laminación el ${hoy}.`;
      for (const reqId of reqIds) {
        supabase.functions.invoke("notificar-email-compras", {
          body: {
            type: "pedido_recibido", requestId: reqId,
            requestTitle: parcial ? "Pedido de laminación (parcial)" : "Pedido de laminación",
            source: "laminacion",
            message,
          },
        }).catch(() => {});
      }
    } catch { /* best-effort */ }
  }

  // ── Recepción de pedidos (pañolero) ──────────────────────────
  async function recibirPedido() {
    if (!confModal || recibiendo) return;
    const { tipo } = confModal;
    setRecibiendo(true);
    try {
      const userId = await getUserId();

      if (tipo === "orden_completa") {
        const { grupo } = confModal;
        // Se ingresa lo que falta. Antes se sumaba el total del pedido aunque
        // ya hubieran llegado entregas parciales, y el stock quedaba de más.
        const movs = grupo.items
          .map((p) => ({
            material_id: p.material_id,
            tipo: "ingreso",
            cantidad: Math.max(0, num(p.cantidad) - num(p.cantidad_recibida)),
            fecha: hoyISO(),
            obra: obraMovimientoDesdeDestino(p.obra_destino, obras),
            observaciones: `Recepción completa — ${grupo.ref}`,
            creado_por: userId,
            sede,
          }))
          .filter((m) => m.cantidad > 0);
        if (movs.length) {
          const { error } = await supabase.from("laminacion_movimientos").insert(movs);
          if (error) { toast.error(error.message); return; }
        }
        for (const p of grupo.items) {
          await supabase.from("laminacion_pedidos")
            .update({ estado: "entregado", cantidad_recibida: num(p.cantidad) })
            .eq("id", p.id);
        }
        avisarCompras(grupo.items.map((p) => p.id), { parcial: false });
        toast.success(`Orden ${grupo.ref === "__manual__" ? "manual" : grupo.ref} recibida · stock actualizado`);
        setConfModal(null);
        cargar();
        return;
      }

      if (tipo === "orden_parcial") {
        const { grupo, cantsParciales } = confModal;
        const movs = [];
        const cerrar = [];    // [{ id, acumulado }] llegó todo
        const parciales = []; // [{ id, acumulado, total }] sigue faltando
        for (const p of grupo.items) {
          const cant = num(cantsParciales[p.id]);
          if (cant <= 0) continue;
          // Se acumula con lo ya recibido antes: comparar sólo esta entrega
          // contra el total dejaba el ítem "parcial" para siempre.
          const total = num(p.cantidad);
          const acumulado = num(p.cantidad_recibida) + cant;
          movs.push({
            material_id: p.material_id,
            tipo: "ingreso",
            cantidad: cant,
            fecha: hoyISO(),
            obra: obraMovimientoDesdeDestino(p.obra_destino, obras),
            observaciones: `Recepción parcial (${cant} — acumulado ${acumulado} de ${total}) — ${grupo.ref}`,
            creado_por: userId,
            sede,
          });
          if (acumulado >= total) cerrar.push({ id: p.id, acumulado });
          else parciales.push({ id: p.id, acumulado, total });
        }
        if (!movs.length) { toast.error("Ingresá al menos una cantidad mayor a 0."); return; }
        const { error } = await supabase.from("laminacion_movimientos").insert(movs);
        if (error) { toast.error(error.message); return; }
        for (const { id, acumulado } of cerrar) {
          await supabase.from("laminacion_pedidos")
            .update({ estado: "entregado", cantidad_recibida: acumulado }).eq("id", id);
        }
        // La cantidad recibida vive en su propia columna: el trigger de la base
        // la propaga a Compras como ítem "parcial".
        for (const { id, acumulado } of parciales) {
          await supabase.from("laminacion_pedidos")
            .update({ cantidad_recibida: acumulado }).eq("id", id);
        }
        if (cerrar.length) avisarCompras(cerrar.map((c) => c.id), { parcial: false });
        if (parciales.length) {
          avisarCompras(parciales.map((p) => p.id), {
            parcial: true,
            detalle: parciales.map((p) => `${p.acumulado} de ${p.total}`).join(" · "),
          });
        }
        toast.success(`Recepción parcial · ${movs.length} material${movs.length !== 1 ? "es" : ""} ingresado${movs.length !== 1 ? "s" : ""}`);
        setConfModal(null);
        cargar();
        return;
      }

      // Un material suelto de la orden.
      const { pedido, cantParcial } = confModal;
      const total = num(pedido.cantidad);
      const yaRecibido = num(pedido.cantidad_recibida);
      // "Llegó" ingresa lo que faltaba, no el total (ver orden completa).
      const cantRecibida = tipo === "entero" ? Math.max(0, total - yaRecibido) : num(cantParcial);
      if (tipo !== "entero" && cantRecibida <= 0) { toast.error("Cantidad inválida."); return; }
      const acumulado = tipo === "entero" ? total : yaRecibido + cantRecibida;
      const obsBase = tipo === "entero"
        ? `Recepción completa — pedido #${pedido.id}`
        : `Recepción parcial (${cantRecibida} — acumulado ${acumulado} de ${total}) — pedido #${pedido.id}`;
      if (cantRecibida > 0) {
        const { error } = await supabase.from("laminacion_movimientos").insert({
          material_id: pedido.material_id,
          tipo: "ingreso",
          cantidad: cantRecibida,
          fecha: hoyISO(),
          obra: obraMovimientoDesdeDestino(pedido.obra_destino, obras),
          observaciones: obsBase,
          creado_por: userId,
          sede,
        });
        if (error) { toast.error(error.message); return; }
      }
      if (tipo === "entero" || acumulado >= total) {
        await supabase.from("laminacion_pedidos")
          .update({ estado: "entregado", cantidad_recibida: acumulado }).eq("id", pedido.id);
        avisarCompras([pedido.id], { parcial: false });
        toast.success("Recepción completa · stock actualizado");
      } else {
        await supabase.from("laminacion_pedidos")
          .update({ cantidad_recibida: acumulado }).eq("id", pedido.id);
        avisarCompras([pedido.id], { parcial: true, detalle: `${acumulado} de ${total}` });
        toast.success(`Recepción parcial · faltan ${fmtNum(total - acumulado)}`);
      }
      setConfModal(null);
      cargar();
    } finally {
      setRecibiendo(false);
    }
  }

  // Alta de una orden de laminación, en un solo lugar. Crea las tres cosas que
  // tienen que existir juntas o no existir: el pedido en Compras, un renglón de
  // Compras por material, y el pedido de laminación de cada uno atado a ese
  // renglón. Sin ese vínculo el pedido queda huérfano —se ve en laminación y
  // Compras no se entera nunca—, que es lo que pasaba con el alta manual: 37 de
  // los 133 pedidos de la base quedaron así.
  async function crearOrdenLaminacion({ items, obraDestino = null, tituloCompras, descripcionCompras, observaciones, ordenRef }) {
    const limpios = (items ?? []).filter((it) => it.material_id && num(it.cantidad) > 0);
    if (!limpios.length) return { ok: 0, fallidos: 0, enCompras: false, ordenRef };

    // Compras primero, best-effort: si falla, los pedidos de laminación se
    // crean igual y se pueden escalar a mano. Perder la carga sería peor.
    let request = null;
    try {
      request = await createPurchaseRequest({
        form: {
          title: tituloCompras,
          description: descripcionCompras || observaciones || tituloCompras,
          priority: "media",
          project_id: null,
          source: "laminacion",
          source_ref: ordenRef,
        },
      });
    } catch (e) {
      console.warn("[Laminacion] no se pudo crear el pedido a Compras:", e);
    }

    const userId = await getUserId();
    let ok = 0;
    let fallidos = 0;

    for (const it of limpios) {
      const esExtra = it.categoria === "extra";
      const mat = materiales.find((m) => String(m.id) === String(it.material_id));
      const destino = esExtra ? stockLabel : obraDestino;
      let reqItemId = null;

      if (request) {
        try {
          const reqItem = await addRequestItem(request.id, {
            description: it.descripcion || mat?.nombre || "Material laminación",
            quantity: num(it.cantidad),
            unit: mat?.unidad || "unidad",
            destination: destino ? (esDestinoStock(destino) ? destino : `Obra ${String(destino).replace(/^Obra\s+/i, "")}`) : null,
            notes: esExtra ? `EXTRA - ${stockLabel}` : null,
            material_id: it.material_id || null,
            catalog_source: "laminacion",
          });
          reqItemId = reqItem?.id || null;
        } catch (e) {
          console.warn("[Laminacion] no se pudo crear el ítem en Compras:", e);
        }
      }

      const { error } = await supabase.from("laminacion_pedidos").insert({
        material_id: it.material_id,
        cantidad: num(it.cantidad),
        observaciones,
        estado: "pendiente",
        categoria: it.categoria || "estándar",
        obra_destino: destino,
        purchase_request_item_id: reqItemId,
        solicitado_por: userId,
        sede,
      });
      if (error) { fallidos += 1; console.warn("[Laminacion] pedido falló:", error); }
      else ok += 1;
    }

    if (request) {
      notifyComprasEmail({
        type: "new_request",
        requestId: request.id,
        requestTitle: tituloCompras,
        changedBy: profile?.id,
        createdByName: profile?.username || "Usuario",
        source: "laminacion",
      });
    }

    cargarPedidos();
    return { ok, fallidos, enCompras: !!request, ordenRef };
  }

  // Una orden armada en Pedidos: para una obra o para el stock del galpón.
  async function generarOrden({ items, destino, obra, plantillaLabel, ordenRef, emailText, desmolde }) {
    const esStock = esDestinoStock(destino);
    const nombre = esStock ? stockLabel : (obra?.codigo || destino);
    const obs = `${ordenRef} | ${plantillaLabel || (esStock ? "Pedido de stock" : "Pedido")}${esStock ? "" : ` — Obra ${nombre}`}`;
    const detalle = items.map((it) => {
      const mat = materiales.find((m) => String(m.id) === String(it.material_id));
      return `${fmtNum(it.cantidad)} ${mat?.unidad || ""} ${mat?.nombre || it.descripcion || "material"}${it.categoria === "extra" ? " (extra)" : ""}`;
    }).join("\n");
    const res = await crearOrdenLaminacion({
      items,
      obraDestino: esStock ? stockLabel : destino,
      tituloCompras: `Pedido Laminación — ${esStock ? stockLabel : `Obra ${nombre}`}`,
      descripcionCompras: emailText
        ? `Ref: ${ordenRef}\n\n${emailText}`
        : `Ref: ${ordenRef}\nDestino: ${nombre}${desmolde ? `\nDesmolde: ${desmolde}` : ""}\n\n${detalle}`,
      observaciones: obs,
      ordenRef,
    });
    if (!res.ok) {
      toast.error(`No se pudo generar la orden${res.fallidos ? ` (${res.fallidos} fallaron)` : ""}.`);
    } else if (res.enCompras) {
      toast.success(`Orden ${ordenRef} enviada a Compras · ${res.ok} material${res.ok === 1 ? "" : "es"}${res.fallidos ? ` (${res.fallidos} con error)` : ""}`);
    } else {
      toast.warning(`Orden ${ordenRef} creada con ${res.ok} material${res.ok === 1 ? "" : "es"}, pero no se pudo avisar a Compras.`);
    }
    return res;
  }

  async function setEstadoPedido(id, estado) {
    const { error } = await supabase.from("laminacion_pedidos").update({ estado }).eq("id", id);
    if (error) toast.error(error.message);
    else cargar();
  }

  // Archivar no borra ni cancela: saca el pedido de la recepción dejándolo
  // intacto. El motivo es opcional.
  async function archivarPedidos(items, motivo) {
    const ids = items.map((p) => p.id);
    if (!ids.length) return;
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("laminacion_pedidos")
      .update({
        archivado_at: new Date().toISOString(),
        archivado_por: userId,
        archivado_motivo: motivo?.trim() || null,
      })
      .in("id", ids)
      .select();
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("No se pudo archivar. Verificá los permisos en Supabase (política UPDATE en laminacion_pedidos).");
    toast.success("Pedido archivado");
    cargarPedidos();
  }

  async function desarchivarPedidos(items) {
    const ids = items.map((p) => p.id);
    if (!ids.length) return;
    const { data, error } = await supabase
      .from("laminacion_pedidos")
      .update({ archivado_at: null, archivado_por: null, archivado_motivo: null })
      .in("id", ids)
      .select();
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("No se pudo restaurar. Verificá los permisos en Supabase (política UPDATE en laminacion_pedidos).");
    toast.success("Pedido restaurado");
    cargarPedidos();
  }

  async function eliminarPedido(p) {
    const ok = await confirmar({
      title: "¿Eliminar este material del pedido?",
      message: `${p.laminacion_materiales?.nombre ?? "El material"} se borra definitivamente. No se puede deshacer.`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const { data, error } = await supabase.from("laminacion_pedidos").delete().eq("id", p.id).select();
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("No se pudo eliminar. Verificá los permisos en Supabase (política DELETE en laminacion_pedidos).");
    toast.success("Material eliminado del pedido");
    cargarPedidos();
  }

  async function eliminarOrden(items) {
    const ok = await confirmar({
      title: "¿Eliminar la orden completa?",
      message: `Se borran ${items.length} material${items.length !== 1 ? "es" : ""} de laminación. El pedido en Compras no se toca. No se puede deshacer.`,
      confirmLabel: "Eliminar orden",
      tone: "danger",
    });
    if (!ok) return;
    const { data, error } = await supabase.from("laminacion_pedidos").delete().in("id", items.map((p) => p.id)).select();
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("No se pudo eliminar. Verificá los permisos en Supabase (política DELETE en laminacion_pedidos).");
    toast.success("Orden eliminada");
    cargarPedidos();
  }

  async function crearMaterial(e) {
    e.preventDefault();
    if (!formMaterial.nombre.trim()) return toast.error("El nombre es obligatorio.");
    // El material se da de alta para los dos galpones -es el mismo producto-
    // pero el mínimo que se escribe acá es el de este galpón. El otro arranca
    // en cero hasta que alguien de allá lo defina.
    const { data: creado, error } = await supabase.from("laminacion_materiales").insert({
      nombre: formMaterial.nombre.trim(),
      categoria: formMaterial.categoria.trim() || null,
      unidad: formMaterial.unidad.trim() || "unidad",
    }).select("id").single();
    if (error) return toast.error(error.message);
    if (creado?.id) {
      await supabase.from("laminacion_stock_minimos").upsert(
        [{ material_id: creado.id, sede, minimo: num(formMaterial.stock_minimo) },
         { material_id: creado.id, sede: OTRA_SEDE[sede], minimo: 0 }],
        { onConflict: "material_id,sede" },
      );
    }
    toast.success("Material creado");
    setFormMaterial({ nombre: "", categoria: "", unidad: "unidad", stock_minimo: 0 });
    setShowNuevoMaterial(false);
    cargar();
  }

  async function cambiarMinimo(material, valor) {
    try {
      await guardarMinimo({ materialId: material.id, sede, minimo: valor });
      toast.success(`Mínimo de ${material.nombre} en ${sede}: ${fmtNum(valor)}`);
      cargarMateriales();
      return true;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  }

  const ICONOS = { Stock: Boxes, Ingresos: ArrowDownToLine, Egresos: ArrowUpFromLine, Movimientos: Layers, Traslados: ArrowLeftRight, Pedidos: ShoppingCart };
  const CORTO = { Movimientos: "Movim." };
  const comun = {
    sede, materiales, movimientos, pedidos, stockPorMaterial, obras, enCaminoPorMaterial,
    puedeCargar, puedeGestionar, isAdmin, cargando, stockLabel,
  };

  return (
    <div className="lam">
      <style href="klasea-laminacion" precedence="default">{CSS_LAMINACION}</style>

      <nav className="lam-nav" aria-label="Laminación">
        <span className="lam-nav-marca">
          <Package size={17} /> <span className="lam-nav-txt">Laminación</span>
          <span className="lam-sede" data-tono={sede === "Chubut" ? "violeta" : "azul"}>{sede}</span>
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
              {t === "Ingresos" && pedidosPendientesRecepcion.length > 0 && <span className="n" title="Materiales pendientes de recibir">{pedidosPendientesRecepcion.length}</span>}
            </button>
          ))}
        </div>
        <div className="lam-nav-acc">
          {isAdmin && (
            <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => setShowNuevoMaterial(true)}>
              <Plus size={14} /> Material
            </button>
          )}
          <button type="button" className="lam-btn-ic" onClick={() => cargar()} title="Volver a leer los datos" aria-label="Volver a leer los datos">
            <RefreshCw size={15} />
          </button>
        </div>
      </nav>

      <div className="lam-vista" key={tab}>
        <div className="lam-pagina">
          {err && <Aviso onCerrar={() => setErr("")}>{err}</Aviso>}

          {tab === "Stock" && (
            <StockTab {...comun} onAjuste={() => setShowAjuste(true)} onCambiarMinimo={cambiarMinimo} />
          )}
          {tab === "Ingresos" && (
            <IngresosTab
              {...comun}
              pedidosPendientes={pedidosPendientesRecepcion}
              onRecibir={setConfModal}
              onRestaurar={desarchivarPedidos}
              onCrearIngreso={crearIngreso}
            />
          )}
          {tab === "Egresos" && (
            <EgresosTab {...comun} planDeObra={planDeObra} onCrearEgreso={crearEgreso} onIrTraslados={() => irA("Traslados")} />
          )}
          {tab === "Movimientos" && <MovimientosTab {...comun} />}
          {tab === "Traslados" && (
            <TrasladosPanel sede={sede} materiales={materiales} stockPorMaterial={stockPorMaterial} puedeCargar={puedeCargar} onCambio={cargar} />
          )}
          {tab === "Pedidos" && (
            <PedidosTab
              {...comun}
              obraMateriales={obraMateriales}
              onGenerarOrden={generarOrden}
              onEstadoPedido={setEstadoPedido}
              onEliminarPedido={eliminarPedido}
              onEliminarOrden={eliminarOrden}
              onEnviarACompras={(prefilled) => setComprasModal({ open: true, prefilled })}
              onIrIngresos={() => irA("Ingresos")}
            />
          )}
        </div>
      </div>

      {showAjuste && (
        <AjusteInventarioModal
          sede={sede}
          materiales={materiales}
          stockPorMaterial={stockPorMaterial}
          onClose={() => setShowAjuste(false)}
          onDone={() => { setShowAjuste(false); cargar(); toast.success("Ajuste aplicado"); }}
        />
      )}

      {showNuevoMaterial && isAdmin && (
        <Modal
          onCerrar={() => setShowNuevoMaterial(false)}
          icono={Plus}
          titulo="Nuevo material"
          sub={`Se agrega al catálogo de los dos galpones. El mínimo que cargues es el de ${sede}.`}
          pie={(
            <>
              <button type="button" className="ui-btn" onClick={() => setShowNuevoMaterial(false)}>Cancelar</button>
              <button type="submit" form="lam-form-material" className="ui-btn ui-btn-primario">Crear material</button>
            </>
          )}
        >
          <form id="lam-form-material" onSubmit={crearMaterial} className="lam-form">
            <label className="lam-campo c6"><span>Nombre <span className="req">*</span></span>
              <input autoFocus className="ui-input" placeholder="Ej: Mat 300" value={formMaterial.nombre} onChange={(e) => setFormMaterial((f) => ({ ...f, nombre: e.target.value }))} />
            </label>
            <label className="lam-campo c2"><span>Categoría</span>
              <input className="ui-input" placeholder="Telas, resinas…" value={formMaterial.categoria} onChange={(e) => setFormMaterial((f) => ({ ...f, categoria: e.target.value }))} />
            </label>
            <label className="lam-campo c2"><span>Unidad</span>
              <input className="ui-input" placeholder="kg, m, l, unidad" value={formMaterial.unidad} onChange={(e) => setFormMaterial((f) => ({ ...f, unidad: e.target.value }))} />
            </label>
            <label className="lam-campo c2"><span>Mínimo en {sede}</span>
              <input className="ui-input num" type="number" step="0.01" min="0" value={formMaterial.stock_minimo} onChange={(e) => setFormMaterial((f) => ({ ...f, stock_minimo: e.target.value }))} />
            </label>
          </form>
        </Modal>
      )}

      {confModal && (
        <ModalRecepcion
          conf={confModal}
          setConf={setConfModal}
          materiales={materiales}
          recibiendo={recibiendo}
          onConfirmar={recibirPedido}
          onArchivar={async (items, motivo) => { setConfModal(null); await archivarPedidos(items, motivo); }}
        />
      )}

      {/* Escalar a Compras un pedido viejo que todavía no se envió. El armado
          de pedidos ya manda a Compras solo. */}
      <PedirAComprasModal
        open={comprasModal.open}
        prefilled={comprasModal.prefilled}
        profile={profile}
        origen="laminacion"
        onClose={(created) => {
          setComprasModal({ open: false, prefilled: null });
          if (created) { toast.success("Pedido enviado a Compras"); cargarPedidos(); }
        }}
      />
    </div>
  );
}

// ── Confirmar recepción / archivar ───────────────────────────────
function ModalRecepcion({ conf, setConf, materiales, recibiendo, onConfirmar, onArchivar }) {
  const { tipo } = conf;
  const matDe = (p) => materiales.find((m) => String(m.id) === String(p.material_id));
  const cerrar = () => setConf(null);

  if (tipo === "archivar") {
    const { items, titulo, motivo = "" } = conf;
    return (
      <Modal
        onCerrar={cerrar}
        icono={ClipboardList}
        tono="neutro"
        titulo="Archivar pedido"
        sub="Sale de la recepción y deja de contar como pendiente. No se borra: si el material llega, lo restaurás desde Archivados y vuelve tal como estaba."
        pie={(
          <>
            <button type="button" className="ui-btn" onClick={cerrar}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-primario" onClick={() => onArchivar(items, motivo)}>Archivar</button>
          </>
        )}
      >
        <div className="lam-lista-mod"><div><b>{titulo}</b><span /></div></div>
        <label className="lam-campo c6"><span>Motivo (opcional)</span>
          <input className="ui-input" autoFocus value={motivo} onChange={(e) => setConf((prev) => ({ ...prev, motivo: e.target.value }))} placeholder="Ej: el proveedor nunca lo entregó" />
        </label>
      </Modal>
    );
  }

  if (tipo === "orden_completa") {
    const { grupo } = conf;
    return (
      <Modal
        onCerrar={cerrar}
        bloqueado={recibiendo}
        icono={ArrowDownToLine}
        tono="verde"
        titulo="Recibir la orden completa"
        sub={`${grupo.ref === "__manual__" ? "Pedido manual" : grupo.ref} · ${grupo.label}`}
        pie={(
          <>
            <button type="button" className="ui-btn" onClick={cerrar} disabled={recibiendo}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-primario" onClick={onConfirmar} disabled={recibiendo}>{recibiendo ? "Registrando…" : "Confirmar recepción"}</button>
          </>
        )}
      >
        <div className="lam-lista-mod">
          {grupo.items.map((p) => {
            const mat = matDe(p);
            const falta = Math.max(0, num(p.cantidad) - num(p.cantidad_recibida));
            return (
              <div key={p.id}>
                <span>{mat?.nombre ?? "—"}{p.categoria === "extra" && <span className="lam-tag" data-tono="cian" style={{ marginLeft: 6 }}>Extra</span>}</span>
                <span className="lam-cant" data-tono="verde">+{fmtNum(falta)} <small>{mat?.unidad}</small></span>
              </div>
            );
          })}
        </div>
        <Aviso tono="verde">Se registran {grupo.items.length} ingresos y la orden queda entregada.</Aviso>
      </Modal>
    );
  }

  if (tipo === "orden_parcial") {
    const { grupo, cantsParciales } = conf;
    const algunaCant = Object.values(cantsParciales).some((v) => num(v) > 0);
    return (
      <Modal
        ancho
        onCerrar={cerrar}
        bloqueado={recibiendo}
        icono={Package}
        tono="cian"
        titulo="Recepción parcial"
        sub="Cargá lo que llegó de cada material. Dejá vacío lo que no llegó."
        pie={(
          <>
            <button type="button" className="ui-btn" onClick={cerrar} disabled={recibiendo}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-primario" disabled={!algunaCant || recibiendo} onClick={onConfirmar}>{recibiendo ? "Registrando…" : "Confirmar parcial"}</button>
          </>
        )}
      >
        <div className="lam-lista-mod">
          {grupo.items.map((p) => {
            const mat = matDe(p);
            const val = cantsParciales[p.id] ?? "";
            const pedido = num(p.cantidad);
            const recibido = num(p.cantidad_recibida);
            const falta = Math.max(0, pedido - recibido);
            return (
              <div key={p.id}>
                <span>
                  <b style={{ fontWeight: 600 }}>{mat?.nombre ?? "—"}</b>
                  <span style={{ display: "block", fontSize: 12, color: "var(--dim)", marginTop: 2 }}>
                    Pedido {fmtNum(pedido)} {mat?.unidad}{recibido > 0 ? ` · ya llegaron ${fmtNum(recibido)} · faltan ${fmtNum(falta)}` : ""}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number" step="0.01" min="0" placeholder="0"
                    className="ui-input num"
                    style={{ width: 96, minHeight: 36, textAlign: "right" }}
                    value={val}
                    aria-label={`Cantidad recibida de ${mat?.nombre ?? "material"}`}
                    onChange={(e) => setConf((prev) => ({ ...prev, cantsParciales: { ...prev.cantsParciales, [p.id]: e.target.value } }))}
                  />
                  <button type="button" className="ui-btn chico ui-btn-fantasma" title="Llegó todo lo que faltaba" onClick={() => setConf((prev) => ({ ...prev, cantsParciales: { ...prev.cantsParciales, [p.id]: String(falta || pedido) } }))}>Todo</button>
                </span>
              </div>
            );
          })}
        </div>
        <p className="lam-ayuda">Lo que completa el pedido cierra ese material; lo que no, queda pendiente con lo recibido a la vista.</p>
      </Modal>
    );
  }

  const { pedido, cantParcial } = conf;
  const mat = matDe(pedido);
  const total = num(pedido?.cantidad);
  const yaRecibido = num(pedido?.cantidad_recibida);
  const falta = Math.max(0, total - yaRecibido);
  // "Llegó" puede cerrar un material que ya llegó entero (falta cero).
  const cantFinal = tipo === "entero" ? Math.max(falta, 1) : num(cantParcial);
  return (
    <Modal
      onCerrar={cerrar}
      bloqueado={recibiendo}
      icono={tipo === "entero" ? ArrowDownToLine : Package}
      tono={tipo === "entero" ? "verde" : "cian"}
      titulo={tipo === "entero" ? "Llegó el material" : "Llegó una parte"}
      sub={`${mat?.nombre ?? "Material"} · pedido ${fmtNum(total)} ${mat?.unidad ?? ""}${yaRecibido ? ` · ya llegaron ${fmtNum(yaRecibido)}` : ""}`}
      pie={(
        <>
          <button type="button" className="ui-btn" onClick={cerrar} disabled={recibiendo}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" disabled={cantFinal <= 0 || recibiendo} onClick={onConfirmar}>{recibiendo ? "Registrando…" : "Confirmar"}</button>
        </>
      )}
    >
      {tipo === "parcial" ? (
        <label className="lam-campo c6"><span>Cantidad que llegó ({mat?.unidad})</span>
          <input autoFocus className="ui-input num" type="number" step="0.01" min="0.01" placeholder={`Faltan ${fmtNum(falta)}`} value={cantParcial} onChange={(e) => setConf((prev) => ({ ...prev, cantParcial: e.target.value }))} />
        </label>
      ) : (
        <Aviso tono="verde">
          {falta > 0
            ? `Se ingresan ${fmtNum(falta)} ${mat?.unidad ?? ""} al stock y el material queda entregado.`
            : "Ya llegó todo lo pedido: el material queda entregado sin sumar stock."}
        </Aviso>
      )}
    </Modal>
  );
}
