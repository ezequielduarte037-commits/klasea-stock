import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clock, Copy, FileText, ImagePlus, LoaderCircle, MapPin,
  MessageCircle, Paperclip, Phone, Plus, Trash2, UserPlus, X,
} from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import {
  borrarAdjunto,
  borrarContacto,
  fetchAdjuntos,
  fetchContactos,
  fichaComoTexto,
  guardarAcceso,
  guardarContacto,
  linkWhatsApp,
  ROLES,
  subirAdjunto,
} from "./postventaFichaApi";

/**
 * La ficha de un barco entregado.
 *
 * Está armada alrededor de una pregunta: "voy a mandar un técnico a este barco,
 * ¿qué necesita saber?". A quién llamar, cómo se ve la embarcación, qué papel le
 * van a pedir en la guardia y a qué hora lo dejan entrar. Todo eso estaba en el
 * WhatsApp de alguien y por eso había que preguntar cada vez.
 *
 * El botón que más importa es el de abajo: copia todo eso en un mensaje. Mandar
 * una captura del mapa era la forma de resolver esto con lo que había; un texto
 * con el link del GPS, el teléfono y el horario le sirve más al que va.
 */

const tinta = (color, alfa) => `color-mix(in srgb, ${color} ${Math.round(alfa * 100)}%, transparent)`;

const INP = {
  width: "100%", boxSizing: "border-box", background: "var(--panel)",
  border: `1px solid ${C.b0}`, color: C.t0, padding: "8px 11px", borderRadius: 8,
  fontSize: 13, outline: "none", fontFamily: C.sans,
};
const LBL = {
  fontSize: 9.5, letterSpacing: 1.2, color: C.t1, display: "block",
  marginBottom: 5, textTransform: "uppercase", fontWeight: 800,
};

