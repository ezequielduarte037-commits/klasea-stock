import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  Layers,
  LoaderCircle,
  Package,
  Pencil,
  RotateCcw,
  Search,
  Ship,
  Trash2,
  X,
} from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { fetchRemitosArchivados, reasignarObrasDeRemito, urlDeRemito } from "@/features/panol/remitosArchivoApi";
import { actualizarDatosDeRemito, borrarRemitoEscaneado, leerRemitoConIA } from "@/features/panol/remitosScannerApi";
import { fetchObrasEgreso } from "@/features/panol/panolApi";
import { carpetaDeObra, carpetaParaMostrar } from "@/features/panol/carpetaRemitos";
import SelectorObrasRemito from "@/features/panol/SelectorObrasRemito";

/**
 * Los remitos del pañol, ordenados como estan en la PC: linea de produccion,
 * despues barco, despues los remitos. Se navega igual que las carpetas a
 * proposito, para que quien busca un papel y quien busca en el sistema piensen
 * de la misma forma y nadie tenga que traducir de una cosa a la otra.
 *
 * La busqueda corta los tres niveles: escribiendo "iriarte" aparecen todos sus
 * remitos, esten en el barco que esten.
 *
 * Un remito puede estar guardado SIN haber sido leido por la IA -es lo que pasa
 * cuando se archiva un papel para tenerlo, o cuando la lectura fallo-. Eso no es
 * un error: el documento igual esta, se abre y se busca. Desde acá se puede
 * mandar a leer cuando haga falta.
 */

const SIN_LINEA = "__sin_linea__";
const SIN_OBRA = "__sin_obra__";

const FILTROS = [
  ["todos", "Todos"],
  ["sin_leer", "Falta leer"],
  ["leidos", "Con renglones"],
];

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

/** Nombre legible de una carpeta escrita a mano ("K55/55-1" -> "K55 · 55-1"). */
function nombreCarpeta(valor) {
  return String(valor || "").split(/[\\/]+/).filter(Boolean).join(" · ");
}

