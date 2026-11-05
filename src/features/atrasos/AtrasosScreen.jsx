/**
 * Atrasos de hoy — todo lo que ya pasó su fecha, en un solo lugar.
 *
 * Seis áreas, cada una contada como en su pantalla de origen:
 *   compras de ítems estándar (calendario de Compras), pedidos a Compras
 *   vencidos, avisos de ingreso que el pañol no recibió, faltantes que reportó
 *   el pañol y nadie movió, obras atrasadas en su plan de producción, e hitos
 *   de Fechas (madera, vidrios, motor…) sin marcar.
 * Cada fila lleva a donde se resuelve. Los números viven en los indicadores de
 * arriba y no se repiten en los paneles.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ChartGantt, ClipboardX, PackageCheck, ShoppingCart, Truck } from "lucide-react";
import {
  ColumnasPortada, EnlacePortada, FilaPortada, Indicador, PanelPortada, Portada, PortadaHero, VacioPortada,
} from "@/components/ui/Portada";
import Cargando from "@/components/ui/Cargando";
import { fechaLarga } from "@/lib/saludo";
import { useObrasData } from "@/features/obras/produccion/useObrasData";
import {
  DIAS_AVISO_SIN_RECIBIR, DIAS_FALTANTE_SIN_MOVER, DIAS_HITO_MAXIMO, cargarAvisosSinRecibir, cargarComprasAtrasadas,
  cargarFaltantesSinMover, cargarHitosVencidos, cargarPedidosVencidos, obrasAtrasadas,
} from "./atrasosApi";

const FILAS_A_LA_VISTA = 6;

const ESTADOS_PEDIDO = {
  nuevo: "Nuevo", en_revision: "En revisión", cotizando: "Cotizando", aprobado: "Aprobado",
  comprado: "Comprado", parcial: "Parcial",
};

function dm(fecha) {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Más de dos semanas es urgente; menos, atención.
const tonoDias = (dias) => (dias > 14 ? "rojo" : "violeta");

/** Un área: carga sola, con su propio estado, para que la lenta no frene al resto. */
function useArea(cargar) {
  const [estado, setEstado] = useState({ filas: null, error: "" });
  useEffect(() => {
    let vivo = true;
    cargar()
      .then((filas) => { if (vivo) setEstado({ filas, error: "" }); })
      .catch((e) => { if (vivo) setEstado({ filas: [], error: e?.message || "No se pudo cargar." }); });
    return () => { vivo = false; };
  }, [cargar]);
  return estado;
}

function Area({ id, titulo, subtitulo, abrir, onAbrir, filas, error, cargandoTexto, vacio, renderFila }) {
  const [todas, setTodas] = useState(false);
  const visibles = filas ? (todas ? filas : filas.slice(0, FILAS_A_LA_VISTA)) : [];
  const resto = filas ? filas.length - visibles.length : 0;
  return (
    <div id={id} className="atr-area">
      <PanelPortada titulo={titulo} subtitulo={subtitulo} accion={onAbrir ? <EnlacePortada onClick={onAbrir}>{abrir}</EnlacePortada> : null}>
        {error ? (
          <div className="atr-error">{error}</div>
        ) : filas == null ? (
          <Cargando compacto texto={cargandoTexto} />
        ) : !filas.length ? (
          <VacioPortada Icono={PackageCheck} titulo="Nada atrasado" detalle={vacio} />
        ) : (
          <>
            {visibles.map(renderFila)}
            {(resto > 0 || todas) && filas.length > FILAS_A_LA_VISTA && (
              <button type="button" className="atr-mas" onClick={() => setTodas((v) => !v)}>
                {todas ? "Ver menos" : `Ver los otros ${resto}`}
              </button>
            )}
          </>
        )}
      </PanelPortada>
    </div>
  );
}

