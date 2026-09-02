import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, LoaderCircle, PackageOpen, RotateCcw, Search, Truck, Undo2, X } from "lucide-react";
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

const S = {
  card: { border: "1px solid var(--panel-2)", borderRadius: 12, background: "var(--panel)", padding: 16, marginBottom: 12 },
  h3: { margin: 0, color: "var(--text)", fontSize: 15, fontWeight: 700 },
  small: { color: "var(--dim)", fontSize: 12.5 },
  label: { display: "block", color: "var(--dim)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid var(--panel-2)", background: "var(--panel-2)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13.5, outline: "none" },
  btn: { border: "1px solid var(--panel-2)", background: "var(--panel-2)", color: "var(--text)", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 },
  fila: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--panel-2)" },
  vacio: { color: "var(--dim)", fontSize: 12.5, padding: "14px 0" },
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
    <div>
      {err ? (
        <div style={{ ...S.card, borderColor: "var(--red-border)", background: "var(--red-soft)", color: "var(--red)", fontWeight: 700, fontSize: 13 }}>{err}</div>
      ) : null}
      {ok ? (
        <div style={{ ...S.card, borderColor: "var(--green-border)", background: "var(--green-soft)", color: "var(--green)", fontWeight: 700, fontSize: 13 }}>{ok}</div>
      ) : null}

      {/* ── 1 · Lo que me está llegando ────────────────────────────────────── */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 2 }}>
          <PackageOpen size={16} color="var(--green)" />
          <h3 style={S.h3}>Me está llegando de {otra}</h3>
          {traslados.entrando.length ? (
            <span style={{ fontFamily: "var(--mono, monospace)", fontWeight: 900, color: "var(--green)", fontSize: 13 }}>{traslados.entrando.length}</span>
          ) : null}
          <button type="button" style={{ ...S.btn, marginLeft: "auto", padding: "6px 10px" }} onClick={() => void cargar()} disabled={cargando}>
            {cargando ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />}
          </button>
        </div>
        <div style={S.small}>Hasta que no confirmes que llegó, este material no suma a tu stock.</div>
        {!traslados.entrando.length ? (
          <div style={S.vacio}>{cargando ? "Cargando…" : "No hay nada en camino."}</div>
        ) : traslados.entrando.map((t) => (
          <div key={t.id} style={S.fila}>
            <Truck size={15} color="var(--dim)" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: "var(--text)", fontSize: 13.5, fontWeight: 700 }}>
                {fmt(t.cantidad)} {unidadDe(t)} · {nombreDe(t)}
              </div>
              <div style={S.small}>
                Salió de {t.sede_origen} el {fechaCorta(t.created_at)}
                {t.observaciones ? ` · ${t.observaciones}` : ""}
              </div>
            </div>
            <button type="button" disabled={ocupado === t.id}
              onClick={() => void accion(t.id, () => confirmarTraslado(t), `Confirmado: ${nombreDe(t)} ya está en tu stock.`)}
              style={{ ...S.btn, borderColor: "var(--green-border)", background: "var(--green-soft)", color: "var(--green)", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {ocupado === t.id ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />} Llegó
            </button>
          </div>
        ))}
      </div>

      {/* ── 2 · Lo que mandé ───────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 2 }}>
          <Truck size={16} color="var(--dim)" />
          <h3 style={S.h3}>Mandé a {otra} y no confirmaron</h3>
        </div>
        <div style={S.small}>Ya salió de tu stock. Si nunca salió o volvió, cancelalo y vuelve a entrar.</div>
        {!traslados.saliendo.length ? (
          <div style={S.vacio}>Nada pendiente de confirmar.</div>
        ) : traslados.saliendo.map((t) => (
          <div key={t.id} style={S.fila}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: "var(--text)", fontSize: 13.5, fontWeight: 700 }}>
                {fmt(t.cantidad)} {unidadDe(t)} · {nombreDe(t)}
              </div>
              <div style={S.small}>Salió el {fechaCorta(t.created_at)}{t.observaciones ? ` · ${t.observaciones}` : ""}</div>
            </div>
            <button type="button" disabled={ocupado === t.id}
              onClick={() => void accion(t.id, () => cancelarTraslado(t, "Cancelado desde el galpón de origen"), "Cancelado. El material volvió a tu stock.")}
              style={{ ...S.btn, display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {ocupado === t.id ? <LoaderCircle size={13} className="spin" /> : <Undo2 size={13} />} Cancelar
            </button>
          </div>
        ))}
      </div>

      {/* ── 3 · Mandar ─────────────────────────────────────────────────────── */}
      {puedeCargar ? (
        <form onSubmit={mandar} style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <ArrowRight size={16} color="var(--blue)" />
            <h3 style={S.h3}>Mandar material a {otra}</h3>
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)" }}>
            <div>
              <label style={S.label} htmlFor="traslado-material">Material</label>
              <select id="traslado-material" style={S.input} value={form.material_id}
                onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value }))}>
                <option value="">— Elegir —</option>
                {(materiales ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre} · acá {fmt(stockPorMaterial?.[m.id])} {m.unidad}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label} htmlFor="traslado-cantidad">Cantidad</label>
              <input id="traslado-cantidad" type="number" step="0.01" min="0" style={S.input} value={form.cantidad}
                onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={S.label} htmlFor="traslado-obs">Observaciones</label>
            <input id="traslado-obs" style={S.input} value={form.observaciones} placeholder="Quién lo lleva, para qué obra…"
              onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
          </div>
          {materialElegido ? (
            <div style={{ marginTop: 9, fontSize: 12.5, fontWeight: 700, color: seLlevaDeMas ? "var(--red)" : "var(--dim)" }}>
              {seLlevaDeMas
                ? `Acá hay ${fmt(stockPropio)} ${materialElegido.unidad}: estás mandando más de lo que tenés.`
                : `Te quedan ${fmt(stockPropio - num(form.cantidad))} ${materialElegido.unidad} después de mandarlo.`}
            </div>
          ) : null}
          <button type="submit" disabled={ocupado === "mandar"}
            style={{ ...S.btn, marginTop: 12, width: "100%", borderColor: "var(--blue-border)", background: "var(--blue-soft)", color: "var(--blue)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 14px" }}>
            {ocupado === "mandar" ? <LoaderCircle size={14} className="spin" /> : <Truck size={14} />}
            Mandar a {otra}
          </button>
        </form>
      ) : null}

      {/* ── 4 · Qué hay en el otro galpón ──────────────────────────────────── */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 2, flexWrap: "wrap" }}>
          <h3 style={S.h3}>Qué hay en {otra}</h3>
          <div style={{ position: "relative", marginLeft: "auto", minWidth: 180 }}>
            <Search size={13} color="var(--dim)" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material…"
              style={{ ...S.input, paddingLeft: 27, fontSize: 12.5 }} />
          </div>
        </div>
        <div style={S.small}>Solo para mirar. Cargar y egresar en {otra} lo hacen desde {otra}.</div>
        <div style={{ marginTop: 8, maxHeight: 340, overflowY: "auto" }}>
          {filasOtra.map((m) => (
            <div key={m.id} style={S.fila}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nombre}</div>
                <div style={S.small}>{m.categoria || "Sin categoría"}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--mono, monospace)", fontWeight: 900, fontSize: 14, color: m.alla > 0 ? "var(--text)" : "var(--dim)" }}>
                  {fmt(m.alla)} <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--dim)" }}>{m.unidad}</span>
                </div>
                <div style={{ ...S.small, fontSize: 11 }}>acá {fmt(m.aca)}</div>
              </div>
            </div>
          ))}
          {!filasOtra.length ? <div style={S.vacio}>Ningún material coincide.</div> : null}
        </div>
      </div>

      {/* ── 5 · Historial ──────────────────────────────────────────────────── */}
      {traslados.historial.length ? (
        <div style={S.card}>
          <h3 style={S.h3}>Traslados cerrados</h3>
          <div style={{ marginTop: 6, maxHeight: 260, overflowY: "auto" }}>
            {traslados.historial.map((t) => (
              <div key={t.id} style={S.fila}>
                {t.estado === "recibido"
                  ? <Check size={14} color="var(--green)" style={{ flexShrink: 0 }} />
                  : <X size={14} color="var(--dim)" style={{ flexShrink: 0 }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 700 }}>
                    {fmt(t.cantidad)} {unidadDe(t)} · {nombreDe(t)}
                  </div>
                  <div style={S.small}>
                    {t.sede_origen} → {t.sede_destino} · {t.estado === "recibido" ? `recibido ${fechaCorta(t.recibido_at)}` : `cancelado ${fechaCorta(t.cancelado_at)}`}
                    {t.cancelado_motivo ? ` · ${t.cancelado_motivo}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
