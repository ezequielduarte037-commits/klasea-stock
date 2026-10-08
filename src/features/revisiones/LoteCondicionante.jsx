// Condicionante del día: definir qué cambia en la matriz cuando el cliente
// elige algo (motorización, grifería negra, hard top…), o revisar uno que ya
// existe. Se guarda directo en los condicionantes de la línea.
import { useEffect, useState } from "react";
import { Check, Plus, Search, Undo2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ACCIONES_CONDICIONANTE, TIPOS_CONDICIONANTE, buscarCatalogo, deshacer, guardarCondicionante, responder } from "./revisionesApi";
import { fmtNum, unidadDe } from "./revisionesFormato";

const NOMBRE_TIPO = Object.fromEntries(TIPOS_CONDICIONANTE);
const NOMBRE_ACCION = Object.fromEntries(ACCIONES_CONDICIONANTE);

function textoCondicionante(item) {
  const v = item.valor || {};
  if (item.respuesta === "definido") return `Condicionante creado: «${v.nombre}» · ${v.items} ${v.items === 1 ? "material" : "materiales"}`;
  if (item.respuesta === "no_aplica") return `No aplica a esta línea${item.nota ? ` · ${item.nota}` : ""}`;
  if (item.respuesta === "ok") return "Está bien definido";
  if (item.respuesta === "corregir") return `Hay que corregir · ${item.nota || ""}`;
  return item.respuesta || "";
}

