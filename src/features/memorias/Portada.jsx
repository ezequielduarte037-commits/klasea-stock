// Portada de Memorias: todos los barcos activos con cuánto tienen definido y
// qué les falta, agrupados por línea.
import { useMemo, useState } from "react";
import { BookOpenText, FileSpreadsheet, PackagePlus, Printer, RefreshCw, Search, Ship } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { haceCuanto, ordenLinea, tonoDeAvance } from "./campos";
import { sinTildes } from "./acabados";
import { Anillo, Barra } from "./ui";

const FILTROS = [
  { key: "todas", label: "Todas" },
  { key: "faltan", label: "Faltan datos", tono: "cian" },
  { key: "sin", label: "Sin empezar" },
  { key: "completas", label: "Completas", tono: "verde" },
];

function leerFiltro() {
  try { return localStorage.getItem("mem_filtro") || "todas"; } catch { return "todas"; }
}

function cumple(ficha, filtro) {
  if (filtro === "faltan") return ficha.avance.hechos > 0 && ficha.avance.pct < 100;
  if (filtro === "sin") return ficha.avance.hechos === 0;
  if (filtro === "completas") return ficha.avance.pct >= 100;
  return true;
}

function Tarjeta({ ficha, perfiles, onAbrir, i }) {
  const { obra, datos, avance, semilla, adicionales, fila } = ficha;
  const tono = tonoDeAvance(avance.pct);
  const cliente = [datos.propietario, datos.nombre_barco && `“${datos.nombre_barco}”`].filter(Boolean).join(" · ");
  const quien = fila?.updated_by ? perfiles.get(fila.updated_by) : null;
  const faltan = avance.faltan.slice(0, 3).map((c) => c.label);
  return (
    <button type="button" className="mem-tarjeta" data-tono={tono} onClick={() => onAbrir(obra.codigo)} style={{ animationDelay: `${Math.min(i * 25, 250)}ms` }}>
      <div className="mem-tarjeta-sup">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="mem-tarjeta-cod">{obra.codigo}</div>
          <div className={`mem-tarjeta-cli${cliente ? "" : " vacio"}`}>{cliente || "Sin cliente cargado"}</div>
        </div>
        <Anillo pct={avance.pct} tono={tono} />
      </div>
      <Barra pct={avance.pct} tono={tono} />
      <div className="mem-tarjeta-falta">
        {avance.pct >= 100 ? (
          <>Todo definido.</>
        ) : avance.hechos === 0 ? (
          semilla ? <>Sin empezar. <b>Hay datos en la planilla vieja</b> para traer.</> : <>Sin empezar.</>
        ) : (
          <>Falta: <b>{faltan.join(" · ")}</b>{avance.faltan.length > 3 ? ` y ${avance.faltan.length - 3} más` : ""}</>
        )}
      </div>
      <div className="mem-tarjeta-pie">
        {adicionales > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <PackagePlus size={13} /> {adicionales} adicional{adicionales === 1 ? "" : "es"}
          </span>
        )}
        {!fila && semilla && avance.hechos === 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><FileSpreadsheet size={13} /> Excel</span>
        )}
        <span className="mem-sp" />
        <span>{fila?.updated_at ? `${haceCuanto(fila.updated_at)}${quien ? ` · ${quien}` : ""}` : "Sin memoria"}</span>
      </div>
    </button>
  );
}

