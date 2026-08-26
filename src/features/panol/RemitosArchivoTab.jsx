import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, FolderOpen, LoaderCircle, RotateCcw, Search, Ship } from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { fetchRemitosArchivados, reasignarObraDeRemito, urlDeRemito } from "@/features/panol/remitosArchivoApi";
import { fetchObrasEgreso } from "@/features/panol/panolApi";
import { carpetaDeObra, carpetaParaMostrar } from "@/features/panol/carpetaRemitos";

/**
 * El mismo archivo que queda en las carpetas de la PC del pañol, pero desde el
 * sistema. Sirve para la pregunta que aparece siempre: "¿qué vino para el 55-1?",
 * hecha desde cualquier lado y sin estar parado frente a esa PC.
 *
 * Se agrupa por obra, igual que las carpetas, para que las dos cosas se lean
 * igual y nadie tenga que traducir de una a otra.
 */

const SIN_OBRA = "__sin_obra__";

function fmtFecha(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? String(valor).slice(0, 10) : d.toLocaleDateString("es-AR");
}

function money(total, moneda) {
  if (total == null || total === "") return "";
  const n = Number(total);
  if (!Number.isFinite(n)) return "";
  return `${moneda === "USD" ? "US$" : "$"} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RemitosArchivoTab({ isMobile = false, puedeReasignar = false }) {
  const toast = useToast();
  const [remitos, setRemitos] = useState([]);
  const [obras, setObras] = useState([]);
  const [hayObra, setHayObra] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [abriendo, setAbriendo] = useState("");

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
    try {
      const [archivo, listaObras] = await Promise.all([
        fetchRemitosArchivados(),
        fetchObrasEgreso().catch(() => []),
      ]);
      setRemitos(archivo.remitos);
      setHayObra(archivo.hayObra);
      setObras(listaObras ?? []);
      setError("");
    } catch (e) {
      setError(e.message || "No se pudieron traer los remitos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return remitos;
    return remitos.filter((r) => [r.proveedor, r.numero, r.obra?.codigo, r.archivo_nombre, r.sede]
      .some((campo) => String(campo || "").toLowerCase().includes(q)));
  }, [remitos, busqueda]);

  // Agrupados por obra, en el mismo orden que las carpetas de la PC.
  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const remito of filtrados) {
      const clave = remito.obra?.codigo || SIN_OBRA;
      mapa.set(clave, [...(mapa.get(clave) ?? []), remito]);
    }
    return [...mapa.entries()].sort(([a], [b]) => {
      if (a === SIN_OBRA) return 1;
      if (b === SIN_OBRA) return -1;
      return a.localeCompare(b);
    });
  }, [filtrados]);

  async function abrir(remito) {
    setAbriendo(remito.id);
    try {
      const url = await urlDeRemito(remito.archivo_url);
      if (!url) throw new Error("Este remito no tiene archivo guardado.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e.message || "No se pudo abrir el remito.");
    } finally {
      setAbriendo("");
    }
  }

  async function cambiarObra(remito, obraId) {
    try {
      const ok = await reasignarObraDeRemito(remito.id, obraId);
      if (!ok) {
        toast.warning("Falta correr la migración que agrega la obra al comprobante.");
        return;
      }
      toast.success("Obra actualizada.");
      await cargar({ silencioso: true });
    } catch (e) {
      toast.error(e.message || "No se pudo cambiar la obra.");
    }
  }

  const tarjeta = { background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 12 };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.bg, padding: isMobile ? 12 : 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <FileText size={18} color={C.blue} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Remitos</div>
          <div style={{ color: C.dim, fontSize: 12, fontWeight: 700 }}>
            Los mismos que quedan en las carpetas del pañol, buscables desde acá.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border2}`, background: C.panelSolid, borderRadius: 9, padding: "7px 10px", minWidth: isMobile ? "100%" : 240 }}>
          <Search size={14} color={C.dim} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Proveedor, número, obra…"
            style={{ flex: 1, border: "none", background: "transparent", color: C.text, outline: "none", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, minWidth: 0 }}
          />
        </div>
        <button type="button" onClick={() => cargar()} disabled={cargando} style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 11px", cursor: cargando ? "default" : "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 7 }}>
          {cargando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />} Actualizar
        </button>
      </div>

      {!hayObra ? (
        <div style={{ ...tarjeta, borderColor: C.cyanB, background: C.cyanL, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: C.muted, fontWeight: 750 }}>
          Todavía no se corrió la migración que guarda la obra del remito, así que no se pueden agrupar por barco.
          Igual se buscan por proveedor, número o fecha.
        </div>
      ) : null}

      {error ? (
        <div style={{ ...tarjeta, borderColor: C.redB, background: C.redL, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, color: C.red, fontWeight: 800 }}>{error}</div>
      ) : null}

      {cargando ? (
        <div style={{ ...tarjeta, padding: 28, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          <LoaderCircle size={20} className="spin" style={{ marginBottom: 8 }} />
          <div>Buscando remitos…</div>
        </div>
      ) : !filtrados.length ? (
        <div style={{ ...tarjeta, padding: 28, textAlign: "center" }}>
          <FileText size={22} color={C.dim} style={{ marginBottom: 8 }} />
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>
            {busqueda ? "No hay remitos que coincidan" : "Todavía no hay remitos archivados"}
          </div>
          <div style={{ color: C.dim, fontSize: 12, fontWeight: 700, marginTop: 4 }}>
            {busqueda ? "Probá con el proveedor o el número." : "Los que escanees en el pañol van a aparecer acá."}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {grupos.map(([clave, lista]) => {
            const obra = lista.find((r) => r.obra)?.obra || null;
            const carpeta = carpetaDeObra(obra);
            return (
              <div key={clave} style={tarjeta}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                  <Ship size={15} color={clave === SIN_OBRA ? C.dim : C.blue} />
                  <div style={{ fontSize: 13.5, fontWeight: 950, color: C.text }}>
                    {clave === SIN_OBRA ? "Sin obra · stock general" : clave}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: C.dim }}>
                    {lista.length} remito{lista.length === 1 ? "" : "s"}
                  </div>
                  {carpeta ? (
                    <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: C.dim, fontWeight: 750 }}>
                      <FolderOpen size={12} /> {carpetaParaMostrar(carpeta)}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "grid" }}>
                  {lista.map((remito, i) => (
                    <div
                      key={remito.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "1.4fr 0.8fr 0.7fr 0.9fr auto",
                        gap: isMobile ? 5 : 10,
                        alignItems: "center",
                        padding: "10px 13px",
                        borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {remito.proveedor || "Sin proveedor"}
                        </div>
                        <div style={{ color: C.dim, fontSize: 11, fontWeight: 700 }}>
                          {remito.numero ? `Nº ${remito.numero}` : "sin número"}{remito.sede ? ` · ${remito.sede}` : ""}
                        </div>
                      </div>
                      <div style={{ color: C.muted, fontSize: 12, fontWeight: 750 }}>{fmtFecha(remito.fecha || remito.created_at)}</div>
                      <div style={{ color: C.muted, fontSize: 12, fontWeight: 750 }}>{money(remito.total, remito.moneda)}</div>
                      <div>
                        {puedeReasignar && hayObra ? (
                          <select
                            value={remito.obra_id || ""}
                            onChange={(e) => cambiarObra(remito, e.target.value)}
                            style={{ width: "100%", border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 8, padding: "5px 7px", fontFamily: C.sans, fontSize: 11.5, fontWeight: 750, outline: "none" }}
                          >
                            <option value="">Sin obra</option>
                            {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
                          </select>
                        ) : (
                          <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 700 }}>{remito.carpeta_local || ""}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => abrir(remito)}
                        disabled={!remito.archivo_url || abriendo === remito.id}
                        style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: remito.archivo_url ? C.blue : C.dim, borderRadius: 8, padding: "6px 10px", cursor: remito.archivo_url ? "pointer" : "default", fontFamily: C.sans, fontSize: 11.5, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                      >
                        {abriendo === remito.id ? <LoaderCircle size={12} className="spin" /> : <ExternalLink size={12} />} Ver
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