export default function AtrasosScreen() {
  const navigate = useNavigate();
  const compras = useArea(cargarComprasAtrasadas);
  const pedidos = useArea(cargarPedidosVencidos);
  const avisos = useArea(cargarAvisosSinRecibir);
  const faltantes = useArea(cargarFaltantesSinMover);
  const hitos = useArea(cargarHitosVencidos);
  const { obras, planes, loading: cargandoObras } = useObrasData();
  const produccion = useMemo(() => (cargandoObras ? null : obrasAtrasadas(obras, planes)), [cargandoObras, obras, planes]);

  const ir = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const total = [compras.filas, pedidos.filas, avisos.filas, faltantes.filas, produccion, hitos.filas];
  const listo = total.every((f) => f != null);
  const algo = total.reduce((n, f) => n + (f?.length || 0), 0);

  const kpi = (label, filas, area, tono = "rojo") => (
    <Indicador label={label} valor={filas?.length ?? 0} cargando={filas == null} tono={filas?.length ? tono : "verde"} destacar={!!filas?.length} onClick={() => ir(area)} />
  );

  return (
    <Portada>
      <style>{CSS}</style>
      <PortadaHero
        eyebrow={fechaLarga(new Date())}
        titulo="Lo que está"
        acento="atrasado"
        bajada={listo && !algo
          ? "Nada pasó su fecha en compras, pañol ni producción."
          : "Compras, pañol y producción: todo lo que ya pasó su fecha, ordenado por cuántos días lleva. Cada fila te lleva a donde se resuelve."}
        indicadores={(
          <>
            {kpi("Compras estándar", compras.filas, "atr-compras")}
            {kpi("Pedidos vencidos", pedidos.filas, "atr-pedidos")}
            {kpi("Avisos sin recibir", avisos.filas, "atr-avisos", "violeta")}
            {kpi("Faltantes del pañol", faltantes.filas, "atr-faltantes", "violeta")}
            {kpi("Obras atrasadas", produccion, "atr-obras")}
            {kpi("Hitos de fechas", hitos.filas, "atr-hitos", "violeta")}
          </>
        )}
      />

      <ColumnasPortada>
        <div className="atr-col">
          <Area
            id="atr-compras"
            titulo="Compras de ítems estándar"
            subtitulo="Pedidos de cada proveedor para cada barco cuya semana de compra ya pasó"
            abrir="Abrir calendario"
            onAbrir={() => navigate("/compras?tab=calendario")}
            {...compras}
            cargandoTexto="Armando los pedidos con la lista de cada obra…"
            vacio="Todo lo de la matriz está comprado o tiene fecha más adelante."
            renderFila={(f) => (
              <FilaPortada
                key={f.clave}
                Icono={Truck}
                titulo={`${f.proveedor} · ${f.obra}`}
                detalle={`${f.items} ${f.items === 1 ? "ítem" : "ítems"} · había que comprarlo el ${dm(f.desde)}${f.sinProveedor ? " · sin proveedor en la ficha" : ""}`}
                valor={f.dias}
                valorLabel="días"
                tono={tonoDias(f.dias)}
                alerta={f.dias > 30}
                onClick={() => navigate("/compras?tab=calendario")}
              />
            )}
          />
          <Area
            id="atr-pedidos"
            titulo="Pedidos a Compras vencidos"
            subtitulo="Abiertos y con la fecha de entrega (o de necesidad) ya pasada"
            abrir="Abrir pedidos"
            onAbrir={() => navigate("/compras?tab=lista")}
            {...pedidos}
            cargandoTexto="Buscando pedidos vencidos…"
            vacio="Ningún pedido abierto pasó su fecha."
            renderFila={(f) => (
              <FilaPortada
                key={f.id}
                Icono={ShoppingCart}
                titulo={f.titulo}
                detalle={[f.destino, ESTADOS_PEDIDO[f.estado] || f.estado, f.pidio && `pidió ${f.pidio}`, `${f.porEntrega ? "llegaba" : "se necesitaba"} el ${dm(f.desde)}`].filter(Boolean).join(" · ")}
                valor={f.dias}
                valorLabel="días"
                tono={tonoDias(f.dias)}
                alerta={f.dias > 30}
                onClick={() => navigate(`/compras?tab=lista&open=${f.id}`)}
              />
            )}
          />
          <Area
            id="atr-obras"
            titulo="Obras atrasadas en producción"
            subtitulo="La primera etapa sin terminar ya tendría que estar lista"
            abrir="Abrir obras"
            onAbrir={() => navigate("/obras")}
            filas={produccion}
            error=""
            cargandoTexto="Calculando el plan de cada obra…"
            vacio="Todas las obras van al día con su plan."
            renderFila={(f) => (
              <FilaPortada
                key={f.id}
                Icono={ChartGantt}
                titulo={`${f.obra} · ${f.etapa}`}
                detalle={`tenía que terminar el ${dm(f.desde)}${f.estimado ? " · fecha estimada: la etapa no tiene semana en el recorrido" : ""}`}
                valor={f.dias}
                valorLabel="días"
                tono={f.estimado ? "cian" : tonoDias(f.dias)}
                alerta={!f.estimado && f.dias > 30}
                onClick={() => navigate(`/obras?obra=${f.id}`)}
              />
            )}
          />
        </div>
        <div className="atr-col">
          <Area
            id="atr-avisos"
            titulo="Avisos de ingreso sin recibir"
            subtitulo={`Material avisado al pañol hace más de ${DIAS_AVISO_SIN_RECIBIR} días que todavía no se recibió`}
            abrir="Abrir recepción"
            onAbrir={() => navigate("/recepcion-panol")}
            {...avisos}
            cargandoTexto="Buscando avisos pendientes…"
            vacio="El pañol recibió todo lo avisado."
            renderFila={(f) => (
              <FilaPortada
                key={f.id}
                Icono={PackageCheck}
                titulo={f.titulo}
                detalle={[f.obra, f.sede, f.parcial ? "recibido en parte" : "sin recibir", `avisado el ${dm(f.desde)}`].filter(Boolean).join(" · ")}
                valor={f.dias}
                valorLabel="días"
                tono={tonoDias(f.dias)}
                onClick={() => navigate(`/recepcion-panol?envio=${f.id}`)}
              />
            )}
          />
          <Area
            id="atr-faltantes"
            titulo="Faltantes que reportó el pañol"
            subtitulo={`Nuevos hace más de ${DIAS_FALTANTE_SIN_MOVER} días: nadie los pasó a revisión ni los pidió`}
            abrir="Abrir faltantes"
            onAbrir={() => navigate("/compras?tab=faltantes")}
            {...faltantes}
            cargandoTexto="Buscando faltantes…"
            vacio="Compras ya tomó todo lo que reportó el pañol."
            renderFila={(f) => (
              <FilaPortada
                key={f.id}
                Icono={ClipboardX}
                titulo={f.titulo}
                detalle={[f.cantidad ? `faltan ${f.cantidad} ${f.unidad}`.trim() : "", f.obra, f.sede, `reportado el ${dm(f.desde)}`].filter(Boolean).join(" · ")}
                valor={f.dias}
                valorLabel="días"
                tono={tonoDias(f.dias)}
                onClick={() => navigate("/compras?tab=faltantes")}
              />
            )}
          />
          <Area
            id="atr-hitos"
            titulo="Hitos de fechas sin marcar"
            subtitulo={`Madera, vidrios, motor, tanques… vencidos en los últimos ${DIAS_HITO_MAXIMO} días y sin marcar pedidos ni hechos`}
            abrir="Abrir fechas"
            onAbrir={() => navigate("/obras")}
            {...hitos}
            cargandoTexto="Calculando los hitos de cada obra…"
            vacio="Los hitos vencidos están todos marcados."
            renderFila={(f) => (
              <FilaPortada
                key={f.clave}
                Icono={CalendarClock}
                titulo={`${f.hito} · ${f.obra}`}
                detalle={`era el ${dm(f.desde)}`}
                valor={f.dias}
                valorLabel="días"
                tono={tonoDias(f.dias)}
                onClick={() => navigate("/obras")}
              />
            )}
          />
        </div>
      </ColumnasPortada>
    </Portada>
  );
}

const CSS = `
  .pt .atr-col { display: grid; gap: 12px; align-content: start; min-width: 0; }
  .pt .atr-area { min-width: 0; scroll-margin-top: 16px; }
  .pt .atr-mas {
    width: 100%; min-height: 40px; border: 0; border-top: 1px solid var(--border);
    background: transparent; color: var(--blue); font: inherit; font-size: 13px; font-weight: 600;
  }
  .pt .atr-mas:hover { background: var(--blue-soft); }
  .pt .atr-error { padding: 16px; color: var(--red); font-size: 13px; }
  .pt .pt-indicadores { grid-auto-columns: minmax(118px, 1fr); }
  @media (max-width: 1280px) and (min-width: 900px) {
    .pt .pt-indicadores { grid-auto-flow: row; grid-template-columns: repeat(3, minmax(118px, 1fr)); }
  }
  @media (max-width: 899px) {
    .pt .pt-indicadores[data-cantidad="6"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
`;
