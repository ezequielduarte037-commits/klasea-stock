/**
 * MemoriaVivaScreen — la memoria descriptiva de cada barco conectada con lo que
 * pasa con sus materiales: si está en la matriz de la línea, si se compró, si
 * llegó al pañol y si ya está a bordo.
 *
 * Arriba, el perfil del barco con sus zonas pintadas según a qué etapa llegaron.
 * Abajo, cada campo de la memoria con su recorrido y los materiales que le
 * corresponden, y al costado los cruces: lo que no cierra entre la memoria y la
 * obra real (equipos marcados que no están en ningún lado, materiales que la
 * memoria no menciona, campos que la plantilla de la línea no tiene).
 *
 * Beta: los vínculos se sugieren por nombre (memoriaViva.js). La migración
 * 20260917130000_memoria_viva.sql agrega las tablas para confirmarlos.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BookOpenText,
  ChevronDown,
  CircleOff,
  PackageSearch,
  RefreshCw,
  Search,
  Ship,
  Wrench,
  X,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Cargando from "@/components/ui/Cargando";
import { useResponsive } from "@/hooks/useResponsive";
import FondoOleaje from "@/components/ui/FondoOleaje";
import { AnimatedNumber } from "@/components/ui/motion";
import BarcoPerfil from "./BarcoPerfil";
import {
  ETAPAS,
  ZONAS,
  camposDeLinea,
  cruzarObra,
  estaDefinido,
  indiceEtapa,
  lineaDeObra,
  memoriaDeObra,
  tonoDeZona,
} from "./memoriaViva";
import { fetchMatrizLinea, fetchMemorias, fetchObrasActivas, fetchRenglonesObra } from "./memoriaVivaApi";

const TONOS = {
  neutro: "var(--muted)",
  cian: "var(--cyan)",
  violeta: "var(--violet)",
  azul: "var(--blue)",
  verde: "var(--green)",
};
const ETAPA_POR_KEY = Object.fromEntries(ETAPAS.map((etapa) => [etapa.key, etapa]));

const CRUCE_META = {
  falta: { titulo: "Falta en los materiales", color: "var(--violet)" },
  sobra: { titulo: "No está en la memoria", color: "var(--cyan)" },
  fuera: { titulo: "La plantilla no lo tiene", color: "var(--blue)" },
};

function completitudRapida(obra, memorias) {
  const memoria = memoriaDeObra(obra, memorias);
  const campos = camposDeLinea(obra);
  const definidos = campos.filter((campo) => estaDefinido(memoria[campo.key])).length;
  return campos.length ? Math.round((definidos / campos.length) * 100) : 0;
}

function textoValor(item) {
  if (item.tipo === "toggle") return item.valor === true ? "Sí" : "No";
  return String(item.valor ?? "").trim();
}

export default function MemoriaVivaScreen() {
  const navigate = useNavigate();
  const { isMobile } = useResponsive();
  const [params, setParams] = useSearchParams();
  const [obras, setObras] = useState(null);
  const [memorias, setMemorias] = useState({});
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [datos, setDatos] = useState({ obraId: null, matriz: [], renglones: [], cargando: false });
  const [zonaActiva, setZonaActiva] = useState(null);
  const [zonaResaltada, setZonaResaltada] = useState(null);
  const [etapaFiltro, setEtapaFiltro] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([fetchObrasActivas(), fetchMemorias()])
      .then(([listaObras, listaMemorias]) => {
        if (!vivo) return;
        setObras(listaObras);
        setMemorias(listaMemorias || {});
      })
      .catch((falla) => { if (vivo) setError(falla?.message || "No se pudieron cargar los barcos."); });
    return () => { vivo = false; };
  }, [recarga]);

  // Barcos con memoria primero, después el resto; cada uno con su avance.
  const barcos = useMemo(() => (obras || [])
    .map((obra) => ({ obra, pct: completitudRapida(obra, memorias) }))
    .sort((a, b) => (b.pct > 0) - (a.pct > 0) || String(a.obra.codigo).localeCompare(String(b.obra.codigo), "es", { numeric: true })),
  [obras, memorias]);

  const codigoPedido = params.get("obra");
  const barcoElegido = barcos.find(({ obra }) => obra.codigo === codigoPedido) || barcos[0] || null;
  const obra = barcoElegido?.obra || null;

  useEffect(() => {
    if (!obra) return undefined;
    let vivo = true;
    const linea = lineaDeObra(obra);
    Promise.resolve()
      .then(() => { if (vivo) setDatos((actual) => ({ ...actual, obraId: obra.id, cargando: true })); })
      .then(() => Promise.all([fetchMatrizLinea(linea.numero), fetchRenglonesObra(obra.id)]))
      .then(([matriz, renglones]) => { if (vivo) setDatos({ obraId: obra.id, matriz, renglones, cargando: false }); })
      .catch((falla) => {
        if (!vivo) return;
        setDatos({ obraId: obra.id, matriz: [], renglones: [], cargando: false });
        setError(falla?.message || "No se pudieron cargar los materiales del barco.");
      });
    return () => { vivo = false; };
  }, [obra, recarga]);

  const listo = datos.obraId === obra?.id && !datos.cargando;
  const resultado = useMemo(() => {
    if (!obra) return null;
    const memoria = memoriaDeObra(obra, memorias);
    return {
      memoria,
      ...cruzarObra({ obra, memoria, matriz: listo ? datos.matriz : [], renglones: listo ? datos.renglones : [] }),
    };
  }, [obra, memorias, datos, listo]);

  const elegirBarco = (codigo) => {
    setZonaActiva(null);
    setEtapaFiltro(null);
    setBusqueda("");
    setParams((actual) => {
      const siguiente = new URLSearchParams(actual);
      siguiente.set("obra", codigo);
      return siguiente;
    }, { replace: true });
  };

  const termino = busqueda.trim().toLowerCase();
  const seguidos = (resultado?.items || []).filter((item) => item.zona !== "general");
  const visibles = seguidos.filter((item) => {
    if (zonaActiva && item.zona !== zonaActiva) return false;
    if (etapaFiltro && item.etapa !== etapaFiltro) return false;
    if (!termino) return true;
    const materiales = [...item.enObra.map((grupo) => grupo.descripcion), ...item.enMatriz.map((fila) => fila.descripcion)];
    return [item.label, textoValor(item), ...materiales].some((texto) => String(texto || "").toLowerCase().includes(termino));
  });
  const grupos = ZONAS
    .map((zona) => ({ ...zona, items: visibles.filter((item) => item.zona === zona.key) }))
    .filter((zona) => zona.items.length);

  if (error && !obras) {
    return (
      <div className="mv">
        <style href="klasea-memoria-viva" precedence="default">{CSS}</style>
        <div className="mv-error">
          <AlertTriangle size={22} />
          <strong>No se pudo abrir Memoria viva</strong>
          <span>{error}</span>
          <button type="button" className="ui-btn" onClick={() => { setError(""); setRecarga((n) => n + 1); }}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mv">
      <style href="klasea-memoria-viva" precedence="default">{CSS}</style>
      <PageHeader
        icon={Ship}
        eyebrow="Producción · Beta"
        title="Memoria viva"
        subtitle="Lo que pidió el cliente, conectado con la matriz, las compras y el pañol."
        actions={(
          <>
            <button type="button" className="ui-btn" onClick={() => navigate("/memorias")}>
              <BookOpenText size={15} /> Vista clásica
            </button>
            <button type="button" className="ui-btn ui-btn-icono" onClick={() => setRecarga((n) => n + 1)} title="Actualizar" aria-label="Actualizar">
              <RefreshCw size={15} />
            </button>
          </>
        )}
      >
        <div className="mv-barcos" role="tablist" aria-label="Barcos">
          {obras === null && <Cargando compacto texto="Buscando barcos…" />}
          {barcos.map(({ obra: barco, pct }) => {
            const activo = barco.id === obra?.id;
            return (
              <button
                key={barco.id}
                type="button"
                role="tab"
                aria-selected={activo}
                className={`mv-barco${activo ? " is-activo" : ""}${pct === 0 ? " is-vacio" : ""}`}
                onClick={() => elegirBarco(barco.codigo)}
                title={pct ? `Memoria ${pct}% completa` : "Sin memoria cargada"}
              >
                <svg className="mv-anillo" viewBox="0 0 20 20" aria-hidden="true">
                  <circle cx="10" cy="10" r="8" />
                  <circle cx="10" cy="10" r="8" pathLength="100" style={{ strokeDashoffset: 100 - pct }} />
                </svg>
                <span className="mv-barco-codigo">{barco.codigo}</span>
                <span className="mv-barco-linea">{lineaDeObra(barco).nombre}</span>
              </button>
            );
          })}
        </div>
      </PageHeader>

      {obra && resultado && (
        <main className="mv-cuerpo">
          <section className="mv-escena">
            <div className="mv-escena-datos">
              <div className="mv-eyebrow">{lineaDeObra(obra).nombre} · {obra.estado === "activa" ? "En producción" : obra.estado}</div>
              <h2 className="mv-codigo">{obra.codigo}</h2>
              <div className="mv-dueno">{resultado.memoria.propietario || "Sin propietario cargado"}</div>
              <dl className="mv-ficha">
                {[
                  ["Constructor", resultado.memoria.constructor],
                  ["Cabina", resultado.memoria.cabina],
                  ["Motorización", resultado.memoria.motorizacion],
                ].map(([rotulo, valor]) => (
                  <div key={rotulo}>
                    <dt>{rotulo}</dt>
                    <dd className={valor ? "" : "is-vacio"}>{valor || "—"}</dd>
                  </div>
                ))}
              </dl>
              <div className="mv-completitud">
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="32" r="27" />
                  <circle cx="32" cy="32" r="27" pathLength="100" style={{ strokeDashoffset: 100 - resultado.completitud.pct }} />
                </svg>
                <div>
                  <strong><AnimatedNumber value={resultado.completitud.pct} />%</strong>
                  <span>{resultado.completitud.definidos} de {resultado.completitud.total} campos definidos</span>
                </div>
              </div>
              {resultado.memoria.adicionales && (
                <p className="mv-adicionales"><span>Adicionales</span>{resultado.memoria.adicionales}</p>
              )}
            </div>
            <div className="mv-perfil">
              <FondoOleaje className="mv-agua" horizonte={0.7} filas={16} alfa={0.5} pausaInactivo={20000} />
              <BarcoPerfil
                key={obra.id}
                porZona={resultado.porZona}
                zonaActiva={zonaActiva}
                zonaResaltada={zonaResaltada}
                onZona={setZonaActiva}
                onResaltar={setZonaResaltada}
                compacto={isMobile}
              />
              {!listo && <div className="mv-perfil-cargando"><Cargando compacto texto="Cruzando con la matriz y el pañol…" /></div>}
            </div>
            {/* En el celular las etiquetas del dibujo no se leen: las zonas van
                como chips debajo, y tocarlos filtra igual que tocar el barco. */}
            {isMobile && (
              <div className="mv-zonas-chips" role="group" aria-label="Zonas del barco">
                {ZONAS.filter((zona) => zona.key !== "general").map((zona) => {
                  const info = resultado.porZona[zona.key] || {};
                  const activa = zonaActiva === zona.key;
                  return (
                    <button
                      key={zona.key}
                      type="button"
                      className={`ui-chip mv-zona-chip${activa ? " is-activa" : ""}`}
                      style={{ "--c": TONOS[tonoDeZona(info)] }}
                      aria-pressed={activa}
                      onClick={() => setZonaActiva(activa ? null : zona.key)}
                    >
                      <span className="mv-zona-chip-punto" />
                      {zona.label}
                      <span className="mv-zona-chip-cuenta">{info.definidos || 0}/{info.total || 0}</span>
                      {info.cruces > 0 && <span className="mv-zona-chip-alerta" aria-label={`${info.cruces} cruces`} />}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mv-etapas" aria-label="Etapas">
            {ETAPAS.map((etapa) => {
              const activa = etapaFiltro === etapa.key;
              return (
                <button
                  key={etapa.key}
                  type="button"
                  className={`mv-etapa${activa ? " is-activa" : ""}`}
                  style={{ "--c": TONOS[etapa.tono] }}
                  aria-pressed={activa}
                  onClick={() => setEtapaFiltro(activa ? null : etapa.key)}
                >
                  <span className="mv-etapa-numero"><AnimatedNumber value={resultado.porEtapa[etapa.key] || 0} /></span>
                  <span className="mv-etapa-nombre">{etapa.label}</span>
                </button>
              );
            })}
          </section>

          <div className="mv-contenido">
            <section className="mv-lista">
              <div className="mv-filtros">
                <label className="mv-buscar">
                  <Search size={15} aria-hidden="true" />
                  <input
                    className="ui-input"
                    value={busqueda}
                    onChange={(evento) => setBusqueda(evento.target.value)}
                    placeholder="Buscar un campo, un valor o un material…"
                  />
                </label>
                {zonaActiva && (
                  <button type="button" className="ui-chip mv-filtro" onClick={() => setZonaActiva(null)}>
                    {ZONAS.find((zona) => zona.key === zonaActiva)?.label} <X size={13} />
                  </button>
                )}
                {etapaFiltro && (
                  <button type="button" className="ui-chip mv-filtro" onClick={() => setEtapaFiltro(null)}>
                    {ETAPA_POR_KEY[etapaFiltro]?.label} <X size={13} />
                  </button>
                )}
              </div>

              {!listo && <Cargando texto="Cruzando la memoria con los materiales…" />}
              {listo && !grupos.length && (
                <div className="mv-vacio">
                  <CircleOff size={24} />
                  <strong>Nada para mostrar con estos filtros</strong>
                  <span>Probá con otra zona o etapa, o limpiá la búsqueda.</span>
                </div>
              )}
              {listo && grupos.map((grupo) => (
                <div key={grupo.key} className="mv-zona">
                  <div className="mv-zona-cabeza">
                    <h3>{grupo.label}</h3>
                    <span>{grupo.items.length}</span>
                  </div>
                  <div className="mv-items">
                    {grupo.items.map((item, i) => (
                      <ItemMemoria
                        key={item.key}
                        item={item}
                        indice={i}
                        onResaltar={setZonaResaltada}
                        onIrTaller={(ruta) => navigate(ruta)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <aside className="mv-cruces" aria-label="Cruces">
              <div className="mv-cruces-cabeza">
                <AlertTriangle size={16} />
                <h3>Cruces</h3>
                <span>{listo ? resultado.cruces.length : "…"}</span>
              </div>
              <p className="mv-cruces-ayuda">Lo que no cierra entre la memoria y lo que la obra tiene de verdad.</p>
              {listo && resultado.cruces.length === 0 && (
                <div className="mv-cruces-ok">La memoria y los materiales coinciden en los equipos.</div>
              )}
              {listo && Object.entries(CRUCE_META).map(([tipo, meta]) => {
                const deTipo = resultado.cruces.filter((cruce) => cruce.tipo === tipo);
                if (!deTipo.length) return null;
                return (
                  <div key={tipo} className="mv-cruces-grupo" style={{ "--c": meta.color }}>
                    <div className="mv-cruces-titulo">{meta.titulo}</div>
                    {deTipo.map((cruce) => (
                      <button
                        key={`${tipo}-${cruce.key}`}
                        type="button"
                        className="mv-cruce"
                        onClick={() => setZonaActiva(cruce.zona)}
                        onMouseEnter={() => setZonaResaltada(cruce.zona)}
                        onMouseLeave={() => setZonaResaltada(null)}
                      >
                        {cruce.texto}
                      </button>
                    ))}
                  </div>
                );
              })}
              <div className="mv-beta">
                <PackageSearch size={15} />
                <span>Beta: los materiales se vinculan por nombre. Cuando se confirmen a mano (tabla <code>memoria_vinculos</code>), dejan de ser sugerencias.</span>
              </div>
            </aside>
          </div>
        </main>
      )}
      {obras !== null && !obra && (
        <div className="mv-vacio mv-vacio-pantalla">
          <Ship size={26} />
          <strong>No hay barcos activos</strong>
          <span>Cuando haya obras en producción, aparecen acá con su memoria.</span>
        </div>
      )}
    </div>
  );
}

function ItemMemoria({ item, indice, onResaltar, onIrTaller }) {
  const [abierto, setAbierto] = useState(false);
  const etapa = item.etapa ? ETAPA_POR_KEY[item.etapa] : null;
  const nivel = item.etapa ? indiceEtapa(item.etapa) : -1;
  const valor = textoValor(item);
  const nombresEnObra = new Set(item.enObra.map((grupo) => grupo.descripcion?.toLowerCase()));
  const materiales = [
    ...item.enObra.map((grupo) => ({ clave: `o-${grupo.clave}`, texto: grupo.descripcion, etapa: grupo.etapa, parcial: grupo.parcial })),
    ...item.enMatriz
      .filter((fila) => !nombresEnObra.has(fila.descripcion?.toLowerCase()))
      .map((fila, i) => ({ clave: `m-${fila.material_id || i}`, texto: fila.descripcion, etapa: "planificado", cantidad: fila.cantidad })),
  ];
  const mostrados = abierto ? materiales : materiales.slice(0, 3);

  return (
    <article
      className={`mv-item${item.definido ? "" : " is-sin-definir"}`}
      style={{ "--c": etapa ? TONOS[etapa.tono] : "var(--subtle)", "--i": indice }}
      onMouseEnter={() => onResaltar(item.zona)}
      onMouseLeave={() => onResaltar(null)}
    >
      <header className="mv-item-cabeza">
        <h4>{item.label}</h4>
        <span className={`mv-item-valor${valor && item.definido ? "" : " is-vacio"}`}>
          {item.definido ? valor : item.tipo === "toggle" ? "No" : "Sin definir"}
        </span>
      </header>

      <div className="mv-recorrido" role="img" aria-label={etapa ? `Etapa: ${etapa.label}` : "Sin definir"}>
        {ETAPAS.map((paso, i) => (
          <span key={paso.key} className={`mv-paso${i <= nivel ? " is-hecho" : ""}${i === nivel ? " is-actual" : ""}`} title={paso.label} />
        ))}
        <span className="mv-recorrido-texto">{etapa ? etapa.label : "—"}</span>
      </div>

      {item.obs && <p className="mv-item-obs">{item.obs}</p>}

      {mostrados.length > 0 && (
        <ul className="mv-materiales">
          {mostrados.map((material) => {
            const meta = ETAPA_POR_KEY[material.etapa];
            return (
              <li key={material.clave} style={{ "--c": TONOS[meta?.tono] || "var(--muted)" }}>
                <span className="mv-material-texto">{material.texto}</span>
                <span className="mv-material-etapa">
                  {meta?.corto}{material.parcial ? " · parcial" : ""}{material.cantidad ? ` · ${material.cantidad}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {materiales.length > 3 && (
        <button type="button" className="mv-mas" onClick={() => setAbierto((actual) => !actual)} aria-expanded={abierto}>
          {abierto ? "Mostrar menos" : `Ver ${materiales.length - 3} más`}
          <ChevronDown size={14} style={{ transform: abierto ? "rotate(180deg)" : "none" }} />
        </button>
      )}

      {item.taller && (
        <div className="mv-taller">
          <Wrench size={14} />
          <span>Lo resuelve <strong>{item.taller.label}</strong></span>
          {item.taller.ruta && (
            <button type="button" className="mv-taller-ir" onClick={() => onIrTaller(item.taller.ruta)}>Abrir</button>
          )}
        </div>
      )}
      {!item.taller && item.definido && item.resuelve === "compra" && materiales.length === 0 && (
        <div className="mv-taller is-sin-vinculo">
          <PackageSearch size={14} />
          <span>Sin materiales vinculados todavía</span>
        </div>
      )}
    </article>
  );
}

const CSS = `
  .mv {
    position: absolute; top: 0; right: 0; bottom: 0; left: 0;
    overflow-y: auto; overflow-x: hidden;
    color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
  }

  /* ── Barcos ── */
  .mv-barcos { display: flex; align-items: center; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px 0; }
  .mv-barcos::-webkit-scrollbar { display: none; }
  .mv-barco {
    flex-shrink: 0; min-height: 38px; display: inline-flex; align-items: center; gap: 8px;
    padding: 0 12px 0 8px; border: 1px solid var(--border); border-radius: 12px;
    background: var(--panel); color: var(--text); font: inherit; white-space: nowrap;
    transition: border-color .15s, background-color .15s;
  }
  .mv-barco:hover { border-color: var(--border-2); }
  .mv-barco.is-activo { border-color: var(--blue-border); background: var(--blue-soft); }
  .mv-barco.is-vacio { color: var(--dim); }
  .mv-barco-codigo { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; }
  .mv-barco-linea { font-size: 12px; color: var(--dim); }
  .mv-anillo { width: 20px; height: 20px; transform: rotate(-90deg); flex-shrink: 0; }
  .mv-anillo circle { fill: none; stroke-width: 3; }
  .mv-anillo circle:first-child { stroke: var(--border-2); }
  .mv-anillo circle:last-child { stroke: var(--blue); stroke-dasharray: 100; stroke-linecap: round; transition: stroke-dashoffset .6s cubic-bezier(.22,1,.36,1); }

  .mv-cuerpo { max-width: 1440px; margin: 0 auto; padding: 18px 28px 40px; }

  /* ── Escena ── */
  .mv-escena {
    position: relative; overflow: hidden;
    display: grid; grid-template-columns: minmax(260px, 320px) minmax(0, 1fr); gap: 8px;
    border: 1px solid var(--border); border-radius: 20px;
    background: radial-gradient(900px 380px at 70% -10%, var(--glow-a), transparent 70%), var(--panel-solid);
    box-shadow: var(--elev-1);
  }
  .mv-escena-datos { position: relative; z-index: 1; padding: 22px 8px 22px 24px; display: grid; align-content: start; gap: 10px; }
  .mv-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
  .mv-codigo {
    margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 40px; font-weight: 600; letter-spacing: -.03em; line-height: 1;
    background: var(--brand-grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
  }
  .mv-dueno { font-size: 16px; font-weight: 600; }
  .mv-ficha { margin: 4px 0 0; display: grid; gap: 6px; }
  .mv-ficha div { display: grid; grid-template-columns: 96px minmax(0,1fr); gap: 8px; font-size: 13px; }
  .mv-ficha dt { color: var(--dim); }
  .mv-ficha dd { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mv-ficha dd.is-vacio { color: var(--subtle); }
  .mv-completitud { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
  .mv-completitud svg { width: 56px; height: 56px; transform: rotate(-90deg); flex-shrink: 0; }
  .mv-completitud circle { fill: none; stroke-width: 6; }
  .mv-completitud circle:first-child { stroke: var(--border); }
  .mv-completitud circle:last-child { stroke: var(--blue); stroke-dasharray: 100; stroke-linecap: round; transition: stroke-dashoffset .9s cubic-bezier(.22,1,.36,1); }
  .mv-completitud strong { display: block; font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 600; }
  .mv-completitud div > span { font-size: 12.5px; color: var(--dim); }
  .mv-adicionales { margin: 4px 0 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); font-size: 13px; line-height: 1.45; }
  .mv-adicionales span { display: block; margin-bottom: 2px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }

  .mv-perfil { position: relative; min-height: 300px; padding: 18px 18px 0 0; display: grid; align-items: end; }
  .mv-agua { opacity: .9; -webkit-mask-image: linear-gradient(90deg, transparent, #000 18%); mask-image: linear-gradient(90deg, transparent, #000 18%); }
  .mv-perfil .bp { position: relative; z-index: 1; }
  .mv-perfil-cargando { position: absolute; z-index: 2; right: 18px; top: 14px; padding: 2px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel-solid); }

  .mv-zonas-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 4px 12px 14px; }
  .mv-zonas-chips::-webkit-scrollbar { display: none; }
  .mv-zona-chip { flex-shrink: 0; min-height: 36px; cursor: pointer; }
  .mv-zona-chip.is-activa { border-color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--text); }
  .mv-zona-chip-punto { width: 8px; height: 8px; border-radius: 50%; background: var(--c); flex-shrink: 0; }
  .mv-zona-chip-cuenta { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--dim); }
  .mv-zona-chip-alerta { width: 7px; height: 7px; border-radius: 50%; background: var(--red); flex-shrink: 0; }

  /* ── Etapas ── */
  .mv-etapas { position: relative; display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 10px; margin-top: 14px; }
  .mv-etapas::before {
    content: ""; position: absolute; left: 10%; right: 10%; top: 50%; height: 2px;
    background: linear-gradient(90deg, var(--muted), var(--cyan), var(--violet), var(--blue), var(--green)); opacity: .25;
  }
  .mv-etapa {
    position: relative; z-index: 1; min-width: 0;
    display: grid; gap: 4px; justify-items: start; padding: 14px 16px 12px;
    border: 1px solid var(--border); border-radius: 16px; background: var(--panel-solid);
    color: var(--text); font: inherit; text-align: left;
    transition: border-color .15s, transform .15s cubic-bezier(.22,1,.36,1), box-shadow .15s;
  }
  .mv-etapa::after { content: ""; position: absolute; left: 16px; right: 16px; bottom: 0; height: 3px; border-radius: 3px 3px 0 0; background: var(--c); opacity: .75; }
  .mv-etapa:hover { transform: translateY(-2px); border-color: var(--border-2); }
  .mv-etapa.is-activa { border-color: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent); }
  .mv-etapa-numero { font-family: 'JetBrains Mono', monospace; font-size: 26px; font-weight: 600; line-height: 1; color: var(--c); }
  .mv-etapa-nombre { font-size: 13px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

  /* ── Lista y cruces ── */
  .mv-contenido { display: grid; grid-template-columns: minmax(0,1fr) 340px; gap: 16px; align-items: start; margin-top: 16px; }
  .mv-filtros { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .mv-buscar { position: relative; flex: 1 1 260px; min-width: 0; }
  .mv-buscar svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
  .mv-buscar .ui-input { padding-left: 36px; }
  .mv-filtro { min-height: 32px; cursor: pointer; }

  .mv-zona + .mv-zona { margin-top: 18px; }
  .mv-zona-cabeza { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
  .mv-zona-cabeza h3 { margin: 0; font-size: 15px; font-weight: 650; }
  .mv-zona-cabeza span { padding: 0 8px; border: 1px solid var(--border); border-radius: 999px; font-size: 12px; color: var(--dim); }
  .mv-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 10px; }

  .mv-item {
    position: relative; min-width: 0; display: grid; gap: 10px; align-content: start;
    padding: 14px 14px 12px 16px; border: 1px solid var(--border); border-radius: 14px;
    background: var(--panel-solid); box-shadow: var(--elev-1);
    animation: mv-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i) * 30ms);
    transition: border-color .15s;
  }
  .mv-item::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: var(--c); }
  .mv-item:hover { border-color: var(--border-2); }
  .mv-item.is-sin-definir { background: var(--panel); box-shadow: none; }
  .mv-item-cabeza { display: grid; gap: 3px; }
  .mv-item-cabeza h4 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); }
  .mv-item-valor { font-size: 15px; font-weight: 600; line-height: 1.3; }
  .mv-item-valor.is-vacio { color: var(--subtle); font-weight: 500; }
  .mv-item-obs { margin: 0; font-size: 12.5px; color: var(--muted); line-height: 1.45; }

  .mv-recorrido { display: flex; align-items: center; gap: 5px; }
  .mv-paso { width: 18px; height: 6px; border-radius: 3px; background: var(--border-2); transition: background-color .3s; }
  .mv-paso.is-hecho { background: color-mix(in srgb, var(--c) 55%, transparent); }
  .mv-paso.is-actual { background: var(--c); box-shadow: 0 0 10px color-mix(in srgb, var(--c) 60%, transparent); }
  .mv-recorrido-texto { margin-left: 4px; font-size: 12.5px; font-weight: 600; color: var(--c); }

  .mv-materiales { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .mv-materiales li {
    display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 9px; background: var(--panel); font-size: 12.5px;
  }
  .mv-material-texto { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mv-material-etapa { color: var(--c); font-size: 11.5px; font-weight: 600; white-space: nowrap; }
  .mv-mas { justify-self: start; display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px; border: 0; background: transparent; color: var(--blue); font: inherit; font-size: 12.5px; font-weight: 600; }
  .mv-taller { display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px dashed var(--border); font-size: 12.5px; color: var(--muted); }
  .mv-taller svg { color: var(--violet); flex-shrink: 0; }
  .mv-taller.is-sin-vinculo svg { color: var(--subtle); }
  .mv-taller-ir { margin-left: auto; padding: 3px 10px; border: 1px solid var(--border-2); border-radius: 8px; background: transparent; color: var(--text); font: inherit; font-size: 12px; font-weight: 600; }
  .mv-taller-ir:hover { border-color: var(--blue-border); color: var(--blue); }

  .mv-cruces {
    position: sticky; top: 16px; display: grid; gap: 10px; padding: 16px;
    border: 1px solid var(--border); border-radius: 16px; background: var(--panel-solid); box-shadow: var(--elev-1);
  }
  .mv-cruces-cabeza { display: flex; align-items: center; gap: 8px; }
  .mv-cruces-cabeza svg { color: var(--violet); }
  .mv-cruces-cabeza h3 { margin: 0; font-size: 15px; font-weight: 650; }
  .mv-cruces-cabeza span { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--dim); }
  .mv-cruces-ayuda { margin: 0; font-size: 12.5px; color: var(--dim); line-height: 1.45; }
  .mv-cruces-ok { padding: 10px 12px; border: 1px solid var(--green-border); border-radius: 12px; background: var(--green-soft); color: var(--green); font-size: 13px; }
  .mv-cruces-grupo { display: grid; gap: 6px; }
  .mv-cruces-titulo { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--c); }
  .mv-cruce {
    position: relative; padding: 8px 10px 8px 14px; border: 1px solid var(--border); border-radius: 10px;
    background: var(--panel); color: var(--text); font: inherit; font-size: 12.5px; line-height: 1.45; text-align: left;
    transition: border-color .15s;
  }
  .mv-cruce::before { content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; border-radius: 0 3px 3px 0; background: var(--c); }
  .mv-cruce:hover { border-color: var(--c); }
  .mv-beta { display: flex; gap: 8px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 12px; color: var(--dim); line-height: 1.45; }
  .mv-beta svg { flex-shrink: 0; margin-top: 1px; color: var(--cyan); }
  .mv-beta code { font-family: 'JetBrains Mono', monospace; font-size: 11px; }

  .mv-vacio, .mv-error { display: grid; justify-items: center; gap: 6px; padding: 40px 20px; text-align: center; color: var(--dim); font-size: 13px; }
  .mv-vacio strong, .mv-error strong { color: var(--text); font-size: 15px; font-weight: 600; }
  .mv-vacio-pantalla { margin-top: 40px; }
  .mv-error { margin: 60px auto; max-width: 420px; }
  .mv-error svg { color: var(--red); }

  @keyframes mv-sube { from { opacity: 0; transform: translateY(10px); } }

  @media (max-width: 1100px) {
    .mv-contenido { grid-template-columns: minmax(0,1fr); }
    .mv-cruces { position: static; order: -1; }
  }
  @media (max-width: 899px) {
    .mv-cuerpo { padding: 12px 12px 32px; }
    .mv-escena { grid-template-columns: minmax(0,1fr); border-radius: 16px; }
    .mv-escena-datos { padding: 16px 16px 0; }
    .mv-codigo { font-size: 32px; }
    .mv-perfil { min-height: 0; padding: 0 4px; }
    .mv-etapas { display: flex; overflow-x: auto; scrollbar-width: none; margin: 12px -12px 0; padding: 0 12px 4px; }
    .mv-etapas::-webkit-scrollbar { display: none; }
    .mv-etapas::before { display: none; }
    .mv-etapa { flex: 0 0 132px; }
    .mv-items { grid-template-columns: minmax(0,1fr); }
  }
`;
