import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CheckCheck, ClipboardList, FileText, Loader2, Package, Plus, Printer,
  Search, Send, Ship, Trash2, X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import MaterialPicker from "@/features/produccion/MaterialPicker";
import { INPUT, LBL, GLOW_BLUE, GRAD_BLUE, num, tint } from "@/features/produccion/comprasTokens";
import { Cta, EmptyState, EstadoSelect, Ghost, IconBtn, Kpi, Pill, Progreso } from "@/features/produccion/comprasUI";
import { fetchObras } from "@/features/produccion/comprasEtapasApi";
import SolicitudPanolPrintable from "@/features/panol/SolicitudPanolPrintable";
import FirmaRetiroPanol from "@/features/panol/FirmaRetiroPanol";
import FotosSolicitud from "@/features/panol/FotosSolicitud";
import {
  actualizarItem, actualizarSolicitud, agregarItemLibre, agregarItemsDesdeCatalogo, anularRetiro,
  borrarSolicitud, crearSolicitud, enviarSolicitud, estadoMeta, fetchItems, fetchSolicitud, fetchSolicitudes,
  ITEM_ESTADOS, marcarTodosPreparados, PRIORIDADES, quitarItem, registrarRetiro, SECTORES,
  SOLICITUD_ESTADOS, TIPOS,
} from "@/features/panol/solicitudesPanolApi";

// ─────────────────────────────────────────────────────────────────────────────
// Solicitudes de pañol: la digitalización del papel.
//
// El papel no se reemplaza, se acompaña. El flujo de la pantalla sigue el
// mismo orden que el mostrador:
//
//   1. Llega el papel  → "Cargar del papel" copia la cabecera tal cual está
//   2. Pañol arma      → agrega ítems (del catálogo o sueltos) y los va tildando
//   3. Queda listo     → estado "listo para retirar"
//   4. Viene a buscar  → firma con NFC (o manual) y queda entregado
//   5. Se imprime      → la MISMA hoja A4 con datos, ítems y comprobante
//
// El layout es el mismo lenguaje visual que ObraComprasTab: barra superior con
// contexto, lista a la izquierda, detalle a la derecha.
// ─────────────────────────────────────────────────────────────────────────────

const hoy = () => new Date().toISOString().slice(0, 10);

const fmtFecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
};

const nombreObra = (s) => s?.obra?.codigo || s?.obra?.descripcion || s?.obra_texto || "Sin obra";

/* ═══════════════════════════════════════════════════════════════════════════
   ALTA: la cabecera del papel, en el mismo orden en que está impresa
   ═══════════════════════════════════════════════════════════════════════════ */
