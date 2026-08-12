import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, PackageCheck, RefreshCw } from "lucide-react";
import { C } from "@/theme";
import { INP } from "@/features/rrhh/ui";
import { norm } from "./materialesParser";
import { fetchEstadoMigracionProductos, fetchRequisitoProductos } from "./productosAsignadosApi";

function legacyVariants(value) {
  const raw = Array.isArray(value) ? value : [];
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

export default function VariantesMarcasTab({ materiales = [] }) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("todos");
  const [links, setLinks] = useState([]);
  const [status, setStatus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const materialById = useMemo(
    () => new Map((materiales || []).map((material) => [material.id, material])),
    [materiales],
  );
  const requirementIds = useMemo(
    () => (materiales || [])
      .filter((material) => material.activo !== false)
      .filter((material) => material.es_requisito === true || legacyVariants(material.variantes).length > 0)
      .map((material) => material.id),
    [materiales],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextLinks, nextStatus] = await Promise.all([
        fetchRequisitoProductos(requirementIds),
        fetchEstadoMigracionProductos(),
      ]);
      setLinks(nextLinks);
      setStatus(nextStatus);
    } catch (nextError) {
      setError(nextError?.message || "No se pudo leer el estado de la migración.");
    } finally {
      setLoading(false);
    }
  }, [requirementIds]);

  useEffect(() => { reload(); }, [reload]);

  const linksByRequirement = useMemo(() => {
    const map = new Map();
    links.forEach((link) => {
      const list = map.get(link.requisito_material_id) || [];
      list.push(link);
      map.set(link.requisito_material_id, list);
    });
    return map;
  }, [links]);
  const statusByRequirement = useMemo(
    () => new Map(status.map((row) => [row.requisito_material_id, row])),
    [status],
  );

  const rows = useMemo(() => {
    const term = norm(q);
    return requirementIds
      .map((id) => {
        const requirement = materialById.get(id);
        const compatibleLinks = linksByRequirement.get(id) || [];
        const products = compatibleLinks
          .map((link) => ({ link, product: materialById.get(link.producto_material_id) || null }))
          .filter((row) => row.product);
        const migration = statusByRequirement.get(id) || {};
        const pending = Number(migration.obras_pendientes || 0);
        return {
          requirement,
          products,
          migration,
          pending,
          legacy: legacyVariants(requirement?.variantes),
        };
      })
      .filter((row) => row.requirement)
      .filter((row) => {
        if (mode === "pendientes") return row.pending > 0;
        if (mode === "resueltos") return Number(row.migration.obras_total || 0) > 0 && row.pending === 0;
        if (mode === "sin_productos") return row.products.length === 0;
        return true;
      })
      .filter((row) => {
        if (!term) return true;
        return norm([
          row.requirement.descripcion,
          row.requirement.codigo,
          row.legacy.join(" "),
          row.products.map(({ product }) => `${product.descripcion} ${product.codigo || ""} ${product.proveedor || ""}`).join(" "),
        ].join(" ")).includes(term);
      })
      .sort((a, b) => b.pending - a.pending || a.requirement.descripcion.localeCompare(b.requirement.descripcion, "es", { numeric: true }));
  }, [requirementIds, materialById, linksByRequirement, statusByRequirement, mode, q]);

  const stats = useMemo(() => ({
    requirements: requirementIds.length,
    products: new Set(links.map((link) => link.producto_material_id)).size,
    resolved: status.reduce((sum, row) => sum + Number(row.obras_resueltas || 0), 0),
    pending: status.reduce((sum, row) => sum + Number(row.obras_pendientes || 0), 0),
  }), [links, requirementIds.length, status]);

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 1180 }}>
      <section style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 16, padding: 16, display: "grid", gap: 13 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 950, color: C.t0 }}>Requisitos y productos</div>
            <div style={{ color: C.t2, fontSize: 12.5, marginTop: 4, maxWidth: 650, lineHeight: 1.45 }}>
              La matriz define qué necesita el barco. Cada obra elige un producto real del catálogo; compras y Pañol trabajan siempre con ese producto.
            </div>
          </div>
          <button type="button" onClick={reload} disabled={loading} style={{ border: `1px solid ${C.b0}`, background: C.bg, color: C.t1, borderRadius: 9, padding: "8px 11px", fontFamily: C.sans, fontWeight: 850, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
            <RefreshCw size={14} /> {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8 }}>
          <Stat icon={Link2} label="Requisitos" value={stats.requirements} color={C.blue} />
          <Stat icon={PackageCheck} label="Productos vinculados" value={stats.products} color={C.violet} />
          <Stat icon={CheckCircle2} label="Obras resueltas" value={stats.resolved} color={C.green} />
          <Stat icon={AlertTriangle} label="Obras pendientes" value={stats.pending} color={stats.pending ? C.amber : C.green} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar requisito, producto, código, proveedor o marca anterior…" style={{ ...INP, flex: "1 1 320px" }} />
          <select value={mode} onChange={(event) => setMode(event.target.value)} style={{ ...INP, width: 205 }}>
            <option value="todos">Todos los requisitos</option>
            <option value="pendientes">Con obras pendientes</option>
            <option value="resueltos">Obras resueltas</option>
            <option value="sin_productos">Sin productos vinculados</option>
          </select>
        </div>
        {error && (
          <div style={{ border: `1px solid ${C.redB}`, background: "rgba(239,68,68,.08)", color: C.red, borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 800 }}>
            {error}
          </div>
        )}
      </section>

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map(({ requirement, products, migration, pending, legacy }) => {
          const total = Number(migration.obras_total || 0);
          const resolved = Number(migration.obras_resueltas || 0);
          return (
            <section key={requirement.id} style={{ border: `1px solid ${pending ? C.amberB : C.b0}`, background: C.s0, borderRadius: 13, padding: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ color: C.t0, fontSize: 13.5, fontWeight: 950 }}>{requirement.descripcion}</span>
                    <span style={{ color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}`, borderRadius: 999, padding: "2px 7px", fontSize: 9.5, fontWeight: 900 }}>REQUISITO</span>
                  </div>
                  <div style={{ color: C.t3, fontSize: 10.8, marginTop: 3 }}>{[requirement.codigo, requirement.proveedor].filter(Boolean).join(" · ") || "sin código"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={{ color: C.green, background: C.greenL, border: `1px solid ${C.greenB}`, borderRadius: 999, padding: "3px 8px", fontSize: 10.5, fontWeight: 900 }}>{resolved}/{total} obras resueltas</span>
                  {pending > 0 && <span style={{ color: C.amber, background: C.amberL, border: `1px solid ${C.amberB}`, borderRadius: 999, padding: "3px 8px", fontSize: 10.5, fontWeight: 900 }}>{pending} pendientes</span>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {products.map(({ product, link }) => (
                  <span key={product.id} title={link.variante_legacy ? `Migrado desde: ${link.variante_legacy}` : "Producto compatible"} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.t1, background: C.bg, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "4px 9px", fontSize: 10.8, fontWeight: 850 }}>
                    <PackageCheck size={11} color={C.green} /> {product.descripcion}
                  </span>
                ))}
                {!products.length && <span style={{ color: C.amber, fontSize: 11.5, fontWeight: 800 }}>Todavía no tiene productos compatibles.</span>}
              </div>

              {legacy.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${C.b0}`, paddingTop: 8 }}>
                  <span style={{ color: C.t3, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: .7 }}>Variantes anteriores</span>
                  {legacy.map((variant) => <span key={variant} style={{ color: C.t2, fontSize: 10.5 }}>{variant}</span>)}
                </div>
              )}
            </section>
          );
        })}
        {!rows.length && !loading && (
          <div style={{ border: `1px dashed ${C.b0}`, borderRadius: 13, padding: 26, color: C.t2, textAlign: "center", fontSize: 12.5 }}>
            No hay requisitos con esos filtros.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, color }) {
  return (
    <div style={{ border: `1px solid ${C.b0}`, background: C.bg, borderRadius: 11, padding: "9px 11px", display: "grid", gridTemplateColumns: "30px 1fr", gap: 9, alignItems: "center" }}>
      <span style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, color, background: `${color}18`, border: `1px solid ${color}35` }}>{createElement(icon, { size: 15 })}</span>
      <span>
        <span style={{ display: "block", color, fontFamily: C.mono, fontSize: 17, fontWeight: 950 }}>{value}</span>
        <span style={{ display: "block", color: C.t2, fontSize: 9.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: .55 }}>{label}</span>
      </span>
    </div>
  );
}
