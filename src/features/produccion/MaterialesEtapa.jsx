import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Copy, Layers, Loader2, Package, Plus, Search, Trash2 } from "lucide-react";
import { C } from "@/theme";
import MaterialPicker from "@/features/produccion/MaterialPicker";
import { INPUT, num, tint } from "@/features/produccion/comprasTokens";
import { Cta, Ghost, IconBtn, Pill } from "@/features/produccion/comprasUI";

// ─────────────────────────────────────────────────────────────────────────────
// La lista de materiales de una etapa de compra. La usan igual la plantilla del
// modelo y la etapa real de la obra, así que vive acá una sola vez.
//
// El botón "Agregar materiales" va SIEMPRE en la cabecera de la lista: es la
// acción principal de la pantalla y tiene que estar donde el usuario mira.
// ─────────────────────────────────────────────────────────────────────────────

const SIN_PROCESO = "__sin__";

/* ── una fila ─────────────────────────────────────────────────────────────── */
function Fila({ row, procesos, puedeEditar, onCantidad, onProceso, onQuitar, seleccionable = false, seleccionado = false, onSeleccionar }) {
  const [valor, setValor] = useState(String(row.cantidad ?? ""));
  // Si la cantidad cambia afuera (recarga tras guardar), se re-sincroniza en el
  // render en vez de con un efecto.
  const [ref, setRef] = useState(row.cantidad);
  if (ref !== row.cantidad) {
    setRef(row.cantidad);
    setValor(String(row.cantidad ?? ""));
  }

  const proc = procesos.find((p) => p.id === row.linea_proceso_id) || null;
  const pc = proc?.color || "#64748b";

  return (
    <tr className="me-row" style={seleccionado ? { background: C.violetL } : undefined}>
      {seleccionable && (
        <td style={{ padding: "9px 0 9px 12px", borderBottom: `1px solid ${C.border}`, width: 30 }}>
          <input
            type="checkbox"
            aria-label="Seleccionar material"
            checked={seleccionado}
            onChange={onSeleccionar}
            style={{ width: 14, height: 14, accentColor: "var(--violet)", cursor: "pointer" }}
          />
        </td>
      )}
      <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 27, height: 27, flexShrink: 0, borderRadius: 8, display: "grid", placeItems: "center", background: C.panel2, color: C.dim }}>
            <Package size={13} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.material?.descripcion || "Material"}
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 2, flexWrap: "wrap", alignItems: "center" }}>
              {row.material?.codigo && <span style={{ fontSize: 10.5, color: C.t3, fontFamily: C.mono }}>{row.material.codigo}</span>}
              {row.material?.proveedor && <span style={{ fontSize: 10.5, color: C.dim }}>· {row.material.proveedor}</span>}
              {row.origen === "plantilla" && <Pill color={C.violet} soft={C.violetL} borde={C.violetB}>de plantilla</Pill>}
            </div>
          </div>
        </div>
      </td>

      <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.border}` }}>
        {procesos.length === 0 ? (
          <span style={{ fontSize: 12, color: C.dim }}>—</span>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
            <select
              value={row.linea_proceso_id || SIN_PROCESO}
              disabled={!puedeEditar}
              onChange={(e) => onProceso(e.target.value === SIN_PROCESO ? null : e.target.value)}
              style={{
                ...INPUT, width: "auto", minWidth: 132, padding: "5px 9px", fontSize: 11.5, borderRadius: 9,
                cursor: puedeEditar ? "pointer" : "default",
                color: proc ? C.text : C.dim,
                background: proc ? tint(pc, 12) : C.panel,
                borderColor: proc ? tint(pc, 30) : C.border,
              }}
            >
              <option value={SIN_PROCESO}>— sin asignar —</option>
              {procesos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {row.tarea?.nombre && (
              <span
                title="Tarea de producción definida desde Obras"
                style={{
                  maxWidth: 220,
                  overflow: "hidden",
                  color: C.teal,
                  fontSize: 10,
                  fontWeight: 800,
                  lineHeight: 1.25,
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                ↳ {row.tarea.nombre}
              </span>
            )}
          </div>
        )}
      </td>

      <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.border}`, textAlign: "right", whiteSpace: "nowrap" }}>
        <input
          value={valor}
          inputMode="decimal"
          disabled={!puedeEditar}
          aria-label="Cantidad"
          onChange={(e) => setValor(e.target.value)}
          onBlur={() => { if (num(valor) !== num(row.cantidad)) onCantidad(valor); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          style={{ ...INPUT, width: 72, display: "inline-block", padding: "5px 8px", fontSize: 12, fontFamily: C.mono, textAlign: "right", borderRadius: 8 }}
        />
        <span style={{ fontSize: 11.5, color: C.dim, paddingLeft: 7 }}>{row.unidad || row.material?.unidad_medida || "u"}</span>
      </td>

      <td style={{ padding: "9px 10px 9px 0", borderBottom: `1px solid ${C.border}`, width: 40 }}>
        {puedeEditar && <IconBtn icon={Trash2} title="Quitar material" tono="rojo" onClick={onQuitar} />}
      </td>
    </tr>
  );
}

