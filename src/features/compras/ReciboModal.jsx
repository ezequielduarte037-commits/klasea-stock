import { useEffect, useMemo, useState } from "react";
import { Printer, FileDown, X, Receipt, Save, Check } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";
import { descargarReciboPdf, imprimirRecibo, importeEnLetras, normalizeRecibo, numeroRecibo } from "@/features/compras/reciboPdf";

// Recibo de caja chica. Reemplaza el talonario que se llenaba a mano: se
// completa acá y sale impreso con todo puesto, listo para que lo firmen.
//
// El emisor y el lugar quedan guardados en el navegador porque son siempre los
// mismos: escribirlos en cada recibo era parte del tiempo que se perdía.

const LS_EMISOR = "klasea.recibo.emisor";
const LS_LUGAR = "klasea.recibo.lugar";
const LS_COPIAS = "klasea.recibo.copias";

function readLs(key, fallback = "") {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLs(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* modo privado: el recibo sale igual */
  }
}

function parseImporte(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value || "").trim().replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!text) return 0;
  let normalized = text;
  if (text.includes(",") && text.includes(".")) {
    normalized = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    normalized = text.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(value, moneda = "ARS") {
  const n = Number(value || 0);
  const text = n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === "USD" ? `US$ ${text}` : `$ ${text}`;
}

export default function ReciboModal({
  initial = {},
  // Cuando el recibo se arma suelto (no sale de un movimiento ya cargado)
  // se ofrece dejarlo asentado en la caja: pagar y no registrarlo es
  // justamente el agujero que la caja chica no perdona.
  puedeRegistrar = false,
  cajas = [],
  cajaIdInicial = "",
  onRegistrar,
  onEmitido,
  onClose,
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [copias, setCopias] = useState(() => (readLs(LS_COPIAS, "2") === "1" ? 1 : 2));
  const [registrar, setRegistrar] = useState(Boolean(puedeRegistrar));
  const [cajaId, setCajaId] = useState(() => cajaIdInicial || cajas[0]?.id || "");
  // Una vez asentado no se vuelve a asentar: imprimir dos veces no puede
  // duplicar el gasto en la caja. Guardamos el id del movimiento creado para
  // poder pasarlo de borrador a emitido si después se imprime.
  const [asentado, setAsentado] = useState(null); // null | { entryId }
  const [form, setForm] = useState(() => ({
    fecha: initial.fecha || new Date().toISOString().slice(0, 10),
    emisor: initial.emisor || readLs(LS_EMISOR, ""),
    lugar: initial.lugar || readLs(LS_LUGAR, ""),
    proveedor: initial.proveedor || "",
    dni: initial.dni || "",
    concepto: initial.concepto || "",
    centroCosto: initial.centroCosto || "",
    importe: initial.importe != null ? String(initial.importe) : "",
    moneda: initial.moneda === "USD" ? "USD" : "ARS",
  }));

  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = (e) => setIsMobile(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patch(next) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  const importe = parseImporte(form.importe);
  const enLetras = useMemo(() => importeEnLetras(importe, form.moneda), [importe, form.moneda]);

  // El número se calcula una sola vez: el que se guarda en la caja tiene que
  // ser el mismo que sale impreso, y reimprimir un movimiento tiene que dar
  // siempre el mismo número.
  const [semilla] = useState(() => initial.semilla || `${Date.now()}-${Math.random()}`);
  const numero = useMemo(
    () => initial.numero || numeroRecibo({ fecha: form.fecha, semilla }),
    [initial.numero, semilla, form.fecha],
  );

  // Cuántos renglones va a ocupar el concepto en el papel. Aproximado (~70
  // caracteres por renglón), pero alcanza para avisar antes de imprimir.
  const conceptoLineas = useMemo(() => {
    return form.concepto
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter(Boolean)
      .reduce((total, linea) => total + Math.max(1, Math.ceil(linea.length / 70)), 0);
  }, [form.concepto]);

  // Para dejarlo asentado alcanza con importe y concepto: el borrador existe
  // justamente para registrar el gasto antes de tener todos los datos.
  // Para imprimirlo, en cambio, tiene que estar completo.
  const faltanteBorrador = !importe || importe <= 0
    ? "Cargá el importe."
    : !form.concepto.trim()
      ? "Escribí el concepto."
      : "";
  const faltante = faltanteBorrador || (!form.proveedor.trim() ? "Poné el proveedor." : "");

  function payload() {
    return normalizeRecibo({ ...form, importe, numero });
  }

  function recordarPreferencias() {
    writeLs(LS_EMISOR, form.emisor);
    writeLs(LS_LUGAR, form.lugar);
    writeLs(LS_COPIAS, copias);
  }

  function movimiento() {
    return {
      fecha: form.fecha,
      proveedor: form.proveedor.trim(),
      // El movimiento de la caja es de una línea: si el concepto tiene
      // varios renglones, se juntan.
      detalle: form.concepto.split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean).join(" · "),
      centro_costo: form.centroCosto.trim(),
      importe,
      moneda: form.moneda,
      tipo: "egreso",
      notas: form.dni ? `DNI/CUIT ${form.dni}` : "",
    };
  }

  // Primero se asienta el movimiento y después sale el papel: si falla el
  // registro, mejor que no haya un recibo firmado sin respaldo en la caja.
  async function asentarSiCorresponde(estado, numero) {
    // El movimiento ya existe (vino de la tabla, o se guardó recién como
    // borrador): no se crea otro, sólo se deja constancia de que el papel salió.
    if (initial.entryId || asentado) {
      const entryId = initial.entryId || asentado?.entryId;
      if (estado !== "emitido" || !onEmitido || !entryId) return true;
      try {
        await onEmitido({ entryId, numero });
      } catch (error) {
        // Que no quede marcado es molesto; que no salga el recibo, peor.
        console.error("No se pudo marcar el recibo como emitido:", error);
      }
      return true;
    }

    if (!registrar || !puedeRegistrar || !onRegistrar) return true;
    try {
      const creado = await onRegistrar({ movimiento: movimiento(), cajaId: cajaId || null, recibo: { numero, estado } });
      setAsentado({ entryId: creado?.id || null });
      return true;
    } catch (error) {
      toast.error(error?.message || "No se pudo registrar el movimiento en la caja.");
      return false;
    }
  }

  // Confirmar sin imprimir: para cuando el papel ya salió por otro lado y lo
  // único que falta es que la caja deje de decir "borrador". Acá el error sí
  // se muestra: si no se pudo marcar, el usuario tiene que enterarse.
  async function confirmarEmitido() {
    if (!initial.entryId || !onEmitido) return;
    setBusy(true);
    try {
      await onEmitido({ entryId: initial.entryId, numero });
      toast.success(`Recibo ${numero} marcado como emitido.`);
      onClose?.();
    } catch (error) {
      toast.error(error?.message || "No se pudo marcar el recibo como emitido.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccion(accion) {
    const requisito = accion === "borrador" ? faltanteBorrador : faltante;
    if (requisito) {
      toast.warning(requisito);
      return;
    }
    setBusy(true);
    try {
      const data = payload();
      const ok = await asentarSiCorresponde(accion === "borrador" ? "borrador" : "emitido", data.numero);
      if (!ok) return;
      if (accion === "borrador") {
        toast.success(`Guardado en la caja como borrador (${data.numero}).`);
        onClose?.();
        return;
      }
      recordarPreferencias();
      if (accion === "imprimir") {
        const result = await imprimirRecibo(data, { copias });
        toast.success(result.impreso ? "Recibo listo para imprimir." : "El navegador bloqueó la impresión: te lo descargamos.");
      } else {
        await descargarReciboPdf(data, { copias });
        toast.success("Recibo descargado.");
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.message || "No se pudo generar el recibo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(15,23,42,0.55)", display: "grid", placeItems: "center", padding: 16, overflowY: "auto" }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(620px, 100%)",
          maxHeight: "92vh",
          overflowY: "auto",
          border: `1px solid ${C.border}`,
          background: C.panelSolid,
          borderRadius: 15,
          boxShadow: "0 28px 80px rgba(15,23,42,0.32)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
            <Receipt size={16} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>Recibo de caja chica</span>
              <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11, fontWeight: 800 }}>{numero}</span>
            </div>
            <div style={{ color: initial.estado === "borrador" ? C.blue : C.dim, fontSize: 11.5, marginTop: 2, fontWeight: initial.estado === "borrador" ? 800 : 600 }}>
              {initial.estado === "borrador"
                ? "Borrador: el gasto ya está en la caja. Se confirma al imprimirlo."
                : "Sale impreso con todo completo. A mano quedan sólo la firma y la aclaración."}
            </div>
          </div>
          <button type="button" onClick={onClose} style={iconBtn()} title="Cerrar">
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 11 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 9 }}>
            <Field label="Fecha">
              <input type="date" value={form.fecha} onChange={(e) => patch({ fecha: e.target.value })} style={inputStyle()} />
            </Field>
            <Field label="Lugar">
              <input value={form.lugar} onChange={(e) => patch({ lugar: e.target.value })} placeholder="Ej: Tigre" style={inputStyle()} />
            </Field>
          </div>

          <Field label="Recibí de">
            <input
              value={form.emisor}
              onChange={(e) => patch({ emisor: e.target.value })}
              placeholder="Opcional: quién entrega el dinero"
              style={inputStyle()}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: 9 }}>
            <Field label="Proveedor">
              <input value={form.proveedor} onChange={(e) => patch({ proveedor: e.target.value })} placeholder="Ej: Hugo flete, Casa Iriarte..." style={inputStyle()} />
            </Field>
            <Field label="DNI / CUIT">
              <input value={form.dni} onChange={(e) => patch({ dni: e.target.value })} placeholder="Opcional" style={inputStyle()} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr 1fr", gap: 9 }}>
            <Field label="Moneda">
              <select value={form.moneda} onChange={(e) => patch({ moneda: e.target.value })} style={inputStyle()}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </Field>
            <Field label="Importe">
              <input
                value={form.importe}
                onChange={(e) => patch({ importe: e.target.value })}
                placeholder="0"
                inputMode="decimal"
                style={{ ...inputStyle(), textAlign: "right", fontFamily: C.mono, fontWeight: 850 }}
              />
            </Field>
            <Field label="Centro de costo">
              <input value={form.centroCosto} onChange={(e) => patch({ centroCosto: e.target.value })} placeholder="Ej: 55-4, logística..." style={inputStyle()} />
            </Field>
          </div>

          <Field label="En concepto de">
            <textarea
              value={form.concepto}
              onChange={(e) => patch({ concepto: e.target.value })}
              placeholder={"Ej: Transporte jacuzzi\nRetiro de tanques en plegadora San Ginés (52-23)"}
              rows={4}
              style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.5 }}
            />
            <span style={{ color: conceptoLineas > 4 ? C.red : C.dim, fontSize: 11, fontWeight: 700 }}>
              {conceptoLineas > 4
                ? `Son ${conceptoLineas} renglones y en el recibo entran 4: juntá alguno.`
                : "Cada renglón sale como un renglón del recibo (entran 4)."}
            </span>
          </Field>

          {/* El importe en letras es lo que hace que el papel no se pueda
              retocar después. Se muestra antes de imprimir para poder leerlo. */}
          <div style={{ border: `1px solid ${C.blueB}`, background: C.blueL, borderRadius: 11, padding: "11px 13px", display: "grid", gap: 4 }}>
            <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Así sale en el recibo</div>
            <div style={{ color: C.text, fontSize: 12.5, fontWeight: 800, lineHeight: 1.35 }}>{enLetras}</div>
            <div style={{ color: importe > 0 ? C.text : C.dim, fontFamily: C.mono, fontSize: 21, fontWeight: 950 }}>
              Son {fmtMoney(importe, form.moneda)}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Copias</span>
              {[2, 1].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCopias(n)}
                  style={{
                    border: `1px solid ${copias === n ? C.blueB : C.border}`,
                    background: copias === n ? C.blueL : C.panel2,
                    color: copias === n ? C.blue : C.muted,
                    borderRadius: 999,
                    padding: "5px 12px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 850,
                    fontFamily: C.sans,
                  }}
                >
                  {n === 2 ? "Original + duplicado" : "Una sola"}
                </button>
              ))}
            </div>
          </div>

          {puedeRegistrar && (
            <div style={{ border: `1px solid ${registrar ? C.blueB : C.border}`, background: registrar ? C.blueL : C.panel2, borderRadius: 11, padding: "10px 12px", display: "grid", gap: 9 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={registrar}
                  onChange={(e) => setRegistrar(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--blue)" }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: C.text, fontSize: 12.5, fontWeight: 850 }}>
                    Registrar el egreso en caja chica
                  </span>
                  <span style={{ display: "block", color: C.dim, fontSize: 11.5, marginTop: 2, lineHeight: 1.35 }}>
                    Queda el movimiento con el número de recibo, así el papel y la caja coinciden.
                  </span>
                </span>
              </label>

              {registrar && (
                cajas.length ? (
                  <label style={{ display: "grid", gap: 5 }}>
                    <span style={{ color: C.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 850 }}>Caja</span>
                    <select value={cajaId} onChange={(e) => setCajaId(e.target.value)} style={inputStyle()}>
                      {cajas.map((caja) => (
                        <option key={caja.id} value={caja.id}>{caja.nombre}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.4 }}>
                    No hay ninguna caja abierta: se crea una al guardar.
                  </div>
                )
              )}

              {asentado && (
                <div style={{ color: C.green, fontSize: 11.5, fontWeight: 800 }}>
                  Ya quedó asentado en la caja. Imprimir de nuevo no lo duplica.
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 9, padding: "12px 16px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          <span style={{ color: faltante ? C.red : C.dim, fontSize: 11.5, fontWeight: faltante ? 800 : 600 }}>
            {faltante || "Listo para imprimir."}
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {initial.entryId && initial.estado === "borrador" && (
              <button
                type="button"
                onClick={confirmarEmitido}
                disabled={busy}
                style={ghostBtn(busy)}
                title="El papel ya salió: sacarle el estado de borrador en la caja"
              >
                <Check size={14} /> Confirmar sin imprimir
              </button>
            )}
            {puedeRegistrar && registrar && !asentado && (
              <button
                type="button"
                onClick={() => handleAccion("borrador")}
                disabled={busy || Boolean(faltanteBorrador)}
                style={ghostBtn(busy || Boolean(faltanteBorrador))}
                title="Deja el gasto asentado en la caja y el recibo pendiente de imprimir"
              >
                <Save size={14} /> Guardar borrador
              </button>
            )}
            <button type="button" onClick={() => handleAccion("descargar")} disabled={busy || Boolean(faltante)} style={ghostBtn(busy || Boolean(faltante))}>
              <FileDown size={14} /> Descargar
            </button>
            <button type="button" onClick={() => handleAccion("imprimir")} disabled={busy || Boolean(faltante)} style={primaryBtn(busy || Boolean(faltante))}>
              <Printer size={14} /> {busy ? "Generando…" : "Imprimir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ color: C.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.1, fontWeight: 850 }}>{label}</span>
      {children}
    </label>
  );
}

function inputStyle() {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${C.border}`,
    background: C.panelSolid2,
    color: C.text,
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 13,
    fontWeight: 650,
    outline: "none",
    fontFamily: C.sans,
  };
}

function primaryBtn(disabled = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: `1px solid ${disabled ? C.border : C.blueB}`,
    background: disabled ? C.panel2 : C.blue,
    color: disabled ? C.dim : "var(--inverse-text)",
    borderRadius: 9,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 850,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: C.sans,
  };
}

function ghostBtn(disabled = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: disabled ? C.dim : C.muted,
    borderRadius: 9,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: C.sans,
  };
}

function iconBtn() {
  return {
    width: 30,
    height: 30,
    display: "inline-grid",
    placeItems: "center",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.panel2,
    color: C.muted,
    cursor: "pointer",
  };
}
