import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, ChevronRight, Clock3, RefreshCw, Send, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { C } from "@/theme";
import { fetchComprasAvisos, fetchPurchaseRequests } from "@/features/compras/purchaseRequestsApi";

const ARCHIVED = new Set(["recibido", "cancelado"]);
const STATUS_LABELS = {
  nuevo: "nuevos",
  en_revision: "en revisión",
  cotizando: "cotizando",
  comprado: "comprados",
};

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value) {
  const date = dateOnly(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
}

function dueDate(request) {
  return request.fecha_necesaria || request.fecha_limite || request.due_date || request.needed_by || null;
}

function shortName(request) {
  return request.title || request.titulo || request.description || "Pedido sin título";
}

function buildMetrics(requests, avisos) {
  const open = requests.filter((request) => !ARCHIVED.has(request.status));
  const overdue = open.filter((request) => {
    const days = daysUntil(dueDate(request));
    return days !== null && days < 0;
  });
  const urgent = open.filter((request) => request.priority === "urgente");
  const byStatus = Object.fromEntries(Object.keys(STATUS_LABELS).map((key) => [key, open.filter((request) => request.status === key)]));
  const activeAvisos = (avisos || []).filter((aviso) => !["resuelto", "cerrado", "cancelado"].includes(aviso.estado));
  return { open, overdue, urgent, byStatus, activeAvisos };
}

function formatList(items, emptyText, formatter = shortName) {
  if (!items.length) return emptyText;
  return items.slice(0, 3).map(formatter).join(" · ") + (items.length > 3 ? ` · +${items.length - 3}` : "");
}

function answerFor(question, metrics) {
  const q = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (q.includes("urg")) {
    return metrics.urgent.length
      ? `Tenés ${metrics.urgent.length} pedido${metrics.urgent.length === 1 ? " urgente" : "s urgentes"}: ${formatList(metrics.urgent, "")}.`
      : "No hay pedidos urgentes abiertos. Bicho respira un poco mejor.";
  }
  if (q.includes("venc") || q.includes("atras")) {
    return metrics.overdue.length
      ? `Hay ${metrics.overdue.length} pedido${metrics.overdue.length === 1 ? " vencido" : "s vencidos"}: ${formatList(metrics.overdue, "")}.`
      : "No hay pedidos vencidos. La agenda está bajo control.";
  }
  if (q.includes("nuevo") || q.includes("entr")) {
    const list = metrics.byStatus.nuevo || [];
    return list.length ? `Hay ${list.length} nuevos para revisar: ${formatList(list, "")}.` : "No hay pedidos nuevos esperando revisión.";
  }
  if (q.includes("compr") || q.includes("recib")) {
    const list = metrics.byStatus.comprado || [];
    return list.length ? `Hay ${list.length} comprados esperando recepción o cierre: ${formatList(list, "")}.` : "No hay pedidos comprados pendientes de recepción.";
  }
  if (q.includes("aviso") || q.includes("mensaje")) {
    return metrics.activeAvisos.length ? `Tenés ${metrics.activeAvisos.length} aviso${metrics.activeAvisos.length === 1 ? " nuevo" : "s abiertos"} para revisar.` : "No hay avisos abiertos.";
  }
  return `Resumen: ${metrics.open.length} pedidos abiertos, ${metrics.byStatus.nuevo?.length || 0} nuevos, ${metrics.urgent.length} urgentes y ${metrics.activeAvisos.length} avisos abiertos.`;
}

function Cat({ mood }) {
  return (
    <span className={`bicho-cat bicho-cat-${mood}`} aria-hidden="true">
      <span className="bicho-ear bicho-ear-left" />
      <span className="bicho-ear bicho-ear-right" />
      <span className="bicho-head">
        <span className="bicho-eye bicho-eye-left" />
        <span className="bicho-eye bicho-eye-right" />
        <span className="bicho-nose" />
        <span className="bicho-mouth" />
        <span className="bicho-whisker bicho-whisker-left" />
        <span className="bicho-whisker bicho-whisker-right" />
      </span>
      <span className="bicho-collar" />
    </span>
  );
}

export default function ComprasBicho({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([{ from: "bicho", text: "Hola. Soy Bicho, tu copiloto de Compras. Preguntame qué necesita atención y te ayudo a encontrarlo." }]);

  const load = async () => {
    setLoading(true);
    try {
      const [nextRequests, nextAvisos] = await Promise.all([
        fetchPurchaseRequests(),
        fetchComprasAvisos().catch(() => []),
      ]);
      setRequests(nextRequests || []);
      setAvisos(nextAvisos || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.role !== "compras") return undefined;
    load().catch(() => {});
    const timer = window.setInterval(() => load().catch(() => {}), 60000);
    return () => window.clearInterval(timer);
  }, [profile?.role]);

  const metrics = useMemo(() => buildMetrics(requests, avisos), [requests, avisos]);
  const mood = metrics.overdue.length || metrics.urgent.length ? "alerta" : metrics.byStatus.nuevo?.length >= 8 ? "atento" : metrics.byStatus.nuevo?.length ? "curioso" : "feliz";
  const moodColor = mood === "alerta" ? C.red : mood === "atento" ? C.amber : mood === "curioso" ? C.blue : C.green;
  const headline = metrics.overdue.length ? `${metrics.overdue.length} vencido${metrics.overdue.length === 1 ? "" : "s"}` : metrics.urgent.length ? `${metrics.urgent.length} urgente${metrics.urgent.length === 1 ? "" : "s"}` : metrics.byStatus.nuevo?.length ? `${metrics.byStatus.nuevo.length} para revisar` : "Bandeja tranquila";
  const isOnPurchases = location.pathname === "/compras";

  if (profile?.role !== "compras") return null;

  function ask(text = question) {
    const clean = text.trim();
    if (!clean) return;
    const response = answerFor(clean, metrics);
    setMessages((prev) => [...prev.slice(-5), { from: "you", text: clean }, { from: "bicho", text: response }]);
    setQuestion("");
  }

  function goToRequest(request) {
    setOpen(false);
    navigate(`/compras?open=${request.id}`);
  }

  return (
    <>
      <style>{`
        .bicho-launcher { position: fixed; right: 22px; bottom: 78px; z-index: 120; display: flex; align-items: center; gap: 9px; border: 1px solid var(--bicho-color); border-radius: 18px; padding: 7px 12px 7px 7px; background: color-mix(in srgb, var(--panel-solid) 90%, var(--bicho-color)); color: var(--text); box-shadow: 0 12px 32px rgba(15,23,42,.18); cursor: pointer; transition: transform .18s ease, box-shadow .18s ease; }
        .bicho-launcher:hover { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(15,23,42,.23); }
        .bicho-launcher:focus-visible, .bicho-panel button:focus-visible, .bicho-panel input:focus-visible { outline: 3px solid color-mix(in srgb, var(--bicho-color) 30%, transparent); outline-offset: 2px; }
        .bicho-copy { display: grid; gap: 1px; text-align: left; }
        .bicho-copy strong { font-size: 12px; letter-spacing: .02em; }
        .bicho-copy small { font-size: 10px; color: var(--dim); font-weight: 700; }
        .bicho-cat { position: relative; display: block; width: 38px; height: 39px; flex: 0 0 auto; }
        .bicho-head { position: absolute; left: 4px; top: 8px; width: 30px; height: 25px; border: 2px solid var(--bicho-color); border-radius: 46% 46% 43% 43%; background: color-mix(in srgb, var(--bicho-color) 13%, var(--panel-solid)); }
        .bicho-ear { position: absolute; top: 5px; width: 13px; height: 14px; border: 2px solid var(--bicho-color); background: color-mix(in srgb, var(--bicho-color) 13%, var(--panel-solid)); transform: rotate(45deg); border-radius: 3px 8px 3px 8px; }
        .bicho-ear-left { left: 6px; } .bicho-ear-right { right: 6px; transform: rotate(45deg) scaleX(-1); }
        .bicho-eye { position: absolute; top: 9px; width: 4px; height: 5px; border-radius: 50%; background: var(--bicho-color); }
        .bicho-eye-left { left: 8px; } .bicho-eye-right { right: 8px; }
        .bicho-nose { position: absolute; left: 13px; top: 15px; width: 4px; height: 3px; border-radius: 50%; background: var(--bicho-color); }
        .bicho-mouth { position: absolute; left: 11px; top: 18px; width: 8px; height: 4px; border-bottom: 1.5px solid var(--bicho-color); border-radius: 0 0 50% 50%; }
        .bicho-whisker { position: absolute; top: 17px; width: 9px; height: 1px; background: var(--bicho-color); opacity: .7; } .bicho-whisker-left { left: -7px; transform: rotate(10deg); } .bicho-whisker-right { right: -7px; transform: rotate(-10deg); }
        .bicho-collar { position: absolute; left: 12px; bottom: 2px; width: 14px; height: 4px; border-radius: 8px; background: var(--bicho-color); }
        .bicho-cat-alerta .bicho-mouth, .bicho-cat-atento .bicho-mouth { transform: rotate(180deg); top: 20px; }
        .bicho-panel { position: fixed; right: 22px; bottom: 132px; z-index: 121; width: min(390px, calc(100vw - 28px)); max-height: min(650px, calc(100vh - 160px)); display: grid; grid-template-rows: auto 1fr auto auto; overflow: hidden; border: 1px solid color-mix(in srgb, var(--bicho-color) 30%, var(--border)); border-radius: 18px; background: color-mix(in srgb, var(--panel-solid) 96%, var(--bicho-color)); color: var(--text); box-shadow: 0 24px 70px rgba(15,23,42,.28); }
        .bicho-panel-head { display: flex; align-items: center; gap: 10px; padding: 13px 14px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--bicho-color) 8%, var(--panel-solid)); }
        .bicho-close { margin-left: auto; border: 0; background: transparent; color: var(--dim); cursor: pointer; padding: 5px; border-radius: 8px; }
        .bicho-close:hover { background: var(--panel-2); color: var(--text); }
        .bicho-messages { display: grid; align-content: start; gap: 8px; padding: 13px; overflow: auto; }
        .bicho-message { max-width: 89%; padding: 9px 10px; border-radius: 11px; font-size: 12px; line-height: 1.4; }
        .bicho-message-bicho { justify-self: start; background: var(--panel-2); border: 1px solid var(--border); }
        .bicho-message-you { justify-self: end; background: color-mix(in srgb, var(--bicho-color) 13%, var(--panel-solid)); border: 1px solid color-mix(in srgb, var(--bicho-color) 23%, var(--border)); }
        .bicho-quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 13px 11px; }
        .bicho-quick button { border: 1px solid var(--border); background: var(--panel-2); color: var(--text); border-radius: 999px; padding: 6px 9px; cursor: pointer; font: inherit; font-size: 10px; font-weight: 750; }
        .bicho-quick button:hover { border-color: var(--bicho-color); }
        .bicho-compose { display: flex; gap: 7px; padding: 11px 13px 13px; border-top: 1px solid var(--border); }
        .bicho-compose input { min-width: 0; flex: 1; border: 1px solid var(--border); border-radius: 10px; padding: 9px 10px; background: var(--panel); color: var(--text); font: inherit; font-size: 12px; }
        .bicho-compose button { width: 35px; border: 0; border-radius: 10px; background: var(--bicho-color); color: #fff; cursor: pointer; }
        .bicho-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 13px 12px; }
        .bicho-stat { padding: 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-2); }
        .bicho-stat strong { display: block; font: 800 16px var(--mono); color: var(--bicho-color); } .bicho-stat span { color: var(--dim); font-size: 9px; font-weight: 750; }
        .bicho-open-list { display: grid; gap: 5px; padding: 0 13px 12px; }
        .bicho-open-list button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; text-align: left; border: 1px solid var(--border); border-radius: 9px; background: var(--panel-2); color: var(--text); cursor: pointer; font: inherit; font-size: 10px; font-weight: 750; }
        .bicho-open-list button:hover { border-color: var(--bicho-color); }
        @media (max-width: 640px) { .bicho-launcher { right: 12px; bottom: 68px; } .bicho-panel { right: 12px; bottom: 122px; } .bicho-copy small { display: none; } }
      `}</style>
      <button type="button" className="bicho-launcher" style={{ "--bicho-color": moodColor }} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Abrir Bicho, asistente de Compras">
        <Cat mood={mood} />
        <span className="bicho-copy"><strong>Bicho</strong><small>{headline}{loading ? " · actualizando" : ""}</small></span>
        {metrics.activeAvisos.length > 0 && <Bell size={14} color={moodColor} />}
      </button>

      {open && (
        <section className="bicho-panel" style={{ "--bicho-color": moodColor }} aria-label="Asistente Bicho">
          <header className="bicho-panel-head">
            <Cat mood={mood} />
            <div className="bicho-copy"><strong>Bicho · Compras</strong><small>{isOnPurchases ? "Estoy mirando tu bandeja" : "Estoy disponible en cualquier pantalla"}</small></div>
            <button type="button" className="bicho-close" onClick={() => setOpen(false)} aria-label="Cerrar Bicho"><X size={16} /></button>
          </header>
          <div className="bicho-messages">
            {messages.map((message, index) => <div key={`${message.from}-${index}`} className={`bicho-message bicho-message-${message.from}`}>{message.text}</div>)}
            {metrics.overdue.length > 0 && <div className="bicho-message bicho-message-bicho"><AlertTriangle size={13} color={C.red} /> Revisá primero los vencidos; son los que pueden trabar producción.</div>}
          </div>
          <div className="bicho-stats">
            <div className="bicho-stat"><strong>{metrics.open.length}</strong><span>abiertos</span></div>
            <div className="bicho-stat"><strong>{metrics.byStatus.nuevo?.length || 0}</strong><span>nuevos</span></div>
            <div className="bicho-stat"><strong>{metrics.activeAvisos.length}</strong><span>avisos</span></div>
          </div>
          {(metrics.overdue.length || metrics.urgent.length) > 0 && (
            <div className="bicho-open-list">
              {[...metrics.overdue, ...metrics.urgent].filter((request, index, list) => list.findIndex((item) => item.id === request.id) === index).slice(0, 3).map((request) => (
                <button type="button" key={request.id} onClick={() => goToRequest(request)}><Clock3 size={13} color={moodColor} /> <span>{shortName(request)}</span><ChevronRight size={13} style={{ marginLeft: "auto" }} /></button>
              ))}
            </div>
          )}
          <div className="bicho-quick">
            <button type="button" onClick={() => ask("¿Qué es urgente?")}>¿Qué es urgente?</button>
            <button type="button" onClick={() => ask("¿Qué está vencido?")}>Vencidos</button>
            <button type="button" onClick={() => ask("¿Qué entró nuevo?")}>Nuevos</button>
            <button type="button" onClick={() => load()}><RefreshCw size={11} /> Actualizar</button>
          </div>
          <form className="bicho-compose" onSubmit={(event) => { event.preventDefault(); ask(); }}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Preguntale a Bicho..." aria-label="Pregunta para Bicho" />
            <button type="submit" aria-label="Enviar pregunta"><Send size={14} /></button>
          </form>
        </section>
      )}
    </>
  );
}
