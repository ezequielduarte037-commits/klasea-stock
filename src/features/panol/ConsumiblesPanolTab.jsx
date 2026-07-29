import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  Check,
  ChevronDown,
  Clock3,
  Minus,
  PackagePlus,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Search,
  Trash2,
} from "lucide-react";
import { C } from "@/theme";
import { useBalanza, calidadCalibracion } from "@/hooks/useBalanza";
import {
  actualizarConsumiblePanol,
  agregarCodigoBarraMaterial,
  borrarPesoUnitario,
  crearConsumiblePanol,
  eliminarCodigoBarraMaterial,
  fetchCategorias,
  fetchConsumiblesPanol,
  guardarPesoUnitario,
  guardarPesoUnitarioDirecto,
  normalizeUnidadMedida,
  sacarConsumiblePanol,
} from "@/features/materiales/api";
import {
  egresarProducto,
  fetchMaterialesEgreso,
  fetchPanolCatalogMini,
  ingresarStockGeneral,
  registrarRetiroConsumible,
  retiradoPorNombreCompletoError,
  SEDES_PANOL,
} from "@/features/panol/panolApi";
// Cálculo de stock CANÓNICO: el mismo que usa el resto del pañol. No reimplementar
// acá, o esta pestaña muestra un stock distinto al del tab Stock para el mismo ítem.
import { fmtDate, rowDelta, rowIsAnulado, rowIsEgreso, rowMovementAt, stockPorMaterial } from "@/features/panol/panolMovimientos";

const LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];

const CARD = {
  border: `1px solid ${C.border}`,
  background: C.panelSolid,
  borderRadius: 14,
};

const LABEL = {
  display: "block",
  marginBottom: 5,
  color: C.dim,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0.8,
  textTransform: "uppercase",
};

const INPUT = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${C.border}`,
  background: C.panelSolid,
  color: C.text,
  borderRadius: 10,
  padding: "9px 10px",
  fontSize: 13,
  fontFamily: C.sans,
  outline: "none",
};

const QUICK_DESTINOS = ["Uso interno / panol", "Produccion", "Mantenimiento", "Reposicion", "Merma / roto"];
const QUICK_CANTIDADES = [1, 5, 10, 25, 50];

// Las tres cosas que se pueden hacer con un consumible. Cada una con su color y
// una explicación corta, para que el operario entienda qué toca stock y qué no.
const MOV_OPCIONES = [
  { key: "egreso", label: "Egresar unidades", desc: "Descuenta stock del pañol", titulo: "Egreso de unidades", icon: Minus, color: C.red, bg: C.redL, border: C.redB },
  { key: "retiro_peso", label: "Retiro por peso", desc: "Solo registro en gramos, no toca el stock", titulo: "Retiro por peso", icon: Scale, color: C.amber, bg: C.amberL, border: C.amberB },
  { key: "ingreso", label: "Ingresar stock", desc: "Suma stock al pañol", titulo: "Ingreso de stock", icon: Plus, color: C.green, bg: C.greenL, border: C.greenB },
];

function num(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function fmtQty(value) {
  const n = num(value);
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
}

function fmtWeight(value) {
  const n = num(value);
  if (!n) return "sin peso";
  if (n >= 1000) return `${fmtQty(n / 1000)} kg`;
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n)} g`;
}

function norm(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildForm(material = {}) {
  return {
    descripcion: material.descripcion || "",
    categoria_id: material.categoria_id || "",
    proveedor: material.proveedor || "",
    codigo: material.codigo || "",
    unidad_medida: normalizeUnidadMedida(material.unidad_medida, "unidad"),
    notas: material.notas || "",
  };
}

function stockSedesArray(item = {}) {
  return Array.from(item.stock_sedes || [])
    .filter(([, qty]) => Math.abs(num(qty)) > 0.0001)
    .sort((a, b) => Math.abs(num(b[1])) - Math.abs(num(a[1])));
}

function movimientoUi(row = {}) {
  if (row.source === "consumible_retiro") return { label: "Retiro peso", color: C.amber, bg: C.amberL, border: C.amberB };
  const delta = rowDelta(row);
  const anulado = rowIsAnulado(row);
  const salida = rowIsEgreso(row) || delta < 0;
  if (anulado) return { label: "Anulado", color: C.dim, bg: C.panel2, border: C.border };
  if (salida) return { label: "Egreso", color: C.red, bg: C.redL, border: C.redB };
  if (delta > 0) return { label: "Ingreso", color: C.green, bg: C.greenL, border: C.greenB };
  return { label: "Movimiento", color: C.blue, bg: C.blueL, border: C.blueB };
}

function pesoRetiroGramos(row = {}) {
  const text = [row.stock_nota, row.egreso_nota, row.notas].filter(Boolean).join(" ");
  const match = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*g\b/i);
  return match ? num(match[1]) : 0;
}

