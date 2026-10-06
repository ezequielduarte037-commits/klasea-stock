import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  Link2,
  LoaderCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { fetchPanolCatalogMini } from "@/features/panol/panolApi";
import { topMaterialMatches } from "@/features/panol/materialMatch";
import Cargando from "@/components/ui/Cargando";
import {
  addRequestItem,
  createPurchaseRequest,
  notifyComprasEmail,
  PURCHASE_ATTACHMENT_MAX_COUNT,
  usernameOf,
  validatePurchaseAttachment,
} from "../purchaseRequestsApi";
import {
  BORRADOR_ACTUAL,
  BORRADORES_GUARDADOS,
  BORRADORES_MAX,
  BORRADOR_VIDA_MS,
  PRIORIDADES,
  STOCK_DESTINOS,
  UNIDADES,
  fmtTamano,
  textoPlano,
} from "../modulo";
import { Avatar, Aviso, Modal } from "../ui";
import SelectorDestino from "../SelectorDestino";
import { agregarDestinoPedido, destinoPedidoParaGuardar, restaurarDestinosPedido } from "../destinosPedido";
import "react-quill-new/dist/quill.snow.css";

// Quill pesa ~80 kB: se baja recién cuando alguien quiere escribir una descripción.
const ReactQuill = lazy(() => import("react-quill-new"));
const QUILL_MODULES = {
  toolbar: [
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["link", "clean"],
  ],
};

const FORM_VACIO = { title: "", description: "", priority: "media", project_id: "", destinos: [], destino: "", needed_at: "" };
const ITEM_VACIO = { description: "", quantity: "", unit: "unidad", link: "", cat: null };

const claveActual = (userId) => `${BORRADOR_ACTUAL}:${userId || "anon"}`;
const claveGuardados = (userId) => `${BORRADORES_GUARDADOS}:${userId || "anon"}`;

function leerJSON(clave, defecto) {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? JSON.parse(raw) : defecto;
  } catch {
    return defecto;
  }
}

