// Productos de la matriz, de a uno: "Está bien" / "Está mal". Lo que se usó
// en varias obras y no está en la matriz se ofrece para agregar.
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, List, Plus, Rows3, Undo2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { deshacer, responder } from "./revisionesApi";
import { fmtNum, unidadDe } from "./revisionesFormato";

const MAL = new Set(["cantidad", "no_va", "otro"]);

function textoProducto(item) {
  const v = item.valor || {};
  switch (`${item.tipo}:${item.respuesta}`) {
    case "matriz:ok": return "Está bien";
    case "matriz:cantidad": return `Está mal · corregido a ${fmtNum(v.cantidad)} por barco`;
    case "matriz:no_va": return "Está mal · se sacó de la matriz";
    case "matriz:otro": return `Está mal · ${item.nota || ""}`;
    case "falta:agregar": return `Agregado a la matriz · ${fmtNum(v.cantidad)} por barco`;
    case "falta:no_agregar": return "No va en la matriz";
    default: return item.respuesta || "";
  }
}

function siguienteSinResponder(items, desde) {
  for (let k = 1; k <= items.length; k += 1) {
    const j = (desde + k) % items.length;
    if (!items[j].respuesta) return j;
  }
  return -1;
}

export default function LoteProductos({ items, editable, onItem }) {
  const [idx, setIdx] = useState(() => Math.max(0, items.findIndex((i) => !i.respuesta)));
  const [enLista, setEnLista] = useState(false);
  const actual = Math.min(idx, items.length - 1);
  const item = items[actual];

  useEffect(() => {
    if (enLista) return undefined;
    function onKey(e) {
      if (e.target.closest?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") setIdx((i) => Math.min(items.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enLista, items.length]);

  if (!item) return null;

  if (enLista) {
    return (
      <div className="rv-foco">
        <div className="rv-foco-nav">
          <span className="rv-ayuda" style={{ flex: 1 }}>{items.filter((i) => i.respuesta).length} de {items.length} revisados</span>
          <button type="button" className="ui-btn" onClick={() => setEnLista(false)}><Rows3 size={15} />De a uno</button>
        </div>
        <div className="rv-lista-items">
          {items.map((it, j) => (
            <button key={it.id} type="button" className="rv-fila" onClick={() => { setIdx(j); setEnLista(false); }}>
              <span><b>{it.contexto?.descripcion}</b><small>{it.respuesta ? textoProducto(it) : it.tipo === "falta" ? "Se usa y no está en la matriz" : `${fmtNum(it.contexto?.cantidad)} ${unidadDe(it.contexto?.unidad, it.contexto?.cantidad)} por barco`}</small></span>
              {it.respuesta ? (MAL.has(it.respuesta) ? <X size={16} className="is-mal" aria-label="Está mal" /> : <Check size={16} className="is-ok" aria-label="Revisado" />) : null}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rv-foco">
      <div className="rv-foco-nav">
        <button type="button" className="ui-btn ui-btn-icono" disabled={actual === 0} onClick={() => setIdx(actual - 1)} aria-label="Anterior"><ArrowLeft size={16} /></button>
        <div className="rv-puntos" aria-label="Avance del lote">
          {items.map((it, j) => (
            <button key={it.id} type="button" aria-label={`Producto ${j + 1}`} onClick={() => setIdx(j)}
              className={`${it.respuesta ? (MAL.has(it.respuesta) ? "is-mal" : "is-ok") : ""}${j === actual ? " is-actual" : ""}`} />
          ))}
        </div>
        <button type="button" className="ui-btn ui-btn-icono" disabled={actual >= items.length - 1} onClick={() => setIdx(actual + 1)} aria-label="Siguiente"><ArrowRight size={16} /></button>
        <button type="button" className="ui-btn ui-btn-icono" onClick={() => setEnLista(true)} title="Ver como lista" aria-label="Ver como lista"><List size={16} /></button>
      </div>
      <TarjetaProducto key={item.id} item={item} posicion={actual + 1} total={items.length} editable={editable}
        onRespondido={(nuevo) => {
          onItem(nuevo);
          const resto = items.map((it) => (it.id === nuevo.id ? nuevo : it));
          const prox = nuevo.respuesta ? siguienteSinResponder(resto, actual) : -1;
          if (prox >= 0) setIdx(prox);
        }}
        siguiente={siguienteSinResponder(items, actual)} onSiguiente={setIdx} />
    </div>
  );
}

function TarjetaProducto({ item, posicion, total, editable, onRespondido, siguiente, onSiguiente }) {
  const toast = useToast();
  const c = item.contexto || {};
  const [modo, setModo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cantidad, setCantidad] = useState(() => String(c.cantidad_sugerida ?? c.cantidad ?? ""));
  const [nota, setNota] = useState("");
  const usado = Number(c.obras_uso) || 0;
  const cantidadOk = Number(String(cantidad).replace(",", ".")) > 0;

  async function enviar(respuesta, valor = null, notaTexto = null) {
    setBusy(true);
    try { onRespondido(await responder(item.id, respuesta, valor, notaTexto)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function volverAtras() {
    setBusy(true);
    try { onRespondido(await deshacer(item.id)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!editable || item.respuesta || item.tipo !== "matriz" || modo !== null) return undefined;
    function onKey(e) {
      if (e.target.closest?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey || busy) return;
      if (e.key === "b" || e.key === "B") { e.preventDefault(); enviar("ok"); }
      if (e.key === "m" || e.key === "M") { e.preventDefault(); setModo("mal"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <article className="rv-tarjeta">
      <div className="rv-tarjeta-rubro">
        <span className="ui-chip">{c.rubro || "Sin rubro"}</span>
        <span className="rv-ayuda">{posicion} de {total}</span>
      </div>
      <h2>{c.descripcion || "Sin descripción"}</h2>
      {c.requisito && <div className="rv-tarjeta-req">Requisito: {c.requisito}</div>}
      <div className="rv-datos">
        {item.tipo === "matriz" && <div className="rv-dato"><small>Por barco</small><b>{fmtNum(c.cantidad)} {unidadDe(c.unidad, c.cantidad)}</b></div>}
        {item.tipo === "falta" && c.cantidad_sugerida != null && <div className="rv-dato"><small>Se usó por obra</small><b>unos {fmtNum(c.cantidad_sugerida)} {unidadDe(c.unidad, c.cantidad_sugerida)}</b></div>}
        {c.proveedor && <div className="rv-dato"><small>Proveedor</small><b>{c.proveedor}</b></div>}
        {c.codigo && <div className="rv-dato"><small>Código</small><b>{c.codigo}</b></div>}
      </div>
      {item.tipo === "falta"
        ? <div className="rv-señal is-falta">Se usó en {c.obras?.join(", ")} y no está en la matriz. ¿Va en todos los barcos?</div>
        : usado > 0
          ? <div className="rv-señal is-uso">Se usó en {usado} {usado === 1 ? "obra" : "obras"} de la línea.</div>
          : <div className="rv-señal is-sinuso">No figura usado en ninguna obra de la línea: fijate si de verdad va.</div>}
      {c.producto_a_definir && <div className="rv-ayuda">El producto exacto depende del cliente: se elige más adelante, barco por barco.</div>}

      {item.respuesta ? (
        <>
          <div className={`rv-respuesta ${MAL.has(item.respuesta) ? "is-mal" : "is-ok"}`}>
            {MAL.has(item.respuesta) ? <X size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
            <span>{textoProducto(item)}{item.perfil?.username ? <small> · {item.perfil.username}</small> : null}</span>
            {editable && <button type="button" className="ui-btn ui-btn-fantasma" disabled={busy} onClick={volverAtras}><Undo2 size={14} />Deshacer</button>}
          </div>
          {siguiente >= 0 && <button type="button" className="ui-btn ui-btn-suave" onClick={() => onSiguiente(siguiente)}>Siguiente sin revisar<ArrowRight size={15} /></button>}
        </>
      ) : !editable ? (
        <div className="rv-ayuda" style={{ color: "var(--cyan)" }}>Sin revisar</div>
      ) : item.tipo === "falta" ? (
        modo === "agregar" ? (
          <form className="rv-form" onSubmit={(e) => { e.preventDefault(); enviar("agregar", { cantidad: Number(cantidad.replace(",", ".")) }); }}>
            <label>Cantidad por barco<input className="ui-input" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus /></label>
            <button type="submit" className="ui-btn ui-btn-primario" disabled={busy || !cantidadOk}>Agregar</button>
            <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setModo(null)} aria-label="Cancelar"><X size={16} /></button>
          </form>
        ) : (
          <div className="rv-decidir">
            <button type="button" className="ui-btn rv-btn-bien" disabled={busy} onClick={() => setModo("agregar")}><Plus size={17} />Agregar a la matriz</button>
            <button type="button" className="ui-btn" disabled={busy} onClick={() => enviar("no_agregar")}>No va</button>
          </div>
        )
      ) : modo === null ? (
        <div className="rv-decidir">
          <button type="button" className="ui-btn rv-btn-bien" disabled={busy} onClick={() => enviar("ok")}><Check size={18} />Está bien <span className="rv-kbd">B</span></button>
          <button type="button" className="ui-btn ui-btn-peligro" disabled={busy} onClick={() => setModo("mal")}><X size={18} />Está mal <span className="rv-kbd">M</span></button>
        </div>
      ) : (
        <div className="rv-mal">
          {modo === "mal" && <div className="rv-mal-opciones">
            <button type="button" className="ui-btn" onClick={() => setModo("cantidad")}>Otra cantidad</button>
            <button type="button" className="ui-btn ui-btn-peligro" disabled={busy} onClick={() => enviar("no_va")}>No va en la matriz</button>
            <button type="button" className="ui-btn" onClick={() => setModo("otro")}>Otra cosa</button>
            <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => setModo(null)}>Cancelar</button>
          </div>}
          {modo === "cantidad" && (
            <form className="rv-form" onSubmit={(e) => { e.preventDefault(); enviar("cantidad", { cantidad: Number(cantidad.replace(",", ".")) }); }}>
              <label>¿Cuánto lleva cada barco?<input className="ui-input" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus /></label>
              <button type="submit" className="ui-btn ui-btn-primario" disabled={busy || !cantidadOk}>Guardar</button>
              <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setModo("mal")} aria-label="Volver"><X size={16} /></button>
            </form>
          )}
          {modo === "otro" && (
            <form className="rv-form" onSubmit={(e) => { e.preventDefault(); enviar("otro", null, nota); }}>
              <label>¿Qué está mal?<input className="ui-input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: es de 1/2, no de 3/8" autoFocus /></label>
              <button type="submit" className="ui-btn ui-btn-primario" disabled={busy || !nota.trim()}>Guardar</button>
              <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setModo("mal")} aria-label="Volver"><X size={16} /></button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
