import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, RefreshCw, RotateCcw, Truck } from "lucide-react";
import { C } from "@/theme";
import {
  cancelarTrasladoSede,
  confirmarTrasladoSede,
  fetchTrasladosSede,
} from "@/features/panol/panolTrasladosSedeApi";

const formatQty = (value) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(Number(value) || 0);
const formatDate = (value) => value
  ? new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
  : "";

function TrasladoRow({ row, sedeLocked, canReceive, busy, onConfirmar, onCancelar, isMobile }) {
  const puedeRecibir = canReceive && row.estado === "en_transito"
    && (!sedeLocked || sedeLocked === row.sede_destino);
  const puedeCancelar = canReceive && row.estado === "en_transito"
    && (!sedeLocked || sedeLocked === row.sede_origen);
  const material = row.material;
  const estadoColor = row.estado === "recibido" ? C.green : row.estado === "cancelado" ? C.dim : C.blue;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.panelSolid, padding: isMobile ? 13 : 16, display: "grid", gap: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 750, color: C.text, overflowWrap: "anywhere" }}>
            {material?.descripcion || "Producto sin descripción"}
          </div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>
            {[material?.codigo, row.obra?.codigo ? `Obra ${row.obra.codigo}` : "Stock general", formatDate(row.created_at)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <span style={{ border: `1px solid ${estadoColor}`, color: estadoColor, borderRadius: 999, padding: "4px 9px", fontSize: 10.5, fontWeight: 750, whiteSpace: "nowrap" }}>
          {row.estado === "en_transito" ? "En tránsito" : row.estado === "recibido" ? "Recibido" : "Cancelado"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", color: C.text, fontSize: 13 }}>
        <strong>{formatQty(row.cantidad)} {material?.unidad_medida || "u"}</strong>
        <span style={{ color: C.dim }}>·</span>
        <span>{row.sede_origen}</span><ArrowRight size={15} color={C.blue} /><span>{row.sede_destino}</span>
      </div>
      {row.nota && <div style={{ color: C.dim, fontSize: 11.5 }}>{row.nota}</div>}
      {row.motivo_cancelacion && <div style={{ color: C.dim, fontSize: 11.5 }}>Cancelado: {row.motivo_cancelacion}</div>}
      {row.recibido_at && <div style={{ color: C.dim, fontSize: 11 }}>Llegó el {formatDate(row.recibido_at)}</div>}
      {(puedeRecibir || puedeCancelar) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 11 }}>
          {puedeRecibir && (
            <button type="button" disabled={busy} onClick={() => onConfirmar(row)} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 9, padding: "8px 11px", fontWeight: 750, fontSize: 12, cursor: busy ? "default" : "pointer" }}>
              <CheckCircle2 size={15} /> Confirmar llegada a {row.sede_destino}
            </button>
          )}
          {puedeCancelar && (
            <button type="button" disabled={busy} onClick={() => onCancelar(row)} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 9, padding: "8px 11px", fontWeight: 650, fontSize: 12, cursor: busy ? "default" : "pointer" }}>
              <RotateCcw size={14} /> Cancelar y devolver a {row.sede_origen}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PanolTrasladosSedePanel({ sedeLocked = null, canReceive = false, toast, onStockChange, isMobile = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchTrasladosSede({ sede: sedeLocked }));
      setError("");
    } catch (err) {
      setError(err.message || "No se pudieron cargar los traslados.");
    } finally {
      setLoading(false);
    }
  }, [sedeLocked]);
  useEffect(() => { cargar(); }, [cargar]);

  const pendientes = useMemo(() => rows.filter((r) => r.estado === "en_transito"), [rows]);
  const historial = useMemo(() => rows.filter((r) => r.estado !== "en_transito"), [rows]);

  async function confirmar(row) {
    const codigo = row.obra?.codigo ? ` de la obra ${row.obra.codigo}` : "";
    if (!window.confirm(`¿Llegaron físicamente a ${row.sede_destino} ${formatQty(row.cantidad)} unidades${codigo}?\n\nRecién al confirmar se sumarán al stock de ${row.sede_destino}.`)) return;
    setBusyId(row.id);
    try {
      await confirmarTrasladoSede(row.id);
      toast.success(`Recibido en ${row.sede_destino}. La obra se conservó.`);
      await Promise.all([cargar(), onStockChange?.()]);
    } catch (err) {
      toast.error(err.message || "No se pudo confirmar la llegada.");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelar(row) {
    const motivo = window.prompt(`Motivo para cancelar el traslado a ${row.sede_destino} y devolver el stock a ${row.sede_origen}:`);
    if (motivo === null) return;
    if (!motivo.trim()) {
      toast.warning("Escribí el motivo de la cancelación.");
      return;
    }
    setBusyId(row.id);
    try {
      await cancelarTrasladoSede(row.id, motivo);
      toast.success(`Traslado cancelado. El stock volvió a ${row.sede_origen}.`);
      await Promise.all([cargar(), onStockChange?.()]);
    } catch (err) {
      toast.error(err.message || "No se pudo cancelar el traslado.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 14 : 22, display: "grid", alignContent: "start", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.text, fontSize: 18, fontWeight: 800 }}><Truck size={20} color={C.blue} /> Entre sedes</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 5, lineHeight: 1.45 }}>
            El producto conserva su obra. Sale del stock de origen al despacharlo y sólo entra en destino cuando confirman que llegó.
          </div>
        </div>
        <button type="button" onClick={cargar} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 8, padding: "8px 11px", fontSize: 11.5, cursor: loading ? "default" : "pointer" }}><RefreshCw size={14} /> Actualizar</button>
      </div>
      <div style={{ color: C.dim, fontSize: 11.5 }}>Para iniciar un traslado, abrí el producto en Inventario o Por obra y elegí <strong>Trasladar sede</strong>.</div>
      {error && <div role="alert" style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 9, padding: 12, fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ color: C.dim, fontSize: 12 }}>Cargando traslados…</div>}
      {!loading && !error && (
        <>
          <section style={{ display: "grid", gap: 10 }}>
            <h2 style={{ color: C.text, fontSize: 14, margin: 0 }}>En tránsito ({pendientes.length})</h2>
            {pendientes.length ? pendientes.map((row) => <TrasladoRow key={row.id} row={row} sedeLocked={sedeLocked} canReceive={canReceive} busy={busyId === row.id} onConfirmar={confirmar} onCancelar={cancelar} isMobile={isMobile} />)
              : <div style={{ color: C.dim, fontSize: 12, border: `1px dashed ${C.border}`, borderRadius: 9, padding: 18 }}>No hay productos viajando entre pañoles.</div>}
          </section>
          {historial.length > 0 && <section style={{ display: "grid", gap: 10 }}>
            <h2 style={{ color: C.text, fontSize: 14, margin: "8px 0 0" }}>Recibidos y cancelados</h2>
            {historial.map((row) => <TrasladoRow key={row.id} row={row} sedeLocked={sedeLocked} canReceive={canReceive} busy={false} onConfirmar={confirmar} onCancelar={cancelar} isMobile={isMobile} />)}
          </section>}
        </>
      )}
    </div>
  );
}
