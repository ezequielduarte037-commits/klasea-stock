import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Loader2, Nfc, RotateCcw, Search, UserCheck, X } from "lucide-react";
import { C } from "@/theme";
import useNfcBridge from "@/features/panol/useNfcBridge";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { buscarEmpleadoPorNfc, evaluarRetiro, normalizeNfcUid } from "@/features/rrhh/api";
import { fetchPersonasRetiro } from "@/features/panol/solicitudesPanolApi";
import { INPUT, LBL } from "@/features/produccion/comprasTokens";
import { Cta, Ghost, Pill } from "@/features/produccion/comprasUI";

// ─────────────────────────────────────────────────────────────────────────────
// Firma de retiro de una solicitud de pañol.
//
// El camino bueno es la tarjeta NFC: se apoya y queda registrado quién y cuándo
// sin que nadie escriba nada. Se usa el MISMO mecanismo que el egreso de
// materiales (useNfcBridge + useKeyboardWedge + buscarEmpleadoPorNfc), así que
// funciona con el puente local o con un lector que emula teclado.
//
// Pero el lector no siempre está en la máquina donde se carga la solicitud, y
// el pedido no puede quedar sin entregar por eso. Por eso hay una salida
// manual: se elige la persona de la lista de RRHH y queda guardado que fue
// manual (retirado_metodo = 'manual'), que es exactamente el dato que después
// se quiere poder discutir.
// ─────────────────────────────────────────────────────────────────────────────

const fechaHora = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })} · ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
};

/* ── comprobante ya registrado ────────────────────────────────────────────── */
function Comprobante({ solicitud, onAnular, puedeEditar }) {
  const porNfc = solicitud.retirado_metodo === "nfc";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      border: `1px solid ${C.greenB}`, background: C.greenL, borderRadius: 12, padding: "11px 13px",
    }}>
      <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 11, display: "grid", placeItems: "center", background: C.panelSolid, border: `1px solid ${C.greenB}`, color: C.green }}>
        <BadgeCheck size={17} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...LBL, color: C.green }}>Retirado</div>
        <div style={{ fontSize: 14.5, fontWeight: 900, color: C.text, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {solicitud.retirado_por_nombre}
        </div>
        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
          {solicitud.retirado_por_dni ? `DNI ${solicitud.retirado_por_dni} · ` : ""}
          {fechaHora(solicitud.retirado_at)}
        </div>
      </div>
      <Pill color={porNfc ? C.green : C.violet} soft={porNfc ? C.greenL : C.violetL} borde={porNfc ? C.greenB : C.violetB}>
        {porNfc ? <><Nfc size={10} /> NFC</> : <><UserCheck size={10} /> Manual</>}
      </Pill>
      {puedeEditar && <Ghost icon={RotateCcw} size="sm" tono="rojo" onClick={onAnular} title="Deshacer el retiro (sólo si se cargó por error)">Deshacer</Ghost>}
    </div>
  );
}

