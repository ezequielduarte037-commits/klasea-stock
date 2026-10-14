import { useMemo, useState } from "react";
import { Check, ListPlus, Ship } from "lucide-react";
import { claveObra, desmoldeDe, diasHasta, fmtFecha, fmtNum, textoDias } from "@/features/laminacion/obras";
import { Bloque, Estado, Vacio } from "@/features/laminacion/ui";
import { obraDeCategoria } from "../datos";
import { etapaMuebles, listaDeObra, renglonesDeLista, sinMaderaTodavia } from "./listasMuebles";

// Los barcos que todavía no tienen pedido de maderas, con la lista estándar de
// su línea (la de Muebles). "Cargar lista" la pasa entera al pedido que se está
// armando: no hay que cargar renglón por renglón.
export default function BarcosPorPedir({ obras, pedidos, muebles, materiales, borrador, puedeGestionar, onCargar }) {
  const [filtro, setFiltro] = useState("por_pedir");

  // Pedidos de maderas hechos para cada obra (por renglón: un pedido puede
  // llevar varias obras y stock). Lo cancelado en Compras no cuenta: esa obra
  // vuelve a estar por pedir.
  const pedidosPorObra = useMemo(() => {
    const map = new Map();
    for (const p of pedidos) {
      for (const it of p.items) {
        if (it._cancelado) continue;
        const obra = obraDeCategoria(it.categoria);
        if (!obra) continue;
        const clave = claveObra(obra);
        if (!map.has(clave)) map.set(clave, new Map());
        map.get(clave).set(p.id, p);
      }
    }
    return map;
  }, [pedidos]);

  const enBorrador = useMemo(
    () => new Set(borrador.grupos.filter((g) => g.tipo === "obra" && g.items.length).map((g) => claveObra(g.obra))),
    [borrador],
  );

  // Las "solo stock" (Hunter, Antago) no las lleva Producción: no van acá.
  const filas = useMemo(() => obras
    .filter((o) => o.estado === "activa" && o.poId && !o.soloStock)
    .map((o) => {
      const lista = listaDeObra(o, muebles);
      if (!lista) return null;
      const hechos = [...(pedidosPorObra.get(o.clave)?.values() ?? [])];
      const fecha = desmoldeDe(o);
      return {
        obra: o,
        lista,
        renglones: renglonesDeLista(lista, materiales),
        hechos,
        pendiente: sinMaderaTodavia(o, lista.lote),
        etapa: etapaMuebles(lista.lote),
        fecha,
        dias: diasHasta(fecha),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Primero las que Muebles ya tiene en marcha; después por desmolde.
      if (Boolean(a.lista.lote) !== Boolean(b.lista.lote)) return a.lista.lote ? -1 : 1;
      if (a.fecha && b.fecha) return a.fecha.localeCompare(b.fecha);
      if (a.fecha) return -1;
      if (b.fecha) return 1;
      return a.obra.codigo.localeCompare(b.obra.codigo, "es", { numeric: true });
    }), [obras, muebles, materiales, pedidosPorObra]);

  const porPedir = filas.filter((f) => !f.hechos.length && f.pendiente);
  const sinPedido = filas.filter((f) => !f.hechos.length);
  const visibles = filtro === "por_pedir" ? porPedir : filtro === "sin" ? sinPedido : filas;

  return (
    <Bloque
      icono={Ship}
      tono="azul"
      titulo="Barcos que faltan pedir"
      texto="Obras sin pedido de maderas, con las placas y terciados estándar de su línea que usa Muebles (Plantillas OT). Cargalos enteros al pedido y ajustá lo que cambie."
      der={(
        <div className="lam-scroll-x">
          {[["por_pedir", "Por pedir", porPedir.length, "violeta"], ["sin", "Todas sin pedido", sinPedido.length], ["todas", "Todas", filas.length]].map(([k, label, n, tono]) => (
            <button key={k} type="button" className={`lam-chip${filtro === k ? " on" : ""}`} data-tono={tono} onClick={() => setFiltro(k)} aria-pressed={filtro === k}>
              {tono && <span className="pto" />} {label} <span className="n">{n}</span>
            </button>
          ))}
        </div>
      )}
      sinPad
    >
      {!visibles.length ? (
        <Vacio
          icono={Check}
          titulo={filtro === "por_pedir" ? "No hay barcos por pedir" : "Sin obras con lista de maderas"}
          texto={filtro === "por_pedir" ? "Todas las obras que vienen ya tienen su pedido, o Muebles ya usó la madera." : undefined}
        />
      ) : (
        <div className="lam-desm">
          {visibles.map((f, i) => {
            const { obra, fecha, dias } = f;
            const cargada = enBorrador.has(obra.clave);
            const ultimo = f.hechos[0];
            return (
              <div key={obra.clave} className={`lam-desm-fila${cargada ? " foco" : ""}`} style={{ "--i": Math.min(i, 12) }}>
                <div className="lam-desm-fecha" data-tono={!fecha || (dias != null && dias < 0) ? "neutro" : "azul"}>
                  <span className="d">{fecha ? fmtFecha(fecha) : "—"}</span>
                  <span className="r">{!fecha ? "sin desmolde" : obra.desmoldeReal ? `desmoldó ${textoDias(dias)}` : `desmolde ${textoDias(dias)}`}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="lam-desm-obra">
                    <span className="cod">{obra.codigo}</span>
                    <span className="lam-ayuda">{obra.lineaLabel}</span>
                    {f.etapa && <Estado tono={f.pendiente ? "violeta" : "neutro"} punto={false}>Muebles: {f.etapa}</Estado>}
                    {ultimo
                      ? <Estado tono="verde">Pedido el {fmtFecha(ultimo.fecha_pedido || ultimo.creado_en)}</Estado>
                      : f.pendiente && <Estado tono="violeta">Sin pedido</Estado>}
                  </div>
                  <div className="lam-desm-ped">
                    {f.renglones.map((r) => `${fmtNum(r.cantidad)} ${r.descripcion}`).join(" · ")}
                    <span style={{ color: "var(--subtle)" }}> — {f.lista.fuente}</span>
                  </div>
                </div>
                {puedeGestionar && (
                  cargada
                    ? <span className="lam-estado" data-tono="azul"><Check size={12} /> En el pedido</span>
                    : (
                      <button type="button" className={`ui-btn chico${f.hechos.length ? " ui-btn-fantasma" : " ui-btn-suave"}`} onClick={() => onCargar(obra, f.renglones)}>
                        <ListPlus size={14} /> {f.hechos.length ? "Pedir de nuevo" : "Cargar lista"}
                      </button>
                    )
                )}
              </div>
            );
          })}
        </div>
      )}
    </Bloque>
  );
}
