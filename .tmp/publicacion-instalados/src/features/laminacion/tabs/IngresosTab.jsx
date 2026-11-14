import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, ArrowDownToLine, Check, ChevronRight, History, Inbox, Package, Plus, Search } from "lucide-react";
import SelectorObra from "../SelectorObra";
import { agruparPorOrden, buscarObra, fmtFecha, fmtNum, hoyISO, num } from "../obras";
import { Bloque, Cifra, Estado, Mini, Tag, Vacio } from "../ui";

const FORM_VACIO = () => ({ material_id: "", cantidad: "", fecha: hoyISO(), proveedor: "", obra: "", observaciones: "" });

function horaDe(ts) {
  return ts ? new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
}

export default function IngresosTab({
  sede, materiales, movimientos, pedidos, pedidosPendientes, stockPorMaterial, obras, puedeCargar,
  onRecibir, onRestaurar, onCrearIngreso,
}) {
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [verArchivados, setVerArchivados] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(60);

  const matDe = (id) => materiales.find((m) => String(m.id) === String(id));
  const ordenes = useMemo(() => agruparPorOrden(pedidosPendientes, { manualPorPedido: false }), [pedidosPendientes]);

  // Los archivados se muestran y restauran por orden, no por material.
  const archivados = useMemo(() => {
    const items = pedidos.filter((p) => p.archivado_at);
    return agruparPorOrden(items)
      .map((g) => ({ ...g, archivadoAt: g.items.reduce((max, p) => (p.archivado_at > max ? p.archivado_at : max), "") }))
      .sort((a, b) => new Date(b.archivadoAt).getTime() - new Date(a.archivadoAt).getTime());
  }, [pedidos]);

  const ingresos = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return movimientos
      .filter((m) => m.tipo === "ingreso")
      .filter((m) => !qq || [m.laminacion_materiales?.nombre, m.proveedor, m.obra, m.observaciones].filter(Boolean).join(" ").toLowerCase().includes(qq));
  }, [movimientos, q]);

  // Proveedores ya usados, para sugerirlos y no escribirlos de cero.
  const proveedores = useMemo(() => {
    const vistos = new Map();
    for (const m of movimientos) {
      const p = String(m.proveedor || "").trim();
      if (p && !vistos.has(p.toUpperCase())) vistos.set(p.toUpperCase(), p);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [movimientos]);

  const hoy = hoyISO();
  const ingresosHoy = movimientos.filter((m) => m.tipo === "ingreso" && String(m.fecha || m.created_at || "").slice(0, 10) === hoy).length;
  const matSel = matDe(form.material_id);

  async function registrar(e) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    const ok = await onCrearIngreso(form);
    setGuardando(false);
    if (ok) setForm((f) => ({ ...FORM_VACIO(), fecha: f.fecha }));
  }

  function alternar(ref) {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Laminación · {sede}</div>
          <h1 className="lam-h1">Ingresos de <span className="acento">material</span></h1>
          <p className="lam-sub">
            {ordenes.length
              ? <><b className="mono">{ordenes.length}</b> {ordenes.length === 1 ? "orden" : "órdenes"} para recibir · <b className="mono">{pedidosPendientes.length}</b> materiales</>
              : "Nada pendiente de recibir"}
            {ingresosHoy > 0 && <> · <b className="mono">{ingresosHoy}</b> ingresos hoy</>}
          </p>
        </div>
      </div>

      <Bloque
        icono={Inbox}
        tono={ordenes.length ? "cian" : "verde"}
        titulo="Para recibir"
        texto="Materiales comprados que todavía no entraron al stock. Al recibirlos se suman solos y Compras se entera."
        sinPad
      >
        {!ordenes.length ? (
          <Vacio icono={Check} titulo="Todo recibido" texto="Cuando Compras mande materiales a laminación, van a aparecer acá." />
        ) : (
          <div className="lam-ordenes" style={{ padding: 12 }}>
            {ordenes.map((grupo, i) => {
              const abierta = abiertas.has(grupo.ref);
              const conEntregas = grupo.items.filter((p) => num(p.cantidad_recibida) > 0).length;
              const destino = grupo.items.map((p) => p.obra_destino).find(Boolean);
              const obra = buscarObra(obras, destino);
              const preview = grupo.items.slice(0, 3).map((p) => matDe(p.material_id)?.nombre).filter(Boolean).join(" · ");
              return (
                <article key={grupo.ref} className={`lam-orden${abierta ? " abierta" : ""}`} style={{ "--i": Math.min(i, 10) }}>
                  <div className="lam-orden-cab">
                    <button type="button" className="plegar" onClick={() => alternar(grupo.ref)} aria-expanded={abierta} aria-label={abierta ? "Ocultar materiales" : "Ver materiales"}>
                      <ChevronRight size={16} style={{ transform: abierta ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
                    </button>
                    <div style={{ minWidth: 0 }}>
                      <div className="lam-orden-l1">
                        <span className="lam-orden-ref">{grupo.ref === "__manual__" ? "Manual" : grupo.ref}</span>
                        {obra && <Tag tono="azul">Obra {obra.codigo}</Tag>}
                        {!obra && destino && <Tag tono="neutro">{destino}</Tag>}
                        {grupo.items.some((p) => p.categoria === "extra") && <Tag tono="cian">Con extras</Tag>}
                        {conEntregas > 0 && <Tag tono="violeta">Parcial · {conEntregas}/{grupo.items.length}</Tag>}
                      </div>
                      <div className="lam-orden-tit">{grupo.label || "Orden de compra"}</div>
                      <div className="lam-orden-meta">
                        <span>{grupo.items.length} {grupo.items.length === 1 ? "material" : "materiales"}{preview ? ` · ${preview}${grupo.items.length > 3 ? "…" : ""}` : ""}</span>
                        <span className="mono">{fmtFecha(grupo.createdAt)}</span>
                      </div>
                    </div>
                    <div className="lam-orden-acc">
                      <button type="button" className="ui-btn chico" data-tono="verde" onClick={() => onRecibir({ tipo: "orden_completa", grupo })}><Check size={14} /> Llegó todo</button>
                      <button type="button" className="ui-btn chico" data-tono="cian" onClick={() => onRecibir({ tipo: "orden_parcial", grupo, cantsParciales: {} })}><Package size={14} /> Llegó una parte</button>
                      {/* Gris a propósito: archivar es la salida para lo que ya no va a llegar. */}
                      <button
                        type="button"
                        className="lam-btn-ic chico"
                        title="Archivar: sacarla de la recepción sin borrarla"
                        aria-label="Archivar orden"
                        onClick={() => onRecibir({
                          tipo: "archivar",
                          items: grupo.items,
                          titulo: `${grupo.ref === "__manual__" ? "Pedido manual" : grupo.ref} · ${grupo.items.length} ${grupo.items.length === 1 ? "material" : "materiales"}`,
                          motivo: "",
                        })}
                      >
                        <Archive size={14} />
                      </button>
                    </div>
                  </div>
                  {abierta && (
                    <div className="lam-orden-items">
                      {grupo.items.map((p) => {
                        const mat = matDe(p.material_id);
                        const recibido = num(p.cantidad_recibida);
                        const falta = Math.max(0, num(p.cantidad) - recibido);
                        const stock = num(stockPorMaterial[p.material_id]);
                        return (
                          <div key={p.id} className="lam-item">
                            <div style={{ minWidth: 0 }}>
                              <div className="lam-item-nom">
                                {mat?.nombre ?? "Material desconocido"}
                                {p.categoria === "extra" && <span className="lam-tag" data-tono="cian" style={{ marginLeft: 7 }}>Extra</span>}
                              </div>
                              <div className="lam-item-meta">
                                <span data-tono="azul">Pedido <b>{fmtNum(p.cantidad)}</b> {mat?.unidad}</span>
                                {recibido > 0 && <span data-tono="verde">Llegó <b>{fmtNum(recibido)}</b></span>}
                                {recibido > 0 && <span data-tono="violeta">Falta <b>{fmtNum(falta)}</b></span>}
                                <span>Stock <b>{fmtNum(stock)}</b></span>
                              </div>
                              {recibido > 0 && <Mini pct={(recibido / Math.max(1, num(p.cantidad))) * 100} style={{ maxWidth: 220, marginTop: 7 }} />}
                            </div>
                            <button type="button" className="ui-btn chico" data-tono="verde" onClick={() => onRecibir({ pedido: p, tipo: "entero", cantParcial: "" })}><Check size={13} /> Llegó</button>
                            <button type="button" className="ui-btn chico" data-tono="cian" onClick={() => onRecibir({ pedido: p, tipo: "parcial", cantParcial: "" })}>Parte</button>
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

      {archivados.length > 0 && (
        <section className="lam-bloque">
          <button type="button" className="lam-plegar lam-bloque-cab" aria-expanded={verArchivados} onClick={() => setVerArchivados((v) => !v)}>
            <span className="lam-bloque-ic" data-tono="neutro"><Archive size={16} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="lam-bloque-tit">Archivados <span className="mono" style={{ color: "var(--subtle)", fontSize: 13 }}>{archivados.length}</span></div>
              <p className="lam-bloque-txt">Órdenes que se sacaron de la recepción. Si el material llega, restaurás la orden completa.</p>
            </div>
            <ChevronRight size={16} className="chev" style={{ marginLeft: "auto" }} />
          </button>
          {verArchivados && (
            <div className="lam-bloque-cuerpo sin-pad">
              <div className="lam-filas">
                {archivados.map((g) => {
                  const motivos = [...new Set(g.items.map((p) => p.archivado_motivo).filter(Boolean))];
                  return (
                    <div key={g.ref} className="lam-fila">
                      <div style={{ minWidth: 0 }}>
                        <div className="lam-fila-tit">
                          {!g.ref.startsWith("__manual_") && <span className="lam-orden-ref" style={{ marginRight: 8 }}>{g.ref}</span>}
                          {g.ref.startsWith("__manual_") ? "Pedido manual" : g.label}
                        </div>
                        <div className="lam-fila-meta">
                          <span>{g.items.map((p) => `${matDe(p.material_id)?.nombre ?? "Material"} (${fmtNum(p.cantidad)})`).join(" · ")}</span>
                        </div>
                        <div className="lam-fila-meta">
                          <span>Archivado el {fmtFecha(g.archivadoAt)}</span>
                          {motivos.length > 0 && <span>· {motivos.join(" · ")}</span>}
                        </div>
                      </div>
                      <div className="lam-fila-acc">
                        <button type="button" className="ui-btn chico ui-btn-suave" onClick={() => onRestaurar(g.items)}><ArchiveRestore size={14} /> Restaurar</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {puedeCargar && (
        <Bloque icono={Plus} titulo="Ingreso manual" texto="Remitos sueltos o material que llega sin una orden.">
          <div className="lam-con-lado">
            <form onSubmit={registrar} className="lam-form">
              <label className="lam-campo c4"><span>Material <span className="req">*</span></span>
                <select className="ui-input" value={form.material_id} onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value }))}>
                  <option value="">Elegir material…</option>
                  {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
                </select>
              </label>
              <label className="lam-campo c2"><span>Cantidad <span className="req">*</span></span>
                <input className="ui-input num" type="number" step="0.01" min="0" placeholder="0" value={form.cantidad} onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))} />
              </label>
              <div className="lam-campo c4"><span>Obra o destino</span>
                <SelectorObra
                  obras={obras}
                  value={form.obra}
                  onChange={(valor) => setForm((f) => ({ ...f, obra: valor }))}
                  otros={[{ valor: "Stock", label: `Stock del galpón`, detalle: "sin obra" }]}
                  placeholder="Stock o la obra para la que llega…"
                />
              </div>
              <label className="lam-campo c2"><span>Fecha</span>
                <input className="ui-input" type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
              </label>
              <label className="lam-campo"><span>Proveedor</span>
                <input className="ui-input" list="lam-proveedores" placeholder="ADS, Plaquimet…" value={form.proveedor} onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))} />
                <datalist id="lam-proveedores">{proveedores.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
              <label className="lam-campo"><span>Observaciones</span>
                <input className="ui-input" placeholder="Remito, lote, factura…" value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
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
                    <Cifra etiqueta="Hoy hay" valor={fmtNum(stockPorMaterial[matSel.id])} unidad={matSel.unidad} />
                    <Cifra etiqueta="Queda en" valor={fmtNum(num(stockPorMaterial[matSel.id]) + num(form.cantidad))} unidad={matSel.unidad} tono="verde" />
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
                          <div className="mono">{fmtFecha(m.fecha || m.created_at)}</div>
                          <div className="chico mono">{horaDe(m.created_at)}</div>
                        </td>
                        <td><div className="nom">{m.laminacion_materiales?.nombre ?? "—"}</div></td>
                        <td className="der"><span className="lam-cant" data-tono="verde">+{fmtNum(m.cantidad)} <small>{m.laminacion_materiales?.unidad}</small></span></td>
                        <td>{m.proveedor || <span className="vacio">—</span>}</td>
                        <td>{obra ? <Estado tono="azul" punto={false}>{obra.codigo}</Estado> : m.obra || <span className="vacio">—</span>}</td>
                        <td style={{ maxWidth: 260 }}><span style={{ color: "var(--muted)" }}>{m.observaciones || <span className="vacio">—</span>}</span></td>
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
