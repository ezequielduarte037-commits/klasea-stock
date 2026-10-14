import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Boxes, Check, ClipboardList, Copy, Eraser, Mail, Plus, Send, Ship, Trash2 } from "lucide-react";
import SelectorObra from "@/features/laminacion/SelectorObra";
import { buscarObra, claveObra, fmtNum, num } from "@/features/laminacion/obras";
import { Aviso, Bloque, Modal, Tag } from "@/features/laminacion/ui";
import { STOCK_MADERAS, textoMail } from "../datos";
import { borradorVacio, nuevoUid, paraEnviar } from "./borrador";
import { conListaDeObra } from "./listasMuebles";

const UNIDADES = ["placa", "tablón", "tabla", "panel", "listón", "unidad", "metro", "m²", "pies"];

// Armado del pedido, agrupado por destino como el mail de siempre: el stock del
// depósito y, si hace falta, una o más obras. Sale un solo pedido a Compras con
// un renglón por material, y queda para recibir en Ingresos.
export default function ArmarPedido({
  materiales, stockPorMaterial, enCaminoPorMaterial, obras, puedeGestionar,
  borrador, setBorrador, listaEstandar, onGenerar,
}) {
  const [copiado, setCopiado] = useState(false);
  // Dónde se dibuja la confirmación: en la raíz de la pantalla. Adentro del
  // bloque (que entra animado) el bloque de abajo la podía tapar.
  const [confirmar, setConfirmar] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [intento, setIntento] = useState(false);
  const [foco, setFoco] = useState(null);
  const raiz = useRef(null);

  // El renglón recién agregado queda listo para cargar la cantidad.
  useEffect(() => {
    if (!foco) return;
    const el = raiz.current?.querySelector(`[data-foco="${foco}"]`);
    el?.focus();
    el?.select?.();
  }, [foco]);

  const matDe = (id) => materiales.find((m) => String(m.id) === String(id));
  const porCategoria = useMemo(() => {
    const grupos = new Map();
    for (const m of materiales) {
      const c = m.categoria || "Otros";
      if (!grupos.has(c)) grupos.set(c, []);
      grupos.get(c).push(m);
    }
    return [...grupos.entries()];
  }, [materiales]);

  const envio = useMemo(() => paraEnviar(borrador), [borrador]);
  const mail = useMemo(() => textoMail({
    grupos: envio.grupos.filter((g) => g.tipo === "obra").map((g) => ({ nombre: g.obra, destino: g.recibirEn, items: g.items })),
    stockItems: envio.grupos.find((g) => g.tipo === "stock")?.items ?? [],
    destinatario: borrador.para,
  }), [envio, borrador.para]);

  const vacio = borrador.grupos.every((g) => !g.items.length) && borrador.grupos.length === 1;
  const listo = envio.total > 0 && !envio.problemas.length;

  function actualizarGrupo(uid, cambio) {
    setBorrador((b) => ({ ...b, grupos: b.grupos.map((g) => (g.uid === uid ? { ...g, ...cambio(g) } : g)) }));
  }

  function agregarMaterial(grupoUid, valor) {
    if (!valor) return;
    const grupo = borrador.grupos.find((g) => g.uid === grupoUid);
    if (!grupo) return;
    if (valor === "__libre__") {
      const uid = nuevoUid();
      actualizarGrupo(grupoUid, (g) => ({ items: [...g.items, { uid, material_id: null, descripcion: "", cantidad: "", unidad: "placa" }] }));
      setFoco(`desc-${uid}`);
      return;
    }
    const ya = grupo.items.find((it) => String(it.material_id) === String(valor));
    if (ya) { setFoco(`cant-${ya.uid}`); return; }
    const mat = matDe(valor);
    const uid = nuevoUid();
    actualizarGrupo(grupoUid, (g) => ({ items: [...g.items, { uid, material_id: mat.id, descripcion: mat.nombre, cantidad: "", unidad: mat.unidad_medida || "u" }] }));
    setFoco(`cant-${uid}`);
  }

  function editarItem(grupoUid, itemUid, campo, valor) {
    actualizarGrupo(grupoUid, (g) => ({ items: g.items.map((it) => (it.uid === itemUid ? { ...it, [campo]: valor } : it)) }));
  }

  function quitarItem(grupoUid, itemUid) {
    actualizarGrupo(grupoUid, (g) => ({ items: g.items.filter((it) => it.uid !== itemUid) }));
  }

  // Al sumar una obra viene con la lista estándar de su línea (la de Muebles).
  function sumarObra(valor, obra) {
    if (!valor) return;
    const clave = claveObra(valor);
    const ya = borrador.grupos.find((g) => g.tipo === "obra" && claveObra(g.obra) === clave);
    if (ya) return;
    const lista = obra ? listaEstandar?.(obra) : null;
    setBorrador((b) => conListaDeObra(b, obra?.valor || valor, lista?.renglones ?? [], lista?.fuente || ""));
  }

  function quitarGrupo(uid) {
    setBorrador((b) => ({ ...b, grupos: b.grupos.filter((g) => g.uid !== uid) }));
  }

  function copiar() {
    navigator.clipboard.writeText(mail).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    });
  }

  async function generar() {
    if (enviando) return;
    setEnviando(true);
    try {
      const ok = await onGenerar({ ...envio, mail, urgente: borrador.urgente });
      if (ok) {
        setConfirmar(null);
        setIntento(false);
        setBorrador(borradorVacio());
      }
    } finally {
      setEnviando(false);
    }
  }

  function pedirConfirmacion() {
    setIntento(true);
    if (listo) setConfirmar(raiz.current?.closest(".lam") || document.body);
  }

  return (
    <Bloque
      icono={ClipboardList}
      tono="azul"
      titulo="Armar pedido"
      texto="Agregá lo que hace falta para el stock y, si corresponde, para cada obra. Sale un solo pedido a Compras y el mail para el proveedor queda listo para copiar."
      der={!vacio && <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => { setBorrador(borradorVacio()); setIntento(false); }}><Eraser size={14} /> Vaciar</button>}
      style={{ scrollMarginTop: 12 }}
    >
      <div className="mad-armar" ref={raiz} id="mad-armar-pedido">
        <div className="mad-grupos">
          {borrador.grupos.map((g) => {
            const obra = g.tipo === "obra" ? buscarObra(obras, g.obra) : null;
            return (
              <section key={g.uid} className="mad-grupo">
                <div className="mad-grupo-cab">
                  <span className="mad-grupo-ic" data-tono={g.tipo === "stock" ? "teal" : "azul"}>
                    {g.tipo === "stock" ? <Boxes size={15} /> : <Ship size={15} />}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="mad-grupo-tit">{g.tipo === "stock" ? "Stock" : <>Obra <span className="mono">{obra?.codigo || g.obra}</span></>}</div>
                    <div className="mad-grupo-sub">
                      {g.tipo === "stock"
                        ? `${STOCK_MADERAS} · reposición general`
                        : [obra ? `${obra.lineaLabel}${obra.estado !== "activa" ? ` · ${obra.estado}` : ""}` : "Obra escrita a mano", g.fuente ? `lista: ${g.fuente}` : ""].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {g.tipo === "obra" && (
                    <div className="der">
                      <input
                        className="ui-input mad-recibir"
                        value={g.recibirEn}
                        onChange={(e) => actualizarGrupo(g.uid, () => ({ recibirEn: e.target.value }))}
                        placeholder="Recibir en… (opcional)"
                        aria-label={`Dónde se recibe lo de la obra ${g.obra}`}
                        title="Va en el mail: «(Recibir en …)». Si se recibe en el depósito, dejalo vacío."
                      />
                      <button type="button" className="lam-btn-ic chico peligro" onClick={() => quitarGrupo(g.uid)} aria-label={`Sacar la obra ${g.obra} del pedido`} title="Sacar esta obra del pedido"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>

                <div className="mad-lineas">
                  {!g.items.length && (
                    <div className="mad-vacio-grupo">
                      {g.tipo === "stock"
                        ? "Nada para el stock todavía. Elegí abajo o sumá desde «Para reponer»."
                        : "Esta línea no tiene lista estándar en Muebles: elegí abajo lo que lleva la obra."}
                    </div>
                  )}
                  {g.items.map((it) => {
                    const mat = it.material_id ? matDe(it.material_id) : null;
                    const stock = mat ? num(stockPorMaterial[mat.id]) : null;
                    const enCamino = mat ? num(enCaminoPorMaterial[mat.id]) : 0;
                    const tonoStock = stock == null ? undefined : stock <= 0 ? "rojo" : stock <= num(mat.stock_minimo) ? "cian" : "verde";
                    const sinCant = intento && num(it.cantidad) <= 0;
                    const sinDesc = intento && !mat && !String(it.descripcion).trim();
                    return (
                      <div key={it.uid} className="mad-linea">
                        <div style={{ minWidth: 0 }}>
                          {mat ? (
                            <div className="mad-linea-nom">{mat.nombre}</div>
                          ) : (
                            <input
                              className="ui-input"
                              data-foco={`desc-${it.uid}`}
                              value={it.descripcion}
                              onChange={(e) => editarItem(g.uid, it.uid, "descripcion", e.target.value)}
                              placeholder="Qué madera es…"
                              aria-label="Descripción del material"
                              style={{ minHeight: 34, ...(sinDesc ? { borderColor: "var(--red-border)" } : {}) }}
                            />
                          )}
                          <div className="mad-linea-meta">
                            {mat ? (
                              <>
                                <span data-tono={tonoStock}>Hay <b>{fmtNum(stock)}</b> {mat.unidad_medida}</span>
                                {enCamino > 0 && <span data-tono="azul">En camino <b>{fmtNum(enCamino)}</b></span>}
                              </>
                            ) : (
                              <Tag tono="violeta">Fuera del catálogo</Tag>
                            )}
                          </div>
                        </div>
                        <div className="mad-cant">
                          <input
                            className="ui-input num"
                            data-foco={`cant-${it.uid}`}
                            type="number" min="1" step="1" inputMode="numeric"
                            placeholder="0"
                            value={it.cantidad}
                            onChange={(e) => editarItem(g.uid, it.uid, "cantidad", e.target.value)}
                            aria-label={`Cantidad de ${mat?.nombre || it.descripcion || "material"}`}
                            style={sinCant ? { borderColor: "var(--red-border)" } : undefined}
                          />
                          {mat ? (
                            <span className="uni">{it.unidad}</span>
                          ) : (
                            <input className="ui-input uni-in" list="mad-unidades" value={it.unidad} onChange={(e) => editarItem(g.uid, it.uid, "unidad", e.target.value)} aria-label="Unidad" />
                          )}
                        </div>
                        <button type="button" className="lam-btn-ic chico peligro" onClick={() => quitarItem(g.uid, it.uid)} aria-label={`Quitar ${mat?.nombre || it.descripcion || "material"}`}><Trash2 size={13} /></button>
                      </div>
                    );
                  })}
                </div>

                <div className="mad-agregar">
                  <Plus size={15} style={{ color: "var(--subtle)", flexShrink: 0 }} />
                  <select className="ui-input" value="" onChange={(e) => agregarMaterial(g.uid, e.target.value)} aria-label={g.tipo === "stock" ? "Agregar material para el stock" : `Agregar material para la obra ${g.obra}`}>
                    <option value="">Agregar material…</option>
                    {porCategoria.map(([cat, mats]) => (
                      <optgroup key={cat} label={cat}>
                        {mats.map((m) => (
                          <option key={m.id} value={m.id}>{m.nombre} · hay {fmtNum(stockPorMaterial[m.id])} {m.unidad_medida}</option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__libre__">Otro, fuera del catálogo…</option>
                  </select>
                </div>
              </section>
            );
          })}

          <div className="mad-sumar-obra">
            <span>¿Va madera para una obra? Viene con su lista estándar.</span>
            <SelectorObra
              obras={obras}
              value=""
              onChange={sumarObra}
              placeholder="Sumar una obra al pedido…"
              conDesmolde={false}
            />
          </div>
          <datalist id="mad-unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
        </div>

        <aside className="mad-envio" aria-label="Mail y envío">
          <div className="mad-envio-cab">
            <Mail size={15} style={{ color: "var(--blue)" }} />
            <span style={{ fontSize: 13.5, fontWeight: 650 }}>Mail para el proveedor</span>
            <span className="lam-sp" />
            <button type="button" className="ui-btn chico" onClick={copiar} disabled={!envio.total}>
              {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
          </div>
          <label className="lam-campo c6" style={{ gridColumn: "auto" }}><span>Para</span>
            <input className="ui-input" value={borrador.para} onChange={(e) => setBorrador((b) => ({ ...b, para: e.target.value }))} placeholder="David" />
          </label>
          <textarea readOnly className="mad-mail" value={mail} aria-label="Texto del mail" />

          <div className="mad-resumen">
            <span><b>{envio.total}</b> {envio.total === 1 ? "material" : "materiales"}</span>
            <span><b>{envio.grupos.length}</b> {envio.grupos.length === 1 ? "destino" : "destinos"}</span>
          </div>
          {intento && envio.problemas.length > 0 && (
            <Aviso tono="rojo">{envio.problemas[0]}</Aviso>
          )}
          {puedeGestionar ? (
            <>
              <label className="mad-check">
                <input type="checkbox" checked={borrador.urgente} onChange={(e) => setBorrador((b) => ({ ...b, urgente: e.target.checked }))} />
                Es urgente (Compras lo ve como urgente)
              </label>
              <button type="button" className="ui-btn ui-btn-primario" disabled={!envio.total || enviando} onClick={pedirConfirmacion}>
                <Send size={15} /> Mandar a Compras{envio.total ? ` · ${envio.total}` : ""}
              </button>
              <p className="lam-ayuda">Queda registrado para recibir en Ingresos y sale a Compras con un renglón por material.</p>
            </>
          ) : (
            <p className="lam-ayuda">Sólo Oficina, Técnica o Administración pueden mandar el pedido a Compras.</p>
          )}
        </aside>
      </div>

      {confirmar && createPortal(
        <Modal
          ancho
          onCerrar={() => setConfirmar(null)}
          bloqueado={enviando}
          icono={Send}
          titulo="Mandar el pedido a Compras"
          sub={`${envio.total} ${envio.total === 1 ? "material" : "materiales"} en ${envio.grupos.length} ${envio.grupos.length === 1 ? "destino" : "destinos"}${borrador.urgente ? " · urgente" : ""}.`}
          pie={(
            <>
              <button type="button" className="ui-btn" onClick={() => setConfirmar(null)} disabled={enviando}>Volver</button>
              <button type="button" className="ui-btn ui-btn-primario" onClick={generar} disabled={enviando}>{enviando ? "Mandando…" : "Confirmar y mandar"}</button>
            </>
          )}
        >
          {envio.grupos.map((g) => (
            <div key={g.uid} style={{ display: "grid", gap: 6 }}>
              <div className="lam-lado-et">{g.tipo === "stock" ? `Stock · ${STOCK_MADERAS}` : `Obra ${buscarObra(obras, g.obra)?.codigo || g.obra}${g.recibirEn ? ` · recibir en ${g.recibirEn}` : ""}`}</div>
              <div className="lam-lista-mod">
                {g.items.map((it) => (
                  <div key={it.uid}>
                    <span>
                      <b style={{ fontWeight: 600 }}>{it.descripcion}</b>
                      {!it.material_id && <span className="lam-tag" data-tono="violeta" style={{ marginLeft: 6 }}>Fuera del catálogo</span>}
                    </span>
                    <span className="lam-cant">{fmtNum(it.cantidad)} <small>{it.unidad}</small></span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {envio.grupos.some((g) => g.items.some((it) => !it.material_id)) && (
            <Aviso tono="violeta">Lo que está fuera del catálogo no se puede sumar al stock hasta vincularlo con un material al recibirlo.</Aviso>
          )}
        </Modal>,
        confirmar,
      )}
    </Bloque>
  );
}
