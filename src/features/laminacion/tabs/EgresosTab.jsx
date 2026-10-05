import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, ArrowUpFromLine, Check, History, Search, ShoppingCart } from "lucide-react";
import SelectorObra from "../SelectorObra";
import { buscarObra, destinosFrecuentes, desmoldeDe, fmtFecha, fmtNum, hoyISO, num } from "../obras";
import { Aviso, Bloque, Cifra, Estado, Mini, Vacio } from "../ui";

const FORM_VACIO = () => ({ material_id: "", cantidad: "", fecha: hoyISO(), destino: "", nombre_persona: "", observaciones: "" });

function horaDe(ts) {
  return ts ? new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
}

export default function EgresosTab({
  sede, materiales, movimientos, pedidos, stockPorMaterial, obras, puedeCargar,
  planDeObra, onCrearEgreso, onIrTraslados,
}) {
  const [form, setForm] = useState(FORM_VACIO);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(60);

  const egresos = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return movimientos
      .filter((m) => m.tipo === "egreso")
      .filter((m) => !qq || [m.laminacion_materiales?.nombre, m.destino, m.obra, m.nombre_persona, m.observaciones].filter(Boolean).join(" ").toLowerCase().includes(qq));
  }, [movimientos, q]);

  // Personas que ya retiraron: se sugieren para no escribir el nombre de cero.
  const personas = useMemo(() => {
    const vistos = new Map();
    for (const m of movimientos) {
      const p = String(m.nombre_persona || "").trim();
      if (p && !vistos.has(p.toUpperCase())) vistos.set(p.toUpperCase(), p);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [movimientos]);

  const otrosDestinos = useMemo(() => {
    const frecuentes = destinosFrecuentes(movimientos, obras);
    const tieneVarios = frecuentes.some((d) => d.valor === "VARIOS");
    return tieneVarios ? frecuentes : [{ valor: "VARIOS", label: "Varios", detalle: "uso general, sin una obra" }, ...frecuentes];
  }, [movimientos, obras]);

  const hoy = hoyISO();
  const egresosHoy = movimientos.filter((m) => m.tipo === "egreso" && String(m.fecha || m.created_at || "").slice(0, 10) === hoy).length;

  const mat = materiales.find((m) => String(m.id) === String(form.material_id)) ?? null;
  const obra = buscarObra(obras, form.destino);
  const disponible = mat ? num(stockPorMaterial[mat.id]) : 0;
  const cantidad = num(form.cantidad);
  const despues = disponible - cantidad;
  const dejaNegativo = Boolean(mat) && cantidad > disponible;
  const plan = mat && obra ? planDeObra(obra, mat.id) : null;
  const pasaPlan = plan && plan.retirado + cantidad > plan.necesaria;
  const pendientesMaterial = mat
    ? pedidos.filter((p) => String(p.material_id) === String(mat.id) && p.estado === "pendiente" && !p.archivado_at)
    : [];

  async function registrar(e) {
    e.preventDefault();
    if (guardando) return;
    setIntento(true);
    setGuardando(true);
    const ok = await onCrearEgreso(form, obra);
    setGuardando(false);
    if (ok) {
      setIntento(false);
      // Se conservan fecha, destino y persona: suelen repetirse en la tanda.
      setForm((f) => ({ ...FORM_VACIO(), fecha: f.fecha, destino: f.destino, nombre_persona: f.nombre_persona }));
    }
  }

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Laminación · {sede}</div>
          <h1 className="lam-h1">Egresos de <span className="acento">material</span></h1>
          <p className="lam-sub">
            {egresosHoy ? <><b className="mono">{egresosHoy}</b> {egresosHoy === 1 ? "salida" : "salidas"} hoy</> : "Sin salidas hoy"}
            {" · "}la obra se elige de la lista, con su fecha de desmolde
          </p>
        </div>
      </div>

      {puedeCargar && (
        <Bloque icono={ArrowUpFromLine} tono="violeta" titulo="Registrar egreso" texto="Salida de material del galpón hacia una obra.">
          <div className="lam-con-lado">
            <form onSubmit={registrar} className="lam-form">
              <div className="lam-campo c6"><span>Obra <span className="req">*</span></span>
                <SelectorObra
                  obras={obras}
                  value={form.destino}
                  onChange={(valor) => setForm((f) => ({ ...f, destino: valor }))}
                  otros={otrosDestinos}
                  invalido={intento}
                  placeholder="Elegí la obra para la que sale el material…"
                />
                {form.destino && !obra && !otrosDestinos.some((d) => d.valor === form.destino) && (
                  <span className="lam-ayuda" style={{ color: "var(--violet)" }}>Escrito a mano: no va a sumar al consumo de ninguna obra.</span>
                )}
              </div>
              <label className="lam-campo c4"><span>Material <span className="req">*</span></span>
                <select className="ui-input" value={form.material_id} onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value }))}>
                  <option value="">Elegir material…</option>
                  {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre} · hay {fmtNum(stockPorMaterial[m.id])} {m.unidad}</option>)}
                </select>
              </label>
              <label className="lam-campo c2"><span>Cantidad <span className="req">*</span></span>
                <input className="ui-input num" type="number" step="0.01" min="0" placeholder="0" value={form.cantidad} onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))} />
              </label>
              <label className="lam-campo c2"><span>Persona que retira</span>
                <input className="ui-input" list="lam-personas" placeholder="Nombre…" value={form.nombre_persona} onChange={(e) => setForm((f) => ({ ...f, nombre_persona: e.target.value }))} />
                <datalist id="lam-personas">{personas.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
              <label className="lam-campo c2"><span>Fecha</span>
                <input className="ui-input" type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
              </label>
              <label className="lam-campo c2"><span>Observaciones</span>
                <input className="ui-input" placeholder="Reemplazo, remito…" value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
              </label>
              <div className="lam-form-pie">
                <span className="lam-ayuda" style={{ marginRight: "auto" }}>
                  ¿Va para el otro galpón? <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={onIrTraslados}><ArrowLeftRight size={13} /> Usá Traslados</button>
                </span>
                <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando}><ArrowUpFromLine size={15} /> {guardando ? "Registrando…" : "Registrar egreso"}</button>
              </div>
            </form>

            <aside className="lam-lado" aria-live="polite">
              <div className="lam-lado-et">Control</div>
              {obra && (
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: 16, fontWeight: 650 }}>{obra.codigo}</span>
                    <span className="lam-ayuda">{obra.lineaLabel}</span>
                  </div>
                  <div className="lam-ayuda">
                    {desmoldeDe(obra) ? `Desmolde ${obra.desmoldeReal ? "" : "estimado "}${fmtFecha(desmoldeDe(obra))}` : "Sin fecha de desmolde en Obras"}
                  </div>
                </div>
              )}
              {mat ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 650 }}>{mat.nombre}</div>
                  <div className="lam-cifras">
                    <Cifra etiqueta="Hay" valor={fmtNum(disponible)} unidad={mat.unidad} tono={disponible > 0 ? "verde" : "rojo"} />
                    <Cifra etiqueta="Después" valor={fmtNum(despues)} unidad={mat.unidad} tono={dejaNegativo ? "rojo" : undefined} />
                  </div>
                  {dejaNegativo && <Aviso tono="rojo" icono={AlertTriangle}>La salida supera el stock. Te vamos a pedir confirmación.</Aviso>}
                  {plan && (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div className="lam-ayuda">Plan de la obra para este material</div>
                      <Mini pct={(Math.min(plan.necesaria, plan.retirado + cantidad) / plan.necesaria) * 100} tono={pasaPlan ? "violeta" : undefined} />
                      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                        Previsto <b className="mono">{fmtNum(plan.necesaria)}</b> · retirado <b className="mono">{fmtNum(plan.retirado)}</b>{cantidad > 0 && <> · con este <b className="mono">{fmtNum(plan.retirado + cantidad)}</b></>}
                      </div>
                      {pasaPlan && <Aviso tono="violeta" icono={AlertTriangle}>Se pasa de lo planificado. Consultá a Técnica.</Aviso>}
                    </div>
                  )}
                  {pendientesMaterial.length > 0 && (
                    <Aviso tono="azul" icono={ShoppingCart}>
                      {pendientesMaterial.length} {pendientesMaterial.length === 1 ? "pedido pendiente" : "pedidos pendientes"} de este material ({fmtNum(pendientesMaterial.reduce((s, p) => s + Math.max(0, num(p.cantidad) - num(p.cantidad_recibida)), 0))} {mat.unidad} en camino).
                    </Aviso>
                  )}
                  {!dejaNegativo && cantidad > 0 && !pasaPlan && (
                    <div className="lam-ayuda" style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--green)" }}><Check size={14} /> Todo en orden.</div>
                  )}
                </>
              ) : (
                <p className="lam-ayuda">Elegí la obra y el material para ver el stock y lo planificado antes de retirar.</p>
              )}
            </aside>
          </div>
        </Bloque>
      )}

      <Bloque
        icono={History}
        tono="neutro"
        titulo="Historial de egresos"
        der={(
          <label className="lam-buscar">
            <Search size={15} />
            <input className="ui-input" value={q} onChange={(e) => { setQ(e.target.value); setLimite(60); }} placeholder="Material, obra, persona…" aria-label="Buscar en el historial" />
          </label>
        )}
        sinPad
      >
        {!egresos.length ? (
          <Vacio icono={History} titulo={q ? "Sin resultados" : "Sin egresos registrados"} />
        ) : (
          <>
            <div className="lam-tabla">
              <table className="lam-t">
                <thead>
                  <tr><th>Fecha</th><th>Material</th><th className="der">Cantidad</th><th>Obra / destino</th><th>Persona</th><th>Observaciones</th></tr>
                </thead>
                <tbody>
                  {egresos.slice(0, limite).map((m) => {
                    const o = buscarObra(obras, m.destino || m.obra);
                    return (
                      <tr key={m.id}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div className="mono">{fmtFecha(m.fecha || m.created_at)}</div>
                          <div className="chico mono">{horaDe(m.created_at)}</div>
                        </td>
                        <td><div className="nom">{m.laminacion_materiales?.nombre ?? "—"}</div></td>
                        <td className="der"><span className="lam-cant" data-tono="violeta">−{fmtNum(m.cantidad)} <small>{m.laminacion_materiales?.unidad}</small></span></td>
                        <td>{o ? <Estado tono="azul" punto={false}>{o.codigo}</Estado> : (m.destino || <span className="vacio">—</span>)}</td>
                        <td>{m.nombre_persona || <span className="vacio">—</span>}</td>
                        <td style={{ maxWidth: 260 }}><span style={{ color: "var(--muted)" }}>{m.observaciones || <span className="vacio">—</span>}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {egresos.length > limite && (
              <div className="lam-mas">
                Mostrando {limite} de {egresos.length}. <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => setLimite((n) => n + 100)}>Ver más</button>
              </div>
            )}
          </>
        )}
      </Bloque>
    </>
  );
}