function Chip({ children, color = C.dim, soft = C.panel2, border = C.border, title = "" }) {
  return (
    <span
      title={title}
      style={{
        flexShrink: 0,
        fontSize: 9.5,
        fontWeight: 900,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        color,
        background: soft,
        border: `1px solid ${border}`,
        borderRadius: 5,
        padding: "1px 5px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function MiniBoton({ children, onClick, disabled = false, title = "", color = C.blue }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        border: `1px solid ${C.border2}`,
        background: C.panelSolid,
        color: disabled ? C.dim : color,
        borderRadius: 8,
        padding: "6px 9px",
        cursor: disabled ? "default" : "pointer",
        fontFamily: C.sans,
        fontSize: 11.5,
        fontWeight: 850,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Editor chico de lo que se escribe a mano sobre un remito.
 *
 * Hace falta porque un remito archivado sin leer -o leído a medias- se queda con
 * "Sin proveedor · sin número" para siempre, y así no lo encuentra nadie. El
 * papel está guardado; que además se pueda nombrar es lo que lo vuelve útil.
 */
function EditorRemito({ remito, onCerrar, onGuardado }) {
  const toast = useToast();
  const [proveedor, setProveedor] = useState(remito.proveedor || "");
  const [numero, setNumero] = useState(remito.numero || "");
  const [titulo, setTitulo] = useState(remito.titulo || "");
  const [notas, setNotas] = useState(remito.notas || "");
  const [guardando, setGuardando] = useState(false);

  const campo = {
    width: "100%", border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text,
    borderRadius: 9, padding: "9px 11px", fontFamily: C.sans, fontSize: 13, fontWeight: 700, outline: "none",
    boxSizing: "border-box",
  };
  const etiqueta = { fontSize: 11, fontWeight: 900, color: C.dim, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 5 };

  async function guardar() {
    setGuardando(true);
    try {
      const ok = await actualizarDatosDeRemito(remito.id, { proveedor, numero, titulo, notas });
      if (!ok) {
        toast.warning("No se pudo guardar: revisá los permisos del usuario.");
        return;
      }
      toast.success("Remito actualizado.");
      onGuardado?.();
      onCerrar?.();
    } catch (e) {
      toast.error(e.message || "No se pudo guardar el remito.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 16, fontFamily: C.sans }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 100%)", background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 18px 50px rgba(15,23,42,0.28)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: `1px solid ${C.border}` }}>
          <Pencil size={16} color={C.blue} />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 950, color: C.text }}>Datos del remito</div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 15, display: "grid", gap: 12 }}>
          <div>
            <div style={etiqueta}>Proveedor</div>
            <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ej.: Casa Iriarte" style={campo} />
          </div>
          <div>
            <div style={etiqueta}>Número</div>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej.: 0001-00012345" style={campo} />
          </div>
          <div>
            <div style={etiqueta}>Referencia</div>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Grifería del baño de proa" style={campo} />
          </div>
          <div>
            <div style={etiqueta}>Nota</div>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} style={{ ...campo, resize: "vertical", minHeight: 54, fontWeight: 600 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 15px", borderTop: `1px solid ${C.border}`, background: C.panel2 }}>
          <button type="button" onClick={onCerrar} style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "9px 13px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "9px 15px", cursor: guardando ? "default" : "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {guardando ? <LoaderCircle size={14} className="spin" /> : null} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function EditorObrasRemito({ remito, obras, onCerrar, onGuardado }) {
  const toast = useToast();
  const [obraIds, setObraIds] = useState(() => (
    remito.obra_ids?.length ? remito.obra_ids.map(String) : (remito.obras || []).map((obra) => String(obra.id))
  ));
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      const ok = await reasignarObrasDeRemito(remito.id, obraIds);
      if (!ok) {
        toast.warning("Falta aplicar la migración multiobra de remitos.");
        return;
      }
      toast.success(obraIds.length > 1 ? `Remito asociado a ${obraIds.length} obras.` : "Obras del remito actualizadas.");
      await onGuardado?.();
      onCerrar?.();
    } catch (error) {
      toast.error(error.message || "No se pudieron actualizar las obras.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 16, fontFamily: C.sans }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(460px, 100%)", background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 18px 50px rgba(15,23,42,0.28)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: `1px solid ${C.border}` }}>
          <Layers size={16} color={C.blue} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 950, color: C.text }}>Obras de este remito</div>
            <div style={{ color: C.dim, fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {remito.titulo || remito.proveedor || remito.archivo_nombre || "Remito sin nombre"}
            </div>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 15, display: "grid", gap: 12 }}>
          <div style={{ color: C.muted, fontSize: 11.5, fontWeight: 700, lineHeight: 1.5 }}>
            El mismo PDF aparecerá dentro de cada obra seleccionada. Esto no reparte cantidades ni modifica stock.
          </div>
          <SelectorObrasRemito obras={obras} value={obraIds} onChange={setObraIds} disabled={guardando} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 15px", borderTop: `1px solid ${C.border}`, background: C.panel2 }}>
          <button type="button" onClick={onCerrar} style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "9px 13px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "9px 15px", cursor: guardando ? "default" : "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {guardando ? <LoaderCircle size={14} className="spin" /> : <Layers size={14} />} Guardar obras
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RemitosArchivoTab({ isMobile = false, puedeReasignar = false }) {
  const toast = useToast();
  const [remitos, setRemitos] = useState([]);
  const [obras, setObras] = useState([]);
  const [hayObra, setHayObra] = useState(true);
  const [hayMultiobra, setHayMultiobra] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [ocupado, setOcupado] = useState("");
  const [editando, setEditando] = useState(null);
  const [editandoObras, setEditandoObras] = useState(null);
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
      setHayMultiobra(archivo.hayMultiobra);
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
    return remitos.filter((r) => {
      if (filtro === "sin_leer" && !r.sinLeer) return false;
      if (filtro === "leidos" && r.sinLeer) return false;
      if (!q) return true;
      const destinos = (r.obras || []).flatMap((obra) => [obra.codigo, obra.linea_nombre]);
      return [r.proveedor, r.numero, r.titulo, r.notas, ...destinos, r.carpeta_local, r.archivo_nombre, r.sede]
        .some((campo) => String(campo || "").toLowerCase().includes(q));
    });
  }, [remitos, busqueda, filtro]);

  const totalSinLeer = useMemo(() => remitos.filter((r) => r.sinLeer).length, [remitos]);

  /** linea -> obra -> remitos, con los contadores de cada nivel. */
  const arbol = useMemo(() => {
    const porLinea = new Map();
    for (const remito of filtrados) {
      const asociadas = remito.obras?.length ? remito.obras : remito.obra ? [remito.obra] : [];
      if (asociadas.length) {
        for (const asociada of asociadas) {
          const linea = asociada.linea_nombre || SIN_LINEA;
          const obra = asociada.codigo || SIN_OBRA;
          if (!porLinea.has(linea)) porLinea.set(linea, new Map());
          const obrasDeLinea = porLinea.get(linea);
          obrasDeLinea.set(obra, [...(obrasDeLinea.get(obra) ?? []), remito]);
        }
        continue;
      }
      // Sin barco pero con carpeta propia -"Consumibles Rebollar"- esa carpeta
      // es el nodo: mandarla a "sin obra" seria perderla entre todas las demas.
      const propia = !remito.obra ? nombreCarpeta(remito.carpeta_local) : "";
      const linea = remito.obra?.linea_nombre || (remito.obra ? SIN_LINEA : propia || SIN_OBRA);
      const obra = remito.obra?.codigo || propia || SIN_OBRA;
      if (!porLinea.has(linea)) porLinea.set(linea, new Map());
      const obrasDeLinea = porLinea.get(linea);
      obrasDeLinea.set(obra, [...(obrasDeLinea.get(obra) ?? []), remito]);
    }
    return [...porLinea.entries()]
      .map(([linea, obrasDeLinea]) => ({
        linea,
        obras: [...obrasDeLinea.entries()]
          .map(([codigo, lista]) => ({
            codigo,
            remitos: lista,
            obra: lista.flatMap((r) => r.obras || []).find((obra) => obra.codigo === codigo)
              || lista.find((r) => r.obra?.codigo === codigo)?.obra
              || null,
          }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
        total: [...obrasDeLinea.values()].reduce((n, l) => n + l.length, 0),
      }))
      .map((nodo) => ({
        ...nodo,
        // Cuando el unico hijo se llama igual que el padre no es una linea con
        // barcos, es una carpeta suelta: se entra derecho a los remitos.
        directa: nodo.obras.length === 1 && nodo.obras[0].codigo === nodo.linea,
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
    setOcupado(`abrir-${remito.id}`);
    try {
      const url = await urlDeRemito(remito.archivo_url);
      if (!url) throw new Error("Este remito no tiene archivo guardado.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e.message || "No se pudo abrir el remito.");
    } finally {
      setOcupado("");
    }
  }

  /** Manda a leer un remito que se guardó sin renglones. */
  async function leer(remito) {
    setOcupado(`leer-${remito.id}`);
    try {
      const lectura = await leerRemitoConIA(remito.id);
      if (!lectura.ok) {
        toast.warning(lectura.mensaje);
        return;
      }
      toast.success(`Leído: ${lectura.vinculados}/${lectura.total} renglones vinculados. Ingresalo desde Escanear.`);
      await cargar({ silencioso: true });
    } catch (e) {
      toast.error(e.message || "No se pudo leer el remito.");
    } finally {
      setOcupado("");
    }
  }

  async function borrar(remito) {
    const nombre = remito.titulo || remito.proveedor || remito.archivo_nombre || "este remito";
    if (!window.confirm(`¿Borrar ${nombre} y su archivo? No se puede deshacer.`)) return;
    setOcupado(`borrar-${remito.id}`);
    try {
      await borrarRemitoEscaneado(remito.id);
      setRemitos((actuales) => actuales.filter((r) => r.id !== remito.id));
      toast.success("Remito borrado.");
    } catch (e) {
      toast.error(e.message || "No se pudo borrar el remito.");
    } finally {
      setOcupado("");
    }
  }

  const tarjeta = { background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 12 };
  const nombreLinea = (l) => (l === SIN_OBRA ? "Sin obra · stock general" : l === SIN_LINEA ? "Sin línea" : l);

  // Los remitos que se muestran: los del barco abierto, o todos si se esta
  // buscando o filtrando (respetar la navegacion ahi no serviria de nada).
  const listado = buscando || filtro !== "todos";
  const listaVisible = listado ? filtrados : obraActual?.remitos ?? [];
  const columnas = isMobile ? "1fr" : "minmax(0,1.5fr) 92px 110px minmax(170px,1.1fr) auto";

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.bg, padding: isMobile ? 12 : 18 }}>
      {editando ? (
        <EditorRemito
          remito={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => cargar({ silencioso: true })}
        />
      ) : null}
      {editandoObras ? (
        <EditorObrasRemito
          remito={editandoObras}
          obras={obras}
          onCerrar={() => setEditandoObras(null)}
          onGuardado={() => cargar({ silencioso: true })}
        />
      ) : null}
      <style>{`
        .panol-archivo-fila { transition: background .15s; }
        .panol-archivo-fila:hover { background: var(--panel-2); }
        .panol-archivo-carpeta { transition: border-color .15s, transform .15s, box-shadow .15s; }
        .panol-archivo-carpeta:hover { border-color: var(--blue-border); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(15,23,42,0.08); }
      `}</style>

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

      {/* Filtros. "Falta leer" es el que importa: son los papeles guardados que
          todavia no tienen renglones y por eso no se pueden ingresar al stock. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {FILTROS.map(([valor, etiqueta]) => {
          const activo = filtro === valor;
          const cuenta = valor === "sin_leer" ? totalSinLeer : null;
          return (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              style={{
                border: `1px solid ${activo ? C.blueB : C.border2}`,
                background: activo ? C.blueL : C.panelSolid,
                color: activo ? C.blue : C.muted,
                borderRadius: 999,
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: C.sans,
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              {etiqueta}{cuenta ? ` · ${cuenta}` : ""}
            </button>
          );
        })}
      </div>

      {/* Migas: sin esto, dos niveles adentro no se sabe donde uno esta parado. */}
      {!listado && (lineaAbierta || obraAbierta) ? (
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

      {hayObra && !hayMultiobra ? (
        <div style={{ ...tarjeta, borderColor: C.cyanB, background: C.cyanL, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: C.muted, fontWeight: 750 }}>
          Falta aplicar la migración multiobra. Los remitos existentes siguen visibles, pero todavía no se puede asociar un mismo PDF a varios barcos.
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
            {buscando ? "No hay remitos que coincidan" : filtro !== "todos" ? "Nada en este filtro" : "Todavía no hay remitos"}
          </div>
          <div style={{ color: C.dim, fontSize: 12, fontWeight: 700, marginTop: 4 }}>
            {buscando ? "Probá con el proveedor o el número." : "Los que escanees en el pañol van a aparecer acá, separados por barco."}
          </div>
        </div>
      ) : !listado && !lineaAbierta ? (
        /* Nivel 1: las lineas de produccion */
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {arbol.map((nodo) => (
            <button
              key={nodo.linea}
              type="button"
              className="panol-archivo-carpeta"
              onClick={() => {
                setLineaAbierta(nodo.linea);
                if (nodo.directa) setObraAbierta(nodo.obras[0].codigo);
              }}
              style={{ ...tarjeta, padding: 14, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 11, fontFamily: C.sans }}
            >
              {nodo.directa ? <FolderOpen size={19} color={C.blue} /> : <Layers size={19} color={nodo.linea === SIN_OBRA ? C.dim : C.blue} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>{nombreLinea(nodo.linea)}</div>
                <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>
                  {nodo.directa
                    ? `${nodo.total} remito${nodo.total === 1 ? "" : "s"}`
                    : `${nodo.obras.length} barco${nodo.obras.length === 1 ? "" : "s"} · ${nodo.total} remito${nodo.total === 1 ? "" : "s"}`}
                </div>
              </div>
              <ChevronRight size={16} color={C.dim} />
            </button>
          ))}
        </div>
      ) : !listado && !obraAbierta ? (
        /* Nivel 2: los barcos de esa linea */
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {(lineaActual?.obras ?? []).map((nodo) => (
            <button
              key={nodo.codigo}
              type="button"
              className="panol-archivo-carpeta"
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
          {!listado && obraActual?.obra ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 13px", borderBottom: `1px solid ${C.border}`, fontSize: 11.5, color: C.dim, fontWeight: 750 }}>
              <FolderOpen size={13} /> En la PC del pañol: {carpetaParaMostrar(carpetaDeObra(obraActual.obra))}
            </div>
          ) : null}
          <div style={{ display: "grid" }}>
            {listaVisible.map((remito, i) => (
              <div
                key={remito.id}
                className="panol-archivo-fila"
                style={{
                  display: "grid",
                  gridTemplateColumns: columnas,
                  gap: isMobile ? 5 : 10,
                  alignItems: "center",
                  padding: "10px 13px",
                  borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span style={{ color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {remito.titulo || remito.proveedor || "Sin proveedor"}
                    </span>
                    {remito.solo_archivo ? (
                      <Chip color={C.cyan} soft={C.cyanL} border={C.cyanB} title="Se guardó como documento, sin mover stock">archivo</Chip>
                    ) : null}
                    {remito.sinLeer ? (
                      <Chip color={C.violet} soft={C.violetL} border={C.violetB} title="El PDF está guardado pero no tiene renglones cargados">falta leer</Chip>
                    ) : null}
                    {remito.recepcion_estado === "ingresado" && remito.panol_envio_id ? (
                      <Chip color={C.green} soft={C.greenL} border={C.greenB} title="Generó un ingreso de stock">ingresado</Chip>
                    ) : null}
                  </div>
                  <div style={{ color: C.dim, fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {remito.titulo && remito.proveedor ? `${remito.proveedor} · ` : ""}
                    {remito.numero ? `Nº ${remito.numero}` : "sin número"}
                    {listado && remito.obras?.length ? ` · ${remito.obras.map((obra) => obra.codigo).join(", ")}` : ""}
                    {remito.sede ? ` · ${remito.sede}` : ""}
                  </div>
                  {remito.notas ? (
                    <div style={{ color: C.dim, fontSize: 11, fontWeight: 650, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {remito.notas}
                    </div>
                  ) : null}
                </div>
                <div style={{ color: C.muted, fontSize: 12, fontWeight: 750 }}>{fmtFecha(remito.fecha || remito.created_at)}</div>
                <div style={{ color: C.muted, fontSize: 12, fontWeight: 750 }}>{money(remito.total, remito.moneda)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    {(remito.obras || []).length ? remito.obras.map((obra) => (
                      <Chip key={obra.id} color={C.blue} soft={C.blueL} border={C.blueB}>{obra.codigo}</Chip>
                    )) : (
                      <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 700 }}>
                        {nombreCarpeta(remito.carpeta_local) || "Sin obra"}
                      </span>
                    )}
                    {puedeReasignar && hayMultiobra ? (
                      <button
                        type="button"
                        onClick={() => setEditandoObras(remito)}
                        title="Agregar o quitar obras"
                        aria-label="Editar obras del remito"
                        style={{ width: 25, height: 25, border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.blue, borderRadius: 7, cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}
                      >
                        <Pencil size={11} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {/* También para los "solo archivo": guardarlos sin leer fue
                      una decisión del momento, y a veces después hace falta
                      cargar el stock. Leer no mueve nada por sí solo. */}
                  {remito.sinLeer ? (
                    <MiniBoton onClick={() => leer(remito)} disabled={Boolean(ocupado)} title="Leer los renglones con IA para poder ingresarlo">
                      {ocupado === `leer-${remito.id}` ? <LoaderCircle size={12} className="spin" /> : <Bot size={12} />} Leer
                    </MiniBoton>
                  ) : null}
                  <MiniBoton onClick={() => abrir(remito)} disabled={!remito.archivo_url || Boolean(ocupado)} title="Abrir el PDF original">
                    {ocupado === `abrir-${remito.id}` ? <LoaderCircle size={12} className="spin" /> : <ExternalLink size={12} />} Ver
                  </MiniBoton>
                  <MiniBoton onClick={() => setEditando(remito)} title="Escribir proveedor, número o referencia" color={C.muted}>
                    <Pencil size={12} />
                  </MiniBoton>
                  {puedeReasignar && !remito.panol_envio_id ? (
                    <MiniBoton onClick={() => borrar(remito)} disabled={Boolean(ocupado)} color={C.red} title="Borrar el remito y su archivo">
                      {ocupado === `borrar-${remito.id}` ? <LoaderCircle size={12} className="spin" /> : <Trash2 size={12} />}
                    </MiniBoton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
