import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Delete, MapPin, Plug, Scale, StickyNote } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useBalanza } from "@/hooks/useBalanza";
import { fmtCantidad, guardarUbicacion, nuevoId, registrarConteo } from "@/features/consumibles/api";
import Hoja from "./Hoja";
import { envaseRecordado, loteDeConteo, recordarEnvase } from "./conteoApi";
import { admiteDecimales, cantidadFinalDeConteo, piezasPorPeso, unidadEnTexto } from "./conteoCalculos";
import { conTimeout, separarRafaga } from "../mostrador/mostradorLogica";

/**
 * HojaConteo — contar un producto. Pensada para el celular y una mano: el
 * número grande arriba, la unidad bien a la vista y un teclado propio (el del
 * teléfono tapa media pantalla y cambia según el modelo).
 *
 * El conteo es "a ciegas": no se muestra lo que dice el sistema antes de
 * contar, para no inducir el número. La diferencia la calcula la base
 * (consumibles_registrar_conteo) y se avisa después de guardar.
 *
 * Si el producto ya se contó hoy (el mismo pañolero u otro), se elige si lo
 * nuevo reemplaza lo anterior (lo volví a contar) o se suma (había más en otro
 * lugar del pañol).
 */

const MAX_ENTEROS = 7;

/** Agrega una tecla al número que se está escribiendo (texto, coma decimal). */
function teclear(valor, tecla, { decimales }) {
  if (tecla === "borrar") return "";
  if (tecla === "atras") return valor.slice(0, -1);
  if (tecla === ",") {
    if (!decimales || valor.includes(",")) return valor;
    return `${valor || "0"},`;
  }
  if (!/^\d$/.test(tecla)) return valor;
  const [ent, dec] = valor.split(",");
  if (dec != null) return dec.length >= 3 ? valor : `${valor}${tecla}`;
  if (ent === "0") return tecla;
  if (ent.length >= MAX_ENTEROS) return valor;
  return `${valor}${tecla}`;
}

