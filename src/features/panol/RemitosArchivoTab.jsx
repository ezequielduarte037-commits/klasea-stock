import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ExternalLink, FileText, FolderOpen, Layers, LoaderCircle, Package, RotateCcw, Search, Ship } from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { fetchRemitosArchivados, reasignarObraDeRemito, urlDeRemito } from "@/features/panol/remitosArchivoApi";
import { fetchObrasEgreso } from "@/features/panol/panolApi";
import { carpetaDeObra, carpetaParaMostrar } from "@/features/panol/carpetaRemitos";

/**
 * Los remitos del pañol, ordenados como estan en la PC: linea de produccion,
 * despues barco, despues los remitos. Se navega igual que las carpetas a
 * proposito, para que quien busca un papel y quien busca en el sistema piensen
 * de la misma forma y nadie tenga que traducir de una cosa a la otra.
 *
 * La busqueda corta los tres niveles: escribiendo "iriarte" aparecen todos sus
 * remitos, esten en el barco que esten.
 */

const SIN_LINEA = "__sin_linea__";
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
  // Donde esta parado: null = viendo las lineas; con linea = viendo sus barcos;
  // con obra = viendo los remitos de ese barco.
  const [lineaAbierta, setLineaAbierta] = useState(null);
  const [obraAbierta, setObraAbierta] = useState(null);

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

  const buscando = busqueda.trim().length > 0;

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return remitos;
    return remitos.filter((r) => [r.proveedor, r.numero, r.obra?.codigo, r.obra?.linea_nombre, r.archivo_nombre, r.sede]
      .some((campo) => String(campo || "").toLowerCase().includes(q)));
  }, [remitos, busqueda]);

  /** linea -> obra -> remitos, con los contadores de cada nivel. */
  const arbol = useMemo(() => {
    const porLinea = new Map();
    for (const remito of filtrados) {
      const linea = remito.obra?.linea_nombre || (remito.obra ? SIN_LINEA : SIN_OBRA);
      const obra = remito.obra?.codigo || SIN_OBRA;
      if (!porLinea.has(linea)) porLinea.set(linea, new Map());
      const obrasDeLinea = porLinea.get(linea);
      obrasDeLinea.set(obra, [...(obrasDeLinea.get(obra) ?? []), remito]);
    }
    return [...porLinea.entries()]
      .map(([linea, obrasDeLinea]) => ({
        linea,
        obras: [...obrasDeLinea.entries()]
          .map(([codigo, lista]) => ({ codigo, remitos: lista, obra: lista.find((r) => r.obra)?.obra || null }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
        total: [...obrasDeLinea.values()].reduce((n, l) => n + l.length, 0),
      }))
      .sort((a, b) => {
        if (a.linea === SIN_OBRA) return 1;
        if (b.linea === SIN_OBRA) return -1;
        return a.linea.localeCompare(b.linea);
      });
  }, [filtrados]);

  const lineaActual = useMemo(
    () => arbol.find((l) => l.linea === lineaAbierta) || null,
    [arbol, lineaAbierta],
  );
  const obraActual = useMemo(
    () => lineaActual?.obras.find((o) => o.codigo === obraAbierta) || null,
    [lineaActual, obraAbierta],
  );

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
  const nombreLinea = (l) => (l === SIN_OBRA ? "Sin obra · stock general" : l === SIN_LINEA ? "Sin línea" : l);

  // Los remitos que se muestran: los del barco abierto, o todos si se esta
  // buscando (una busqueda que respetara la navegacion no serviria de nada).
  const listaVisible = buscando ? filtrados : obraActual?.remitos ?? [];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.bg, padding: isMobile ? 12 : 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <FileText size={18} color={C.blue} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Remitos</div>
          <div style={{ color: C.dim, fontSize: 12, fontWeight: 700 }}>
            Ordenados como en la PC del pañol: línea, barco, remito.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border2}`, background: C.panelSolid, borderRadius: 9, padding: "7px 10px", minWidth: isMobile ? "100%" : 250 }}>
          <Search size={14} color={C.dim} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Proveedor, número, barco…"
            style={{ flex: 1, border: "none", background: "transparent", color: C.text, outline: "none", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, minWidth: 0 }}
          />
        </div>
        <button type="button" onClick={() => cargar()} disabled={cargando} style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 11px", cursor: cargando ? "default" : "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 7 }}>
          {cargando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />} Actualizar
        </button>
      </div>

      {/* Migas: sin esto, dos niveles adentro no se sabe donde uno esta parado. */}
      {!buscando && (lineaAbierta || obraAbierta) ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap", fontSize: 12.5, fontWeight: 850 }}>
          <button type="button" onClick={() => { setLineaAbierta(null); setObraAbierta(null); }} style={{ border: "none", background: "transparent", color: C.blue, cursor: "pointer", padding: 0, fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}>
            Todas las líneas
          </button>
          {lineaAbierta ? (
            <>
              <ChevronRight size={13} color={C.dim} />
              <button type="button" onClick={() => setObraAbierta(null)} style={{ border: "none", background: "transparent", color: obraAbierta ? C.blue : C.text, cursor: obraAbierta ? "pointer" : "default", padding: 0, fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}>
                {nombreLinea(lineaAbierta)}
              </button>
            </>
          ) : null}
          {obraAbierta ? (
            <>
              <ChevronRight size={13} color={C.dim} />
              <span style={{ color: C.text }}>{obraAbierta === SIN_OBRA ? "Stock general" : obraAbierta}</span>
            </>
          ) : null}
        </div>
      ) : null}

      {!hayObra ? (
        <div style={{ ...tarjeta, borderColor: C.cyanB, background: C.cyanL, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: C.muted, fontWeight: 750 }}>
          Todavía no se corrió la migración que guarda la obra del remito, así que no se pueden separar por barco.
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
            {buscando ? "No hay remitos que coincidan" : "Todavía no hay remitos"}
          </div>
          <div style={{ color: C.dim, fontSize: 12, fontWeight: 700, marginTop: 4 }}>
            {buscando ? "Probá con el proveedor o el número." : "Los que escanees en el pañol van a aparecer acá, separados por barco."}
          </div>
        </div>
      ) : !buscando && !lineaAbierta ? (
        /* Nivel 1: las lineas de produccion */
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {arbol.map((nodo) => (
            <button
              key={nodo.linea}
              type="button"
              onClick={() => setLineaAbierta(nodo.linea)}
              style={{ ...tarjeta, padding: 14, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 11, fontFamily: C.sans }}
            >
              <Layers size={19} color={nodo.linea === SIN_OBRA ? C.dim : C.blue} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>{nombreLinea(nodo.linea)}</div>
                <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>
                  {nodo.obras.length} barco{nodo.obras.length === 1 ? "" : "s"} · {nodo.total} remito{nodo.total === 1 ? "" : "s"}
                </div>
              </div>
              <ChevronRight size={16} color={C.dim} />
            </button>
          ))}
        </div>
      ) : !buscando && !obraAbierta ? (
        /* Nivel 2: los barcos de esa linea */
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {(lineaActual?.obras ?? []).map((nodo) => (
            <button
              key={nodo.codigo}
              type="button"
              onClick={() => setObraAbierta(nodo.codigo)}
              style={{ ...tarjeta, padding: 14, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 11, fontFamily: C.sans }}
            >
              {nodo.codigo === SIN_OBRA ? <Package size={19} color={C.dim} /> : <Ship size={19} color={C.blue} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>
                  {nodo.codigo === SIN_OBRA ? "Stock general" : nodo.codigo}
                </div>
                <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>
                  {nodo.remitos.length} remito{nodo.remitos.length === 1 ? "" : "s"}
                </div>
              </div>
              <ChevronRight size={16} color={C.dim} />
            </button>
          ))}
        </div>
      ) : (
        /* Nivel 3: los remitos */
        <div style={tarjeta}>
          {!buscando && obraActual?.obra ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 13px", borderBottom: `1px solid ${C.border}`, fontSize: 11.5, color: C.dim, fontWeight: 750 }}>
              <FolderOpen size={13} /> En la PC del pañol: {carpetaParaMostrar(carpetaDeObra(obraActual.obra))}
            </div>
          ) : null}
          <div style={{ display: "grid" }}>
            {listaVisible.map((remito, i) => (
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
                    {remito.numero ? `Nº ${remito.numero}` : "sin número"}
                    {buscando && remito.obra?.codigo ? ` · ${remito.obra.codigo}` : ""}
                    {remito.sede ? ` · ${remito.sede}` : ""}
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
      )}
    </div>
  );
}