function escribir(clave, valor) {
  try {
    if (valor == null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch { /* localStorage es opcional */ }
}

function hayItemEscrito(it) {
  return Boolean(String(it?.description || "").trim() || String(it?.quantity || "").trim() || String(it?.link || "").trim());
}

function tieneContenido(b) {
  const f = b?.form || {};
  return Boolean(
    String(f.title || "").trim()
    || textoPlano(f.description)
    || String(f.destino || "").trim()
    || String(f.needed_at || "").trim()
    || String(f.project_id || "").trim()
    || (f.destinos || []).length
    || (f.priority && f.priority !== "media")
    || (b?.ccUserIds || []).length
    || (b?.createItems || []).length
    || hayItemEscrito(b?.newItem),
  );
}

function tituloDe(b) {
  const t = String(b?.form?.title || "").trim();
  if (t) return t.slice(0, 60);
  const it = b?.createItems?.[0]?.description || b?.newItem?.description;
  return it ? String(it).trim().slice(0, 60) : "Pedido sin título";
}

function desdeBorrador(b, projects = []) {
  return {
    form: { ...FORM_VACIO, ...restaurarDestinosPedido(b?.form || {}, projects) },
    ccUserIds: Array.isArray(b?.ccUserIds) ? b.ccUserIds : [],
    createItems: Array.isArray(b?.createItems) ? b.createItems : [],
    newItem: { ...ITEM_VACIO, ...(b?.newItem || {}) },
  };
}

function desdePrefill(p, projects) {
  const proyecto = p.project_id ? projects.find((x) => x.id === p.project_id) : null;
  return {
    form: restaurarDestinosPedido({
      ...FORM_VACIO,
      destinos: undefined,
      title: p.title || "",
      description: p.description || "",
      priority: p.priority || "media",
      project_id: p.project_id || "",
      ...(Array.isArray(p.destinos) ? { destinos: p.destinos } : {}),
      destino: p.destino || proyecto?.codigo || "",
      needed_at: p.needed_at || "",
    }, projects),
    ccUserIds: [],
    createItems: (p.items || []).filter((it) => it?.description).map((it) => ({
      description: it.description,
      quantity: it.quantity ?? null,
      unit: it.unit || "unidad",
      link_url: it.link_url || null,
    })),
    newItem: { ...ITEM_VACIO },
  };
}

function guardadosVivos(userId) {
  const lista = leerJSON(claveGuardados(userId), []);
  if (!Array.isArray(lista)) return [];
  const ahora = Date.now();
  return lista.filter((d) => {
    const t = Date.parse(d?.savedAt || "");
    return Number.isFinite(t) && ahora - t < BORRADOR_VIDA_MS;
  });
}

export default function NuevoPedido({ profile, projects = [], users = [], prefill = null, onCerrar, onCreado }) {
  const toast = useToast();
  const userId = profile?.id;
  const [b, setB] = useState(() => (prefill ? desdePrefill(prefill, projects) : desdeBorrador(leerJSON(claveActual(userId), null), projects)));
  const [guardados, setGuardados] = useState(() => guardadosVivos(userId));
  const [archivos, setArchivos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [avisoItem, setAvisoItem] = useState("");
  const [verDescripcion, setVerDescripcion] = useState(() => Boolean(textoPlano(b.form.description)));
  const [buscarPersona, setBuscarPersona] = useState("");
  const [sobre, setSobre] = useState(false);
  // Catálogo del pañol: se baja una vez, recién cuando alguien escribe un ítem.
  const [catalogo, setCatalogo] = useState(null);
  const cargandoCatalogo = useRef(false);
  const [verSugerencias, setVerSugerencias] = useState(true);
  const enviando = useRef(false);
  const descInput = useRef(null);
  const tituloInput = useRef(null);

  const { form, ccUserIds, createItems, newItem } = b;
  const setForm = (patch) => setB((prev) => ({ ...prev, form: { ...prev.form, ...patch } }));
  const setNuevo = (patch) => { setB((prev) => ({ ...prev, newItem: { ...prev.newItem, ...patch } })); if (avisoItem) setAvisoItem(""); };

  async function traerCatalogo() {
    if (catalogo || cargandoCatalogo.current) return;
    cargandoCatalogo.current = true;
    try {
      setCatalogo(await fetchPanolCatalogMini({ q: "", limit: 20000, includeAdditionalBarcodes: false }));
    } catch {
      setCatalogo([]);
    } finally {
      cargandoCatalogo.current = false;
    }
  }

  function escribirItem(texto) {
    // Si el texto ya no es el del producto elegido, deja de estar vinculado.
    setNuevo({ description: texto, ...(newItem.cat && texto !== newItem.cat.descripcion ? { cat: null } : {}) });
    if (texto.trim().length >= 3) void traerCatalogo();
  }

  function elegirDelCatalogo(m) {
    setNuevo({
      description: m.descripcion,
      unit: m.unidad || newItem.unit,
      cat: { id: m.id, descripcion: m.descripcion, codigo: m.codigo || "", proveedor: m.proveedor || "" },
    });
    descInput.current?.focus();
  }

  // El pedido a medio armar se guarda solo en este navegador: si se cierra el
  // diálogo o se va de la pantalla, al volver sigue ahí.
  useEffect(() => {
    escribir(claveActual(userId), tieneContenido(b) ? { ...b, savedAt: new Date().toISOString() } : null);
  }, [b, userId]);

  useEffect(() => {
    escribir(claveGuardados(userId), guardados);
  }, [guardados, userId]);

  const hayContenido = tieneContenido(b);
  const textoItem = useDeferredValue(newItem.description.trim());
  const sugerencias = useMemo(() => {
    if (!catalogo?.length || textoItem.length < 3 || newItem.cat) return [];
    const codigo = /\d/.test(textoItem) && !/\s/.test(textoItem) ? textoItem : "";
    return topMaterialMatches(catalogo, { descripcion: textoItem, codigo }, 5, 60);
  }, [catalogo, textoItem, newItem.cat]);
  const unidades = newItem.unit && !UNIDADES.includes(newItem.unit) ? [newItem.unit, ...UNIDADES] : UNIDADES;
  const recientes = useMemo(() => leerJSON("pr_recent_cc", []), []);
  const personas = useMemo(() => {
    const q = buscarPersona.trim().toLowerCase();
    return users
      .filter((u) => u.id !== userId)
      .filter((u) => !q || `${usernameOf(u)} ${u.role || ""}`.toLowerCase().includes(q))
      .sort((a, b2) => {
        const sa = ccUserIds.includes(a.id) ? 0 : 1;
        const sb = ccUserIds.includes(b2.id) ? 0 : 1;
        if (sa !== sb) return sa - sb;
        const ra = recientes.indexOf(a.id);
        const rb = recientes.indexOf(b2.id);
        if (ra !== -1 || rb !== -1) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
        return usernameOf(a).localeCompare(usernameOf(b2), "es");
      });
  }, [users, userId, buscarPersona, ccUserIds, recientes]);
  const personasVisibles = buscarPersona.trim() ? personas : personas.slice(0, 14);

  function alternarCopia(id) {
    setB((prev) => ({ ...prev, ccUserIds: prev.ccUserIds.includes(id) ? prev.ccUserIds.filter((x) => x !== id) : [...prev.ccUserIds, id] }));
    const lista = leerJSON("pr_recent_cc", []);
    escribir("pr_recent_cc", [id, ...lista.filter((x) => x !== id)].slice(0, 10));
  }

  function agregarItem() {
    const desc = newItem.description.trim();
    if (!desc) {
      if (newItem.quantity.trim() || newItem.link.trim()) setAvisoItem("Escribí qué es antes de agregarlo.");
      descInput.current?.focus();
      return;
    }
    setB((prev) => ({
      ...prev,
      createItems: [...prev.createItems, {
        description: desc,
        quantity: newItem.quantity.trim() || null,
        unit: newItem.unit,
        link_url: newItem.link.trim() || null,
        ...(newItem.cat ? { material_id: newItem.cat.id, requisito_material_id: newItem.cat.id, catalog_source: "panol", _cat: newItem.cat } : {}),
      }],
      newItem: { ...ITEM_VACIO, unit: newItem.unit },
    }));
    setAvisoItem("");
    setVerSugerencias(true);
    descInput.current?.focus();
  }

  function quitarItem(i) {
    setB((prev) => ({ ...prev, createItems: prev.createItems.filter((_, k) => k !== i) }));
  }

  function sumarArchivos(lista) {
    const entrantes = Array.from(lista || []);
    if (!entrantes.length) return;
    try {
      entrantes.forEach(validatePurchaseAttachment);
    } catch (err) {
      toast.error(err.message || "No se pudo adjuntar el archivo.");
      return;
    }
    setArchivos((actual) => {
      const claves = new Set(actual.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      const nuevos = entrantes.filter((f) => !claves.has(`${f.name}:${f.size}:${f.lastModified}`));
      const lugar = Math.max(0, PURCHASE_ATTACHMENT_MAX_COUNT - actual.length);
      if (nuevos.length > lugar) toast.warning(`Podés adjuntar hasta ${PURCHASE_ATTACHMENT_MAX_COUNT} archivos por pedido.`);
      return [...actual, ...nuevos.slice(0, lugar)];
    });
  }

  function descartar() {
    setB(desdeBorrador(null));
    setArchivos([]);
    setAvisoItem("");
    setVerDescripcion(false);
    toast.success("Borrador descartado.");
  }

  function guardarParaDespues() {
    if (!hayContenido) {
      toast.warning("No hay nada para guardar todavía.");
      return;
    }
    const entrada = {
      id: crypto.randomUUID?.() || `d${Date.now()}`,
      savedAt: new Date().toISOString(),
      title: tituloDe(b),
      body: b,
    };
    setGuardados((prev) => [entrada, ...prev].slice(0, BORRADORES_MAX));
    setB(desdeBorrador(null));
    setArchivos([]);
    setVerDescripcion(false);
    toast.success("Guardado. Lo retomás desde acá cuando quieras.");
  }

  function retomar(id) {
    const d = guardados.find((x) => x.id === id);
    if (!d) return;
    const cargado = desdeBorrador(d.body, projects);
    setB(cargado);
    setVerDescripcion(Boolean(textoPlano(cargado.form.description)));
    setGuardados((prev) => prev.filter((x) => x.id !== id));
  }

  async function crear(e) {
    e?.preventDefault();
    if (enviando.current) return;
    if (!form.title.trim()) {
      setError("Poné un título: es lo que Compras lee primero.");
      tituloInput.current?.focus();
      return;
    }
    if (hayItemEscrito(newItem)) {
      const msg = newItem.description.trim()
        ? "Tenés un ítem escrito sin agregar: tocá «Agregar» para sumarlo o borralo."
        : "Hay datos de un ítem sin descripción: completalo o vacialo.";
      setAvisoItem(msg);
      return;
    }
    enviando.current = true;
    setGuardando(true);
    setError("");
    try {
      const request = await createPurchaseRequest({
        form: { ...form, ...destinoPedidoParaGuardar(form, projects) },
        ccUserIds,
        attachmentFiles: archivos,
      });
      // `_cat` es sólo para mostrar en el diálogo: no es una columna.
      const sinPantalla = (item) => Object.fromEntries(Object.entries(item).filter(([k]) => k !== "_cat"));
      if (createItems.length) await Promise.all(createItems.map((item) => addRequestItem(request.id, sinPantalla(item))));
      notifyComprasEmail({
        type: "new_request",
        requestId: request.id,
        requestTitle: form.title,
        changedBy: userId,
        createdByName: profile?.username || "Usuario",
        source: form.source || undefined,
      });
      escribir(claveActual(userId), null);
      toast.success("Pedido creado. Compras ya fue avisado.");
      onCreado?.(request);
    } catch (err) {
      setError(err.message || "No se pudo crear el pedido.");
    } finally {
      enviando.current = false;
      setGuardando(false);
    }
  }

  const pasoQue = Boolean(form.title.trim()) && (createItems.length > 0 || textoPlano(form.description));
  const pasoDonde = form.destinos.length > 0 || Boolean(form.destino.trim());

  return (
    <Modal
      xl
      icono={ShoppingCart}
      titulo="Nuevo pedido a Compras"
      sub="Compras recibe el aviso apenas lo creás. Mientras lo armás se guarda solo en este navegador."
      onCerrar={onCerrar}
      bloqueado={guardando}
      pie={(
        <>
          <div className="izq">
            {hayContenido ? (
              <>
                <span>Borrador guardado</span>
                <button type="button" className="cmp-link" onClick={guardarParaDespues} disabled={guardando}>Guardar para después</button>
                <button type="button" className="cmp-link" style={{ color: "var(--dim)" }} onClick={descartar} disabled={guardando}>Descartar</button>
              </>
            ) : <span>Completá el título y lo que necesitás.</span>}
          </div>
          <button type="button" className="ui-btn ui-btn-fantasma" onClick={onCerrar} disabled={guardando}>Cerrar</button>
          <button type="submit" form="cmp-nuevo-pedido" className="ui-btn ui-btn-primario" disabled={guardando}>
            {guardando ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
            {guardando ? "Enviando…" : "Crear pedido"}
          </button>
        </>
      )}
    >
      {guardados.length > 0 && (
        <div className="cmp-borradores">
          <div className="cmp-rotulo">Guardados para después · se borran solos al mes</div>
          {guardados.map((d) => (
            <div key={d.id} className="cmp-borrador">
              <div style={{ minWidth: 0 }}>
                <b>{d.title}</b>
                <small>{new Date(d.savedAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
              </div>
              <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => retomar(d.id)}>Retomar</button>
              <button type="button" className="cmp-btn-ic chico" title="Borrar" aria-label={`Borrar ${d.title}`} onClick={() => setGuardados((prev) => prev.filter((x) => x.id !== d.id))}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {error && <Aviso tono="rojo" onCerrar={() => setError("")}>{error}</Aviso>}

      <form id="cmp-nuevo-pedido" onSubmit={crear} className="cmp-pasos-form">
        {/* 1 · Qué */}
        <section className={`cmp-paso${pasoQue ? " hecho" : ""}`}>
          <span className="cmp-paso-n">1</span>
          <div style={{ minWidth: 0, display: "grid", gap: 10 }}>
            <div className="cmp-paso-tit" style={{ margin: "4px 0 0" }}>¿Qué necesitás?</div>
            <label className="cmp-campo c6" htmlFor="np-titulo">
              <span>Título <span className="req">*</span></span>
              <input
                ref={tituloInput}
                id="np-titulo"
                className="ui-input"
                aria-invalid={Boolean(error && !form.title.trim())}
                style={error && !form.title.trim() ? { borderColor: "var(--red-border)" } : undefined}
                value={form.title}
                onChange={(e) => { setForm({ title: e.target.value }); if (error) setError(""); }}
                placeholder="Ej.: Tornillería inox para el 52-27"
                autoFocus={!form.title}
              />
            </label>

            <div className="cmp-campo c6">
              <span>Ítems <span style={{ fontWeight: 500, color: "var(--subtle)" }}>· uno por renglón, con cantidad</span></span>
              <div className={`cmp-items${avisoItem ? " alerta" : ""}`}>
                {createItems.map((it, i) => (
                  <div key={`${it.description}-${i}`} className="cmp-item-fila">
                    <span className="n">{i + 1}</span>
                    <span className="d">
                      {it.description}
                      {it._cat && <span className="cmp-tag" data-tono="teal" style={{ marginLeft: 8 }} title={it._cat.proveedor || undefined}>Catálogo{it._cat.codigo ? ` · ${it._cat.codigo}` : ""}</span>}
                      {it.link_url && <a href={it.link_url} target="_blank" rel="noreferrer"><Link2 size={11} style={{ verticalAlign: -1 }} /> enlace</a>}
                    </span>
                    <span className="c">{[it.quantity, it.quantity ? it.unit : ""].filter(Boolean).join(" ") || "—"}</span>
                    <button type="button" className="cmp-btn-ic chico" onClick={() => quitarItem(i)} aria-label={`Quitar ${it.description}`} title="Quitar"><Trash2 size={13} /></button>
                  </div>
                ))}
                <div className="cmp-item-nuevo">
                  <div className="desc">
                    <input
                      ref={descInput}
                      className="ui-input"
                      value={newItem.description}
                      onChange={(e) => escribirItem(e.target.value)}
                      onFocus={() => void traerCatalogo()}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarItem(); } }}
                      placeholder={createItems.length ? "Otro ítem… (se busca en el catálogo)" : "Ej.: Bulón inox M8 x 40 — se busca en el catálogo"}
                      aria-label="Descripción del ítem"
                    />
                    <input
                      className="ui-input link"
                      value={newItem.link}
                      onChange={(e) => setNuevo({ link: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarItem(); } }}
                      placeholder="Enlace al producto (opcional)"
                      aria-label="Enlace del ítem"
                    />
                  </div>
                  <input
                    className="ui-input num"
                    value={newItem.quantity}
                    onChange={(e) => setNuevo({ quantity: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarItem(); } }}
                    placeholder="Cant."
                    inputMode="decimal"
                    aria-label="Cantidad"
                  />
                  <select className="ui-input" value={newItem.unit} onChange={(e) => setNuevo({ unit: e.target.value })} aria-label="Unidad">
                    {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button type="button" className="ui-btn ui-btn-suave" onClick={agregarItem}><Plus size={14} /> Agregar</button>
                </div>
                {/* Buscar en el catálogo: si el producto ya existe, el ítem queda
                    ligado y el aviso de ingreso al pañol sale vinculado solo. */}
                {newItem.cat ? (
                  <div className="cmp-cat-elegido">
                    <BookOpen size={14} />
                    <span style={{ minWidth: 0 }}>
                      <b>Del catálogo del pañol</b>
                      <small>{[newItem.cat.codigo, newItem.cat.proveedor].filter(Boolean).join(" · ") || "Producto vinculado"}</small>
                    </span>
                    <button type="button" className="cmp-link" onClick={() => setNuevo({ cat: null })}>Desvincular</button>
                  </div>
                ) : sugerencias.length > 0 && verSugerencias ? (
                  <div className="cmp-cat-sug">
                    <div className="cmp-cat-sug-cab">
                      <BookOpen size={13} /> ¿Es alguno de estos del catálogo?
                      <span className="cmp-sp" />
                      <button type="button" className="cmp-link" style={{ color: "var(--dim)" }} onClick={() => setVerSugerencias(false)}>No, es otro</button>
                    </div>
                    {sugerencias.map((m) => (
                      <button key={m.id} type="button" className="cmp-cat-op" onClick={() => elegirDelCatalogo(m)}>
                        <span className="nom">{m.descripcion}</span>
                        <span className="det">{[m.codigo, m.proveedor, m.unidad].filter(Boolean).join(" · ")}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {avisoItem && <div className="cmp-items-aviso">{avisoItem}</div>}
              </div>
            </div>
          </div>
        </section>

        {/* 2 · Para dónde */}
        <section className={`cmp-paso${pasoDonde ? " hecho" : ""}`}>
          <span className="cmp-paso-n">2</span>
          <div style={{ minWidth: 0 }}>
            <div className="cmp-paso-tit">¿Para dónde y para cuándo?</div>
            <div className="cmp-form">
              <div className="cmp-campo c6">
                <span>Embarcaciones o destinos <span style={{ fontWeight: 500, color: "var(--subtle)" }}>· opcional, podés elegir varios</span></span>
                {form.destinos.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-label="Destinos elegidos">
                    {form.destinos.map((d, i) => (
                      <button
                        key={d.obra_id || d.valor}
                        type="button"
                        className="cmp-chip on"
                        onClick={() => setForm({ destinos: form.destinos.filter((_, k) => k !== i) })}
                        aria-label={`Quitar ${d.valor}`}
                        title={`Quitar ${d.valor}`}
                      >
                        {d.valor}<X size={12} />
                      </button>
                    ))}
                  </div>
                )}
                <SelectorDestino
                  obras={projects.filter((p) => !form.destinos.some((d) => d.obra_id === p.id))}
                  value=""
                  onChange={(valor, obra) => setForm({ destinos: agregarDestinoPedido(form.destinos, valor, obra) })}
                  otros={STOCK_DESTINOS.map((d) => ({ valor: d, label: d, detalle: "para el stock del galpón" }))}
                  permitirLibre={false}
                  placeholder={form.destinos.length ? "Agregar otra embarcación o destino…" : "Agregar embarcaciones o stock…"}
                />
              </div>
              <label className="cmp-campo c6" htmlFor="np-destino-libre">
                <span>Nombre del barco u otra referencia <span style={{ fontWeight: 500, color: "var(--subtle)" }}>· texto libre, opcional</span></span>
                <input
                  id="np-destino-libre"
                  className="ui-input"
                  value={form.destino}
                  onChange={(e) => setForm({ destino: e.target.value })}
                  placeholder="Ej.: barco La Esperanza en el río, taller, reparación…"
                />
              </label>
              <label className="cmp-campo c2" htmlFor="np-fecha">
                <span>Lo necesitás para</span>
                <input id="np-fecha" type="date" className="ui-input" value={form.needed_at} onChange={(e) => setForm({ needed_at: e.target.value })} />
              </label>
              <div className="cmp-campo c4">
                <span>Prioridad</span>
                <div className="cmp-seg" role="radiogroup" aria-label="Prioridad">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={form.priority === p.value}
                      className={form.priority === p.value ? "on" : ""}
                      data-tono={form.priority === p.value && p.value !== "media" ? p.tono : undefined}
                      onClick={() => setForm({ priority: p.value })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3 · Detalles */}
        <section className="cmp-paso">
          <span className="cmp-paso-n">3</span>
          <div style={{ minWidth: 0, display: "grid", gap: 12 }}>
            <div className="cmp-paso-tit" style={{ margin: "4px 0 0" }}>Detalles <small>opcional</small></div>

            {verDescripcion ? (
              <div className="cmp-campo c6">
                <span>Descripción</span>
                <div className="cmp-editor">
                  <Suspense fallback={<div style={{ padding: 14 }}><Cargando compacto texto="Cargando editor…" /></div>}>
                    <ReactQuill
                      theme="snow"
                      value={form.description}
                      onChange={(value) => setForm({ description: value })}
                      modules={QUILL_MODULES}
                      placeholder="Medidas, marca, para qué es, a quién preguntar…"
                    />
                  </Suspense>
                </div>
              </div>
            ) : (
              <button type="button" className="ui-btn ui-btn-fantasma" style={{ justifySelf: "start" }} onClick={() => setVerDescripcion(true)}>
                <FileText size={14} /> Agregar una descripción
              </button>
            )}

            <div className="cmp-campo c6">
              <span>Archivos <span style={{ fontWeight: 500, color: "var(--subtle)" }}>· planos, fotos, presupuestos</span></span>
              <label
                className={`cmp-drop${sobre ? " sobre" : ""}${archivos.length >= PURCHASE_ATTACHMENT_MAX_COUNT ? " lleno" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
                onDragLeave={() => setSobre(false)}
                onDrop={(e) => { e.preventDefault(); setSobre(false); sumarArchivos(e.dataTransfer?.files); }}
              >
                <Upload size={18} />
                <span style={{ minWidth: 0 }}>
                  <b>{archivos.length ? "Sumar más archivos" : "Arrastrá archivos o tocá para elegir"}</b>
                  <small>PDF, DXF, DWG, Office, ZIP o imágenes · hasta 50 MB cada uno · máximo {PURCHASE_ATTACHMENT_MAX_COUNT}</small>
                </span>
                <input
                  type="file"
                  multiple
                  hidden
                  disabled={archivos.length >= PURCHASE_ATTACHMENT_MAX_COUNT}
                  onChange={(e) => { sumarArchivos(e.target.files); e.target.value = ""; }}
                />
              </label>
              {archivos.length > 0 && (
                <div className="cmp-archivos">
                  {archivos.map((f) => (
                    <div key={`${f.name}-${f.size}-${f.lastModified}`} className="cmp-archivo">
                      <span className="ic"><Paperclip size={14} /></span>
                      <span className="nom">{f.name}</span>
                      <span className="peso">{fmtTamano(f.size)}</span>
                      <button type="button" className="cmp-btn-ic chico" onClick={() => setArchivos((a) => a.filter((x) => x !== f))} aria-label={`Quitar ${f.name}`} title="Quitar"><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="cmp-campo c6">
              <span>En copia <span style={{ fontWeight: 500, color: "var(--subtle)" }}>· reciben las novedades del pedido</span></span>
              <label className="cmp-buscar" style={{ flex: "none", maxWidth: 320 }}>
                <Search size={15} />
                <input className="ui-input" value={buscarPersona} onChange={(e) => setBuscarPersona(e.target.value)} placeholder="Buscar persona…" aria-label="Buscar persona para copiar" />
              </label>
              <div className="cmp-personas">
                {personasVisibles.map((u) => {
                  const on = ccUserIds.includes(u.id);
                  return (
                    <button key={u.id} type="button" className={`cmp-persona${on ? " on" : ""}`} aria-pressed={on} onClick={() => alternarCopia(u.id)}>
                      <Avatar nombre={usernameOf(u)} tono={on ? "azul" : "neutro"} />
                      {usernameOf(u)}
                      {u.role && <span className="rol">{u.role}</span>}
                    </button>
                  );
                })}
                {!personasVisibles.length && <span className="cmp-ayuda">Nadie coincide con «{buscarPersona}».</span>}
                {!buscarPersona.trim() && personas.length > personasVisibles.length && (
                  <span className="cmp-ayuda" style={{ alignSelf: "center" }}>y {personas.length - personasVisibles.length} más: buscalos por nombre.</span>
                )}
              </div>
            </div>
          </div>
        </section>
      </form>

    </Modal>
  );
}
