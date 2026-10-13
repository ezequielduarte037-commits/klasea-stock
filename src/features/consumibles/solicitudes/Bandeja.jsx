import { Link } from "react-router-dom";
import { Clock3, FilePlus2, Inbox, LoaderCircle, RefreshCw, Search, Smartphone, FileText, TriangleAlert, Zap } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import {
  ESTADO_TEXTO, GRUPOS, destinoSolicitud, etiquetaOrigen, fechaHoraCorta, llegoTarde, resumenItems, textoRetiro,
} from "./solicitudesLogica";

const TONO_ESTADO = { enviada: "is-violeta", preparando: "is-cian", listo: "is-azul", entregado: "is-verde", cancelado: "is-rojo" };

const VACIOS = {
  preparar: { titulo: "Nada para preparar", texto: "Las listas del celular y los papeles cargados aparecen acá." },
  listas: { titulo: "Ninguna lista para retirar", texto: "Cuando termines de preparar una, pasala a lista para retirar." },
  entregadas: { titulo: "Sin entregas en los últimos 7 días", texto: "Buscá por número, nombre u obra para ver las anteriores." },
  todas: { titulo: "Sin solicitudes", texto: "Cargá un papel con «Nueva» o esperá las del celular." },
};

/**
 * La bandeja de la sede: grupos con contador, buscador y tarjetas. Las que no
 * tienen sede van arriba, aparte, para asignarlas (sin sede no se entregan).
 */
