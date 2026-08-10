import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Camera, Check, Loader2, RefreshCw, ScanText, Sparkles, Trash2, X,
} from "lucide-react";
import { C } from "@/theme";
import { INPUT, LBL, num, tint } from "@/features/produccion/comprasTokens";
import { Cta, Ghost, IconBtn, Pill } from "@/features/produccion/comprasUI";
import {
  borrarFoto, fetchFotos, leerFotoConIA, subirFoto, vincularConCatalogo,
} from "@/features/panol/solicitudesFotosApi";
import {
  actualizarSolicitud, agregarItemLibre, agregarItemsDesdeCatalogo,
} from "@/features/panol/solicitudesPanolApi";

// ─────────────────────────────────────────────────────────────────────────────
// Fotos del papel y revisión del borrador que devuelve la IA.
//
// La regla que ordena toda esta pantalla: la IA propone, la persona dispone.
// Nada de lo leído se guarda solo. Cada campo y cada ítem llegan con su nivel de
// confianza y una casilla para aceptarlo; lo dudoso viene DESMARCADO, así el
// camino fácil es revisar y no confiar a ciegas.
// ─────────────────────────────────────────────────────────────────────────────

const CONF = {
  alta: { label: "Alta", color: "var(--green)", soft: "var(--green-soft)", borde: "var(--green-border)" },
  media: { label: "Media", color: "var(--violet)", soft: "var(--violet-soft)", borde: "var(--violet-border)" },
  baja: { label: "Baja", color: "var(--red)", soft: "var(--red-soft)", borde: "var(--red-border)" },
};
const confMeta = (c) => CONF[c] || CONF.baja;

const CAMPOS = [
  { key: "obra", label: "Obra / barco" },
  { key: "sector", label: "Sector" },
  { key: "prioridad", label: "Prioridad" },
  { key: "fecha_pedido", label: "Fecha del pedido" },
  { key: "fecha_retiro", label: "Fecha a retirar" },
  { key: "solicita", label: "Solicita" },
  { key: "retira", label: "Retira" },
  { key: "tarea", label: "Tarea" },
];

