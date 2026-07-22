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
  Upload,
  Users,
  Unlink,
  X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import {
  aplicarPreciosComprobante,
  asociarProveedorMaterial,
  fetchCatalogo,
  guardarComprobante,
  guardarComprobanteItem,
  guardarComprobanteItems,
  guardarPrecioVarianteMaterial,
  guardarProveedor,
  leerPresupuestoConIA,
  precioDesactualizado,
  registrarOfertaMaterial,
} from "@/features/materiales/api";
import ProveedorTipoBadge from "@/features/materiales/ProveedorTipoBadge";
import { proveedorMeta } from "@/features/materiales/proveedorMeta";

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
        border: `1px solid ${selected ? C.blueB : hover ? C.b1 : C.b0}`,
        borderRadius: 12,
        padding: "12px",
        background: selected ? C.blueL : hover ? C.panel2 : C.panel,
        transition: "all .16s ease",
        transform: hover && !selected ? "translateY(-1px)" : "none",
        boxShadow: selected
          ? "0 6px 20px color-mix(in srgb, var(--blue) 13%, transparent)"
          : "none",
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

function MaterialItem({ material, provider, selected, onClick }) {
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
        border: `1px solid ${selected ? C.blueB : hover ? C.b1 : C.b0}`,
        borderRadius: 12,
        padding: "10px 11px",
        background: selected ? C.blueL : hover ? C.panel2 : C.panel,
        transition: "all .16s ease",
      }}
    >
      <div
        style={{
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
        await asociarProveedorMaterial(material, supplier);
        toast.success(
          `${supplier.nombre} quedó asociado a ${material.descripcion}.`,
        );
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
          await registrarOfertaMaterial(material, supplier, {
            precio: numeric,
            moneda: currency,
          });
          toast.success(`Cotización guardada con ${supplier.nombre}.`);
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

function ReceiptQueueCard({ receipt, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const pending = receiptPendingItems(receipt);
  const linked = pending.filter((item) => item.material_id).length;
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
        border: `1px solid ${selected ? C.violet : hover ? C.b1 : C.b0}`,
        background: selected ? C.violet + "14" : hover ? C.panel2 : C.panel,
        borderRadius: 12,
        padding: "11px 12px",
        transition: "all .16s ease",
        boxShadow: selected
          ? "0 7px 18px color-mix(in srgb, var(--violet) 12%, transparent)"
          : "none",
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
        <Pill kind={linked === pending.length ? "ok" : "warn"}>
          {linked}/{pending.length} vinculados
        </Pill>
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
  useEffect(() => {
    setQuantity(item.cantidad ?? "");
    setPrice(item.precio_unitario ?? "");
  }, [item.id, item.cantidad, item.precio_unitario]);
  const suggestions = useMemo(() => {
    const words = normalize(query || source)
      .split(" ")
      .filter((word) => word.length > 1);
    if (!words.length) return [];
    return materials
      .map((material) => {
        const text = normalize(
          `${material.descripcion} ${material.codigo || ""}`,
        );
        return {
          material,
          score:
            words.filter((word) => text.includes(word)).length / words.length,
        };
      })
      .filter((row) => row.score >= 0.45)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.material.descripcion.localeCompare(b.material.descripcion, "es"),
      )
      .slice(0, 6);
  }, [materials, query, source]);

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
              border: `1px solid ${C.greenB}`,
              background: C.greenL,
              borderRadius: 8,
              padding: "8px 9px",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <CircleCheck size={14} style={{ color: C.green, flexShrink: 0 }} />
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
              <div style={{ color: C.t2, fontSize: 10, marginTop: 2 }}>
                Catalogo completo
              </div>
            </div>
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
                {suggestions.map(({ material }) => (
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
                      {material.codigo || "Sin codigo"}
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
  const ready = pending.filter(
    (item) => item.material_id && asNumber(item.precio_unitario) != null,
  ).length;
  const needsReview = pending.length - ready;
  const total = (active.items || []).reduce(
    (sum, item) => sum + (asNumber(item.total) || 0),
    0,
  );
  const summary = [
    ["Lineas", pending.length, C.t0],
    ["Listas", ready, C.green],
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
        alignItems: "start",
      }}
    >
      <aside
        style={{
          border: `1px solid ${C.b0}`,
          borderRadius: 12,
          padding: 10,
          background: C.panel,
          position: isMobile ? "static" : "sticky",
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
              selected={receipt.id === active.id}
              onSelect={() => onSelectReceipt(receipt.id)}
            />
          ))}
        </div>
      </aside>

      <section
        style={{
          minWidth: 0,
          border: `1px solid ${C.b0}`,
          borderRadius: 12,
          background: C.panel,
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
                <div style={{ color: C.t2, fontSize: 11, marginTop: 4 }}>
                  {active.numero ? `Comprobante ${active.numero} · ` : ""}
                  {dateLabel(active.fecha)} - {active.moneda || "ARS"}
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
              gridTemplateColumns: "repeat(4, minmax(0,1fr))",
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
            Hay {needsReview} linea{needsReview === 1 ? "" : "s"} sin un vinculo
            o precio valido. No se aplicaran hasta completarlas.
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
        <div>
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
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState("");
  const [selectedReceiptId, setSelectedReceiptId] = useState(null);
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

  async function uploadReceipt(file) {
    if (!file) return;
    setLoading(true);
    try {
      const data = await leerPresupuestoConIA({ file });
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length)
        throw new Error("La IA no encontró ítems en el documento.");
      const provider = providers.find(
        (item) => normalize(item.nombre) === normalize(data?.proveedor),
      );
      const receipt = await guardarComprobante(
        {
          proveedor: data?.proveedor || null,
          proveedor_id: provider?.id || null,
          numero: data?.numero || null,
          fecha: data?.fecha || new Date().toISOString().slice(0, 10),
          moneda: data?.moneda || "ARS",
          total: data?.total ?? null,
          estado: "borrador",
        },
        file,
      );
      const rows = items.map((item) => {
        const description = item.descripcion || item.detalle || "";
        const candidate = materials
          .map((material) => ({
            material,
            score:
              normalize(material.descripcion) === normalize(description)
                ? 100
                : normalize(material.descripcion).includes(
                      normalize(description),
                    ) ||
                    normalize(description).includes(
                      normalize(material.descripcion),
                    )
                  ? 60
                  : 0,
          }))
          .sort((a, b) => b.score - a.score)[0];
        return {
          comprobante_id: receipt.id,
          material_id: candidate?.score >= 60 ? candidate.material.id : null,
          descripcion: description,
          cantidad: item.cantidad ?? null,
          precio_unitario: item.precio_unitario ?? item.precio ?? null,
          total: item.total ?? null,
          aplicado: false,
        };
      });
      await guardarComprobanteItems(receipt.id, rows);
      toast.success(`Comprobante leído: ${rows.length} ítems para revisar.`);
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
      const result = await aplicarPreciosComprobante(
        receipt,
        receipt.items || [],
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

  async function updateReceiptMatch(item, material) {
    try {
      await guardarComprobanteItem({
        ...item,
        material_id: material?.id || null,
        descripcion: item.descripcion_original || item.descripcion,
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
                onChange={(e) => uploadReceipt(e.target.files?.[0])}
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
              display: "flex",
              overflowX: "auto",
              marginTop: 17,
              border: `1px solid ${C.b0}`,
              background:
                "color-mix(in srgb, var(--panel-solid) 90%, transparent)",
              borderRadius: 12,
              backdropFilter: "blur(10px)",
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
            { id: "historial", label: "Historial" },
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setView(item.id)}
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
        <section
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: `16px ${padding}px 34px`,
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
              <div
                style={{
                  position: "sticky",
                  zIndex: 5,
                  top: 0,
                  border: `1px solid ${C.b0}`,
                  background:
                    "color-mix(in srgb, var(--panel-solid) 93%, transparent)",
                  backdropFilter: "blur(12px)",
                  padding: 10,
                  borderRadius: 12,
                  marginBottom: 13,
                  boxShadow:
                    "0 8px 22px color-mix(in srgb, var(--text) 5%, transparent)",
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "minmax(250px,.65fr) minmax(330px,1fr) minmax(360px,.95fr)",
                  gap: 13,
                  alignItems: "start",
                }}
              >
                {view === "proveedores" && (
                  <div
                    style={{
                      border: `1px solid ${C.b0}`,
                      borderRadius: 12,
                      background: C.panel,
                      padding: 10,
                      maxHeight: "calc(100vh - 285px)",
                      overflowY: "auto",
                    }}
                  >
                    <div
                      style={{
                        color: C.t0,
                        fontSize: 12.5,
                        fontWeight: 600,
                        padding: "3px 3px 10px",
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
                    <div style={{ display: "grid", gap: 7 }}>
                      {providerInfo.map((info) => (
                        <ProviderCard
                          key={info.provider.id}
                          provider={info.provider}
                          info={info}
                          providers={providers}
                          selected={info.provider.id === selectedProvider?.id}
                          onClick={() => {
                            setSelectedProviderId(info.provider.id);
                            setSelectedMaterialId(null);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div
                  style={{
                    border: `1px solid ${C.b0}`,
                    borderRadius: 12,
                    background: C.panel,
                    padding: 10,
                    minHeight: 400,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "3px 3px 10px",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {view === "sin-asignar"
                          ? "Materiales sin proveedor"
                          : selectedProvider?.nombre || "Proveedor"}
                      </div>
                      <div
                        style={{ color: C.t2, fontSize: 10.5, marginTop: 3 }}
                      >
                        {currentRows.length} materiales para trabajar
                      </div>
                    </div>
                    {view === "proveedores" && selectedProvider && (
                      <ProveedorTipoBadge
                        meta={proveedorMeta(selectedProvider.nombre, providers)}
                        compact
                      />
                    )}
                  </div>
                  <div style={{ display: "grid", gap: 7 }}>
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
                    border: `1px solid ${C.b0}`,
                    borderRadius: 12,
                    background: C.panel,
                    minHeight: 480,
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
              isMobile={isMobile}
            />
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
                  border: `1px solid ${C.b0}`,
                  borderRadius: 12,
                  background: C.panel,
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
      <style>{`@keyframes precios-spin{to{transform:rotate(360deg)}}.precios-spin{animation:precios-spin 1s linear infinite}`}</style>
    </div>
  );
}
