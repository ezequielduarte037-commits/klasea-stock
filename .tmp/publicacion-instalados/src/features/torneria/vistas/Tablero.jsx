import { useMemo, useState } from "react";
import { Check, ChevronRight, PackageOpen, Search, ShoppingCart, Truck } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { DEMORA_DIAS, cantidadTexto, plural, workshopName } from "../torneriaEstado";
import { Dias } from "../torneriaUi";
import { CatalogTechnicalName, FotoMaterial } from "../circuito";
import { fotoDelMaterial } from "../circuitoDatos";

// El Panel general es el circuito de todas las obras puesto en columnas, en el
// orden en que viaja una pieza. Cada columna dice qué hay que hacer con lo que
// tiene, y la acción de cada pieza la pasa a la columna siguiente.
const COLUMNAS = [
  {
    key: "compras", etapas: ["comprar", "compra"], titulo: "Compras", corto: "Compras", tono: "cian",
    txt: "Material que falta pedir o que todavía no llegó al astillero.",
  },
  {
    key: "preparar", etapas: ["preparar"], titulo: "Preparar", corto: "Preparar", tono: "cian",
    txt: "Ya está en el astillero. Marcalo cuando esté listo para salir.",
  },
  {
    key: "enviar", etapas: ["enviar"], titulo: "Para enviar", corto: "Enviar", tono: "verde",
    txt: "Listo en el astillero, esperando el flete.",
  },
  {
    key: "taller", etapas: ["taller"], titulo: "En el taller", corto: "Taller", tono: "azul",
    txt: "En Tornería o Plegadora. Avisá cuando el taller termine.",
  },
  {
    key: "retirar", etapas: ["retirar"], titulo: "Para retirar", corto: "Retirar", tono: "verde",
    txt: "El taller terminó: hay que ir a buscarlo.",
  },
];

function porObra(piezas, orden = null) {
  const mapa = new Map();
  piezas.forEach((pieza) => {
    const grupo = mapa.get(pieza.process.id) ?? { process: pieza.process, piezas: [] };
    grupo.piezas.push(pieza);
    mapa.set(pieza.process.id, grupo);
  });
  const lista = [...mapa.values()];
  if (orden) lista.sort(orden);
  return lista;
}

const maxDias = (piezas) => piezas.reduce((max, p) => Math.max(max, p.dias ?? -1), -1);

function CabeceraObra({ process, onAbrir, derecha = null }) {
  return (
    <button type="button" className="tor-ocard-cab" onClick={() => onAbrir(process.id)} title="Abrir la obra">
      <span className="tor-ocard-cod">{process.obra?.codigo || process.nombre}</span>
      <span className="tor-ocard-linea">{process.obra?.linea_nombre || "Sin línea"}</span>
      <span className="tor-ocard-der">
        {derecha}
        <ChevronRight size={15} />
      </span>
    </button>
  );
}

// Columna 1: compras, por obra. Se pide de a una obra por vez —un pedido por
// obra es lo que Compras quiere—, con todo lo que esa obra tiene sin pedir.
function ObraCompras({ grupo, onAbrir, onPedir }) {
  const sinPedir = grupo.piezas.filter((p) => p.etapa === "comprar");
  const enCompra = grupo.piezas.filter((p) => p.etapa === "compra");
  const masViejo = maxDias(enCompra);
  const nombres = (lista) => {
    const n = lista.map((p) => p.item.descripcion);
    return n.slice(0, 3).join(", ") + (n.length > 3 ? ` y ${n.length - 3} más` : "");
  };
  return (
    <article className="tor-ocard">
      <CabeceraObra process={grupo.process} onAbrir={onAbrir} />
      <div className="tor-ocard-cuerpo">
        {sinPedir.length > 0 && (
          <div className="tor-ocard-txt" data-tono="cian">
            <b>{sinPedir.length} sin pedir</b> · {nombres(sinPedir)}
          </div>
        )}
        {enCompra.length > 0 && (
          <div className="tor-ocard-txt" data-tono={masViejo >= DEMORA_DIAS ? "rojo" : "violeta"}>
            <b>{enCompra.length} en compra</b>
            {masViejo >= 0 ? <> · el pedido más viejo hace <b>{masViejo} d</b></> : null}
          </div>
        )}
      </div>
      {sinPedir.length > 0 && (
        <div className="tor-ocard-pie">
          <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => onPedir(grupo.process, sinPedir.map((p) => p.item))}>
            <ShoppingCart size={15} /> Pedir {sinPedir.length} a Compras
          </button>
        </div>
      )}
    </article>
  );
}

