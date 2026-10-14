import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpFromLine, Check, History, Search, ShoppingCart } from "lucide-react";
import SelectorObra from "@/features/laminacion/SelectorObra";
import { buscarObra, fmtFecha, fmtNum, hoyISO, num } from "@/features/laminacion/obras";
import { Aviso, Bloque, Cifra, Estado, Vacio } from "@/features/laminacion/ui";
import { destinosFrecuentes } from "../datos";
import TarjetaRetiro from "../TarjetaRetiro";
import { etiquetaEmpleado } from "../retiroNfc";

function horaDe(ts) {
  return ts ? new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
}

// El formulario vive en el contenedor (así la tarjeta NFC puede completar
// "quién retira" aunque se lea mientras se elige otra cosa).
export default function EgresosTab({
  materiales, movs, stockPorMaterial, enCaminoPorMaterial, obras, puedeCargar,
  form, setForm, nfc, onLimpiarNfc, onCrearEgreso,
}) {
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(60);

  const egresos = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return movs
      .filter((m) => m._tipo === "egreso")
      .filter((m) => !qq || [m._material, m.obra, m.destino, m._persona, m._obs].filter(Boolean).join(" ").toLowerCase().includes(qq));
  }, [movs, q]);

  // Personas que ya retiraron: se sugieren para no escribir el nombre de cero.
  const personas = useMemo(() => {
    const vistos = new Map();
    for (const m of movs) {
      if (m._tipo !== "egreso") continue;
      const p = String(m._persona || "").trim();
      if (p && p !== "." && !vistos.has(p.toUpperCase())) vistos.set(p.toUpperCase(), p);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [movs]);

  const otrosDestinos = useMemo(() => destinosFrecuentes(movs, obras), [movs, obras]);

  const hoy = hoyISO();
  const egresosHoy = movs.filter((m) => m._tipo === "egreso" && String(m._fecha).slice(0, 10) === hoy).length;

  const mat = materiales.find((m) => String(m.id) === String(form.material_id)) ?? null;
  const obra = buscarObra(obras, form.destino);
  const disponible = mat ? num(stockPorMaterial[mat.id]) : 0;
  const cantidad = num(form.cantidad);
  const despues = disponible - cantidad;
  const dejaNegativo = Boolean(mat) && cantidad > disponible;
  const enCamino = mat ? num(enCaminoPorMaterial[mat.id]) : 0;

  async function registrar(e) {
    e.preventDefault();
    if (guardando) return;
    setIntento(true);
    setGuardando(true);
    const ok = await onCrearEgreso();
    setGuardando(false);
    if (ok) setIntento(false);
  }

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Maderas · Salidas</div>
          <h1 className="lam-h1">Egresos de <span className="acento">maderas</span></h1>
          <p className="lam-sub">
            {egresosHoy ? <><b className="mono">{egresosHoy}</b> {egresosHoy === 1 ? "salida" : "salidas"} hoy</> : "Sin salidas hoy"}
            {" · "}la obra se elige de la lista y quien retira se valida con la tarjeta
          </p>
        </div>
      </div>

      {puedeCargar && (
        <Bloque icono={ArrowUpFromLine} tono="violeta" titulo="Registrar egreso" texto="Salida de madera del depósito hacia una obra o un destino.">
          <div className="lam-con-lado">
            <form onSubmit={registrar} className="lam-form">
              <div className="lam-campo c6"><span>Obra o destino <span className="req">*</span></span>
                <SelectorObra
                  obras={obras}
                  value={form.destino}
                  onChange={(valor) => setForm((f) => ({ ...f, destino: valor }))}
                  otros={otrosDestinos}
                  invalido={intento}
                  placeholder="Elegí la obra para la que sale la madera…"
                  conDesmolde={false}
                />
                {form.destino && !obra && !otrosDestinos.some((d) => d.valor === form.destino) && (
                  <span className="lam-ayuda" style={{ color: "var(--violet)" }}>Escrito a mano: no va a sumar al consumo de ninguna obra.</span>
                )}
              </div>
              <label className="lam-campo c4"><span>Material <span className="req">*</span></span>
                <select className="ui-input" value={form.material_id} onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value }))}>
                  <option value="">Elegir material…</option>
                  {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre} · hay {fmtNum(stockPorMaterial[m.id])} {m.unidad_medida}</option>)}
                </select>
              </label>
              <label className="lam-campo c2"><span>Cantidad <span className="req">*</span></span>
                <input className="ui-input num" type="number" step="1" min="1" inputMode="numeric" placeholder="0" value={form.cantidad} onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))} />
              </label>
              <label className="lam-campo c4"><span>Persona que retira</span>
                <input
                  className="ui-input"
                  list="mad-personas"
                  placeholder="Nombre del operario…"
                  value={form.nombre_persona}
                  onChange={(e) => {
                    // Si se cambia a mano el nombre que puso la tarjeta, la tarjeta deja de valer.
                    if (nfc.empleado && e.target.value !== etiquetaEmpleado(nfc.empleado)) nfc.clear();
                    setForm((f) => ({ ...f, nombre_persona: e.target.value }));
                  }}
                />
                <datalist id="mad-personas">{personas.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
              <label className="lam-campo c2"><span>Fecha</span>
                <input className="ui-input" type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
              </label>
              <div className="lam-campo c6">
                <TarjetaRetiro nfc={nfc} onLimpiar={onLimpiarNfc} />
              </div>
              <label className="lam-campo c6"><span>Observaciones</span>
                <input className="ui-input" placeholder="Se tomó de stock, reemplazo, aclaración…" value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
              </label>
              <div className="lam-form-pie">
                <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando}><ArrowUpFromLine size={15} /> {guardando ? "Registrando…" : "Registrar egreso"}</button>
              </div>
            </form>

            <aside className="lam-lado" aria-live="polite">
              <div className="lam-lado-et">Control</div>
              {obra && (
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: 16, fontWeight: 650 }}>{obra.codigo}</span>
                    <span className="lam-ayuda">{obra.lineaLabel}{obra.estado !== "activa" ? ` · ${obra.estado}` : ""}</span>
                  </div>
                </div>
              )}
              {mat ? (
                <>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 650 }}>{mat.nombre}</div>
                    <div className="lam-ayuda">{mat.categoria || "Sin categoría"}</div>
                  </div>
                  <div className="lam-cifras">
                    <Cifra etiqueta="Hay" valor={fmtNum(disponible)} unidad={mat.unidad_medida} tono={disponible > 0 ? "verde" : "rojo"} />
                    <Cifra etiqueta="Después" valor={fmtNum(despues)} unidad={mat.unidad_medida} tono={dejaNegativo ? "rojo" : undefined} />
                  </div>
                  {dejaNegativo && <Aviso tono="rojo" icono={AlertTriangle}>La salida supera el stock. Te vamos a pedir confirmación.</Aviso>}
                  {enCamino > 0 && (
                    <Aviso tono="azul" icono={ShoppingCart}>Hay {fmtNum(enCamino)} {mat.unidad_medida} pedidas que todavía no llegaron.</Aviso>
                  )}
                  {!dejaNegativo && cantidad > 0 && (
                    <div className="lam-ayuda" style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--green)" }}><Check size={14} /> Se descuentan {fmtNum(cantidad)} {mat.unidad_medida}.</div>
                  )}
                </>
              ) : (
                <p className="lam-ayuda">Elegí la obra y el material para ver cuánto hay antes de retirar.</p>
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
                    const o = buscarObra(obras, m.obra || m.destino);
                    return (
                      <tr key={m.id}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div className="mono">{fmtFecha(m._fecha)}</div>
                          <div className="chico mono">{horaDe(m.created_at)}</div>
                        </td>
                        <td><div className="nom">{m._material}</div></td>
                        <td className="der"><span className="lam-cant" data-tono="violeta">−{fmtNum(m._cant)} <small>{m._unidad}</small></span></td>
                        <td>{o ? <Estado tono="azul" punto={false}>{o.codigo}</Estado> : (m.obra || m.destino || <span className="vacio">—</span>)}</td>
                        <td>
                          {m._persona || <span className="vacio">Sin registrar</span>}
                          {m._entrego && <div className="chico">entregó {m._entrego}</div>}
                        </td>
                        <td style={{ maxWidth: 260 }}><span style={{ color: "var(--muted)" }}>{m._obsVisible || <span className="vacio">—</span>}</span></td>
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