export default function Bandeja({
  bandeja, grupo, onGrupo, busqueda, onBusqueda, buscandoHistorial, seleccion, onElegir, onNueva, onAsignarSede,
  asignando, cargando, error, onReintentar, hoyIso, sede, puedeOperar, inerte = false,
}) {
  const lista = bandeja.grupos[grupo] ?? [];
  const vacio = VACIOS[grupo];

  return (
    <aside className="sol-bandeja" aria-label="Bandeja de solicitudes" inert={inerte || undefined} aria-hidden={inerte || undefined}>
      <div className="sol-bandeja-cab">
        <div className="sol-fila">
          <div className="sol-buscar">
            <Search size={15} aria-hidden="true" />
            <input
              className="ui-input"
              type="search"
              value={busqueda}
              onChange={(e) => onBusqueda(e.target.value)}
              placeholder="N°, nombre, obra o tarea"
              aria-label="Buscar solicitudes"
            />
          </div>
          {puedeOperar ? (
            <button type="button" className="ui-btn ui-btn-primario" style={{ minHeight: 44 }} onClick={onNueva} title="Cargar un papel">
              <FilePlus2 size={16} /> Nueva
            </button>
          ) : null}
        </div>
        <div className="sol-grupos" role="tablist" aria-label="Grupos de solicitudes">
          {GRUPOS.map((g) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={grupo === g.key}
              className={`sol-grupo${grupo === g.key ? " is-activo" : ""}`}
              onClick={() => onGrupo(g.key)}
            >
              {g.label}
              <span className="sol-num">{bandeja.contadores[g.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sol-lista">
        {cargando ? (
          <Cargando compacto texto="Trayendo las solicitudes…" />
        ) : error ? (
          <div className="sol-vacio">
            <strong>No se pudo traer la bandeja</strong>
            <p style={{ margin: "0 0 12px" }}>{error}</p>
            <button type="button" className="ui-btn" style={{ minHeight: 44 }} onClick={onReintentar}><RefreshCw size={15} /> Reintentar</button>
          </div>
        ) : (
          <>
            {bandeja.sinSede.length ? (
              <>
                <div className="sol-seccion-titulo is-violeta"><TriangleAlert size={13} /> Sin sede · para asignar</div>
                {bandeja.sinSede.map((s) => (
                  <Tarjeta key={s.id} s={s} hoyIso={hoyIso} elegida={seleccion === s.id} onElegir={onElegir}>
                    {puedeOperar ? (
                      <div className="sol-tarjeta-asignar">
                        <button type="button" className="ui-btn ui-btn-suave" style={{ minHeight: 44 }} disabled={asignando === s.id} onClick={() => onAsignarSede(s, sede)}>
                          {asignando === s.id ? <LoaderCircle size={15} className="sol-gira" /> : null} Es de {sede}
                        </button>
                      </div>
                    ) : null}
                  </Tarjeta>
                ))}
                <div className="sol-seccion-titulo">{GRUPOS.find((g) => g.key === grupo)?.label} · {sede}</div>
              </>
            ) : null}

            {lista.length ? (
              lista.map((s) => (
                <Tarjeta key={s.id} s={s} hoyIso={hoyIso} elegida={seleccion === s.id} onElegir={onElegir} conEstado={grupo === "todas" || grupo === "preparar"} />
              ))
            ) : (
              <div className="sol-vacio">
                <Inbox size={26} style={{ color: "var(--dim)", marginBottom: 8 }} aria-hidden="true" />
                <strong>{busqueda.trim() ? "Nada coincide" : vacio.titulo}</strong>
                {busqueda.trim() ? (buscandoHistorial ? "Buscando en el historial…" : "Probá con otro número, nombre u obra.") : vacio.texto}
              </div>
            )}
            {busqueda.trim() && buscandoHistorial && lista.length ? <Cargando compacto texto="Buscando también en el historial…" /> : null}
          </>
        )}
      </div>
    </aside>
  );
}

function Tarjeta({ s, hoyIso, elegida, onElegir, conEstado = false, children }) {
  const r = resumenItems(s.items ?? []);
  const cerrada = s.estado === "entregado" || s.estado === "cancelado";
  const retiro = textoRetiro(s.fecha_retiro, hoyIso, { cerrada });
  const tarde = !cerrada && llegoTarde(s);
  const otroRetira = s.retira && s.retira.trim().toLowerCase() !== String(s.solicita ?? "").trim().toLowerCase();
  const OrigenIcono = s.origen === "digital" ? Smartphone : FileText;

  return (
    <div className={`sol-tarjeta${elegida ? " is-elegida" : ""}${s.prioridad === "urgente" && !cerrada ? " is-urgente" : ""}`}>
      <button type="button" className="sol-tarjeta-btn" aria-current={elegida ? "true" : undefined} onClick={() => onElegir(s.id)}>
        <span className="sol-tarjeta-cab">
          <span className="sol-tarjeta-n">N° {s.numero}</span>
          <span className="sol-tarjeta-destino">{destinoSolicitud(s)}</span>
          <span style={{ flex: 1 }} />
          {s.prioridad === "urgente" && !cerrada ? <span className="sol-tag is-rojo"><Zap size={11} /> urgente</span> : null}
          {conEstado ? <span className={`sol-tag ${TONO_ESTADO[s.estado] ?? ""}`}>{ESTADO_TEXTO[s.estado] ?? s.estado}</span> : null}
        </span>
        <span className="sol-tarjeta-quien">
          {s.estado === "entregado"
            ? `Entregada a ${s.retirado_por_nombre || "—"}${s.retirado_at ? ` · ${fechaHoraCorta(s.retirado_at)}` : ""}`
            : [s.solicita ? `Solicita ${s.solicita}` : null, otroRetira ? `retira ${s.retira}` : null].filter(Boolean).join(" · ") || "Sin nombre"}
        </span>
        <span className="sol-tarjeta-pie">
          <span><span className="sol-num">{r.total}</span> {r.total === 1 ? "renglón" : "renglones"}</span>
          {!cerrada && r.total && s.estado !== "enviada" ? (
            <span className="sol-avance" title={`${r.listos} de ${r.total} listos`}>
              <i><b style={{ width: `${Math.round((r.listos / r.total) * 100)}%` }} /></i>
              <span className="sol-num">{r.listos}/{r.total}</span>
            </span>
          ) : null}
          <span className={`sol-retiro is-${retiro.tono}`}>{retiro.texto}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><OrigenIcono size={12} aria-hidden="true" />{etiquetaOrigen(s.origen)}</span>
          {tarde ? <span className="sol-tag is-cian"><Clock3 size={11} /> llegó después de las 15</span> : null}
          {r.libres && !cerrada ? <span className="sol-tag is-violeta">{r.libres} a mano</span> : null}
        </span>
      </button>
      {r.deObra ? (
        <div className="sol-tarjeta-obra">
          <TriangleAlert size={14} aria-hidden="true" />
          <span>Trae materiales de obra: se entregan desde <Link to="/solicitudes-panol">Solicitudes de materiales</Link></span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