// Columnas 2 y 4: piezas que se marcan de a una o todas juntas.
function ObraMarcar({ grupo, etapa, onAbrir, onReady }) {
  const confirm = useConfirm();
  const enTaller = etapa === "taller";
  const componentesDe = (pieza) => (enTaller ? pieza.pendientesRetiro : pieza.pendientesEnvio);
  const texto = enTaller ? "lista para retirar" : "lista para enviar";
  const piezas = enTaller ? [...grupo.piezas].sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1)) : grupo.piezas;

  async function marcarTodas() {
    const ok = await confirm({
      title: `¿Marcar ${piezas.length} piezas de ${grupo.process.obra?.codigo || "la obra"}?`,
      message: enTaller
        ? "Quedan como listas para retirar: el taller ya terminó con todas y se pueden ir a buscar."
        : "Quedan como listas para enviar: están preparadas en el astillero esperando el flete.",
      confirmLabel: "Marcar todas",
    });
    if (ok) onReady(piezas.flatMap(componentesDe), enTaller ? "retiro" : "envio", true);
  }

  return (
    <article className="tor-ocard">
      <CabeceraObra
        process={grupo.process}
        onAbrir={onAbrir}
        derecha={enTaller ? <Dias dias={maxDias(piezas) >= 0 ? maxDias(piezas) : null} demora={DEMORA_DIAS} /> : null}
      />
      <div className="tor-ocard-cuerpo">
        {piezas.map((pieza) => (
          <div
            key={pieza.key}
            className="tor-prow"
            style={fotoDelMaterial(pieza.item) ? { gridTemplateColumns: "auto minmax(0, 1fr) auto" } : undefined}
          >
            <FotoMaterial item={pieza.item} size={36} />
            <div style={{ minWidth: 0 }}>
              <div className="tor-prow-nom">{pieza.item.descripcion}</div>
              <CatalogTechnicalName item={pieza.item} linea />
              <div className="tor-prow-sub">
                {enTaller
                  ? `${workshopName(pieza.operation)} · viaje ${pieza.operation.viaje || 1}${pieza.dias != null ? ` · hace ${pieza.dias} d` : ""}`
                  : `${pieza.operation.nombre} · a ${workshopName(pieza.operation)}`}
              </div>
            </div>
            <button
              type="button"
              className="ui-btn ui-btn-suave chico"
              onClick={() => onReady(componentesDe(pieza), enTaller ? "retiro" : "envio", true)}
              title={`Marcar ${texto}`}
            >
              <Check size={14} />
              {/* En la columna angosta de la computadora alcanza con "Lista"; en el
                  celular el botón dice lo mismo que decía antes. */}
              <span className="tor-solo-escritorio">Lista</span>
              <span className="tor-solo-celular">{enTaller ? "Listo para retirar" : "Listo para enviar"}</span>
            </button>
          </div>
        ))}
      </div>
      {piezas.length > 1 && (
        <div className="tor-ocard-pie">
          <button type="button" className="ui-btn chico" onClick={marcarTodas}>
            Marcar todas ({piezas.length})
          </button>
        </div>
      )}
    </article>
  );
}

