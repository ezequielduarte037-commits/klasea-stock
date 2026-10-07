import { useMemo, useState } from "react";
import { ChevronRight, Factory, Plus, Search } from "lucide-react";
import {
  ETAPAS, contarEtapas, datosPorConfirmar, enArchivo, motivoArchivo, processProgress, titularObra,
} from "../torneriaEstado";
import { Anillo, Tag, Vacio } from "../torneriaUi";
import ObraDetalle from "./ObraDetalle";

const ESTADO_PROCESO = {
  borrador: ["Borrador", "neutro"],
  pausado: ["Pausada", "violeta"],
};

// Dónde están las piezas de la obra, en una barra: cada tramo es una etapa.
const ORDEN_BARRA = ["terminado", "retirar", "taller", "enviar", "preparar", "compra", "comprar", "espera"];

function BarraEtapas({ piezas }) {
  const cuenta = contarEtapas(piezas);
  const total = piezas.length || 1;
  return (
    <div className="tor-av" style={{ height: 5, marginTop: 8 }} aria-hidden="true">
      {ORDEN_BARRA.filter((key) => cuenta[key] > 0).map((key) => (
        <i key={key} data-tono={key === "terminado" ? "verde" : ETAPAS[key].tono} style={{ width: `${(cuenta[key] / total) * 100}%`, opacity: key === "terminado" ? 0.55 : 1 }} />
      ))}
    </div>
  );
}

function TarjetaObra({ process, piezas, on, indice, onClick }) {
  const archivo = enArchivo(process);
  const titular = titularObra(process, piezas);
  const estado = ESTADO_PROCESO[process.estado];
  const porConfirmar = archivo ? 0 : datosPorConfirmar(process).length;
  const motivo = motivoArchivo(process);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={on ? "true" : undefined}
      className={`tor-item${on ? " on" : ""}${archivo ? " archivo" : ""}`}
      style={{ "--i": Math.min(indice, 12) }}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); }
      }}
    >
      <Anillo pct={processProgress(process)} size={44} />
      <div style={{ minWidth: 0 }}>
        <div className="tor-item-l1">
          <span className="tor-item-nom">{process.obra?.codigo || process.nombre}</span>
          <span className="tor-item-linea">{process.obra?.linea_nombre || "Sin línea"}</span>
          {estado && <Tag tono={estado[1]}>{estado[0]}</Tag>}
          {motivo === "terminada" && <Tag tono="verde">Terminada</Tag>}
          {motivo === "archivada" && <Tag>Archivada</Tag>}
          {motivo === "cancelada" && <Tag>Cancelada</Tag>}
        </div>
        <div className="tor-item-sub" data-tono={titular.tono}>{titular.texto}</div>
        {!archivo && piezas.length > 0 && <BarraEtapas piezas={piezas} />}
        {porConfirmar > 0 && (
          <div className="tor-item-tags">
            <Tag tono="cian">{porConfirmar} por confirmar</Tag>
          </div>
        )}
      </div>
      <ChevronRight size={17} className="tor-item-flecha" />
    </div>
  );
}

