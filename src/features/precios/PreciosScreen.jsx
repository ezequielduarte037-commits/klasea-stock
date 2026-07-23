import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  CircleCheck,
  ChevronRight,
  ClipboardList,
  FileText,
  Filter,
  History,
  Link2,
  Loader2,
  PackagePlus,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Users,
  Unlink,
  Wand2,
  X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import {
  aplicarPreciosComprobante,
  asignarProveedorPrincipalMasivo,
  asociarProveedorAlternativoMasivo,
  asociarProveedorMaterial,
  borrarComprobante,
  fetchCatalogo,
  fetchMemoriaVinculos,
  guardarComprobante,
  guardarComprobanteItem,
  guardarComprobanteItems,
  guardarPrecioVarianteMaterial,
  guardarProveedor,
  leerPresupuestoConIA,
  precioDesactualizado,
  registrarOfertaMaterial,
  revertirAltasAutomaticasComprobantes,
  vincularComprobanteConIA,
} from "@/features/materiales/api";
import ProveedoresTab from "@/features/materiales/ProveedoresTab";
import ProveedorTipoBadge from "@/features/materiales/ProveedorTipoBadge";
import { proveedorMeta } from "@/features/materiales/proveedorMeta";

/* ── Superficies ───────────────────────────────────────────────────────────
   Regla del sistema: el FONDO de la página es gris y las cards son SÓLIDAS
   (blancas en claro). Antes todo usaba C.panel (gris translúcido) sobre gris,
   con items grises adentro → tres niveles de gris apilados y sensación de barro.
   Ahora: página gris → panel sólido → filas transparentes separadas por hairline. */