/* ═══ Modal de revisión ═══════════════════════════════════════════════════ */
function RevisionModal({ foto, solicitudId, onAplicado, onClose, toast }) {
  const extraccion = foto?.extraccion || {};
  const [items, setItems] = useState([]);
  const [cabecera, setCabecera] = useState({});
  const [vinculando, setVinculando] = useState(true);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    let alive = true;
    // Los campos de cabecera arrancan tildados sólo si la IA dijo "alta". Todo
    // lo demás entra desmarcado a propósito.
    const inicial = {};
    for (const c of CAMPOS) {
      const leido = extraccion?.cabecera?.[c.key];
      inicial[c.key] = {
        valor: leido?.valor ?? "",
        confianza: leido?.confianza ?? "baja",
        usar: !!leido?.valor && leido?.confianza === "alta",
      };
    }
    setCabecera(inicial);

    vincularConCatalogo(extraccion?.items ?? [])
      .then((res) => {
        if (!alive) return;
        setItems(res.map((i) => ({
          ...i,
          usar: i.confianza === "alta",
          cantidad: i.cantidad ?? 1,
          usarSugerencia: !!i.sugerencia,
        })));
      })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setVinculando(false); });

    return () => { alive = false; };
    // Sólo depende de la foto: el borrador se arma una vez al abrir.
  }, [foto?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const marcados = items.filter((i) => i.usar).length;
  const camposMarcados = CAMPOS.filter((c) => cabecera[c.key]?.usar && cabecera[c.key]?.valor).length;

  async function aplicar() {
    setAplicando(true);
    try {
      // 1. Cabecera: sólo los campos tildados y con valor.
      const patch = {};
      for (const c of CAMPOS) {
        const campo = cabecera[c.key];
        if (!campo?.usar || !campo.valor) continue;
        if (c.key === "obra") patch.obra_texto = campo.valor;
        else patch[c.key] = campo.valor;
      }
      if (Object.keys(patch).length) {
        // Queda marcada como venida de foto: sirve para saber después cuánto se
        // usó este camino y con qué resultado.
        await actualizarSolicitud(solicitudId, { ...patch, origen: "foto_ia" });
      }

      // 2. Ítems: los que quedaron vinculados van como material del catálogo;
      //    el resto entra como texto libre para que no se pierda nada.
      const elegidos = items.filter((i) => i.usar);
      const delCatalogo = elegidos
        .filter((i) => i.usarSugerencia && i.sugerencia)
        .map((i) => ({ ...i.sugerencia, cantidad: num(i.cantidad) || 1, unidad: i.unidad || i.sugerencia.unidad_medida }));
      const libres = elegidos.filter((i) => !i.usarSugerencia || !i.sugerencia);

      if (delCatalogo.length) await agregarItemsDesdeCatalogo(solicitudId, delCatalogo);
      for (const i of libres) {
        await agregarItemLibre(solicitudId, {
          descripcion: i.descripcion,
          cantidad: num(i.cantidad) || 1,
          unidad: i.unidad || null,
          observacion: i.observacion || null,
        });
      }

      toast?.success(`Borrador aplicado: ${camposMarcados} datos y ${elegidos.length} ítems.`);
      onAplicado?.();
      onClose();
    } catch (err) {
      toast?.error(err.message || "No se pudo aplicar el borrador.");
    } finally {
      setAplicando(false);
    }
  }

  const setItem = (idx, patch) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 220, display: "flex", justifyContent: "center", alignItems: "center",
        padding: "4vh 16px", background: "var(--overlay)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)",
      }}
    >
      <div style={{
        width: "min(1080px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden",
        background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 18,
        boxShadow: "0 32px 70px -20px var(--shadow-strong)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", background: C.violetL, border: `1px solid ${C.violetB}`, color: C.violet }}>
            <Sparkles size={15} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 850, color: C.text }}>Borrador leído de la foto</div>
            <div style={{ fontSize: 11.5, color: C.dim }}>
              Revisá y tildá lo que esté bien. Nada se guarda hasta que confirmes.
            </div>
          </div>
          <IconBtn icon={X} title="Cerrar" onClick={onClose} />
        </div>

        {extraccion?.ilegible && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: C.violetL, borderBottom: `1px solid ${C.violetB}`, color: C.violet, fontSize: 12.5, fontWeight: 700 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>La IA avisa: {extraccion.ilegible}</span>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 0, overflow: "hidden" }}>
          {/* la foto, para comparar mientras se corrige */}
          <div style={{ width: "38%", minWidth: 240, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflow: "auto", background: C.panel, padding: 10 }}>
            <a href={foto.url} target="_blank" rel="noreferrer" title="Abrir la foto en grande">
              <img src={foto.url} alt="Foto del papel" style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.border}`, display: "block" }} />
            </a>
          </div>

          {/* el borrador */}
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 14, display: "grid", gap: 14, alignContent: "start" }}>
            <div>
              <div style={{ ...LBL, marginBottom: 7 }}>Datos de la cabecera</div>
              <div style={{ display: "grid", gap: 5 }}>
                {CAMPOS.map((c) => {
                  const campo = cabecera[c.key] || {};
                  if (!campo.valor) return null;
                  const meta = confMeta(campo.confianza);
                  return (
                    <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={!!campo.usar}
                        onChange={(e) => setCabecera((p) => ({ ...p, [c.key]: { ...p[c.key], usar: e.target.checked } }))}
                        style={{ width: 15, height: 15, accentColor: "var(--blue)", flexShrink: 0 }}
                      />
                      <span style={{ ...LBL, width: 100, flexShrink: 0 }}>{c.label}</span>
                      <input
                        value={campo.valor}
                        onChange={(e) => setCabecera((p) => ({ ...p, [c.key]: { ...p[c.key], valor: e.target.value } }))}
                        style={{ ...INPUT, flex: 1, minWidth: 0, padding: "5px 8px", fontSize: 12.5 }}
                      />
                      <Pill color={meta.color} soft={meta.soft} borde={meta.borde}>{meta.label}</Pill>
                    </label>
                  );
                })}
                {!CAMPOS.some((c) => cabecera[c.key]?.valor) && (
                  <div style={{ fontSize: 12.5, color: C.dim }}>La IA no pudo leer ningún dato de la cabecera.</div>
                )}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={LBL}>Ítems leídos</span>
                {!vinculando && <Pill color={C.blue} soft={C.blueL} borde={C.blueB} mono>{marcados}/{items.length}</Pill>}
                {!vinculando && items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setItems((p) => p.map((i) => ({ ...i, usar: marcados !== items.length })))}
                    style={{ marginLeft: "auto", border: "none", background: "transparent", color: C.blue, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: C.sans }}
                  >
                    {marcados === items.length ? "Desmarcar todos" : "Marcar todos"}
                  </button>
                )}
              </div>

              {vinculando && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 13, padding: 8 }}>
                  <Loader2 size={15} className="spin" /> Buscando cada ítem en el catálogo…
                </div>
              )}

              {!vinculando && !items.length && (
                <div style={{ fontSize: 12.5, color: C.dim }}>La IA no leyó ningún ítem en esta foto.</div>
              )}

              <div style={{ display: "grid", gap: 5 }}>
                {!vinculando && items.map((it, idx) => {
                  const meta = confMeta(it.confianza);
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "grid", gridTemplateColumns: "auto minmax(0,1fr) 66px 54px auto", gap: 8, alignItems: "center",
                        padding: "8px 9px", borderRadius: 10,
                        border: `1px solid ${it.usar ? tint("#3b82f6", 32) : C.border}`,
                        background: it.usar ? C.blueL : C.panel,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!it.usar}
                        onChange={(e) => setItem(idx, { usar: e.target.checked })}
                        style={{ width: 15, height: 15, accentColor: "var(--blue)", flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <input
                          value={it.descripcion}
                          onChange={(e) => setItem(idx, { descripcion: e.target.value })}
                          style={{ ...INPUT, padding: "4px 7px", fontSize: 12.5, fontWeight: 700 }}
                        />
                        {/* La vinculación con el catálogo es una sugerencia, no un
                            hecho: se puede desactivar y que entre como texto libre. */}
                        {it.sugerencia ? (
                          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={!!it.usarSugerencia}
                              onChange={(e) => setItem(idx, { usarSugerencia: e.target.checked })}
                              style={{ width: 12, height: 12, accentColor: "var(--violet)", flexShrink: 0 }}
                            />
                            <span style={{ fontSize: 10.5, color: it.usarSugerencia ? C.violet : C.dim, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              → {it.sugerencia.descripcion}
                            </span>
                            <Pill color={C.violet} soft={C.violetL} borde={C.violetB} mono>{Math.round(it.certeza * 100)}%</Pill>
                          </label>
                        ) : (
                          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 3 }}>sin match en el catálogo · entra como texto libre</div>
                        )}
                      </div>
                      <input
                        value={it.cantidad ?? ""}
                        inputMode="decimal"
                        onChange={(e) => setItem(idx, { cantidad: e.target.value })}
                        style={{ ...INPUT, padding: "4px 7px", fontSize: 12, fontFamily: C.mono, textAlign: "right" }}
                      />
                      <input
                        value={it.unidad ?? ""}
                        placeholder="u"
                        onChange={(e) => setItem(idx, { unidad: e.target.value })}
                        style={{ ...INPUT, padding: "4px 7px", fontSize: 12 }}
                      />
                      <Pill color={meta.color} soft={meta.soft} borde={meta.borde}>{meta.label}</Pill>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", borderTop: `1px solid ${C.border}`, background: C.panel }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.dim }}>
            Se van a aplicar <b style={{ color: C.text }}>{camposMarcados}</b> datos y <b style={{ color: C.text }}>{marcados}</b> ítems.
          </span>
          <Ghost onClick={onClose}>Cancelar</Ghost>
          <Cta
            icon={aplicando ? Loader2 : Check}
            onClick={aplicar}
            disabled={aplicando || (!camposMarcados && !marcados)}
          >
            Aplicar al pedido
          </Cta>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ═══ Bloque de fotos ═════════════════════════════════════════════════════ */
export default function FotosSolicitud({ solicitudId, obras = [], puedeEditar = true, onAplicado, toast }) {
  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [leyendo, setLeyendo] = useState(null);
  const [revisar, setRevisar] = useState(null);
  const fileRef = useRef(null);

  const codigosObra = useMemo(
    () => obras.map((o) => o.codigo || o.descripcion).filter(Boolean),
    [obras]
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setFotos(await fetchFotos(solicitudId)); }
    catch { setFotos([]); }
    finally { setCargando(false); }
  }, [solicitudId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function subir(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setSubiendo(true);
    try {
      for (const [i, f] of files.entries()) await subirFoto(solicitudId, f, { orden: fotos.length + i });
      toast?.success(files.length === 1 ? "Foto subida." : `${files.length} fotos subidas.`);
      await cargar();
    } catch (err) { toast?.error(err.message || "No se pudo subir la foto."); }
    finally { setSubiendo(false); }
  }

  async function leer(foto) {
    setLeyendo(foto.id);
    try {
      await leerFotoConIA(foto, { obras: codigosObra });
      const frescas = await fetchFotos(solicitudId);
      setFotos(frescas);
      const actualizada = frescas.find((f) => f.id === foto.id);
      if (actualizada?.extraccion) setRevisar(actualizada);
    } catch (err) {
      toast?.error(err.message || "No se pudo leer la foto.");
      await cargar();
    } finally { setLeyendo(null); }
  }

  async function quitar(foto) {
    if (!window.confirm("¿Borrar esta foto del pedido?")) return;
    try { await borrarFoto(foto); await cargar(); }
    catch (err) { toast?.error(err.message); }
  }

  return (
    <div className="sp-surface" style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: fotos.length || cargando ? 10 : 0, flexWrap: "wrap" }}>
        <span style={LBL}>Fotos del papel</span>
        {fotos.length > 0 && <Pill color={C.blue} soft={C.blueL} borde={C.blueB} mono>{fotos.length}</Pill>}
        <span style={{ fontSize: 11, color: C.dim }}>se guardan aunque la IA no pueda leerlas</span>
        {puedeEditar && (
          <div style={{ marginLeft: "auto" }}>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={subir} style={{ display: "none" }} />
            <Ghost icon={subiendo ? Loader2 : Camera} size="sm" onClick={() => fileRef.current?.click()} disabled={subiendo}>
              {subiendo ? "Subiendo…" : "Subir foto"}
            </Ghost>
          </div>
        )}
      </div>

      {cargando && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.dim, fontSize: 12.5 }}>
          <Loader2 size={14} className="spin" /> Cargando fotos…
        </div>
      )}

      {!cargando && fotos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 9 }}>
          {fotos.map((f) => {
            const ok = f.estado_lectura === "ok";
            const error = f.estado_lectura === "error";
            return (
              <div key={f.id} style={{ border: `1px solid ${ok ? C.greenB : error ? C.redB : C.border}`, borderRadius: 11, overflow: "hidden", background: C.panel }}>
                <a href={f.url} target="_blank" rel="noreferrer">
                  <img src={f.url} alt={f.nombre || "Foto"} style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />
                </a>
                <div style={{ padding: "7px 8px", display: "grid", gap: 6 }}>
                  {error && (
                    <div style={{ fontSize: 10.5, color: C.red, lineHeight: 1.35 }} title={f.error_lectura}>
                      No se pudo leer. Cargalo a mano o reintentá.
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {puedeEditar && (
                      ok ? (
                        <Ghost icon={Sparkles} size="sm" onClick={() => setRevisar(f)}>Ver borrador</Ghost>
                      ) : (
                        <Ghost
                          icon={leyendo === f.id ? Loader2 : error ? RefreshCw : ScanText}
                          size="sm"
                          onClick={() => leer(f)}
                          disabled={leyendo === f.id}
                        >
                          {leyendo === f.id ? "Leyendo…" : error ? "Reintentar" : "Leer con IA"}
                        </Ghost>
                      )
                    )}
                    {puedeEditar && <IconBtn icon={Trash2} title="Borrar foto" tono="rojo" size={24} onClick={() => quitar(f)} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {revisar && (
        <RevisionModal
          foto={revisar}
          solicitudId={solicitudId}
          toast={toast}
          onAplicado={onAplicado}
          onClose={() => setRevisar(null)}
        />
      )}
    </div>
  );
}