/* ── caja de firma ────────────────────────────────────────────────────────── */
export default function FirmaRetiroPanol({
  solicitud,
  onConfirmar,
  onAnular,
  puedeEditar = true,
  bloqueo = "",
  aviso = "",
  toast,
  // Materiales que se están retirando. Si vienen, al identificar a la persona se
  // consulta si le corresponden (su obra, su oficio) y se avisa. No bloquea.
  materialIds = [],
}) {
  const yaRetirado = !!solicitud?.retirado_at;

  const [empleado, setEmpleado] = useState(null);
  const [uid, setUid] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const [personas, setPersonas] = useState([]);
  const [manualId, setManualId] = useState("");
  const [filtro, setFiltro] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Resuelve una tarjeta contra el maestro de RRHH. Es la misma función que usa
  // el egreso de materiales, así que una tarjeta sirve en las dos pantallas.
  const resolver = useCallback(async (raw) => {
    const limpio = normalizeNfcUid(raw);
    if (!limpio) return;
    setUid(limpio);
    setBuscando(true);
    setError("");
    try {
      const emp = await buscarEmpleadoPorNfc(limpio);
      if (!emp) {
        setEmpleado(null);
        setError("Esa tarjeta no está asignada a nadie en RRHH.");
        return;
      }
      if (emp.activo === false) {
        setEmpleado(null);
        setError(`${emp.nombre} figura como inactivo en RRHH.`);
        return;
      }
      setEmpleado(emp);
      setManualId("");
    } catch (err) {
      setEmpleado(null);
      setError(err.message || "No se pudo leer la tarjeta.");
    } finally {
      setBuscando(false);
    }
  }, []);

  // El lector sólo escucha mientras la solicitud está sin retirar: si no, una
  // tarjeta apoyada de casualidad sobrescribiría un retiro ya firmado.
  const escuchando = !yaRetirado && puedeEditar && !bloqueo;

  useKeyboardWedge({ enabled: escuchando, onScan: resolver, minLength: 4, timeoutMs: 65 });
  const bridge = useNfcBridge({ enabled: escuchando, onUid: resolver });

  useEffect(() => {
    if (!escuchando) return;
    fetchPersonasRetiro().then(setPersonas).catch(() => setPersonas([]));
  }, [escuchando]);

  const visibles = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    if (!t) return personas.slice(0, 60);
    return personas.filter((p) => `${p.nombre} ${p.dni ?? ""}`.toLowerCase().includes(t)).slice(0, 60);
  }, [personas, filtro]);

  const manual = personas.find((p) => p.id === manualId) || null;
  const elegido = empleado || manual;
  const metodo = empleado ? "nfc" : "manual";

  // Reglas de retiro: se consulta recién cuando ya se sabe quién retira, porque
  // el veredicto depende de sus obras y su oficio. Si la migración todavía no
  // está aplicada, la API devuelve vacío y acá no se muestra nada.
  //
  // El resultado se guarda junto con la consulta que lo produjo: así no hay que
  // limpiar el estado al cambiar de persona —cosa que el compilador de React no
  // deja hacer dentro del efecto— y nunca se muestra un veredicto viejo.
  const [resultadoReglas, setResultadoReglas] = useState({ clave: "", filas: [] });
  const claveReglas = elegido?.id
    ? `${elegido.id}|${materialIds.filter(Boolean).slice().sort().join(",")}`
    : "";

  useEffect(() => {
    if (!claveReglas) return undefined;
    const ids = claveReglas.split("|")[1];
    if (!ids) return undefined;
    let vigente = true;
    evaluarRetiro(claveReglas.split("|")[0], ids.split(","))
      .then((filas) => {
        if (!vigente) return;
        setResultadoReglas({ clave: claveReglas, filas: filas.filter((f) => f.estado !== "ok" && f.estado !== "sin_datos") });
      })
      .catch(() => { if (vigente) setResultadoReglas({ clave: claveReglas, filas: [] }); });
    return () => { vigente = false; };
  }, [claveReglas]);

  const reparos = resultadoReglas.clave === claveReglas ? resultadoReglas.filas : [];

  async function confirmar() {
    if (!elegido || guardando) return;
    setGuardando(true);
    try {
      await onConfirmar({ empleado: elegido, metodo, nfcUid: empleado ? uid : null });
      setEmpleado(null);
      setManualId("");
      setUid("");
      setFiltro("");
    } catch (err) {
      toast?.error(err.message || "No se pudo registrar el retiro.");
    } finally {
      setGuardando(false);
    }
  }

  if (yaRetirado) {
    return <Comprobante solicitud={solicitud} onAnular={onAnular} puedeEditar={puedeEditar} />;
  }

  if (!puedeEditar) {
    return (
      <div style={{ fontSize: 12.5, color: C.dim, padding: "10px 2px" }}>
        Todavía nadie retiró este pedido.
      </div>
    );
  }

  if (bloqueo) {
    return (
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        border: `1px solid ${C.violetB}`, background: C.violetL,
        borderRadius: 12, padding: "11px 13px",
      }}>
        <AlertTriangle size={17} color={C.violet} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ ...LBL, color: C.violet }}>Retiro todavía bloqueado</div>
          <div style={{ color: C.text, fontSize: 12.5, lineHeight: 1.5, marginTop: 3 }}>{bloqueo}</div>
        </div>
      </div>
    );
  }

  const bridgeOk = bridge.status === "connected";
  const bridgeTexto = bridgeOk
    ? "Lector NFC conectado · apoyá la tarjeta"
    : bridge.status === "connecting"
      ? "Conectando el lector NFC…"
      : "Lector NFC desconectado · usá el UID a mano o elegí de la lista";

  return (
    <div style={{
      border: `1px solid ${elegido ? C.greenB : C.border}`,
      background: elegido ? C.greenL : C.panel,
      borderRadius: 12, padding: 12, display: "grid", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...LBL }}>Firma de retiro</span>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 750,
          color: bridgeOk ? C.green : bridge.status === "connecting" ? C.blue : C.violet,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: "currentColor", flexShrink: 0 }} />
          {bridgeTexto}
        </span>
        {!bridgeOk && (
          <button
            type="button"
            onClick={bridge.reconnect}
            style={{ border: "none", background: "transparent", color: C.blue, fontSize: 11, fontWeight: 800, cursor: "pointer", padding: 0 }}
          >
            Reintentar
          </button>
        )}
      </div>

      {aviso && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 7,
          borderRadius: 9, padding: "7px 9px",
          border: `1px solid ${C.violetB}`, background: C.violetL,
          color: C.muted, fontSize: 11.5, lineHeight: 1.45,
        }}>
          <AlertTriangle size={13} color={C.violet} style={{ flexShrink: 0, marginTop: 1 }} />
          {aviso}
        </div>
      )}

      {/* Reparos de la regla de retiro. Se avisa y se deja seguir: bloquear haría
          que el pañol busque la vuelta —"que lo retire otro"— y ahí se pierde
          justo el registro que esto viene a ganar. */}
      {reparos.length > 0 && elegido && (
        <div style={{
          display: "grid", gap: 5,
          borderRadius: 9, padding: "8px 10px",
          border: `1px solid ${C.cyanB}`, background: C.cyanL,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.cyan, fontSize: 11.5, fontWeight: 900 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            {elegido.nombre} está retirando {reparos.length} {reparos.length === 1 ? "material que no le corresponde" : "materiales que no le corresponden"}
          </div>
          <div style={{ display: "grid", gap: 2 }}>
            {[...new Set(reparos.map((r) => r.motivo).filter(Boolean))].map((motivo) => (
              <div key={motivo} style={{ color: C.muted, fontSize: 11, lineHeight: 1.4 }}>· {motivo}</div>
            ))}
          </div>
          <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.4 }}>
            Se puede confirmar igual. Queda registrado quién retiró y qué se llevó.
          </div>
        </div>
      )}

      {/* persona resuelta */}
      {elegido && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.panelSolid, border: `1px solid ${C.greenB}`, borderRadius: 10, padding: "9px 11px" }}>
          <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 10, display: "grid", placeItems: "center", background: C.greenL, color: C.green }}>
            {empleado ? <Nfc size={15} /> : <UserCheck size={15} />}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{elegido.nombre}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>
              {elegido.dni ? `DNI ${elegido.dni}` : "sin DNI cargado"}
              {empleado ? ` · tarjeta ${uid}` : " · confirmación manual"}
            </div>
          </div>
          <Ghost icon={X} size="sm" onClick={() => { setEmpleado(null); setManualId(""); setUid(""); setError(""); }}>Cambiar</Ghost>
        </div>
      )}

      {!elegido && (
        <>
          {/* UID a mano: sirve cuando el lector no está en esta máquina */}
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={uid}
              onChange={(e) => setUid(normalizeNfcUid(e.target.value))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); resolver(uid); } }}
              placeholder="UID de la tarjeta"
              style={{ ...INPUT, flex: "1 1 150px", minWidth: 130, padding: "7px 10px", fontSize: 12, fontFamily: C.mono }}
            />
            <Ghost icon={buscando ? Loader2 : Nfc} size="sm" onClick={() => resolver(uid)} disabled={!uid || buscando}>Validar tarjeta</Ghost>
          </div>

          {/* alternativa manual */}
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 11.5, color: C.dim }}>o elegí a la persona de la lista (queda registrado como retiro manual):</span>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1 1 150px", minWidth: 130 }}>
                <Search size={13} color={C.dim} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  placeholder="Buscar por nombre o DNI…"
                  style={{ ...INPUT, padding: "7px 10px 7px 28px", fontSize: 12 }}
                />
              </div>
              <select
                value={manualId}
                onChange={(e) => { setManualId(e.target.value); setError(""); }}
                style={{ ...INPUT, flex: "1 1 180px", minWidth: 150, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}
              >
                <option value="">— Elegí a quien retira —</option>
                {visibles.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.dni ? ` · ${p.dni}` : ""}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {error && <div style={{ fontSize: 11.5, color: C.red, fontWeight: 700 }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 120, fontSize: 11.5, color: C.dim }}>
          Al confirmar, la solicitud queda entregada y el comprobante sale en la hoja impresa.
        </span>
        <Cta
          icon={guardando ? Loader2 : BadgeCheck}
          tono={metodo === "nfc" ? "azul" : "violeta"}
          onClick={confirmar}
          disabled={!elegido || guardando}
        >
          Confirmar retiro
        </Cta>
      </div>
    </div>
  );
}
