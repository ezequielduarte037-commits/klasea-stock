import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, CreditCard, HardHat, Loader2, X } from "lucide-react";
import { C } from "@/theme";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import useNfcBridge from "@/features/panol/useNfcBridge";
import { normalizeNfcUid } from "@/features/rrhh/api";
import { sedeDelEquipo } from "@/features/consumibles/api";
import { fetchExternos } from "@/features/consumibles/mostrador/mostradorApi";
import AutorizarTecnica from "@/features/panol/autorizacion/AutorizarTecnica";
import { altaExternoConTarjeta, buscarAsignacionPorUid } from "@/features/panol/tarjetasNfcApi";

const INPUT = {
  width: "100%", boxSizing: "border-box", minHeight: 44, border: `1px solid ${C.border}`, borderRadius: 10,
  background: C.panel, color: C.text, padding: "9px 11px", outline: "none", fontFamily: C.sans, fontSize: 13,
};
const LBL = { display: "block", marginBottom: 6, color: C.dim, fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" };

function nuevoId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Externo que no está en RRHH (herrero, vidriero, instalador): se carga con su
 * empresa y se le da la tarjeta en el mismo paso. Con el PIN de Técnica, salvo
 * que el usuario sea de Técnica. Queda provisorio para que RRHH complete datos.
 */
export default function AltaExternoTarjeta({ necesitaPin, onListo, onCancelar, toast }) {
  const [id] = useState(nuevoId);
  const [nombre, setNombre] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [dni, setDni] = useState("");
  const [uid, setUid] = useState("");
  const [conflicto, setConflicto] = useState(null);
  const [validando, setValidando] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [pidiendoPin, setPidiendoPin] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetchExternos().then((x) => setEmpresas(x.empresas ?? [])).catch(() => setEmpresas([]));
  }, []);

  const leer = useCallback(async (raw) => {
    const clean = normalizeNfcUid(raw);
    if (clean.length < 4) return;
    setUid(clean);
    setConflicto(null);
    setValidando(true);
    try {
      const duenio = await buscarAsignacionPorUid(clean);
      setConflicto(duenio || null);
    } catch (error) {
      toast?.error(error.message || "No se pudo validar la tarjeta.");
    } finally {
      setValidando(false);
    }
  }, [toast]);

  useNfcBridge({ enabled: !guardando, onUid: leer });
  useKeyboardWedge({ enabled: !guardando, ignoreEditable: true, minLength: 4, timeoutMs: 70, onScan: leer });

  const dniLimpio = dni.replace(/\D/g, "");
  const faltan = [
    nombre.trim().length < 3 ? "nombre y apellido" : null,
    empresa.trim().length < 2 ? "empresa" : null,
    dniLimpio && !/^\d{7,8}$/.test(dniLimpio) ? "un DNI de 7 u 8 números" : null,
    !uid || conflicto || validando ? "la tarjeta" : null,
  ].filter(Boolean);
  const listo = !faltan.length && !guardando;

  async function crear(autorizacionId = null) {
    setGuardando(true);
    try {
      const emp = await altaExternoConTarjeta({
        id, nombre: nombre.trim(), empresa: empresa.trim(), dni: dniLimpio || null,
        sede: sedeDelEquipo(), uid, autorizacionId,
      });
      toast?.success(`${emp?.nombre || nombre.trim()} ya puede retirar con su tarjeta.`);
      onListo?.(emp);
    } catch (error) {
      toast?.error(error.message || "No se pudo cargar el externo.");
      setPidiendoPin(false);
    } finally {
      setGuardando(false);
    }
  }

  function pedir() {
    if (!listo) return;
    if (necesitaPin) setPidiendoPin(true);
    else crear(null);
  }

  return (
    <section className="nfc-card" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "14px 15px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 9, background: C.cyanL, color: C.cyan }}><HardHat size={16} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Externo nuevo con tarjeta</div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Herreros, vidrieros, instaladores. RRHH completa los datos después.</div>
        </div>
        <button type="button" className="ui-btn" onClick={onCancelar} disabled={guardando} aria-label="Cerrar"><X size={14} /></button>
      </div>

      <div style={{ padding: 15, display: "grid", gap: 12 }}>
        <div>
          <label htmlFor="ext-nombre" style={LBL}>Apellido y nombre</label>
          <input id="ext-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} autoComplete="off" style={INPUT} autoFocus />
        </div>
        <div>
          <label htmlFor="ext-empresa" style={LBL}>Empresa</label>
          <input id="ext-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={80} autoComplete="off" list="ext-empresas" style={INPUT} />
          <datalist id="ext-empresas">
            {empresas.map((x) => <option key={x.id ?? x.nombre} value={x.nombre} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="ext-dni" style={LBL}>DNI (si lo tiene)</label>
          <input id="ext-dni" value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="off" style={{ ...INPUT, fontFamily: C.mono }} />
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
          border: `1px solid ${conflicto ? C.redB : uid ? C.greenB : C.border}`, background: conflicto ? C.redL : uid ? C.greenL : C.panel,
        }}>
          {validando ? <Loader2 size={16} className="nfc-gira" style={{ color: C.blue }} /> : uid && !conflicto ? <BadgeCheck size={16} style={{ color: C.green }} /> : <CreditCard size={16} style={{ color: conflicto ? C.red : C.dim }} />}
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: conflicto ? C.red : C.text }}>
            {conflicto
              ? <>Esa tarjeta ya es de <b>{conflicto.nombre}</b>. Usá otra.</>
              : uid
                ? <>Tarjeta lista <span style={{ fontFamily: C.mono, color: C.dim }}>…{uid.slice(-6)}</span></>
                : "Apoyá la tarjeta nueva en el lector."}
          </div>
        </div>

        {pidiendoPin ? (
          <AutorizarTecnica
            titulo={`Dar tarjeta a ${nombre.trim()}`}
            detalle="Cargar un externo y darle tarjeta lo autoriza alguien de Técnica con su PIN."
            tipo="tarjeta"
            sede={sedeDelEquipo()}
            motivo={`Externo nuevo: ${nombre.trim()} (${empresa.trim()})`}
            onAutorizado={(aut) => crear(aut.id)}
            onCancelar={() => setPidiendoPin(false)}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 160, fontSize: 11.5, color: C.dim }}>
              {faltan.length ? `Falta ${faltan.join(", ")}.` : necesitaPin ? "Al crear, autoriza Técnica con su PIN." : "Listo para crear."}
            </span>
            <button type="button" className="ui-btn ui-btn-primario" disabled={!listo} onClick={pedir}>
              {guardando ? <Loader2 size={15} className="nfc-gira" /> : <HardHat size={15} />}
              {guardando ? "Creando…" : "Crear y dar tarjeta"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
