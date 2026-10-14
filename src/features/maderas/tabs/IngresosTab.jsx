import { useMemo, useState } from "react";
import { ArrowDownToLine, Boxes, Check, ChevronRight, History, Inbox, Link2, Package, Plus, Search, Ship } from "lucide-react";
import SelectorObra from "@/features/laminacion/SelectorObra";
import { buscarObra, fmtFecha, fmtNum, hoyISO, num } from "@/features/laminacion/obras";
import { Bloque, Cifra, Estado, Mini, Tag, Vacio } from "@/features/laminacion/ui";
import { ESTADO_COMPRAS, STOCK_MADERAS, itemFalta, itemPendiente, itemRecibido, porDestino } from "../datos";

const FORM_VACIO = () => ({ material_id: "", cantidad: "", fecha: hoyISO(), proveedor: "", obra: "", observaciones: "" });

function horaDe(ts) {
  return ts ? new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
}

export default function IngresosTab({
  materiales, movs, pedidosParaRecibir, stockPorMaterial, obras, estadoCompras, puedeCargar,
  onRecibir, onVincular, onCrearIngreso,
}) {
  // Las tarjetas arrancan abiertas (para recibir hay que ver qué llegó); acá
  // quedan las que se plegaron.
  const [plegados, setPlegados] = useState(() => new Set());
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(60);

  const matDe = (id) => materiales.find((m) => String(m.id) === String(id));

  // Una tarjeta por destino de cada pedido: lo de la 55-6 por un lado y lo del
  // stock por otro, aunque hayan salido en el mismo pedido. Así se recibe y se
  // separa físicamente sin mezclar.
  const tarjetas = useMemo(() => {
    const out = [];
    for (const p of pedidosParaRecibir) {
      const grupos = porDestino(p.items.filter((it) => !it._cancelado));
      for (const g of grupos) {
        const pendientes = g.items.filter(itemPendiente);
        if (!pendientes.length) continue;
        const otrosDestinos = grupos.filter((x) => x !== g).map((x) => (x.obra ? `obra ${buscarObra(obras, x.obra)?.codigo || x.obra}` : "stock"));
        out.push({ key: `${p.id}|${g.clave}`, pedido: p, obra: g.obra, items: g.items, pendientes, otrosDestinos });
      }
    }
    return out;
  }, [pedidosParaRecibir, obras]);

  const ingresos = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return movs
      .filter((m) => m._tipo === "ingreso")
      .filter((m) => !qq || [m._material, m.proveedor, m.obra, m._obs].filter(Boolean).join(" ").toLowerCase().includes(qq));
  }, [movs, q]);

  // Proveedores ya usados, para sugerirlos y no escribirlos de cero.
  const proveedores = useMemo(() => {
    const vistos = new Map();
    for (const m of movs) {
      const p = String(m.proveedor || "").trim();
      if (p && p !== "Compras" && !vistos.has(p.toUpperCase())) vistos.set(p.toUpperCase(), p);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [movs]);

  const hoy = hoyISO();
  const ingresosHoy = movs.filter((m) => m._tipo === "ingreso" && String(m._fecha).slice(0, 10) === hoy).length;
  const renglones = tarjetas.reduce((s, t) => s + t.pendientes.length, 0);
  const destinosObra = new Set(tarjetas.filter((t) => t.obra).map((t) => t.obra)).size;
  const matSel = matDe(form.material_id);

  async function registrar(e) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    const ok = await onCrearIngreso(form);
    setGuardando(false);
    if (ok) setForm((f) => ({ ...FORM_VACIO(), fecha: f.fecha, proveedor: f.proveedor }));
  }

  function alternar(id) {
    setPlegados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Maderas · Recepción</div>
          <h1 className="lam-h1">Ingresos de <span className="acento">maderas</span></h1>
          <p className="lam-sub">
            {renglones
              ? <>
                  <b className="mono">{renglones}</b> {renglones === 1 ? "material para recibir" : "materiales para recibir"}
                  {destinosObra > 0 && <> · para <b className="mono">{destinosObra}</b> {destinosObra === 1 ? "obra" : "obras"}{tarjetas.some((t) => !t.obra) ? " y el stock" : ""}</>}
                </>
              : "Nada pendiente de recibir"}
            {ingresosHoy > 0 && <> · <b className="mono">{ingresosHoy}</b> ingresos hoy</>}
          </p>
        </div>
      </div>

      <Bloque
        icono={Inbox}
        tono={tarjetas.length ? "cian" : "verde"}
        titulo="Para recibir"
        texto="Separado por destino: lo de cada obra y lo del stock, aunque hayan venido en el mismo pedido. Al recibirlo se suma al stock y Compras se entera."
        sinPad
      >
        {!tarjetas.length ? (
          <Vacio icono={Check} titulo="Todo recibido" texto="Cuando se pida madera desde Pedidos, va a aparecer acá para recibirla." />
        ) : (
          <div className="lam-ordenes" style={{ padding: 12 }}>
            {tarjetas.map((t, i) => {
              const p = t.pedido;
              const abierto = !plegados.has(t.key);
              const obra = t.obra ? buscarObra(obras, t.obra) : null;
              const destino = t.obra ? `Obra ${obra?.codigo || t.obra}` : "Stock";
              const compras = p.purchase_request_id ? ESTADO_COMPRAS[estadoCompras[p.purchase_request_id]] : null;
              const conEntregas = t.items.filter((it) => itemRecibido(it) > 0).length;
              const sinVinculo = t.pendientes.filter((it) => !it.material_id).length;
              const recibibles = t.pendientes.filter((it) => it.material_id);
              const otros = t.otrosDestinos;
              return (
                <article key={t.key} className={`lam-orden mad-destino${abierto ? " abierta" : ""}`} data-tono={t.obra ? "azul" : "teal"} style={{ "--i": Math.min(i, 10) }}>
                  <div className="lam-orden-cab">
                    <button type="button" className="plegar" onClick={() => alternar(t.key)} aria-expanded={abierto} aria-label={abierto ? "Ocultar materiales" : "Ver materiales"}>
                      <ChevronRight size={16} style={{ transform: abierto ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
                    </button>
                    <div style={{ minWidth: 0 }}>
                      <div className="mad-destino-tit">
                        <span className="mad-destino-ic">{t.obra ? <Ship size={15} /> : <Boxes size={15} />}</span>
                        <span>{t.obra ? <>Obra <span className="mono">{obra?.codigo || t.obra}</span></> : "Stock"}</span>
                        <span className="lam-ayuda">{t.obra ? (obra?.lineaLabel || "") : STOCK_MADERAS}</span>
                      </div>
                      <div className="lam-orden-meta">
                        <span className="mono">Pedido del {fmtFecha(p.fecha_pedido || p.creado_en)}</span>
                        <span>{t.pendientes.length} {t.pendientes.length === 1 ? "material por recibir" : "materiales por recibir"}</span>
                        {conEntregas > 0 && <Tag tono="violeta">Parcial · {conEntregas}/{t.items.length}</Tag>}
                        {compras && <Estado tono={compras.tono} punto={false}>{compras.label}</Estado>}
                        {sinVinculo > 0 && <span style={{ color: "var(--violet)" }}>{sinVinculo} fuera del catálogo</span>}
                        {otros.length > 0 && <span>· en el mismo pedido: {otros.join(", ")}</span>}
                      </div>
                    </div>
                    {puedeCargar && (
                      <div className="lam-orden-acc">
                        <button type="button" className="ui-btn chico" data-tono="verde" disabled={!recibibles.length} onClick={() => onRecibir({ tipo: "pedido_completo", pedido: p, items: t.pendientes, destino })}><Check size={14} /> Llegó todo</button>
                        <button type="button" className="ui-btn chico" data-tono="cian" disabled={!recibibles.length} onClick={() => onRecibir({ tipo: "pedido_parcial", pedido: p, items: t.pendientes, destino, cantidades: {} })}><Package size={14} /> Llegó una parte</button>
                      </div>
                    )}
                  </div>
                  {abierto && (
                    <div className="lam-orden-items">
                      {t.items.filter((it) => !it._cancelado).map((it) => {
                        const mat = matDe(it.material_id);
                        const recibido = itemRecibido(it);
                        const falta = itemFalta(it);
                        const pendiente = itemPendiente(it);
                        return (
                          <div key={it.id} className="lam-item">
                            <div style={{ minWidth: 0 }}>
                              <div className="lam-item-nom">
                                {it.descripcion || mat?.nombre || "Material sin nombre"}
                                {!pendiente && <span className="lam-tag" data-tono="verde" style={{ marginLeft: 7 }}>Recibido</span>}
                              </div>
                              <div className="lam-item-meta">
                                <span data-tono="azul">Pedido <b>{fmtNum(it.cantidad)}</b> {it.unidad}</span>
                                {recibido > 0 && <span data-tono="verde">Llegó <b>{fmtNum(recibido)}</b></span>}
                                {recibido > 0 && pendiente && <span data-tono="violeta">Falta <b>{fmtNum(falta)}</b></span>}
                                {mat && <span>Stock <b>{fmtNum(stockPorMaterial[mat.id])}</b></span>}
                              </div>
                              {recibido > 0 && pendiente && <Mini pct={(recibido / Math.max(1, num(it.cantidad))) * 100} style={{ maxWidth: 220, marginTop: 7 }} />}
                              {pendiente && !mat && (
                                <div className="lam-vinculo" data-tono="violeta">
                                  <Link2 size={12} /> No está en el catálogo: vinculalo para poder sumarlo al stock.
                                  {puedeCargar && (
                                    <select className="ui-input" style={{ minHeight: 30, fontSize: 12, width: 220 }} value="" onChange={(e) => e.target.value && onVincular(it, e.target.value)} aria-label={`Vincular ${it.descripcion}`}>
                                      <option value="">Vincular con…</option>
                                      {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                                    </select>
                                  )}
                                </div>
                              )}
                            </div>
                            {puedeCargar && pendiente && mat ? (
                              <>
                                <button type="button" className="ui-btn chico" data-tono="verde" onClick={() => onRecibir({ tipo: "entero", pedido: p, item: it, destino })}><Check size={13} /> Llegó</button>
                                <button type="button" className="ui-btn chico" data-tono="cian" onClick={() => onRecibir({ tipo: "parcial", pedido: p, item: it, destino, cantidad: "" })}>Parte</button>
                              </>
                            ) : <><span /><span /></>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Bloque>

      {puedeCargar && (
        <Bloque icono={Plus} tono="verde" titulo="Ingreso manual" texto="Remitos sueltos o madera que llega sin un pedido.">
          <div className="lam-con-lado">
            <form onSubmit={registrar} className="lam-form">
              <label className="lam-campo c4"><span>Material <span className="req">*</span></span>
                <select className="ui-input" value={form.material_id} onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value }))}>
                  <option value="">Elegir material…</option>
                  {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad_medida})</option>)}
                </select>
              </label>
              <label className="lam-campo c2"><span>Cantidad <span className="req">*</span></span>
                <input className="ui-input num" type="number" step="1" min="1" inputMode="numeric" placeholder="0" value={form.cantidad} onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))} />
              </label>
              <div className="lam-campo c4"><span>Obra o destino</span>
                <SelectorObra
                  obras={obras}
                  value={form.obra}
                  onChange={(valor) => setForm((f) => ({ ...f, obra: valor }))}
                  otros={[{ valor: "Stock", label: "Stock", detalle: STOCK_MADERAS }]}
                  placeholder="Stock o la obra para la que llega…"
                  conDesmolde={false}
                />
              </div>
              <label className="lam-campo c2"><span>Fecha</span>
                <input className="ui-input" type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
              </label>
              <label className="lam-campo"><span>Proveedor</span>
                <input className="ui-input" list="mad-proveedores" placeholder="Nombre del proveedor…" value={form.proveedor} onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))} />
                <datalist id="mad-proveedores">{proveedores.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
              <label className="lam-campo"><span>Observaciones</span>
                <input className="ui-input" placeholder="Remito, aclaración…" value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
              </label>
              <div className="lam-form-pie">
                <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando}><ArrowDownToLine size={15} /> {guardando ? "Registrando…" : "Registrar ingreso"}</button>
              </div>
            </form>
            <aside className="lam-lado" aria-live="polite">
              <div className="lam-lado-et">Resumen</div>
              {matSel ? (
                <>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 650 }}>{matSel.nombre}</div>
                    <div className="lam-ayuda">{matSel.categoria || "Sin categoría"}</div>
                  </div>
                  <div className="lam-cifras">
                    <Cifra etiqueta="Hoy hay" valor={fmtNum(stockPorMaterial[matSel.id])} unidad={matSel.unidad_medida} />
                    <Cifra etiqueta="Queda en" valor={fmtNum(num(stockPorMaterial[matSel.id]) + num(form.cantidad))} unidad={matSel.unidad_medida} tono="verde" />
                  </div>
                </>
              ) : (
                <p className="lam-ayuda">Elegí un material para ver el stock antes de registrar.</p>
              )}
            </aside>
          </div>
        </Bloque>
      )}

      <Bloque
        icono={History}
        tono="neutro"
        titulo="Historial de ingresos"
        der={(
          <label className="lam-buscar">
            <Search size={15} />
            <input className="ui-input" value={q} onChange={(e) => { setQ(e.target.value); setLimite(60); }} placeholder="Material, proveedor, obra…" aria-label="Buscar en el historial" />
          </label>
        )}
        sinPad
      >
        {!ingresos.length ? (
          <Vacio icono={History} titulo={q ? "Sin resultados" : "Sin ingresos registrados"} />
        ) : (
          <>
            <div className="lam-tabla">
              <table className="lam-t">
                <thead>
                  <tr><th>Fecha</th><th>Material</th><th className="der">Cantidad</th><th>Proveedor</th><th>Obra</th><th>Observaciones</th></tr>
                </thead>
                <tbody>
                  {ingresos.slice(0, limite).map((m) => {
                    const obra = buscarObra(obras, m.obra);
                    return (
                      <tr key={m.id}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div className="mono">{fmtFecha(m._fecha)}</div>
                          <div className="chico mono">{horaDe(m.created_at)}</div>
                        </td>
                        <td><div className="nom">{m._material}</div></td>
                        <td className="der"><span className="lam-cant" data-tono="verde">+{fmtNum(m._cant)} <small>{m._unidad}</small></span></td>
                        <td>{m.proveedor || <span className="vacio">—</span>}</td>
                        <td>{obra ? <Estado tono="azul" punto={false}>{obra.codigo}</Estado> : m.obra || <span className="vacio">—</span>}</td>
                        <td style={{ maxWidth: 280 }}><span style={{ color: "var(--muted)" }}>{m._obsVisible || <span className="vacio">—</span>}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {ingresos.length > limite && (
              <div className="lam-mas">
                Mostrando {limite} de {ingresos.length}. <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => setLimite((n) => n + 100)}>Ver más</button>
              </div>
            )}
          </>
        )}
      </Bloque>
    </>
  );
}
