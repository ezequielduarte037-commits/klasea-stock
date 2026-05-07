import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import {
  AlertTriangle,
  Anchor,
  Battery,
  Check,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Gauge,
  Play,
  Power,
  Radio,
  Shield,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import k52Hero from "./k52.png";
import logoK from "../assets/logo-k.png";
import {
  getOnboardingStorageKeys,
  readOnboardingStorage,
  writeOnboardingStorage,
} from "./onboardingStorage";

const modules = [
  {
    id: "welcome",
    nav: "Inicio",
    eyebrow: "Klase A OS",
    title: "Bienvenido a bordo del K52 HT",
    subtitle: "Una introduccion interactiva para operar energia, propulsion, agua y seguridad con criterio nautico.",
    icon: Anchor,
    color: "#D8C3A5",
    signal: "Engineering the Future of Navigation",
    caption: "K52 HT · 14,62 m · navegacion costera restringida C1",
    steps: ["Reconocer la unidad", "Activar sistemas esenciales", "Navegar por modulos"],
    hotspots: [
      { x: 28, y: 32, label: "Puente digital", text: "El panel centraliza energia, propulsion, sistemas y soporte." },
      { x: 68, y: 46, label: "Unidad K52", text: "Configurado para hasta 8 personas y autonomia premium." },
    ],
    stats: [
      ["Combustible", "1910 L"],
      ["Agua", "480 L"],
      ["Aguas negras", "150 L"],
    ],
  },
  {
    id: "batteries",
    nav: "Baterias",
    eyebrow: "Secuencia 01",
    title: "Activacion de baterias",
    subtitle: "En la banda de estribor, la puerta acrilica negra concentra los cortes principales.",
    icon: Battery,
    color: "#34d399",
    signal: "Power banks · service · engine · group · bow",
    caption: "Presionar ON para habilitar. Para retirar la unidad, cortar todo.",
    steps: ["Abrir gabinete de cortes", "Activar solo los bancos necesarios", "Verificar servicio, motor, grupo y bow", "Al finalizar, pasar cada corte a OFF"],
    hotspots: [
      { x: 36, y: 35, label: "ON rojo", text: "Habilita el banco seleccionado antes de entrar al salon." },
      { x: 60, y: 62, label: "OFF seguro", text: "Deslizar la barra negra y presionar OFF al retirarse." },
    ],
    stats: [
      ["Motor", "ON"],
      ["Servicio", "12V"],
      ["Grupo", "Standby"],
    ],
  },
  {
    id: "twelve",
    nav: "12V",
    eyebrow: "Secuencia 02",
    title: "Tablero 12V",
    subtitle: "Desde el salon se habilitan las termicas de circuitos esenciales, bombas y consumos de baja tension.",
    icon: Zap,
    color: "#D8C3A5",
    signal: "DC distribution · amperimetro · voltimetro",
    caption: "La operacion se hace por circuitos, no como un encendido general.",
    steps: ["Seleccionar termicas necesarias", "Monitorear voltimetro de servicio", "Controlar consumo en amperimetro", "Mantener bombas criticas en automatico"],
    hotspots: [
      { x: 42, y: 28, label: "Voltimetro", text: "Indica estado del banco de servicio antes de exigir consumos." },
      { x: 63, y: 58, label: "Termicas", text: "Levantar solo los circuitos que se van a utilizar." },
    ],
    stats: [
      ["Banco", "12V"],
      ["Carga", "Monitor"],
      ["Bombas", "AUTO"],
    ],
  },
  {
    id: "twenty",
    nav: "220V",
    eyebrow: "Secuencia 03",
    title: "Tablero 220V",
    subtitle: "El K52 puede alimentar artefactos de 220V desde puerto, grupo electrogeno o inverter.",
    icon: Power,
    color: "#a78bfa",
    signal: "AC bus · selector de fuente · cargas",
    caption: "Primero se elige la fuente. Despues se habilitan los consumos.",
    steps: ["Confirmar fuente disponible", "Posicionar selectoras segun modo", "Levantar termicas de artefactos", "Revisar que no haya sobreconsumo"],
    hotspots: [
      { x: 30, y: 48, label: "Selector A", text: "Define el origen de corriente alterna del tablero." },
      { x: 68, y: 48, label: "Cargas", text: "Clima, cocina, cargador y tomas dependen de esta etapa." },
    ],
    stats: [
      ["Puerto", "C.A. Tierra"],
      ["Grupo", "C.A. Grupo"],
      ["Inverter", "2000 W"],
    ],
  },
  {
    id: "energy",
    nav: "Modos",
    eyebrow: "Secuencia 04",
    title: "Modos de energia",
    subtitle: "La logica premium: puerto para confort total, grupo para autonomia, inverter para consumos selectivos.",
    icon: Zap,
    color: "#fbbf24",
    signal: "Smart source flow",
    caption: "El inverter consume baterias de servicio. Usarlo con monitoreo.",
    steps: ["Puerto: cable amarillo y C.A. Tierra", "Grupo: corte GRUPO, encendido y C.A. Grupo", "Inverter: cargador/inversor ON y C.A. Convertidor", "Cargador: activar cuando hay 220V disponible"],
    hotspots: [
      { x: 22, y: 34, label: "Puerto", text: "Confort completo mientras la unidad esta amarrada." },
      { x: 50, y: 56, label: "Grupo", text: "Energia independiente para navegacion y fondeo." },
      { x: 78, y: 34, label: "Inverter", text: "Uso limitado: heladera, microondas, TV, tomas y fabricadora." },
    ],
    stats: [
      ["Bulk", "Carga"],
      ["Absorcion", "Estabiliza"],
      ["Float", "Mantiene"],
    ],
  },
  {
    id: "engines",
    nav: "Motores",
    eyebrow: "Secuencia 05",
    title: "Encendido de motores",
    subtitle: "Antes del arranque: cortes MOTOR activos, mando en neutral y pantalla inicializada.",
    icon: Gauge,
    color: "#fb7185",
    signal: "Twin engine ignition protocol",
    caption: "Una vez encendidos, llamar a la estacion de mando desde el MORSE.",
    steps: ["Activar cortes de bateria MOTOR", "Confirmar palanca en NEUTRAL", "Girar llave a posicion uno hasta encender pantalla", "Girar a arranque y llamar mando MORSE"],
    hotspots: [
      { x: 36, y: 52, label: "Neutral", text: "El mando debe quedar centrado antes de cada arranque." },
      { x: 67, y: 35, label: "Llave", text: "Primero energiza pantalla; despues habilita arranque." },
    ],
    stats: [
      ["Potencia max", "956 kW"],
      ["Propulsion", "Eje"],
      ["Control", "MORSE"],
    ],
  },
  {
    id: "generator",
    nav: "Grupo",
    eyebrow: "Secuencia 06",
    title: "Grupo electrogeno",
    subtitle: "El grupo convierte la embarcacion en una plataforma autonoma de 220V.",
    icon: Radio,
    color: "#f59e0b",
    signal: "Generator source · fail-code awareness",
    caption: "Si arranca y se apaga, leer destellos o display del gabinete.",
    steps: ["Activar corte de bateria GRUPO", "Presionar una vez el tablero del grupo", "Mover selectoras a C.A. Grupo", "Levantar termicas necesarias"],
    hotspots: [
      { x: 42, y: 42, label: "Start", text: "Encendido simple desde tablero del grupo." },
      { x: 66, y: 66, label: "Termica", text: "Si no entrega 220V, revisar termica del gabinete." },
    ],
    stats: [
      ["Estado", "Standby"],
      ["Salida", "220V"],
      ["Diagnostico", "Display"],
    ],
  },
  {
    id: "water",
    nav: "Agua",
    eyebrow: "Secuencia 07",
    title: "Sistemas de agua",
    subtitle: "Agua potable presurizada, tanques interconectados y descarga sanitaria controlada.",
    icon: Droplets,
    color: "#B7C8A4",
    signal: "Potable · grey · black water",
    caption: "La bomba potable depende de su termica 12V. Los tanques poseen indicadores.",
    steps: ["Llenar por cargas laterales interconectadas", "Activar termica BOMBA POTABLE", "Verificar indicadores de negras y grises", "Vaciar por WASTE en puerto o bomba en aguas abiertas"],
    hotspots: [
      { x: 35, y: 33, label: "480 L", text: "Capacidad maxima de agua potable segun manual." },
      { x: 68, y: 62, label: "Waste", text: "Tomas de cubierta para aspiracion de desechos en puerto." },
    ],
    stats: [
      ["Potable", "480 L"],
      ["Negras", "2 tanques"],
      ["Grises", "2 tanques"],
    ],
  },
  {
    id: "safety",
    nav: "Seguridad",
    eyebrow: "Secuencia 08",
    title: "Seguridad activa",
    subtitle: "Incendio, calefaccion y achique se tratan como sistemas criticos, no accesorios.",
    icon: Shield,
    color: "#ef4444",
    signal: "Fire · bilge · supervised heating",
    caption: "Nunca abrir sala de maquinas ante incendio sin accionar matafuego y cortes de combustible.",
    steps: ["Sistema automatico de sala se dispara a 70 C", "Disparadores manuales cortan combustible y extinguen", "Bombas de achique en automatico", "Calefactor diesel siempre supervisado"],
    hotspots: [
      { x: 44, y: 30, label: "70 C", text: "Temperatura de disparo del sistema automatico en sala de maquinas." },
      { x: 66, y: 64, label: "Achique", text: "Luz azul y alarma sonora si se activa una bomba." },
    ],
    stats: [
      ["Incendio", "Auto"],
      ["Achique", "AUTO"],
      ["VHF", "Canal 16"],
    ],
  },
  {
    id: "emergency",
    nav: "Emergencia",
    eyebrow: "Secuencia 09",
    title: "Modo emergencia",
    subtitle: "Procedimientos claros, visibles y accionables para momentos donde cada segundo importa.",
    icon: AlertTriangle,
    color: "#f43f5e",
    signal: "SOS layer · VHF 16 · Prefectura 106",
    caption: "El panel mantiene un acceso directo a emergencia desde la navegacion principal.",
    steps: ["Cortar motores si corresponde", "Activar protocolo segun incidente", "Comunicar posicion y personas a bordo", "Mantener procedimientos visibles"],
    hotspots: [
      { x: 29, y: 52, label: "SOS", text: "Abre procedimientos de incendio, hombre al agua e ingreso de agua." },
      { x: 72, y: 42, label: "VHF 16", text: "Canal internacional de emergencia." },
    ],
    stats: [
      ["Prefectura", "106"],
      ["Guardia", "0800"],
      ["Radio", "CH16"],
    ],
  },
  {
    id: "troubleshoot",
    nav: "Fallas",
    eyebrow: "Secuencia 10",
    title: "Solucion de problemas",
    subtitle: "El manual se transforma en una matriz guiada: baja bateria, falta de 220V y fallas del grupo.",
    icon: Wrench,
    color: "#c084fc",
    signal: "Guided recovery matrix",
    caption: "Los paralelos son recursos temporales: desconectarlos una vez resuelto el problema.",
    steps: ["Un motor bajo: activar paralelo de motor y arrancar ambos", "Ambos motores bajos: sumar servicio y paralelo de servicio", "Grupo bajo: servicio + grupo + paralelo de grupo", "Sin 220V: revisar modo, consumos OFF y termicas de sala"],
    hotspots: [
      { x: 38, y: 43, label: "Paralelo", text: "Puentea bancos solo para recuperacion o carga." },
      { x: 70, y: 62, label: "Service", text: "Si persiste la falla electrica, llamar a tecnico especializado." },
    ],
    stats: [
      ["Motor", "Paralelo"],
      ["220V", "Selector"],
      ["Grupo", "Codigo"],
    ],
  },
];

const slideVariants = {
  enter: { opacity: 0, scale: 0.985, y: 18, filter: "blur(10px)" },
  center: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 1.012, y: -16, filter: "blur(10px)" },
};

