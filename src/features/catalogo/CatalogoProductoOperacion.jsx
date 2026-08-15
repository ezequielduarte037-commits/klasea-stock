import { ArrowDownLeft, ArrowRight, ArrowUpRight, Building2, MapPin, PackageCheck, Route, Truck, UserRound, Warehouse } from "lucide-react";
import { C } from "@/theme";
import { canonicalPanolSede } from "@/features/panol/panolApi";
import { fmtDate, rowCountsAsStock, rowDelta, rowIsAnulado, rowIsEgreso, rowIsLocationChange, rowIsTransit, rowMovementAt, rowSource } from "@/features/panol/panolMovimientos";

function qty(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function fmtQty(value) {
  return Number(Math.round(qty(value) * 100) / 100).toLocaleString("es-AR");
}

function shortId(value) {
  return value ? String(value).slice(0, 8).toUpperCase() : "";
}

function sourceLabel(row) {
  const source = rowSource(row);
  if (row.request) return `Pedido ${row.request.title || shortId(row.purchase_request_id)}`;
  if (row.panol_envio) return `Envío ${row.panol_envio.titulo || shortId(row.panol_envio_id)}`;
  if (source === "remito") return `Remito${row.stock_nota || row.notas ? ` · ${row.stock_nota || row.notas}` : ""}`;
  if (source.startsWith("transferencia")) return "Transferencia interna";
  if (source.startsWith("reclasificacion")) return "Reclasificación";
  if (source === "stock_general") return "Ingreso directo";
  return source ? source.replaceAll("_", " ") : "Origen sin registrar";
}

function movementMeta(row) {
  if (rowIsAnulado(row)) return { label: "Anulado", color: C.dim, Icon: Route };
  if (rowIsLocationChange(row)) return { label: "Ubicación", color: C.blue, Icon: MapPin };
  if (rowIsEgreso(row)) return { label: "Egreso", color: C.red, Icon: ArrowUpRight };
  if (rowCountsAsStock(row)) return { label: "Ingreso", color: C.green, Icon: ArrowDownLeft };
  return { label: "Registro", color: C.dim, Icon: Route };
}

function ingresoActor(row) {
  return row.panol_envio?.recibido_por_nombre || row.created_by_nombre || "Sin registrar";
}

function egresoDestino(row) {
  const obra = row.egreso_destino_obra?.codigo || row.obra?.codigo;
  if (obra) return `Obra ${obra}`;
  return row.sector_destino || "Destino sin registrar";
}

function egresoActor(row) {
  const retira = row.retirado_por ? `Retiró ${row.retirado_por}` : "Retiro sin identificar";
  const registra = row.egreso_por_nombre ? ` · registró ${row.egreso_por_nombre}` : "";
  return `${retira}${registra}`;
}

function Section({ icon, title, hint, children }) {
  return (
    <section style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid }}>
        <span style={{ color: C.blue, display: "grid", placeItems: "center" }}>{icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: C.text, fontSize: 12.5, fontWeight: 950 }}>{title}</div>
          {hint && <div style={{ color: C.dim, fontSize: 10, marginTop: 1 }}>{hint}</div>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function CatalogoProductoOperacion({ material, rows = [], loading = false, onOpenStock, onReceive }) {
  const movimientos = rows
    .filter((row) => !rowIsTransit(row))
    .sort((a, b) => new Date(rowMovementAt(b) || 0) - new Date(rowMovementAt(a) || 0));
  const enCamino = rows.filter((row) => rowIsTransit(row));

  const obras = new Map();
  const sedes = new Map();
  movimientos.forEach((row) => {
    const delta = rowDelta(row);
    if (row.obra_id) {
      const obra = row.obra || { id: row.obra_id, codigo: shortId(row.obra_id) };
      const current = obras.get(row.obra_id) || { obra, cantidad: 0 };
      current.cantidad += delta;
      obras.set(row.obra_id, current);
    }
    const sede = canonicalPanolSede(row.stock_sede || row.panol_envio?.sede) || row.stock_sede || row.panol_envio?.sede;
    if (sede) sedes.set(sede, (sedes.get(sede) || 0) + delta);
  });
  const obrasAsignadas = [...obras.values()].filter((item) => item.cantidad > 0.0001).sort((a, b) => String(a.obra.codigo || "").localeCompare(String(b.obra.codigo || ""), "es", { numeric: true }));
  const stockPorSede = [...sedes.entries()].filter(([, cantidad]) => Math.abs(cantidad) > 0.0001).sort(([a], [b]) => a.localeCompare(b, "es"));

  if (loading) return <div style={{ padding: 18, color: C.dim, textAlign: "center", fontSize: 11.5 }}>Leyendo trazabilidad…</div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Section icon={<Warehouse size={14} />} title="Stock por sede y ubicación" hint="Saldo calculado desde el mismo ledger que Pañol">
        <div style={{ padding: 9, display: "grid", gap: 6 }}>
          {stockPorSede.length ? stockPorSede.map(([sede, cantidad]) => (
            <button key={sede} type="button" onClick={onOpenStock} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", alignItems: "center", gap: 9, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 9, padding: "8px 9px", color: C.text, textAlign: "left", cursor: "pointer" }}>
              <span style={{ minWidth: 0 }}><b style={{ fontSize: 11.5 }}>{sede}</b><span style={{ display: "block", color: C.dim, fontSize: 10, marginTop: 2 }}>{material.ubicacion || "Sin ubicación"}{material.ubicacion_obs ? ` · ${material.ubicacion_obs}` : ""}</span></span>
              <strong style={{ color: cantidad < 0 ? C.red : C.green, fontFamily: C.mono, fontSize: 13 }}>{fmtQty(cantidad)} {material.unidad_medida || "u"}</strong>
              <ArrowRight size={13} color={C.blue} />
            </button>
          )) : <div style={{ padding: 10, color: C.dim, fontSize: 11 }}>Todavía no hay existencia física registrada.</div>}
        </div>
      </Section>

      <Section icon={<Building2 size={14} />} title="Obras con existencia asignada" hint="Cuánto queda vinculado actualmente a cada obra">
        <div style={{ padding: 9, display: "grid", gap: 5 }}>
          {obrasAsignadas.length ? obrasAsignadas.map(({ obra, cantidad }) => (
            <div key={obra.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${C.border}`, padding: "6px 3px", color: C.text, fontSize: 11.5 }}>
              <span><b>{obra.codigo || shortId(obra.id)}</b>{obra.linea_nombre ? <span style={{ color: C.dim }}> · {obra.linea_nombre}</span> : null}</span>
              <strong style={{ color: C.blue, fontFamily: C.mono }}>{fmtQty(cantidad)} {material.unidad_medida || "u"}</strong>
            </div>
          )) : <div style={{ padding: 10, color: C.dim, fontSize: 11 }}>No hay saldo positivo asignado a una obra.</div>}
        </div>
      </Section>

      <Section icon={<Truck size={14} />} title={`En camino${enCamino.length ? ` · ${enCamino.length}` : ""}`} hint="Sólo envíos verificables pendientes de ingreso">
        <div style={{ padding: 9, display: "grid", gap: 6 }}>
          {enCamino.length ? enCamino.map((row) => (
            <div key={row.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 9, alignItems: "center", border: `1px solid ${C.blueB}`, background: C.blueL, borderRadius: 9, padding: "8px 9px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 11.5, fontWeight: 900 }}>{row.panol_envio?.titulo || `Envío ${shortId(row.panol_envio_id)}`}</div>
                <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{fmtQty(row.cantidad)} {row.unidad || material.unidad_medida || "u"} · {row.stock_sede || "Sin sede"}{row.obra?.codigo ? ` · obra ${row.obra.codigo}` : ""}</div>
              </div>
              <button type="button" onClick={() => onReceive?.(row)} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.blueB}`, background: C.blue, color: "#fff", borderRadius: 8, padding: "7px 9px", cursor: "pointer", fontSize: 10.5, fontWeight: 900 }}><PackageCheck size={13} />Recibir</button>
            </div>
          )) : <div style={{ padding: 10, color: C.dim, fontSize: 11 }}>No hay envíos pendientes para este producto.</div>}
        </div>
      </Section>

      <Section icon={<Route size={14} />} title={`Kardex · ${movimientos.length} movimientos`} hint="Origen, destino y responsables del movimiento">
        <div style={{ maxHeight: 360, overflowY: "auto", padding: "0 10px" }}>
          {movimientos.length ? movimientos.slice(0, 80).map((row) => {
            const meta = movementMeta(row);
            const Icon = meta.Icon;
            const delta = rowDelta(row);
            const isOut = rowIsEgreso(row);
            return (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr) auto", gap: 9, alignItems: "start", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: meta.color, fontSize: 10, fontWeight: 950 }}><Icon size={11} />{meta.label}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: C.text, fontSize: 11, fontWeight: 850 }}>{fmtDate(rowMovementAt(row))} · {isOut ? egresoDestino(row) : sourceLabel(row)}</span>
                  <span style={{ display: "block", color: C.dim, fontSize: 9.8, lineHeight: 1.4, marginTop: 2 }}>
                    {isOut ? egresoActor(row) : `Ingresó ${ingresoActor(row)} · ${row.stock_sede || row.panol_envio?.sede || "sede sin registrar"}`}
                  </span>
                </span>
                <strong style={{ color: delta < 0 ? C.red : delta > 0 ? C.green : C.dim, fontFamily: C.mono, fontSize: 11.5 }}>{delta > 0 ? "+" : ""}{fmtQty(delta)}</strong>
              </div>
            );
          }) : <div style={{ padding: 14, color: C.dim, fontSize: 11 }}>No hay movimientos registrados.</div>}
          {movimientos.length > 80 && <div style={{ padding: 9, color: C.dim, fontSize: 10, textAlign: "center" }}>Mostrando los 80 movimientos más recientes.</div>}
        </div>
      </Section>

      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 10 }}><UserRound size={12} />Los documentos históricos conservan el nombre registrado en su fecha.</div>
    </div>
  );
}