export default function Obras({
  processes,
  piezasDe,
  selected,
  onSelect,
  detalleAbierto,
  onVolver,
  onNuevo,
  isMobile,
  lista,
  setLista,
  seccion,
  setSeccion,
  acciones,
}) {
  const [linea, setLinea] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [soloConfirmar, setSoloConfirmar] = useState(false);

  const enCurso = useMemo(() => processes.filter((p) => !enArchivo(p)), [processes]);
  const terminadas = useMemo(() => processes.filter(enArchivo), [processes]);
  const base = lista === "archivo" ? terminadas : enCurso;
  const lineas = useMemo(() => {
    const mapa = new Map();
    base.forEach((p) => {
      const nombre = p.obra?.linea_nombre || "Sin línea";
      mapa.set(nombre, (mapa.get(nombre) || 0) + 1);
    });
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true }));
  }, [base]);
  const porConfirmar = enCurso.reduce((sum, p) => sum + datosPorConfirmar(p).length, 0);

  const term = busqueda.trim().toLowerCase();
  const visibles = base.filter((p) => {
    if (linea !== "todas" && (p.obra?.linea_nombre || "Sin línea") !== linea) return false;
    if (soloConfirmar && lista !== "archivo" && !datosPorConfirmar(p).length) return false;
    if (!term) return true;
    return `${p.obra?.codigo || ""} ${p.obra?.linea_nombre || ""} ${p.nombre || ""}`.toLowerCase().includes(term);
  });

  return (
    <>
      <header className="tor-barra">
        <div className="tor-barra-fila">
          <div className="tor-titulos">
            <div className="tor-eyebrow">Tornería · Seguimiento</div>
            <h1 className="tor-h1">Seguimiento por <span className="acento">obra</span></h1>
            <p className="tor-sub">
              <b>{enCurso.length}</b> en curso · <b>{terminadas.length}</b> terminadas
              {porConfirmar > 0 && <> · <b>{porConfirmar}</b> datos por confirmar</>}
            </p>
          </div>
          <div className="tor-acciones">
            <button type="button" className="ui-btn ui-btn-primario" onClick={onNuevo}>
              <Plus size={16} /> Nuevo seguimiento
            </button>
          </div>
        </div>
        <div className="tor-filtros">
          <div className="tor-seg" role="tablist" aria-label="Obras">
            <button type="button" role="tab" aria-selected={lista !== "archivo"} className={lista !== "archivo" ? "on" : ""} onClick={() => { setLista("curso"); setLinea("todas"); }}>
              En curso <span className="n">{enCurso.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={lista === "archivo"} className={lista === "archivo" ? "on" : ""} onClick={() => { setLista("archivo"); setLinea("todas"); }}>
              Terminadas <span className="n">{terminadas.length}</span>
            </button>
          </div>
          <div className="tor-scroll-x" role="group" aria-label="Línea">
            <button type="button" className={`tor-chip${linea === "todas" ? " on" : ""}`} onClick={() => setLinea("todas")}>
              Todas las líneas <span className="n">{base.length}</span>
            </button>
            {lineas.map(([nombre, n]) => (
              <button key={nombre} type="button" className={`tor-chip${linea === nombre ? " on" : ""}`} onClick={() => setLinea(linea === nombre ? "todas" : nombre)}>
                {nombre} <span className="n">{n}</span>
              </button>
            ))}
            {lista !== "archivo" && porConfirmar > 0 && (
              <button type="button" className={`tor-chip${soloConfirmar ? " on" : ""}`} data-tono="cian" onClick={() => setSoloConfirmar((v) => !v)}>
                <span className="pto" />Con datos por confirmar
              </button>
            )}
          </div>
          <span className="tor-sp tor-solo-escritorio" />
          <label className="tor-buscar">
            <Search size={15} />
            <input className="ui-input" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar obra…" aria-label="Buscar obra" />
          </label>
        </div>
      </header>

      <div className={`tor-dos${detalleAbierto && selected ? " con-detalle" : ""}`}>
        <div className="tor-lista">
          {!visibles.length ? (
            <Vacio
              icono={Factory}
              titulo={lista === "archivo" ? "Nada en Terminadas" : "Sin obras con ese filtro"}
              texto={lista === "archivo"
                ? "Cuando todo el circuito de una obra vuelve al astillero, pasa acá solo, sin hacer nada."
                : "Probá con otra línea o borrá la búsqueda."}
            />
          ) : visibles.map((process, i) => (
            <TarjetaObra
              key={process.id}
              process={process}
              piezas={piezasDe(process)}
              on={selected?.id === process.id}
              indice={i}
              onClick={() => onSelect(process.id)}
            />
          ))}
        </div>
        <div className="tor-detalle">
          {selected ? (
            <ObraDetalle
              process={selected}
              piezas={piezasDe(selected)}
              isMobile={isMobile}
              seccion={seccion}
              setSeccion={setSeccion}
              onVolver={onVolver}
              acciones={acciones}
            />
          ) : (
            <Vacio icono={Factory} titulo="Elegí una obra" texto="Su circuito, lo que toca hacer ahora y el historial aparecen acá." />
          )}
        </div>
      </div>
    </>
  );
}