const aNumero = (texto) => {
  if (texto === "" || texto == null) return null;
  const n = Number(String(texto).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Muestra lo escrito con separador de miles, sin perder la coma a medio escribir. */
function mostrarEscrito(texto) {
  if (!texto) return "0";
  const [ent, dec] = texto.split(",");
  const conMiles = Number(ent || "0").toLocaleString("es-AR");
  return dec != null ? `${conMiles},${dec}` : conMiles;
}

const hora = (iso) => new Date(iso).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" });

export function Teclado({ onTecla, decimales = false }) {
  const tocar = (t) => {
    try { navigator.vibrate?.(8); } catch { /* sin vibración */ }
    onTecla(t);
  };
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimales ? "," : "borrar", "0", "atras"];
  return (
    <div className="cnt-teclado" role="group" aria-label="Teclado numérico">
      {teclas.map((t) => (
        <button
          key={t}
          type="button"
          className={`cnt-tecla${t === "borrar" || t === "atras" ? " is-accion" : ""}`}
          onClick={() => tocar(t)}
          aria-label={t === "atras" ? "Borrar el último número" : t === "borrar" ? "Borrar todo" : t === "," ? "Coma" : t}
        >
          {t === "atras" ? <Delete size={22} /> : t === "borrar" ? "C" : t}
        </button>
      ))}
    </div>
  );
}

/** Botón de la balanza: sólo en una PC con Chrome (Web Serial). */
function LectorBalanza({ onGramos }) {
  const bal = useBalanza();
  if (!bal.soportado) return null;
  const leer = async () => {
    try {
      const { gramos } = await bal.leerPeso();
      if (gramos > 0) onGramos(Math.round(gramos));
    } catch { /* el error queda en bal.error */ }
  };
  return (
    <div className="cnt-balanza">
      {bal.conectado ? (
        <button type="button" className="ui-btn ui-btn-suave" onClick={leer} disabled={bal.leyendo}>
          <Scale size={16} /> {bal.leyendo ? "Leyendo…" : "Leer la balanza"}
        </button>
      ) : (
        <button type="button" className="ui-btn" onClick={bal.conectar}>
          <Plug size={16} /> Conectar la balanza
        </button>
      )}
      {bal.error && <span className="cnt-balanza-error">{bal.error}</span>}
    </div>
  );
}

export default function HojaConteo({ item, sede, estadoHoy, nombrePor, esMio, ultimaUbicacion, onCerrar, onGuardado, onUbicacion }) {
  const toast = useToast();
  const navigate = useNavigate();

  const pesoUnitario = Number(item.pesoUnitarioG) > 0 ? Number(item.pesoUnitarioG) : null;
  const porPeso = item.formaEntrega === "peso";
  const puedePesar = !!pesoUnitario;
  const decimales = admiteDecimales(item.unidad);

  const [modo, setModo] = useState(porPeso && puedePesar ? "peso" : "piezas");
  const [valor, setValor] = useState("");
  const [gramos, setGramos] = useState("");
  const [envase, setEnvase] = useState(() => envaseRecordado(item.id));
  const [campoPeso, setCampoPeso] = useState("gramos");
  const [reconteo, setReconteo] = useState("reemplazar");
  const [ubicacion, setUbicacion] = useState(item.ubicacion || "");
  const [ubicGuardada, setUbicGuardada] = useState(item.ubicacion || "");
  const [nota, setNota] = useState("");
  const [verNota, setVerNota] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const clavePendiente = `klasea.consumibles.conteo.pendiente.${sede}.${item.id}`;
  const [pendiente, setPendiente] = useState(() => {
    try {
      const previo = JSON.parse(window.localStorage.getItem(clavePendiente) || "null");
      return previo?.id && previo.materialId === item.id && previo.sede === sede ? previo : null;
    } catch { return null; }
  });
  const enviando = useRef(false);
  // Id del conteo: si se corta la conexión y se reintenta lo MISMO, la base
  // devuelve el ya grabado. Si cambió el número, es otro conteo y otro id.
  const intento = useRef({ firma: null, id: null });
  const rafaga = useRef({ teclas: [], previo: null });

  const calculoPeso = useMemo(
    () => (modo === "peso" ? piezasPorPeso({ gramosTotales: aNumero(gramos), gramosEnvase: aNumero(envase), pesoUnitarioG: pesoUnitario }) : null),
    [modo, gramos, envase, pesoUnitario],
  );
  const contadoAhora = modo === "peso" ? calculoPeso?.piezas ?? null : aNumero(valor);
  const final = contadoAhora == null ? null : cantidadFinalDeConteo({
    contadoAhora,
    modo: estadoHoy ? reconteo : "reemplazar",
    contadoAntesHoy: estadoHoy?.contado ?? 0,
  });

  const tecla = useCallback((t) => {
    if (enviando.current || pendiente) return;
    if (modo === "peso") {
      if (campoPeso === "envase") setEnvase((v) => teclear(String(v ?? ""), t, { decimales: false }));
      else setGramos((v) => teclear(v, t, { decimales: false }));
    } else {
      setValor((v) => teclear(v, t, { decimales }));
    }
  }, [modo, campoPeso, decimales, pendiente]);

  const guardarUbic = useCallback(async (texto = ubicacion) => {
    const limpio = String(texto || "").trim().toUpperCase();
    if (limpio === (ubicGuardada || "")) return limpio;
    try {
      const v = await guardarUbicacion(item.id, limpio);
      setUbicacion(v || "");
      setUbicGuardada(v || "");
      onUbicacion?.(item, v);
      return v;
    } catch (err) {
      toast.error(`No se guardó la ubicación: ${err.message || err}`);
      return null;
    }
  }, [ubicacion, ubicGuardada, item, onUbicacion, toast]);

  const guardar = useCallback(async () => {
    if (enviando.current || (final == null && !pendiente)) return;
    enviando.current = true;
    setGuardando(true);
    try {
      const partes = [];
      if (estadoHoy && reconteo === "sumar") partes.push(`Suma: ${fmtCantidad(estadoHoy.contado)} + ${fmtCantidad(contadoAhora)}`);
      if (modo === "peso" && calculoPeso) {
        partes.push(`Pesado: ${fmtCantidad(gramos)} g${aNumero(envase) ? ` − envase ${fmtCantidad(envase)} g` : ""}`);
      }
      if (nota.trim()) partes.push(nota.trim());
      const gramosNetos = modo === "peso" && calculoPeso?.netos > 0 ? calculoPeso.netos : null;
      const firma = JSON.stringify([final, gramosNetos, partes]);
      if (intento.current.firma !== firma) intento.current = { firma, id: nuevoId() };
      const envio = pendiente ?? {
        id: intento.current.id,
        materialId: item.id,
        sede,
        contado: final,
        gramos: gramosNetos,
        nota: partes.join(" · ") || null,
        lote: loteDeConteo(sede),
      };
      // También sobrevive a cerrar la hoja o recargar. Si el servidor recibió
      // el conteo pero se perdió la respuesta, el RPC devuelve el mismo id.
      window.localStorage.setItem(clavePendiente, JSON.stringify(envio));
      setPendiente(envio);
      const fila = await conTimeout(registrarConteo(envio), 15000, "No llegó la confirmación del conteo; reintentá el mismo envío.");
      window.localStorage.removeItem(clavePendiente);
      setPendiente(null);
      if (modo === "peso") recordarEnvase(item.id, aNumero(envase) ? envase : "");
      if (String(ubicacion || "").trim().toUpperCase() !== (ubicGuardada || "")) await guardarUbic();
      onGuardado?.({ item, fila });
    } catch (err) {
      toast.error(`No pudimos confirmar el conteo: ${err.message || err}. Reintentá el mismo envío.`);
      enviando.current = false;
      setGuardando(false);
    }
  }, [final, estadoHoy, reconteo, contadoAhora, modo, calculoPeso, gramos, envase, nota, item, sede, ubicacion, ubicGuardada, guardarUbic, onGuardado, toast, pendiente, clavePendiente]);

  // Teclado físico (PC o lector): números, coma, borrar y Enter para guardar.
  // No intercepta cuando se escribe en la ubicación o la nota.
  useEffect(() => {
    const onKey = (e) => {
      if (enviando.current || pendiente || e.defaultPrevented) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // El lector manda letras y dígitos en ráfaga: recuperamos el número
      // anterior y nunca guardamos los dígitos del código como inventario.
      if (e.key.length === 1) {
        const tiempo = performance.now();
        if (!rafaga.current.teclas.length || tiempo - rafaga.current.teclas.at(-1).t > 50) {
          rafaga.current = { teclas: [], previo: { valor, gramos, envase } };
        }
        rafaga.current.teclas.push({ k: e.key, t: tiempo });
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const leida = separarRafaga(rafaga.current.teclas).rafaga;
        const previo = rafaga.current.previo;
        rafaga.current = { teclas: [], previo: null };
        if (leida) {
          e.preventDefault();
          if (previo) { setValor(previo.valor); setGramos(previo.gramos); setEnvase(previo.envase); }
          toast.info("Cerrá este conteo y escaneá el código en el buscador.");
          return;
        }
        if (e.key === "Tab" || t?.tagName === "BUTTON") return;
      }
      if (/^\d$/.test(e.key)) tecla(e.key);
      else if (e.key === "," || e.key === ".") tecla(",");
      else if (e.key === "Backspace") tecla("atras");
      else if (e.key === "Delete") tecla("borrar");
      else if (e.key === "Enter") guardar();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tecla, guardar, valor, gramos, envase, toast, pendiente]);

  const unidadFinal = unidadEnTexto(item.unidad, final ?? 0);
  const textoBoton = guardando
    ? "Guardando…"
    : pendiente ? `Reintentar conteo: ${fmtCantidad(pendiente.contado)} ${item.unidad}`
    : final == null
      ? (modo === "peso" ? "Pesá el cajón" : "Escribí cuántos hay")
      : final === 0
        ? "Guardar: no hay ninguno"
        : `Guardar ${fmtCantidad(final)} ${unidadFinal}`;

  const sub = [item.codigoEtiqueta, item.rubro].filter(Boolean).join(" · ") || "Consumible";

  return (
    <Hoja
      abierta
      completa
      clase="cnt"
      titulo={item.descripcion}
      sub={sub}
      onCerrar={guardando ? undefined : onCerrar}
      pie={(
        <button type="button" className="ui-btn ui-btn-primario cnt-guardar" onClick={guardar} disabled={(final == null && !pendiente) || guardando}>
          {!guardando && final != null && <Check size={19} />} {textoBoton}
        </button>
      )}
    >
      {pendiente && <p className="cnt-aviso" role="status">Hay un conteo de {fmtCantidad(pendiente.contado)} {item.unidad} por confirmar. Reintentá ese mismo envío antes de cargar otro.</p>}
      <fieldset className="cnt-hoja" disabled={guardando || !!pendiente} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <div className="cnt-ubic">
          <label className="cnt-ubic-lbl" htmlFor={`ubic-${item.id}`}><MapPin size={15} /> Ubicación</label>
          <input
            id={`ubic-${item.id}`}
            className="ui-input cnt-ubic-input"
            value={ubicacion}
            placeholder="C2-03"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            onChange={(e) => setUbicacion(e.target.value.toUpperCase())}
            onBlur={() => guardarUbic()}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          />
          {ubicGuardada && ubicGuardada === ubicacion.trim() && <span className="cnt-ubic-ok" title="Ubicación guardada"><Check size={15} /></span>}
          {!ubicacion && ultimaUbicacion && (
            <button type="button" className="ui-chip cnt-ubic-igual" onClick={() => { setUbicacion(ultimaUbicacion); guardarUbic(ultimaUbicacion); }}>
              Igual que el anterior: <b>{ultimaUbicacion}</b>
            </button>
          )}
        </div>
        {!ubicacion && !ultimaUbicacion && <p className="cnt-ayuda">Estantería-nivel-posición. Ej.: C2-03.</p>}

        {estadoHoy && (
          <div className="cnt-ya">
            <div className="cnt-ya-tit">
              Ya {esMio ? "lo contaste" : "se contó"} hoy: <b className="cnt-num">{fmtCantidad(estadoHoy.contado)}</b> {unidadEnTexto(item.unidad, estadoHoy.contado)}
              <span className="cnt-ya-quien"> · {esMio ? "vos" : nombrePor || "otro equipo"}, {hora(estadoHoy.at)}</span>
            </div>
            <div className="cnt-seg" role="radiogroup" aria-label="Qué hacer con el conteo anterior">
              <button type="button" role="radio" aria-checked={reconteo === "reemplazar"} className={reconteo === "reemplazar" ? "is-activa" : ""} onClick={() => setReconteo("reemplazar")}>
                Lo conté de nuevo
              </button>
              <button type="button" role="radio" aria-checked={reconteo === "sumar"} className={reconteo === "sumar" ? "is-activa" : ""} onClick={() => setReconteo("sumar")}>
                Había más en otro lugar
              </button>
            </div>
            <p className="cnt-ayuda">
              {reconteo === "sumar"
                ? `Lo que cuentes ahora se suma a los ${fmtCantidad(estadoHoy.contado)} de antes.`
                : "Queda lo que cuentes ahora; lo anterior se reemplaza."}
            </p>
          </div>
        )}

        {(puedePesar || porPeso) && (
          <div className="cnt-seg cnt-modo" role="radiogroup" aria-label="Cómo se cuenta">
            <button type="button" role="radio" aria-checked={modo === "piezas"} className={modo === "piezas" ? "is-activa" : ""} onClick={() => setModo("piezas")}>
              Contar piezas
            </button>
            <button type="button" role="radio" aria-checked={modo === "peso"} className={modo === "peso" ? "is-activa" : ""} onClick={() => setModo("peso")} disabled={!puedePesar}>
              <Scale size={15} /> Pesar el cajón
            </button>
          </div>
        )}
        {porPeso && !puedePesar && (
          <div className="cnt-aviso">
            Se entrega por peso pero todavía no tiene el peso de una pieza. Contá las piezas, o calibralo con la balanza.
            <button type="button" className="ui-btn ui-btn-fantasma cnt-aviso-btn" onClick={() => navigate("/balanza/calibrar")}>Calibrar el peso →</button>
          </div>
        )}

        {modo === "peso" ? (
          <div className="cnt-peso">
            <div className="cnt-peso-campos">
              <button type="button" className={`cnt-campo${campoPeso === "gramos" ? " is-activo" : ""}`} onClick={() => setCampoPeso("gramos")}>
                <span className="cnt-campo-lbl">Peso del cajón</span>
                <span className="cnt-campo-val cnt-num">{mostrarEscrito(gramos)} <small>g</small></span>
              </button>
              <button type="button" className={`cnt-campo${campoPeso === "envase" ? " is-activo" : ""}`} onClick={() => setCampoPeso("envase")}>
                <span className="cnt-campo-lbl">Envase vacío</span>
                <span className="cnt-campo-val cnt-num">{mostrarEscrito(String(envase ?? ""))} <small>g</small></span>
              </button>
            </div>
            <div className="cnt-display" aria-live="polite">
              <span className="cnt-display-num cnt-num">{calculoPeso?.piezas != null ? fmtCantidad(calculoPeso.piezas) : "—"}</span>
              <span className="cnt-unidad">{unidadEnTexto(item.unidad, calculoPeso?.piezas ?? 0)}</span>
            </div>
            <p className="cnt-ayuda cnt-centro">
              {calculoPeso
                ? `${fmtCantidad(calculoPeso.netos)} g netos ÷ ${fmtCantidad(pesoUnitario)} g cada una`
                : "Pesá el cajón entero. Si lo pesás con el envase, cargá cuánto pesa vacío."}
            </p>
            <LectorBalanza onGramos={(g) => { setGramos(String(g)); setCampoPeso("gramos"); }} />
          </div>
        ) : (
          <div className="cnt-display" aria-live="polite">
            <span className={`cnt-display-num cnt-num${valor ? "" : " is-vacio"}`}>{mostrarEscrito(valor)}</span>
            <span className="cnt-unidad">{unidadEnTexto(item.unidad, aNumero(valor) ?? 0)}</span>
            {valor && <button type="button" className="ui-btn ui-btn-fantasma cnt-borrar" onClick={() => setValor("")}>Borrar</button>}
          </div>
        )}

        {estadoHoy && reconteo === "sumar" && contadoAhora != null && (
          <p className="cnt-total">
            Total: <span className="cnt-num">{fmtCantidad(estadoHoy.contado)} + {fmtCantidad(contadoAhora)} = <b>{fmtCantidad(final)}</b></span> {unidadFinal}
          </p>
        )}

        <Teclado onTecla={tecla} decimales={modo === "piezas" && decimales} />

        {verNota ? (
          <textarea
            aria-label="Nota del conteo"
            className="ui-input cnt-nota"
            rows={2}
            value={nota}
            maxLength={300}
            placeholder="Ej.: 2 cajas sin abrir arriba del estante"
            onChange={(e) => setNota(e.target.value)}
          />
        ) : (
          <button type="button" className="ui-btn ui-btn-fantasma cnt-nota-btn" onClick={() => setVerNota(true)}>
            <StickyNote size={15} /> Agregar una nota
          </button>
        )}
      </fieldset>
    </Hoja>
  );
}