function MiniButton({ children, onClick, disabled = false, tone = "neutral", title = "", type = "button" }) {
  const tones = {
    neutral: { bg: C.panel, border: C.border, color: C.text },
    primary: { bg: C.blue, border: C.blue, color: "#fff" },
    green: { bg: C.greenL, border: C.greenB, color: C.green },
    red: { bg: C.redL, border: C.redB, color: C.red },
    violet: { bg: "var(--violet-soft)", border: "var(--violet-border)", color: C.violet },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${t.border}`,
        background: disabled ? C.panel2 : t.bg,
        color: disabled ? C.dim : t.color,
        borderRadius: 10,
        padding: "8px 11px",
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        fontSize: 12,
        fontWeight: 900,
        fontFamily: C.sans,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function StatusPill({ children, color = C.blue, bg = C.blueL, border = C.blueB }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: `1px solid ${border}`,
        background: bg,
        color,
        borderRadius: 999,
        padding: "3px 8px",
        fontSize: 10,
        fontWeight: 950,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export default function ConsumiblesPanolTab({ isMobile = false, toast, sedeLocked = null, canReceive = false, isAdmin = false }) {
  // autoConectar: reusa el puerto ya autorizado (no vuelve a pedir el COM en cada visita).
  const balanza = useBalanza();

  const [items, setItems] = useState([]);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("todos");
  const [panel, setPanel] = useState("operar");
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogQ, setCatalogQ] = useState("");
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [editForm, setEditForm] = useState(buildForm());
  const [createForm, setCreateForm] = useState({ descripcion: "", categoria_id: "", proveedor: "", codigo: "", codigo_barra: "", unidad_medida: "unidad", notas: "" });
  const [barcodeForm, setBarcodeForm] = useState({ codigo: "", etiqueta: "" });
  const [pesoDirecto, setPesoDirecto] = useState("");
  const [piezasMuestra, setPiezasMuestra] = useState("");
  const [gramosMuestra, setGramosMuestra] = useState(null);

  const [movimiento, setMovimiento] = useState("egreso");
  const [movSede, setMovSede] = useState(sedeLocked || SEDES_PANOL[0]);
  const [movCantidad, setMovCantidad] = useState("");
  const [movRetiradoPor, setMovRetiradoPor] = useState("");
  const [movDestino, setMovDestino] = useState("Uso interno / panol");
  const [movNota, setMovNota] = useState("");
  const [pesoLeido, setPesoLeido] = useState(null);
  const [movPesoGramos, setMovPesoGramos] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const sede = sedeLocked || null;
      const [consumibles, cats, ledger] = await Promise.all([
        fetchConsumiblesPanol(),
        fetchCategorias(),
        fetchMaterialesEgreso({ sede, estados: LEDGER_STATES }),
      ]);
      setItems(consumibles);
      setCategorias(cats);
      setLedgerRows(ledger);
      setSelectedId((prev) => (consumibles.some((item) => item.id === prev) ? prev : consumibles[0]?.id || null));
      setCreateForm((prev) => (!prev.categoria_id && cats[0]?.id ? { ...prev, categoria_id: cats[0].id } : prev));
    } catch (error) {
      toast?.error(error.message || "No se pudieron cargar los consumibles.");
    } finally {
      setLoading(false);
    }
  }, [sedeLocked, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const term = catalogQ.trim();
    if (!showCreate || term.length < 2) {
      setCatalogResults([]);
      setCatalogLoading(false);
      return undefined;
    }
    let alive = true;
    setCatalogLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await fetchPanolCatalogMini({ q: term, limit: 10 });
        if (!alive) return;
        const consumibleIds = new Set(items.map((item) => item.id));
        setCatalogResults(rows.filter((row) => !consumibleIds.has(row.id)));
      } catch {
        if (alive) setCatalogResults([]);
      } finally {
        if (alive) setCatalogLoading(false);
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [catalogQ, items, showCreate]);

  const categoriasById = useMemo(() => new Map(categorias.map((cat) => [cat.id, cat.nombre])), [categorias]);
  const stockMap = useMemo(() => stockPorMaterial(ledgerRows), [ledgerRows]);
  const enriched = useMemo(() => items.map((item) => {
    const stock = stockMap.get(item.id) ?? { total: 0, sedes: new Map(), movimientos: 0 };
    return { ...item, stock_total: stock.total, stock_sedes: stock.sedes, stock_movimientos: stock.movimientos };
  }), [items, stockMap]);
  const consumibleIds = useMemo(() => new Set(items.map((item) => item.id).filter(Boolean)), [items]);
  const consumibleMovimientos = useMemo(() => ledgerRows
    .filter((row) => row.material_id && consumibleIds.has(row.material_id))
    .sort((a, b) => new Date(rowMovementAt(b) || 0) - new Date(rowMovementAt(a) || 0))
    .slice(0, 160), [consumibleIds, ledgerRows]);

  const selected = useMemo(() => enriched.find((item) => item.id === selectedId) || null, [enriched, selectedId]);
  const selectedHistory = useMemo(() => {
    if (!selected?.id) return [];
    return ledgerRows
      .filter((row) => row.material_id === selected.id)
      .sort((a, b) => new Date(rowMovementAt(b) || 0) - new Date(rowMovementAt(a) || 0))
      .slice(0, 18);
  }, [ledgerRows, selected?.id]);

  // Sólo al CAMBIAR de consumible. Antes dependía también de `selected`, que es un
  // objeto nuevo en cada refresco del ledger: cualquier recarga en segundo plano
  // te borraba la edición a medio hacer, las piezas de la muestra y el peso leído.
  // Por eso NO va `selected` en las dependencias (lo leemos de la ref).
  const selectedRef = useRef(null);
  selectedRef.current = selected;
  useEffect(() => {
    const item = selectedRef.current;
    if (!item) return;
    setEditForm(buildForm(item));
    setPesoDirecto(item.peso_unitario_g ? String(Number(item.peso_unitario_g).toFixed(3)) : "");
    setPiezasMuestra("");
    setGramosMuestra(null);
    setPesoLeido(null);
    setMovPesoGramos("");
    // La cantidad del movimiento arranca VACÍA a propósito: pre-cargarla con todo
    // el stock hacía que un click distraído egresara la existencia completa.
    setMovCantidad("");
  }, [selectedId]);

  const visibles = useMemo(() => {
    const term = norm(q);
    return enriched.filter((item) => {
      if (filter === "sin_peso" && item.peso_unitario_g != null) return false;
      if (filter === "sin_stock" && item.stock_total > 0) return false;
      if (filter === "con_stock" && item.stock_total <= 0) return false;
      if (!term) return true;
      const text = norm(`${item.descripcion} ${item.codigo || ""} ${item.codigo_barra || ""} ${item.proveedor || ""} ${(item.codigos_barra || []).map((c) => c.codigo).join(" ")}`);
      return term.split(" ").filter(Boolean).every((token) => text.includes(token));
    });
  }, [enriched, filter, q]);

  const stats = useMemo(() => {
    const totalStock = enriched.reduce((acc, item) => acc + num(item.stock_total), 0);
    return {
      consumibles: enriched.length,
      stock: totalStock,
      sinPeso: enriched.filter((item) => item.peso_unitario_g == null).length,
      sinStock: enriched.filter((item) => item.stock_total <= 0).length,
    };
  }, [enriched]);

  async function guardarEdicion() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await actualizarConsumiblePanol(selected.id, editForm);
      setItems((prev) => prev.map((item) => (item.id === selected.id ? { ...item, ...updated, codigos_barra: item.codigos_barra || [] } : item)));
      toast?.success("Consumible actualizado.");
    } catch (error) {
      toast?.error(error.message || "No se pudo guardar el consumible.");
    } finally {
      setSaving(false);
    }
  }

  async function crearConsumible() {
    setSaving(true);
    try {
      const created = await crearConsumiblePanol({
        descripcion: createForm.descripcion,
        categoriaId: createForm.categoria_id,
        unidadMedida: createForm.unidad_medida,
        proveedor: createForm.proveedor,
        codigo: createForm.codigo,
        codigoBarra: createForm.codigo_barra,
        notas: createForm.notas,
      });
      setItems((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setShowCreate(false);
      setCreateForm({ descripcion: "", categoria_id: categorias[0]?.id || "", proveedor: "", codigo: "", codigo_barra: "", unidad_medida: "unidad", notas: "" });
      toast?.success("Consumible creado en catálogo.");
    } catch (error) {
      toast?.error(error.message || "No se pudo crear el consumible.");
    } finally {
      setSaving(false);
    }
  }

  async function marcarExistenteComoConsumible(material) {
    if (!material?.id) return;
    setSaving(true);
    try {
      const updated = await actualizarConsumiblePanol(material.id, {
        descripcion: material.descripcion,
        categoria_id: material.categoria_id || "",
        proveedor: material.proveedor || "",
        codigo: material.codigo || "",
        unidad_medida: material.unidad || material.unidad_medida || "unidad",
        notas: material.notas || "Marcado como consumible desde panol.",
      });
      const row = { ...updated, codigos_barra: material.codigos_barra || [] };
      setItems((prev) => [row, ...prev.filter((item) => item.id !== row.id)]);
      setSelectedId(row.id);
      setCatalogQ("");
      setCatalogResults([]);
      setShowCreate(false);
      toast?.success("Consumible agregado desde el catalogo.");
    } catch (error) {
      toast?.error(error.message || "No se pudo marcar como consumible.");
    } finally {
      setSaving(false);
    }
  }

  async function quitarConsumible() {
    if (!selected) return;
    if (!window.confirm(`Sacar "${selected.descripcion}" de la pestaña Consumibles? No se borra el catálogo ni el historial.`)) return;
    setSaving(true);
    try {
      await sacarConsumiblePanol(selected.id);
      setItems((prev) => prev.filter((item) => item.id !== selected.id));
      setSelectedId((prev) => (prev === selected.id ? null : prev));
      toast?.success("Ya no aparece como consumible.");
    } catch (error) {
      toast?.error(error.message || "No se pudo sacar de consumibles.");
    } finally {
      setSaving(false);
    }
  }

  async function agregarCodigo() {
    if (!selected) return;
    setSaving(true);
    try {
      const row = await agregarCodigoBarraMaterial(selected.id, barcodeForm.codigo, { etiqueta: barcodeForm.etiqueta });
      setItems((prev) => prev.map((item) => (item.id === selected.id ? { ...item, codigos_barra: [...(item.codigos_barra || []), row] } : item)));
      setBarcodeForm({ codigo: "", etiqueta: "" });
      toast?.success("Código agregado.");
    } catch (error) {
      toast?.error(error.message || "No se pudo agregar el código.");
    } finally {
      setSaving(false);
    }
  }

  async function borrarCodigo(row) {
    if (!selected) return;
    setSaving(true);
    try {
      await eliminarCodigoBarraMaterial({ id: row.id, materialId: selected.id, codigo: row.codigo });
      setItems((prev) => prev.map((item) => (
        item.id === selected.id ? { ...item, codigos_barra: (item.codigos_barra || []).filter((codigo) => codigo.id !== row.id && codigo.codigo !== row.codigo) } : item
      )));
    } catch (error) {
      toast?.error(error.message || "No se pudo borrar el código.");
    } finally {
      setSaving(false);
    }
  }

  async function leerPesoMuestra() {
    try {
      const res = await balanza.leerPeso();
      setGramosMuestra(res.gramos);
    } catch (error) {
      toast?.error(error.message || "No se pudo leer la balanza.");
    }
  }

  async function guardarPesoMuestra() {
    if (!selected) return;
    if (gramosMuestra == null) { toast?.warning("Primero leé el peso de la muestra en la balanza."); return; }
    if (num(piezasMuestra) <= 0) { toast?.warning("Poné cuántas piezas hay en la muestra."); return; }
    setSaving(true);
    try {
      const upd = await guardarPesoUnitario(selected.id, { gramosMuestra, piezas: piezasMuestra });
      setItems((prev) => prev.map((item) => (item.id === selected.id ? { ...item, ...upd } : item)));
      toast?.success(`Peso guardado: ${fmtWeight(upd.peso_unitario_g)} por unidad.`);
    } catch (error) {
      toast?.error(error.message || "No se pudo guardar el peso.");
    } finally {
      setSaving(false);
    }
  }

  async function guardarPesoDirecto() {
    if (!selected) return;
    setSaving(true);
    try {
      const upd = await guardarPesoUnitarioDirecto(selected.id, pesoDirecto);
      setItems((prev) => prev.map((item) => (item.id === selected.id ? { ...item, ...upd } : item)));
      toast?.success(`Peso actualizado: ${fmtWeight(upd.peso_unitario_g)} por unidad.`);
    } catch (error) {
      toast?.error(error.message || "No se pudo guardar el peso.");
    } finally {
      setSaving(false);
    }
  }

  async function borrarPeso() {
    if (!selected) return;
    setSaving(true);
    try {
      await borrarPesoUnitario(selected.id);
      setItems((prev) => prev.map((item) => (item.id === selected.id ? { ...item, peso_unitario_g: null, peso_muestra_piezas: null, peso_calibrado_at: null } : item)));
      toast?.success("Calibración borrada.");
    } catch (error) {
      toast?.error(error.message || "No se pudo borrar la calibración.");
    } finally {
      setSaving(false);
    }
  }

  async function calcularCantidadPorPeso() {
    if (!selected?.peso_unitario_g) {
      toast?.warning("Primero cargá el peso unitario del consumible.");
      return;
    }
    try {
      const res = await balanza.leerPeso();
      setPesoLeido(res.gramos);
      // Piezas enteras: "41,37 tornillos" no existe. El peso da un ESTIMADO y
      // la cantidad se puede corregir a mano antes de confirmar.
      const estimado = res.gramos / Number(selected.peso_unitario_g);
      const qty = Math.max(0, Math.round(estimado));
      setMovPesoGramos(String(Math.round(res.gramos * 1000) / 1000));
      setMovCantidad(String(qty));
      if (qty <= 0) toast?.warning("La balanza marcó 0. Revisá la tara o poné el material sobre el plato.");
    } catch (error) {
      toast?.error(error.message || "No se pudo leer la balanza.");
    }
  }

  async function leerPesoRetiro() {
    try {
      const res = await balanza.leerPeso();
      const gramos = Math.max(0, Math.round(num(res.gramos) * 1000) / 1000);
      setPesoLeido(gramos);
      setMovPesoGramos(String(gramos));
      if (selected?.peso_unitario_g) {
        const estimado = gramos / Number(selected.peso_unitario_g);
        setMovCantidad(String(Math.max(0, Math.round(estimado))));
      }
      if (gramos <= 0) toast?.warning("La balanza marco 0. Revisa la tara o el material sobre el plato.");
    } catch (error) {
      toast?.error(error.message || "No se pudo leer la balanza.");
    }
  }

  async function registrarMovimiento() {
    if (!selected) return;
    const esRetiroPeso = movimiento === "retiro_peso";
    const cantidad = num(movCantidad);
    const gramosRetiro = num(movPesoGramos || pesoLeido);
    if (esRetiroPeso && (!gramosRetiro || gramosRetiro <= 0)) {
      toast?.warning("Cargá o leé el peso retirado en gramos.");
      return;
    }
    if (!esRetiroPeso && (!cantidad || cantidad <= 0)) {
      toast?.warning("Cargá una cantidad válida.");
      return;
    }
    if (movimiento === "egreso" && cantidad > num(selected.stock_total)) {
      toast?.warning("No hay stock suficiente para egresar unidades. Usá 'Retiro por peso' para dejar solo el registro temporal.");
      return;
    }
    if (movimiento === "egreso" || esRetiroPeso) {
      const nameError = retiradoPorNombreCompletoError(movRetiradoPor);
      if (nameError) {
        toast?.warning(nameError);
        return;
      }
      if (!String(movDestino || "").trim()) {
        toast?.warning("Indica destino, sector o uso del consumible.");
        return;
      }
    }
    setSaving(true);
    try {
      if (esRetiroPeso) {
        await registrarRetiroConsumible({
          material: selected,
          cantidadGramos: gramosRetiro,
          sede: movSede,
          retiradoPor: movRetiradoPor,
          sectorDestino: String(movDestino || "").trim(),
          nota: movNota || "Retiro de consumible por peso",
        });
        toast?.success("Retiro registrado sin afectar stock.");
        setMovCantidad("");
        setMovNota("");
        setMovPesoGramos("");
        setPesoLeido(null);
        await cargar();
        return;
      }
      const pesoDetalle = pesoLeido != null ? `Peso leido: ${fmtWeight(pesoLeido)}.` : "";
      const notaFinal = [movNota || (movimiento === "ingreso" ? "Ingreso de consumible" : "Egreso de consumible"), pesoDetalle]
        .filter(Boolean)
        .join(" ");
      if (movimiento === "ingreso") {
        await ingresarStockGeneral({
          material: selected,
          cantidad,
          sede: movSede,
          nota: notaFinal,
        });
        toast?.success("Ingreso registrado.");
      } else {
        await egresarProducto({
          material: selected,
          cantidad,
          sede: movSede,
          unidad: selected.unidad_medida || "unidad",
          retiradoPor: movRetiradoPor,
          sectorDestino: String(movDestino || "").trim(),
          nota: notaFinal,
        });
        toast?.success("Egreso registrado.");
      }
      setMovCantidad("");
      setMovNota("");
      setMovPesoGramos("");
      setPesoLeido(null);
      await cargar();
    } catch (error) {
      toast?.error(error.message || "No se pudo registrar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  const pesoUnitarioCalculado = gramosMuestra != null && num(piezasMuestra) > 0 ? gramosMuestra / num(piezasMuestra) : null;
  const calidad = gramosMuestra != null ? calidadCalibracion(gramosMuestra) : null;

  const movActual = MOV_OPCIONES.find((op) => op.key === movimiento) || MOV_OPCIONES[0];
  const esSalida = movimiento === "egreso" || movimiento === "retiro_peso";
  const MovIcon = movActual.icon;
  const confirmLabel = movimiento === "retiro_peso"
    ? `Registrar retiro${movPesoGramos ? ` · ${movPesoGramos} g` : ""}`
    : `${movimiento === "egreso" ? "Confirmar egreso" : "Confirmar ingreso"}${movCantidad ? ` · ${movCantidad} ${selected?.unidad_medida || "unidad"}` : ""}`;

  const listCard = (
    <section style={{ ...CARD, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, ...(isMobile ? { maxHeight: 400, flex: "0 0 auto" } : {}) }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: "grid", gap: 9, flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar consumible, código, proveedor..." style={{ ...INPUT, paddingLeft: 33 }} />
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {[["todos", "Todos"], ["con_stock", "Con stock"], ["sin_stock", "Sin stock"], ["sin_peso", "Sin peso"]].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              style={{
                border: `1px solid ${filter === key ? C.blueB : C.border}`,
                background: filter === key ? C.blueL : C.panel,
                color: filter === key ? C.blue : C.dim,
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 32, color: C.dim, textAlign: "center", fontSize: 12, fontWeight: 850 }}>Cargando consumibles...</div>
        ) : visibles.length === 0 ? (
          <div style={{ padding: 32, color: C.dim, textAlign: "center", fontSize: 13 }}>No hay consumibles para estos filtros.</div>
        ) : visibles.map((item) => {
          const active = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              style={{
                width: "100%",
                border: "none",
                borderBottom: `1px solid ${C.border}`,
                borderLeft: `3px solid ${active ? C.blue : "transparent"}`,
                background: active ? C.blueL : "transparent",
                cursor: "pointer",
                padding: "12px 13px",
                textAlign: "left",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 10,
                alignItems: "center",
                fontFamily: C.sans,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 13.5, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</div>
                <div style={{ color: C.dim, fontSize: 11, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.codigo || "sin código"} · {item.proveedor || "Sin proveedor"}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                  {item.peso_unitario_g ? <StatusPill color={C.green} bg={C.greenL} border={C.greenB}>{fmtWeight(item.peso_unitario_g)}</StatusPill> : <StatusPill color={C.amber} bg={C.amberL} border={C.amberB}>Sin peso</StatusPill>}
                  {(item.codigos_barra || []).length > 0 && <StatusPill color={C.violet} bg="var(--violet-soft)" border="var(--violet-border)">{item.codigos_barra.length} códigos</StatusPill>}
                  {stockSedesArray(item).slice(0, 2).map(([sede, qty]) => (
                    <StatusPill key={sede} color={qty > 0 ? C.blue : C.red} bg={qty > 0 ? C.blueL : C.redL} border={qty > 0 ? C.blueB : C.redB}>{sede}: {fmtQty(qty)}</StatusPill>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: item.stock_total > 0 ? C.green : C.red, fontSize: 17, fontWeight: 950, fontFamily: C.mono }}>{fmtQty(item.stock_total)}</div>
                <div style={{ color: C.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 850 }}>{item.unidad_medida || "unidad"}</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );

  const detailContent = !selected ? (
    <section style={{ ...CARD, minHeight: 320, display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ color: C.dim, textAlign: "center" }}>
        <Scale size={36} style={{ color: C.blue, marginBottom: 10 }} />
        <div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>Elegí un consumible</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>Después podés egresar, ingresar, pesar o editarlo sin salir de acá.</div>
      </div>
    </section>
  ) : (
    <section style={{ ...CARD, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid2, display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 950, lineHeight: 1.2 }}>{selected.descripcion}</div>
          <div style={{ color: C.dim, fontSize: 11.5, marginTop: 3 }}>
            {categoriasById.get(selected.categoria_id) || "Sin rubro"} · {selected.proveedor || "Sin proveedor"} · {selected.codigo || "sin código"}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
            {stockSedesArray(selected).length ? stockSedesArray(selected).map(([sede, qty]) => (
              <StatusPill key={sede} color={qty > 0 ? C.blue : C.red} bg={qty > 0 ? C.blueL : C.redL} border={qty > 0 ? C.blueB : C.redB}>{sede}: {fmtQty(qty)}</StatusPill>
            )) : (
              <StatusPill color={C.dim} bg={C.panel} border={C.border}>Sin stock cargado</StatusPill>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: selected.stock_total > 0 ? C.green : C.red, fontSize: 22, fontWeight: 950, fontFamily: C.mono, lineHeight: 1 }}>{fmtQty(selected.stock_total)}</div>
          <div style={{ color: C.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 900, marginTop: 3 }}>{selected.unidad_medida} en stock</div>
        </div>
      </div>

      <div style={{ padding: 14, display: "grid", gap: 12 }}>
        {/* Acción principal: registrar movimiento. Va PRIMERO para que egresar no
            quede enterrado al fondo de la página. */}
        <div style={{ border: `1px solid ${movActual.border}`, background: C.panelSolid, borderRadius: 13, overflow: "hidden" }}>
          <div style={{ padding: "9px 12px", background: movActual.bg, borderBottom: `1px solid ${movActual.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <MovIcon size={15} style={{ color: movActual.color }} />
            <span style={{ color: movActual.color, fontSize: 11, fontWeight: 950, letterSpacing: 0.8, textTransform: "uppercase" }}>{movActual.titulo}</span>
            <span style={{ color: C.dim, fontSize: 11, marginLeft: "auto" }}>{movActual.desc}</span>
          </div>

          <div style={{ padding: 12, display: "grid", gap: 12 }}>
            <div>
              <span style={LABEL}>1 · Qué querés hacer</span>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {MOV_OPCIONES.map((op) => (
                  <ActionTile key={op.key} op={op} active={movimiento === op.key} onClick={() => setMovimiento(op.key)} />
                ))}
              </div>
            </div>

            <div>
              <span style={LABEL}>{movimiento === "retiro_peso" ? "2 · Peso retirado (gramos)" : "2 · Cantidad"}</span>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(140px, 220px) auto minmax(0, 1fr)", gap: 8, alignItems: "center" }}>
                {movimiento === "retiro_peso" ? (
                  <input value={movPesoGramos} onChange={(e) => setMovPesoGramos(e.target.value)} placeholder="Ej: 300" style={{ ...INPUT, fontFamily: C.mono }} />
                ) : (
                  <input value={movCantidad} onChange={(e) => setMovCantidad(e.target.value)} placeholder="Cant." style={{ ...INPUT, fontFamily: C.mono }} />
                )}
                {movimiento === "retiro_peso" ? (
                  <MiniButton onClick={leerPesoRetiro} disabled={!balanza.soportado || !balanza.conectado} tone="violet" title={balanza.conectado ? "Leer el peso de la balanza" : "Primero conectá la balanza desde el encabezado"}>
                    <Scale size={15} /> Leer balanza
                  </MiniButton>
                ) : selected.peso_unitario_g ? (
                  <MiniButton onClick={calcularCantidadPorPeso} disabled={!balanza.soportado || !balanza.conectado} tone="violet" title={balanza.conectado ? "Pesar y estimar la cantidad por peso unitario" : "Primero conectá la balanza desde el encabezado"}>
                    <Scale size={15} /> Pesar y calcular
                  </MiniButton>
                ) : (
                  <span style={{ color: C.dim, fontSize: 11, alignSelf: "center" }}>Sin peso calibrado: cargá la cantidad a mano o calibralo abajo.</span>
                )}
              </div>
              {movimiento !== "retiro_peso" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <span style={{ color: C.dim, fontSize: 11, fontWeight: 850, alignSelf: "center" }}>Cantidad rápida:</span>
                  {QUICK_CANTIDADES.map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setMovCantidad(String(qty))}
                      style={{
                        border: `1px solid ${movCantidad === String(qty) ? C.blueB : C.border}`,
                        background: movCantidad === String(qty) ? C.blueL : C.panel,
                        color: movCantidad === String(qty) ? C.blue : C.text,
                        borderRadius: 999,
                        padding: "5px 10px",
                        fontSize: 11,
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {qty}
                    </button>
                  ))}
                </div>
              )}
              {pesoLeido != null && (
                <div style={{ color: C.violet, background: "var(--violet-soft)", border: "1px solid var(--violet-border)", borderRadius: 10, padding: "7px 9px", fontSize: 12, fontWeight: 850, marginTop: 8 }}>
                  Peso leído: {fmtWeight(pesoLeido)}
                  {selected.peso_unitario_g ? ` · cantidad estimada ${movCantidad || "0"} ${selected.unidad_medida}` : " · se registra como gramos, sin tocar stock"}
                </div>
              )}
              {movimiento === "retiro_peso" && (
                <div style={{ border: `1px solid ${C.amberB}`, background: C.amberL, color: C.amber, borderRadius: 10, padding: "8px 10px", fontSize: 12, fontWeight: 850, marginTop: 8 }}>
                  Registro temporal: guarda gramos retirados, persona y destino. No descuenta stock ni genera negativo.
                </div>
              )}
            </div>

            <div>
              <span style={LABEL}>{esSalida ? "3 · Quién retira y para qué" : "3 · Detalle del ingreso"}</span>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "150px minmax(170px, 1fr)", gap: 8 }}>
                {!sedeLocked && (
                  <Field label="Sede">
                    <select value={movSede} onChange={(e) => setMovSede(e.target.value)} style={INPUT}>
                      {SEDES_PANOL.map((sede) => <option key={sede} value={sede}>{sede}</option>)}
                    </select>
                  </Field>
                )}
                {sedeLocked && <Field label="Sede"><input value={sedeLocked} readOnly style={{ ...INPUT, color: C.dim }} /></Field>}
                {esSalida ? (
                  <Field label="Retira"><input value={movRetiradoPor} onChange={(e) => setMovRetiradoPor(e.target.value)} placeholder="Nombre y apellido" style={INPUT} /></Field>
                ) : (
                  <Field label="Origen"><input value={movNota} onChange={(e) => setMovNota(e.target.value)} placeholder="Compra, ajuste, conteo..." style={INPUT} /></Field>
                )}
              </div>
              {esSalida && (
                <>
                  <div style={{ marginTop: 8 }}>
                    <Field label="Destino / sector / uso">
                      <input value={movDestino} onChange={(e) => setMovDestino(e.target.value)} placeholder="Ej: Mantenimiento, producción, reposición, merma..." style={INPUT} />
                    </Field>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {QUICK_DESTINOS.map((destino) => (
                      <button
                        key={destino}
                        type="button"
                        onClick={() => setMovDestino(destino)}
                        style={{
                          border: `1px solid ${movDestino === destino ? C.greenB : C.border}`,
                          background: movDestino === destino ? C.greenL : C.panel,
                          color: movDestino === destino ? C.green : C.dim,
                          borderRadius: 999,
                          padding: "5px 9px",
                          fontSize: 11,
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        {destino}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <input value={movNota} onChange={(e) => setMovNota(e.target.value)} placeholder={movimiento === "retiro_peso" ? "Detalle opcional del retiro por peso" : "Detalle opcional del egreso"} style={INPUT} />
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={registrarMovimiento}
              disabled={!canReceive || saving}
              style={{
                width: "100%",
                border: "none",
                borderRadius: 12,
                padding: "12px 14px",
                background: !canReceive || saving ? C.panel2 : movActual.color,
                color: !canReceive || saving ? C.dim : "#fff",
                fontSize: 14,
                fontWeight: 950,
                fontFamily: C.sans,
                cursor: !canReceive || saving ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <MovIcon size={16} /> {confirmLabel}
            </button>
            {!canReceive && (
              <div style={{ color: C.amber, fontSize: 12, fontWeight: 800 }}>Tu rol no tiene permisos para crear movimientos de pañol.</div>
            )}
          </div>
        </div>

        <Section
          title="Peso por pieza y calibración"
          icon={Scale}
          badge={selected.peso_unitario_g ? fmtWeight(selected.peso_unitario_g) : "Sin calibrar"}
          badgeColor={selected.peso_unitario_g ? C.green : C.amber}
          badgeBg={selected.peso_unitario_g ? C.greenL : C.amberL}
          badgeBorder={selected.peso_unitario_g ? C.greenB : C.amberB}
        >
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(190px, 1fr) minmax(240px, 1.4fr)", gap: 10 }}>
            <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, padding: 10 }}>
              <div style={{ color: C.dim, fontSize: 11, fontWeight: 850 }}>Peso actual</div>
              <div style={{ color: selected.peso_unitario_g ? C.green : C.amber, fontSize: 22, fontWeight: 950, fontFamily: C.mono, marginTop: 4 }}>{fmtWeight(selected.peso_unitario_g)}</div>
              <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                <input value={pesoDirecto} onChange={(e) => setPesoDirecto(e.target.value)} placeholder="g/unidad" style={{ ...INPUT, fontFamily: C.mono }} />
                <MiniButton onClick={guardarPesoDirecto} disabled={saving} tone="green"><Save size={15} /></MiniButton>
                <MiniButton onClick={borrarPeso} disabled={saving || !selected.peso_unitario_g} tone="red"><Trash2 size={15} /></MiniButton>
              </div>
            </div>
            <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, padding: 10 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>Calibrar con muestra</div>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 8, alignItems: "center" }}>
                <input value={piezasMuestra} onChange={(e) => setPiezasMuestra(e.target.value)} placeholder="Piezas" style={INPUT} />
                <div style={{ color: C.dim, fontSize: 12 }}>
                  {gramosMuestra == null ? "Leé el peso neto de una muestra grande." : `${fmtWeight(gramosMuestra)} muestra · ${pesoUnitarioCalculado ? fmtWeight(pesoUnitarioCalculado) : "sin cálculo"} c/u`}
                </div>
                <MiniButton onClick={leerPesoMuestra} disabled={!balanza.soportado || !balanza.conectado} tone="violet"><Scale size={15} /> Leer</MiniButton>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 9, flexWrap: "wrap" }}>
                <span style={{ color: calidad ? (calidad.nivel === "pobre" ? C.red : calidad.nivel === "aceptable" ? C.amber : C.green) : C.dim, fontSize: 12, fontWeight: 850 }}>
                  {calidad ? `Calidad: ${calidad.texto}` : "Ideal: muestra de 250 g o más."}
                </span>
                <MiniButton onClick={guardarPesoMuestra} disabled={saving || gramosMuestra == null || num(piezasMuestra) <= 0} tone="green"><Check size={15} /> Guardar peso</MiniButton>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Códigos de barra" icon={Barcode} badge={`${(selected.codigos_barra || []).length} cargados`}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {selected.codigos_barra?.length ? selected.codigos_barra.map((row) => (
              <span key={row.id || row.codigo} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 999, padding: "5px 8px", color: C.text, fontSize: 12, fontFamily: C.mono }}>
                {row.codigo}
                {row.etiqueta && <span style={{ color: C.dim, fontFamily: C.sans }}>{row.etiqueta}</span>}
                <button type="button" onClick={() => borrarCodigo(row)} style={{ border: "none", background: "transparent", color: C.red, cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}><Trash2 size={12} /></button>
              </span>
            )) : <span style={{ color: C.dim, fontSize: 12 }}>Sin códigos cargados.</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(180px, 1fr) 180px auto", gap: 8 }}>
            <input value={barcodeForm.codigo} onChange={(e) => setBarcodeForm((p) => ({ ...p, codigo: e.target.value }))} placeholder="Escanear o escribir código" style={INPUT} />
            <input value={barcodeForm.etiqueta} onChange={(e) => setBarcodeForm((p) => ({ ...p, etiqueta: e.target.value }))} placeholder="Etiqueta opcional" style={INPUT} />
            <MiniButton onClick={agregarCodigo} disabled={saving} tone="violet"><Plus size={15} /> Código</MiniButton>
          </div>
        </Section>

        <Section title="Datos del consumible" icon={Pencil}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 2fr) 170px 170px", gap: 8 }}>
            <Field label="Descripción"><input value={editForm.descripcion} onChange={(e) => setEditForm((p) => ({ ...p, descripcion: e.target.value }))} style={INPUT} /></Field>
            <Field label="Rubro"><select value={editForm.categoria_id} onChange={(e) => setEditForm((p) => ({ ...p, categoria_id: e.target.value }))} style={INPUT}><option value="">Sin rubro</option>{categorias.map((cat) => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}</select></Field>
            <Field label="Unidad"><input value={editForm.unidad_medida} onChange={(e) => setEditForm((p) => ({ ...p, unidad_medida: e.target.value }))} style={INPUT} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "170px 220px 1fr auto auto", gap: 8, alignItems: "end", marginTop: 8 }}>
            <Field label="Código interno"><input value={editForm.codigo} onChange={(e) => setEditForm((p) => ({ ...p, codigo: e.target.value }))} style={INPUT} /></Field>
            <Field label="Proveedor"><input value={editForm.proveedor} onChange={(e) => setEditForm((p) => ({ ...p, proveedor: e.target.value }))} style={INPUT} /></Field>
            <Field label="Notas"><input value={editForm.notas} onChange={(e) => setEditForm((p) => ({ ...p, notas: e.target.value }))} style={INPUT} /></Field>
            <MiniButton onClick={guardarEdicion} disabled={saving} tone="green"><Save size={15} /> Guardar</MiniButton>
            <MiniButton onClick={quitarConsumible} disabled={saving || !isAdmin} tone="red" title={isAdmin ? "Sacar de consumibles" : "Solo admin puede sacar de consumibles"}><Trash2 size={15} /> Sacar</MiniButton>
          </div>
        </Section>

        <Section title="Historial del consumible" icon={Clock3} badge={`${selectedHistory.length} movimientos`}>
          {selectedHistory.length ? (
            <div style={{ display: "grid", gap: 7 }}>
              {selectedHistory.map((row) => (
                <MovimientoRow key={row.id || `${rowMovementAt(row)}-${row.descripcion}`} row={row} unidad={selected.unidad_medida || "unidad"} />
              ))}
            </div>
          ) : (
            <div style={{ border: `1px dashed ${C.border}`, background: C.panel, borderRadius: 12, padding: 14, color: C.dim, fontSize: 12, textAlign: "center" }}>
              Sin movimientos registrados todavia.
            </div>
          )}
        </Section>
      </div>
    </section>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Encabezado compacto: título + acciones, y una fila de navegación con los
          números como chips clickeables (reemplaza a la tarjeta gigante de KPIs). */}
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}`, background: C.topbarSoft, padding: isMobile ? "10px 12px" : "10px 18px", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: C.greenL, border: `1px solid ${C.greenB}`, color: C.green, flexShrink: 0 }}>
            <Scale size={19} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: C.text, fontSize: 17, fontWeight: 950, lineHeight: 1.1 }}>Consumibles</div>
            <div style={{ color: C.dim, fontSize: 11.5, marginTop: 2 }}>Elegí un ítem de la lista y registrá el movimiento: egreso, retiro por peso o ingreso.</div>
          </div>
          {balanza.conectado ? (
            <StatusPill color={C.green} bg={C.greenL} border={C.greenB}>Balanza conectada</StatusPill>
          ) : (
            <MiniButton onClick={balanza.conectar} disabled={!balanza.soportado} tone="violet">
              <Plug size={15} /> Conectar balanza
            </MiniButton>
          )}
          <MiniButton onClick={cargar} disabled={loading}>
            <RefreshCw size={15} /> Actualizar
          </MiniButton>
          <MiniButton onClick={() => setShowCreate((v) => !v)} tone="primary">
            <PackagePlus size={15} /> Nuevo consumible
          </MiniButton>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", gap: 3, padding: 3, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 11 }}>
            <SegTab active={panel === "operar"} onClick={() => setPanel("operar")}><Scale size={13} /> Operar</SegTab>
            <SegTab active={panel === "movimientos"} onClick={() => setPanel("movimientos")}><Clock3 size={13} /> Movimientos ({consumibleMovimientos.length})</SegTab>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <StatChip label="Consumibles" value={stats.consumibles} color={C.blue} active={panel === "operar" && filter === "todos"} onClick={() => { setPanel("operar"); setFilter("todos"); }} />
            <StatChip label="Stock total" value={fmtQty(stats.stock)} color={C.green} active={panel === "operar" && filter === "con_stock"} onClick={() => { setPanel("operar"); setFilter("con_stock"); }} />
            <StatChip label="Sin peso" value={stats.sinPeso} color={C.amber} active={panel === "operar" && filter === "sin_peso"} onClick={() => { setPanel("operar"); setFilter("sin_peso"); }} />
            <StatChip label="Sin stock" value={stats.sinStock} color={C.red} active={panel === "operar" && filter === "sin_stock"} onClick={() => { setPanel("operar"); setFilter("sin_stock"); }} />
          </div>
        </div>

        {balanza.error && (
          <div style={{ border: `1px solid ${C.amberB}`, background: C.amberL, color: C.amber, borderRadius: 10, padding: "8px 10px", fontSize: 12, fontWeight: 750, display: "flex", gap: 8 }}>
            <AlertTriangle size={16} /> {balanza.error}
          </div>
        )}
      </div>

      {showCreate && (
        <div style={{ flexShrink: 0, padding: isMobile ? "10px 12px 0" : "12px 18px 0" }}>
          <section style={{ border: `1px solid ${C.blueB}`, background: C.blueL, borderRadius: 13, padding: 12, display: "grid", gap: 10, maxHeight: 320, overflowY: "auto" }}>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>Agregar consumible</div>
            <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>Usar un item existente del catalogo</div>
              <div style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
                <input
                  value={catalogQ}
                  onChange={(e) => setCatalogQ(e.target.value)}
                  placeholder="Buscar en catalogo para marcar como consumible..."
                  style={{ ...INPUT, paddingLeft: 33 }}
                />
              </div>
              {catalogQ.trim().length >= 2 && (
                <div style={{ display: "grid", gap: 6, maxHeight: 210, overflow: "auto" }}>
                  {catalogLoading ? (
                    <div style={{ color: C.dim, fontSize: 12, padding: 8 }}>Buscando...</div>
                  ) : catalogResults.length ? catalogResults.map((material) => (
                    <button
                      key={material.id}
                      type="button"
                      onClick={() => marcarExistenteComoConsumible(material)}
                      disabled={saving}
                      style={{
                        border: `1px solid ${C.border}`,
                        background: C.panel,
                        borderRadius: 10,
                        padding: 9,
                        cursor: saving ? "default" : "pointer",
                        textAlign: "left",
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: 8,
                        alignItems: "center",
                        fontFamily: C.sans,
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", color: C.text, fontSize: 13, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{material.descripcion}</span>
                        <span style={{ display: "block", color: C.dim, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {material.codigo || "sin codigo"} · {material.proveedor || "Sin proveedor"} · {material.unidad || "unidad"}
                        </span>
                      </span>
                      <span style={{ color: C.green, fontSize: 11, fontWeight: 950 }}>Usar</span>
                    </button>
                  )) : (
                    <div style={{ color: C.dim, fontSize: 12, padding: 8 }}>No encontre coincidencias. Crealo abajo como consumible nuevo.</div>
                  )}
                </div>
              )}
            </div>
            <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>Crear consumible nuevo en catalogo</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 2fr) 170px 160px 130px", gap: 8 }}>
              <input value={createForm.descripcion} onChange={(e) => setCreateForm((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción del consumible" style={INPUT} />
              <select value={createForm.categoria_id} onChange={(e) => setCreateForm((p) => ({ ...p, categoria_id: e.target.value }))} style={INPUT}>
                <option value="">Rubro</option>
                {categorias.map((cat) => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
              </select>
              <input value={createForm.proveedor} onChange={(e) => setCreateForm((p) => ({ ...p, proveedor: e.target.value }))} placeholder="Proveedor" style={INPUT} />
              <input value={createForm.unidad_medida} onChange={(e) => setCreateForm((p) => ({ ...p, unidad_medida: e.target.value }))} placeholder="Unidad" style={INPUT} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "180px 220px 1fr 150px", gap: 8 }}>
              <input value={createForm.codigo} onChange={(e) => setCreateForm((p) => ({ ...p, codigo: e.target.value }))} placeholder="Código interno" style={INPUT} />
              <input value={createForm.codigo_barra} onChange={(e) => setCreateForm((p) => ({ ...p, codigo_barra: e.target.value }))} placeholder="Código de barra" style={INPUT} />
              <input value={createForm.notas} onChange={(e) => setCreateForm((p) => ({ ...p, notas: e.target.value }))} placeholder="Observación" style={INPUT} />
              <MiniButton onClick={crearConsumible} disabled={saving} tone="green"><Plus size={15} /> Crear</MiniButton>
            </div>
          </section>
        </div>
      )}

      {panel === "movimientos" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : 18 }}>
          <MovimientosConsumiblesPanel rows={consumibleMovimientos} itemsById={new Map(enriched.map((item) => [item.id, item]))} />
        </div>
      ) : isMobile ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "grid", gap: 12, alignContent: "start" }}>
          {listCard}
          {detailContent}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(280px, 400px) minmax(0, 1fr)", gap: 12, padding: 18 }}>
          <div style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>{listCard}</div>
          <div style={{ minHeight: 0, overflowY: "auto" }}>{detailContent}</div>
        </div>
      )}
    </div>
  );
}

function MovimientosConsumiblesPanel({ rows = [], itemsById = new Map() }) {
  return (
    <section style={{ ...CARD, padding: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>Movimientos de consumibles</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Retiros por peso, ingresos y egresos registrados. Los retiros por peso no modifican stock.</div>
        </div>
        <StatusPill color={C.amber} bg={C.amberL} border={C.amberB}>Registro temporal por gramos</StatusPill>
      </div>
      {rows.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row) => {
            const item = itemsById.get(row.material_id) || null;
            return (
              <MovimientoRow
                key={row.id || `${rowMovementAt(row)}-${row.descripcion}`}
                row={row}
                unidad={item?.unidad_medida || row.unidad || "unidad"}
                materialName={item?.descripcion || row.descripcion || "Consumible"}
                showMaterial
              />
            );
          })}
        </div>
      ) : (
        <div style={{ border: `1px dashed ${C.border}`, background: C.panel, borderRadius: 12, padding: 22, color: C.dim, textAlign: "center", fontSize: 13 }}>
          Todavia no hay movimientos de consumibles.
        </div>
      )}
    </section>
  );
}

function MovimientoRow({ row, unidad = "unidad", materialName = "", showMaterial = false }) {
  const ui = movimientoUi(row);
  const delta = rowDelta(row);
  const pesoRetiro = row.source === "consumible_retiro" ? pesoRetiroGramos(row) : 0;
  const qty = pesoRetiro || Math.abs(delta || num(row.cantidad_egresada || row.cantidad || 0));
  const sign = row.source === "consumible_retiro" || rowIsEgreso(row) || delta < 0 ? "-" : delta > 0 ? "+" : "";
  const unidadDisplay = pesoRetiro ? "g" : unidad;
  const sede = row.stock_sede || row.panol_envio?.sede || "Sin sede";
  const destino = row.sector_destino || row.egreso_destino || "";
  const quien = row.retirado_por || "";
  const usuario = row.egreso_por_nombre || row.egreso_actor?.username || "";
  const nota = row.egreso_nota || row.stock_nota || row.notas || row.recepcion_nota || "";
  const muted = rowIsAnulado(row);

  return (
    <div
      style={{
        border: `1px solid ${ui.border}`,
        background: ui.bg,
        borderRadius: 12,
        padding: 10,
        display: "grid",
        gridTemplateColumns: "82px minmax(0, 1fr) auto",
        gap: 10,
        alignItems: "center",
        opacity: muted ? 0.65 : 1,
      }}
    >
      <span style={{ color: ui.color, fontSize: 10, fontWeight: 950, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: muted ? "line-through" : "none" }}>
        {ui.label}
      </span>
      <div style={{ minWidth: 0, textDecoration: muted ? "line-through" : "none" }}>
        {showMaterial && (
          <div style={{ color: C.text, fontSize: 13, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
            {materialName}
          </div>
        )}
        <div style={{ color: C.text, fontSize: 12.5, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fmtDate(rowMovementAt(row))} · {sede}
          {destino ? ` · ${destino}` : ""}
          {quien ? ` · Retira: ${quien}` : ""}
          {usuario ? ` · Usuario: ${usuario}` : ""}
        </div>
        {nota && (
          <div style={{ color: C.dim, fontSize: 11, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nota}</div>
        )}
      </div>
      <span style={{ color: ui.color, fontSize: 13, fontWeight: 950, fontFamily: C.mono, whiteSpace: "nowrap" }}>
        {sign}{fmtQty(qty)} {unidadDisplay}
      </span>
    </div>
  );
}

function SegTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        background: active ? C.blue : "transparent",
        color: active ? "#fff" : C.dim,
        borderRadius: 8,
        padding: "7px 12px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 900,
        fontFamily: C.sans,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function StatChip({ label, value, color, active = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Ver ${label.toLowerCase()}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        border: `1px solid ${active ? color : C.border}`,
        background: C.panel,
        borderRadius: 999,
        padding: "5px 11px",
        cursor: "pointer",
        fontFamily: C.sans,
      }}
    >
      <span style={{ color, fontSize: 13, fontWeight: 950, fontFamily: C.mono }}>{value}</span>
      <span style={{ color: active ? color : C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
    </button>
  );
}

function ActionTile({ op, active, onClick }) {
  const Icon = op.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? op.border : C.border}`,
        background: active ? op.bg : C.panel,
        borderRadius: 12,
        padding: "10px 11px",
        cursor: "pointer",
        textAlign: "left",
        display: "grid",
        gap: 3,
        fontFamily: C.sans,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 7, color: active ? op.color : C.text, fontSize: 12.5, fontWeight: 950 }}>
        <Icon size={14} /> {op.label}
      </span>
      <span style={{ color: active ? op.color : C.dim, fontSize: 11, fontWeight: 700 }}>{op.desc}</span>
    </button>
  );
}

function Section({ title, icon: Icon, badge = null, badgeColor = C.dim, badgeBg = C.panel, badgeBorder = C.border, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 13, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", border: "none", background: "transparent", cursor: "pointer", padding: "11px 12px", display: "flex", alignItems: "center", gap: 8, fontFamily: C.sans }}
      >
        {Icon && <Icon size={15} style={{ color: C.blue, flexShrink: 0 }} />}
        <span style={{ color: C.text, fontSize: 13, fontWeight: 950, flex: 1, textAlign: "left" }}>{title}</span>
        {badge != null && <StatusPill color={badgeColor} bg={badgeBg} border={badgeBorder}>{badge}</StatusPill>}
        <ChevronDown size={15} style={{ color: C.dim, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
      </button>
      {open && <div style={{ padding: "0 12px 12px" }}>{children}</div>}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 0 }}>
      <span style={LABEL}>{label}</span>
      {children}
    </label>
  );
}