const surface = {
  background: C.panelSolid,
  border: `1px solid ${C.b0}`,
  borderRadius: 12,
  boxShadow: "0 1px 2px var(--shadow)",
};
const money = (value, currency = "ARS") => {
  // Ojo: Number(null) y Number("") dan 0, no NaN. Sin este chequeo previo, un
  // material sin precio se mostraba como "US$ 0" (parecía costar cero).
  if (value == null || value === "") return "Sin precio";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Sin precio";
  return `${currency === "USD" ? "US$" : "$"} ${number.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
};

const asNumber = (value) => {
  if (value === "" || value == null) return null;
  const raw = String(value).trim().replace(/\s/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const dateLabel = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Sin fecha"
    : date.toLocaleDateString("es-AR");
};

const ageLabel = (value) => {
  if (!value) return "Sin cotización";
  const days = Math.max(
    0,
    Math.floor(
      (Date.now() -
        new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime()) /
        86400000,
    ),
  );
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 31) return `Hace ${days} días`;
  return `Hace ${Math.round(days / 30)} meses`;
};

const button = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: `1px solid ${C.b1}`,
  background: C.panel,
  color: C.t1,
  borderRadius: 8,
  padding: "8px 11px",
  cursor: "pointer",
  fontFamily: C.sans,
  fontSize: 12,
  fontWeight: 600,
  transition:
    "transform .16s ease, border-color .16s ease, background .16s ease",
};

const primary = {
  ...button,
  background: C.blue,
  color: "var(--inverse-text)",
  borderColor: C.blue,
  boxShadow: "0 7px 18px color-mix(in srgb, var(--blue) 20%, transparent)",
};
const input = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: `1px solid ${C.b1}`,
  background: C.panelSolid,
  color: C.t0,
  borderRadius: 8,
  padding: "9px 10px",
  outline: "none",
  fontFamily: C.sans,
  fontSize: 12.5,
};

const label = {
  display: "block",
  marginBottom: 6,
  color: C.t2,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.8,
  textTransform: "uppercase",
};

function Pill({ kind = "neutral", children }) {
  const palette =
    kind === "ok"
      ? [C.green, C.greenL, C.greenB]
      : kind === "warn"
        ? [C.amber, C.amberL, C.amberB]
        : kind === "danger"
          ? [C.red, C.redL, C.redB]
          : kind === "blue"
            ? [C.blue, C.blueL, C.blueB]
            : [C.t2, C.panel2, C.b0];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        color: palette[0],
        background: palette[1],
        border: `1px solid ${palette[2]}`,
        borderRadius: 999,
        padding: "3px 7px",
        fontSize: 10.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Metric({ icon, label, value, hint, color = C.blue, onClick }) {
  const MetricIcon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        cursor: onClick ? "pointer" : "default",
        background: "transparent",
        color: C.t0,
        padding: "11px 13px",
        minWidth: 145,
        textAlign: "left",
        borderRight: `1px solid ${C.b0}`,
        fontFamily: C.sans,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          color: C.t2,
          fontSize: 10,
          letterSpacing: 0.9,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        <MetricIcon size={13} style={{ color }} />
        {label}
      </div>
      <div
        style={{
          marginTop: 5,
          color,
          fontFamily: C.mono,
          fontSize: 21,
          lineHeight: 1,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 4, color: C.t3, fontSize: 10.5 }}>{hint}</div>
    </button>
  );
}

function ProviderCard({ provider, info, selected, onClick, providers }) {
  const [hover, setHover] = useState(false);
  const meta = proveedorMeta(provider.nombre, providers);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: C.sans,
        color: C.t0,
        // Fila, no caja: sin borde propio ni fondo gris. El estado se comunica
        // con una barra de acento a la izquierda y un tinte suave.
        border: "none",
        borderLeft: `3px solid ${selected ? C.blue : "transparent"}`,
        borderBottom: `1px solid ${C.b0}`,
        borderRadius: 0,
        padding: "12px 12px 12px 13px",
        background: selected ? C.blueL : hover ? C.panel : "transparent",
        transition: "background .14s ease, border-color .14s ease",
      }}
    >
      <div
        style={{ display: "flex", gap: 9, minWidth: 0, alignItems: "center" }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            color: selected ? C.blue : C.t2,
            background: selected ? C.panelSolid : C.panelSolid2,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Users size={15} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {provider.nombre}
          </div>
          <div style={{ color: C.t2, fontSize: 10.5, marginTop: 3 }}>
            {info.total} materiales asociados
          </div>
        </div>
        <ChevronRight size={15} style={{ color: selected ? C.blue : C.t3 }} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        {meta && <ProveedorTipoBadge meta={meta} compact />}
        {info.missing > 0 && <Pill kind="warn">{info.missing} sin precio</Pill>}
        {info.stale > 0 && <Pill kind="danger">{info.stale} a revisar</Pill>}
        {info.missing === 0 && info.stale === 0 && (
          <Pill kind="ok">Al día</Pill>
        )}
      </div>
    </button>
  );
}

function MaterialItem({
  material,
  provider,
  selected,
  onClick,
  selectable = false,
  checked = false,
  onToggleCheck,
}) {
  const [hover, setHover] = useState(false);
  const providerId = provider?.id;
  const alternative = (material.proveedores_lista || []).find(
    (item) => item.proveedor_id === providerId,
  );
  const isMain = material.proveedor_id === providerId;
  const value = isMain ? material.precio_unitario : alternative?.precio;
  const currency = isMain ? material.moneda : alternative?.moneda;
  const stale = value != null && isMain && precioDesactualizado(material);
  const variants = Array.isArray(material.variantes) ? material.variantes : [];
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: C.sans,
        color: C.t0,
        // Igual que ProviderCard: fila con acento, no caja gris suelta.
        border: "none",
        borderLeft: `3px solid ${selected ? C.blue : "transparent"}`,
        borderBottom: `1px solid ${C.b0}`,
        borderRadius: 0,
        padding: "11px 12px 11px 12px",
        background: selected ? C.blueL : hover ? C.panel : "transparent",
        transition: "background .14s ease, border-color .14s ease",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectable
            ? "auto minmax(0,1fr) auto"
            : "minmax(0,1fr) auto",
          gap: 9,
          alignItems: "center",
        }}
      >
        {selectable && (
          // Cuadrito de selección para la asignación masiva. Se detiene la
          // propagación para poder tildar sin abrir el detalle del material.
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleCheck?.();
            }}
            style={{
              width: 17,
              height: 17,
              borderRadius: 5,
              border: `1.5px solid ${checked ? C.blue : C.b1}`,
              background: checked ? C.blue : "transparent",
              color: "var(--inverse-text)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            {checked && <Check size={12} strokeWidth={3} />}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {material.descripcion}
            </span>
            {/* Sólo marcamos la excepción: si es proveedor alternativo. Poner
                "Principal" en todas las filas no aporta información. */}
            {!isMain && <Pill kind="neutral">Alternativo</Pill>}
          </div>
          <div style={{ color: C.t2, fontSize: 10.5, marginTop: 3 }}>
            {material.codigo || "Sin código"}
            {material.unidad_medida ? ` · ${material.unidad_medida}` : ""}
            {variants.length
              ? ` · ${variants.length} variante${variants.length === 1 ? "" : "s"}`
              : ""}
          </div>
        </div>
        {/* Sin precio → un solo texto ámbar. Con precio → el número, y sólo se
            aclara abajo si hay que revisarlo. "Cotizado" en cada fila era ruido. */}
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              color: value != null ? C.t0 : C.amber,
              fontFamily: value != null ? C.mono : C.sans,
              fontSize: value != null ? 12.5 : 11,
              fontWeight: value != null ? 700 : 600,
            }}
          >
            {money(value, currency || "ARS")}
          </div>
          {stale && (
            <div style={{ color: C.red, fontSize: 10, marginTop: 3, fontWeight: 600 }}>
              Revisar
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function QuoteEditor({ material, provider, providers, onSaved, toast }) {
  const [providerId, setProviderId] = useState(provider?.id || "");
  const [newProvider, setNewProvider] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [target, setTarget] = useState("base");
  const [variant, setVariant] = useState("");
  const [saving, setSaving] = useState(false);
  const variants = Array.isArray(material?.variantes) ? material.variantes : [];

  useEffect(() => {
    setProviderId(provider?.id || material?.proveedor_id || "");
    setNewProvider("");
    setPrice("");
    setCurrency(material?.moneda || "ARS");
    setTarget("base");
    setVariant("");
  }, [material?.id, provider?.id, material?.proveedor_id, material?.moneda]);

  const selectedProvider =
    providers.find((item) => item.id === providerId) || null;
  const ensureProvider = async () => {
    if (selectedProvider) return selectedProvider;
    const name = newProvider.trim();
    if (!name) throw new Error("Elegí un proveedor o escribí uno nuevo.");
    const existing = providers.find(
      (item) => normalize(item.nombre) === normalize(name),
    );
    if (existing) return existing;
    const id = await guardarProveedor({ nombre: name, activo: true });
    return { id, nombre: name, activo: true };
  };

  async function save(mode) {
    if (!material) return;
    setSaving(true);
    try {
      const supplier = await ensureProvider();
      if (mode === "link") {
        // asociarProveedorMaterial no hace nada si ya es el proveedor principal:
        // avisamos con precisión en vez de mostrar un "guardado" que no ocurrió.
        if (material.proveedor_id === supplier.id) {
          toast.info(`${supplier.nombre} ya es el proveedor vigente.`);
        } else {
          await asociarProveedorMaterial(material, supplier);
          toast.success(
            `${supplier.nombre} quedó asociado a ${material.descripcion}.`,
          );
        }
      } else {
        const numeric = asNumber(price);
        if (numeric == null || numeric < 0)
          throw new Error("Cargá un precio válido.");
        if (target === "variant") {
          if (!variant) throw new Error("Elegí la variante que se cotiza.");
          await asociarProveedorMaterial(material, supplier, {
            precio: numeric,
            moneda: currency,
          });
          await guardarPrecioVarianteMaterial(material, variant, {
            precio: numeric,
            moneda: currency,
            proveedor: supplier,
          });
          toast.success(`Precio guardado para la variante ${variant}.`);
        } else {
          // Multi-proveedor: cotizar un proveedor distinto del principal NO debe
          // robarle el puesto (si lo hacía, el material se iba de la lista del
          // proveedor en el que estabas parado y parecía que no se guardaba).
          //   - Sin principal, o es el mismo → pasa a ser el precio vigente.
          //   - Otro proveedor → se guarda como oferta alternativa, sin tocar el vigente.
          const esPrincipal =
            !material.proveedor_id || material.proveedor_id === supplier.id;
          if (esPrincipal) {
            await registrarOfertaMaterial(material, supplier, {
              precio: numeric,
              moneda: currency,
            });
            toast.success(`Precio vigente actualizado con ${supplier.nombre}.`);
          } else {
            await asociarProveedorMaterial(material, supplier, {
              precio: numeric,
              moneda: currency,
            });
            toast.success(
              `Cotización de ${supplier.nombre} guardada como alternativa.`,
            );
          }
        }
      }
      await onSaved?.();
    } catch (error) {
      toast.error(error.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (!material) return null;
  return (
    <div
      style={{ marginTop: 16, paddingTop: 15, borderTop: `1px solid ${C.b0}` }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
          marginBottom: 9,
        }}
      >
        <div style={{ color: C.t0, fontSize: 13, fontWeight: 600 }}>
          Nueva cotización
        </div>
        <Pill kind="blue">multi-proveedor</Pill>
      </div>
      <select
        value={providerId}
        onChange={(e) => {
          setProviderId(e.target.value);
          setNewProvider("");
        }}
        style={input}
      >
        <option value="">Crear o elegir proveedor</option>
        {providers
          .filter((item) => item.activo !== false)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.nombre}
            </option>
          ))}
      </select>
      {!providerId && (
        <input
          value={newProvider}
          onChange={(e) => setNewProvider(e.target.value)}
          placeholder="Nombre de proveedor nuevo"
          style={{ ...input, marginTop: 7 }}
        />
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
        <button
          type="button"
          onClick={() => setTarget("base")}
          style={{
            ...button,
            padding: "6px 9px",
            color: target === "base" ? C.blue : C.t2,
            borderColor: target === "base" ? C.blueB : C.b0,
            background: target === "base" ? C.blueL : C.panel,
          }}
        >
          Producto base
        </button>
        {variants.length > 0 && (
          <button
            type="button"
            onClick={() => setTarget("variant")}
            style={{
              ...button,
              padding: "6px 9px",
              color: target === "variant" ? C.violet : C.t2,
              borderColor: target === "variant" ? C.violet : C.b0,
              background: target === "variant" ? C.violet + "16" : C.panel,
            }}
          >
            Una variante
          </button>
        )}
      </div>
      {target === "variant" && (
        <select
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          style={{ ...input, marginTop: 8 }}
        >
          <option value="">Elegí variante</option>
          {variants.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 84px",
          gap: 7,
          marginTop: 8,
        }}
      >
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Precio"
          inputMode="decimal"
          style={{ ...input, fontFamily: C.mono }}
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          style={input}
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto",
          gap: 7,
          marginTop: 8,
        }}
      >
        <button
          type="button"
          onClick={() => save("quote")}
          disabled={saving}
          style={{ ...primary, opacity: saving ? 0.65 : 1 }}
        >
          {saving ? (
            <Loader2 size={14} className="precios-spin" />
          ) : (
            <Check size={14} />
          )}
          {saving
            ? "Guardando..."
            : target === "variant"
              ? "Guardar variante"
              : "Guardar cotización"}
        </button>
        <button
          type="button"
          onClick={() => save("link")}
          disabled={saving}
          title="Vincular proveedor sin cargar precio"
          style={{ ...button, padding: "8px 10px" }}
        >
          <Plus size={14} /> Vincular
        </button>
      </div>
    </div>
  );
}

function Detail({ material, provider, providers, categories, onSaved, toast }) {
  if (!material)
    return (
      <div
        style={{
          minHeight: 480,
          display: "grid",
          placeItems: "center",
          padding: 30,
          textAlign: "center",
          color: C.t2,
        }}
      >
        <div>
          <PackageSearch size={32} style={{ color: C.blue }} />
          <div style={{ color: C.t0, fontWeight: 600, marginTop: 11 }}>
            Elegí un material
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Cargá una cotización, una variante o asociá otro proveedor.
          </div>
        </div>
      </div>
    );
  const history = material.precio_historial || [];
  const allSuppliers = new Map();
  if (material.proveedor_id)
    allSuppliers.set(material.proveedor_id, {
      id: material.proveedor_id,
      nombre: material.proveedor,
      precio: material.precio_unitario,
      moneda: material.moneda,
      primary: true,
    });
  for (const item of material.proveedores_lista || [])
    if (item.proveedor_id)
      allSuppliers.set(item.proveedor_id, {
        id: item.proveedor_id,
        nombre:
          item.proveedor?.nombre ||
          providers.find((p) => p.id === item.proveedor_id)?.nombre ||
          "Proveedor",
        precio: item.precio,
        moneda: item.moneda,
        primary: false,
      });
  const category =
    categories.find((item) => item.id === material.categoria_id)?.nombre ||
    "Sin categoría";
  return (
    <div style={{ padding: 17 }}>
      <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
        <div
          style={{
            width: 40,
            height: 40,
            display: "grid",
            placeItems: "center",
            borderRadius: 12,
            background: C.blueL,
            color: C.blue,
            flexShrink: 0,
          }}
        >
          <Tag size={19} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, lineHeight: 1.2, fontWeight: 600 }}>
            {material.descripcion}
          </div>
          <div style={{ color: C.t2, fontSize: 11, marginTop: 5 }}>
            {material.codigo || "Sin código"} · {category}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 8,
          marginTop: 15,
        }}
      >
        <div
          style={{
            padding: 11,
            border: `1px solid ${C.b0}`,
            borderRadius: 12,
            background: C.panel2,
          }}
        >
          <div
            style={{
              color: C.t2,
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.8,
            }}
          >
            Precio vigente
          </div>
          <div
            style={{
              color: material.precio_unitario == null ? C.amber : C.green,
              fontFamily: C.mono,
              fontSize: 17,
              fontWeight: 700,
              marginTop: 5,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {money(material.precio_unitario, material.moneda)}
          </div>
        </div>
        <div
          style={{
            padding: 11,
            border: `1px solid ${C.b0}`,
            borderRadius: 12,
            background: C.panel2,
          }}
        >
          <div
            style={{
              color: C.t2,
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.8,
            }}
          >
            Proveedores
          </div>
          <div
            style={{
              color: C.t0,
              fontFamily: C.mono,
              fontSize: 17,
              fontWeight: 700,
              marginTop: 5,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {allSuppliers.size}
          </div>
          <div style={{ color: C.t3, fontSize: 10, marginTop: 3 }}>
            ofertas o vínculos
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ color: C.t0, fontSize: 12.5, fontWeight: 600 }}>
          Proveedores y precios
        </div>
        <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
          {[...allSuppliers.values()].map((item) => (
            <div
              key={item.id}
              style={{
                border: `1px solid ${item.id === provider?.id ? C.blueB : C.b0}`,
                background: item.id === provider?.id ? C.blueL : C.panel,
                borderRadius: 8,
                padding: "9px 10px",
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto",
                gap: 9,
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ color: C.t0, fontSize: 12, fontWeight: 600 }}>
                    {item.nombre}
                  </span>
                  {item.primary && <Pill kind="blue">vigente</Pill>}
                </div>
              </div>
              <span
                style={{
                  color: item.precio == null ? C.amber : C.t0,
                  fontFamily: C.mono,
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                {money(item.precio, item.moneda)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {Array.isArray(material.variantes) && material.variantes.length > 0 && (
        <div style={{ marginTop: 17 }}>
          <div style={{ color: C.t0, fontSize: 12.5, fontWeight: 600 }}>
            Precios por variante
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {material.variantes.map((name) => {
              const price = material.variantes_precios?.[name];
              return (
                <div
                  key={name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) auto",
                    gap: 9,
                    alignItems: "center",
                    padding: "8px 10px",
                    border: `1px solid ${C.b0}`,
                    background: C.panel,
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <div style={{ color: C.t0, fontSize: 12, fontWeight: 500 }}>
                      {name}
                    </div>
                    <div style={{ color: C.t3, fontSize: 10, marginTop: 2 }}>
                      {price?.proveedor || "Sin proveedor definido"}
                    </div>
                  </div>
                  <div
                    style={{
                      color: price?.precio != null ? C.violet : C.t3,
                      fontFamily: C.mono,
                      fontWeight: 600,
                      fontSize: 11.5,
                    }}
                  >
                    {money(price?.precio, price?.moneda)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <QuoteEditor
        material={material}
        provider={provider}
        providers={providers}
        onSaved={onSaved}
        toast={toast}
      />
      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: `1px solid ${C.b0}`,
        }}
      >
        <div style={{ color: C.t0, fontSize: 12.5, fontWeight: 600 }}>
          Últimas cotizaciones
        </div>
        {history.length ? (
          <div style={{ marginTop: 7 }}>
            {history.slice(0, 5).map((row) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) auto",
                  gap: 8,
                  padding: "8px 0",
                  borderBottom: `1px solid ${C.b0}`,
                }}
              >
                <div style={{ color: C.t2, fontSize: 11 }}>
                  {row.proveedor || "Sin proveedor"} ·{" "}
                  {dateLabel(row.fecha || row.created_at)}
                </div>
                <div
                  style={{
                    color: C.t0,
                    fontFamily: C.mono,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {money(row.precio_unitario, row.moneda)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: C.t3, fontSize: 11.5, marginTop: 7 }}>
            Todavía no hay historial de precio base.
          </div>
        )}
      </div>
    </div>
  );
}

function receiptPendingItems(receipt) {
  return (receipt?.items || []).filter((item) => !item.aplicado);
}

// El vínculo de un comprobante no es binario. Un producto recién creado desde
// este mismo remito sirve para preservar la carga, pero no debe mostrarse como
// una coincidencia validada con el catálogo existente.
function diceSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const pairs = new Map();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) || 0) + 1);
  }
  let shared = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const available = pairs.get(pair) || 0;
    if (!available) continue;
    shared += 1;
    pairs.set(pair, available - 1);
  }
  return (2 * shared) / (left.length + right.length - 2);
}

function receiptMatchScore(item, material) {
  if (!material) return 0;
  const source = normalize(item.descripcion_original || item.descripcion);
  const target = normalize(material.descripcion);
  const sourceCode = normalize(item.codigo || "");
  const targetCode = normalize(material.codigo || "");
  if (!source || !target) return 0;
  if (
    (sourceCode &&
      (sourceCode === targetCode || target.includes(sourceCode))) ||
    source === target
  )
    return 100;

  const sourceWords = [
    ...new Set(source.split(" ").filter((word) => word.length > 1)),
  ];
  const targetWords = [
    ...new Set(target.split(" ").filter((word) => word.length > 1)),
  ];
  const shared = sourceWords.filter((word) => targetWords.includes(word));
  const sourceCoverage = shared.length / Math.max(sourceWords.length, 1);
  const targetCoverage = shared.length / Math.max(targetWords.length, 1);
  const sourceNumbers =
    String(item.descripcion_original || item.descripcion || "").match(
      /\d+(?:[.,]\d+)?/g,
    ) || [];
  const targetNumbers =
    String(material.descripcion || "").match(/\d+(?:[.,]\d+)?/g) || [];
  const hasConflictingNumbers =
    sourceNumbers.length &&
    targetNumbers.length &&
    !sourceNumbers.some((number) => targetNumbers.includes(number));
  const tokenScore =
    (2 * sourceCoverage * targetCoverage) /
    Math.max(sourceCoverage + targetCoverage, 0.001);
  const textScore = diceSimilarity(source, target);
  let score = Math.round((tokenScore * 0.72 + textScore * 0.28) * 100);
  if (source.includes(target) || target.includes(source)) {
    score = Math.max(score, Math.min(94, 72 + shared.length * 4));
  }
  if (hasConflictingNumbers) score = Math.min(score, 42);
  return Math.min(99, score);
}

function rankReceiptMatches(item, materials, providerName = "") {
  const providerKey = normalize(providerName);
  return materials
    .map((material) => ({
      material,
      score: receiptMatchScore(item, material),
      sameProvider:
        !!providerKey &&
        normalize(
          `${material.proveedor || ""} ${(material.proveedores_lista || [])
            .map((row) => row.proveedor?.nombre || row.nombre || "")
            .join(" ")}`,
        ).includes(providerKey),
      established: material.revisado === true || material.origen !== "remito",
    }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.established) - Number(a.established) ||
        Number(b.sameProvider) - Number(a.sameProvider) ||
        String(a.material.created_at || "").localeCompare(
          String(b.material.created_at || ""),
        ),
    );
}

function receiptMatchInfo(item, materials, providerName = "") {
  const material = materials.find((row) => row.id === item.material_id) || null;
  const ranked = rankReceiptMatches(item, materials, providerName);
  const best = ranked[0] || null;
  if (!material)
    return {
      kind: "unlinked",
      material: null,
      score: 0,
      recommended: best,
    };
  const createdForThisReceipt = String(material.notas || "").includes(
    `[comprobante:${item.comprobante_id}]`,
  );
  if (createdForThisReceipt) {
    return {
      kind: "created",
      material,
      score: null,
      recommended: null,
    };
  }
  const score = receiptMatchScore(item, material);
  const manuallyConfirmed =
    normalize(item.descripcion) === normalize(material.descripcion) &&
    normalize(item.descripcion_original) !== normalize(item.descripcion);
  const betterEstablished =
    best &&
    best.material.id !== material.id &&
    best.established &&
    best.score >= 82 &&
    best.score >= score;
  return {
    kind:
      (score >= 82 && !betterEstablished) || manuallyConfirmed
        ? "matched"
        : "suggestion",
    material,
    score,
    recommended: betterEstablished ? best : null,
  };
}

function ReceiptQueueCard({ receipt, materials, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const pending = receiptPendingItems(receipt);
  const matchInfo = pending.map((item) =>
    receiptMatchInfo(item, materials, receipt.proveedor),
  );
  const matched = matchInfo.filter((item) => item.kind === "matched").length;
  const created = matchInfo.filter((item) => item.kind === "created").length;
  const toResolve = matchInfo.filter(
    (item) => item.kind === "unlinked" || item.kind === "suggestion",
  ).length;
  const total = pending.reduce(
    (sum, item) => sum + (asNumber(item.total) || 0),
    0,
  );
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        color: C.t0,
        fontFamily: C.sans,
        // Fila con acento, coherente con las otras listas de la pantalla.
        border: "none",
        borderLeft: `3px solid ${selected ? C.violet : "transparent"}`,
        borderBottom: `1px solid ${C.b0}`,
        background: selected
          ? "color-mix(in srgb, var(--violet) 10%, transparent)"
          : hover ? C.panel : "transparent",
        borderRadius: 0,
        padding: "11px 12px",
        transition: "background .14s ease, border-color .14s ease",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto",
          gap: 8,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {receipt.proveedor || "Proveedor por definir"}
          </div>
          <div style={{ color: C.t2, fontSize: 10.5, marginTop: 4 }}>
            {receipt.numero ? `Comprobante ${receipt.numero} · ` : ""}
            {dateLabel(receipt.fecha)}
          </div>
        </div>
        <ChevronRight size={15} style={{ color: selected ? C.violet : C.t3 }} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 9,
          flexWrap: "wrap",
        }}
      >
        <Pill kind={matched === pending.length ? "ok" : "warn"}>
          {matched}/{pending.length} coincidencias
        </Pill>
        {created > 0 && <Pill kind="warn">{created} nuevos</Pill>}
        {toResolve > 0 && <Pill kind="danger">{toResolve} a revisar</Pill>}
        {total > 0 && (
          <span
            style={{
              marginLeft: "auto",
              color: C.t2,
              fontSize: 10.5,
              fontFamily: C.mono,
              fontWeight: 600,
            }}
          >
            {money(total, receipt.moneda)}
          </span>
        )}
      </div>
    </button>
  );
}

function ReceiptItemReview({
  item,
  receipt,
  materials,
  isMobile,
  onMatchChanged,
  onLineChanged,
}) {
  const [editing, setEditing] = useState(false);
  const [editingAmounts, setEditingAmounts] = useState(false);
  const [query, setQuery] = useState("");
  const [quantity, setQuantity] = useState(item.cantidad ?? "");
  const [price, setPrice] = useState(item.precio_unitario ?? "");
  const [saving, setSaving] = useState(false);
  const source =
    item.descripcion_original || item.descripcion || "Sin descripcion";
  const selected = materials.find(
    (material) => material.id === item.material_id,
  );
  const match = receiptMatchInfo(item, materials, receipt.proveedor);
  useEffect(() => {
    setQuantity(item.cantidad ?? "");
    setPrice(item.precio_unitario ?? "");
  }, [item.id, item.cantidad, item.precio_unitario]);
  const suggestions = useMemo(() => {
    const searchItem = {
      ...item,
      descripcion_original: query || source,
      descripcion: query || source,
    };
    return rankReceiptMatches(searchItem, materials, receipt.proveedor)
      .filter((row) => row.score >= 45)
      .slice(0, 8);
  }, [item, materials, query, receipt.proveedor, source]);

  async function choose(material) {
    setSaving(true);
    try {
      await onMatchChanged(item, material);
      setEditing(false);
      setQuery("");
    } finally {
      setSaving(false);
    }
  }

  async function saveAmounts() {
    const nextQuantity = asNumber(quantity);
    const nextPrice = asNumber(price);
    setSaving(true);
    try {
      await onLineChanged(item, {
        cantidad: nextQuantity,
        precio_unitario: nextPrice,
        total:
          nextQuantity != null && nextPrice != null
            ? nextQuantity * nextPrice
            : item.total,
      });
      setEditingAmounts(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        padding: isMobile ? "12px" : "13px 15px",
        borderBottom: `1px solid ${C.b0}`,
        display: "grid",
        gridTemplateColumns: isMobile
          ? "1fr"
          : "minmax(260px,1.35fr) minmax(260px,1fr) auto",
        gap: 12,
        alignItems: "center",
        background: item.aplicado ? C.panel2 : C.panel,
        opacity: item.aplicado ? 0.7 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: C.t0, fontSize: 12.5, fontWeight: 600 }}>
            {source}
          </span>
          {item.aplicado && <Pill kind="ok">Aplicado</Pill>}
        </div>
        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 5 }}
        >
          <span style={{ color: C.t3, fontSize: 10.5 }}>
            {item.cantidad != null
              ? `${item.cantidad} u.`
              : "Cantidad sin definir"}
          </span>
          {item.total != null && (
            <span style={{ color: C.t3, fontSize: 10.5 }}>
              Total {money(item.total, receipt.moneda)}
            </span>
          )}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        {selected && !editing ? (
          <div
            style={{
              border: `1px solid ${match.kind === "created" || match.kind === "suggestion" ? C.amberB : C.greenB}`,
              background:
                match.kind === "created" || match.kind === "suggestion"
                  ? C.amberL
                  : C.greenL,
              borderRadius: 8,
              padding: "8px 9px",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            {match.kind === "created" ? (
              <PackagePlus
                size={14}
                style={{ color: C.amber, flexShrink: 0 }}
              />
            ) : match.kind === "suggestion" ? (
              <CircleAlert size={14} style={{ color: C.amber, flexShrink: 0 }} />
            ) : (
              <CircleCheck size={14} style={{ color: C.green, flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  color: C.t0,
                  fontSize: 11.5,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {selected.descripcion}
              </div>
              <div style={{ color: C.t2, fontSize: 10, marginTop: 2, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                <span>
                  {match.kind === "created"
                    ? "Producto nuevo creado desde este comprobante"
                    : match.kind === "suggestion"
                    ? "Vínculo para revisar"
                    : "Producto existente del catálogo"}
                </span>
                {match.score != null && (
                  <span style={{ color: match.kind === "suggestion" ? C.amber : C.green, fontFamily: C.mono, fontWeight: 700 }}>
                    {match.score}% coincidencia
                  </span>
                )}
                <span>
                  {selected.codigo || "Sin código"}
                  {selected.proveedor ? ` · ${selected.proveedor}` : ""}
                </span>
              </div>
              {match.recommended && (
                <button
                  type="button"
                  onClick={() => choose(match.recommended.material)}
                  disabled={saving || item.aplicado}
                  style={{
                    ...button,
                    marginTop: 7,
                    padding: "5px 7px",
                    color: C.blue,
                    borderColor: C.blueB,
                    background: C.blueL,
                    fontSize: 10.5,
                  }}
                >
                  Usar {match.recommended.material.descripcion} ·{" "}
                  {match.recommended.score}%
                </button>
              )}
            </div>
            {!item.aplicado && match.kind === "suggestion" && (
              <button
                type="button"
                onClick={() => choose(selected)}
                disabled={saving}
                style={{ ...button, padding: "5px 7px", fontSize: 10.5, color: C.green, borderColor: C.greenB, background: C.greenL }}
                title="Confirmar este vínculo como correcto"
              >
                Confirmar
              </button>
            )}
            {!item.aplicado && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                style={{ ...button, padding: "5px 7px", fontSize: 10.5 }}
                title="Cambiar el material vinculado"
              >
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ position: "relative", minWidth: 0, flex: 1 }}>
                <Search
                  size={13}
                  style={{
                    position: "absolute",
                    left: 9,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: C.t3,
                  }}
                />
                <input
                  value={query}
                  onFocus={() => setEditing(true)}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar material del catalogo"
                  disabled={item.aplicado || saving}
                  style={{
                    ...input,
                    paddingLeft: 29,
                    paddingTop: 8,
                    paddingBottom: 8,
                  }}
                />
              </div>
              {selected && !item.aplicado && (
                <button
                  type="button"
                  onClick={() => choose(null)}
                  disabled={saving}
                  style={{ ...button, padding: "6px 8px", color: C.red }}
                  title="Quitar vinculo con el catalogo"
                >
                  <Unlink size={13} />
                </button>
              )}
            </div>
            {editing && !item.aplicado && suggestions.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  zIndex: 4,
                  left: 0,
                  right: 0,
                  top: "calc(100% + 5px)",
                  padding: 5,
                  border: `1px solid ${C.b1}`,
                  borderRadius: 12,
                  background: C.panelSolid,
                  boxShadow:
                    "0 14px 28px color-mix(in srgb, var(--text) 14%, transparent)",
                }}
              >
                {suggestions.map(({ material, score }) => (
                  <button
                    key={material.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(material)}
                    style={{
                      width: "100%",
                      border: "none",
                      borderRadius: 8,
                      background: "transparent",
                      color: C.t0,
                      padding: "8px 9px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: C.sans,
                    }}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 600 }}>
                      {material.descripcion}
                    </div>
                    <div style={{ color: C.t3, fontSize: 10, marginTop: 2 }}>
                      {material.codigo || "Sin código"}
                      {material.proveedor ? ` · ${material.proveedor}` : ""} ·{" "}
                      {score}% de coincidencia
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!selected && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={item.aplicado}
                style={{
                  ...button,
                  width: "100%",
                  justifyContent: "flex-start",
                  color: C.amber,
                }}
              >
                <Link2 size={13} /> Vincular al catalogo
              </button>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          textAlign: isMobile ? "left" : "right",
          minWidth: isMobile ? 0 : 112,
        }}
      >
        {editingAmounts ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "70px minmax(0,1fr)",
              gap: 5,
              alignItems: "center",
            }}
          >
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Cant."
              inputMode="decimal"
              style={{ ...input, padding: "7px 8px", fontFamily: C.mono }}
            />
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="Precio"
              inputMode="decimal"
              style={{ ...input, padding: "7px 8px", fontFamily: C.mono }}
            />
            <button
              type="button"
              onClick={saveAmounts}
              disabled={saving}
              style={{
                ...primary,
                gridColumn: "1 / -1",
                padding: "6px 8px",
                fontSize: 10.5,
              }}
            >
              {saving ? (
                <Loader2 size={13} className="precios-spin" />
              ) : (
                <Check size={13} />
              )}
              Guardar correccion
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                color: item.precio_unitario == null ? C.amber : C.t0,
                fontFamily: C.mono,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {money(item.precio_unitario, receipt.moneda)}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: isMobile ? "flex-start" : "flex-end",
                gap: 5,
                alignItems: "center",
                marginTop: 3,
              }}
            >
              <span style={{ color: C.t3, fontSize: 10 }}>Precio unitario</span>
              {!item.aplicado && (
                <button
                  type="button"
                  onClick={() => setEditingAmounts(true)}
                  style={{ ...button, padding: "3px 5px", fontSize: 9.5 }}
                >
                  Editar
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReceiptImportContextModal({ file, providers, isMobile, onConfirm, onClose }) {
  const [providerId, setProviderId] = useState("");
  const [currency, setCurrency] = useState("");
  const provider = providers.find((item) => item.id === providerId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Contexto del comprobante"
      style={{ position: "fixed", inset: 0, zIndex: 10020, padding: isMobile ? 14 : 24, display: "grid", placeItems: "center", background: "var(--overlay-strong)", backdropFilter: "blur(5px)" }}
    >
      <div style={{ ...surface, width: "min(100%, 560px)", padding: isMobile ? 16 : 20, boxShadow: "0 24px 64px rgba(15,23,42,.24)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", color: C.violet, background: C.violet + "18", flexShrink: 0 }}><FileText size={18} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.t0, fontSize: 16, fontWeight: 750 }}>Antes de leer el comprobante</div>
            <div style={{ color: C.t2, fontSize: 12, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file?.name}</div>
          </div>
        </div>
        <div style={{ color: C.t2, fontSize: 12, lineHeight: 1.5, marginTop: 15 }}>Estos datos ayudan a la IA a reconocer productos del proveedor y diferenciar correctamente ARS de USD.</div>
        <div style={{ display: "grid", gap: 13, marginTop: 16 }}>
          <label>
            <span style={label}>Proveedor</span>
            <select value={providerId} onChange={(event) => setProviderId(event.target.value)} style={input}>
              <option value="">Detectar en el documento</option>
              {providers.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
          </label>
          <div>
            <span style={label}>Moneda</span>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {[["", "Detectar"], ["ARS", "ARS"], ["USD", "USD"]].map(([value, name]) => {
                const active = currency === value;
                const color = value === "USD" ? C.blue : value === "ARS" ? C.green : C.t1;
                const bg = value === "USD" ? C.blueL : value === "ARS" ? C.greenL : C.panel2;
                const border = value === "USD" ? C.blueB : value === "ARS" ? C.greenB : C.b0;
                return <button key={value || "auto"} type="button" onClick={() => setCurrency(value)} style={{ ...button, minWidth: name === "Detectar" ? 94 : 60, justifyContent: "center", borderColor: active ? border : C.b0, background: active ? bg : C.panel, color: active ? color : C.t2 }}>{name}</button>;
              })}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={button}>Cancelar</button>
          <button type="button" onClick={() => onConfirm({ proveedor: provider?.nombre || "", proveedorId: provider?.id || null, moneda: currency })} style={primary}><Sparkles size={14} /> Leer documento</button>
        </div>
      </div>
    </div>
  );
}

function ReceiptReviewWorkspace({
  receipts,
  materials,
  selectedReceiptId,
  onSelectReceipt,
  applyingId,
  onApply,
  onMatchChanged,
  onLineChanged,
  onUpload,
  onDelete,
  onReanalyze,
  onAiLink,
  onRevertAutomatic,
  isMobile,
}) {
  const active =
    receipts.find((receipt) => receipt.id === selectedReceiptId) || receipts[0];
  if (!active) {
    return (
      <div
        style={{
          border: `1px dashed ${C.b1}`,
          borderRadius: 12,
          padding: "54px 20px",
          background: C.panel,
          textAlign: "center",
          color: C.t2,
        }}
      >
        <CircleCheck size={27} style={{ color: C.green }} />
        <div style={{ color: C.t0, fontWeight: 600, marginTop: 10 }}>
          No hay remitos ni facturas esperando revisión
        </div>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Cuando subas un comprobante, sus lineas apareceran aca para
          vincularlas antes de actualizar precios.
        </div>
        <button
          type="button"
          onClick={onUpload}
          style={{ ...primary, marginTop: 16 }}
        >
          <Upload size={14} /> Leer documento
        </button>
      </div>
    );
  }
  const pending = receiptPendingItems(active);
  const matchInfo = pending.map((item) =>
    receiptMatchInfo(item, materials, active.proveedor),
  );
  const matched = matchInfo.filter((item) => item.kind === "matched").length;
  const created = matchInfo.filter((item) => item.kind === "created").length;
  const suggestions = matchInfo.filter(
    (item) => item.kind === "suggestion",
  ).length;
  const needsReview = matchInfo.filter(
    (item) => item.kind === "unlinked" || item.kind === "suggestion",
  ).length;
  const ready = pending.filter(
    (item, index) =>
      item.material_id &&
      asNumber(item.precio_unitario) != null &&
      ["matched", "created"].includes(matchInfo[index]?.kind),
  ).length;
  const total = (active.items || []).reduce(
    (sum, item) => sum + (asNumber(item.total) || 0),
    0,
  );
  const summary = [
    ["Lineas", pending.length, C.t0],
    ["Coincidencias", matched, C.green],
    ["Nuevos", created, created ? C.amber : C.t2],
    ["Sugerencias", suggestions, suggestions ? C.amber : C.t2],
    ["A resolver", needsReview, needsReview ? C.amber : C.t2],
    ["Total", money(total, active.moneda), C.violet],
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile
          ? "1fr"
          : "minmax(230px, .62fr) minmax(0, 1.7fr)",
        gap: 13,
        // En escritorio el detalle toma todo el alto disponible: sólo la lista
        // de líneas desplaza. Antes `alignItems: start` dejaba crecer la card
        // sin límite y la ruedita no tenía dónde hacer scroll.
        alignItems: isMobile ? "start" : "stretch",
        flex: 1,
        minHeight: 0,
        overflow: isMobile ? "auto" : "hidden",
      }}
    >
      <aside
        style={{
          ...surface,
          padding: 10,
          position: isMobile ? "static" : "sticky",
          alignSelf: "start",
          top: 12,
        }}
      >
        <button
          type="button"
          onClick={onUpload}
          style={{ ...primary, width: "100%" }}
        >
          <Upload size={14} /> Leer remito, factura o lista
        </button>
        <button
          type="button"
          onClick={() => onRevertAutomatic(receipts)}
          disabled={applyingId === "revert:auto"}
          title="Quita productos que el importador creó sin confirmación y conserva los comprobantes"
          style={{
            ...button,
            width: "100%",
            justifyContent: "center",
            marginTop: 7,
            color: C.red,
            borderColor: C.redB,
            background: C.redL,
            opacity: applyingId === "revert:auto" ? 0.55 : 1,
          }}
        >
          {applyingId === "revert:auto" ? (
            <Loader2 size={14} className="precios-spin" />
          ) : (
            <Trash2 size={14} />
          )}
          Revertir altas automáticas
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "14px 4px 8px",
          }}
        >
          <ClipboardList size={15} style={{ color: C.violet }} />
          <span style={{ color: C.t0, fontSize: 12.5, fontWeight: 600 }}>
            Por revisar
          </span>
          <span
            style={{
              marginLeft: "auto",
              color: C.violet,
              fontFamily: C.mono,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {receipts.length}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gap: 7,
            maxHeight: isMobile ? 290 : "calc(100vh - 290px)",
            overflowY: "auto",
          }}
        >
          {receipts.map((receipt) => (
            <ReceiptQueueCard
              key={receipt.id}
              receipt={receipt}
              materials={materials}
              selected={receipt.id === active.id}
              onSelect={() => onSelectReceipt(receipt.id)}
            />
          ))}
        </div>
      </aside>

      <section
        style={{
          ...surface,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: isMobile ? 14 : "16px 18px",
            borderBottom: `1px solid ${C.b0}`,
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--violet) 10%, var(--panel-solid)), var(--panel-solid))",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 39,
                  height: 39,
                  flexShrink: 0,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 12,
                  color: C.violet,
                  background: C.violet + "18",
                }}
              >
                <FileText size={19} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.t0, fontSize: 15, fontWeight: 700 }}>
                  {active.proveedor || "Proveedor por definir"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.t2, fontSize: 11, marginTop: 4, flexWrap: "wrap" }}>
                  {active.numero ? `Comprobante ${active.numero} · ` : ""}
                  {dateLabel(active.fecha)}
                  <span style={{ border: `1px solid ${(active.moneda || "ARS") === "USD" ? C.blueB : C.greenB}`, background: (active.moneda || "ARS") === "USD" ? C.blueL : C.greenL, color: (active.moneda || "ARS") === "USD" ? C.blue : C.green, borderRadius: 999, padding: "2px 6px", fontFamily: C.mono, fontSize: 10, fontWeight: 800 }}>{active.moneda || "ARS"}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onApply(active)}
              disabled={!ready || applyingId === active.id}
              style={{
                ...primary,
                opacity: !ready || applyingId === active.id ? 0.6 : 1,
              }}
            >
              {applyingId === active.id ? (
                <Loader2 size={14} className="precios-spin" />
              ) : (
                <Check size={14} />
              )}
              {applyingId === active.id
                ? "Aplicando..."
                : `Aplicar ${ready} precios`}
            </button>
            <button
              type="button"
              onClick={() => onReanalyze(active)}
              disabled={applyingId === `reanalyze:${active.id}`}
              style={{
                ...button,
                color: C.blue,
                borderColor: C.blueB,
                background: C.blueL,
                opacity:
                  applyingId === `reanalyze:${active.id}` ? 0.55 : 1,
              }}
              title="Volver a comparar todas las líneas con el catálogo"
            >
              {applyingId === `reanalyze:${active.id}` ? (
                <Loader2 size={14} className="precios-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              Reanalizar vínculos
            </button>
            <button
              type="button"
              onClick={() => onAiLink(active)}
              disabled={applyingId === `ai-link:${active.id}`}
              style={{
                ...button,
                color: C.violet,
                borderColor: C.violetB,
                background: C.violetL,
                opacity: applyingId === `ai-link:${active.id}` ? 0.55 : 1,
              }}
              title="Vincular las líneas con el catálogo usando IA (entiende abreviaturas: MACHO=M, FUND=bronce…)"
            >
              {applyingId === `ai-link:${active.id}` ? (
                <Loader2 size={14} className="precios-spin" />
              ) : (
                <Wand2 size={14} />
              )}
              Vincular con IA
            </button>
            <button
              type="button"
              onClick={() => onDelete(active)}
              disabled={(active.items || []).some((item) => item.aplicado) || applyingId === `delete:${active.id}`}
              title={(active.items || []).some((item) => item.aplicado) ? "No se puede eliminar: ya aplico precios" : "Eliminar comprobante de prueba"}
              style={{
                ...button,
                color: C.red,
                borderColor: C.redB,
                background: C.redL,
                opacity: (active.items || []).some((item) => item.aplicado) || applyingId === `delete:${active.id}` ? 0.45 : 1,
              }}
            >
              <Trash2 size={14} /> {applyingId === `delete:${active.id}` ? "Eliminando..." : "Eliminar"}
            </button>
            {active.archivo_url && (
              <a
                href={active.archivo_url}
                target="_blank"
                rel="noreferrer"
                style={{ ...button, textDecoration: "none" }}
              >
                <FileText size={14} /> Ver archivo
              </a>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(0,1fr))"
                : "repeat(6, minmax(0,1fr))",
              gap: 7,
              marginTop: 15,
            }}
          >
            {summary.map(([label, value, color]) => (
              <div
                key={label}
                style={{
                  minWidth: 0,
                  padding: "8px 9px",
                  borderRadius: 8,
                  background: C.panel,
                }}
              >
                <div
                  style={{
                    color: C.t3,
                    fontSize: 9.5,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.65,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color,
                    fontFamily: label === "Total" ? C.mono : C.sans,
                    fontSize: label === "Total" ? 12 : 16,
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </header>
        {needsReview > 0 && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "9px 15px",
              color: C.amber,
              background: C.amberL,
              borderBottom: `1px solid ${C.amberB}`,
              fontSize: 11.5,
              fontWeight: 500,
            }}
          >
            <CircleAlert size={15} />
            Hay {needsReview} linea{needsReview === 1 ? "" : "s"} para revisar:
            vinculalas manualmente o confirmá una sugerencia antes de continuar.
          </div>
        )}
        {!isMobile && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(260px,1.35fr) minmax(260px,1fr) auto",
              gap: 12,
              padding: "9px 15px",
              color: C.t3,
              background: C.panel2,
              borderBottom: `1px solid ${C.b0}`,
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: 0.7,
              textTransform: "uppercase",
            }}
          >
            <span>Descripción del comprobante</span>
            <span>Material del catalogo</span>
            <span style={{ textAlign: "right" }}>Precio unitario</span>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {(active.items || []).map((item) => (
            <ReceiptItemReview
              key={item.id}
              item={item}
              receipt={active}
              materials={materials}
              isMobile={isMobile}
              onMatchChanged={onMatchChanged}
              onLineChanged={onLineChanged}
            />
          ))}
          {!active.items?.length && (
            <div style={{ padding: 28, textAlign: "center", color: C.t2, fontSize: 12 }}>
              Este comprobante todavía no tiene líneas.
            </div>
          )}
        </div>
        <footer
          style={{
            padding: "12px 15px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            background: C.panel2,
            borderTop: `1px solid ${C.b0}`,
          }}
        >
          <div style={{ color: C.t2, fontSize: 11 }}>
            Los precios se actualizan solo al confirmar. Las lineas sin vinculo
            quedan pendientes de revision.
          </div>
          <button
            type="button"
            onClick={() => onApply(active)}
            disabled={!ready || applyingId === active.id}
            style={{
              ...primary,
              opacity: !ready || applyingId === active.id ? 0.6 : 1,
            }}
          >
            <Check size={14} /> Confirmar {ready} precios listos
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function PreciosScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const [catalog, setCatalog] = useState(null);
  const [view, setView] = useState("proveedores");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [selectedProviderId, setSelectedProviderId] = useState(null);
  // Al entrar a un proveedor se oculta la bandeja para trabajar enfocado en él.
  const [focusProvider, setFocusProvider] = useState(false);
  // Selección múltiple de la bandeja "Sin proveedor" (asignación masiva).
  const [bulkIds, setBulkIds] = useState(() => new Set());
  const [bulkProviderId, setBulkProviderId] = useState("");
  const [bulkNewProviderName, setBulkNewProviderName] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState("");
  const [selectedReceiptId, setSelectedReceiptId] = useState(null);
  const [receiptImportFile, setReceiptImportFile] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const padding = isMobile ? 13 : 24;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await fetchCatalogo());
      setError("");
    } catch (reason) {
      setError(reason.message || "No se pudo cargar la información.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const materials = useMemo(
    () => (catalog?.materiales || []).filter((item) => item.activo !== false),
    [catalog],
  );
  const providers = useMemo(
    () => (catalog?.proveedores || []).filter((item) => item.activo !== false),
    [catalog],
  );
  const categories = useMemo(() => catalog?.categorias || [], [catalog]);
  const receipts = useMemo(() => catalog?.comprobantes || [], [catalog]);
  const prices = useMemo(() => catalog?.precios || [], [catalog]);
  const pendingReceipts = useMemo(
    () =>
      receipts.filter((item) =>
        (item.items || []).some((row) => !row.aplicado),
      ),
    [receipts],
  );
  useEffect(() => {
    if (!pendingReceipts.length) {
      if (selectedReceiptId) setSelectedReceiptId(null);
      return;
    }
    if (!pendingReceipts.some((item) => item.id === selectedReceiptId)) {
      setSelectedReceiptId(pendingReceipts[0].id);
    }
  }, [pendingReceipts, selectedReceiptId]);

  const providerInfo = useMemo(() => {
    const map = new Map(
      providers.map((provider) => [
        provider.id,
        { provider, total: 0, missing: 0, stale: 0, materialIds: new Set() },
      ]),
    );
    for (const material of materials) {
      const ids = new Set(
        [
          material.proveedor_id,
          ...(material.proveedores_lista || []).map((row) => row.proveedor_id),
        ].filter(Boolean),
      );
      for (const id of ids) {
        if (!map.has(id)) continue;
        const info = map.get(id);
        info.materialIds.add(material.id);
        const price =
          material.proveedor_id === id
            ? material.precio_unitario
            : (material.proveedores_lista || []).find(
                (row) => row.proveedor_id === id,
              )?.precio;
        if (price == null) info.missing += 1;
        if (
          material.proveedor_id === id &&
          price != null &&
          precioDesactualizado(material)
        )
          info.stale += 1;
      }
    }
    return [...map.values()]
      .map((info) => ({ ...info, total: info.materialIds.size }))
      .filter((info) => info.total > 0)
      .sort(
        (a, b) =>
          b.missing + b.stale - (a.missing + a.stale) ||
          a.provider.nombre.localeCompare(b.provider.nombre, "es"),
      );
  }, [materials, providers]);

  const stats = useMemo(
    () => ({
      providerCount: providerInfo.length,
      prices: materials.filter((item) => item.precio_unitario != null).length,
      missingPrice: materials.filter((item) => item.precio_unitario == null)
        .length,
      missingProvider: materials.filter(
        (item) => !item.proveedor_id && !(item.proveedores_lista || []).length,
      ).length,
      stale: materials.filter(
        (item) => item.precio_unitario != null && precioDesactualizado(item),
      ).length,
    }),
    [materials, providerInfo],
  );

  const selectedProvider =
    providers.find((item) => item.id === selectedProviderId) ||
    providerInfo[0]?.provider ||
    null;
  useEffect(() => {
    if (selectedProvider && selectedProvider.id !== selectedProviderId)
      setSelectedProviderId(selectedProvider.id);
  }, [selectedProvider, selectedProviderId]);

  const selectedProviderMaterials = useMemo(() => {
    if (!selectedProvider) return [];
    const term = normalize(query);
    return materials
      .filter((material) => {
        const linked =
          material.proveedor_id === selectedProvider.id ||
          (material.proveedores_lista || []).some(
            (row) => row.proveedor_id === selectedProvider.id,
          );
        if (!linked) return false;
        const price =
          material.proveedor_id === selectedProvider.id
            ? material.precio_unitario
            : (material.proveedores_lista || []).find(
                (row) => row.proveedor_id === selectedProvider.id,
              )?.precio;
        const providerStale =
          material.proveedor_id === selectedProvider.id &&
          price != null &&
          precioDesactualizado(material);
        const matches =
          !term ||
          normalize(
            `${material.descripcion} ${material.codigo || ""}`,
          ).includes(term);
        const status =
          filter === "todos" ||
          (filter === "sin-precio" && price == null) ||
          (filter === "revisar" && providerStale);
        const category =
          !categoryId ||
          material.categoria_id === categoryId ||
          (material.areas || []).includes(categoryId);
        return matches && status && category;
      })
      .sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
  }, [materials, selectedProvider, query, filter, categoryId]);

  const unassigned = useMemo(
    () =>
      materials
        .filter(
          (item) =>
            !item.proveedor_id && !(item.proveedores_lista || []).length,
        )
        .filter(
          (item) =>
            !query ||
            normalize(`${item.descripcion} ${item.codigo || ""}`).includes(
              normalize(query),
            ),
        ),
    [materials, query],
  );
  const selectedMaterial =
    materials.find((item) => item.id === selectedMaterialId) ||
    selectedProviderMaterials[0] ||
    unassigned[0] ||
    null;
  useEffect(() => {
    if (selectedMaterial && selectedMaterial.id !== selectedMaterialId)
      setSelectedMaterialId(selectedMaterial.id);
  }, [selectedMaterial, selectedMaterialId]);
  const history = useMemo(
    () =>
      prices
        .map((row) => ({
          ...row,
          material: materials.find((item) => item.id === row.material_id),
        }))
        .filter((row) => row.material)
        .sort((a, b) =>
          String(b.fecha || b.created_at || "").localeCompare(
            String(a.fecha || a.created_at || ""),
          ),
        )
        .slice(0, 300),
    [prices, materials],
  );

  function queueReceiptUpload(file) {
    if (file) setReceiptImportFile(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadReceipt(file, context = {}) {
    if (!file) return;
    setLoading(true);
    try {
      const data = await leerPresupuestoConIA({
        file,
        proveedor: context.proveedor || "",
        moneda: context.moneda || "",
      });
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length)
        throw new Error("La IA no encontró ítems en el documento.");
      const provider = providers.find(
        (item) => item.id === context.proveedorId || normalize(item.nombre) === normalize(context.proveedor || data?.proveedor),
      );
      const proveedor = context.proveedor || data?.proveedor || null;
      const moneda = context.moneda || data?.moneda || "ARS";
      const receipt = await guardarComprobante(
        {
          proveedor,
          proveedor_id: provider?.id || null,
          numero: data?.numero || null,
          fecha: data?.fecha || new Date().toISOString().slice(0, 10),
          moneda,
          total: data?.total ?? null,
          estado: "borrador",
        },
        file,
      );
      const rows = [];
      let matchedCount = 0;
      let reviewCount = 0;
      for (const item of items) {
        const description = item.descripcion || item.detalle || "";
        const candidate = rankReceiptMatches(
          { ...item, descripcion_original: description, descripcion: description },
          materials,
          proveedor,
        )[0];
        // Sólo una coincidencia fuerte se vincula sola. El resto queda para
        // revisión humana y nunca crea productos sin confirmación.
        const materialId = candidate?.score >= 82 ? candidate.material.id : null;
        if (materialId) matchedCount += 1;
        else reviewCount += 1;
        rows.push({
          comprobante_id: receipt.id,
          material_id: materialId,
          descripcion: description,
          cantidad: item.cantidad ?? null,
          precio_unitario: item.precio_unitario ?? item.precio ?? null,
          total: item.total ?? null,
          aplicado: false,
        });
      }
      await guardarComprobanteItems(receipt.id, rows);
      const percent = Math.round((matchedCount / rows.length) * 100);
      toast.success(`Comprobante leído: ${rows.length} ítems; ${matchedCount}/${rows.length} coincidencias fuertes (${percent}%).${reviewCount ? ` ${reviewCount} quedaron para revisar; no se creó ningún producto.` : ""}`);
      await load();
      setSelectedReceiptId(receipt.id);
      setView("bandeja");
    } catch (reason) {
      toast.error(reason.message || "No se pudo leer el comprobante.");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function applyReceipt(receipt) {
    setApplying(receipt.id);
    try {
      const confirmedItems = (receipt.items || []).filter((item) =>
        ["matched", "created"].includes(
          receiptMatchInfo(item, materials, receipt.proveedor).kind,
        ),
      );
      const result = await aplicarPreciosComprobante(
        receipt,
        confirmedItems,
      );
      toast.success(
        result.pendientes
          ? `${result.actualizados} precios actualizados. Quedaron lineas para revisar.`
          : `${result.actualizados} precios actualizados. Comprobante completado.`,
      );
      await load();
    } catch (reason) {
      toast.error(reason.message || "No se pudieron aplicar los precios.");
    } finally {
      setApplying("");
    }
  }

  async function reanalyzeReceipt(receipt) {
    if (!receipt?.id) return;
    setApplying(`reanalyze:${receipt.id}`);
    try {
      let updated = 0;
      let confirmed = 0;
      let pending = 0;
      for (const item of receiptPendingItems(receipt)) {
        const best = rankReceiptMatches(
          item,
          materials,
          receipt.proveedor,
        )[0];
        if (!best || best.score < 82) {
          pending += 1;
          continue;
        }
        confirmed += 1;
        if (best.material.id === item.material_id) continue;
        await guardarComprobanteItem({
          ...item,
          material_id: best.material.id,
          descripcion: best.material.descripcion,
        });
        updated += 1;
      }
      await load();
      toast.success(
        `Reanálisis listo: ${confirmed} coincidencias fuertes${updated ? `, ${updated} vínculo${updated === 1 ? "" : "s"} corregido${updated === 1 ? "" : "s"}` : ""}${pending ? ` y ${pending} para revisar` : ""}.`,
      );
    } catch (reason) {
      toast.error(reason.message || "No se pudieron reanalizar los vínculos.");
    } finally {
      setApplying("");
    }
  }

  // Vinculación semántica con IA: para cada línea sin vínculo confirmado arma una
  // lista corta de candidatos (ranking lexical) y deja que la IA elija el mismo
  // producto. Alta confianza → match confirmado (verde); media → sugerencia (ámbar
  // para revisar); baja/sin match → queda como nuevo, sin tocar.
  async function aiLinkReceipt(receipt) {
    if (!receipt?.id) return;
    setApplying(`ai-link:${receipt.id}`);
    try {
      const activos = materials.filter((m) => m.activo !== false);
      const materialById = new Map(materials.map((m) => [m.id, m]));
      const pendientes = receiptPendingItems(receipt).filter((item) => {
        const info = receiptMatchInfo(item, materials, receipt.proveedor);
        return info.kind === "unlinked" || info.kind === "suggestion";
      });
      if (!pendientes.length) {
        toast.info("No hay líneas pendientes para vincular.");
        return;
      }

      // ── Capa 1: memoria de vínculos anteriores (gratis, instantánea) ──
      // Solo si el remito tiene proveedor: la memoria es por "proveedor + texto".
      const provKey = normalize(receipt.proveedor || "");
      const memIndex = new Map();
      if (provKey) {
        let memoria = [];
        try {
          memoria = await fetchMemoriaVinculos({ excludeComprobanteId: receipt.id });
        } catch {
          memoria = [];
        }
        // Más reciente gana: ordeno desc y me quedo con el primero de cada clave.
        [...memoria]
          .sort((a, b) =>
            String(b.created_at || "").localeCompare(String(a.created_at || "")),
          )
          .forEach((row) => {
            if (normalize(row.proveedor || "") !== provKey) return;
            if (!materialById.has(row.material_id)) return; // material borrado
            const key = normalize(row.texto || "");
            if (key && !memIndex.has(key)) memIndex.set(key, row.material_id);
          });
      }

      let porMemoria = 0;
      const targets = [];
      for (const item of pendientes) {
        const key = normalize(item.descripcion_original || item.descripcion || "");
        const memMatId = key ? memIndex.get(key) : null;
        const memMat = memMatId ? materialById.get(memMatId) : null;
        if (memMat) {
          // Ya lo vinculaste antes a este material → lo damos por bueno (verde).
          await guardarComprobanteItem({
            ...item,
            material_id: memMat.id,
            descripcion: memMat.descripcion,
          });
          porMemoria += 1;
        } else {
          targets.push(item);
        }
      }

      // ── Capa 2: IA semántica para lo que la memoria no conocía ──
      let altas = 0;
      let medias = 0;
      let nuevos = 0;
      if (!targets.length) {
        await load();
        toast.success(`Memoria: ${porMemoria} vinculada${porMemoria === 1 ? "" : "s"} al instante.`);
        return;
      }

      const items = [];
      const candidatos = {};
      targets.forEach((item, index) => {
        items.push({
          index,
          descripcion: item.descripcion_original || item.descripcion,
          codigo: item.codigo || null,
          cantidad: item.cantidad ?? null,
        });
        candidatos[String(index)] = rankReceiptMatches(
          item,
          activos,
          receipt.proveedor,
        )
          .slice(0, 12)
          .map((row) => ({
            id: row.material.id,
            descripcion: row.material.descripcion,
            codigo: row.material.codigo || null,
          }));
      });

      const matches = await vincularComprobanteConIA({
        items,
        candidatos,
        proveedor: receipt.proveedor,
      });
      const byIndex = new Map(matches.map((m) => [m.index, m]));

      for (let index = 0; index < targets.length; index += 1) {
        const item = targets[index];
        const match = byIndex.get(index);
        const material = match?.material_id
          ? materials.find((m) => m.id === match.material_id)
          : null;
        if (!material) {
          nuevos += 1;
          continue;
        }
        if (match.confianza === "alta") {
          // Confirmado: descripcion = la del material → queda como coincidencia (verde).
          await guardarComprobanteItem({
            ...item,
            material_id: material.id,
            descripcion: material.descripcion,
          });
          altas += 1;
        } else {
          // Sugerencia: vinculado pero conservando la descripción original → ámbar para revisar.
          await guardarComprobanteItem({
            ...item,
            material_id: material.id,
            descripcion: item.descripcion_original || item.descripcion,
          });
          medias += 1;
        }
      }

      await load();
      const partes = [];
      if (porMemoria) partes.push(`${porMemoria} por memoria`);
      partes.push(`${altas} por IA`);
      if (medias) partes.push(`${medias} sugerencia${medias === 1 ? "" : "s"} para revisar`);
      if (nuevos) partes.push(`${nuevos} nueva${nuevos === 1 ? "" : "s"}`);
      toast.success(`Vinculación: ${partes.join(", ")}.`);
    } catch (reason) {
      toast.error(reason.message || "No se pudieron vincular los ítems con IA.");
    } finally {
      setApplying("");
    }
  }

  async function revertAutomaticProducts(receipts) {
    const targets = (receipts || []).filter(
      (receipt) => !(receipt.items || []).some((item) => item.aplicado),
    );
    if (!targets.length) {
      toast.error("No hay comprobantes sin aplicar para limpiar.");
      return;
    }
    if (
      !window.confirm(
        "¿Revertir los productos que el importador creó sin preguntar? Se conservan los comprobantes y nunca se tocan materiales con stock, matrices, pedidos, adicionales o precios.",
      )
    )
      return;

    setApplying("revert:auto");
    try {
      const result =
        await revertirAltasAutomaticasComprobantes(targets);
      const removed = new Set(result.materialIds || []);
      const remainingMaterials = materials.filter(
        (material) => !removed.has(material.id),
      );
      const affectedItems = new Set(result.itemIds || []);
      let relinked = 0;
      for (const receipt of targets) {
        for (const item of receipt.items || []) {
          if (!affectedItems.has(item.id)) continue;
          const best = rankReceiptMatches(
            { ...item, material_id: null },
            remainingMaterials,
            receipt.proveedor,
          )[0];
          if (!best || best.score < 82) continue;
          await guardarComprobanteItem({
            ...item,
            material_id: best.material.id,
            descripcion: best.material.descripcion,
          });
          relinked += 1;
        }
      }
      await load();
      toast.success(
        result.eliminados
          ? `Limpieza terminada: ${result.eliminados} producto${result.eliminados === 1 ? "" : "s"} automático${result.eliminados === 1 ? "" : "s"} eliminado${result.eliminados === 1 ? "" : "s"} y ${relinked} línea${relinked === 1 ? "" : "s"} vinculada${relinked === 1 ? "" : "s"} al catálogo real.${result.omitidos ? ` ${result.omitidos} casos dudosos quedaron intactos.` : ""}`
          : "No encontré altas automáticas que se pudieran borrar con seguridad. No se modificó el catálogo.",
      );
    } catch (reason) {
      toast.error(
        reason.message || "No se pudieron revertir las altas automáticas.",
      );
    } finally {
      setApplying("");
    }
  }

  async function deleteReceipt(receipt) {
    if (!receipt?.id) return;
    if (!window.confirm(`¿Eliminar ${receipt.numero ? `el comprobante ${receipt.numero}` : "este comprobante"}? Esta accion solo borra cargas sin precios aplicados.`)) return;
    setApplying(`delete:${receipt.id}`);
    try {
      await borrarComprobante(receipt);
      toast.success("Comprobante eliminado.");
      if (selectedReceiptId === receipt.id) setSelectedReceiptId(null);
      await load();
    } catch (reason) {
      toast.error(reason.message || "No se pudo eliminar el comprobante.");
    } finally {
      setApplying("");
    }
  }

  async function updateReceiptMatch(item, material) {
    try {
      await guardarComprobanteItem({
        ...item,
        material_id: material?.id || null,
        descripcion:
          material?.descripcion ||
          item.descripcion_original ||
          item.descripcion,
      });
      toast.success(
        material
          ? `Vinculado a ${material.descripcion}.`
          : "Vinculo con catalogo quitado.",
      );
      await load();
    } catch (reason) {
      toast.error(reason.message || "No se pudo actualizar el vinculo.");
      throw reason;
    }
  }

  async function updateReceiptLine(item, patch) {
    try {
      await guardarComprobanteItem({
        ...item,
        ...patch,
        descripcion: item.descripcion_original || item.descripcion,
      });
      toast.success("Línea del comprobante actualizada.");
      await load();
    } catch (reason) {
      toast.error(reason.message || "No se pudo actualizar la linea.");
      throw reason;
    }
  }

  const currentRows =
    view === "sin-asignar" ? unassigned : selectedProviderMaterials;
  // La bandeja de proveedores se esconde al enfocar uno (y en la vista sin-asignar
  // no aplica). Así el material y su detalle ganan todo el ancho.
  const mostrarBandeja =
    view === "proveedores" && !(focusProvider && selectedProvider);

  // ── Asignación masiva de proveedor (vista "Sin proveedor") ──
  const modoMasivo = view === "sin-asignar" || (view === "proveedores" && !!selectedProvider);
  const toggleBulk = (id) =>
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const seleccionarVisibles = () =>
    setBulkIds(new Set(currentRows.map((m) => m.id)));
  const limpiarSeleccion = () => setBulkIds(new Set());

  async function aplicarProveedorMasivo() {
    let proveedor = providers.find((p) => p.id === bulkProviderId);
    if (bulkProviderId === "__nuevo") {
      const nombre = bulkNewProviderName.trim();
      if (!nombre) {
        toast.error("Escribi el nombre del proveedor nuevo.");
        return;
      }
      proveedor = providers.find((p) => normalize(p.nombre) === normalize(nombre));
      if (!proveedor) {
        try {
          const id = await guardarProveedor({ nombre, activo: true });
          proveedor = { id, nombre };
        } catch (error) {
          toast.error(error.message || "No se pudo crear el proveedor.");
          return;
        }
      }
    }
    if (!proveedor) {
      toast.error("Elegí el proveedor que querés asignar.");
      return;
    }
    if (!bulkIds.size) {
      toast.error("No hay materiales seleccionados.");
      return;
    }
    setBulkSaving(true);
    try {
      const seleccionados = currentRows.filter((material) => bulkIds.has(material.id));
      const n = view === "sin-asignar"
        ? await asignarProveedorPrincipalMasivo([...bulkIds], proveedor)
        : await asociarProveedorAlternativoMasivo(seleccionados, proveedor);
      toast.success(
        view === "sin-asignar"
          ? `${n} material${n === 1 ? "" : "es"} asignado${n === 1 ? "" : "s"} a ${proveedor.nombre}.`
          : `${n} material${n === 1 ? "" : "es"} ahora tambien puede${n === 1 ? "" : "n"} comprarse a ${proveedor.nombre}.`,
      );
      limpiarSeleccion();
      setBulkProviderId("");
      setBulkNewProviderName("");
      await load();
    } catch (e) {
      toast.error(e.message || "No se pudo asignar el proveedor.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        overflow: "hidden",
        background: C.bg,
        color: C.t0,
        fontFamily: C.sans,
      }}
    >
      <div
        style={{ width: isMobile ? 0 : 280, height: "100vh", flexShrink: 0 }}
      >
        <Sidebar profile={profile} signOut={signOut} />
      </div>
      <main
        style={{
          minWidth: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: `${isMobile ? 15 : 21}px ${padding}px 0`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 15,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 230, flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  gap: 7,
                  alignItems: "center",
                  color: C.blue,
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 1.1,
                }}
              >
                <Users size={14} /> Administración de precios
              </div>
              <h1
                style={{
                  margin: "7px 0 0",
                  fontSize: isMobile ? 22 : 27,
                  letterSpacing: -0.6,
                  lineHeight: 1.1,
                  fontWeight: 600,
                }}
              >
                Precios por proveedor
              </h1>
              <p
                style={{
                  margin: "7px 0 0",
                  maxWidth: 720,
                  color: C.t2,
                  fontSize: 12.5,
                }}
              >
                La mesa de trabajo está organizada como llega un remito:
                primero proveedor, después los materiales, variantes y sus
                cotizaciones.
              </p>
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => queueReceiptUpload(e.target.files?.[0])}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={load}
                disabled={loading}
                style={{ ...button, opacity: loading ? 0.6 : 1 }}
              >
                <RefreshCw
                  size={14}
                  className={loading ? "precios-spin" : ""}
                />{" "}
                Actualizar
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                style={{ ...primary, opacity: loading ? 0.65 : 1 }}
              >
                <Upload size={14} /> Cargar remito o factura
              </button>
            </div>
          </div>
          <div
            style={{
              ...surface,
              display: "flex",
              overflowX: "auto",
              marginTop: 17,
            }}
          >
            <Metric
              icon={Users}
              label="Proveedores"
              value={stats.providerCount}
              hint="con materiales asociados"
              color={C.violet}
              onClick={() => setView("proveedores")}
            />
            <Metric
              icon={Check}
              label="Precios cargados"
              value={stats.prices}
              hint="precio vigente base"
              color={C.green}
            />
            <Metric
              icon={AlertTriangle}
              label="Sin precio"
              value={stats.missingPrice}
              hint="para cotizar"
              color={stats.missingPrice ? C.amber : C.green}
              onClick={() => {
                setView("proveedores");
                setFilter("sin-precio");
              }}
            />
            <Metric
              icon={PackagePlus}
              label="Sin proveedor"
              value={stats.missingProvider}
              hint="requieren asignación"
              color={stats.missingProvider ? C.red : C.green}
              onClick={() => setView("sin-asignar")}
            />
            <Metric
              icon={History}
              label="Por revisar"
              value={stats.stale}
              hint="más de seis meses"
              color={stats.stale ? C.orange : C.green}
              onClick={() => {
                setView("proveedores");
                setFilter("revisar");
              }}
            />
          </div>
        </header>
        <nav
          style={{
            display: "flex",
            gap: 3,
            padding: `10px ${padding}px 0`,
            borderBottom: `1px solid ${C.b0}`,
            flexShrink: 0,
            overflowX: "auto",
          }}
        >
          {[
            { id: "proveedores", label: "Por proveedor" },
            {
              id: "sin-asignar",
              label: "Sin proveedor",
              count: stats.missingProvider,
            },
            {
              id: "bandeja",
              label: "Remitos y facturas",
              count: pendingReceipts.length,
            },
            { id: "administrar-proveedores", label: "Proveedores", count: providers.length },
            { id: "historial", label: "Historial" },
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                setView(item.id);
                setFocusProvider(false); // al cambiar de pestaña se sale del foco
                setBulkIds(new Set()); // y se descarta la selección masiva
                setBulkProviderId("");
                setBulkNewProviderName("");
              }}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "10px 11px",
                borderBottom: `2px solid ${view === item.id ? C.blue : "transparent"}`,
                color: view === item.id ? C.t0 : C.t2,
                fontFamily: C.sans,
                fontWeight: 600,
                fontSize: 12.5,
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
              {item.count != null && (
                <span
                  style={{
                    color: item.id === "sin-asignar" ? C.red : C.violet,
                    fontFamily: C.mono,
                    marginLeft: 6,
                    fontSize: 11,
                  }}
                >
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>
        {/* Un solo nivel de scroll: esta sección NO scrollea. El buscador queda
            fijo arriba y cada columna scrollea por dentro. Antes scrolleaban las
            dos cosas a la vez y el buscador terminaba flotando sobre las listas. */}
        <section
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            padding: `16px ${padding}px 16px`,
          }}
        >
          {error && (
            <div
              style={{
                color: C.red,
                background: C.redL,
                border: `1px solid ${C.redB}`,
                padding: 11,
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}
          {view === "proveedores" || view === "sin-asignar" ? (
            <>
              {/* Barra de filtros: fija arriba por layout (flexShrink), ya no
                  necesita position:sticky ni sombra para despegarse del contenido. */}
              <div
                style={{
                  ...surface,
                  flexShrink: 0,
                  padding: 10,
                  marginBottom: 13,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 7,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 220, flex: 1, position: "relative" }}>
                    <Search
                      size={15}
                      style={{
                        color: C.t2,
                        position: "absolute",
                        left: 10,
                        top: 10,
                      }}
                    />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={
                        view === "sin-asignar"
                          ? "Buscar material sin proveedor..."
                          : "Buscar dentro del proveedor..."
                      }
                      style={{ ...input, paddingLeft: 33 }}
                    />
                  </div>
                  {view === "proveedores" &&
                    [
                      { id: "todos", label: "Todos" },
                      { id: "sin-precio", label: "Sin precio" },
                      { id: "revisar", label: "A revisar" },
                    ].map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setFilter(item.id)}
                        style={{
                          ...button,
                          padding: "8px 10px",
                          color: filter === item.id ? C.blue : C.t2,
                          background: filter === item.id ? C.blueL : C.panel,
                          borderColor: filter === item.id ? C.blueB : C.b0,
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => setShowFilters((value) => !value)}
                    style={{
                      ...button,
                      background: showFilters ? C.panel2 : C.panel,
                    }}
                  >
                    <Filter size={14} /> Filtros
                  </button>
                </div>
                {showFilters && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0,1fr)",
                      gap: 7,
                      borderTop: `1px solid ${C.b0}`,
                      marginTop: 9,
                      paddingTop: 9,
                    }}
                  >
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      style={input}
                    >
                      <option value="">Todas las categorías</option>
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {/* La grilla toma el alto restante; cada columna scrollea por dentro.
                  En mobile vuelve a una columna y scrollea la sección entera. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : mostrarBandeja
                      ? "minmax(250px,.65fr) minmax(330px,1fr) minmax(360px,.95fr)"
                      : "minmax(360px,1fr) minmax(400px,.95fr)",
                  gap: 13,
                  flex: 1,
                  minHeight: 0,
                  alignItems: "stretch",
                  overflowY: isMobile ? "auto" : "hidden",
                }}
              >
                {mostrarBandeja && (
                  <div
                    style={{
                      ...surface,
                      padding: 0,
                      minHeight: 0,
                      overflowY: "auto",
                    }}
                  >
                    <div
                      style={{
                        color: C.t0,
                        fontSize: 12.5,
                        fontWeight: 600,
                        padding: "12px 13px",
                        borderBottom: `1px solid ${C.b0}`,
                        position: "sticky",
                        top: 0,
                        background: C.panelSolid,
                        zIndex: 1,
                      }}
                    >
                      Bandeja por proveedor{" "}
                      <span
                        style={{
                          color: C.t3,
                          fontFamily: C.mono,
                          fontSize: 10.5,
                        }}
                      >
                        {providerInfo.length}
                      </span>
                    </div>
                    <div>
                      {providerInfo.map((info) => (
                        <ProviderCard
                          key={info.provider.id}
                          provider={info.provider}
                          info={info}
                          providers={providers}
                          selected={info.provider.id === selectedProvider?.id}
                          onClick={() => {
                            setSelectedProviderId(info.provider.id);
                            setFocusProvider(true);
                            setSelectedMaterialId(null);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div
                  style={{
                    ...surface,
                    padding: 0,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "12px 13px",
                      borderBottom: `1px solid ${C.b0}`,
                      flexShrink: 0,
                    }}
                  >
                    {/* Volver a la bandeja cuando estamos enfocados en un proveedor. */}
                    {!mostrarBandeja && view === "proveedores" && (
                      <button
                        type="button"
                        onClick={() => setFocusProvider(false)}
                        title="Ver todos los proveedores"
                        style={{
                          ...button,
                          padding: "6px 10px",
                          flexShrink: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Users size={14} /> Proveedores
                      </button>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {view === "sin-asignar"
                          ? "Materiales sin proveedor"
                          : selectedProvider?.nombre || "Proveedor"}
                      </div>
                      <div
                        style={{ color: C.t2, fontSize: 10.5, marginTop: 3 }}
                      >
                        {currentRows.length} materiales para trabajar
                        {modoMasivo && bulkIds.size > 0
                          ? ` · ${bulkIds.size} seleccionado${bulkIds.size === 1 ? "" : "s"}`
                          : ""}
                      </div>
                    </div>
                    {modoMasivo && currentRows.length > 0 && (
                      <button
                        type="button"
                        onClick={
                          bulkIds.size ? limpiarSeleccion : seleccionarVisibles
                        }
                        style={{ ...button, padding: "6px 10px", flexShrink: 0 }}
                      >
                        {bulkIds.size ? "Limpiar" : "Seleccionar todo"}
                      </button>
                    )}
                    {view === "proveedores" && selectedProvider && (
                      <ProveedorTipoBadge
                        meta={proveedorMeta(selectedProvider.nombre, providers)}
                        compact
                      />
                    )}
                  </div>

                  {/* Barra de asignación masiva: aparece al seleccionar. */}
                  {modoMasivo && bulkIds.size > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 13px",
                        borderBottom: `1px solid ${C.b0}`,
                        background: C.blueL,
                        flexShrink: 0,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: C.blue,
                          fontFamily: C.mono,
                        }}
                      >
                        {bulkIds.size}
                      </span>
                      <span style={{ fontSize: 12, color: C.t1 }}>
                        {view === "sin-asignar" ? "asignar como principal a" : "agregar como proveedor"}
                      </span>
                      <select
                        value={bulkProviderId}
                        onChange={(e) => setBulkProviderId(e.target.value)}
                        style={{ ...input, flex: 1, minWidth: 150 }}
                      >
                        <option value="">Elegí proveedor…</option>
                        <option value="__nuevo">+ Crear proveedor nuevo...</option>
                        {providers
                          .filter((p) => p.activo !== false)
                          .filter((p) => view === "sin-asignar" || p.id !== selectedProvider?.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                      </select>
                      {bulkProviderId === "__nuevo" && (
                        <input
                          value={bulkNewProviderName}
                          onChange={(e) => setBulkNewProviderName(e.target.value)}
                          placeholder="Nombre del proveedor nuevo"
                          style={{ ...input, flex: 1, minWidth: 180 }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={aplicarProveedorMasivo}
                        disabled={bulkSaving || !bulkProviderId || (bulkProviderId === "__nuevo" && !bulkNewProviderName.trim())}
                        style={{
                          ...primary,
                          padding: "7px 13px",
                          opacity: bulkSaving || !bulkProviderId || (bulkProviderId === "__nuevo" && !bulkNewProviderName.trim()) ? 0.55 : 1,
                        }}
                      >
                        {bulkSaving ? (
                          <Loader2 size={14} className="precios-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        {bulkSaving ? "Asignando…" : "Asignar"}
                      </button>
                    </div>
                  )}
                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                    {currentRows.map((material) => (
                      <MaterialItem
                        key={material.id}
                        material={material}
                        provider={
                          view === "sin-asignar" ? null : selectedProvider
                        }
                        providers={providers}
                        selected={material.id === selectedMaterial?.id}
                        onClick={() => setSelectedMaterialId(material.id)}
                        selectable={modoMasivo}
                        checked={bulkIds.has(material.id)}
                        onToggleCheck={() => toggleBulk(material.id)}
                      />
                    ))}
                    {!currentRows.length && (
                      <div
                        style={{
                          padding: 30,
                          color: C.t2,
                          fontSize: 12,
                          textAlign: "center",
                        }}
                      >
                        No hay materiales para estos filtros.
                      </div>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    ...surface,
                    minHeight: 0,
                    overflowY: "auto",
                  }}
                >
                  <Detail
                    material={selectedMaterial}
                    provider={view === "sin-asignar" ? null : selectedProvider}
                    providers={providers}
                    categories={categories}
                    toast={toast}
                    onSaved={load}
                  />
                </div>
              </div>
            </>
          ) : null}
          {view === "bandeja" && (
            <ReceiptReviewWorkspace
              receipts={pendingReceipts}
              materials={materials}
              selectedReceiptId={selectedReceiptId}
              onSelectReceipt={setSelectedReceiptId}
              applyingId={applying}
              onApply={applyReceipt}
              onMatchChanged={updateReceiptMatch}
              onLineChanged={updateReceiptLine}
              onUpload={() => fileRef.current?.click()}
              onDelete={deleteReceipt}
              onReanalyze={reanalyzeReceipt}
              onAiLink={aiLinkReceipt}
              onRevertAutomatic={revertAutomaticProducts}
              isMobile={isMobile}
            />
          )}
          {view === "administrar-proveedores" && (
            <div style={{ ...surface, flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : 18 }}>
              <ProveedoresTab proveedores={providers} onChanged={load} />
            </div>
          )}
          {view === "historial" && (
            <div style={{ maxWidth: 1080 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <History size={16} style={{ color: C.blue }} />
                <span style={{ color: C.t0, fontSize: 13, fontWeight: 600 }}>
                  Historial de precios
                </span>
                <span style={{ color: C.t3, fontFamily: C.mono, fontSize: 11 }}>
                  {history.length}
                </span>
              </div>
              <div
                style={{
                  ...surface,
                  overflow: "hidden",
                }}
              >
                {history.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "1fr auto"
                        : "minmax(0,1fr) 190px 120px 110px",
                      gap: 11,
                      padding: "11px 14px",
                      alignItems: "center",
                      borderBottom: `1px solid ${C.b0}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: C.t0,
                          fontSize: 12,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.material.descripcion}
                      </div>
                      <div
                        style={{ color: C.t3, fontSize: 10.5, marginTop: 3 }}
                      >
                        {dateLabel(row.fecha || row.created_at)} ·{" "}
                        {row.fuente || "Carga manual"}
                      </div>
                    </div>
                    <div
                      style={{
                        color: C.t2,
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.proveedor || "Sin proveedor"}
                    </div>
                    <div
                      style={{
                        color: C.t0,
                        fontFamily: C.mono,
                        fontSize: 11.5,
                        fontWeight: 600,
                      }}
                    >
                      {money(row.precio_unitario, row.moneda)}
                    </div>
                    <div style={{ color: C.t3, fontSize: 10.5 }}>
                      {ageLabel(row.fecha || row.created_at)}
                    </div>
                  </div>
                ))}
                {!history.length && (
                  <div
                    style={{
                      padding: 40,
                      color: C.t2,
                      textAlign: "center",
                      fontSize: 12,
                    }}
                  >
                    Todavía no hay precios registrados.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
      {receiptImportFile && (
        <ReceiptImportContextModal
          file={receiptImportFile}
          providers={providers}
          isMobile={isMobile}
          onClose={() => setReceiptImportFile(null)}
          onConfirm={(context) => {
            const file = receiptImportFile;
            setReceiptImportFile(null);
            uploadReceipt(file, context);
          }}
        />
      )}
      <style>{`@keyframes precios-spin{to{transform:rotate(360deg)}}.precios-spin{animation:precios-spin 1s linear infinite}`}</style>
    </div>
  );
}