export default function Portada({ fichas, cargando, error, perfiles, onAbrir, onRecargar, onImprimir }) {
  const [filtro, setFiltroEstado] = useState(leerFiltro);
  const [linea, setLinea] = useState("todas");
  const [q, setQ] = useState("");

  function setFiltro(valor) {
    setFiltroEstado(valor);
    try { localStorage.setItem("mem_filtro", valor); } catch { /* sin almacenamiento */ }
  }

  const cuentas = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.key, fichas.filter((x) => cumple(x, f.key)).length])), [fichas]);
  const lineas = useMemo(() => [...new Set(fichas.map((f) => f.linea))].sort(ordenLinea), [fichas]);

  const grupos = useMemo(() => {
    const t = sinTildes(q);
    const visibles = fichas.filter((f) => cumple(f, filtro)
      && (linea === "todas" || f.linea === linea)
      && (!t || sinTildes(`${f.obra.codigo} ${f.datos.propietario || ""} ${f.datos.nombre_barco || ""} ${f.obra.descripcion || ""}`).includes(t)));
    const porLinea = new Map();
    for (const f of visibles) {
      if (!porLinea.has(f.linea)) porLinea.set(f.linea, []);
      porLinea.get(f.linea).push(f);
    }
    return [...porLinea.entries()].sort((a, b) => ordenLinea(a[0], b[0]));
  }, [fichas, filtro, linea, q]);

  const completas = cuentas.completas;
  const sinEmpezar = cuentas.sin;

  return (
    <div className="mem-pagina">
      <div className="mem-cab">
        <div className="mem-titulos">
          <div className="mem-eyebrow">Producción · Memorias descriptivas</div>
          <h1 className="mem-h1">Lo que eligió <span className="acento">cada cliente</span></h1>
          <p className="mem-sub">
            {cargando ? "Trayendo los barcos…" : (
              <><b>{fichas.length}</b> barcos activos · <b>{completas}</b> completos · <b>{cuentas.faltan}</b> a medias · <b>{sinEmpezar}</b> sin empezar</>
            )}
          </p>
        </div>
        <div className="mem-acciones">
          <button type="button" className="mem-btn-ic" onClick={onRecargar} title="Actualizar" aria-label="Actualizar"><RefreshCw size={16} /></button>
        </div>
      </div>

      <div className="mem-filtros">
        <div className="mem-seg" role="radiogroup" aria-label="Estado">
          {FILTROS.map((f) => (
            <button key={f.key} type="button" role="radio" aria-checked={filtro === f.key} className={filtro === f.key ? "on" : ""} data-tono={f.tono} onClick={() => setFiltro(f.key)}>
              {f.label} <span className="n">{cuentas[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="mem-chips" role="radiogroup" aria-label="Línea">
          {["todas", ...lineas].map((l) => (
            <button key={l} type="button" role="radio" aria-checked={linea === l} className={`mem-chip${linea === l ? " on" : ""}`} onClick={() => setLinea(l)}>
              {l === "todas" ? "Todas las líneas" : l}
            </button>
          ))}
        </div>
        <div className="mem-sp" />
        <label className="mem-buscar">
          <Search size={15} />
          <input className="ui-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar barco o cliente" aria-label="Buscar barco o cliente" />
        </label>
      </div>

      {cargando ? (
        <Cargando texto="Trayendo las memorias…" />
      ) : error ? (
        <div className="mem-vacio"><BookOpenText size={30} />{error}<button type="button" className="ui-btn chico" onClick={onRecargar}>Reintentar</button></div>
      ) : !grupos.length ? (
        <div className="mem-vacio"><Ship size={30} />No hay barcos con ese filtro.</div>
      ) : (
        grupos.map(([nombre, lista], g) => (
          <section key={nombre} className="mem-grupo" style={{ animationDelay: `${Math.min(g * 40, 200)}ms` }}>
            <div className="mem-grupo-tit">
              <h2>{nombre}</h2>
              <span className="mono">{lista.length}</span>
              <span className="mem-sp" />
              <button type="button" className="ui-btn chico" onClick={() => onImprimir(lista, nombre)} title={`Una hoja por barco, para el pizarrón`}>
                <Printer size={14} /> Imprimir {lista.length === 1 ? "la hoja" : `las ${lista.length} hojas`}
              </button>
            </div>
            <div className="mem-tarjetas">
              {lista.map((f, i) => <Tarjeta key={f.obra.id} ficha={f} perfiles={perfiles} onAbrir={onAbrir} i={i} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
