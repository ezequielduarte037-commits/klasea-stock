// Panel de devoluciones del pañol.
//
// Tres columnas, que son las tres preguntas del pañolero:
//   · Para decidir      — volvió y está en el estante esperando que Compras diga
//   · En reparación     — salió al taller, ¿hace cuánto?
//   · Esperando reposición — el proveedor debe, ¿cuánto y hace cuánto?
//
// Los días y el valor vienen calculados de la vista. Son los dos datos que
// hacen que alguien levante el teléfono: "Rincón del Herraje debe $840.000
// hace 45 días" mueve más que una lista de ítems.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, PackageX, RotateCcw, Wrench } from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { DEVOLUCION_ESTADOS, fetchDevoluciones, resolverDevolucion } from "@/features/panol/panolApi";

const COLUMNAS = [
  {
    estado: "devuelto",
    titulo: "Para decidir",
    detalle: "Volvieron al pañol. Compras define qué se hace.",
    icon: AlertTriangle,
    color: C.red, soft: C.redL, borde: C.redB,
  },
  {
    estado: "en_reparacion",
    titulo: "En reparación",
    detalle: "Salieron al taller.",
    icon: Wrench,
    color: C.violet, soft: C.violetL, borde: C.violetB,
  },
  {
    estado: "esperando_reposicion",
    titulo: "Esperando reposición",
    detalle: "El proveedor tiene que mandar el reemplazo.",
    icon: PackageX,
    color: C.cyan, soft: C.cyanL, borde: C.cyanB,
  },
];

// Los dos estados que sacan el material del pañol necesitan saber A DÓNDE.
// "En reparación" sin decir dónde no sirve para nada: dentro de tres semanas
// nadie se acuerda a qué taller fue, y el reclamo no se puede hacer.
const PIDE_DESTINO = {
  en_reparacion: { titulo: "Mandar a reparar", label: "¿A qué taller va?", ph: "Ej: Trimer" },
  esperando_reposicion: { titulo: "Reclamar reposición", label: "¿A qué proveedor se le reclama?", ph: "Ej: Rincón del Herraje" },
};

// Acciones posibles desde cada estado. Sólo lo que tiene sentido: desde el
// estante se decide, y una vez afuera sólo se cierra.
const ACCIONES = {
  devuelto: [
    ["en_reparacion", "Mandar a reparar"],
    ["esperando_reposicion", "Reclamar reposición"],
    ["descartado", "Descartar"],
  ],
  en_reparacion: [
    ["reparado", "Volvió reparado"],
    ["descartado", "No tuvo arreglo"],
  ],
  esperando_reposicion: [
    ["repuesto", "Llegó el reemplazo"],
    ["nota_credito", "Nota de crédito"],
    ["rechazado", "El proveedor no se hizo cargo"],
  ],
};

function fmtMoneda(valor, moneda) {
  const n = Number(valor || 0);
  if (!n) return "";
  const texto = n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return moneda === "USD" ? `USD ${texto}` : `$${texto}`;
}

function fmtCantidad(valor, unidad) {
  const n = Number(valor || 0);
  const texto = Number.isInteger(n) ? String(n) : n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
  return `${texto} ${unidad || "u"}`;
}

