import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ClipboardList, Copy, Mail, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { supabase } from "@/supabaseClient";
import SelectorObra from "../SelectorObra";
import { desmoldeDe, diasHasta, esDestinoStock, fmtFecha, fmtNum, num, textoDias } from "../obras";
import { Aviso, Bloque, Modal, Tag } from "../ui";

// ── Textos para mandar (los mismos de siempre) ──────────────────
function fmtLinea(item) {
  if (!item.total || item.total_unidad === "unid") return `${item.cantidad} ${item.descripcion}`;
  return `${item.cantidad} x ${item.unidad} ${item.descripcion} ---------- ${item.total} ${item.total_unidad}`;
}

function fmtFechaLocal(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ADS provee actualmente PQ7 y talco. El resto de los materiales se prepara
// para Plaquimet. Se usan los UUID del catálogo para que un cambio de
// mayúsculas o descripción no mezcle los pedidos.
const ADS_MATERIAL_IDS = new Set([
  "863eb63f-663a-4881-91c4-12121ad3fa52", // PQ7
  "c5128caa-51bb-4a62-b35a-864c4dd9faf0", // TALCO
]);

function proveedorDeItem(item) {
  const materialId = String(item?.material_id ?? item?._mat?.id ?? "");
  if (ADS_MATERIAL_IDS.has(materialId)) return "ads";
  // Respaldo para filas históricas sin material_id.
  const nombre = String(item?.descripcion ?? item?._mat?.nombre ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /\bpq\s*7\b|\btalco\b|\bgel\s*coat\b/.test(nombre) ? "ads" : "plaquimet";
}

function generarPedidoProveedor({ proveedor, obraNumero, plantillaLabel, desmolde, items, stockKeys, extraKeys, extraItems = [], materiales = [] }) {
  const nombreObra = obraNumero?.trim() || plantillaLabel || "Obra";
  const desmoldeStr = desmolde ? ` · Desmolde estimado ${fmtFechaLocal(desmolde)}` : "";
  const esExtra = (it) => extraKeys?.has?.(it._key);
  const normales = items.filter((it) => !esExtra(it) && !stockKeys.has(it._key) && proveedorDeItem(it) === proveedor);
  const extrasPlantilla = items.filter((it) => esExtra(it) && !stockKeys.has(it._key) && proveedorDeItem(it) === proveedor);
  const extrasLibres = (extraItems ?? [])
    .map((extra) => {
      const mat = materiales.find((m) => String(m.id) === String(extra.material_id));
      return { material_id: extra.material_id, cantidad: extra.cantidad, descripcion: mat?.nombre ?? "Extra", unidad: mat?.unidad ?? "unid", total: null, total_unidad: "unid" };
    })
    .filter((it) => proveedorDeItem(it) === proveedor);
  const extras = [...extrasPlantilla, ...extrasLibres];
  const cantidadItems = normales.length + extras.length;
  if (!cantidadItems) return { text: "", count: 0 };
  const proveedorLabel = proveedor === "ads" ? "ADS" : "Plaquimet";
  let txt = `PEDIDO ${proveedorLabel.toUpperCase()}\n\nObra ${nombreObra}${desmoldeStr}\n`;
  if (normales.length) {
    txt += "\nMateriales para la obra:\n";
    normales.forEach((it) => { txt += `${fmtLinea(it)}\n`; });
  }
  if (extras.length) {
    txt += "\nMateriales para stock:\n";
    extras.forEach((it) => { txt += `${fmtLinea(it)}\n`; });
  }
  txt += "\nGracias,";
  return { text: txt, count: cantidadItems };
}

function generarEmail({ obraNumero, plantillaLabel, desmolde, items, stockKeys, extraKeys, extraItems = [], materiales = [] }) {
  const nombreObra = obraNumero?.trim() || plantillaLabel || "Obra";
  const desmoldeStr = desmolde ? ` (Fecha estimada de desmolde ${fmtFechaLocal(desmolde)})` : "";
  const esExtra = (it) => extraKeys?.has?.(it._key);
  const normales = items.filter((it) => !esExtra(it));
  const aComprar = normales.filter((it) => !stockKeys.has(it._key));
  const enStock = normales.filter((it) => stockKeys.has(it._key));
  // Extras = marcados en la plantilla + agregados → siempre al final.
  const extrasPlantilla = items.filter((it) => esExtra(it) && !stockKeys.has(it._key));
  const extrasLibres = (extraItems ?? []).map((e) => {
    const mat = materiales.find((m) => String(m.id) === String(e.material_id));
    return { cantidad: e.cantidad, descripcion: mat?.nombre ?? "Extra", unidad: mat?.unidad ?? "unid", total: null, total_unidad: "unid" };
  });
  const extras = [...extrasPlantilla, ...extrasLibres];
  let txt = `David,\n\nte detallo los materiales requeridos:\n\nObra ${nombreObra}${desmoldeStr}\n\n`;
  aComprar.forEach((it) => { txt += fmtLinea(it) + "\n"; });
  if (enStock.length > 0) {
    txt += `\nRemarcado en celeste los materiales en stock que no son necesario comprar.\n\nStock:\n`;
    enStock.forEach((it) => { txt += fmtLinea(it) + "\n"; });
  }
  if (extras.length > 0) {
    txt += `\nExtras (fuera de la lista estándar):\n`;
    extras.forEach((it) => { txt += fmtLinea(it) + "\n"; });
  }
  txt += `\nGracias,`;
  return txt;
}

// ── Vincular un renglón de plantilla con el inventario ──────────
function normStr(s) {
  return s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jaccardScore(a, b) {
  const wa = new Set(a.split(" ").filter((w) => w.length > 1));
  const wb = new Set(b.split(" ").filter((w) => w.length > 1));
  if (!wa.size && !wb.size) return 0;
  const interseccion = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 ? interseccion / union : 0;
}

function matchMaterialScored(descripcion, materiales) {
  if (!materiales?.length) return { mat: null, score: 0, candidato: null };
  const desc = normStr(descripcion);
  let best = null;
  let bestScore = 0;
  for (const mat of materiales) {
    const matNorm = normStr(mat.nombre);
    let score;
    if (desc === matNorm) score = 1.0;
    else if (matNorm.length > 2 && desc.includes(matNorm)) score = 0.9;
    else if (desc.length > 2 && matNorm.includes(desc)) score = 0.85;
    else score = jaccardScore(desc, matNorm);
    if (score > bestScore) { bestScore = score; best = mat; }
  }
  return { mat: bestScore >= 0.45 ? best : null, score: bestScore, candidato: best };
}

function leerOverrides(plantillaId) {
  if (!plantillaId) return {};
  try {
    const saved = localStorage.getItem(`lam_mat_override_${plantillaId}`);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

const CARGA_VACIA = { plantillaId: null, items: [] };

export default function ArmarPedido({
  materiales, stockPorMaterial, obras, destino, obra, onElegirDestino, otrosDestinos,
  plantillas, plantillaId, onPlantilla, extraItems, setExtraItems, onGenerarOrden, puedeGestionar,
}) {
  const [carga, setCarga] = useState(CARGA_VACIA);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [stockKeys, setStockKeys] = useState(() => new Set());
  const [extraKeys, setExtraKeys] = useState(() => new Set());
  const [pedidosCreados, setPedidosCreados] = useState(() => new Set());
  const [overridesMem, setOverridesMem] = useState({});
  const [vista, setVista] = useState("lista");
  const [copiado, setCopiado] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [creando, setCreando] = useState(false);
  const [desmoldeEditado, setDesmoldeEditado] = useState(null); // { destino, fecha }
  const [editandoDesmolde, setEditandoDesmolde] = useState(false);
  const [extraMat, setExtraMat] = useState("");
  const [extraCant, setExtraCant] = useState("");

  // Renglones de la plantilla elegida.
  useEffect(() => {
    if (!plantillaId) return undefined;
    let activo = true;
    supabase
      .from("linea_plantilla_items")
      .select("id, plantilla_id, material_id, cantidad, orden, notas, material:laminacion_materiales(id,nombre,unidad,categoria)")
      .eq("plantilla_id", plantillaId)
      .order("orden")
      .then(({ data }) => {
        if (!activo) return;
        const loaded = (data ?? []).map((it) => ({
          ...it,
          descripcion: it.material?.nombre ?? "Material sin nombre",
          unidad: it.material?.unidad ?? "unid",
          total: null,
          total_unidad: "unid",
          _key: String(it.id),
          _cantEdit: String(it.cantidad),
          _totalEdit: "",
        }));
        setCarga({ plantillaId, items: loaded });
        setSelectedKeys(new Set(loaded.map((it) => it._key)));
        setStockKeys(new Set());
        setExtraKeys(new Set());
        setPedidosCreados(new Set());
      });
    return () => { activo = false; };
  }, [plantillaId]);

  const items = useMemo(() => (plantillaId && carga.plantillaId === plantillaId ? carga.items : []), [carga, plantillaId]);
  const cargandoItems = Boolean(plantillaId) && carga.plantillaId !== plantillaId;
  const plantilla = plantillas.find((p) => String(p.id) === String(plantillaId)) ?? null;
  const plantillaLabel = plantilla?.label ?? "";
  const overrides = useMemo(() => overridesMem[plantillaId] ?? leerOverrides(plantillaId), [overridesMem, plantillaId]);

  function saveOverride(key, matId) {
    const next = { ...overrides };
    if (matId) next[key] = matId;
    else delete next[key];
    try { localStorage.setItem(`lam_mat_override_${plantillaId}`, JSON.stringify(next)); } catch { /* sigue en memoria */ }
    setOverridesMem((prev) => ({ ...prev, [plantillaId]: next }));
  }

  const esStock = esDestinoStock(destino);
  const desmoldeObra = desmoldeDe(obra);
  const desmolde = desmoldeEditado && desmoldeEditado.destino === destino ? desmoldeEditado.fecha : desmoldeObra || "";
  const dias = diasHasta(desmolde);

  const itemsConStock = useMemo(() => items.map((it) => {
    const overrideMat = overrides[it._key] ? materiales.find((m) => String(m.id) === String(overrides[it._key])) ?? null : null;
    const linkedMat = it.material_id ? materiales.find((m) => String(m.id) === String(it.material_id)) ?? it.material ?? null : null;
    const { mat: autoMat, score, candidato } = matchMaterialScored(it.descripcion, materiales);
    const mat = overrideMat ?? linkedMat ?? autoMat;
    const matchMode = overrideMat ? "manual" : mat ? "auto" : "none";
    const stockActual = mat ? num(stockPorMaterial[mat.id] ?? 0) : null;
    const cantidadNecesaria = num(it._cantEdit) || num(it.cantidad);
    return { ...it, _mat: mat, _matchMode: matchMode, _matchScore: score, _candidato: candidato, _stockActual: stockActual, _cantidadNecesaria: cantidadNecesaria };
  }), [items, materiales, stockPorMaterial, overrides]);

  const sinMatch = itemsConStock.filter((it) => it._matchMode === "none").length;

  const itemsAGenerar = useMemo(() => {
    const dePlantilla = itemsConStock.filter((it) => selectedKeys.has(it._key) && !stockKeys.has(it._key) && it._mat && !pedidosCreados.has(it._key));
    const deExtras = extraItems
      .filter((e) => !pedidosCreados.has(e.uid) && e.material_id)
      .map((e) => ({ ...e, _mat: materiales.find((m) => String(m.id) === String(e.material_id)) ?? null }));
    return { dePlantilla, deExtras, total: dePlantilla.length + deExtras.length };
  }, [itemsConStock, selectedKeys, stockKeys, extraItems, materiales, pedidosCreados]);

  const obraNumero = esStock ? "" : (obra?.codigo || destino || "");
  const itemsParaEmail = useMemo(() => items.map((it) => ({
    ...it,
    cantidad: Number(it._cantEdit) || it.cantidad,
    total: it._totalEdit !== "" ? Number(it._totalEdit) : it.total,
  })), [items]);

  const emailText = useMemo(
    () => generarEmail({ obraNumero, plantillaLabel, desmolde, items: itemsParaEmail, stockKeys, extraKeys, extraItems, materiales }),
    [obraNumero, plantillaLabel, desmolde, itemsParaEmail, stockKeys, extraKeys, extraItems, materiales],
  );
  const pedidosPorProveedor = useMemo(() => ({
    ads: generarPedidoProveedor({ proveedor: "ads", obraNumero, plantillaLabel, desmolde, items: itemsParaEmail, stockKeys, extraKeys, extraItems, materiales }),
    plaquimet: generarPedidoProveedor({ proveedor: "plaquimet", obraNumero, plantillaLabel, desmolde, items: itemsParaEmail, stockKeys, extraKeys, extraItems, materiales }),
  }), [obraNumero, plantillaLabel, desmolde, itemsParaEmail, stockKeys, extraKeys, extraItems, materiales]);

  function alternar(setter, key) {
    setter((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  function editarItem(key, campo, valor) {
    setCarga((prev) => ({ ...prev, items: prev.items.map((it) => (it._key === key ? { ...it, [campo]: valor } : it)) }));
  }

  function agregarExtra() {
    if (!extraMat || num(extraCant) <= 0) return;
    setExtraItems((prev) => {
      const i = prev.findIndex((e) => e.material_id === extraMat && !pedidosCreados.has(e.uid));
      if (i >= 0) return prev.map((e, k) => (k === i ? { ...e, cantidad: num(e.cantidad) + num(extraCant) } : e));
      return [...prev, { uid: `extra-${Date.now()}`, material_id: extraMat, cantidad: num(extraCant) }];
    });
    setExtraMat("");
    setExtraCant("");
  }

  function copiar(texto, clave) {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(clave);
      setTimeout(() => setCopiado(""), 2200);
    });
  }

  async function generar() {
    setShowConfirm(false);
    setCreando(true);
    // Referencia única: OC-AAAAMMDD-XXXX.
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const ordenRef = `OC-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const paraEnviar = [
      ...itemsAGenerar.dePlantilla.map((it) => ({
        material_id: it._mat.id,
        cantidad: it._cantidadNecesaria,
        descripcion: it.descripcion,
        categoria: extraKeys.has(it._key) ? "extra" : "estándar",
      })),
      ...itemsAGenerar.deExtras.map((e) => ({
        material_id: e.material_id,
        cantidad: e.cantidad,
        descripcion: e._mat?.nombre ?? "Extra",
        // Para una obra, lo agregado a mano va como extra (a stock); si el
        // pedido entero es para stock, ya va al stock del galpón.
        categoria: esStock ? "estándar" : "extra",
      })),
    ];
    // Los extras siempre al final.
    paraEnviar.sort((a, b) => (a.categoria === "extra" ? 1 : 0) - (b.categoria === "extra" ? 1 : 0));
    try {
      const res = await onGenerarOrden({
        items: paraEnviar,
        destino,
        obra,
        plantillaLabel,
        ordenRef,
        emailText: plantilla ? emailText : "",
        desmolde: desmolde ? fmtFechaLocal(desmolde) : "",
      });
      if (res?.ok) {
        setPedidosCreados((prev) => new Set([
          ...prev,
          ...itemsAGenerar.dePlantilla.map((it) => it._key),
          ...itemsAGenerar.deExtras.map((e) => e.uid),
        ]));
      }
    } finally {
      setCreando(false);
    }
  }

  const listo = Boolean(destino) && itemsAGenerar.total > 0;
  const paso1 = Boolean(destino);
  const paso2 = itemsAGenerar.total > 0 || pedidosCreados.size > 0;

  return (
    <Bloque
      icono={ClipboardList}
      titulo="Armar pedido"
      texto="Elegí la obra: la plantilla de su línea y la fecha de desmolde se cargan solas desde Obras."
      der={pedidosCreados.size > 0 && <Tag tono="verde">{pedidosCreados.size} enviados</Tag>}
      style={{ scrollMarginTop: 12 }}
    >
      <div className="lam-pasos" id="lam-armar-pedido">
        {/* ── 1 · Destino ── */}
        <div className={`lam-paso${paso1 ? " hecho" : ""}`}>
          <span className="lam-paso-n">{paso1 ? <Check size={14} strokeWidth={3} /> : "1"}</span>
          <div style={{ minWidth: 0 }}>
            <div className="lam-paso-tit">¿Para qué obra es?</div>
            <div className="lam-form">
              <div className="lam-campo c4">
                <SelectorObra obras={obras} value={destino} onChange={onElegirDestino} otros={otrosDestinos} placeholder="Elegí la obra o el stock del galpón…" />
              </div>
              <label className="lam-campo c2" style={{ alignSelf: "end" }}>
                <span>Plantilla de materiales</span>
                <select className="ui-input" value={plantillaId} onChange={(e) => onPlantilla(e.target.value)}>
                  <option value="">{esStock ? "Sin plantilla (pedido de stock)" : "Sin plantilla"}</option>
                  {plantillas.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
            </div>
            {destino && !esStock && (
              <div className="lam-dest-info">
                {editandoDesmolde ? (
                  <>
                    <input
                      autoFocus
                      type="date"
                      className="ui-input"
                      style={{ width: 170, minHeight: 34 }}
                      value={desmolde}
                      onChange={(e) => setDesmoldeEditado({ destino, fecha: e.target.value })}
                      aria-label="Fecha de desmolde para el pedido"
                    />
                    <button type="button" className="ui-btn chico" onClick={() => setEditandoDesmolde(false)}><Check size={14} /> Listo</button>
                    {desmoldeObra && (
                      <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => { setDesmoldeEditado(null); setEditandoDesmolde(false); }}>Usar la de Obras</button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="lam-estado punto" data-tono={desmolde ? "azul" : "violeta"}>
                      <CalendarDays size={12} />
                      {desmolde
                        ? `Desmolde ${desmoldeEditado?.destino === destino ? "(cambiado) " : obra?.desmoldeReal ? "" : "estimado "}${fmtFecha(desmolde)} · ${textoDias(dias)}`
                        : "Sin fecha de desmolde en Obras"}
                    </span>
                    <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => setEditandoDesmolde(true)}>
                      <Pencil size={13} /> {desmolde ? "Cambiar para este pedido" : "Cargar fecha"}
                    </button>
                    {obra?.lineaLabel && <span className="lam-ayuda">Línea {obra.lineaLabel}{plantilla ? ` · plantilla ${plantilla.label}` : " · sin plantilla para esta línea"}</span>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 2 · Materiales ── */}
        <div className={`lam-paso${paso2 ? " hecho" : ""}`}>
          <span className="lam-paso-n">{paso2 ? <Check size={14} strokeWidth={3} /> : "2"}</span>
          <div style={{ minWidth: 0 }}>
            <div className="lam-paso-tit" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              Materiales
              {plantilla && items.length > 0 && (
                <div className="lam-seg" role="group" aria-label="Vista" style={{ marginLeft: "auto" }}>
                  <button type="button" className={vista === "lista" ? "on" : ""} onClick={() => setVista("lista")}>Lista</button>
                  <button type="button" className={vista === "mail" ? "on" : ""} onClick={() => setVista("mail")}><Mail size={13} /> Mail</button>
                </div>
              )}
            </div>

            {sinMatch > 0 && plantilla && (
              <div style={{ marginBottom: 10 }}>
                <Aviso tono="violeta">{sinMatch} {sinMatch === 1 ? "renglón no está vinculado" : "renglones no están vinculados"} al inventario. Elegí el material debajo de cada uno.</Aviso>
              </div>
            )}

            {cargandoItems ? (
              <p className="lam-ayuda">Cargando la plantilla…</p>
            ) : plantilla && items.length > 0 && vista === "lista" ? (
              <div className="lam-tabla" style={{ border: "1px solid var(--border)", borderRadius: 12, marginBottom: 12 }}>
                <table className="lam-t lam-t-items">
                  <thead>
                    <tr>
                      <th className="col-chk">
                        <button
                          type="button"
                          className={`lam-check${selectedKeys.size === itemsConStock.length ? " on" : ""}`}
                          title="Elegir todos / ninguno"
                          aria-label="Elegir todos"
                          onClick={() => setSelectedKeys(selectedKeys.size === itemsConStock.length ? new Set() : new Set(itemsConStock.map((it) => it._key)))}
                        >
                          {selectedKeys.size === itemsConStock.length && <Check size={13} strokeWidth={3} />}
                        </button>
                      </th>
                      <th>Material</th>
                      <th className="der">Cantidad</th>
                      <th>Unidad</th>
                      <th className="der">En stock</th>
                      <th title="Se lista aparte en el mail como «en stock» y no se compra">Hay</th>
                      <th title="Va como extra: al stock del galpón">Extra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsConStock.map((it) => {
                      const elegido = selectedKeys.has(it._key);
                      const enStock = stockKeys.has(it._key);
                      const yaPedido = pedidosCreados.has(it._key);
                      const falta = it._stockActual != null ? Math.max(0, it._cantidadNecesaria - it._stockActual) : null;
                      return (
                        <tr key={it._key} className={yaPedido ? "pedido" : !elegido ? "fuera" : ""}>
                          <td>
                            {yaPedido ? <Check size={15} style={{ color: "var(--green)" }} /> : (
                              <button type="button" className={`lam-check${elegido ? " on" : ""}`} aria-label={elegido ? "Sacar del pedido" : "Incluir en el pedido"} onClick={() => alternar(setSelectedKeys, it._key)}>
                                {elegido && <Check size={13} strokeWidth={3} />}
                              </button>
                            )}
                          </td>
                          <td className="col-mat">
                            <div className="nom">
                              {yaPedido && <span className="lam-tag" data-tono="verde" style={{ marginRight: 6 }}>Enviado</span>}
                              {it.descripcion}
                            </div>
                            {it._matchMode === "manual" && it._mat && (
                              <div className="lam-vinculo" data-tono="cian">Vinculado a {it._mat.nombre} <button type="button" onClick={() => saveOverride(it._key, null)}>quitar</button></div>
                            )}
                            {it._matchMode === "auto" && it._mat && !it.material_id && (
                              <div className="lam-vinculo" data-tono="verde">→ {it._mat.nombre} <button type="button" onClick={() => saveOverride(it._key, "__reset__")}>cambiar</button></div>
                            )}
                            {(it._matchMode === "none" || overrides[it._key] === "__reset__") && (
                              <div className="lam-vinculo" data-tono="violeta">
                                {it._candidato && it._matchScore >= 0.2 && (
                                  <button type="button" onClick={() => saveOverride(it._key, it._candidato.id)}>¿Es {it._candidato.nombre}?</button>
                                )}
                                <select className="ui-input" style={{ minHeight: 30, fontSize: 12, width: 220 }} value="" onChange={(e) => saveOverride(it._key, e.target.value || null)} aria-label={`Vincular ${it.descripcion}`}>
                                  <option value="">Vincular con…</option>
                                  {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                                </select>
                              </div>
                            )}
                          </td>
                          <td className="der">
                            <input type="number" min="0" step="1" className="ui-input num" style={{ width: 76, minHeight: 32, textAlign: "right" }} value={it._cantEdit} onChange={(e) => editarItem(it._key, "_cantEdit", e.target.value)} aria-label={`Cantidad de ${it.descripcion}`} />
                          </td>
                          <td className="mono" style={{ color: "var(--dim)", fontSize: 12 }}>{it.unidad}</td>
                          <td className="der col-stock">
                            {it._stockActual == null ? <span className="vacio">—</span> : (
                              <span className="lam-cant" data-tono={falta === 0 ? "verde" : falta < it._cantidadNecesaria ? "cian" : "rojo"} title={falta > 0 ? `Faltan ${fmtNum(falta)}` : "Cubierto con stock"}>
                                {fmtNum(it._stockActual)}
                              </span>
                            )}
                          </td>
                          <td>
                            <button type="button" className={`lam-marca${enStock ? " on" : ""}`} data-tono="cian" onClick={() => alternar(setStockKeys, it._key)} aria-pressed={enStock} title="Hay en stock: va aparte en el mail y no se compra">Hay</button>
                          </td>
                          <td>
                            <button type="button" className={`lam-marca${extraKeys.has(it._key) ? " on" : ""}`} data-tono="cian" onClick={() => alternar(setExtraKeys, it._key)} aria-pressed={extraKeys.has(it._key)} title="Va como extra, al stock del galpón">E</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : plantilla && vista === "mail" ? (
              <textarea readOnly className="lam-email" value={emailText} aria-label="Texto del mail" style={{ marginBottom: 12 }} />
            ) : null}

            {/* Agregar materiales sueltos (repair, gelcoat, pintura… o todo el pedido si es de stock). */}
            <div style={{ display: "grid", gap: 8 }}>
              {extraItems.length > 0 && (
                <div className="lam-lista-mod">
                  {extraItems.map((e) => {
                    const mat = materiales.find((m) => String(m.id) === String(e.material_id));
                    const yaPedido = pedidosCreados.has(e.uid);
                    return (
                      <div key={e.uid}>
                        <span>
                          {yaPedido && <span className="lam-tag" data-tono="verde" style={{ marginRight: 6 }}>Enviado</span>}
                          <b style={{ fontWeight: 600 }}>{mat?.nombre ?? "—"}</b>
                          {!esStock && <span className="lam-tag" data-tono="cian" style={{ marginLeft: 6 }}>Extra</span>}
                          <span className="lam-ayuda" style={{ marginLeft: 8 }}>hay {fmtNum(stockPorMaterial[e.material_id])} {mat?.unidad}</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="lam-cant">{fmtNum(e.cantidad)} <small>{mat?.unidad}</small></span>
                          {!yaPedido && (
                            <button type="button" className="lam-btn-ic chico peligro" aria-label={`Quitar ${mat?.nombre ?? "material"}`} onClick={() => setExtraItems((prev) => prev.filter((x) => x.uid !== e.uid))}><Trash2 size={13} /></button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="lam-form" style={{ alignItems: "end" }}>
                <label className="lam-campo c4"><span>{plantilla ? "Agregar otro material" : "Material"}</span>
                  <select className="ui-input" value={extraMat} onChange={(e) => setExtraMat(e.target.value)}>
                    <option value="">Elegir material…</option>
                    {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad}) · hay {fmtNum(stockPorMaterial[m.id])}</option>)}
                  </select>
                </label>
                <label className="lam-campo c1" style={{ gridColumn: "span 1" }}><span>Cantidad</span>
                  <input className="ui-input num" type="number" step="0.01" min="0" placeholder="0" value={extraCant} onChange={(e) => setExtraCant(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarExtra(); } }} />
                </label>
                <div className="lam-campo" style={{ gridColumn: "span 1" }}>
                  <button type="button" className="ui-btn" onClick={agregarExtra} disabled={!extraMat || num(extraCant) <= 0}><Plus size={15} /> Agregar</button>
                </div>
              </div>
              {!esStock && destino && <p className="lam-ayuda">Lo que agregues a mano en un pedido para obra va como extra: al stock del galpón.</p>}
            </div>
          </div>
        </div>

        {/* ── 3 · Enviar ── */}
        {puedeGestionar && (
          <div className="lam-paso">
            <span className="lam-paso-n">3</span>
            <div style={{ minWidth: 0, display: "grid", gap: 10 }}>
              <div className="lam-paso-tit" style={{ marginBottom: 0 }}>Enviar</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" className="ui-btn ui-btn-primario" disabled={!listo || creando} onClick={() => setShowConfirm(true)}>
                  <Send size={15} /> {creando ? "Generando…" : `Generar pedido y mandar a Compras${itemsAGenerar.total ? ` · ${itemsAGenerar.total}` : ""}`}
                </button>
                {plantilla && (
                  <button type="button" className="ui-btn" onClick={() => copiar(emailText, "mail")}>
                    <Copy size={14} /> {copiado === "mail" ? "Mail copiado" : "Copiar mail"}
                  </button>
                )}
                <button type="button" className="ui-btn ui-btn-fantasma" disabled={!pedidosPorProveedor.ads.count} onClick={() => copiar(pedidosPorProveedor.ads.text, "ads")}>
                  <Copy size={14} /> {copiado === "ads" ? "ADS copiado" : `ADS · ${pedidosPorProveedor.ads.count}`}
                </button>
                <button type="button" className="ui-btn ui-btn-fantasma" disabled={!pedidosPorProveedor.plaquimet.count} onClick={() => copiar(pedidosPorProveedor.plaquimet.text, "plaquimet")}>
                  <Copy size={14} /> {copiado === "plaquimet" ? "Plaquimet copiado" : `Plaquimet · ${pedidosPorProveedor.plaquimet.count}`}
                </button>
                {stockKeys.size > 0 && (
                  <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => setStockKeys(new Set())}><X size={13} /> Quitar marcas «Hay»</button>
                )}
              </div>
              {!destino && (itemsAGenerar.total > 0 || plantilla) && <p className="lam-ayuda" style={{ color: "var(--violet)" }}>Elegí la obra (o el stock) para poder mandarlo.</p>}
            </div>
          </div>
        )}
      </div>

      {showConfirm && (
        <Modal
          ancho
          onCerrar={() => setShowConfirm(false)}
          icono={Send}
          titulo="Mandar el pedido"
          sub={`Va a la vez al pañolero (lo recibe en Ingresos), a la obra y a Compras. Destino: ${esStock ? destino : `obra ${obra?.codigo || destino}`}${desmolde && !esStock ? ` · desmolde ${fmtFecha(desmolde)}` : ""}.`}
          pie={(
            <>
              <button type="button" className="ui-btn" onClick={() => setShowConfirm(false)}>Volver</button>
              <button type="button" className="ui-btn ui-btn-primario" onClick={generar} disabled={creando}>Confirmar y mandar</button>
            </>
          )}
        >
          <div className="lam-lista-mod">
            {itemsAGenerar.dePlantilla.map((it) => (
              <div key={it._key}>
                <span>
                  {extraKeys.has(it._key) && <span className="lam-tag" data-tono="cian" style={{ marginRight: 6 }}>Extra</span>}
                  <b style={{ fontWeight: 600 }}>{it._mat?.nombre || it.descripcion}</b>
                  <span className="lam-ayuda" style={{ marginLeft: 8 }}>hay {fmtNum(it._stockActual)}</span>
                </span>
                <span className="lam-cant">{fmtNum(it._cantidadNecesaria)} <small>{it.unidad}</small></span>
              </div>
            ))}
            {itemsAGenerar.deExtras.map((e) => (
              <div key={e.uid}>
                <span>
                  {!esStock && <span className="lam-tag" data-tono="cian" style={{ marginRight: 6 }}>Extra</span>}
                  <b style={{ fontWeight: 600 }}>{e._mat?.nombre ?? "—"}</b>
                </span>
                <span className="lam-cant">{fmtNum(e.cantidad)} <small>{e._mat?.unidad}</small></span>
              </div>
            ))}
          </div>
          <Aviso tono="azul">Se generan {itemsAGenerar.total} {itemsAGenerar.total === 1 ? "material" : "materiales"} en una sola orden.</Aviso>
        </Modal>
      )}
    </Bloque>
  );
}
