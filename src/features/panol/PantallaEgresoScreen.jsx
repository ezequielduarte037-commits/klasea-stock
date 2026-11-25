import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CreditCard,
  LoaderCircle,
  Maximize2,
  Minimize2,
  ShieldCheck,
} from "lucide-react";
import logoK from "@/assets/logos/logo-k.png";
import {
  publishEgresoDisplay,
  readEgresoDisplay,
  subscribeEgresoDisplay,
} from "@/features/panol/egresoDisplay";

// La pantalla que mira el que retira, en un segundo monitor del mostrador.
// Mismo lenguaje que el mostrador (lector, filas con foto, cantidades en mono,
// botón grande), pero pensada para leerse de lejos: letra grande, poco texto y
// un solo dato por lugar. Todo bajo `.pdr`; sólo tokens del tema.

const COMPLETE_VISIBLE_MS = 45_000;
const MONO = "'JetBrains Mono', 'IBM Plex Mono', monospace";

function fmtQty(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return Number(Math.round(number * 100) / 100).toLocaleString("es-AR");
}

function iniciales(texto) {
  return String(texto || "")
    .trim()
    .split(/\s+/)
    .filter((parte) => /[a-záéíóúñ0-9]/i.test(parte))
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase() || "?";
}

function horaCorta(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// Origen y destino como recorrido: "52-26 → 43-30" se entiende de una. Si son la
// misma obra —el caso normal— se escribe una sola vez.
function recorrido(item) {
  const origen = String(item.origin || "").trim();
  const destino = String(item.destination || "").trim();
  if (origen && destino && origen !== destino) return { origen, destino };
  return { origen: origen || destino, destino: "" };
}

function Foto({ texto, url, grande = false }) {
  return (
    <span className={`pdr-foto${grande ? " is-grande" : ""}`} aria-hidden="true">
      <span>{iniciales(texto)}</span>
      {url ? <img src={url} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
    </span>
  );
}

function Renglon({ item }) {
  const { origen, destino } = recorrido(item);
  return (
    <div className="pdr-item">
      <Foto texto={item.label} url={item.imageUrl} />
      <div className="pdr-item-texto">
        <div className="pdr-item-nombre">{item.label || "Material"}</div>
        <div className="pdr-item-ruta">
          {item.variant ? <span className="pdr-item-variante">{item.variant}</span> : null}
          {origen ? <span className="pdr-mono">{origen}</span> : null}
          {destino ? <><ArrowRight size={16} aria-hidden="true" /><span className="pdr-mono is-destino">{destino}</span></> : null}
        </div>
      </div>
      <div className="pdr-item-cant">
        <strong>{fmtQty(item.quantity)}</strong>
        <span>{item.unit || "u"}</span>
      </div>
    </div>
  );
}

function Pasos({ actual, reasignando }) {
  const pasos = reasignando ? ["Revisá", "Obra destino", "Listo"] : ["Revisá", "Tarjeta", "Listo"];
  return (
    <ol className="pdr-pasos" aria-label="Pasos del retiro">
      {pasos.map((paso, index) => {
        const numero = index + 1;
        const hecho = actual > numero;
        const enCurso = actual === numero;
        return (
          <li key={paso} className={hecho ? "is-hecho" : enCurso ? "is-actual" : ""} aria-current={enCurso ? "step" : undefined}>
            <i>{hecho ? <Check size={14} strokeWidth={3} /> : numero}</i>
            <span>{paso}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Lo que tiene que hacer o saber el que está enfrente, en una sola caja.
function Estado({ state, reasignando }) {
  if (state.status === "error") {
    return (
      <div className="pdr-estado is-rojo">
        <span className="pdr-estado-icono"><AlertTriangle size={30} /></span>
        <div>
          <strong>No se registró</strong>
          <p>{state.error || "Hubo un problema al registrar el movimiento. Esperá la indicación de pañol."}</p>
        </div>
      </div>
    );
  }
  if (reasignando) {
    return (
      <div className="pdr-estado is-azul">
        <span className="pdr-estado-icono">{state.status === "processing" ? <LoaderCircle size={30} className="pdr-gira" /> : <ArrowLeftRight size={30} />}</span>
        <div>
          <strong>{state.status === "processing" ? "Cambiando de obra…" : "Esto no es un retiro"}</strong>
          <p>El material no sale del pañol: pasa a estar reservado para otra obra. No hace falta tarjeta.</p>
        </div>
      </div>
    );
  }
  if (state.status === "processing") {
    return (
      <div className="pdr-estado is-azul">
        <span className="pdr-estado-icono"><LoaderCircle size={30} className="pdr-gira" /></span>
        <div>
          <strong>Registrando el retiro…</strong>
          <p>Esperá la confirmación antes de llevarte el material.</p>
        </div>
      </div>
    );
  }
  if (state.employee) {
    const foto = String(state.employee.photoUrl || "").trim();
    return (
      <div className="pdr-persona">
        <span className="pdr-avatar" aria-hidden="true">
          {iniciales(state.employee.name)}
          {foto ? <img src={foto} alt="" /> : null}
        </span>
        <div style={{ minWidth: 0 }}>
          <span className="pdr-rotulo is-verde"><ShieldCheck size={14} aria-hidden="true" /> Tarjeta leída</span>
          <strong>{state.employee.name}</strong>
          <p>Pañol está confirmando el retiro.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="pdr-tarjeta">
      <span className="pdr-tarjeta-icono"><CreditCard size={34} /></span>
      <div>
        <strong>Apoyá tu tarjeta en el lector</strong>
        <p>Antes, fijate que esté todo lo que te llevás.</p>
      </div>
    </div>
  );
}

export default function PantallaEgresoScreen() {
  const [state, setState] = useState(readEgresoDisplay);
  const [hora, setHora] = useState(() => horaCorta());
  const [completa, setCompleta] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);

  useEffect(() => subscribeEgresoDisplay(setState), []);

  // Reloj de minutos: queda abierta todo el día, no hace falta que lata.
  useEffect(() => {
    document.title = "Pantalla de retiro · KlaseA";
    const timer = window.setInterval(() => setHora(horaCorta()), 20_000);
    const alCambiar = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => { window.clearInterval(timer); document.removeEventListener("fullscreenchange", alCambiar); };
  }, []);

  // Red de contención: pañol limpia la pantalla al confirmar, pero si quedó un
  // "complete" guardado de antes, se va solo en vez de quedar clavado.
  useEffect(() => {
    if (state.status !== "complete" || !state.completedAt) return undefined;
    const elapsed = Date.now() - new Date(state.completedAt).getTime();
    const timer = window.setTimeout(() => {
      publishEgresoDisplay({
        status: "idle", items: [], employee: null, retiredBy: "", destination: "", sector: "",
        note: "", totalLines: 0, totalUnits: 0, error: "", completedAt: null,
      });
    }, Math.max(0, COMPLETE_VISIBLE_MS - elapsed));
    return () => window.clearTimeout(timer);
  }, [state.completedAt, state.status]);

  const items = Array.isArray(state.items) ? state.items : [];
  const enEspera = state.status === "idle" || !items.length;
  const reasignando = state.mode === "reasignacion";
  const listo = state.status === "complete";
  const destino = state.destination || state.sector || "";
  const unidades = state.totalUnits || items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const pasoActual = listo ? 4
    : reasignando ? (state.status === "processing" || destino ? 2 : 1)
      : (state.status === "identified" || state.status === "processing" ? 2 : 1);
  const nombre = state.employee?.name || state.retiredBy || "";

  async function alternarPantallaCompleta() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // El navegador puede no dejar; la pantalla funciona igual.
    }
  }

  return (
    <main className="pdr">
      <style href="klasea-pantalla-retiro" precedence="default">{CSS}</style>

      <header className="pdr-barra">
        <img src={logoK} alt="" className="pdr-logo" />
        <div className="pdr-marca">
          <span>Pañol</span>
          <strong>{reasignando ? "Cambio de obra" : "Retiro de materiales"}</strong>
        </div>
        <span className="pdr-vivo"><i aria-hidden="true" /> En vivo</span>
        <span className="pdr-hora">{hora}</span>
        <button type="button" className="pdr-icono-btn" onClick={alternarPantallaCompleta} aria-label={completa ? "Salir de pantalla completa" : "Pantalla completa"} title={completa ? "Salir de pantalla completa" : "Pantalla completa"}>
          {completa ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
      </header>

      {enEspera ? (
        <section className="pdr-espera">
          <img src={logoK} alt="" className="pdr-espera-logo" />
          <h1>Esperando el próximo retiro</h1>
          <p>Lo que pañol vaya cargando aparece acá.</p>
        </section>
      ) : listo ? (
        <section className="pdr-listo">
          <div className="pdr-listo-caja">
            <span className={`pdr-listo-check${reasignando ? " is-azul" : ""}`}><Check size={40} strokeWidth={2.6} /></span>
            <h1>{reasignando ? "Material asignado" : nombre ? `Listo, ${nombre}` : "Retiro registrado"}</h1>
            <p>
              {reasignando ? "Quedó reservado para " : "Quedó registrado"}
              {destino ? <>{reasignando ? "" : " para "}<strong className="pdr-mono">{destino}</strong></> : null}.
            </p>
            <div className="pdr-lista is-chica">
              {items.map((item, index) => <Renglon key={item.key || `${item.label}-${index}`} item={item} />)}
            </div>
          </div>
        </section>
      ) : (
        <div className="pdr-cuerpo">
          <section className="pdr-col-lista" aria-label={reasignando ? "Material que cambia de obra" : "Lo que se lleva"}>
            <div className="pdr-titulo-seccion">
              {reasignando ? "Cambia de obra" : "Se lleva"}
              <span className="pdr-mono">{items.length} {items.length === 1 ? "producto" : "productos"} · {fmtQty(unidades)} {unidades === 1 ? "unidad" : "unidades"}</span>
            </div>
            <div className="pdr-lista">
              {items.map((item, index) => <Renglon key={item.key || `${item.label}-${index}`} item={item} />)}
            </div>
          </section>

          <aside className="pdr-col-lado">
            <Pasos actual={pasoActual} reasignando={reasignando} />
            <Estado state={state} reasignando={reasignando} />
            <div className={`pdr-destino${destino ? "" : " is-vacio"}`}>
              <span className="pdr-rotulo">{reasignando ? "Pasa a la obra" : "Va para"}</span>
              <strong className={destino && /\d/.test(destino) ? "pdr-mono" : undefined}>{destino || "A confirmar"}</strong>
              {state.note ? <p>{state.note}</p> : null}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

const CSS = `
.pdr {
  position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 1;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--bg); color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
}
.pdr button { font: inherit; }
.pdr .pdr-mono { font-family: ${MONO}; font-variant-numeric: tabular-nums; }

/* Barra */
.pdr .pdr-barra { display: flex; align-items: center; gap: 14px; flex-shrink: 0; padding: 14px 24px; border-bottom: 1px solid var(--border); }
.pdr .pdr-logo { width: 40px; height: 40px; border-radius: 12px; object-fit: cover; }
.pdr .pdr-marca { display: grid; min-width: 0; }
.pdr .pdr-marca span { font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }
.pdr .pdr-marca strong { font-size: 20px; font-weight: 600; }
.pdr .pdr-vivo { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 12px; border: 1px solid var(--green-border); border-radius: 999px; background: var(--green-soft); color: var(--green); font-size: 12.5px; font-weight: 600; }
.pdr .pdr-vivo i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.pdr .pdr-hora { font-family: ${MONO}; font-size: 18px; font-weight: 600; color: var(--muted); }
.pdr .pdr-icono-btn { width: 40px; height: 40px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--muted); display: grid; place-items: center; cursor: pointer; }
.pdr .pdr-icono-btn:hover { color: var(--text); border-color: var(--border-2); }

/* En espera */
.pdr .pdr-espera { flex: 1; display: grid; place-content: center; justify-items: center; gap: 14px; padding: 24px; text-align: center; }
.pdr .pdr-espera-logo { width: 84px; height: 84px; border-radius: 24px; opacity: .9; margin-bottom: 10px; }
.pdr .pdr-espera h1 { margin: 0; font-size: clamp(30px, 4vw, 52px); font-weight: 650; letter-spacing: -.02em; line-height: 1.08; }
.pdr .pdr-espera p { margin: 0; font-size: clamp(16px, 1.6vw, 21px); color: var(--dim); }

/* Cuerpo: lista + columna */
.pdr .pdr-cuerpo { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(380px, 460px); }
.pdr .pdr-col-lista { min-height: 0; overflow: auto; padding: 20px 24px 28px; display: grid; gap: 12px; align-content: start; }
.pdr .pdr-col-lado { min-height: 0; overflow: auto; display: grid; gap: 16px; align-content: start; padding: 20px 22px 28px; border-left: 1px solid var(--border); background: var(--panel); }
.pdr .pdr-titulo-seccion { display: flex; align-items: baseline; gap: 12px; font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
.pdr .pdr-titulo-seccion .pdr-mono { margin-left: auto; letter-spacing: 0; text-transform: none; font-size: 15px; color: var(--muted); }
.pdr .pdr-rotulo { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
.pdr .pdr-rotulo.is-verde { color: var(--green); }

/* Renglones */
.pdr .pdr-lista { display: grid; border: 1px solid var(--border); border-radius: 16px; background: var(--panel-solid); overflow: hidden; }
.pdr .pdr-item { display: flex; align-items: center; gap: 16px; min-height: 92px; padding: 12px 20px 12px 14px; border-bottom: 1px solid var(--border); }
.pdr .pdr-item:last-child { border-bottom: 0; }
.pdr .pdr-foto { position: relative; width: 68px; height: 68px; border-radius: 14px; overflow: hidden; flex-shrink: 0; display: grid; place-items: center; background: var(--panel-2); color: var(--dim); font-size: 20px; font-weight: 600; }
.pdr .pdr-foto img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; box-sizing: border-box; padding: 4px; object-fit: contain; background: #fff; }
.pdr .pdr-item-texto { flex: 1; min-width: 0; display: grid; gap: 5px; }
.pdr .pdr-item-nombre { font-size: clamp(19px, 1.75vw, 26px); font-weight: 600; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.pdr .pdr-item-ruta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: clamp(14px, 1.25vw, 18px); color: var(--muted); }
.pdr .pdr-item-ruta svg { color: var(--dim); }
.pdr .pdr-item-ruta .pdr-mono { font-weight: 600; }
.pdr .pdr-item-ruta .is-destino { color: var(--blue); }
.pdr .pdr-item-variante { color: var(--violet); font-weight: 500; }
.pdr .pdr-item-cant { display: flex; align-items: baseline; gap: 7px; flex-shrink: 0; white-space: nowrap; }
.pdr .pdr-item-cant strong { font-family: ${MONO}; font-variant-numeric: tabular-nums; font-size: clamp(30px, 2.8vw, 42px); font-weight: 700; color: var(--blue); letter-spacing: -.02em; }
.pdr .pdr-item-cant span { font-size: 15px; font-weight: 500; color: var(--dim); }

/* Pasos */
.pdr .pdr-pasos { display: flex; gap: 0; margin: 0; padding: 0; list-style: none; }
.pdr .pdr-pasos li { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--dim); font-size: 14px; font-weight: 500; }
.pdr .pdr-pasos li + li::before { content: ""; flex: 0 1 26px; height: 2px; margin-right: 4px; border-radius: 2px; background: var(--border-2); }
.pdr .pdr-pasos li.is-hecho + li::before { background: var(--green); }
.pdr .pdr-pasos i { width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-family: ${MONO}; font-size: 13px; font-weight: 700; border: 1px solid var(--border-2); background: var(--panel-solid); }
.pdr .pdr-pasos li.is-actual { color: var(--text); font-weight: 600; }
.pdr .pdr-pasos li.is-actual i { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); }
.pdr .pdr-pasos li.is-hecho { color: var(--green); }
.pdr .pdr-pasos li.is-hecho i { border-color: var(--green-border); background: var(--green-soft); color: var(--green); }

/* Estado */
.pdr .pdr-tarjeta { display: flex; align-items: center; gap: 18px; padding: 22px; border: 1.5px dashed var(--blue-border); border-radius: 18px; background: var(--blue-soft); }
.pdr .pdr-tarjeta-icono { width: 70px; height: 70px; flex-shrink: 0; border-radius: 18px; display: grid; place-items: center; border: 1px solid var(--blue-border); background: var(--panel-solid); color: var(--blue); }
.pdr .pdr-tarjeta strong { display: block; font-size: clamp(21px, 1.9vw, 27px); font-weight: 650; line-height: 1.15; }
.pdr .pdr-tarjeta p, .pdr .pdr-estado p, .pdr .pdr-persona p { margin: 6px 0 0; font-size: 15px; line-height: 1.45; color: var(--muted); }
.pdr .pdr-persona { display: flex; align-items: center; gap: 16px; padding: 18px; border: 1px solid var(--green-border); border-radius: 18px; background: var(--green-soft); }
.pdr .pdr-persona strong { display: block; margin-top: 4px; font-size: clamp(22px, 2vw, 28px); font-weight: 650; line-height: 1.15; overflow-wrap: anywhere; }
.pdr .pdr-avatar { position: relative; width: 76px; height: 76px; flex-shrink: 0; border-radius: 20px; overflow: hidden; display: grid; place-items: center; border: 1px solid var(--green-border); background: var(--panel-solid); color: var(--green); font-size: 24px; font-weight: 700; }
.pdr .pdr-avatar img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.pdr .pdr-estado { display: flex; align-items: center; gap: 16px; padding: 18px; border: 1px solid var(--blue-border); border-radius: 18px; background: var(--blue-soft); }
.pdr .pdr-estado strong { display: block; font-size: clamp(21px, 1.9vw, 27px); font-weight: 650; line-height: 1.15; }
.pdr .pdr-estado-icono { width: 62px; height: 62px; flex-shrink: 0; border-radius: 16px; display: grid; place-items: center; border: 1px solid var(--blue-border); background: var(--panel-solid); color: var(--blue); }
.pdr .pdr-estado.is-rojo { border-color: var(--red-border); background: var(--red-soft); }
.pdr .pdr-estado.is-rojo .pdr-estado-icono { border-color: var(--red-border); color: var(--red); }
.pdr .pdr-gira { animation: pdr-giro .9s linear infinite; }

/* Destino: el dato que más se mira */
.pdr .pdr-destino { display: grid; gap: 6px; padding: 18px; border: 1px solid var(--border-2); border-radius: 18px; background: var(--panel-solid); }
.pdr .pdr-destino strong { font-size: clamp(34px, 3.4vw, 52px); font-weight: 700; line-height: 1.05; letter-spacing: -.02em; color: var(--blue); overflow-wrap: anywhere; }
.pdr .pdr-destino.is-vacio strong { font-size: 24px; font-weight: 600; color: var(--dim); }
.pdr .pdr-destino p { margin: 4px 0 0; font-size: 15px; line-height: 1.45; color: var(--muted); }

/* Listo */
.pdr .pdr-listo { flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 24px; }
.pdr .pdr-listo-caja { width: 100%; max-width: 760px; display: grid; gap: 14px; justify-items: center; text-align: center; }
.pdr .pdr-listo-check { width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; background: var(--green-soft); border: 1px solid var(--green-border); color: var(--green); animation: pdr-aparece .35s cubic-bezier(.22,1,.36,1); }
.pdr .pdr-listo-check.is-azul { background: var(--blue-soft); border-color: var(--blue-border); color: var(--blue); }
.pdr .pdr-listo h1 { margin: 6px 0 0; font-size: clamp(32px, 4vw, 52px); font-weight: 650; letter-spacing: -.02em; }
.pdr .pdr-listo p { margin: 0; font-size: clamp(17px, 1.6vw, 22px); color: var(--muted); }
.pdr .pdr-listo p strong { color: var(--blue); }
.pdr .pdr-lista.is-chica { width: 100%; margin-top: 10px; text-align: left; max-height: 46vh; overflow: auto; }
.pdr .pdr-lista.is-chica .pdr-item { min-height: 72px; }
.pdr .pdr-lista.is-chica .pdr-foto { width: 52px; height: 52px; border-radius: 12px; font-size: 16px; }
.pdr .pdr-lista.is-chica .pdr-item-nombre { font-size: 19px; }
.pdr .pdr-lista.is-chica .pdr-item-cant strong { font-size: 28px; }

@keyframes pdr-giro { to { transform: rotate(360deg); } }
@keyframes pdr-aparece { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: none; } }

@media (max-width: 900px) {
  .pdr .pdr-cuerpo { display: flex; flex-direction: column; overflow: auto; }
  .pdr .pdr-col-lista, .pdr .pdr-col-lado { overflow: visible; }
  .pdr .pdr-col-lado { order: -1; border-left: 0; border-bottom: 1px solid var(--border); padding: 16px; }
  .pdr .pdr-col-lista { padding: 16px; }
  .pdr .pdr-barra { padding: 10px 16px; }
  .pdr .pdr-vivo { display: none; }
  .pdr .pdr-hora { margin-left: auto; }
  .pdr .pdr-item { gap: 12px; padding: 10px 12px; min-height: 76px; }
  .pdr .pdr-foto { width: 52px; height: 52px; }
}
`;