export default function LoteCondicionante({ item, modelo, editable, onItem }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const c = item.contexto || {};

  async function volverAtras() {
    setBusy(true);
    try { onItem(await deshacer(item.id)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  const respondido = item.respuesta ? (
    <div className={`rv-respuesta ${item.respuesta === "corregir" ? "is-mal" : "is-ok"}`}>
      {item.respuesta === "corregir" ? <X size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
      <span>{textoCondicionante(item)}{item.perfil?.username ? <small> · {item.perfil.username}</small> : null}</span>
      {editable && <button type="button" className="ui-btn ui-btn-fantasma" disabled={busy} onClick={volverAtras}
        title={item.respuesta === "definido" ? "Borra el condicionante creado" : "Deshacer"}><Undo2 size={14} />Deshacer</button>}
    </div>
  ) : null;

  if (item.tipo === "condicionante_existente") {
    return (
      <section className="rv-cond">
        <div className="rv-cond-tit">
          <span className="rv-etapa-sub">Revisar un condicionante de la K{modelo}</span>
          <h2>{c.nombre}</h2>
          <p>{NOMBRE_TIPO[c.tipo] || "Condicionante"} · {c.por_defecto ? "viene en todos los barcos salvo que se saque" : "se agrega cuando el cliente lo elige"}</p>
        </div>
        <div className="rv-cond-items">
          {(c.items || []).map((it, k) => (
            <div key={k} className="rv-cond-item" style={{ gridTemplateColumns: "auto minmax(0, 1fr) auto" }}>
              <span className={`rv-accion-chip is-${it.accion}`}>{NOMBRE_ACCION[it.accion] || it.accion}</span>
              <span>{it.descripcion}</span>
              <span className="rv-ayuda">{fmtNum(it.cantidad)} {unidadDe(it.unidad, it.cantidad)}</span>
            </div>
          ))}
          {!(c.items || []).length && <p className="rv-ayuda">No tiene materiales cargados.</p>}
        </div>
        {respondido || (editable ? <Revisar item={item} onItem={onItem} /> : <div className="rv-ayuda" style={{ color: "var(--cyan)" }}>Sin revisar</div>)}
        <p className="rv-ayuda">Para cambiarlo: Listas de compras › Condicionantes.</p>
      </section>
    );
  }

  return (
    <section className="rv-cond">
      <div className="rv-cond-tit">
        <span className="rv-etapa-sub">Condicionante del día · K{modelo}</span>
        <h2>{c.titulo}</h2>
        <p>{c.pregunta}</p>
      </div>
      {(c.ejemplos || []).map((e, k) => (
        <div key={k} className="rv-ejemplo">Como referencia, en la {e.linea} ya está «{e.nombre}» con {e.items} {e.items === 1 ? "material" : "materiales"}.</div>
      ))}
      {respondido || (editable ? <Definir item={item} modelo={modelo} onItem={onItem} /> : <div className="rv-ayuda" style={{ color: "var(--cyan)" }}>Sin definir</div>)}
    </section>
  );
}

function Revisar({ item, onItem }) {
  const toast = useToast();
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  async function enviar(respuesta, texto = null) {
    setBusy(true);
    try { onItem(await responder(item.id, respuesta, null, texto)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  return corrigiendo ? (
    <form className="rv-form" onSubmit={(e) => { e.preventDefault(); enviar("corregir", nota); }}>
      <label>¿Qué hay que corregir?<input className="ui-input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: falta la bomba de achique" autoFocus /></label>
      <button type="submit" className="ui-btn ui-btn-primario" disabled={busy || !nota.trim()}>Guardar</button>
      <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setCorrigiendo(false)} aria-label="Cancelar"><X size={16} /></button>
    </form>
  ) : (
    <div className="rv-decidir">
      <button type="button" className="ui-btn rv-btn-bien" disabled={busy} onClick={() => enviar("ok")}><Check size={18} />Está bien</button>
      <button type="button" className="ui-btn ui-btn-peligro" disabled={busy} onClick={() => setCorrigiendo(true)}><X size={18} />Hay que corregir</button>
    </div>
  );
}

function Definir({ item, modelo, onItem }) {
  const toast = useToast();
  const c = item.contexto || {};
  const [nombre, setNombre] = useState(c.titulo || "");
  const [tipo, setTipo] = useState(c.tipo || "opcional_estandar");
  const [porDefecto, setPorDefecto] = useState(false);
  const [filas, setFilas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [noAplica, setNoAplica] = useState(false);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      buscarCatalogo(busqueda).then((r) => { if (vivo) setResultados(r); }).catch(() => { if (vivo) setResultados([]); });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [busqueda]);

  function agregar(material) {
    if (filas.some((f) => f.material.id === material.id)) return;
    setFilas((prev) => [...prev, { material, accion: "extra", cantidad: "1" }]);
    setBusqueda("");
  }
  const valido = nombre.trim().length >= 3 && filas.length > 0 && filas.every((f) => Number(String(f.cantidad).replace(",", ".")) > 0);

  async function guardar() {
    setBusy(true);
    try {
      onItem(await guardarCondicionante(item.id, {
        nombre: nombre.trim(), tipo, porDefecto,
        items: filas.map((f) => ({ ...f, cantidad: String(f.cantidad).replace(",", ".") })),
      }));
      toast.success(`Condicionante «${nombre.trim()}» guardado en la K${modelo}.`);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function marcarNoAplica() {
    setBusy(true);
    try { onItem(await responder(item.id, "no_aplica", null, nota)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <p className="rv-ayuda">Un condicionante dice qué cambia en la matriz cuando el cliente elige algo: qué productos agrega, cuáles quita y cuánto suma.</p>
      <label className="rv-campo">Nombre
        <input className="ui-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Motorización Iveco 400" />
      </label>
      <div className="rv-campo">Tipo
        <div className="rv-segmentos">
          {TIPOS_CONDICIONANTE.map(([k, t]) => <button key={k} type="button" className="rv-seg" aria-pressed={tipo === k} onClick={() => setTipo(k)}>{t}</button>)}
        </div>
      </div>
      <div className="rv-campo">¿Viene en todos los barcos de la línea, salvo que se saque?
        <div className="rv-segmentos">
          <button type="button" className="rv-seg" aria-pressed={!porDefecto} onClick={() => setPorDefecto(false)}>No, sólo si el cliente lo elige</button>
          <button type="button" className="rv-seg" aria-pressed={porDefecto} onClick={() => setPorDefecto(true)}>Sí, viene de serie</button>
        </div>
      </div>
      <div className="rv-campo">Qué cambia en la matriz
        <div className="rv-cond-items">
          {filas.map((f, k) => (
            <div key={f.material.id} className="rv-cond-item">
              <span>{f.material.descripcion}</span>
              <div className="rv-segmentos">
                {ACCIONES_CONDICIONANTE.map(([a, t]) => (
                  <button key={a} type="button" className="rv-seg" aria-pressed={f.accion === a}
                    onClick={() => setFilas((prev) => prev.map((x, j) => (j === k ? { ...x, accion: a } : x)))}>{t}</button>
                ))}
              </div>
              <input className="ui-input" inputMode="decimal" aria-label="Cantidad" value={f.cantidad}
                onChange={(e) => setFilas((prev) => prev.map((x, j) => (j === k ? { ...x, cantidad: e.target.value } : x)))} />
              <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" aria-label="Quitar" onClick={() => setFilas((prev) => prev.filter((_, j) => j !== k))}><X size={15} /></button>
            </div>
          ))}
        </div>
        <div className="rv-form">
          <label style={{ minWidth: 0 }}>
            <input className="ui-input" aria-label="Buscar producto para agregar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto para agregar (descripción o código)" />
          </label>
          <Search size={16} aria-hidden="true" style={{ alignSelf: "center", color: "var(--dim)" }} />
        </div>
        {busqueda.trim().length >= 2 && (
          <div className="rv-resultados">
            {resultados.map((p) => (
              <button key={p.id} type="button" className="rv-resultado" onClick={() => agregar(p)}>
                <span><Plus size={12} aria-hidden="true" /> {p.descripcion}</span>
                <small>{[p.codigo ? `Cód. ${p.codigo}` : null, p.proveedor].filter(Boolean).join(" · ") || "Sin código"}</small>
              </button>
            ))}
            {!resultados.length && <small className="rv-ayuda">Sin resultados.</small>}
          </div>
        )}
      </div>
      {noAplica ? (
        <form className="rv-form" onSubmit={(e) => { e.preventDefault(); marcarNoAplica(); }}>
          <label>¿Por qué no aplica? (opcional)<input className="ui-input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: la K55 siempre lleva el mismo motor" autoFocus /></label>
          <button type="submit" className="ui-btn ui-btn-primario" disabled={busy}>Confirmar</button>
          <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setNoAplica(false)} aria-label="Cancelar"><X size={16} /></button>
        </form>
      ) : (
        <div className="rv-pie">
          <button type="button" className="ui-btn ui-btn-primario" disabled={busy || !valido} onClick={guardar}><Check size={16} />Guardar condicionante</button>
          <button type="button" className="ui-btn" disabled={busy} onClick={() => setNoAplica(true)}>No aplica a la K{modelo}</button>
        </div>
      )}
    </>
  );
}
