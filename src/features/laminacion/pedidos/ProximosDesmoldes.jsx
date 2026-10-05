import { useMemo, useState } from "react";
import { CalendarClock, ClipboardList } from "lucide-react";
import { agruparPorOrden, buscarObra, claveObra, desmoldeDe, esDeObra, diasHasta, fmtFecha, textoDias } from "../obras";
import { Bloque, Estado, Vacio } from "../ui";

// Las obras que vienen, ordenadas por desmolde, con el estado de su pedido de
// laminación. Las fechas salen de Obras (antes había una tabla propia de
// barcos con fechas cargadas aparte, que no coincidían).
export default function ProximosDesmoldes({ obras, pedidos, destinoActual, puedeGestionar, onArmar }) {
  const [filtro, setFiltro] = useState("proximos");

  // Pedidos vigentes por obra: sin los archivados ni los cancelados.
  const pedidosPorObra = useMemo(() => {
    const map = new Map();
    for (const p of pedidos) {
      if (p.archivado_at || p.estado === "cancelado") continue;
      const clave = buscarObra(obras, p.obra_destino)?.clave ?? claveObra(p.obra_destino);
      if (!clave) continue;
      if (!map.has(clave)) map.set(clave, []);
      map.get(clave).push(p);
    }
    return map;
  }, [pedidos, obras]);

  const filas = useMemo(() => obras
    .filter((o) => o.estado !== "terminada")
    .map((o) => {
      const fecha = desmoldeDe(o);
      const dias = diasHasta(fecha);
      const items = pedidosPorObra.get(o.clave) ?? [];
      const ordenes = agruparPorOrden(items);
      const pendientes = items.filter((p) => p.estado === "pendiente").length;
      const estadoPedido = !items.length ? "sin" : pendientes ? "curso" : "recibido";
      return { obra: o, fecha, dias, items, ordenes, pendientes, estadoPedido };
    })
    .sort((a, b) => {
      if (a.fecha && b.fecha) return a.fecha.localeCompare(b.fecha);
      if (a.fecha) return -1;
      if (b.fecha) return 1;
      return a.obra.codigo.localeCompare(b.obra.codigo, "es", { numeric: true });
    }), [obras, pedidosPorObra]);

  const proximas = filas.filter((f) => f.fecha && f.dias >= -30 && f.dias <= 120);
  const sinPedido = filas.filter((f) => f.fecha && f.dias >= -30 && f.estadoPedido === "sin");
  const visibles = filtro === "proximos" ? proximas : filtro === "sin" ? sinPedido : filas;

  return (
    <Bloque
      icono={CalendarClock}
      tono="cian"
      titulo="Próximos desmoldes"
      texto="Fechas de Obras y cómo está el pedido de laminación de cada barco."
      der={(
        <div className="lam-scroll-x">
          {[["proximos", "Próximos 4 meses", proximas.length], ["sin", "Sin pedido", sinPedido.length], ["todas", "Todas en curso", filas.length]].map(([k, label, n]) => (
            <button key={k} type="button" className={`lam-chip${filtro === k ? " on" : ""}`} data-tono={k === "sin" ? "violeta" : undefined} onClick={() => setFiltro(k)}>
              {k === "sin" && <span className="pto" />} {label} <span className="n">{n}</span>
            </button>
          ))}
        </div>
      )}
      sinPad
    >
      {!visibles.length ? (
        <Vacio
          icono={CalendarClock}
          titulo={filtro === "sin" ? "Todas las obras próximas tienen pedido" : "Sin desmoldes en este rango"}
          texto={filtro === "proximos" ? "Las fechas se cargan en Obras: cuando una obra tenga desmolde, aparece acá." : undefined}
        />
      ) : (
        <div className="lam-desm">
          {visibles.map((f, i) => {
            const { obra, fecha, dias } = f;
            const ultima = f.ordenes[0];
            const tonoDias = !fecha ? "neutro" : dias < 0 ? "neutro" : f.estadoPedido === "sin" && dias <= 45 ? "violeta" : "azul";
            const enFoco = esDeObra(obra, destinoActual);
            return (
              <div key={obra.clave} className={`lam-desm-fila${enFoco ? " foco" : ""}`} style={{ "--i": Math.min(i, 12) }}>
                <div className="lam-desm-fecha" data-tono={tonoDias}>
                  <span className="d">{fecha ? fmtFecha(fecha) : "—"}</span>
                  <span className="r">
                    {!fecha ? "sin fecha" : dias < 0 ? (obra.desmoldeReal ? `desmoldó ${textoDias(dias)}` : `estimado ${textoDias(dias)}`) : textoDias(dias)}
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="lam-desm-obra">
                    <span className="cod">{obra.codigo}</span>
                    <span className="lam-ayuda">{obra.lineaLabel}{obra.estado === "pausada" ? " · pausada" : ""}{obra.botada ? ` · botada ${fmtFecha(obra.botada)}` : ""}</span>
                    {f.estadoPedido === "sin" && <Estado tono="violeta">Sin pedido</Estado>}
                    {f.estadoPedido === "curso" && <Estado tono="azul">Pedido · faltan recibir {f.pendientes} de {f.items.length}</Estado>}
                    {f.estadoPedido === "recibido" && <Estado tono="verde">Material recibido</Estado>}
                  </div>
                  <div className="lam-desm-ped">
                    {ultima
                      ? <>Última orden <span className="mono">{ultima.ref.startsWith("__manual_") ? "manual" : ultima.ref}</span> del {fmtFecha(ultima.createdAt)}{f.ordenes.length > 1 ? ` · ${f.ordenes.length} órdenes` : ""}</>
                      : obra.desmoldeReal ? "Desmolde confirmado en Obras" : fecha ? "Fecha estimada en Obras" : "Cargá la fecha de desmolde en Obras"}
                  </div>
                </div>
                {puedeGestionar && (
                  <button type="button" className={`ui-btn chico${f.estadoPedido === "sin" ? " ui-btn-suave" : " ui-btn-fantasma"}`} onClick={() => onArmar(obra)}>
                    <ClipboardList size={14} /> {f.estadoPedido === "sin" ? "Armar pedido" : "Pedir más"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Bloque>
  );
}