/* ── lista completa ───────────────────────────────────────────────────────── */
export default function MaterialesEtapa({
  etapaNombre,
  materiales,
  procesos = [],
  puedeEditar = true,
  onAgregar,
  onCantidad,
  onProceso,
  onQuitar,
  onCopiarDeOtra = null,
  // Para mover materiales a otra tanda sin borrarlos y volverlos a cargar.
  otrasEtapas = [],
  onTransferir = null,
  // Asignar la etapa de producción a varios de una, en vez de fila por fila.
  onProcesoMasivo = null,
  footer = null,
}) {
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [moviendo, setMoviendo] = useState(false);
  const [asignando, setAsignando] = useState(false);

  const puedeMoverEtapa = !!onTransferir && puedeEditar && otrasEtapas.length > 0;
  const puedeAsignarProceso = !!onProcesoMasivo && puedeEditar && procesos.length > 0;
  // Alcanza con que una de las dos acciones esté disponible para que valga la
  // pena mostrar las casillas.
  const puedeMover = puedeMoverEtapa || puedeAsignarProceso;

  const yaCargados = useMemo(() => new Set(materiales.map((m) => m.material_id)), [materiales]);

  // Si la lista cambia (se movió algo, se recargó), se limpian las marcas que
  // ya no existen para no arrastrar ids fantasma.
  const idsActuales = materiales.map((m) => m.id).join(",");
  useEffect(() => {
    setSel((actuales) => new Set([...actuales].filter((id) => materiales.some((m) => m.id === id))));
  }, [idsActuales, materiales]);

  const toggleSel = (id) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  async function mover(destinoId) {
    if (!destinoId || !sel.size) return;
    setMoviendo(true);
    try {
      await onTransferir([...sel], destinoId);
      setSel(new Set());
    } finally { setMoviendo(false); }
  }

  // El valor "__ninguna__" limpia la etiqueta: hace falta poder desasignar en
  // lote, no sólo asignar, porque si te equivocaste de etapa quedabas colgado.
  async function asignarProceso(valor) {
    if (!valor || !sel.size) return;
    setAsignando(true);
    try {
      await onProcesoMasivo([...sel], valor === "__ninguna__" ? null : valor);
      setSel(new Set());
    } finally { setAsignando(false); }
  }

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return materiales;
    return materiales.filter((m) =>
      `${m.material?.descripcion ?? ""} ${m.material?.codigo ?? ""} ${m.material?.proveedor ?? ""}`.toLowerCase().includes(term)
    );
  }, [materiales, q]);

  return (
    <div className="ce-surface" data-tour="agregar-materiales" style={{ overflow: "hidden" }}>
      {/* cabecera: el botón de agregar vive acá, siempre visible */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 850, letterSpacing: 0.7, textTransform: "uppercase", color: C.dim }}>Materiales</span>
        <Pill color={materiales.length ? C.blue : C.dim} soft={materiales.length ? C.blueL : C.panel2} borde={materiales.length ? C.blueB : "transparent"} mono>
          {materiales.length}
        </Pill>

        {materiales.length > 0 && (
          <div style={{ position: "relative", flex: 1, minWidth: 140, maxWidth: 280 }}>
            <Search size={13} color={C.dim} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en la etapa…"
              style={{ ...INPUT, padding: "6px 9px 6px 28px", fontSize: 12, borderRadius: 9, background: C.panel }}
            />
          </div>
        )}

        {puedeEditar && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {onCopiarDeOtra && materiales.length > 0 && (
              <Ghost icon={Copy} size="sm" onClick={onCopiarDeOtra}>Copiar de otra</Ghost>
            )}
            <Cta icon={Plus} tono="azul" size="sm" onClick={() => setPicker(true)}>Agregar materiales</Cta>
          </div>
        )}
      </div>

      {/* Barra de selección: aparece sólo cuando hay algo marcado, así no ocupa
          lugar en el uso normal. */}
      {puedeMover && sel.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", flexWrap: "wrap",
          background: C.violetL, borderBottom: `1px solid ${C.violetB}`,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 850, color: C.violet }}>
            {sel.size} {sel.size === 1 ? "seleccionado" : "seleccionados"}
          </span>
          <button
            type="button"
            onClick={() => setSel(new Set())}
            style={{ border: "none", background: "transparent", color: C.dim, fontSize: 11.5, fontWeight: 750, cursor: "pointer", fontFamily: C.sans }}
          >
            Limpiar
          </button>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {(moviendo || asignando) ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.dim }}>
                <Loader2 size={13} className="spin" /> {moviendo ? "Moviendo…" : "Asignando…"}
              </span>
            ) : (
              <>
                {puedeAsignarProceso && (
                  <>
                    <Layers size={13} color={C.violet} />
                    <select
                      value=""
                      onChange={(e) => asignarProceso(e.target.value)}
                      title="Asignar la etapa de producción a todos los seleccionados"
                      style={{ ...INPUT, width: "auto", padding: "5px 9px", fontSize: 12, borderRadius: 9, cursor: "pointer" }}
                    >
                      <option value="">Etapa de producción…</option>
                      {procesos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      <option value="__ninguna__">— sin asignar —</option>
                    </select>
                  </>
                )}
                {puedeMoverEtapa && (
                  <>
                    <ArrowRightLeft size={13} color={C.violet} />
                    <select
                      value=""
                      onChange={(e) => mover(e.target.value)}
                      title="Mover los seleccionados a otra tanda de compra"
                      style={{ ...INPUT, width: "auto", padding: "5px 9px", fontSize: 12, borderRadius: 9, cursor: "pointer" }}
                    >
                      <option value="">Mover a…</option>
                      {otrasEtapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* vacío: la acción, no una tabla en blanco */}
      {!materiales.length ? (
        <div style={{ display: "grid", placeItems: "center", textAlign: "center", gap: 9, padding: "38px 24px" }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
            <Plus size={26} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 850, color: C.text }}>Esta etapa todavía no tiene materiales</div>
          <div style={{ fontSize: 13, color: C.dim, maxWidth: 380, lineHeight: 1.6 }}>
            Agregá los materiales que se compran en esta tanda. Podés buscarlos por proveedor o rubro y marcar varios de una vez.
          </div>
          {puedeEditar && (
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center", marginTop: 5 }}>
              <Cta icon={Plus} tono="azul" onClick={() => setPicker(true)}>Agregar materiales</Cta>
              {onCopiarDeOtra && <Ghost icon={Copy} onClick={onCopiarDeOtra}>Copiar de otra etapa</Ghost>}
            </div>
          )}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {puedeMover && (
                  <th style={{ padding: "8px 0 8px 12px", borderBottom: `1px solid ${C.border}`, width: 30 }}>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      checked={visibles.length > 0 && visibles.every((m) => sel.has(m.id))}
                      onChange={(e) => setSel(e.target.checked ? new Set(visibles.map((m) => m.id)) : new Set())}
                      style={{ width: 14, height: 14, accentColor: "var(--violet)", cursor: "pointer" }}
                    />
                  </th>
                )}
                {["Material", "Etapa de producción", "Cantidad", ""].map((h, i) => (
                  <th
                    key={h || i}
                    style={{
                      textAlign: i === 2 ? "right" : "left", padding: "8px 14px", borderBottom: `1px solid ${C.border}`,
                      fontSize: 10, fontWeight: 850, letterSpacing: 0.6, textTransform: "uppercase", color: C.dim,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((row) => (
                <Fila
                  key={row.id}
                  row={row}
                  procesos={procesos}
                  puedeEditar={puedeEditar}
                  onCantidad={(v) => onCantidad(row, v)}
                  onProceso={(p) => onProceso(row, p)}
                  onQuitar={() => onQuitar(row)}
                  seleccionable={puedeMover}
                  seleccionado={sel.has(row.id)}
                  onSeleccionar={() => toggleSel(row.id)}
                />
              ))}
              {!visibles.length && (
                <tr>
                  <td colSpan={puedeMover ? 5 : 4} style={{ padding: "22px 14px", textAlign: "center", color: C.dim, fontSize: 12.5 }}>
                    Ningún material coincide con “{q}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {footer && (
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 14px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          {footer}
        </div>
      )}

      {picker && (
        <MaterialPicker
          titulo={etapaNombre ? `Agregar materiales a ${etapaNombre}` : "Agregar materiales"}
          yaCargados={yaCargados}
          onClose={() => setPicker(false)}
          onAdd={async (seleccion) => { await onAgregar(seleccion); setPicker(false); }}
        />
      )}
    </div>
  );
}