function NuevaSolicitudModal({ obras, sedeDefault = "", onCrear, onClose }) {
  const [f, setF] = useState({
    obra_id: "", obra_texto: "", sector: "", prioridad: "normal",
    fecha_pedido: hoy(), fecha_retiro: "", solicita: "", retira: "",
    tipo: [], tarea: "", preparado_por: "",
    sede_origen: sedeDefault === "Chubut" ? "Chubut" : sedeDefault === "Pampa" ? "Pampa" : "",
  });
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const toggleTipo = (t) => set("tipo", f.tipo.includes(t) ? f.tipo.filter((x) => x !== t) : [...f.tipo, t]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await onCrear(f); }
    finally { setBusy(false); }
  }

  const campo = (k, label, extra = {}) => (
    <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
      <span style={LBL}>{label}</span>
      <input value={f[k]} onChange={(e) => set(k, e.target.value)} style={{ ...INPUT, padding: "7px 10px", fontSize: 12.5 }} {...extra} />
    </label>
  );

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 210, display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: "7vh 16px 16px", background: "var(--overlay, rgba(8,8,12,.5))", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "min(620px, 100%)", maxHeight: "84vh", display: "flex", flexDirection: "column", overflow: "hidden",
          background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 18,
          boxShadow: "0 32px 70px -20px var(--shadow-strong)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 12px 13px 16px", borderBottom: `1px solid ${C.border}` }}>
          <FileText size={17} color={C.blue} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 900, color: C.text }}>Cargar solicitud del papel</div>
            <div style={{ fontSize: 11.5, color: C.dim }}>Copiá la cabecera tal cual la escribieron. Los ítems se cargan después.</div>
          </div>
          <IconBtn icon={X} title="Cerrar" onClick={onClose} />
        </div>

        <div style={{ overflowY: "auto", padding: 14, display: "grid", gap: 11 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <span style={LBL}>Sale del pañol</span>
              <select
                required
                value={f.sede_origen}
                onChange={(e) => set("sede_origen", e.target.value)}
                style={{ ...INPUT, padding: "7px 10px", fontSize: 12.5, cursor: "pointer" }}
              >
                <option value="">— elegí una sede —</option>
                <option value="Pampa">Pampa</option>
                <option value="Chubut">Chubut</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <span style={LBL}>Obra / barco</span>
              <select value={f.obra_id} onChange={(e) => set("obra_id", e.target.value)} style={{ ...INPUT, padding: "7px 10px", fontSize: 12.5, cursor: "pointer" }}>
                <option value="">— no está en el sistema —</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>{o.codigo || o.descripcion || o.id.slice(0, 8)}</option>
                ))}
              </select>
            </label>
            {/* Sale el texto crudo del papel cuando la obra no existe como fila:
                "taller", "casco 50", "stock general"… */}
            {campo("obra_texto", "…o lo que dice el papel", { placeholder: "Ej: taller, casco 50" })}
            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <span style={LBL}>Sector</span>
              <select value={f.sector} onChange={(e) => set("sector", e.target.value)} style={{ ...INPUT, padding: "7px 10px", fontSize: 12.5, cursor: "pointer" }}>
                <option value="">— sin sector —</option>
                {SECTORES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <span style={LBL}>Prioridad</span>
              <select value={f.prioridad} onChange={(e) => set("prioridad", e.target.value)} style={{ ...INPUT, padding: "7px 10px", fontSize: 12.5, cursor: "pointer" }}>
                {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            {campo("fecha_pedido", "Fecha del pedido", { type: "date", style: { ...INPUT, padding: "7px 10px", fontSize: 12.5, colorScheme: "light dark" } })}
            {campo("fecha_retiro", "Fecha a retirar", { type: "date", style: { ...INPUT, padding: "7px 10px", fontSize: 12.5, colorScheme: "light dark" } })}
            {campo("solicita", "Solicita", { placeholder: "Quién firma el papel" })}
            {campo("retira", "Retira (si es otro)", { placeholder: "Opcional" })}
            {campo("preparado_por", "Prepara (pañol)", { placeholder: "Quién lo arma" })}
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <span style={LBL}>Tipo de pedido</span>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {TIPOS.map((t) => {
                const on = f.tipo.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTipo(t)}
                    className="sp-chip"
                    style={{
                      padding: "6px 12px", borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer",
                      border: `1px solid ${on ? C.blueB : C.border}`, background: on ? C.blueL : C.panel,
                      color: on ? C.blue : C.dim, fontFamily: C.sans,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={LBL}>Tarea a realizar / observaciones</span>
            <textarea
              value={f.tarea}
              onChange={(e) => set("tarea", e.target.value)}
              rows={2}
              placeholder="Ej: colocar paneles en casco 50"
              style={{ ...INPUT, padding: "8px 10px", fontSize: 12.5, resize: "vertical", fontFamily: C.sans }}
            />
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: `1px solid ${C.border}`, background: C.panel }}>
          <span style={{ flex: 1, fontSize: 11.5, color: C.dim }}>El N° de pañol se asigna solo al guardar.</span>
          <Ghost onClick={onClose}>Cancelar</Ghost>
          <Cta type="submit" tono="azul" icon={busy ? Loader2 : Plus} disabled={busy}>Crear solicitud</Cta>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ALTA DE ÍTEM SUELTO
   ═══════════════════════════════════════════════════════════════════════════ */
// La mitad de lo que se pide a mano no existe en el catálogo. Este formulario
// vive al pie de la tabla para que cargar diez cosas a mano sea escribir y
// apretar Enter, sin abrir un modal cada vez.
function ItemLibreForm({ onAgregar }) {
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [unidad, setUnidad] = useState("");
  const [esConsumible, setEsConsumible] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!descripcion.trim() || busy) return;
    setBusy(true);
    try {
      await onAgregar({ descripcion, cantidad, unidad, es_consumible: esConsumible });
      setDescripcion("");
      setCantidad("1");
      setUnidad("");
      setEsConsumible(false);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
      <input
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Ítem que no está en el catálogo…"
        style={{ ...INPUT, flex: "1 1 200px", minWidth: 160, padding: "7px 10px", fontSize: 12.5 }}
      />
      <input
        value={cantidad}
        inputMode="decimal"
        onChange={(e) => setCantidad(e.target.value)}
        aria-label="Cantidad"
        style={{ ...INPUT, width: 68, padding: "7px 9px", fontSize: 12, fontFamily: C.mono, textAlign: "right" }}
      />
      <input
        value={unidad}
        onChange={(e) => setUnidad(e.target.value)}
        placeholder="u"
        aria-label="Unidad"
        style={{ ...INPUT, width: 66, padding: "7px 9px", fontSize: 12 }}
      />
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 11.5, fontWeight: 750, whiteSpace: "nowrap" }}>
        <input
          type="checkbox"
          checked={esConsumible}
          onChange={(e) => setEsConsumible(e.target.checked)}
          style={{ accentColor: C.blue }}
        />
        Consumible
      </label>
      <Cta type="submit" size="sm" icon={busy ? Loader2 : Plus} disabled={!descripcion.trim() || busy}>Agregar</Cta>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAMPO DE CABECERA
   ═══════════════════════════════════════════════════════════════════════════ */
// Sin botón de guardar: se escribe y al salir del campo se persiste. Pañol
// corrige la cabecera mientras habla con la persona, no en una pasada aparte.
// Va como componente de nivel superior (y no adentro del detalle) para que
// React no lo remonte en cada render y te saque el foco a mitad de una palabra.
function CampoCabecera({ etiqueta, valor, tipo = "text", placeholder, ancho = "1 1 150px", disabled, onGuardar }) {
  return (
    <label style={{ display: "grid", gap: 3, flex: ancho, minWidth: 0 }}>
      <span style={LBL}>{etiqueta}</span>
      <input
        type={tipo}
        // `key` sobre el valor: al recargar desde el server, el input
        // descontrolado tiene que volver a tomar el valor nuevo.
        key={valor ?? ""}
        defaultValue={valor ?? ""}
        disabled={disabled}
        placeholder={placeholder}
        onBlur={(e) => { if (e.target.value !== (valor ?? "")) onGuardar(e.target.value); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ ...INPUT, padding: "6px 9px", fontSize: 12.5, colorScheme: tipo === "date" ? "light dark" : undefined }}
      />
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FILA DE ÍTEM
   ═══════════════════════════════════════════════════════════════════════════ */
function FilaItem({ row, indice, puedeEditar, onCampo, onEstado, onQuitar }) {
  const [cant, setCant] = useState(String(row.cantidad ?? ""));
  const [obs, setObs] = useState(row.observacion ?? "");
  // Re-sincroniza en render (y no con un efecto) cuando la fila cambia afuera,
  // misma convención que MaterialesEtapa.
  const [ref, setRef] = useState(row);
  if (ref !== row) {
    setRef(row);
    setCant(String(row.cantidad ?? ""));
    setObs(row.observacion ?? "");
  }

  const meta = ITEM_ESTADOS.find((e) => e.value === row.estado) || ITEM_ESTADOS[0];

  return (
    <tr className="sp-row">
      <td style={{ padding: "8px 6px 8px 12px", borderBottom: `1px solid ${C.border}`, width: 26, textAlign: "right", fontSize: 11, color: C.t3, fontFamily: C.mono }}>
        {indice + 1}
      </td>
      <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <span style={{ width: 25, height: 25, flexShrink: 0, borderRadius: 8, display: "grid", placeItems: "center", background: tint(meta.color, 14), color: meta.color }}>
            <Package size={12} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 750, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.descripcion}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 1 }}>
              {row.codigo && <span style={{ fontSize: 10.5, color: C.t3, fontFamily: C.mono }}>{row.codigo}</span>}
              {!row.material_id && <span style={{ fontSize: 10.5, color: C.dim }}>· fuera de catálogo</span>}
              {row.es_consumible && <span style={{ fontSize: 10.5, color: C.violet, fontWeight: 800 }}>· consumible</span>}
              {row.faltante_auto && (
                <span style={{ fontSize: 10.5, color: C.red, fontWeight: 800 }}>
                  · stock {num(row.stock_disponible_al_marcar)}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "right", whiteSpace: "nowrap" }}>
        <input
          value={cant}
          inputMode="decimal"
          disabled={!puedeEditar}
          aria-label="Cantidad"
          onChange={(e) => setCant(e.target.value)}
          onBlur={() => { if (num(cant) !== num(row.cantidad)) onCampo({ cantidad: cant }); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          style={{ ...INPUT, width: 64, display: "inline-block", padding: "5px 8px", fontSize: 12, fontFamily: C.mono, textAlign: "right", borderRadius: 8 }}
        />
        <span style={{ fontSize: 11, color: C.dim, paddingLeft: 6 }}>{row.unidad || "u"}</span>
      </td>
      <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}` }}>
        <input
          value={obs}
          disabled={!puedeEditar}
          aria-label="Observación"
          placeholder="marca, medida…"
          onChange={(e) => setObs(e.target.value)}
          onBlur={() => { if (obs !== (row.observacion ?? "")) onCampo({ observacion: obs }); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          style={{ ...INPUT, padding: "5px 9px", fontSize: 12, borderRadius: 8, background: C.panel }}
        />
      </td>
      <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}` }}>
        <EstadoSelect value={row.estado} options={ITEM_ESTADOS} onChange={onEstado} disabled={!puedeEditar} />
      </td>
      <td style={{ padding: "8px 8px 8px 0", borderBottom: `1px solid ${C.border}`, width: 36 }}>
        {puedeEditar && <IconBtn icon={Trash2} title="Quitar ítem" tono="rojo" onClick={onQuitar} />}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TARJETA EN LA LISTA LATERAL
   ═══════════════════════════════════════════════════════════════════════════ */
function SolicitudCard({ s, activa, onSelect }) {
  const meta = estadoMeta(s.estado);
  const urgente = s.prioridad === "urgente";
  const pct = s.totalItems ? (s.itemsListos / s.totalItems) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="sp-card"
      style={{
        width: "100%", textAlign: "left", display: "flex", alignItems: "stretch", gap: 0, padding: 0,
        borderRadius: 12, overflow: "hidden", cursor: "pointer",
        border: `1px solid ${activa ? tint(meta.color, 45) : C.border}`,
        background: activa ? `linear-gradient(135deg, ${tint(meta.color, 13)}, ${tint(meta.color, 3)})` : C.panelSolid,
        boxShadow: activa ? `0 4px 14px -7px ${tint(meta.color, 45)}` : "0 1px 2px var(--shadow)",
      }}
    >
      <span style={{ width: 4, flexShrink: 0, background: urgente ? "#ef4444" : meta.color }} />
      <span style={{ flex: 1, minWidth: 0, padding: "9px 11px", display: "block" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 900, fontFamily: C.mono, color: activa ? C.text : C.muted }}>
            N°{s.numero}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: activa ? C.text : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nombreObra(s)}
          </span>
          {urgente && <AlertTriangle size={12} color={C.red} style={{ flexShrink: 0 }} />}
          <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 999, background: meta.color }} title={meta.label} />
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.dim, flexWrap: "wrap" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>
            {s.solicita || "sin firmar"}
          </span>
          <span>· {fmtFecha(s.fecha_pedido)}</span>
          <span style={{ fontFamily: C.mono }}>· {s.itemsListos}/{s.totalItems}</span>
          {s.itemsFaltantes > 0 && <span style={{ color: C.red, fontWeight: 800 }}>· {s.itemsFaltantes} falta</span>}
        </span>
        {s.totalItems > 0 && (
          <span style={{ display: "block", marginTop: 6 }}>
            <Progreso pct={pct} ancho="100%" color={s.itemsFaltantes ? C.violet : undefined} />
          </span>
        )}
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DETALLE
   ═══════════════════════════════════════════════════════════════════════════ */
function Detalle({ solicitudId, obras, puedeEditar, esPanol, isMobile, toast, onCambio, onBorrada, onVolver }) {
  const [s, setS] = useState(null);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [picker, setPicker] = useState(false);
  const [imprimir, setImprimir] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [cab, its] = await Promise.all([fetchSolicitud(solicitudId), fetchItems(solicitudId)]);
      setS(cab);
      setItems(its);
    } catch (err) {
      toast?.error(err.message || "No se pudo cargar la solicitud.");
      setS(null);
    } finally {
      setCargando(false);
    }
  }, [solicitudId, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // Casi todas las acciones tocan la cabecera Y la lista lateral (cambia el
  // conteo o el estado), así que se recargan las dos juntas.
  const recargar = useCallback(async () => {
    await cargar();
    onCambio?.();
  }, [cargar, onCambio]);

  async function guardarCabecera(patch) {
    try {
      await actualizarSolicitud(solicitudId, patch);
      await recargar();
    } catch (err) { toast?.error(err.message || "No se pudo guardar."); }
  }

  async function agregarDelCatalogo(seleccion) {
    try {
      const n = await agregarItemsDesdeCatalogo(solicitudId, seleccion);
      setPicker(false);
      toast?.success(`${n} ${n === 1 ? "ítem agregado" : "ítems agregados"}.`);
      await recargar();
    } catch (err) { toast?.error(err.message || "No se pudieron agregar."); }
  }

  async function agregarSuelto(datos) {
    try {
      await agregarItemLibre(solicitudId, datos);
      await recargar();
    } catch (err) { toast?.error(err.message || "No se pudo agregar el ítem."); }
  }

  async function cambiarItem(row, patch) {
    try { await actualizarItem(row.id, patch); await recargar(); }
    catch (err) { toast?.error(err.message); }
  }

  async function sacarItem(row) {
    try { await quitarItem(row.id); await recargar(); }
    catch (err) { toast?.error(err.message); }
  }

  async function prepararTodo() {
    try {
      const n = await marcarTodosPreparados(solicitudId);
      if (!n) { toast?.info("No quedaban ítems pendientes."); return; }
      toast?.success(`${n} ${n === 1 ? "ítem marcado" : "ítems marcados"} como preparados.`);
      await recargar();
    } catch (err) { toast?.error(err.message); }
  }

  async function firmar({ empleado, metodo, nfcUid }) {
    const resultado = await registrarRetiro(solicitudId, { empleado, metodo, nfcUid });
    const partes = [];
    if (resultado?.egresos) partes.push(`${resultado.egresos} egreso${resultado.egresos === 1 ? "" : "s"} de stock`);
    if (resultado?.consumibles) partes.push(`${resultado.consumibles} consumible${resultado.consumibles === 1 ? "" : "s"} registrado${resultado.consumibles === 1 ? "" : "s"} sin descontar`);
    toast?.success(`Retiro de ${empleado.nombre} confirmado${partes.length ? ` · ${partes.join(" y ")}` : ""}.`);
    await recargar();
  }

  async function deshacerFirma() {
    if (!window.confirm("¿Deshacer el retiro registrado?\n\nSólo hacelo si se cargó por error: el comprobante impreso deja de valer.")) return;
    try { await anularRetiro(solicitudId); await recargar(); }
    catch (err) { toast?.error(err.message); }
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar la solicitud N° ${s.numero}?\n\nSe pierden sus ${items.length} ítems. El papel original no se toca.`)) return;
    try { await borrarSolicitud(solicitudId); onBorrada?.(); }
    catch (err) { toast?.error(err.message); }
  }

  async function enviar() {
    if (!items.length) {
      toast?.error("Agregá al menos un material antes de mandarlo a pañol.");
      return;
    }
    if (!window.confirm(`¿Mandar el pedido N° ${s.numero} a pañol?\n\nDespués de enviarlo no lo vas a poder editar.`)) return;
    try {
      await enviarSolicitud(solicitudId);
      toast?.success(`Pedido N° ${s.numero} enviado a pañol.`);
      await cargar();
      onCambio?.();
    } catch (err) { toast?.error(err.message); }
  }

  if (cargando && !s) {
    return (
      <div className="sp-surface" style={{ padding: 22, display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 13 }}>
        <Loader2 size={16} className="spin" /> Cargando solicitud…
      </div>
    );
  }
  if (!s) return null;

  const meta = estadoMeta(s.estado);
  const listos = items.filter((i) => i.estado === "preparado" || i.estado === "reemplazado").length;
  const faltantes = items.filter((i) => i.estado === "faltante").length;
  const pendientes = items.filter((i) => i.estado === "pendiente").length;
  const yaCargados = new Set(items.map((i) => i.material_id).filter(Boolean));
  const entregada = s.estado === "entregado";
  const puedeEditarSolicitud = puedeEditar && !entregada;
  const opcionesEstado = entregada
    ? SOLICITUD_ESTADOS.filter((e) => e.value === "entregado")
    : SOLICITUD_ESTADOS.filter((e) => e.value !== "entregado");
  const bloqueoRetiro = s.estado !== "listo"
    ? "Pasá la solicitud a “Listo para retirar” cuando termine la preparación."
    : pendientes > 0
      ? `Todavía quedan ${pendientes} ítems pendientes. Preparalos o marcalos como faltantes.`
      : listos === 0
        ? "No hay ítems preparados para entregar."
        : "";

  const campo = (nombre, etiqueta, extra = {}) => (
    <CampoCabecera
      etiqueta={etiqueta}
      valor={s[nombre]}
      disabled={!puedeEditarSolicitud}
      onGuardar={(v) => guardarCabecera({ [nombre]: v })}
      {...extra}
    />
  );

  return (
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      {isMobile && (
        <button
          type="button"
          onClick={onVolver}
          style={{
            justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6,
            border: "none", background: "transparent", color: C.blue, padding: "2px 0",
            fontFamily: C.sans, fontSize: 12.5, fontWeight: 850, cursor: "pointer",
          }}
        >
          <ArrowLeft size={15} /> Volver a solicitudes
        </button>
      )}
      {/* identidad + estado */}
      <div className="sp-surface">
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", flexWrap: "wrap" }}>
          <span style={{
            flexShrink: 0, padding: "5px 11px", borderRadius: 10, fontFamily: C.mono, fontSize: 15, fontWeight: 900,
            background: tint(meta.color, 14), border: `1px solid ${tint(meta.color, 30)}`, color: meta.color,
          }}>
            N° {s.numero}
          </span>
          <h2 style={{ margin: 0, flex: 1, minWidth: 120, fontSize: 15.5, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nombreObra(s)}
          </h2>
          {s.prioridad === "urgente" && (
            <Pill color={C.red} soft={C.redL} borde={C.redB}><AlertTriangle size={10} /> Urgente</Pill>
          )}
          <EstadoSelect value={s.estado} options={opcionesEstado} onChange={(v) => guardarCabecera({ estado: v })} disabled={!puedeEditarSolicitud} />
          {/* El solicitante manda el pedido cuando terminó de cargarlo. Sólo
              aparece mientras está en borrador: después lo maneja pañol. */}
          {!esPanol && s.estado === "borrador" && (
            <Cta icon={Send} size="sm" tono="azul" onClick={enviar}>Enviar a pañol</Cta>
          )}
          <Ghost icon={Printer} size="sm" onClick={() => setImprimir(true)}>Imprimir hoja</Ghost>
          {puedeEditarSolicitud && <IconBtn icon={Trash2} title="Borrar solicitud" tono="rojo" onClick={borrar} />}
        </div>

        {/* datos del papel */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
          <label style={{ display: "grid", gap: 3, flex: "1 1 170px", minWidth: 0 }}>
            <span style={LBL}>Obra</span>
            <select
              value={s.obra_id || ""}
              disabled={!puedeEditarSolicitud}
              onChange={(e) => guardarCabecera({ obra_id: e.target.value })}
              style={{ ...INPUT, padding: "6px 9px", fontSize: 12.5, cursor: puedeEditarSolicitud ? "pointer" : "default" }}
            >
              <option value="">— no está en el sistema —</option>
              {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo || o.descripcion || o.id.slice(0, 8)}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 3, flex: "0 1 145px", minWidth: 130 }}>
            <span style={LBL}>Sale del pañol</span>
            <select
              value={s.sede_origen || ""}
              disabled={!puedeEditarSolicitud}
              onChange={(e) => guardarCabecera({ sede_origen: e.target.value })}
              style={{ ...INPUT, padding: "6px 9px", fontSize: 12.5, cursor: puedeEditarSolicitud ? "pointer" : "default" }}
            >
              <option value="">— elegí —</option>
              <option value="Pampa">Pampa</option>
              <option value="Chubut">Chubut</option>
            </select>
          </label>
          {campo("obra_texto", "…o texto del papel", { placeholder: "Ej: taller" })}
          <label style={{ display: "grid", gap: 3, flex: "1 1 130px", minWidth: 0 }}>
            <span style={LBL}>Sector</span>
            <select
              value={s.sector || ""}
              disabled={!puedeEditarSolicitud}
              onChange={(e) => guardarCabecera({ sector: e.target.value })}
              style={{ ...INPUT, padding: "6px 9px", fontSize: 12.5, cursor: puedeEditarSolicitud ? "pointer" : "default" }}
            >
              <option value="">— sin sector —</option>
              {SECTORES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 3, flex: "1 1 120px", minWidth: 0 }}>
            <span style={LBL}>Prioridad</span>
            <select
              value={s.prioridad}
              disabled={!puedeEditarSolicitud}
              onChange={(e) => guardarCabecera({ prioridad: e.target.value })}
              style={{ ...INPUT, padding: "6px 9px", fontSize: 12.5, cursor: puedeEditarSolicitud ? "pointer" : "default" }}
            >
              {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          {campo("fecha_pedido", "Fecha pedido", { tipo: "date", ancho: "1 1 130px" })}
          {campo("fecha_retiro", "Fecha retiro", { tipo: "date", ancho: "1 1 130px" })}
          {campo("solicita", "Solicita")}
          {campo("retira", "Retira", { placeholder: "si es otro" })}
          {campo("preparado_por", "Prepara (pañol)")}
        </div>

        {/* tipo + textos */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderTop: `1px solid ${C.border}`, alignItems: "flex-start" }}>
          <div style={{ display: "grid", gap: 5, flex: "1 1 190px", minWidth: 0 }}>
            <span style={LBL}>Tipo</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TIPOS.map((t) => {
                const on = (s.tipo ?? []).includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={!puedeEditarSolicitud}
                    onClick={() => guardarCabecera({ tipo: on ? s.tipo.filter((x) => x !== t) : [...(s.tipo ?? []), t] })}
                    className="sp-chip"
                    style={{
                      padding: "5px 11px", borderRadius: 9, fontSize: 11.5, fontWeight: 800,
                      cursor: puedeEditarSolicitud ? "pointer" : "default", fontFamily: C.sans,
                      border: `1px solid ${on ? C.blueB : C.border}`, background: on ? C.blueL : C.panel,
                      color: on ? C.blue : C.dim,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <label style={{ display: "grid", gap: 3, flex: "2 1 240px", minWidth: 0 }}>
            <span style={LBL}>Tarea / observaciones del papel</span>
            <textarea
              defaultValue={s.tarea ?? ""}
              rows={2}
              disabled={!puedeEditarSolicitud}
              onBlur={(e) => { if (e.target.value !== (s.tarea ?? "")) guardarCabecera({ tarea: e.target.value }); }}
              style={{ ...INPUT, padding: "6px 9px", fontSize: 12.5, resize: "vertical", fontFamily: C.sans }}
            />
          </label>
          <label style={{ display: "grid", gap: 3, flex: "2 1 240px", minWidth: 0 }}>
            <span style={LBL}>Notas de pañol</span>
            <textarea
              defaultValue={s.notas_panol ?? ""}
              rows={2}
              disabled={!puedeEditarSolicitud}
              placeholder="Lo que pañol quiere dejar dicho (se imprime en la hoja)"
              onBlur={(e) => { if (e.target.value !== (s.notas_panol ?? "")) guardarCabecera({ notas_panol: e.target.value }); }}
              style={{ ...INPUT, padding: "6px 9px", fontSize: 12.5, resize: "vertical", fontFamily: C.sans }}
            />
          </label>
        </div>
      </div>

      {/* Fotos del papel. Va ARRIBA de los ítems a propósito: el circuito real
          es sacarle una foto al papel, leerlo y que de ahí salgan los ítems. */}
      <FotosSolicitud
        solicitudId={solicitudId}
        obras={obras}
        puedeEditar={puedeEditarSolicitud}
        toast={toast}
        onAplicado={async () => { await cargar(); onCambio?.(); }}
      />

      {/* ítems */}
      <div className="sp-surface" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          <span style={LBL}>Ítems</span>
          <Pill color={items.length ? C.blue : C.dim} soft={items.length ? C.blueL : C.panel2} borde={items.length ? C.blueB : "transparent"} mono>
            {items.length}
          </Pill>
          {listos > 0 && <Pill color={C.green} soft={C.greenL} borde={C.greenB} mono>{listos} listos</Pill>}
          {faltantes > 0 && <Pill color={C.red} soft={C.redL} borde={C.redB} mono>{faltantes} sin stock</Pill>}
          {puedeEditarSolicitud && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pendientes > 0 && <Ghost icon={CheckCheck} size="sm" onClick={prepararTodo}>Marcar todo preparado</Ghost>}
              <Cta icon={Plus} tono="azul" size="sm" onClick={() => setPicker(true)}>Agregar del catálogo</Cta>
            </div>
          )}
        </div>

        {!items.length ? (
          <div style={{ display: "grid", placeItems: "center", textAlign: "center", gap: 9, padding: "30px 22px" }}>
            <div style={{ width: 54, height: 54, borderRadius: 17, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
              <Plus size={24} />
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 850, color: C.text }}>Todavía no cargaste ítems</div>
            <div style={{ fontSize: 12.5, color: C.dim, maxWidth: 400, lineHeight: 1.6 }}>
              Buscá en el catálogo lo que pide el papel y marcá varios de una vez, o cargá a mano lo que no esté.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["", "Material / consumible", "Cant.", "Marca, medida u observación", "Estado", ""].map((h, i) => (
                    <th
                      key={h || i}
                      style={{
                        textAlign: i === 2 ? "right" : "left", padding: "8px 10px", borderBottom: `1px solid ${C.border}`,
                        fontSize: 10, fontWeight: 850, letterSpacing: 0.6, textTransform: "uppercase", color: C.dim,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <FilaItem
                    key={row.id}
                    row={row}
                    indice={i}
                    puedeEditar={puedeEditarSolicitud}
                    onCampo={(patch) => cambiarItem(row, patch)}
                    onEstado={(v) => cambiarItem(row, { estado: v })}
                    onQuitar={() => sacarItem(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {puedeEditarSolicitud && (
          <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, background: C.panel }}>
            <ItemLibreForm onAgregar={agregarSuelto} />
          </div>
        )}
      </div>

      {/* retiro */}
      <div className="sp-surface" style={{ padding: 12 }}>
        <FirmaRetiroPanol
          solicitud={s}
          materialIds={items.map((row) => row.material_id).filter(Boolean)}
          puedeEditar={puedeEditar}
          bloqueo={bloqueoRetiro}
          aviso={faltantes > 0 ? `${faltantes} faltante${faltantes === 1 ? "" : "s"} seguirá${faltantes === 1 ? "" : "n"} abierto${faltantes === 1 ? "" : "s"} en Compras; sólo se entregan los ítems preparados.` : ""}
          toast={toast}
          onConfirmar={firmar}
          onAnular={deshacerFirma}
        />
      </div>

      {picker && (
        <MaterialPicker
          titulo={`Agregar ítems a la solicitud N° ${s.numero}`}
          yaCargados={yaCargados}
          onClose={() => setPicker(false)}
          onAdd={agregarDelCatalogo}
        />
      )}

      {imprimir && (
        <SolicitudPanolPrintable
          open
          solicitud={s}
          items={items}
          onClose={() => setImprimir(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANTALLA
   ═══════════════════════════════════════════════════════════════════════════ */
export default function SolicitudesPanolScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get("open");

  // useToast() devuelve un objeto NUEVO cada vez que aparece un toast. Si ese
  // objeto entra como dependencia de los useCallback de carga, un error que
  // dispara un toast se realimenta: toast → nueva identidad → recarga → error
  // → toast. Se envuelve una sola vez en una referencia estable.
  const toastApi = useToast();
  const toastRef = useRef(toastApi);
  toastRef.current = toastApi;
  const toast = useMemo(() => ({
    success: (m, o) => toastRef.current?.success(m, o),
    error: (m, o) => toastRef.current?.error(m, o),
    warning: (m, o) => toastRef.current?.warning(m, o),
    info: (m, o) => toastRef.current?.info(m, o),
  }), []);

  const [solicitudes, setSolicitudes] = useState([]);
  const [obras, setObras] = useState([]);
  const [estado, setEstado] = useState("");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [nueva, setNueva] = useState(false);
  const [enBlanco, setEnBlanco] = useState(false);

  const puedeEditar = true; // el rol ya está filtrado por la ruta

  // La misma pantalla sirve para los dos lados del mostrador, y cambia según
  // quién entra:
  //   · pañol      → digitaliza el papel que le llegó (origen 'papel', arranca
  //                  en "preparando" porque ya lo tiene en la mano)
  //   · el resto   → arma su propio pedido digital sin pasar por papel
  //                  (origen 'digital', arranca en "borrador" y lo manda cuando
  //                  termina de cargarlo)
  const esPanol = profile?.role === "panol";
  const textoAlta = esPanol ? "Cargar del papel" : "Nuevo pedido";

  useEffect(() => { fetchObras().then(setObras).catch(() => setObras([])); }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const filas = await fetchSolicitudes({ estado, q });
      setSolicitudes(filas);
      setSelId((cur) => {
        if (filas.some((s) => s.id === cur)) return cur;
        if (openId && filas.some((s) => s.id === openId)) return openId;
        return isMobile ? null : filas[0]?.id ?? null;
      });
    } catch (err) {
      toast?.error(err.message || "No se pudieron cargar las solicitudes.");
      setSolicitudes([]);
    } finally {
      setCargando(false);
    }
  }, [estado, isMobile, openId, q, toast]);

  // Debounce sobre la búsqueda: la lista pega contra el server en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => { cargar(); }, q ? 260 : 0);
    return () => clearTimeout(t);
  }, [cargar, q]);

  const abiertas = useMemo(
    () => solicitudes.filter((s) => s.estado === "preparando" || s.estado === "borrador").length,
    [solicitudes]
  );
  const listas = useMemo(() => solicitudes.filter((s) => s.estado === "listo").length, [solicitudes]);
  const urgentes = useMemo(
    () => solicitudes.filter((s) => s.prioridad === "urgente" && s.estado !== "entregado" && s.estado !== "cancelado").length,
    [solicitudes]
  );

  async function crear(datos) {
    try {
      const { id, numero } = await crearSolicitud({
        ...datos,
        origen: esPanol ? "papel" : "digital",
        estado: esPanol ? "preparando" : "borrador",
        // El que pide es quien está logueado, salvo que aclare otra cosa: uno de
        // los campos que no debería tener que escribir.
        solicita: datos.solicita || (esPanol ? "" : profile?.username || ""),
      });
      setNueva(false);
      toast?.success(
        esPanol
          ? `Solicitud N° ${numero} creada. Cargale los ítems.`
          : `Pedido N° ${numero} creado. Agregale los materiales y mandalo a pañol.`
      );
      await cargar();
      setSelId(id);
    } catch (err) { toast?.error(err.message || "No se pudo crear la solicitud."); }
  }

  const pad = isMobile ? 14 : 24;
  const seleccionar = (id) => {
    setSelId(id);
    const next = new URLSearchParams(searchParams);
    next.set("open", id);
    setSearchParams(next, { replace: true });
  };
  const volverALista = () => {
    setSelId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
  };

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", overflow: "hidden", background: C.bg, color: C.t0, fontFamily: C.sans }}>
      <style>{`
        .spin{animation:spin 1s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes sp-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .sp-surface{background:var(--panel-solid);border:1px solid var(--border);border-radius:14px;box-shadow:0 1px 2px var(--shadow);animation:sp-fade .24s ease both}
        .sp-card{transition:transform .16s cubic-bezier(.4,0,.2,1),box-shadow .16s ease,border-color .16s ease}
        .sp-card:hover{transform:translateX(2px);border-color:var(--border-2)}
        .sp-row{transition:background .14s ease}
        .sp-row:hover{background:var(--panel)}
        .sp-chip{transition:background .14s ease,border-color .14s ease,color .14s ease}
        .sp-chip:hover:not(:disabled){border-color:var(--border-2)}
        .sp-seg{transition:all .18s cubic-bezier(.4,0,.2,1)}
        .sp-seg:hover{color:var(--text)}
        .ce-cta{transition:transform .16s ease,filter .16s ease}
        .ce-cta:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08)}
        .ce-ghost:hover:not(:disabled){background:var(--panel-2);color:var(--text)}
        .sp-list-scroll{scrollbar-width:thin}
        button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
      `}</style>

      <div style={{ width: isMobile ? 0 : 280, height: "100vh", flexShrink: 0 }}>
        <Sidebar profile={profile} signOut={signOut} />
      </div>

      <main style={{ position: "relative", minWidth: 0, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(1000px 300px at 18% -12%, ${tint("#3b82f6", 8)}, transparent 70%)` }} />

        <header style={{ position: "relative", padding: `${isMobile ? 13 : 16}px ${pad}px 0`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: GRAD_BLUE, color: "#fff", boxShadow: GLOW_BLUE }}>
              <ClipboardList size={19} />
            </div>
            <div style={{ minWidth: 0, flex: isMobile ? "1 1 calc(100% - 50px)" : "0 1 auto" }}>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 950, color: C.text, letterSpacing: -0.2 }}>Solicitudes de pañol</h1>
              <div style={{
                fontSize: isMobile ? 11.5 : 12.5, color: C.dim, marginTop: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {esPanol
                  ? "El papel que llega al mostrador, cargado, armado y firmado al retirar."
                  : "Armá tu pedido de materiales y mandalo a pañol, sin pasar por papel."}
              </div>
            </div>

            <div style={{
              marginLeft: isMobile ? 48 : "auto",
              width: isMobile ? "calc(100% - 48px)" : "auto",
              display: "flex", alignItems: "center", justifyContent: isMobile ? "flex-end" : "initial",
              gap: 7, flexWrap: "wrap",
            }}>
              {!isMobile && (
                <>
                  <Kpi icon={ClipboardList} valor={abiertas} label="En curso" color="var(--violet)" soft="var(--violet-soft)" borde="var(--violet-border)" />
                  <Kpi icon={CheckCheck} valor={listas} label="Para retirar" color="var(--blue)" soft="var(--blue-soft)" borde="var(--blue-border)" />
                  {urgentes > 0 && (
                    <Kpi icon={AlertTriangle} valor={urgentes} label="Urgentes" color="var(--red)" soft="var(--red-soft)" borde="var(--red-border)" />
                  )}
                </>
              )}
              <Ghost icon={Printer} size="sm" onClick={() => setEnBlanco(true)} title="Imprimir la hoja vacía para completar a mano">{isMobile ? "Hoja" : "Hoja en blanco"}</Ghost>
              <Cta icon={Plus} size={isMobile ? "sm" : undefined} tono="azul" onClick={() => setNueva(true)}>{isMobile ? "Nuevo" : textoAlta}</Cta>
            </div>
          </div>
        </header>

        <div style={{ position: "relative", flex: 1, minHeight: 0, padding: `14px ${pad}px ${pad}px`, display: "flex", gap: 13, flexDirection: isMobile ? "column" : "row" }}>
          {/* lista */}
          <div
            className="sp-list-scroll"
            style={{
              width: isMobile ? "100%" : 296,
              flex: isMobile ? 1 : "0 0 auto",
              display: isMobile && selId ? "none" : "grid",
              gap: 8, alignContent: "start", minHeight: 0, maxHeight: "100%",
              overflowY: "auto", paddingRight: 2,
            }}
          >
            <div style={{ position: "relative" }}>
              <Search size={14} color={C.dim} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="N° pañol, quién pide, obra…"
                style={{ ...INPUT, padding: "8px 10px 8px 30px", fontSize: 12.5 }}
              />
            </div>

            {/* filtro por estado: chips y no un select, porque el 90% del uso es
                "mostrame las que están para retirar" y tiene que ser un toque */}
            {/* Envuelven en dos renglones en vez de scrollear: la columna mide
                296px y los chips no entran en una línea. Una barra horizontal
                acá esconde estados y obliga a arrastrar para algo que se usa a
                cada rato. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 3, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 11 }}>
              {[{ value: "", label: "Todas" }, ...SOLICITUD_ESTADOS.filter((e) => e.value !== "borrador")].map((e) => {
                const on = estado === e.value;
                return (
                  <button
                    key={e.value || "todas"}
                    type="button"
                    onClick={() => setEstado(e.value)}
                    className="sp-seg"
                    style={{
                      flex: "0 0 auto", padding: "5px 9px", borderRadius: 8, border: "none", cursor: "pointer",
                      fontSize: 11.5, fontWeight: 800, fontFamily: C.sans, whiteSpace: "nowrap",
                      background: on ? C.panelSolid : "transparent",
                      color: on ? (e.color || C.text) : C.dim,
                      boxShadow: on ? "0 2px 6px -2px var(--shadow)" : "none",
                    }}
                  >
                    {e.value === "listo" ? "Listas" : e.label}
                  </button>
                );
              })}
            </div>

            {cargando && !solicitudes.length && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 13, padding: 6 }}>
                <Loader2 size={16} className="spin" /> Cargando…
              </div>
            )}

            {!cargando && !solicitudes.length && (
              <EmptyState
                icon={ClipboardList}
                accent="#3b82f6"
                title={q || estado ? "Nada con ese filtro" : esPanol ? "Sin solicitudes cargadas" : "Todavía no pediste nada"}
                subtitle={q || estado
                  ? "Probá sacando el filtro o buscando por el N° de pañol."
                  : esPanol
                    ? "Cuando llegue un papel al mostrador, cargalo acá y empezá a armar el pedido."
                    : "Armá tu pedido buscando los materiales en el catálogo y mandalo a pañol."}
                action={!q && !estado ? <Cta icon={Plus} size="sm" tono="azul" onClick={() => setNueva(true)}>{textoAlta}</Cta> : null}
              />
            )}

            {solicitudes.map((s) => (
              <SolicitudCard key={s.id} s={s} activa={s.id === selId} onSelect={() => seleccionar(s.id)} />
            ))}
          </div>

          {/* detalle */}
          <div style={{
            flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", paddingRight: 2,
            display: isMobile && !selId ? "none" : "block",
          }}>
            {selId ? (
              <Detalle
                key={selId}
                solicitudId={selId}
                obras={obras}
                puedeEditar={puedeEditar}
                esPanol={esPanol}
                isMobile={isMobile}
                toast={toast}
                onCambio={cargar}
                onVolver={volverALista}
                onBorrada={() => { volverALista(); cargar(); }}
              />
            ) : (
              !cargando && (
                <EmptyState
                  icon={Ship}
                  accent="#3b82f6"
                  title="Elegí una solicitud"
                  subtitle="A la izquierda están los papeles cargados. Tocá uno para armar el pedido, marcar los ítems y firmar el retiro."
                />
              )
            )}
          </div>
        </div>
      </main>

      {nueva && <NuevaSolicitudModal obras={obras} sedeDefault={profile?.sede} onCrear={crear} onClose={() => setNueva(false)} />}
      {/* La hoja vacía es la misma de siempre: sin `solicitud` sale en blanco. */}
      <SolicitudPanolPrintable open={enBlanco} onClose={() => setEnBlanco(false)} />
    </div>
  );
}
