import { useMemo, useState } from "react";
import { LoaderCircle, Search, TriangleAlert, X } from "lucide-react";
import CampoTexto from "./CampoTexto";
import { buscarEnCatalogo } from "./mostradorLogica";
import { FotoItem } from "./Piezas";

/**
 * Un código que el sistema no conoce. Se elige de qué consumible es y queda
 * vinculado para siempre (`vincularCodigo`): con 40 de 222 consumibles con
 * código, el índice se completa solo a fuerza de usar el mostrador.
 * También se puede descartar (una etiqueta vieja, un código de otra cosa).
 */
export default function CodigoDesconocido({ codigo, catalogo = [], popularidad, onVincular, onDescartar, onRafaga }) {
  const [buscar, setBuscar] = useState("");
  const [vinculando, setVinculando] = useState(null);

  const candidatos = useMemo(() => {
    if (buscar.trim()) return buscarEnCatalogo(catalogo, buscar, { max: 40, popularidad });
    return catalogo.filter((i) => i.enMostrador !== false).slice(0, 40);
  }, [catalogo, buscar, popularidad]);

  async function elegir(item) {
    if (vinculando) return;
    setVinculando(item.id);
    try {
      await onVincular(item);
    } finally {
      setVinculando(null);
    }
  }

  return (
    <div className="mst-capa" onMouseDown={(e) => { if (e.target === e.currentTarget) onDescartar(); }}>
      <div className="mst-hoja" role="dialog" aria-modal="true" aria-label="Código sin cargar" onKeyDown={(e) => { if (e.key === "Escape") onDescartar(); }}>
        <div className="mst-hoja-cab">
          <TriangleAlert size={19} aria-hidden="true" style={{ color: "var(--violet)", marginTop: 2 }} />
          <div>
            <div className="mst-hoja-titulo">Este código no está cargado</div>
            <div className="mst-hoja-sub mst-num" style={{ color: "var(--text)", fontSize: 14 }}>{codigo}</div>
            <div className="mst-hoja-sub">Elegí de qué consumible es: queda vinculado y la próxima vez entra solo.</div>
          </div>
          <button type="button" className="mst-quitar" onClick={onDescartar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="mst-hoja-cuerpo" style={{ gap: 10 }}>
          <div style={{ position: "relative" }}>
            <Search size={15} aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--dim)" }} />
            <CampoTexto
              value={buscar}
              onChange={setBuscar}
              onRafaga={onRafaga}
              onEnter={(e) => { e.preventDefault(); if (candidatos[0] && buscar.trim()) elegir(candidatos[0]); }}
              placeholder="Buscar por nombre…"
              aria-label="Buscar el consumible"
              style={{ paddingLeft: 34 }}
              autoFocus
            />
          </div>
          <div className="mst-resultados" style={{ maxHeight: "46vh", overflowY: "auto" }}>
            {candidatos.length ? candidatos.map((item) => (
              <button key={item.id} type="button" className="mst-res" onClick={() => elegir(item)} disabled={Boolean(vinculando)}>
                <span className="mst-res-foto"><FotoItem item={item} /></span>
                <span className="mst-res-texto">
                  <span className="mst-res-nombre" style={{ display: "block" }}>{item.descripcion}</span>
                  <span className="mst-res-sub" style={{ display: "block" }}>{[item.rubro, item.unidad].filter(Boolean).join(" · ")}</span>
                </span>
                {vinculando === item.id ? <LoaderCircle size={16} className="mst-gira" /> : null}
              </button>
            )) : (
              <div className="mst-vacio">Ninguno coincide. Si es un consumible nuevo, lo da de alta Compras en Catálogo.</div>
            )}
          </div>
        </div>
        <div className="mst-hoja-pie">
          <button type="button" className="ui-btn" onClick={onDescartar}>Descartar el código</button>
        </div>
      </div>
    </div>
  );
}