function Seccion({ icono, titulo, extra, children }) {
  const Icono = icono;
  return (
    <section style={{ borderTop: `1px solid ${C.b0}`, padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icono size={13} color={C.t1} />
        <span style={{ flex: 1, ...LBL, marginBottom: 0 }}>{titulo}</span>
        {extra}
      </div>
      {children}
    </section>
  );
}

/* ── CONTACTOS ─────────────────────────────────────────────────────────────── */

function FilaContacto({ contacto, onGuardar, onBorrar }) {
  const [editando, setEditando] = useState(!contacto.id);
  const [form, setForm] = useState({
    nombre: contacto.nombre || "", rol: contacto.rol || "", telefono: contacto.telefono || "",
  });
  const [guardando, setGuardando] = useState(false);
  const wa = linkWhatsApp(contacto.telefono);

  async function guardar() {
    if (!form.nombre.trim() || guardando) return;
    setGuardando(true);
    try {
      await onGuardar({ ...contacto, ...form });
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  if (editando) {
    return (
      <div style={{ display: "grid", gap: 6, padding: 9, borderRadius: 9, background: "var(--panel)", border: `1px solid ${C.b0}`, marginBottom: 7 }}>
        <input value={form.nombre} autoFocus placeholder="Nombre"
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
          style={INP} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <input value={form.rol} placeholder="Rol" list="postventa-roles"
            onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))} style={INP} />
          <input value={form.telefono} placeholder="Teléfono" inputMode="tel"
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
            style={{ ...INP, fontFamily: C.mono }} />
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => (contacto.id ? setEditando(false) : onBorrar())}
            style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t1, padding: "5px 11px", borderRadius: 7, fontSize: 12, cursor: "pointer" }}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={!form.nombre.trim() || guardando}
            style={{ background: tinta(C.blue, 0.14), border: `1px solid ${tinta(C.blue, 0.35)}`, color: C.blue, padding: "5px 13px", borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: form.nombre.trim() ? "pointer" : "default" }}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 9, background: "var(--panel)", border: `1px solid ${C.b0}`, marginBottom: 7 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: C.t0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {contacto.nombre}
          {contacto.rol ? <span style={{ color: C.t2, fontWeight: 600, fontSize: 11.5 }}> · {contacto.rol}</span> : null}
        </div>
        {contacto.telefono ? (
          <a href={`tel:${contacto.telefono}`} style={{ fontFamily: C.mono, fontSize: 12, color: C.t1, textDecoration: "none" }}>
            {contacto.telefono}
          </a>
        ) : <span style={{ fontSize: 11.5, color: C.border2 }}>sin teléfono</span>}
      </div>
      {wa ? (
        <a href={wa} target="_blank" rel="noreferrer" title="Abrir WhatsApp"
          style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 7, border: `1px solid ${tinta(C.green, 0.3)}`, background: tinta(C.green, 0.1), color: C.green }}>
          <MessageCircle size={13} />
        </a>
      ) : null}
      <button type="button" onClick={() => setEditando(true)} title="Editar"
        style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t1, width: 28, height: 28, borderRadius: 7, cursor: "pointer", display: "grid", placeItems: "center" }}>
        <Phone size={12} />
      </button>
      <button type="button" onClick={onBorrar} title="Quitar"
        style={{ background: "transparent", border: "none", color: C.t2, cursor: "pointer", padding: 3, display: "flex" }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/* ── LA FICHA ──────────────────────────────────────────────────────────────── */

export default function FichaBarco({ barco, onCerrar, onCambio }) {
  const toast = useToast();
  const [contactos, setContactos] = useState([]);
  const [adjuntos, setAdjuntos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const [subiendo, setSubiendo] = useState("");
  const [mirando, setMirando] = useState(null);
  const [acceso, setAcceso] = useState({
    acceso_dias: barco.acceso_dias || "",
    acceso_horario: barco.acceso_horario || "",
    acceso_notas: barco.acceso_notas || "",
  });
  const accesoGuardado = useRef(acceso);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [c, a] = await Promise.all([fetchContactos(barco.id), fetchAdjuntos(barco.id)]);
      setContactos(c.contactos);
      setAdjuntos(a.adjuntos);
      setFaltaMigracion(c.falta || a.falta);
    } catch (e) {
      toast.error(e?.message || "No se pudo abrir la ficha.");
    } finally {
      setCargando(false);
    }
  }, [barco.id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const fotos = adjuntos.filter((a) => a.tipo === "foto");
  const papeles = adjuntos.filter((a) => a.tipo === "documento");

  async function subir(archivos, tipo) {
    const lista = [...archivos];
    if (!lista.length) return;
    setSubiendo(tipo);
    try {
      for (const archivo of lista) {
        const fila = await subirAdjunto(barco.id, archivo, tipo);
        if (fila) setAdjuntos((actual) => [...actual, fila]);
      }
    } catch (e) {
      toast.error(e?.message || "No se pudo subir.");
    } finally {
      setSubiendo("");
    }
  }

  async function quitarAdjunto(adjunto) {
    try {
      await borrarAdjunto(adjunto);
      setAdjuntos((actual) => actual.filter((a) => a.id !== adjunto.id));
    } catch (e) {
      toast.error(e?.message || "No se pudo borrar.");
    }
  }

  // El acceso se guarda al salir del campo, como el resto de la pantalla. Sólo
  // si cambió: sin esto, abrir la ficha y cerrarla escribía igual.
  async function guardarAccesoSiCambio() {
    const previo = accesoGuardado.current;
    if (previo.acceso_dias === acceso.acceso_dias
      && previo.acceso_horario === acceso.acceso_horario
      && previo.acceso_notas === acceso.acceso_notas) return;
    try {
      await guardarAcceso(barco.id, acceso);
      accesoGuardado.current = acceso;
      onCambio?.({ ...barco, ...acceso });
    } catch (e) {
      toast.error(e?.message || "No se pudo guardar el horario.");
    }
  }

  async function copiarFicha() {
    const texto = fichaComoTexto({ ...barco, ...acceso }, contactos, papeles);
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Ficha copiada. Pegala en el WhatsApp del técnico.");
    } catch {
      toast.error("No se pudo copiar. Copiala a mano desde el cuadro.");
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
      style={{ position: "fixed", inset: 0, background: tinta(C.bg, 0.82), backdropFilter: "blur(18px)", zIndex: 9998, display: "flex", justifyContent: "flex-end" }}
    >
      <datalist id="postventa-roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>

      {mirando ? (
        <div onClick={() => setMirando(null)}
          style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(6,10,20,.9)", display: "grid", placeItems: "center", padding: 24, cursor: "zoom-out" }}>
          <img src={mirando.url} alt={mirando.nombre || "foto"} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 10 }} />
        </div>
      ) : null}

      <div style={{ width: "min(440px, 100%)", height: "100%", background: "var(--panel-solid)", borderLeft: `1px solid ${C.b1}`, display: "flex", flexDirection: "column", boxShadow: "-24px 0 60px rgba(0,0,0,.4)" }}>
        {/* Encabezado */}
        <div style={{ padding: "16px 18px 13px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.t0 }}>{barco.nombre_barco}</div>
              <div style={{ fontSize: 12.5, color: C.t2, marginTop: 2 }}>
                {barco.propietario || "Sin propietario cargado"}
              </div>
              {barco.ubicacion_general ? (
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, color: C.t1, fontSize: 12 }}>
                  <MapPin size={11} />
                  {barco.ubicacion_general}{barco.detalle_ubicacion ? ` · ${barco.detalle_ubicacion}` : ""}
                </div>
              ) : null}
            </div>
            <button type="button" onClick={onCerrar} aria-label="Cerrar"
              style={{ background: "transparent", border: "none", color: C.t2, cursor: "pointer", padding: 4, display: "flex" }}>
              <X size={17} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {faltaMigracion ? (
            <div style={{ margin: 18, padding: 14, borderRadius: 10, border: `1px solid ${tinta(C.violet, 0.35)}`, background: tinta(C.violet, 0.1), color: C.t1, fontSize: 12.5, lineHeight: 1.55 }}>
              Falta correr la migración <b style={{ fontFamily: C.mono, fontSize: 11.5, color: C.t0 }}>20260907170000_postventa_ficha_tecnico.sql</b> en
              el editor SQL de Supabase. Hasta entonces la ficha se ve pero no guarda nada.
            </div>
          ) : null}

          {cargando ? (
            <div style={{ padding: 40, textAlign: "center", color: C.t2 }}><LoaderCircle size={18} className="spin" /></div>
          ) : (
            <>
              {/* CONTACTOS */}
              <Seccion
                icono={Phone}
                titulo={`Contactos${contactos.length ? ` · ${contactos.length}` : ""}`}
                extra={(
                  <button type="button" title="Agregar contacto"
                    onClick={() => setContactos((a) => [...a, { nombre: "", rol: "", telefono: "", orden: a.length }])}
                    style={{ background: tinta(C.blue, 0.1), border: `1px solid ${tinta(C.blue, 0.28)}`, color: C.blue, borderRadius: 7, padding: "4px 9px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <UserPlus size={11} /> Sumar
                  </button>
                )}
              >
                {contactos.length ? contactos.map((c, i) => (
                  <FilaContacto
                    key={c.id || `nuevo-${i}`}
                    contacto={c}
                    onGuardar={async (datos) => {
                      const id = await guardarContacto(barco.id, datos);
                      setContactos((actual) => actual.map((x, k) => (k === i ? { ...datos, id } : x)));
                    }}
                    onBorrar={async () => {
                      if (c.id) await borrarContacto(c.id).catch((e) => toast.error(e?.message || "No se pudo borrar."));
                      setContactos((actual) => actual.filter((_, k) => k !== i));
                    }}
                  />
                )) : (
                  <div style={{ fontSize: 12, color: C.border2, lineHeight: 1.5 }}>
                    Nadie cargado. El dueño, el marinero, quien abra la puerta: el que va necesita a quién llamar.
                  </div>
                )}
              </Seccion>

              {/* ACCESO */}
              <Seccion icono={Clock} titulo="Cuándo se puede entrar">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <span style={LBL}>Días</span>
                    <input value={acceso.acceso_dias} placeholder="Lunes a viernes"
                      onChange={(e) => setAcceso((a) => ({ ...a, acceso_dias: e.target.value }))}
                      onBlur={guardarAccesoSiCambio} style={INP} />
                  </div>
                  <div>
                    <span style={LBL}>Horario</span>
                    <input value={acceso.acceso_horario} placeholder="8 a 17"
                      onChange={(e) => setAcceso((a) => ({ ...a, acceso_horario: e.target.value }))}
                      onBlur={guardarAccesoSiCambio} style={INP} />
                  </div>
                </div>
                <span style={LBL}>Cómo se pasa la guardia</span>
                <textarea value={acceso.acceso_notas} rows={2}
                  placeholder="A quién avisar, con cuánta anticipación, qué documentación piden en la entrada."
                  onChange={(e) => setAcceso((a) => ({ ...a, acceso_notas: e.target.value }))}
                  onBlur={guardarAccesoSiCambio}
                  style={{ ...INP, resize: "vertical", lineHeight: 1.5 }} />
              </Seccion>

              {/* FOTOS */}
              <Seccion
                icono={ImagePlus}
                titulo={`Fotos de la embarcación${fotos.length ? ` · ${fotos.length}` : ""}`}
                extra={(
                  <label style={{ background: "var(--panel)", border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 7, padding: "4px 9px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {subiendo === "foto" ? <LoaderCircle size={11} className="spin" /> : <Plus size={11} />} Subir
                    <input type="file" accept="image/*" multiple hidden
                      onChange={(e) => { subir(e.target.files, "foto"); e.target.value = ""; }} />
                  </label>
                )}
              >
                {fotos.length ? (
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {fotos.map((f) => (
                      <div key={f.id} style={{ position: "relative" }}>
                        <button type="button" onClick={() => setMirando(f)}
                          style={{ width: 92, height: 70, borderRadius: 8, overflow: "hidden", padding: 0, border: `1px solid ${C.b0}`, background: "var(--panel)", cursor: "zoom-in", display: "block" }}>
                          <img src={f.url} alt={f.nombre || "foto"} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </button>
                        <button type="button" onClick={() => quitarAdjunto(f)} aria-label="Borrar foto"
                          style={{ position: "absolute", top: 3, right: 3, border: "none", background: "rgba(6,10,20,.75)", color: "#fff", borderRadius: 6, width: 19, height: 19, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}>
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.border2, lineHeight: 1.5 }}>
                    Ninguna. Una foto del barco y de dónde está amarrado le ahorra al técnico dar vueltas por el muelle.
                  </div>
                )}
              </Seccion>

              {/* PAPELES */}
              <Seccion
                icono={Paperclip}
                titulo={`Papeles${papeles.length ? ` · ${papeles.length}` : ""}`}
                extra={(
                  <label style={{ background: "var(--panel)", border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 7, padding: "4px 9px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {subiendo === "documento" ? <LoaderCircle size={11} className="spin" /> : <Plus size={11} />} Subir
                    <input type="file" multiple hidden
                      onChange={(e) => { subir(e.target.files, "documento"); e.target.value = ""; }} />
                  </label>
                )}
              >
                {papeles.length ? papeles.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, background: "var(--panel)", border: `1px solid ${C.b0}`, marginBottom: 6 }}>
                    <FileText size={13} color={C.t1} style={{ flexShrink: 0 }} />
                    <a href={p.url} target="_blank" rel="noreferrer"
                      style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.t0, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.nombre || "archivo"}
                    </a>
                    <button type="button" title="Copiar el link para mandarlo"
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(p.url); toast.success("Link copiado."); }
                        catch { toast.error("No se pudo copiar."); }
                      }}
                      style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t1, width: 26, height: 26, borderRadius: 6, cursor: "pointer", display: "grid", placeItems: "center" }}>
                      <Copy size={11} />
                    </button>
                    <button type="button" onClick={() => quitarAdjunto(p)} aria-label="Borrar"
                      style={{ background: "transparent", border: "none", color: C.t2, cursor: "pointer", padding: 3, display: "flex" }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )) : (
                  <div style={{ fontSize: 12, color: C.border2, lineHeight: 1.5 }}>
                    Ninguno. Acá va el seguro que piden en la guardia, para tenerlo a mano y poder mandarlo.
                  </div>
                )}
              </Seccion>
            </>
          )}
        </div>

        {/* Lo que se le manda al técnico */}
        <div style={{ borderTop: `1px solid ${C.b0}`, padding: 14, flexShrink: 0, background: "var(--panel)" }}>
          <button type="button" onClick={copiarFicha}
            style={{ width: "100%", background: tinta(C.blue, 0.14), border: `1px solid ${tinta(C.blue, 0.4)}`, color: C.blue, borderRadius: 9, padding: "11px 14px", fontSize: 13, fontWeight: 850, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: C.sans }}>
            <Copy size={14} /> Copiar la ficha para el técnico
          </button>
          <div style={{ color: C.t2, fontSize: 11, marginTop: 7, lineHeight: 1.45, textAlign: "center" }}>
            Se copia con el link del GPS, los teléfonos, el horario de entrada y los papeles. Listo para pegar en un WhatsApp.
          </div>
        </div>
      </div>
    </div>
  );
}