function clampStep(value) {
  return Math.max(0, Math.min(modules.length - 1, value));
}

function useTone(enabled) {
  const ctxRef = useRef(null);
  return useCallback(
    (freq = 520, duration = 0.08) => {
      if (!enabled) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = ctxRef.current || new AudioContext();
        ctxRef.current = ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.015);
      } catch {
        /* Audio is optional and can be blocked by the browser. */
      }
    },
    [enabled]
  );
}

export default function OnboardingExperience({
  open,
  userId = "anon",
  vesselName,
  onClose,
  onGoTo,
  onEmergency,
}) {
  const keys = useMemo(() => getOnboardingStorageKeys(userId), [userId]);
  const savedStep = Number(readOnboardingStorage(keys.step, "0"));
  const [step, setStep] = useState(clampStep(Number.isFinite(savedStep) ? savedStep : 0));
  const completedFromStorage = useMemo(() => {
    const raw = readOnboardingStorage(keys.completed, "[]");
    try {
      return new Set(JSON.parse(raw));
    } catch {
      return new Set();
    }
  }, [keys.completed]);
  const [activeHotspot, setActiveHotspot] = useState(0);
  const [sound, setSound] = useState(false);
  const tone = useTone(sound);

  const current = modules[step];
  const progress = Math.round(((step + 1) / modules.length) * 100);

  const close = useCallback((done = false) => {
    if (done) writeOnboardingStorage(keys.done, "1");
    onClose?.(done);
  }, [keys.done, onClose]);

  const go = useCallback((delta) => {
    tone(delta > 0 ? 620 : 390);
    setStep((prev) => clampStep(prev + delta));
    setActiveHotspot(0);
  }, [tone]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    writeOnboardingStorage(keys.step, String(step));
    const next = new Set(completedFromStorage);
    next.add(step);
    writeOnboardingStorage(keys.completed, JSON.stringify([...next]));
  }, [completedFromStorage, keys.completed, keys.step, open, step]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") close(false);
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, go, open]);

  const jumpTo = (index) => {
    tone(520 + index * 18, 0.06);
    setStep(clampStep(index));
    setActiveHotspot(0);
  };

  const finish = () => {
    tone(760, 0.14);
    writeOnboardingStorage(keys.step, String(modules.length - 1));
    writeOnboardingStorage(keys.done, "1");
    onClose?.(true);
  };

  const skip = () => {
    writeOnboardingStorage(keys.done, "1");
    onClose?.(true);
  };

  if (!open) return null;

  const Icon = current.icon;

  return (
    <AnimatePresence>
      <Motion.div
        className="ka-onboarding"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 1, 0.35, 1] }}
      >
        <style>{ONBOARDING_CSS}</style>

        <div className="ka-orb ka-orb-a" />
        <div className="ka-orb ka-orb-b" />
        <div className="ka-grid" />
        <ParticleField />

        <header className="ka-on-topbar">
          <div className="ka-brand-mark">
            <img src={logoK} alt="Klase A" />
            <div>
              <span>Klase A</span>
              <small>Marcando tendencia</small>
            </div>
          </div>
          <div className="ka-top-status">
            <span>{vesselName || "K52 HT"}</span>
            <span>{String(step + 1).padStart(2, "0")} / {String(modules.length).padStart(2, "0")}</span>
            <button type="button" onClick={() => { setSound((v) => !v); tone(500); }} aria-label="Alternar sonido">
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button type="button" onClick={() => close(false)} aria-label="Cerrar introduccion">
              <X size={18} />
            </button>
          </div>
        </header>

        <main className="ka-on-main">
          <aside className="ka-module-rail" aria-label="Modulos de introduccion">
            {modules.map((item, index) => {
              const DoneIcon = index <= step || completedFromStorage.has(index) ? Check : item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={index === step ? "is-active" : ""}
                  onClick={() => jumpTo(index)}
                  style={{ "--module-color": item.color }}
                >
                  <span className="ka-rail-index">{String(index + 1).padStart(2, "0")}</span>
                  <DoneIcon size={15} />
                  <span>{item.nav}</span>
                </button>
              );
            })}
          </aside>

          <section className="ka-stage" style={{ "--accent": current.color }}>
            <AnimatePresence mode="wait">
              <Motion.article
                key={current.id}
                className="ka-slide"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.62, ease: [0.25, 1, 0.35, 1] }}
              >
                <div className="ka-slide-visual">
                  <div className="ka-hero-image">
                    <img src={k52Hero} alt="" />
                    <div className="ka-holo-ring" />
                    <div className="ka-scanline" />
                    <VisualSystem moduleId={current.id} color={current.color} />
                    {current.hotspots.map((spot, index) => (
                      <button
                        key={spot.label}
                        type="button"
                        className={`ka-hotspot ${activeHotspot === index ? "is-hot" : ""}`}
                        style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                        onClick={() => { setActiveHotspot(index); tone(560 + index * 70, 0.06); }}
                      >
                        <span />
                      </button>
                    ))}
                  </div>

                  <div className="ka-hotspot-panel">
                    <span>{current.hotspots[activeHotspot]?.label}</span>
                    <p>{current.hotspots[activeHotspot]?.text}</p>
                  </div>
                </div>

                <div className="ka-slide-copy">
                  <div className="ka-kicker">
                    <span><Icon size={16} /></span>
                    {current.eyebrow}
                  </div>
                  <h1>{current.title}</h1>
                  <p className="ka-lead">{current.subtitle}</p>

                  <div className="ka-signal">
                    <span />
                    <p>{current.signal}</p>
                  </div>

                  <div className="ka-step-list">
                    {current.steps.map((item, index) => (
                      <Motion.div
                        key={item}
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.12 + index * 0.055 }}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <p>{item}</p>
                      </Motion.div>
                    ))}
                  </div>

                  <div className="ka-stats-row">
                    {current.stats.map(([label, value]) => (
                      <div key={label}>
                        <strong>{value}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>

                  <p className="ka-caption">{current.caption}</p>
                </div>
              </Motion.article>
            </AnimatePresence>
          </section>
        </main>

        <footer className="ka-on-footer">
          <div className="ka-progress-wrap">
            <span>{progress}% completado</span>
            <div className="ka-progress"><div style={{ width: `${progress}%`, background: current.color }} /></div>
          </div>
          <div className="ka-actions">
            <button type="button" className="ka-ghost" onClick={skip}>Saltar introduccion</button>
            {current.id === "emergency" && (
              <button type="button" className="ka-danger" onClick={onEmergency}>
                <AlertTriangle size={15} /> Abrir SOS
              </button>
            )}
            {current.id === "troubleshoot" && (
              <button type="button" className="ka-ghost" onClick={() => onGoTo?.("soporte")}>
                Soporte tecnico
              </button>
            )}
            <button type="button" className="ka-icon-btn" onClick={() => go(-1)} disabled={step === 0} aria-label="Anterior">
              <ChevronLeft size={18} />
            </button>
            {step < modules.length - 1 ? (
              <button type="button" className="ka-primary" onClick={() => go(1)}>
                Continuar <ChevronRight size={17} />
              </button>
            ) : (
              <button type="button" className="ka-primary" onClick={finish}>
                Entrar al panel <Play size={16} />
              </button>
            )}
          </div>
        </footer>
      </Motion.div>
    </AnimatePresence>
  );
}

function ParticleField() {
  return (
    <div className="ka-particles" aria-hidden="true">
      {Array.from({ length: 34 }).map((_, index) => (
        <span
          key={index}
          style={{
            left: `${(index * 29) % 100}%`,
            top: `${(index * 47) % 100}%`,
            animationDelay: `${(index % 9) * 0.35}s`,
            animationDuration: `${5 + (index % 7)}s`,
          }}
        />
      ))}
    </div>
  );
}

function VisualSystem({ moduleId, color }) {
  const nodes = {
    welcome: ["OS", "K52", "NAV", "HMI"],
    batteries: ["MOTOR", "SERV", "GRP", "BOW"],
    twelve: ["BOMBA", "LUCES", "NAV", "AUX"],
    twenty: ["SHORE", "GEN", "INV", "LOAD"],
    energy: ["TIERRA", "GRUPO", "INV", "BAT"],
    engines: ["PORT", "STBD", "RPM", "MORSE"],
    generator: ["START", "AC", "LOAD", "CODE"],
    water: ["H2O", "GREY", "BLACK", "PUMP"],
    safety: ["FIRE", "BILGE", "AUTO", "VHF"],
    emergency: ["SOS", "MAYDAY", "GPS", "CH16"],
    troubleshoot: ["LOW", "PAR", "220V", "TECH"],
  }[moduleId] || ["SYS", "BUS", "NAV", "OK"];

  return (
    <svg className="ka-visual-svg" viewBox="0 0 640 420" aria-hidden="true">
      <defs>
        <filter id={`glow-${moduleId}`}>
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d="M94 212 C190 82 420 76 548 214" fill="none" stroke={color} strokeOpacity="0.22" strokeWidth="1" />
      <path d="M104 292 C236 354 420 354 536 292" fill="none" stroke={color} strokeOpacity="0.18" strokeWidth="1" strokeDasharray="8 12" />
      <circle cx="320" cy="210" r="94" fill="none" stroke={color} strokeOpacity="0.2" strokeWidth="1" />
      <circle cx="320" cy="210" r="142" fill="none" stroke={color} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="4 10" />
      {[
        [132, 150],
        [508, 150],
        [158, 292],
        [482, 292],
      ].map(([x, y], index) => (
        <g key={nodes[index]} filter={`url(#glow-${moduleId})`}>
          <line x1="320" y1="210" x2={x} y2={y} stroke={color} strokeOpacity="0.16" />
          <rect x={x - 48} y={y - 19} width="96" height="38" rx="8" fill="rgba(2,6,23,.72)" stroke={color} strokeOpacity="0.34" />
          <text x={x} y={y + 4} textAnchor="middle" fill={color} style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
            {nodes[index]}
          </text>
        </g>
      ))}
      <circle cx="320" cy="210" r="9" fill={color} opacity="0.75" />
      <circle cx="320" cy="210" r="21" fill="none" stroke={color} strokeOpacity="0.38">
        <animate attributeName="r" values="21;34;21" dur="2.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values=".38;.08;.38" dur="2.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

const ONBOARDING_CSS = `
.ka-onboarding {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow: hidden;
  color: #f8fafc;
  background:
    radial-gradient(circle at 18% 18%, rgba(216, 195, 161, .13), transparent 34%),
    radial-gradient(circle at 78% 24%, rgba(167, 139, 250, .11), transparent 32%),
    linear-gradient(135deg, #020617 0%, #07111f 48%, #020617 100%);
  font-family: "Plus Jakarta Sans", "Inter", system-ui, sans-serif;
}
.ka-onboarding * { box-sizing: border-box; }
.ka-grid {
  position: absolute;
  inset: 0;
  opacity: .18;
  background-image:
    linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: radial-gradient(circle at center, black, transparent 75%);
}
.ka-orb {
  position: absolute;
  width: 42vw;
  aspect-ratio: 1;
  border-radius: 50%;
  filter: blur(70px);
  opacity: .24;
  pointer-events: none;
}
.ka-orb-a { left: -16vw; top: 10vh; background: #0891b2; }
.ka-orb-b { right: -12vw; bottom: -10vh; background: #7c3aed; }
.ka-particles { position:absolute; inset:0; pointer-events:none; }
.ka-particles span {
  position:absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: rgba(255,255,255,.7);
  box-shadow: 0 0 18px rgba(216,195,161,.65);
  animation: kaFloat linear infinite;
}
.ka-on-topbar, .ka-on-footer {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px clamp(18px, 3vw, 44px);
}
.ka-brand-mark { display:flex; align-items:center; gap:13px; }
.ka-brand-mark img { width: 32px; height: 32px; object-fit: contain; filter: grayscale(1) brightness(2.4); }
.ka-brand-mark span {
  display:block;
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .34em;
}
.ka-brand-mark small {
  display:block;
  margin-top: 4px;
  color: rgba(148,163,184,.9);
  font-size: 10px;
  letter-spacing: .16em;
}
.ka-top-status { display:flex; align-items:center; gap:12px; }
.ka-top-status > span {
  color: rgba(226,232,240,.72);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  letter-spacing: .12em;
}
.ka-top-status button, .ka-icon-btn {
  width: 38px;
  height: 38px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.13);
  background: rgba(255,255,255,.045);
  color: rgba(226,232,240,.86);
  cursor: pointer;
  backdrop-filter: blur(18px);
}
.ka-on-main {
  position: relative;
  z-index: 3;
  height: calc(100vh - 148px);
  display: grid;
  grid-template-columns: minmax(150px, 190px) 1fr;
  gap: clamp(16px, 2vw, 28px);
  padding: 0 clamp(18px, 3vw, 44px);
}
.ka-module-rail {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.ka-module-rail button {
  min-height: 42px;
  display:grid;
  grid-template-columns: 28px 18px 1fr;
  align-items:center;
  gap: 8px;
  border: 1px solid rgba(255,255,255,.07);
  background: rgba(255,255,255,.035);
  color: rgba(203,213,225,.64);
  border-radius: 10px;
  padding: 8px 10px;
  text-align:left;
  cursor:pointer;
  transition: transform .2s ease, border-color .2s ease, background .2s ease, color .2s ease;
}
.ka-module-rail button:hover,
.ka-module-rail button.is-active {
  color: #fff;
  border-color: color-mix(in srgb, var(--module-color) 52%, rgba(255,255,255,.18));
  background: color-mix(in srgb, var(--module-color) 14%, rgba(255,255,255,.045));
  transform: translateX(3px);
}
.ka-rail-index {
  color: color-mix(in srgb, var(--module-color) 78%, #fff);
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  font-weight: 800;
}
.ka-module-rail button span:last-child {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.ka-stage {
  min-width: 0;
  display: grid;
  align-items: stretch;
}
.ka-slide {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(360px, 1.08fr) minmax(350px, .92fr);
  gap: clamp(22px, 3vw, 44px);
  align-items: center;
}
.ka-slide-visual {
  position: relative;
  min-height: min(66vh, 650px);
  border-radius: 28px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(2,6,23,.34);
  overflow: hidden;
  box-shadow: 0 34px 110px rgba(0,0,0,.44), inset 0 1px 0 rgba(255,255,255,.08);
  backdrop-filter: blur(24px);
}
.ka-hero-image { position:absolute; inset:0; overflow:hidden; }
.ka-hero-image img {
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  object-fit: cover;
  object-position: center;
  opacity: .5;
  filter: saturate(.78) contrast(1.1) brightness(.72);
  animation: kaKen 16s ease-out both;
}
.ka-hero-image::after {
  content:"";
  position:absolute;
  inset:0;
  background:
    linear-gradient(110deg, rgba(2,6,23,.94), rgba(2,6,23,.34) 48%, rgba(2,6,23,.9)),
    radial-gradient(circle at 50% 50%, transparent 0 28%, rgba(2,6,23,.72) 72%);
}
.ka-holo-ring {
  position:absolute;
  left:50%;
  top:50%;
  width:min(72%, 520px);
  aspect-ratio:1;
  border-radius:50%;
  transform: translate(-50%,-50%);
  border:1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  box-shadow: inset 0 0 40px color-mix(in srgb, var(--accent) 8%, transparent), 0 0 50px color-mix(in srgb, var(--accent) 9%, transparent);
  z-index:2;
  animation: kaRotate 28s linear infinite;
}
.ka-holo-ring::before,
.ka-holo-ring::after {
  content:"";
  position:absolute;
  inset: 12%;
  border-radius: inherit;
  border: 1px dashed color-mix(in srgb, var(--accent) 35%, transparent);
}
.ka-holo-ring::after { inset: 28%; animation: kaRotate 16s linear reverse infinite; }
.ka-scanline {
  position:absolute;
  left:0;
  right:0;
  top:0;
  height:1px;
  z-index:3;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 80%, white), transparent);
  animation: kaScan 4.2s ease-in-out infinite;
}
.ka-visual-svg {
  position:absolute;
  inset: 6% 4%;
  width:92%;
  height:88%;
  z-index:3;
  opacity:.9;
}
.ka-hotspot {
  position:absolute;
  z-index:5;
  width:44px;
  height:44px;
  margin-left:-22px;
  margin-top:-22px;
  border:0;
  border-radius:50%;
  background: transparent;
  cursor:pointer;
}
.ka-hotspot span {
  position:absolute;
  inset:12px;
  border-radius:50%;
  background: var(--accent);
  box-shadow: 0 0 18px var(--accent);
}
.ka-hotspot::before {
  content:"";
  position:absolute;
  inset:0;
  border-radius:50%;
  border:1px solid var(--accent);
  animation: kaPulse 1.7s ease-out infinite;
}
.ka-hotspot.is-hot span { background:#fff; }
.ka-hotspot-panel {
  position:absolute;
  z-index:6;
  left:22px;
  right:22px;
  bottom:22px;
  padding:18px 20px;
  border-radius:18px;
  border:1px solid rgba(255,255,255,.12);
  background: rgba(2,6,23,.68);
  backdrop-filter: blur(20px);
}
.ka-hotspot-panel span {
  display:block;
  color: var(--accent);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .24em;
  text-transform: uppercase;
}
.ka-hotspot-panel p {
  margin:8px 0 0;
  color: rgba(226,232,240,.82);
  font-size: 14px;
  line-height: 1.55;
}
.ka-slide-copy { min-width:0; }
.ka-kicker {
  display:inline-flex;
  align-items:center;
  gap:10px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .28em;
  text-transform: uppercase;
}
.ka-kicker span {
  width:34px;
  height:34px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius:999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border:1px solid color-mix(in srgb, var(--accent) 36%, transparent);
}
.ka-slide-copy h1 {
  margin: 22px 0 0;
  color:#fff;
  max-width: 780px;
  font-size: clamp(44px, 6vw, 86px);
  line-height: .96;
  font-weight: 700;
  letter-spacing: 0;
}
.ka-lead {
  margin: 22px 0 0;
  max-width: 650px;
  color: rgba(226,232,240,.72);
  font-size: clamp(16px, 1.6vw, 20px);
  line-height: 1.65;
}
.ka-signal {
  margin-top: 22px;
  display:flex;
  align-items:center;
  gap:12px;
  color: rgba(255,255,255,.52);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.ka-signal span {
  width:8px;
  height:8px;
  border-radius:50%;
  background: var(--accent);
  box-shadow: 0 0 18px var(--accent);
}
.ka-step-list {
  margin-top: 30px;
  display:grid;
  gap:10px;
}
.ka-step-list > div {
  display:grid;
  grid-template-columns: 38px 1fr;
  align-items:center;
  gap:12px;
  padding: 12px 14px;
  border-radius: 14px;
  border:1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.035);
}
.ka-step-list span {
  color: var(--accent);
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  font-weight: 900;
}
.ka-step-list p {
  margin:0;
  color: rgba(241,245,249,.86);
  font-size: 14px;
  line-height: 1.35;
}
.ka-stats-row {
  margin-top:22px;
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap:10px;
}
.ka-stats-row div {
  padding:14px;
  border-radius: 14px;
  border:1px solid rgba(255,255,255,.08);
  background: rgba(2,6,23,.4);
}
.ka-stats-row strong {
  display:block;
  color:#fff;
  font-family:"JetBrains Mono", monospace;
  font-size: 17px;
}
.ka-stats-row span {
  display:block;
  margin-top:6px;
  color: rgba(148,163,184,.78);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.ka-caption {
  margin:18px 0 0;
  color: rgba(148,163,184,.7);
  font-size: 13px;
  line-height:1.55;
}
.ka-on-footer { gap:16px; }
.ka-progress-wrap {
  min-width: 240px;
  flex: 1;
  max-width: 560px;
}
.ka-progress-wrap span {
  display:block;
  margin-bottom:9px;
  color: rgba(203,213,225,.7);
  font-family:"JetBrains Mono", monospace;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.ka-progress {
  height: 4px;
  border-radius: 999px;
  overflow:hidden;
  background: rgba(255,255,255,.08);
}
.ka-progress div {
  height:100%;
  border-radius: inherit;
  transition: width .52s cubic-bezier(.25,1,.35,1);
  box-shadow: 0 0 20px currentColor;
}
.ka-actions {
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:10px;
  flex-wrap:wrap;
}
.ka-primary,
.ka-ghost,
.ka-danger {
  min-height: 42px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:9px;
  border-radius: 999px;
  padding: 0 18px;
  cursor:pointer;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.ka-primary {
  border: 0;
  background: #f8fafc;
  color: #020617;
  box-shadow: 0 12px 36px rgba(255,255,255,.16);
}
.ka-ghost {
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.045);
  color: rgba(226,232,240,.76);
}
.ka-danger {
  border: 1px solid rgba(244,63,94,.34);
  background: rgba(244,63,94,.12);
  color: #fda4af;
}
.ka-icon-btn:disabled {
  opacity:.32;
  cursor:not-allowed;
}
@keyframes kaFloat {
  from { transform: translate3d(0, 0, 0); opacity:0; }
  20% { opacity:.7; }
  to { transform: translate3d(18px, -56px, 0); opacity:0; }
}
@keyframes kaKen {
  from { transform: scale(1.08); }
  to { transform: scale(1); }
}
@keyframes kaRotate {
  from { transform: translate(-50%,-50%) rotate(0deg); }
  to { transform: translate(-50%,-50%) rotate(360deg); }
}
@keyframes kaPulse {
  from { transform: scale(.55); opacity:.8; }
  to { transform: scale(1.5); opacity:0; }
}
@keyframes kaScan {
  0% { transform: translateY(-10px); opacity:0; }
  12% { opacity:.9; }
  88% { opacity:.9; }
  100% { transform: translateY(74vh); opacity:0; }
}
@media (max-width: 1100px) {
  .ka-on-main {
    height: calc(100vh - 162px);
    grid-template-columns: 1fr;
  }
  .ka-module-rail {
    order:2;
    flex-direction: row;
    justify-content:flex-start;
    overflow-x:auto;
    padding-bottom: 6px;
  }
  .ka-module-rail button {
    min-width: 140px;
  }
  .ka-slide {
    grid-template-columns: 1fr;
    gap: 20px;
    align-content:start;
    overflow-y:auto;
    padding-right: 4px;
  }
  .ka-slide-visual { min-height: 38vh; }
  .ka-slide-copy h1 { font-size: clamp(38px, 8vw, 66px); }
}
@media (max-width: 720px) {
  .ka-on-topbar {
    padding: 14px 14px;
    gap: 10px;
  }
  .ka-brand-mark small,
  .ka-top-status > span:first-child {
    display:none;
  }
  .ka-on-main {
    height: calc(100vh - 182px);
    padding: 0 14px;
  }
  .ka-slide-visual {
    min-height: 300px;
    border-radius: 22px;
  }
  .ka-stats-row { grid-template-columns: 1fr; }
  .ka-on-footer {
    align-items: stretch;
    flex-direction: column;
    padding: 12px 14px 16px;
  }
  .ka-progress-wrap { max-width:none; width:100%; }
  .ka-actions { justify-content:space-between; }
  .ka-ghost { display:none; }
  .ka-primary { flex:1; }
}
`;