// Columnas 3 y 5: se eligen piezas de varias obras y se registran en un solo
// flete. Cada obra conserva su movimiento y su historial por separado.
function ObraElegir({ grupo, etapa, elegidas, onElegir, onAbrir }) {
  const salida = etapa === "enviar";
  return (
    <article className="tor-ocard">
      <CabeceraObra process={grupo.process} onAbrir={onAbrir} />
      <div className="tor-ocard-cuerpo" data-tono="verde">
        {grupo.piezas.map((pieza) => {
          const on = elegidas.has(pieza.key);
          const comps = salida ? pieza.pendientesEnvio : pieza.pendientesRetiro;
          const cantidad = comps.reduce((sum, c) => sum + Math.max(0, salida
            ? Number(c.cantidad_requerida) - Number(c.cantidad_enviada)
            : Number(c.cantidad_enviada) - Number(c.cantidad_recibida)), 0);
          return (
            <button
              key={pieza.key}
              type="button"
              className={`tor-prow sel${on ? " on" : ""}`}
              onClick={() => onElegir(pieza.key)}
              aria-pressed={on}
              style={fotoDelMaterial(pieza.item) ? { gridTemplateColumns: "auto auto minmax(0, 1fr) auto" } : undefined}
            >
              <span className={`tor-check${on ? " on" : ""}`}>{on && <Check size={13} />}</span>
              <FotoMaterial item={pieza.item} size={36} estatica />
              <span style={{ minWidth: 0 }}>
                <span className="tor-prow-nom">{pieza.item.descripcion}</span>
                <CatalogTechnicalName item={pieza.item} linea />
                <span className="tor-prow-sub" style={{ display: "block" }}>
                  {workshopName(pieza.operation)} · viaje {pieza.operation.viaje || 1}
                  {pieza.desdeListo != null && pieza.desdeListo > 0 ? ` · lista hace ${pieza.desdeListo} d` : ""}
                </span>
              </span>
              <span className="mono" style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                {cantidadTexto(cantidad, pieza.item.unidad)}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

export default function Tablero({ resumen, onAbrirObra, onReady, onBatch, onPedir }) {
  const [taller, setTaller] = useState("todos");
  const [query, setQuery] = useState("");
  // En el celular se ve una columna por vez. Arranca en el taller: es la
  // pregunta con la que se abre el teléfono ("¿qué hay afuera?").
  const [colMovil, setColMovilState] = useState(() => {
    try { return window.localStorage.getItem("torneria.etapa") || "taller"; } catch { return "taller"; }
  });
  // Se recuerda la última etapa mirada: quien siempre entra a retirar, abre en Retirar.
  const setColMovil = (valor) => {
    setColMovilState(valor);
    try { window.localStorage.setItem("torneria.etapa", valor); } catch { /* sin almacenamiento */ }
  };
  const [elegidas, setElegidas] = useState(() => new Set());

  const term = query.trim().toLowerCase();
  const piezas = useMemo(() => resumen.piezas.filter((pieza) => {
    const op = pieza.operation || pieza.taller || pieza.tramos?.[0];
    if (taller !== "todos" && op?.tipo !== taller) return false;
    if (!term) return true;
    return `${pieza.process.obra?.codigo || ""} ${pieza.process.obra?.linea_nombre || ""} ${pieza.item.descripcion || ""} ${pieza.item.material?.codigo || ""} ${pieza.item.material?.descripcion || ""}`
      .toLowerCase()
      .includes(term);
  }), [resumen.piezas, taller, term]);

  const columnas = COLUMNAS.map((col) => ({
    ...col,
    piezas: piezas.filter((p) => col.etapas.includes(p.etapa)),
  }));
  const esperan = piezas.filter((p) => p.etapa === "espera").length;

  function elegir(key) {
    setElegidas((actual) => {
      const next = new Set(actual);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function registrar(col) {
    const salida = col.key === "enviar";
    const seleccion = col.piezas.filter((p) => elegidas.has(p.key));
    const filas = seleccion.flatMap((pieza) => (salida ? pieza.pendientesEnvio : pieza.pendientesRetiro).map((component) => ({
      process: pieza.process,
      operation: pieza.operation,
      component,
      cantidad: Math.max(0, salida
        ? Number(component.cantidad_requerida) - Number(component.cantidad_enviada)
        : Number(component.cantidad_enviada) - Number(component.cantidad_recibida)),
    })));
    if (filas.length) onBatch(salida ? "salida" : "recepcion", filas);
  }

  function todasDe(col) {
    const keys = col.piezas.map((p) => p.key);
    const todas = keys.length > 0 && keys.every((k) => elegidas.has(k));
    setElegidas((actual) => {
      const next = new Set(actual);
      keys.forEach((k) => (todas ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  return (
    <>
      <header className="tor-barra">
        <div className="tor-barra-fila">
          <div className="tor-titulos">
            <div className="tor-eyebrow">Tornería · Panel general</div>
            <h1 className="tor-h1">Piezas en <span className="acento">movimiento</span></h1>
            <p className="tor-sub">
              <b>{resumen.afuera}</b> {plural(resumen.afuera, "pieza", "piezas")} en talleres
              {resumen.demoradas > 0 && <> · <b className="rojo">{resumen.demoradas}</b> hace más de {DEMORA_DIAS} días</>}
            </p>
          </div>
          <div className="tor-acciones tor-solo-escritorio">
            <label className="tor-buscar">
              <Search size={15} />
              <input className="ui-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Obra, pieza o catálogo…" aria-label="Buscar en el panel" />
            </label>
            <div className="tor-seg" role="group" aria-label="Taller">
              {[["todos", "Todos"], ["torneria", "Tornería"], ["plegadora", "Plegadora"]].map(([valor, texto]) => (
                <button key={valor} type="button" className={taller === valor ? "on" : ""} onClick={() => setTaller(valor)}>{texto}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Celular: el circuito en cinco pasos que entran enteros; se ve una
            etapa por vez. El taller y la búsqueda van en la fila de abajo. */}
        <div className="tor-etapas tor-solo-celular" role="tablist" aria-label="Etapas del circuito">
          {columnas.map((col) => (
            <button
              key={col.key}
              type="button"
              role="tab"
              aria-selected={colMovil === col.key}
              className={`tor-etapa${colMovil === col.key ? " on" : ""}`}
              data-tono={col.tono}
              onClick={() => setColMovil(col.key)}
            >
              <span className={`n${col.piezas.length ? "" : " cero"}`}>{col.piezas.length}</span>
              <span className="t">{col.corto}</span>
            </button>
          ))}
        </div>
        <div className="tor-filtros tor-solo-celular" style={{ marginTop: 10 }}>
          <div className="tor-seg" role="group" aria-label="Taller">
            {[["todos", "Todos"], ["torneria", "Tornería"], ["plegadora", "Plegadora"]].map(([valor, texto]) => (
              <button key={valor} type="button" className={taller === valor ? "on" : ""} onClick={() => setTaller(valor)}>{texto}</button>
            ))}
          </div>
          <label className="tor-buscar">
            <Search size={15} />
            <input className="ui-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" aria-label="Buscar en el panel" />
          </label>
        </div>
      </header>

      <div className="tor-tablero">
        {columnas.map((col, i) => {
          const grupos = col.key === "taller"
            ? porObra(col.piezas, (a, b) => maxDias(b.piezas) - maxDias(a.piezas))
            : porObra(col.piezas);
          const elige = col.key === "enviar" || col.key === "retirar";
          const nElegidas = elige ? col.piezas.filter((p) => elegidas.has(p.key)).length : 0;
          return (
            <section key={col.key} className={`tor-col${colMovil === col.key ? " activa" : ""}`} data-tono={col.tono} style={{ "--i": i }}>
              <div className="tor-col-cab">
                <div className="tor-col-tit">
                  <span className="tor-col-paso">{i + 1}</span>
                  <b>{col.titulo}</b>
                  <span className={`n${col.piezas.length ? "" : " cero"}`}>{col.piezas.length}</span>
                </div>
                <div className="tor-col-txt">{col.txt}</div>
              </div>
              <div className="tor-col-cuerpo">
                {!grupos.length ? (
                  <div className="tor-vacio chico">
                    {col.key === "retirar" ? "El taller todavía no avisó que haya algo listo."
                      : col.key === "enviar" ? "No hay nada preparado para un flete."
                        : col.key === "taller" ? "No hay piezas afuera."
                          : col.key === "preparar" ? "Nada para preparar."
                            : "No falta pedir nada."}
                  </div>
                ) : grupos.map((grupo) => (
                  col.key === "compras" ? (
                    <ObraCompras key={grupo.process.id} grupo={grupo} onAbrir={onAbrirObra} onPedir={onPedir} />
                  ) : elige ? (
                    <ObraElegir key={grupo.process.id} grupo={grupo} etapa={col.key} elegidas={elegidas} onElegir={elegir} onAbrir={onAbrirObra} />
                  ) : (
                    <ObraMarcar key={grupo.process.id} grupo={grupo} etapa={col.key} onAbrir={onAbrirObra} onReady={onReady} />
                  )
                ))}
                {col.key === "preparar" && esperan > 0 && (
                  <div className="tor-col-nota">
                    Además, {esperan} {plural(esperan, "pieza espera", "piezas esperan")} que vuelva un paso anterior. Se ven en cada obra.
                  </div>
                )}
              </div>
              {elige && col.piezas.length > 0 && (
                <div className="tor-col-pie">
                  <button type="button" className="ui-btn chico" onClick={() => todasDe(col)}>
                    {col.piezas.every((p) => elegidas.has(p.key)) ? "Quitar todas" : "Elegir todas"}
                  </button>
                  <button type="button" className="ui-btn ui-btn-primario" disabled={!nElegidas} onClick={() => registrar(col)}>
                    {col.key === "enviar" ? <Truck size={16} /> : <PackageOpen size={16} />}
                    {col.key === "enviar" ? "Registrar salida" : "Registrar regreso"}
                    {nElegidas ? ` (${nElegidas})` : ""}
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