export default function DevolucionesPanel({ isMobile = false }) {
  const toast = useToast();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState("");
  // { fila, estado, destino } cuando la acción elegida necesita un destino.
  const [pidiendoDestino, setPidiendoDestino] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setFilas(await fetchDevoluciones({ soloAbiertas: true }));
    } catch (error) {
      toast?.error?.(error.message || "No se pudieron cargar las devoluciones.");
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const porEstado = useMemo(() => {
    const map = new Map(COLUMNAS.map((col) => [col.estado, []]));
    filas.forEach((fila) => {
      if (map.has(fila.estado)) map.get(fila.estado).push(fila);
    });
    return map;
  }, [filas]);

  // Lo que el proveedor debe, en plata. Es el número que justifica el reclamo.
  const totalReclamo = useMemo(() => {
    const porMoneda = new Map();
    (porEstado.get("esperando_reposicion") ?? []).forEach((fila) => {
      const moneda = fila.moneda || "ARS";
      porMoneda.set(moneda, (porMoneda.get(moneda) || 0) + Number(fila.valor_estimado || 0));
    });
    return [...porMoneda.entries()].filter(([, total]) => total > 0);
  }, [porEstado]);

  async function resolver(fila, estado, destino = null) {
    setOcupado(fila.id);
    try {
      await resolverDevolucion(fila.id, estado, { destino: destino || null });
      toast?.success?.(DEVOLUCION_ESTADOS[estado]?.label || "Actualizado.");
      setPidiendoDestino(null);
      await cargar();
    } catch (error) {
      toast?.error?.(error.message || "No se pudo actualizar.");
    } finally {
      setOcupado("");
    }
  }

  // Si el estado nuevo saca el material del pañol, primero se pregunta a dónde.
  function pedirAccion(fila, estado) {
    if (PIDE_DESTINO[estado]) setPidiendoDestino({ fila, estado, destino: fila.destino || "" });
    else resolver(fila, estado);
  }

  if (cargando) {
    return <div style={{ color: C.dim, fontSize: 12.5, padding: "28px 0", textAlign: "center" }}>Cargando devoluciones…</div>;
  }

  if (!filas.length) {
    return (
      <div style={{ display: "grid", placeItems: "center", gap: 8, padding: "42px 16px", borderRadius: 14, border: `1px dashed ${C.border}`, background: C.panel, textAlign: "center" }}>
        <RotateCcw size={22} style={{ color: C.green }} />
        <div style={{ color: C.text, fontSize: 13, fontWeight: 850 }}>No hay devoluciones abiertas</div>
        <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.45, maxWidth: 380 }}>
          Cuando un material entregado vuelva fallado, se registra desde el egreso y aparece acá.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {totalReclamo.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 13px", borderRadius: 12, border: `1px solid ${C.cyanB}`, background: C.cyanL }}>
          <PackageX size={15} style={{ color: C.cyan, flexShrink: 0 }} />
          <span style={{ color: C.text, fontSize: 12.5, fontWeight: 850 }}>Pendiente de reposición</span>
          {totalReclamo.map(([moneda, total]) => (
            <span key={moneda} style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 900, color: C.cyan }}>
              {fmtMoneda(total, moneda)}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 10, alignItems: "start" }}>
        {COLUMNAS.map((col) => {
          const items = porEstado.get(col.estado) ?? [];
          const Icon = col.icon;
          return (
            <section key={col.estado} style={{ borderRadius: 14, border: `1px solid ${items.length ? col.borde : C.border}`, background: C.panel, overflow: "hidden" }}>
              <div style={{ padding: "11px 13px", borderBottom: `1px solid ${C.border}`, background: items.length ? col.soft : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Icon size={14} style={{ color: items.length ? col.color : C.dim, flexShrink: 0 }} />
                  <span style={{ color: C.text, fontSize: 12.5, fontWeight: 900 }}>{col.titulo}</span>
                  <span style={{ marginLeft: "auto", fontFamily: C.mono, fontSize: 12, fontWeight: 900, color: items.length ? col.color : C.dim }}>
                    {items.length}
                  </span>
                </div>
                <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.4, marginTop: 3 }}>{col.detalle}</div>
              </div>

              <div style={{ display: "grid", gap: 6, padding: items.length ? 8 : 0 }}>
                {items.map((fila) => {
                  // Días afuera si ya salió; si no, cuánto lleva en el estante.
                  const dias = fila.dias_afuera ?? fila.dias_desde_devolucion ?? 0;
                  const viejo = dias >= 15;
                  return (
                    <article key={fila.id} style={{ borderRadius: 11, border: `1px solid ${viejo ? C.redB : C.border}`, background: C.panelSolid, padding: 10, display: "grid", gap: 7 }}>
                      <div>
                        <div style={{ color: C.text, fontSize: 12.5, fontWeight: 850, lineHeight: 1.3 }}>{fila.descripcion}</div>
                        <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>
                          {fmtCantidad(fila.cantidad, fila.unidad)}
                          {fila.obra_codigo ? ` · ${fila.obra_codigo}` : ""}
                          {fila.proveedor_nombre ? ` · ${fila.proveedor_nombre}` : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {fila.destino && (
                          <span style={{ padding: "2px 7px", borderRadius: 6, background: col.soft, border: `1px solid ${col.borde}`, color: col.color, fontSize: 10.5, fontWeight: 900 }}>
                            {fila.destino}
                          </span>
                        )}
                        <span style={{ fontSize: 10.5, fontWeight: viejo ? 900 : 700, color: viejo ? C.red : C.dim }}>
                          {fila.dias_afuera != null ? "Afuera hace" : "Devuelto hace"} {dias} {dias === 1 ? "día" : "días"}
                        </span>
                        {fila.valor_estimado > 0 && (
                          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.muted }}>
                            {fmtMoneda(fila.valor_estimado, fila.moneda)}
                          </span>
                        )}
                      </div>

                      {fila.detalle && (
                        <div style={{ color: C.muted, fontSize: 10.5, lineHeight: 1.4 }}>{fila.detalle}</div>
                      )}

                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {(ACCIONES[fila.estado] ?? []).map(([estado, label]) => (
                          <button
                            key={estado}
                            type="button"
                            disabled={ocupado === fila.id}
                            onClick={() => pedirAccion(fila, estado)}
                            style={{
                              padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                              border: `1px solid ${C.border}`, background: C.panel, color: C.muted,
                              fontSize: 10.5, fontWeight: 800, fontFamily: C.sans,
                              opacity: ocupado === fila.id ? 0.5 : 1,
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {pidiendoDestino && (
        <div
          onClick={() => setPidiendoDestino(null)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(15,23,42,0.5)", display: "grid", placeItems: "center", padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(420px, 100%)", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, boxShadow: "0 24px 70px rgba(15,23,42,0.22)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>{PIDE_DESTINO[pidiendoDestino.estado].titulo}</div>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                {fmtCantidad(pidiendoDestino.fila.cantidad, pidiendoDestino.fila.unidad)} · {pidiendoDestino.fila.descripcion}
              </div>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {PIDE_DESTINO[pidiendoDestino.estado].label}
                </span>
                <input
                  autoFocus
                  size={1}
                  value={pidiendoDestino.destino}
                  placeholder={PIDE_DESTINO[pidiendoDestino.estado].ph}
                  onChange={(e) => setPidiendoDestino((p) => ({ ...p, destino: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pidiendoDestino.destino.trim()) {
                      resolver(pidiendoDestino.fila, pidiendoDestino.estado, pidiendoDestino.destino.trim());
                    }
                  }}
                  style={{ width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.sans, outline: "none" }}
                />
              </label>
              <div style={{ color: C.dim, fontSize: 11, lineHeight: 1.45 }}>
                Queda escrito en la tarjeta y empieza a contar los días afuera.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
              <button type="button" onClick={() => setPidiendoDestino(null)}
                style={{ padding: "8px 14px", borderRadius: 9, cursor: "pointer", border: `1px solid ${C.border}`, background: C.panel, color: C.muted, fontSize: 12.5, fontWeight: 800, fontFamily: C.sans }}>
                Cancelar
              </button>
              <button type="button"
                disabled={!pidiendoDestino.destino.trim() || ocupado === pidiendoDestino.fila.id}
                onClick={() => resolver(pidiendoDestino.fila, pidiendoDestino.estado, pidiendoDestino.destino.trim())}
                style={{
                  padding: "8px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 900, fontFamily: C.sans,
                  border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue,
                  cursor: pidiendoDestino.destino.trim() ? "pointer" : "not-allowed",
                  opacity: pidiendoDestino.destino.trim() ? 1 : 0.5,
                }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
