import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, CheckSquare2, ClipboardPlus, Loader2,
  Package, RefreshCw, Search, Truck,
} from "lucide-react";
import { C } from "@/theme";
import {
  autogenerarPedidosVencidos,
  crearPedidoProveedor,
  fetchEtapasVencidasSinMateriales,
  fetchMaterialesPendientesPorProveedor,
} from "@/features/produccion/comprasEtapasApi";
import { INPUT, num, tint } from "@/features/produccion/comprasTokens";
import { Cta, EmptyState, Ghost, Kpi, Pill } from "@/features/produccion/comprasUI";

function fechaCorta(value) {
  if (!value) return "Sin fecha";
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

// Un proveedor con todas sus obras. Es el que junta la selección y arma UN
// pedido, aunque los materiales vengan de obras distintas. Las obras que entran
// son sólo las que quedaron tildadas: nunca se agrega una de oficio, porque a
// veces hay una obra que todavía no se debe pedir.
function ProveedorBloque({ grupo, onCreado, toast }) {
  const todosLosIds = useMemo(
    () => grupo.obras.flatMap((obra) => obra.items.map((item) => item.etapa_material_id)),
    [grupo.obras]
  );
  const idsKey = todosLosIds.join(",");
  const [seleccionados, setSeleccionados] = useState(() => new Set(todosLosIds));
  const [creando, setCreando] = useState(false);

  // Si la lista cambia (se generó un pedido, se recargó), se limpian las marcas
  // que ya no existen para no mandar ids fantasma.
  const [refIds, setRefIds] = useState(idsKey);
  if (refIds !== idsKey) {
    setRefIds(idsKey);
    setSeleccionados(new Set(todosLosIds));
  }

  function toggle(id) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleObra(ids, marcar) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (marcar ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  // Cuántas obras entran realmente en el pedido según lo tildado.
  const obrasEnPedido = grupo.obras.filter((obra) =>
    obra.items.some((item) => seleccionados.has(item.etapa_material_id))
  );

  async function crear() {
    if (!seleccionados.size || creando) return;
    if (obrasEnPedido.length > 1) {
      const nombres = obrasEnPedido.map((o) => o.obraCodigo || "sin código").join(", ");
      if (!window.confirm(
        `Este pedido a ${grupo.proveedor} junta materiales de ${obrasEnPedido.length} obras:\n\n${nombres}\n\n¿Va así?`
      )) return;
    }
    setCreando(true);
    try {
      const resultado = await crearPedidoProveedor({
        materialIds: [...seleccionados],
        proveedor: grupo.proveedor,
      });
      toast?.success(
        `Pedido a ${grupo.proveedor}: ${resultado.items} materiales de ${resultado.obras} ${resultado.obras === 1 ? "obra" : "obras"}. Compras ya fue avisado.`
      );
      await onCreado();
    } catch (error) {
      toast?.error(error.message || "No se pudo crear el pedido.");
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="ce-surface" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", flexWrap: "wrap" }}>
        <span style={{ width: 31, height: 31, borderRadius: 10, display: "grid", placeItems: "center", background: C.violetL, border: `1px solid ${C.violetB}`, color: C.violet }}>
          <Truck size={15} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: C.text }}>{grupo.proveedor}</div>
          <div style={{ fontSize: 11, color: C.dim }}>
            {grupo.total} materiales · {grupo.obras.length} {grupo.obras.length === 1 ? "obra" : "obras"}
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          {obrasEnPedido.length > 1 && (
            <Pill color={C.blue} soft={C.blueL} borde={C.blueB}>
              cruza {obrasEnPedido.length} obras
            </Pill>
          )}
          <span style={{ fontSize: 11.5, color: C.dim }}>
            {seleccionados.size} de {grupo.total} tildados
          </span>
          <Cta
            icon={creando ? Loader2 : ClipboardPlus}
            size="sm"
            onClick={crear}
            disabled={!seleccionados.size || creando}
          >
            Generar pedido · {seleccionados.size}
          </Cta>
        </div>
      </div>

      {grupo.obras.map((obra) => (
        <ObraProveedor
          key={obra.obraId}
          grupo={obra}
          seleccionados={seleccionados}
          onToggle={toggle}
          onToggleObra={toggleObra}
        />
      ))}
    </div>
  );
}

// La selección NO vive acá sino en el proveedor, que es el que arma el pedido.
// Antes cada obra tenía su propio botón y por lo tanto no había forma de juntar
// material de dos obras para el mismo proveedor, que es justo cuando más
// conviene juntar (flete, mínimo de compra).
function ObraProveedor({ grupo, seleccionados, onToggle, onToggleObra }) {
  const todos = grupo.items.length > 0 && grupo.items.every((item) => seleccionados.has(item.etapa_material_id));
  const marcadosAca = grupo.items.filter((item) => seleccionados.has(item.etapa_material_id)).length;
  const etapas = [...new Map(grupo.items.map((item) => [
    item.obra_compra_etapa_id,
    { nombre: item.etapa_nombre, color: item.etapa_color },
  ])).values()];

  const toggle = onToggle;

  return (
    <section style={{ borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap" }}>
        <input
          type="checkbox"
          aria-label={`Seleccionar materiales de ${grupo.obraCodigo}`}
          checked={todos}
          onChange={(event) => onToggleObra(grupo.items.map((item) => item.etapa_material_id), event.target.checked)}
          style={{ width: 15, height: 15, accentColor: "var(--violet)", cursor: "pointer" }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, color: C.text }}>{grupo.obraCodigo || "Obra sin código"}</div>
          <div style={{ fontSize: 11, color: C.dim }}>
            {marcadosAca}/{grupo.items.length} materiales · {etapas.length} {etapas.length === 1 ? "etapa" : "etapas"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {etapas.map((etapa) => (
            <Pill
              key={etapa.nombre}
              color={etapa.color || C.violet}
              soft={tint(etapa.color || "#8b5cf6", 11)}
              borde={tint(etapa.color || "#8b5cf6", 27)}
            >
              {etapa.nombre}
            </Pill>
          ))}
        </div>
      </div>

      <div style={{ overflowX: "auto", padding: "0 14px 12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 690, fontSize: 12 }}>
          <thead>
            <tr style={{ color: C.dim, textAlign: "left" }}>
              <th style={{ width: 30, padding: "6px 7px" }} />
              <th style={{ padding: "6px 7px", fontWeight: 800 }}>Material</th>
              <th style={{ padding: "6px 7px", fontWeight: 800 }}>Etapa de compra</th>
              <th style={{ padding: "6px 7px", fontWeight: 800 }}>Fecha</th>
              <th style={{ padding: "6px 7px", fontWeight: 800, textAlign: "right" }}>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {grupo.items.map((item) => {
              const urgente = Number(item.dias_restantes) < 0;
              return (
                <tr key={item.etapa_material_id} className="ce-row">
                  <td style={{ padding: "7px", borderTop: `1px solid ${C.border}` }}>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${item.material_descripcion}`}
                      checked={seleccionados.has(item.etapa_material_id)}
                      onChange={() => toggle(item.etapa_material_id)}
                      style={{ width: 14, height: 14, accentColor: "var(--violet)", cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "7px", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ color: C.text, fontWeight: 750 }}>{item.material_descripcion}</div>
                    {item.material_codigo && (
                      <div style={{ marginTop: 2, color: C.dim, fontFamily: C.mono, fontSize: 10.5 }}>{item.material_codigo}</div>
                    )}
                  </td>
                  <td style={{ padding: "7px", borderTop: `1px solid ${C.border}` }}>
                    <Pill
                      color={item.etapa_color || C.violet}
                      soft={tint(item.etapa_color || "#8b5cf6", 10)}
                      borde={tint(item.etapa_color || "#8b5cf6", 24)}
                    >
                      {item.etapa_nombre}
                    </Pill>
                  </td>
                  <td style={{ padding: "7px", borderTop: `1px solid ${C.border}` }}>
                    <span style={{ color: urgente ? C.red : C.dim, fontFamily: C.mono, fontWeight: urgente ? 850 : 600 }}>
                      {fechaCorta(item.fecha_compra)}
                      {urgente ? ` · ${Math.abs(Number(item.dias_restantes))}d tarde` : ""}
                    </span>
                  </td>
                  <td style={{ padding: "7px", borderTop: `1px solid ${C.border}`, textAlign: "right", color: C.muted, fontFamily: C.mono }}>
                    {num(item.cantidad)} {item.unidad}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ProveedoresTab({ toast, onPedidoGenerado }) {
  const [materiales, setMateriales] = useState([]);
  const [sinMateriales, setSinMateriales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ejecutando, setEjecutando] = useState(false);
  const [q, setQ] = useState("");

  const cargar = useCallback(async ({ autogenerar = false, avisar = false } = {}) => {
    setCargando(true);
    if (autogenerar) setEjecutando(true);
    try {
      let resultado = null;
      if (autogenerar) resultado = await autogenerarPedidosVencidos();
      const [pendientes, vencidas] = await Promise.all([
        fetchMaterialesPendientesPorProveedor(),
        fetchEtapasVencidasSinMateriales(),
      ]);
      setMateriales(pendientes);
      setSinMateriales(vencidas);
      if (resultado?.pedidos_creados) {
        toast?.success(
          `${resultado.pedidos_creados} ${resultado.pedidos_creados === 1 ? "pedido automático creado" : "pedidos automáticos creados"} · ${resultado.items_incluidos} materiales.`
        );
        onPedidoGenerado?.();
      } else if (avisar) {
        toast?.success("Revisión completa: no había pedidos vencidos nuevos para generar.");
      }
    } catch (error) {
      toast?.error(error.message || "No se pudo cargar la operación por proveedor.");
    } finally {
      setCargando(false);
      setEjecutando(false);
    }
  }, [onPedidoGenerado, toast]);

  useEffect(() => {
    cargar({ autogenerar: true });
  }, [cargar]);

  const proveedores = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtrados = materiales.filter((item) => {
      if (!term) return true;
      return `${item.proveedor} ${item.obra_codigo} ${item.etapa_nombre} ${item.material_descripcion} ${item.material_codigo ?? ""}`
        .toLowerCase()
        .includes(term);
    });
    const mapa = new Map();
    for (const item of filtrados) {
      if (!mapa.has(item.proveedor)) mapa.set(item.proveedor, new Map());
      const obras = mapa.get(item.proveedor);
      if (!obras.has(item.obra_id)) {
        obras.set(item.obra_id, {
          obraId: item.obra_id,
          obraCodigo: item.obra_codigo,
          items: [],
        });
      }
      obras.get(item.obra_id).items.push(item);
    }
    return [...mapa.entries()].map(([proveedor, obras]) => ({
      proveedor,
      obras: [...obras.values()],
      total: [...obras.values()].reduce((acc, obra) => acc + obra.items.length, 0),
    }));
  }, [materiales, q]);

  const vencidos = materiales.filter((item) => Number(item.dias_restantes) < 0).length;

  return (
    <div style={{ height: "100%", overflowY: "auto", display: "grid", gap: 12, alignContent: "start", paddingRight: 2 }}>
      <div className="ce-surface" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Kpi icon={Truck} valor={new Set(materiales.map((item) => item.proveedor)).size} label="proveedores" color="var(--violet)" soft="var(--violet-soft)" borde="var(--violet-border)" />
          <Kpi icon={Package} valor={materiales.length} label="materiales pendientes" color="var(--blue)" soft="var(--blue-soft)" borde="var(--blue-border)" />
          <Kpi icon={CalendarClock} valor={vencidos} label="vencidos" color="var(--red)" soft="var(--red-soft)" borde="var(--red-border)" />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: 230 }}>
            <Search size={14} color={C.dim} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Proveedor, obra, etapa o material…"
              style={{ ...INPUT, padding: "8px 10px 8px 31px", fontSize: 12.5 }}
            />
          </div>
          <Ghost
            icon={ejecutando ? Loader2 : RefreshCw}
            disabled={ejecutando}
            onClick={() => cargar({ autogenerar: true, avisar: true })}
            title="Busca etapas cuya fecha ya venció y que tengan la generación automática prendida, y les arma el pedido. Las que no la tengan prendida no se tocan."
          >
            Generar los vencidos
          </Ghost>
        </div>
      </div>

      {/* Cómo se usa la pantalla, en un renglón. Sin esto, un bloque de
          proveedor con obras adentro y tildes por todos lados no dice por sí
          solo qué se espera que hagas. */}
      {materiales.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
          padding: "8px 13px", borderRadius: 11,
          background: C.panel, border: `1px solid ${C.border}`,
          fontSize: 11.5, color: C.dim, lineHeight: 1.5,
        }}>
          <Truck size={13} color={C.violet} style={{ flexShrink: 0 }} />
          <span>
            Cada bloque es <b style={{ color: C.muted, fontWeight: 750 }}>un proveedor</b> con todo lo que le falta comprar.
            Destildá lo que no va y tocá <b style={{ color: C.muted, fontWeight: 750 }}>Generar pedido</b>:
            sale <b style={{ color: C.muted, fontWeight: 750 }}>un solo pedido</b>, aunque junte materiales de varias obras.
            Compras recibe el aviso al instante.
          </span>
        </div>
      )}

      {sinMateriales.length > 0 && (
        <div
          style={{
            display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 13px",
            borderRadius: 13, border: "1px solid var(--red-border)", background: "var(--red-soft)",
          }}
        >
          <AlertTriangle size={17} color={C.red} style={{ marginTop: 1, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 900, color: C.red }}>
              {sinMateriales.length} {sinMateriales.length === 1 ? "etapa vencida no tiene" : "etapas vencidas no tienen"} materiales cargados
            </div>
            <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sinMateriales.map((etapa) => (
                <Pill key={etapa.id} color={C.red} soft="var(--panel-solid)" borde="var(--red-border)">
                  {etapa.obra_codigo} · {etapa.nombre}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      )}

      {cargando && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, color: C.dim, fontSize: 13 }}>
          <Loader2 size={16} className="spin" /> Revisando materiales y pedidos…
        </div>
      )}

      {!cargando && materiales.length === 0 && (
        <EmptyState
          icon={CheckSquare2}
          title="No hay materiales pendientes de pedido"
          subtitle="Los materiales ya incluidos en pedidos vigentes desaparecen de esta vista. Las etapas vencidas sin materiales permanecen señaladas arriba."
          accent="#10b981"
        />
      )}

      {!cargando && materiales.length > 0 && proveedores.length === 0 && (
        <EmptyState icon={Search} title="Sin resultados" subtitle="No hay proveedores, obras o materiales que coincidan con la búsqueda." />
      )}

      {!cargando && proveedores.map((grupo) => (
        <ProveedorBloque
          key={grupo.proveedor}
          grupo={grupo}
          toast={toast}
          onCreado={async () => {
            await cargar();
            onPedidoGenerado?.();
          }}
        />
      ))}
    </div>
  );
}
