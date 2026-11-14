// Condicionante del día: una pregunta abierta. "¿Hay alguno que quieras
// definir hoy?" Se arma ahí mismo (qué agrega, quita o suma en la matriz), se
// puede saltear ("hoy no se me ocurre") o cerrar ("ya están todos"): con eso
// no se pregunta más.
import { useEffect, useState } from "react";
import { Check, Plus, Search, Undo2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  ACCIONES_CONDICIONANTE, TIPOS_CONDICIONANTE, buscarCatalogo, cargarCondicionantesLinea, deshacer, guardarCondicionante, responder,
} from "./revisionesApi";

function textoRespuesta(item) {
  const v = item.valor || {};
  switch (item.respuesta) {
    case "definido": return `Definiste «${v.nombre}» · ${v.items} ${v.items === 1 ? "material" : "materiales"}`;
    case "ninguno": return "Hoy no se definió ninguno";
    case "completo": return "Ya están todos definidos: no se pregunta más";
    case "cerrado": return "Cerrado: ya estaban todos definidos";
    case "no_aplica": return `No aplica${item.nota ? ` · ${item.nota}` : ""}`;
    default: return item.respuesta || "";
  }
}

export default function LoteCondicionante({ item, modelo, editable, onItem }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [existentes, setExistentes] = useState(null);
  const [definiendo, setDefiniendo] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let vivo = true;
    cargarCondicionantesLinea(modelo).then((d) => { if (vivo) setExistentes(d); }).catch(() => { if (vivo) setExistentes([]); });
    return () => { vivo = false; };
  }, [modelo, item.respuesta]);

  async function enviar(respuesta) {
    setBusy(true);
    try { onItem(await responder(item.id, respuesta)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function cerrarTodos() {
    const ok = await confirm({
      title: `¿Ya están todos los condicionantes de la K${modelo}?`,
      message: "No te vamos a preguntar más. Si después se te ocurre otro, lo cargás en Listas de compras › Condicionantes.",
      confirmLabel: "Sí, ya están todos",
    });
    if (ok) enviar("completo");
  }
  async function volverAtras() {
    setBusy(true);
    try { onItem(await deshacer(item.id)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="rv-cond">
      <div className="rv-cond-tit">
        <span className="rv-etapa-sub">Condicionante del día · K{modelo}</span>
        <h2>¿Hay algún condicionante que te gustaría definir hoy?</h2>
        <p>Un condicionante es algo que elige el cliente y que cambia la lista de materiales. Por ejemplo: si la motorización es Iveco cambia la línea de eje; si la grifería es negra cambian las griferías y los accesorios del baño.</p>
      </div>

      <div className="rv-campo">
        {existentes === null ? "Buscando los que ya tiene la línea…"
          : existentes.length ? `La K${modelo} ya tiene ${existentes.length} definido${existentes.length === 1 ? "" : "s"}:`
            : `La K${modelo} todavía no tiene condicionantes definidos.`}
        {existentes?.length > 0 && <div className="rv-chips">{existentes.map((c) => <span key={c.id} className="ui-chip">{c.nombre}</span>)}</div>}
      </div>

      {item.respuesta ? (
        <div className="rv-respuesta is-ok">
          <Check size={16} aria-hidden="true" />
          <span>{textoRespuesta(item)}{item.perfil?.username ? <small> · {item.perfil.username}</small> : null}</span>
          {editable && item.respuesta !== "cerrado" && <button type="button" className="ui-btn ui-btn-fantasma" disabled={busy} onClick={volverAtras}
            title={item.respuesta === "definido" ? "Borra el condicionante creado" : "Deshacer"}><Undo2 size={14} />Deshacer</button>}
        </div>
      ) : !editable ? (
        <div className="rv-ayuda" style={{ color: "var(--cyan)" }}>Todavía no lo contestaron.</div>
      ) : definiendo ? (
        <Definir item={item} modelo={modelo} onItem={onItem} onCancelar={() => setDefiniendo(false)} />
      ) : (
        <>
          <div className="rv-decidir">
            <button type="button" className="ui-btn ui-btn-primario" disabled={busy} onClick={() => setDefiniendo(true)}><Plus size={17} />Sí, definir uno</button>
            <button type="button" className="ui-btn" disabled={busy} onClick={() => enviar("ninguno")}>Hoy no se me ocurre ninguno</button>
          </div>
          <button type="button" className="ui-btn ui-btn-fantasma" style={{ justifySelf: "start" }} disabled={busy} onClick={cerrarTodos}>Ya están todos definidos, no preguntar más</button>
        </>
      )}
    </section>
  );
}

function Definir({ item, modelo, onItem, onCancelar }) {
  const toast = useToast();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("opcional_estandar");
  const [porDefecto, setPorDefecto] = useState(false);
  const [filas, setFilas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      buscarCatalogo(busqueda).then((r) => { if (vivo) setResultados(r); }).catch(() => { if (vivo) setResultados([]); });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [busqueda]);

  function agregar(material) {
    if (!filas.some((f) => f.material.id === material.id)) setFilas((prev) => [...prev, { material, accion: "extra", cantidad: "1" }]);
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

  return (
    <div className="rv-def">
      <label className="rv-campo">¿Qué elige el cliente?
        <input className="ui-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Motorización Iveco 400 · Grifería negra" autoFocus />
      </label>
      <div className="rv-campo">¿De qué tipo es?
        <div className="rv-segmentos">
          {TIPOS_CONDICIONANTE.map(([k, t]) => <button key={k} type="button" className="rv-seg" aria-pressed={tipo === k} onClick={() => setTipo(k)}>{t}</button>)}
        </div>
      </div>
      <div className="rv-campo">¿Viene en todos los barcos?
        <div className="rv-segmentos">
          <button type="button" className="rv-seg" aria-pressed={!porDefecto} onClick={() => setPorDefecto(false)}>No, sólo si el cliente lo elige</button>
          <button type="button" className="rv-seg" aria-pressed={porDefecto} onClick={() => setPorDefecto(true)}>Sí, viene de serie</button>
        </div>
      </div>
      <div className="rv-campo">¿Qué cambia en la matriz?
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
          {!filas.length && <span className="rv-ayuda">Buscá abajo los productos que agrega, quita o suma.</span>}
        </div>
        <div className="rv-buscador">
          <Search size={16} aria-hidden="true" />
          <input className="ui-input" aria-label="Buscar producto para agregar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto (descripción o código)" />
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
      <div className="rv-pie">
        <button type="button" className="ui-btn ui-btn-primario" disabled={busy || !valido} onClick={guardar}><Check size={16} />Guardar condicionante</button>
        <button type="button" className="ui-btn ui-btn-fantasma" disabled={busy} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}
