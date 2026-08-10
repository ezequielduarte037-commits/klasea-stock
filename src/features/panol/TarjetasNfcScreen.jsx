import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, BadgeCheck, Camera, CreditCard, IdCard, Nfc,
  Loader2, RefreshCw, Search, ShieldCheck, Trash2, UserRound, Wifi, WifiOff,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import CapturaFotoModal from "@/components/CapturaFotoModal";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import useNfcBridge from "@/features/panol/useNfcBridge";
import { normalizeNfcUid } from "@/features/rrhh/api";
import {
  asignarTarjetaNfc,
  buscarAsignacionPorUid,
  buscarEmpleadoHabilitadoPorDni,
  desvincularTarjetaNfc,
  subirFotoNfcEmpleado,
} from "@/features/panol/tarjetasNfcApi";

const INPUT = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 42,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  background: C.panel,
  color: C.text,
  padding: "9px 11px",
  outline: "none",
  fontFamily: C.sans,
  fontSize: 13,
};

function initials(nombre) {
  return String(nombre ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function Avatar({ empleado, preview, size = 104 }) {
  const foto = preview || empleado?.foto_url;
  return (
    <div style={{
      width: size, height: size, borderRadius: 24, overflow: "hidden", flexShrink: 0,
      display: "grid", placeItems: "center", border: `1px solid ${C.border2}`,
      background: "linear-gradient(135deg,var(--blue-soft),var(--green-soft))",
      color: C.blue, fontSize: 28, fontWeight: 950,
    }}>
      {foto
        ? <img src={foto} alt={`Foto de ${empleado?.nombre || "empleado"}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initials(empleado?.nombre)}
    </div>
  );
}

function Paso({ numero, titulo, listo, activo }) {
  const color = listo ? C.green : activo ? C.blue : C.dim;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, minWidth: 0,
      padding: "9px 11px", borderRadius: 11,
      border: `1px solid ${listo ? C.greenB : activo ? C.blueB : C.border}`,
      background: listo ? C.greenL : activo ? C.blueL : C.panel,
    }}>
      <span style={{
        width: 25, height: 25, flexShrink: 0, display: "grid", placeItems: "center",
        borderRadius: 8, background: color, color: "#fff", fontFamily: C.mono,
        fontSize: 11, fontWeight: 950,
      }}>
        {listo ? <BadgeCheck size={14} /> : numero}
      </span>
      <span style={{ minWidth: 0, color, fontSize: 11.5, fontWeight: 850 }}>{titulo}</span>
    </div>
  );
}

function estadoBridge(nfc) {
  if (nfc.connected) return { color: C.green, bg: C.greenL, border: C.greenB, label: "Lector conectado", Icon: Wifi };
  if (nfc.status === "connecting") return { color: C.blue, bg: C.blueL, border: C.blueB, label: "Buscando lector…", Icon: RefreshCw };
  return { color: C.violet, bg: C.violetL, border: C.violetB, label: "Lector no detectado", Icon: WifiOff };
}

export default function TarjetasNfcScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const [dni, setDni] = useState("");
  const [empleado, setEmpleado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [uid, setUid] = useState("");
  const [validandoUid, setValidandoUid] = useState(false);
  const [conflicto, setConflicto] = useState(null);
  const [foto, setFoto] = useState(null);
  const [camara, setCamara] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [completado, setCompletado] = useState(false);

  useEffect(() => () => {
    if (foto?.url) URL.revokeObjectURL(foto.url);
  }, [foto]);

  const procesarUid = useCallback(async (rawUid) => {
    const clean = normalizeNfcUid(rawUid);
    if (!clean || clean.length < 4) return;
    if (!empleado?.empleado_id) {
      toast.error("Primero buscá a la persona por DNI.");
      return;
    }

    setUid(clean);
    setConflicto(null);
    setValidandoUid(true);
    try {
      const duenio = await buscarAsignacionPorUid(clean);
      if (duenio && duenio.empleado_id !== empleado.empleado_id) setConflicto(duenio);
      else if (duenio) toast.info?.("Esta tarjeta ya pertenece a la persona seleccionada.");
    } catch (error) {
      toast.error(error.message || "No se pudo validar la tarjeta.");
    } finally {
      setValidandoUid(false);
    }
  }, [empleado?.empleado_id, toast]);

  const nfc = useNfcBridge({ enabled: !!empleado, onUid: procesarUid });
  const bridge = estadoBridge(nfc);

  useKeyboardWedge({
    enabled: !!empleado,
    ignoreEditable: true,
    minLength: 4,
    timeoutMs: 70,
    onScan: procesarUid,
  });

  const uidActual = normalizeNfcUid(empleado?.nfc_uid);
  const uidLimpio = normalizeNfcUid(uid);
  const tarjetaLista = !!uidLimpio && !conflicto && !validandoUid;
  const cambiaTarjeta = !!uidActual && !!uidLimpio && uidActual !== uidLimpio;
  const tarjetaNueva = tarjetaLista && !uidActual;
  const soloActualizaFoto = !!foto?.blob && !!uidActual && uidActual === uidLimpio;
  const hayCambio = tarjetaNueva || cambiaTarjeta || !!foto?.blob;
  const fotoPreview = foto?.url || "";
  const puedeGuardar = !!empleado && tarjetaLista && hayCambio && !guardando;

  const pasos = useMemo(() => ({
    persona: !!empleado,
    tarjeta: tarjetaLista,
    foto: !!fotoPreview || !!empleado?.foto_url,
  }), [empleado, fotoPreview, tarjetaLista]);

  function limpiarSeleccion() {
    setEmpleado(null);
    setUid("");
    setConflicto(null);
    setFoto(null);
    setCompletado(false);
  }

  async function buscar(event) {
    event?.preventDefault();
    const clean = dni.replace(/\D/g, "");
    if (!/^\d{5,10}$/.test(clean)) {
      toast.error("Ingresá un DNI válido.");
      return;
    }
    setBuscando(true);
    limpiarSeleccion();
    try {
      const encontrado = await buscarEmpleadoHabilitadoPorDni(clean);
      if (!encontrado) {
        toast.error("Ese DNI no figura como empleado activo en RRHH.");
        return;
      }
      setEmpleado(encontrado);
      setUid(normalizeNfcUid(encontrado.nfc_uid));
      window.requestAnimationFrame(() => document.activeElement?.blur?.());
    } catch (error) {
      toast.error(error.message || "No se pudo buscar el empleado.");
    } finally {
      setBuscando(false);
    }
  }

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    try {
      let fotoUrl = null;
      if (foto?.blob) fotoUrl = await subirFotoNfcEmpleado(empleado.empleado_id, foto.blob);
      const actualizado = await asignarTarjetaNfc({
        empleadoId: empleado.empleado_id,
        uid: uidLimpio,
        fotoUrl,
      });
      setEmpleado(actualizado);
      setFoto(null);
      setCompletado(true);
      toast.success(
        soloActualizaFoto
          ? "Foto guardada sin modificar la tarjeta NFC."
          : cambiaTarjeta
            ? "Tarjeta reemplazada correctamente."
            : "Tarjeta asignada correctamente.",
      );
    } catch (error) {
      toast.error(error.message || "No se pudo asignar la tarjeta.");
    } finally {
      setGuardando(false);
    }
  }

  async function desvincular() {
    if (!empleado?.nfc_uid) return;
    if (!window.confirm(`¿Desvincular la tarjeta de ${empleado.nombre}?\n\nLa tarjeta quedará disponible para otra persona.`)) return;
    setGuardando(true);
    try {
      await desvincularTarjetaNfc(empleado.empleado_id);
      setEmpleado((actual) => actual ? { ...actual, nfc_uid: null, nfc_asignado_at: null } : actual);
      setUid("");
      setCompletado(false);
      toast.success("Tarjeta desvinculada.");
    } catch (error) {
      toast.error(error.message || "No se pudo desvincular la tarjeta.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <style>{`
        .nfc-card{transition:border-color .16s ease,box-shadow .16s ease}
        .nfc-card:focus-within{border-color:var(--blue-border)!important;box-shadow:0 0 0 3px var(--blue-soft)}
        .nfc-btn{transition:transform .14s ease,filter .14s ease}
        .nfc-btn:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.06)}
        @media(prefers-reduced-motion:reduce){.nfc-card,.nfc-btn{transition:none!important}}
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px minmax(0,1fr)", height: "100%" }}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={{ minWidth: 0, minHeight: 0, overflowY: "auto" }}>
          <header style={{
            minHeight: 72, padding: isMobile ? "12px 12px 12px 58px" : "14px 22px",
            borderBottom: `1px solid ${C.border}`, background: C.topbar,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <Link to="/inicio-panol" aria-label="Volver al inicio de Pañol" style={{
              width: 34, height: 34, display: "grid", placeItems: "center", flexShrink: 0,
              borderRadius: 9, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.dim,
            }}>
              <ArrowLeft size={16} />
            </Link>
            <span style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: C.violetL, color: C.violet, border: `1px solid ${C.violetB}`, flexShrink: 0 }}>
              <Nfc size={20} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 950, color: C.text }}>Asignar tarjeta NFC</h1>
              <div style={{ marginTop: 3, fontSize: 11.5, color: C.dim }}>Solo se pueden vincular personas existentes y activas en RRHH.</div>
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 30, padding: "0 10px",
              borderRadius: 999, border: `1px solid ${bridge.border}`, background: bridge.bg, color: bridge.color,
              fontSize: 10.5, fontWeight: 850, whiteSpace: "nowrap",
            }}>
              <bridge.Icon size={13} /> {bridge.label}
            </span>
          </header>

          <div style={{ width: "min(1080px,100%)", margin: "0 auto", padding: isMobile ? "14px 12px 36px" : "20px 22px 44px", boxSizing: "border-box" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: 14 }}>
              <Paso numero="1" titulo="Buscar por DNI" listo={pasos.persona} activo={!pasos.persona} />
              <Paso numero="2" titulo="Leer tarjeta" listo={pasos.tarjeta} activo={pasos.persona && !pasos.tarjeta} />
              <Paso numero="3" titulo="Foto opcional" listo={pasos.foto} activo={pasos.tarjeta && !pasos.foto} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(290px,.7fr) minmax(0,1.3fr)", gap: 12, alignItems: "start" }}>
              <section className="nfc-card" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "14px 15px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 9, background: C.blueL, color: C.blue }}><IdCard size={16} /></span>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 900 }}>Identificar persona</div>
                    <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>El DNI debe existir en la lista de empleados.</div>
                  </div>
                </div>
                <form onSubmit={buscar} style={{ padding: 15 }}>
                  <label htmlFor="nfc-dni" style={{ display: "block", color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 6 }}>DNI</label>
                  <div style={{ display: "flex", gap: 7 }}>
                    <input
                      id="nfc-dni"
                      value={dni}
                      onChange={(event) => setDni(event.target.value.replace(/\D/g, "").slice(0, 10))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Ej: 32123456"
                      style={{ ...INPUT, fontFamily: C.mono, fontSize: 15 }}
                    />
                    <button type="submit" className="nfc-btn" disabled={buscando} style={{
                      width: 44, display: "grid", placeItems: "center", border: "none", borderRadius: 10,
                      background: buscando ? C.panel2 : C.blue, color: buscando ? C.dim : "#fff",
                      cursor: buscando ? "default" : "pointer",
                    }}>
                      {buscando ? <Loader2 size={17} className="spin" /> : <Search size={17} />}
                    </button>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 7, color: C.dim, fontSize: 11.5, lineHeight: 1.45 }}>
                    <ShieldCheck size={14} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />
                    Pañol no puede crear empleados ni modificar sus datos personales.
                  </div>
                </form>
              </section>

              {!empleado ? (
                <section style={{
                  minHeight: 390, border: `1px dashed ${C.border2}`, borderRadius: 14,
                  background: C.panel, display: "grid", placeItems: "center", padding: 24,
                }}>
                  <div style={{ textAlign: "center", maxWidth: 360 }}>
                    <UserRound size={34} style={{ color: C.dim }} />
                    <div style={{ color: C.text, fontSize: 15, fontWeight: 900, marginTop: 10 }}>Buscá una persona para comenzar</div>
                    <div style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.55, marginTop: 5 }}>Si el DNI no está en RRHH, la tarjeta no se puede asignar.</div>
                  </div>
                </section>
              ) : (
                <section className="nfc-card" style={{ border: `1px solid ${completado ? C.greenB : C.border}`, background: C.panelSolid, borderRadius: 14, overflow: "hidden" }}>
                  {completado && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 15px", background: C.greenL, color: C.green, borderBottom: `1px solid ${C.greenB}`, fontSize: 12.5, fontWeight: 850 }}>
                      <BadgeCheck size={17} /> Tarjeta lista para usar en egresos de Pañol.
                    </div>
                  )}

                  <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 14, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                    <Avatar empleado={empleado} preview={fotoPreview} />
                    <div style={{ minWidth: 180, flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: 950, color: C.text }}>{empleado.nombre}</div>
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 7 }}>
                        <span style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 8px", color: C.muted, fontSize: 10.5, fontFamily: C.mono }}>DNI {empleado.dni}</span>
                        {empleado.sede && <span style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 8px", color: C.muted, fontSize: 10.5 }}>{empleado.sede}</span>}
                        <span style={{ border: `1px solid ${C.greenB}`, background: C.greenL, borderRadius: 999, padding: "3px 8px", color: C.green, fontSize: 10.5, fontWeight: 800 }}>Empleado activo</span>
                      </div>
                      <button type="button" onClick={() => setCamara(true)} className="nfc-btn" style={{
                        marginTop: 12, minHeight: 34, display: "inline-flex", alignItems: "center", gap: 7,
                        border: `1px solid ${C.blueB}`, borderRadius: 9, background: C.blueL,
                        color: C.blue, padding: "0 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 850,
                      }}>
                        <Camera size={14} /> {empleado.foto_url || foto ? "Actualizar foto" : "Sacar foto"}
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 10, background: C.violetL, color: C.violet }}><Nfc size={18} /></span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 900 }}>Tarjeta NFC</div>
                        <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Apoyá la tarjeta sobre el lector ACR122U.</div>
                      </div>
                      {!nfc.connected && (
                        <button type="button" onClick={nfc.reconnect} style={{ border: `1px solid ${bridge.border}`, background: bridge.bg, color: bridge.color, borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontSize: 10.5, fontWeight: 850 }}>
                          Reintentar
                        </button>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 7 }}>
                      <div style={{ position: "relative", flex: 1 }}>
                        <CreditCard size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: tarjetaLista ? C.green : C.dim }} />
                        <input
                          value={uid}
                          onChange={(event) => { setUid(normalizeNfcUid(event.target.value)); setConflicto(null); setCompletado(false); }}
                          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); procesarUid(uid); } }}
                          placeholder="UID de tarjeta"
                          autoComplete="off"
                          style={{
                            ...INPUT, paddingLeft: 34, fontFamily: C.mono, letterSpacing: 0.8,
                            borderColor: conflicto ? C.redB : tarjetaLista ? C.greenB : C.border,
                          }}
                        />
                      </div>
                      <button type="button" onClick={() => procesarUid(uid)} disabled={!uidLimpio || validandoUid} className="nfc-btn" style={{
                        minWidth: 78, border: `1px solid ${C.border}`, borderRadius: 10,
                        background: C.panel, color: C.muted, cursor: uidLimpio && !validandoUid ? "pointer" : "default",
                        fontSize: 11.5, fontWeight: 850,
                      }}>
                        {validandoUid ? "Validando…" : "Validar"}
                      </button>
                    </div>

                    {conflicto && (
                      <div style={{ marginTop: 9, padding: "9px 11px", border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, fontSize: 12, lineHeight: 1.45 }}>
                        Esta tarjeta ya pertenece a <b>{conflicto.nombre}</b> (DNI {conflicto.dni}). Usá otra tarjeta o desvinculala desde esa persona.
                      </div>
                    )}
                    {!conflicto && cambiaTarjeta && (
                      <div style={{ marginTop: 9, padding: "9px 11px", border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, borderRadius: 10, fontSize: 12 }}>
                        Vas a reemplazar la tarjeta actual terminada en {uidActual.slice(-6)}.
                      </div>
                    )}
                    {!conflicto && tarjetaNueva && (
                      <div style={{ marginTop: 9, color: C.green, fontSize: 11.5, fontWeight: 800 }}>
                        <BadgeCheck size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Tarjeta disponible y lista para asignar.
                      </div>
                    )}
                    {!conflicto && tarjetaLista && uidActual === uidLimpio && (
                      <div style={{ marginTop: 9, color: C.green, fontSize: 11.5, fontWeight: 800 }}>
                        <BadgeCheck size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Esta es la tarjeta actualmente vinculada.
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: C.panel, flexWrap: "wrap" }}>
                    {empleado.nfc_uid && (
                      <button type="button" onClick={desvincular} disabled={guardando} style={{
                        minHeight: 38, display: "inline-flex", alignItems: "center", gap: 6,
                        border: `1px solid ${C.redB}`, borderRadius: 9, background: C.redL,
                        color: C.red, padding: "0 11px", cursor: guardando ? "default" : "pointer",
                        fontSize: 11.5, fontWeight: 850,
                      }}>
                        <Trash2 size={13} /> Desvincular actual
                      </button>
                    )}
                    <div style={{ flex: 1 }} />
                    {completado && (
                      <button type="button" onClick={() => { setDni(""); limpiarSeleccion(); }} style={{ minHeight: 38, border: `1px solid ${C.border}`, borderRadius: 9, background: C.panelSolid, color: C.muted, padding: "0 12px", cursor: "pointer", fontSize: 12, fontWeight: 800 }}>
                        Cargar otra persona
                      </button>
                    )}
                    <button type="button" onClick={guardar} disabled={!puedeGuardar} className="nfc-btn" style={{
                      minHeight: 40, display: "inline-flex", alignItems: "center", gap: 7,
                      border: "none", borderRadius: 10, padding: "0 16px",
                      background: puedeGuardar ? "linear-gradient(135deg,var(--violet),var(--blue))" : C.panel2,
                      color: puedeGuardar ? "#fff" : C.dim, cursor: puedeGuardar ? "pointer" : "default",
                      fontSize: 12.5, fontWeight: 900,
                    }}>
                      {guardando ? <Loader2 size={15} className="spin" /> : <Nfc size={16} />}
                      {guardando
                        ? "Guardando…"
                        : cambiaTarjeta
                          ? "Reemplazar tarjeta"
                          : uidActual && foto?.blob
                            ? "Guardar foto"
                            : uidActual
                              ? "Tarjeta ya asignada"
                              : "Asignar tarjeta"}
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </main>
      </div>

      <CapturaFotoModal
        open={camara}
        titulo={`Foto de ${empleado?.nombre || "empleado"}`}
        guardando={false}
        onClose={() => setCamara(false)}
        onCapturar={(blob) => {
          setFoto({ blob, url: URL.createObjectURL(blob) });
          setCamara(false);
          setCompletado(false);
        }}
      />
    </div>
  );
}
