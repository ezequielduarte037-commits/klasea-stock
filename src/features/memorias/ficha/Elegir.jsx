// Panel para elegir una definición. Muestra sólo opciones que tienen sentido
// para ese campo (el piso interior ofrece pisos de adentro; la teca va en el
// piso del cockpit) y deja "Otro" para lo que no está. Desde acá se puede
// seguir con lo siguiente sin definir sin cerrar el panel.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Ban, Check, ChevronLeft, ChevronRight, Layers3, ListChecks, X } from "lucide-react";
import { CSS_MEMORIAS } from "../estilos";
import {
  DECISIONES, NO_LLEVA, armarAmbientes, armarLleva, armarOpciones, leerAmbientes, leerLleva, leerOpciones, opcionesDe,
} from "../decisiones";
import { PALETAS, buscarMuestra, claveSimple } from "../acabados";
import { claveDeOpcion } from "../matriz";
import { Muestra } from "./Tarjetas";

function Opcion({ op, on, onClick }) {
  return (
    <button type="button" className={`mem-op${op.conMuestra ? " con-muestra" : ""}${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>
      {op.conMuestra && <Muestra tex={op.tex} grande />}
      <span className="nom">{op.nombre}</span>
      {on && <Check size={14} className="ok" />}
    </button>
  );
}

function Grupos({ opciones, elegida, onElegir }) {
  const grupos = [];
  for (const op of opciones) {
    const g = grupos.find((x) => x.titulo === op.grupo);
    if (g) g.ops.push(op); else grupos.push({ titulo: op.grupo, ops: [op] });
  }
  // Primero las que tienen foto o color; las que no, como tarjetas de texto
  // (una muestra vacía parece una imagen rota).
  const tarjeta = (op) => <Opcion key={op.nombre} op={op} on={elegida === op.nombre} onClick={() => onElegir(elegida === op.nombre ? "" : op.nombre)} />;
  return grupos.map((g) => {
    const conFoto = g.ops.filter((o) => o.conMuestra && o.tex);
    const texto = g.ops.filter((o) => !(o.conMuestra && o.tex)).map((o) => ({ ...o, conMuestra: false }));
    return (
      <div key={g.titulo || "unico"} className="mem-ops-grupo">
        {g.titulo && <div className="mem-rotulo">{g.titulo}</div>}
        {conFoto.length > 0 && <div className="mem-ops muestras">{conFoto.map(tarjeta)}</div>}
        {texto.length > 0 && <div className="mem-ops">{texto.map(tarjeta)}</div>}
      </div>
    );
  });
}

function Otro({ valor, placeholder, onCambio, activo }) {
  return (
    <label className={`mem-otro${activo ? " on" : ""}`}>
      <span>Otro</span>
      <input className="ui-input" value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function CuerpoOpciones({ campo, d, valor, linea, onValor }) {
  const l = leerOpciones(campo.key, linea, valor);
  const elegida = l.eleccion?.nombre || "";
  const complementos = l.complementos || [];
  const principal = l.noLleva ? "" : l.principal || "";
  return (
    <>
      <Grupos opciones={opcionesDe(campo.key, linea)} elegida={elegida} onElegir={(n) => onValor(n ? armarOpciones(n, complementos) : "")} />
      <Otro
        valor={l.eleccion ? "" : principal}
        activo={!l.eleccion && !!principal}
        placeholder={d.otro}
        onCambio={(t) => onValor(armarOpciones(t, complementos))}
      />
      {d.complementos?.length > 0 && (
        <div className="mem-ops-grupo">
          <div className="mem-rotulo">Además</div>
          <div className="mem-chips-elegir">
            {d.complementos.map((c) => {
              const on = complementos.includes(c);
              return (
                <button key={c} type="button" className={`mem-sug-op${on ? " on" : ""}`} aria-pressed={on} disabled={!principal}
                  onClick={() => onValor(armarOpciones(principal, on ? complementos.filter((x) => x !== c) : [...complementos, c]))}>
                  {on && <Check size={12} />} {c}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!d.sinNoLleva && (
        <button type="button" className={`mem-no-lleva${l.noLleva ? " on" : ""}`} aria-pressed={!!l.noLleva} onClick={() => onValor(l.noLleva ? "" : NO_LLEVA)}>
          <Ban size={14} /> {NO_LLEVA}
        </button>
      )}
    </>
  );
}

function CuerpoLleva({ d, valor, onValor }) {
  const l = leerLleva(valor);
  const modelos = d.paletaModelos
    ? PALETAS[d.paletaModelos].muestras.map((x) => ({ nombre: x.nombre, tex: x.tex, conMuestra: true }))
    : (d.modelos || []).map((nombre) => ({ nombre, tex: null, conMuestra: false }));
  const elegido = d.paletaModelos
    ? buscarMuestra(d.paletaModelos, l.modelo)?.nombre
    : modelos.find((x) => claveSimple(x.nombre) === claveSimple(l.modelo))?.nombre;
  return (
    <>
      <div className="mem-seg ancho" role="radiogroup" aria-label="¿Lleva?">
        <button type="button" role="radio" aria-checked={!!l.lleva} className={l.lleva ? "on" : ""} data-tono="verde" onClick={() => onValor(l.lleva ? "" : "Lleva")}>Lleva</button>
        <button type="button" role="radio" aria-checked={!!l.noLleva} className={l.noLleva ? "on" : ""} onClick={() => onValor(l.noLleva ? "" : NO_LLEVA)}>No lleva</button>
      </div>
      {l.lleva && (
        <>
          {modelos.length > 0 && (
            <div className="mem-ops-grupo">
              <div className="mem-rotulo">{d.paletaModelos ? "Color" : "Modelo"}</div>
              <Grupos opciones={modelos} elegida={elegido || ""} onElegir={(n) => onValor(armarLleva({ modelo: n }))} />
            </div>
          )}
          <Otro valor={elegido ? "" : l.modelo} activo={!elegido && !!l.modelo} placeholder={d.otro} onCambio={(t) => onValor(armarLleva({ modelo: t }))} />
        </>
      )}
    </>
  );
}

function CuerpoAmbientes({ d, valor, onValor }) {
  const l = leerAmbientes(valor);
  const [modo, setModo] = useState(l.porLugar ? "lugares" : "igual");
  const piedras = PALETAS.piedras.muestras.map((x) => ({ nombre: x.nombre, tex: x.tex, conMuestra: true }));
  // Si las tres quedaron iguales se guarda una sola: se muestra en cada lugar.
  const porLugar = l.porLugar || (l.todo ? Object.fromEntries(d.ambientes.map((a) => [a.key, l.todo])) : {});

  if (modo === "igual") {
    const actual = l.todo || "";
    const elegida = buscarMuestra("piedras", actual)?.nombre || "";
    return (
      <>
        <SegModo modo={modo} setModo={setModo} />
        <Grupos opciones={piedras} elegida={elegida} onElegir={(n) => onValor(n)} />
        <Otro valor={elegida ? "" : actual} activo={!elegida && !!actual} placeholder={d.otro} onCambio={(t) => onValor(t)} />
      </>
    );
  }
  return (
    <>
      <SegModo modo={modo} setModo={setModo} />
      {d.ambientes.map((a) => {
        const actual = porLugar[a.key] || "";
        const elegida = buscarMuestra("piedras", actual)?.nombre || "";
        const poner = (v) => onValor(armarAmbientes({ porLugar: { ...porLugar, [a.key]: v } }, d.ambientes));
        return (
          <div key={a.key} className="mem-lugar">
            <div className="mem-lugar-cab"><b>{a.label}</b>{actual && <span>{elegida || actual}</span>}</div>
            <div className="mem-chips-elegir">
              {piedras.map((p) => (
                <button key={p.nombre} type="button" className={`mem-sug-op${elegida === p.nombre ? " on" : ""}`} aria-pressed={elegida === p.nombre}
                  onClick={() => poner(elegida === p.nombre ? "" : p.nombre)}>
                  {p.tex && <Muestra tex={p.tex} />} {p.nombre}
                </button>
              ))}
            </div>
            <input className="ui-input chico" value={elegida ? "" : actual} onChange={(e) => poner(e.target.value)} placeholder={`Otra piedra para ${a.label.toLowerCase()}`} />
          </div>
        );
      })}
    </>
  );
}

function SegModo({ modo, setModo }) {
  return (
    <div className="mem-seg ancho" role="radiogroup" aria-label="Cómo se elige">
      <button type="button" role="radio" aria-checked={modo === "igual"} className={modo === "igual" ? "on" : ""} onClick={() => setModo("igual")}>Igual en todo el barco</button>
      <button type="button" role="radio" aria-checked={modo === "lugares"} className={modo === "lugares" ? "on" : ""} onClick={() => setModo("lugares")}>Cocina, baños y cockpit</button>
    </div>
  );
}

function CuerpoLista({ d, valor, onValor, quitar }) {
  const texto = String(valor ?? "");
  const noLleva = /^\s*no lleva\s*$/i.test(texto);
  const lineas = noLleva ? [] : texto.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const tiene = (s) => lineas.some((x) => claveSimple(x) === claveSimple(s));
  const alternar = (s) => onValor((tiene(s) ? lineas.filter((x) => claveSimple(x) !== claveSimple(s)) : [...lineas, s]).join("\n"));
  return (
    <>
      <div className="mem-chips-elegir">
        {d.sugeridos.filter((s) => !quitar.has(claveDeOpcion(s))).map((s) => (
          <button key={s} type="button" className={`mem-sug-op${tiene(s) ? " on" : ""}`} aria-pressed={tiene(s)} onClick={() => alternar(s)}>
            {tiene(s) ? <Check size={12} /> : null} {s}
          </button>
        ))}
      </div>
      <textarea className="ui-input" rows={5} value={noLleva ? "" : texto} onChange={(e) => onValor(e.target.value)} placeholder={d.otro} />
      <button type="button" className={`mem-no-lleva${noLleva ? " on" : ""}`} aria-pressed={noLleva} onClick={() => onValor(noLleva ? "" : NO_LLEVA)}>
        <Ban size={14} /> {NO_LLEVA}
      </button>
    </>
  );
}

// Lo que la matriz de la línea ya resuelve para este campo.
//   serie: textos de materiales que vienen de serie.
//   opciones: nombres de opciones de la línea que corresponden a este campo.
//   quitar: claves que no hay que ofrecer como sugerencia.
function resueltoPorMatriz(campo, matrizLinea) {
  const out = { serie: [], opciones: [], quitar: new Set() };
  if (!matrizLinea) return out;
  if (campo.serie) out.serie.push(campo.serie);
  if (campo.key === "electronica") {
    for (const clave of ["vhf", "plotter", "piloto", "ais"]) {
      if (matrizLinea.deSerie.has(clave)) { out.serie.push(matrizLinea.deSerie.get(clave).descripcion); out.quitar.add(clave); }
    }
    for (const nombre of matrizLinea.opciones) {
      const clave = claveDeOpcion(nombre);
      if (["vhf", "plotter", "piloto", "ais"].includes(clave)) { out.opciones.push(nombre); out.quitar.add(clave); }
    }
  }
  const propia = matrizLinea.opciones.find((n) => claveSimple(n) === claveSimple(campo.label));
  if (propia && !out.opciones.includes(propia)) out.opciones.push(propia);
  return out;
}

export default function Elegir({ campo, seccion, valor, nota, puedeNota, linea, matrizLinea, posicion, total, faltan, onValor, onNota, onCerrar, onAnterior, onSiguiente, onSiguientePendiente }) {
  const d = DECISIONES[campo.key] || { tipo: "texto" };
  const resuelto = resueltoPorMatriz(campo, matrizLinea);

  useEffect(() => {
    const tecla = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);

  const definido = String(valor ?? "").trim() !== "";
  return createPortal(
    <div className="mem-panel-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <style href="klasea-memorias" precedence="default">{CSS_MEMORIAS}</style>
      <aside className="mem-panel" role="dialog" aria-modal="true" aria-label={campo.label}>
        <header className="mem-panel-cab">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mem-eyebrow">{seccion} · {posicion} de {total}</div>
            <h2>{campo.label}</h2>
          </div>
          <button type="button" className="mem-btn-ic chico" onClick={onCerrar} aria-label="Cerrar"><X size={15} /></button>
        </header>

        <div className="mem-panel-cuerpo" key={campo.key}>
          {resuelto.serie.length > 0 && (
            <div className="mem-info" data-tono="verde">
              <Layers3 size={15} />
              <span>De serie en la {linea}: <b>{resuelto.serie.join(" · ")}</b>{campo.key === "electronica" ? "" : ". Elegí sólo si este barco lleva otro o no lo lleva."}</span>
            </div>
          )}
          {resuelto.opciones.length > 0 && (
            <div className="mem-info" data-tono="azul">
              <ListChecks size={15} />
              <span>Se elige en las opciones de la {linea} (cambian la lista de materiales): <b>{resuelto.opciones.join(" · ")}</b>.</span>
            </div>
          )}
          {d.tipo === "opciones" && <CuerpoOpciones campo={campo} d={d} valor={valor} linea={linea} onValor={onValor} />}
          {d.tipo === "lleva" && <CuerpoLleva d={d} valor={valor} onValor={onValor} />}
          {d.tipo === "ambientes" && <CuerpoAmbientes d={d} valor={valor} onValor={onValor} />}
          {d.tipo === "lista" && <CuerpoLista d={d} valor={valor} onValor={onValor} quitar={resuelto.quitar} />}
          {puedeNota && (
            <label className="mem-otro">
              <span>Nota</span>
              <input className="ui-input" value={nota || ""} onChange={(e) => onNota(e.target.value)} placeholder={d.nota || "Aclaración, proveedor o pedido del cliente (opcional)"} />
            </label>
          )}
        </div>

        <footer className="mem-panel-pie">
          <button type="button" className="mem-btn-ic" onClick={onAnterior} disabled={posicion <= 1} aria-label="Anterior"><ChevronLeft size={17} /></button>
          <button type="button" className="mem-btn-ic" onClick={onSiguiente} disabled={posicion >= total} aria-label="Siguiente"><ChevronRight size={17} /></button>
          <span className="mem-sp" />
          {faltan > 0 ? (
            <button type="button" className={`ui-btn chico${definido ? " ui-btn-primario" : ""}`} onClick={onSiguientePendiente}>
              Siguiente sin definir <span className="mono">({faltan})</span> <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" className="ui-btn ui-btn-primario chico" onClick={onCerrar}><Check size={14} /> Todo definido</button>
          )}
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
