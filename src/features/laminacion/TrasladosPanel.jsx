import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, LoaderCircle, PackageOpen, RotateCcw, Search, Truck, Undo2 } from "lucide-react";
import { Aviso, Bloque, Estado } from "./ui";
import { OTRA_SEDE, cancelarTraslado, cargarTraslados, confirmarTraslado, crearTraslado, stockDeSede } from "@/features/laminacion/trasladosApi";

/**
 * El único punto donde los dos galpones se ven.
 *
 * Tiene tres cosas, en el orden en que importan durante el día:
 *
 *   1. Lo que me está llegando y todavía no confirmé. Va primero porque es lo
 *      único que exige una acción mía: mientras no lo confirme, ese material no
 *      figura en mi stock aunque ya esté en el galpón.
 *   2. Lo que mandé y allá no confirmaron.
 *   3. El stock del otro galpón, que es lo que contesta "me quedé en cero,
 *      ¿allá hay?", y el formulario para mandar.
 *
 * Confirmar la llegada no es burocracia: entre que sale y llega, el material no
 * está en ningún galpón. Si el ingreso se escribiera junto con el egreso, el
 * destino vería stock que todavía está arriba de un camión y alguien lo
 * contaría para planificar una obra.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (n) => String(Math.round(num(n) * 100) / 100).replace(".", ",");

const fechaCorta = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
};


export default function TrasladosPanel({ sede, materiales, stockPorMaterial, puedeCargar, onCambio }) {
  const otra = OTRA_SEDE[sede];
  const [traslados, setTraslados] = useState({ entrando: [], saliendo: [], historial: [] });
  const [stockOtra, setStockOtra] = useState(new Map());
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ material_id: "", cantidad: "", observaciones: "" });

  const avisar = useCallback((texto) => {
    setOk(texto);
    window.setTimeout(() => setOk(""), 3500);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [t, s] = await Promise.all([cargarTraslados(sede), stockDeSede(otra)]);
      setTraslados(t);
      setStockOtra(s);
      setErr("");
    } catch (e) {
      setErr(e.message || "No se pudieron cargar los traslados.");
    } finally {
      setCargando(false);
    }
  }, [sede, otra]);

  useEffect(() => { void cargar(); }, [cargar]);

  const porId = useMemo(() => new Map((materiales ?? []).map((m) => [m.id, m])), [materiales]);

  // El del otro galpón se lista completo, pero lo que tiene stock va arriba:
  // buscar entre 28 renglones para descubrir que justo ese está en cero es
  // trabajo al pedo.
  const filasOtra = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return (materiales ?? [])
      .map((m) => ({ ...m, alla: num(stockOtra.get(m.id)), aca: num(stockPorMaterial?.[m.id]) }))
      .filter((m) => !texto || m.nombre.toLowerCase().includes(texto))
      .sort((a, b) => (b.alla > 0) - (a.alla > 0) || a.nombre.localeCompare(b.nombre, "es"));
  }, [materiales, stockOtra, stockPorMaterial, q]);

  const materialElegido = porId.get(form.material_id);
  const stockPropio = materialElegido ? num(stockPorMaterial?.[materialElegido.id]) : 0;
  const seLlevaDeMas = materialElegido && num(form.cantidad) > stockPropio;

  async function accion(clave, fn, mensaje) {
    setOcupado(clave);
    setErr("");
    try {
      await fn();
      await cargar();
      onCambio?.();
      avisar(mensaje);
    } catch (e) {
      setErr(e.message || "No se pudo completar la operación.");
    } finally {
      setOcupado("");
    }
  }

  function mandar(e) {
    e.preventDefault();
    if (!form.material_id) return setErr("Elegí el material.");
    if (num(form.cantidad) <= 0) return setErr("La cantidad tiene que ser mayor a cero.");
    void accion("mandar", async () => {
      await crearTraslado({
        materialId: form.material_id,
        cantidad: num(form.cantidad),
        origen: sede,
        destino: otra,
        observaciones: form.observaciones,
      });
      setForm({ material_id: "", cantidad: "", observaciones: "" });
    }, `Salió para ${otra}. Suma al stock de allá cuando lo confirmen.`);
  }

  const nombreDe = (t) => t.laminacion_materiales?.nombre || porId.get(t.material_id)?.nombre || "Material";
  const unidadDe = (t) => t.laminacion_materiales?.unidad || porId.get(t.material_id)?.unidad || "";

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Laminación · {sede}</div>
          <h1 className="lam-h1">Traslados con <span className="acento">{otra}</span></h1>
          <p className="lam-sub">
            {traslados.entrando.length
              ? <><b className="mono">{traslados.entrando.length}</b> {traslados.entrando.length === 1 ? "envío" : "envíos"} en camino para confirmar</>
              : "Nada en camino"}
            {traslados.saliendo.length > 0 && <> · <b className="mono">{traslados.saliendo.length}</b> sin confirmar allá</>}
          </p>
        </div>
        <div className="lam-acciones">
          <button type="button" className="lam-btn-ic" onClick={() => void cargar()} disabled={cargando} aria-label="Volver a leer los traslados" title="Volver a leer">
            {cargando ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}
          </button>
        </div>
      </div>

      {err ? <Aviso onCerrar={() => setErr("")}>{err}</Aviso> : null}
      {ok ? <Aviso tono="verde">{ok}</Aviso> : null}

      {/* ── 1 · Lo que me está llegando ── */}
      <Bloque icono={PackageOpen} tono="verde" titulo={`Me está llegando de ${otra}`} texto="Hasta que no confirmes que llegó, este material no suma a tu stock." sinPad>
        {!traslados.entrando.length ? (
          <p className="lam-ayuda" style={{ padding: "14px 16px" }}>{cargando ? "Cargando…" : "No hay nada en camino."}</p>
        ) : (
          <div className="lam-filas">
            {traslados.entrando.map((t) => (
              <div key={t.id} className="lam-fila">
                <div style={{ minWidth: 0 }}>
                  <div className="lam-fila-tit"><span className="mono">{fmt(t.cantidad)} {unidadDe(t)}</span> · {nombreDe(t)}</div>
                  <div className="lam-fila-meta"><Truck size={13} /> Salió de {t.sede_origen} el {fechaCorta(t.created_at)}{t.observaciones ? ` · ${t.observaciones}` : ""}</div>
                </div>
                <div className="lam-fila-acc">
                  <button type="button" className="ui-btn chico" data-tono="verde" disabled={ocupado === t.id}
                    onClick={() => void accion(t.id, () => confirmarTraslado(t), `Confirmado: ${nombreDe(t)} ya está en tu stock.`)}>
                    {ocupado === t.id ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />} Llegó
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Bloque>

      {/* ── 2 · Lo que mandé ── */}
      <Bloque icono={Truck} tono="neutro" titulo={`Mandé a ${otra} y no confirmaron`} texto="Ya salió de tu stock. Si nunca salió o volvió, cancelalo y vuelve a entrar." sinPad>
        {!traslados.saliendo.length ? (
          <p className="lam-ayuda" style={{ padding: "14px 16px" }}>Nada pendiente de confirmar.</p>
        ) : (
          <div className="lam-filas">
            {traslados.saliendo.map((t) => (
              <div key={t.id} className="lam-fila">
                <div style={{ minWidth: 0 }}>
                  <div className="lam-fila-tit"><span className="mono">{fmt(t.cantidad)} {unidadDe(t)}</span> · {nombreDe(t)}</div>
                  <div className="lam-fila-meta">Salió el {fechaCorta(t.created_at)}{t.observaciones ? ` · ${t.observaciones}` : ""}</div>
                </div>
                <div className="lam-fila-acc">
                  <button type="button" className="ui-btn chico ui-btn-fantasma" disabled={ocupado === t.id}
                    onClick={() => void accion(t.id, () => cancelarTraslado(t, "Cancelado desde el galpón de origen"), "Cancelado. El material volvió a tu stock.")}>
                    {ocupado === t.id ? <LoaderCircle size={13} className="spin" /> : <Undo2 size={13} />} Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Bloque>

      {/* ── 3 · Mandar ── */}
      {puedeCargar ? (
        <Bloque icono={ArrowRight} titulo={`Mandar material a ${otra}`} texto={`Sale de ${sede} ahora y suma en ${otra} cuando lo confirmen.`}>
          <form onSubmit={mandar} className="lam-form">
            <label className="lam-campo c4" htmlFor="traslado-material"><span>Material</span>
              <select id="traslado-material" className="ui-input" value={form.material_id}
                onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value }))}>
                <option value="">Elegir material…</option>
                {(materiales ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre} · acá {fmt(stockPorMaterial?.[m.id])} {m.unidad}</option>
                ))}
              </select>
            </label>
            <label className="lam-campo c2" htmlFor="traslado-cantidad"><span>Cantidad</span>
              <input id="traslado-cantidad" type="number" step="0.01" min="0" className="ui-input num" value={form.cantidad}
                onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))} />
            </label>
            <label className="lam-campo c6" htmlFor="traslado-obs"><span>Observaciones</span>
              <input id="traslado-obs" className="ui-input" value={form.observaciones} placeholder="Quién lo lleva, para qué obra…"
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
            </label>
            {materialElegido ? (
              <div className="lam-campo c6">
                <Aviso tono={seLlevaDeMas ? "rojo" : "neutro"}>
                  {seLlevaDeMas
                    ? `Acá hay ${fmt(stockPropio)} ${materialElegido.unidad}: estás mandando más de lo que tenés.`
                    : `Te quedan ${fmt(stockPropio - num(form.cantidad))} ${materialElegido.unidad} después de mandarlo.`}
                </Aviso>
              </div>
            ) : null}
            <div className="lam-form-pie">
              <button type="submit" className="ui-btn ui-btn-primario" disabled={ocupado === "mandar"}>
                {ocupado === "mandar" ? <LoaderCircle size={14} className="spin" /> : <Truck size={14} />} Mandar a {otra}
              </button>
            </div>
          </form>
        </Bloque>
      ) : null}

      {/* ── 4 · Qué hay en el otro galpón ── */}
      <Bloque
        icono={Search}
        tono="neutro"
        titulo={`Qué hay en ${otra}`}
        texto={`Sólo para mirar. Cargar y egresar en ${otra} lo hacen desde ${otra}.`}
        der={(
          <label className="lam-buscar">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material…" className="ui-input" aria-label={`Buscar material en ${otra}`} />
          </label>
        )}
        sinPad
      >
        <div className="lam-tabla" style={{ maxHeight: 380, overflowY: "auto" }}>
          <table className="lam-t">
            <thead><tr><th>Material</th><th className="der">En {otra}</th><th className="der">Acá</th></tr></thead>
            <tbody>
              {filasOtra.map((m) => (
                <tr key={m.id}>
                  <td><div className="nom">{m.nombre}</div><div className="chico">{m.categoria || "Sin categoría"}</div></td>
                  <td className="der"><span className="lam-cant" data-tono={m.alla > 0 ? undefined : "neutro"}>{fmt(m.alla)} <small>{m.unidad}</small></span></td>
                  <td className="der mono" style={{ color: "var(--dim)" }}>{fmt(m.aca)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filasOtra.length ? <p className="lam-ayuda" style={{ padding: 16 }}>Ningún material coincide.</p> : null}
        </div>
      </Bloque>

      {/* ── 5 · Historial ── */}
      {traslados.historial.length ? (
        <Bloque icono={Undo2} tono="neutro" titulo="Traslados cerrados" sinPad>
          <div className="lam-filas" style={{ maxHeight: 300, overflowY: "auto" }}>
            {traslados.historial.map((t) => (
              <div key={t.id} className="lam-fila">
                <div style={{ minWidth: 0 }}>
                  <div className="lam-fila-tit"><span className="mono">{fmt(t.cantidad)} {unidadDe(t)}</span> · {nombreDe(t)}</div>
                  <div className="lam-fila-meta">
                    {t.sede_origen} → {t.sede_destino} · {t.estado === "recibido" ? `recibido ${fechaCorta(t.recibido_at)}` : `cancelado ${fechaCorta(t.cancelado_at)}`}
                    {t.cancelado_motivo ? ` · ${t.cancelado_motivo}` : ""}
                  </div>
                </div>
                <Estado tono={t.estado === "recibido" ? "verde" : "neutro"}>{t.estado === "recibido" ? "Recibido" : "Cancelado"}</Estado>
              </div>
            ))}
          </div>
        </Bloque>
      ) : null}
    </>
  );
}
