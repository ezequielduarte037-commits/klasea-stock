import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Maximize2,
  PackageCheck,
  Radio,
  ShieldCheck,
  ShoppingBasket,
  TriangleAlert,
} from "lucide-react";
import { C } from "@/theme";
import logoK from "@/assets/logos/logo-k.png";
import {
  publishEgresoDisplay,
  readEgresoDisplay,
  subscribeEgresoDisplay,
} from "@/features/panol/egresoDisplay";

const COMPLETE_VISIBLE_MS = 45_000;

function fmtQty(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return Number(Math.round(number * 100) / 100).toLocaleString("es-AR");
}

function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function timeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function EmployeeAvatar({ employee, size = 76 }) {
  const photo = String(employee?.photoUrl || "").trim();
  return (
    <div style={{
      width: size,
      height: size,
      flexShrink: 0,
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      borderRadius: Math.round(size * 0.28),
      border: `2px solid ${C.greenB}`,
      background: C.greenL,
      color: C.green,
      fontSize: Math.round(size * 0.28),
      fontWeight: 950,
      boxShadow: `0 12px 28px -18px ${C.green}`,
    }}>
      {photo
        ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initials(employee?.name)}
    </div>
  );
}

function ProgressSteps({ status }) {
  const active = status === "complete" ? 3 : status === "identified" || status === "processing" ? 2 : status === "draft" ? 1 : 0;
  const steps = [
    ["Preparación", <ShoppingBasket key="preparacion" size={15} />],
    ["Tarjeta NFC", <CreditCard key="tarjeta" size={15} />],
    ["Confirmado", <Check key="confirmado" size={15} />],
  ];

  return (
    <div className="egreso-display-progress">
      {steps.map(([label, icon], index) => {
        const step = index + 1;
        const done = active > step || status === "complete";
        const current = active === step && status !== "complete";
        return (
          <div key={label} className="egreso-display-step">
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              border: `1px solid ${done ? C.greenB : current ? C.blueB : C.border}`,
              background: done ? C.greenL : current ? C.blueL : C.panelSolid,
              color: done ? C.green : current ? C.blue : C.dim,
            }}>
              {done ? <Check size={16} strokeWidth={3} /> : icon}
            </div>
            <span style={{ color: done ? C.green : current ? C.text : C.dim, fontSize: 12, fontWeight: 850 }}>{label}</span>
            {index < steps.length - 1 && (
              <span className="egreso-display-line" style={{ background: active > step ? C.green : C.border }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="egreso-display-empty">
      <div className="egreso-display-empty-icon">
        <ShoppingBasket size={48} strokeWidth={1.6} />
        <span className="egreso-display-pulse" />
      </div>
      <div>
        <div className="egreso-display-eyebrow">Puesto de egreso listo</div>
        <h1>Esperando el próximo retiro</h1>
        <p>Los materiales aparecerán acá a medida que pañol los cargue.</p>
      </div>
      <div className="egreso-display-hint">
        <Radio size={16} />
        Pantalla sincronizada en vivo
      </div>
    </section>
  );
}

function ItemRow({ item, index }) {
  return (
    <div className="egreso-display-item">
      <div className="egreso-display-item-index">{String(index + 1).padStart(2, "0")}</div>
      <div style={{ minWidth: 0 }}>
        <div className="egreso-display-item-name">{item.label || "Material"}</div>
        <div className="egreso-display-item-detail">
          {[item.variant, item.origin, item.destination].filter(Boolean).join(" · ") || "Egreso desde pañol"}
        </div>
      </div>
      <div className="egreso-display-item-qty">
        <strong>{fmtQty(item.quantity)}</strong>
        <span>{item.unit || "u"}</span>
      </div>
    </div>
  );
}

function StatusHero({ state }) {
  if (state.status === "complete") {
    return (
      <div className="egreso-display-status" style={{ borderColor: C.greenB, background: C.greenL }}>
        <div className="egreso-display-status-icon" style={{ color: C.green, borderColor: C.greenB, background: C.panelSolid }}>
          <CheckCircle2 size={31} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="egreso-display-eyebrow" style={{ color: C.green }}>Transacción completa</div>
          <div className="egreso-display-status-title">Retiro confirmado</div>
          <div className="egreso-display-status-copy">
            {state.employee?.name || state.retiredBy
              ? `Listo, ${state.employee?.name || state.retiredBy}. El movimiento quedó registrado.`
              : "El movimiento quedó registrado correctamente."}
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="egreso-display-status" style={{ borderColor: C.redB, background: C.redL }}>
        <div className="egreso-display-status-icon" style={{ color: C.red, borderColor: C.redB, background: C.panelSolid }}>
          <TriangleAlert size={28} />
        </div>
        <div>
          <div className="egreso-display-eyebrow" style={{ color: C.red }}>No se completó el egreso</div>
          <div className="egreso-display-status-title">Aguardá la indicación de pañol</div>
          <div className="egreso-display-status-copy">{state.error || "Se produjo un problema al registrar el movimiento."}</div>
        </div>
      </div>
    );
  }

  if (state.status === "processing") {
    return (
      <div className="egreso-display-status" style={{ borderColor: C.blueB, background: C.blueL }}>
        <div className="egreso-display-status-icon egreso-display-processing" style={{ color: C.blue, borderColor: C.blueB, background: C.panelSolid }}>
          <Clock3 size={27} />
        </div>
        <div>
          <div className="egreso-display-eyebrow" style={{ color: C.blue }}>Procesando</div>
          <div className="egreso-display-status-title">Estamos registrando tu retiro</div>
          <div className="egreso-display-status-copy">No retires la tarjeta hasta ver la confirmación.</div>
        </div>
      </div>
    );
  }

  if (state.employee) {
    return (
      <div className="egreso-display-status" style={{ borderColor: C.greenB, background: C.greenL }}>
        <EmployeeAvatar employee={state.employee} />
        <div style={{ minWidth: 0 }}>
          <div className="egreso-display-eyebrow" style={{ color: C.green }}><ShieldCheck size={14} /> Identidad validada</div>
          <div className="egreso-display-status-title">{state.employee.name}</div>
          <div className="egreso-display-status-copy">Tarjeta registrada. Pañol está confirmando el movimiento.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="egreso-display-status" style={{ borderColor: C.blueB, background: C.blueL }}>
      <div className="egreso-display-status-icon" style={{ color: C.blue, borderColor: C.blueB, background: C.panelSolid }}>
        <CreditCard size={28} />
      </div>
      <div>
        <div className="egreso-display-eyebrow" style={{ color: C.blue }}>Retiro en preparación</div>
        <div className="egreso-display-status-title">Revisá los materiales cargados</div>
        <div className="egreso-display-status-copy">Cuando esté todo correcto, apoyá tu tarjeta NFC en el lector.</div>
      </div>
    </div>
  );
}

export default function PantallaEgresoScreen() {
  const [state, setState] = useState(readEgresoDisplay);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => subscribeEgresoDisplay(setState), []);

  useEffect(() => {
    document.title = "Pantalla de egreso · KlaseA";
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (state.status !== "complete" || !state.completedAt) return undefined;
    const elapsed = Date.now() - new Date(state.completedAt).getTime();
    const remaining = Math.max(0, COMPLETE_VISIBLE_MS - elapsed);
    const timer = window.setTimeout(() => {
      publishEgresoDisplay({
        status: "idle",
        items: [],
        employee: null,
        retiredBy: "",
        destination: "",
        sector: "",
        note: "",
        totalLines: 0,
        totalUnits: 0,
        error: "",
        completedAt: null,
      });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [state.completedAt, state.status]);

  const isIdle = state.status === "idle" || !state.items?.length;
  const destination = state.destination || state.sector || "Destino a confirmar";
  const totalUnits = useMemo(
    () => state.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0,
    [state.items],
  );

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // El navegador puede bloquear fullscreen; la pantalla sigue operativa.
    }
  }

  return (
    <main className="egreso-display-shell">
      <style>{`
        .egreso-display-shell{
          position:fixed;inset:0;overflow:auto;box-sizing:border-box;
          min-height:100vh;padding:clamp(18px,2.2vw,34px);
          color:var(--text);font-family:${C.sans};
          background:
            radial-gradient(circle at 8% 0%,var(--blue-soft),transparent 32%),
            radial-gradient(circle at 96% 100%,var(--green-soft),transparent 28%),
            var(--bg);
        }
        .egreso-display-topbar{display:flex;align-items:center;gap:14px;max-width:1500px;margin:0 auto 24px}
        .egreso-display-brand{display:flex;align-items:center;gap:12px;min-width:0}
        .egreso-display-brand img{width:42px;height:42px;border-radius:13px;object-fit:cover;box-shadow:0 10px 24px -14px rgba(0,0,0,.55)}
        .egreso-display-brand strong{display:block;font-size:17px;letter-spacing:-.2px}
        .egreso-display-brand span{display:block;color:var(--dim);font-size:12px;margin-top:2px}
        .egreso-display-live{margin-left:auto;display:flex;align-items:center;gap:8px;border:1px solid var(--green-border);background:var(--green-soft);color:var(--green);border-radius:999px;padding:8px 12px;font-size:11px;font-weight:900}
        .egreso-display-live i{width:7px;height:7px;background:var(--green);border-radius:999px;box-shadow:0 0 0 4px var(--green-soft)}
        .egreso-display-fullscreen{border:1px solid var(--border);background:var(--panel-solid);color:var(--text);width:38px;height:38px;border-radius:11px;display:grid;place-items:center;cursor:pointer}
        .egreso-display-progress{max-width:1500px;margin:0 auto 22px;display:flex;align-items:center;justify-content:center;gap:0}
        .egreso-display-step{display:flex;align-items:center;gap:8px;min-width:0}
        .egreso-display-line{width:clamp(42px,8vw,130px);height:2px;margin:0 12px;border-radius:999px}
        .egreso-display-empty{max-width:900px;min-height:calc(100vh - 190px);margin:0 auto;display:grid;place-items:center;align-content:center;text-align:center;gap:24px}
        .egreso-display-empty-icon{position:relative;width:108px;height:108px;border-radius:30px;display:grid;place-items:center;color:var(--blue);border:1px solid var(--blue-border);background:var(--panel-solid);box-shadow:0 24px 70px -38px var(--blue)}
        .egreso-display-pulse{position:absolute;right:14px;bottom:14px;width:12px;height:12px;background:var(--green);border:3px solid var(--panel-solid);border-radius:999px}
        .egreso-display-empty h1{font-size:clamp(31px,4.4vw,58px);letter-spacing:-1.6px;line-height:1.02;margin:8px 0 12px}
        .egreso-display-empty p{color:var(--dim);font-size:clamp(15px,1.5vw,20px);margin:0}
        .egreso-display-hint{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;font-weight:800;border:1px solid var(--border);background:var(--panel-solid);border-radius:999px;padding:9px 13px}
        .egreso-display-eyebrow{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:950;letter-spacing:1.1px;text-transform:uppercase;color:var(--dim)}
        .egreso-display-layout{max-width:1500px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.55fr) minmax(330px,.65fr);gap:18px;align-items:start}
        .egreso-display-panel{border:1px solid var(--border);background:var(--panel-solid);border-radius:20px;overflow:hidden;box-shadow:0 28px 70px -48px rgba(0,0,0,.7)}
        .egreso-display-panel-head{padding:18px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
        .egreso-display-panel-head h1{font-size:clamp(20px,2.1vw,29px);letter-spacing:-.6px;margin:3px 0 0}
        .egreso-display-count{margin-left:auto;color:var(--dim);font-size:12px;font-weight:850;border:1px solid var(--border);background:var(--panel);border-radius:999px;padding:7px 10px;white-space:nowrap}
        .egreso-display-items{padding:10px;display:grid;gap:7px;max-height:calc(100vh - 300px);overflow:auto}
        .egreso-display-item{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:13px;padding:14px;border:1px solid var(--border);background:var(--panel);border-radius:13px}
        .egreso-display-item-index{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;border:1px solid var(--border);background:var(--panel-solid);color:var(--dim);font-family:${C.mono};font-size:11px;font-weight:900}
        .egreso-display-item-name{font-size:clamp(14px,1.3vw,18px);font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .egreso-display-item-detail{color:var(--dim);font-size:11px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .egreso-display-item-qty{text-align:right;display:flex;align-items:baseline;gap:6px;white-space:nowrap}
        .egreso-display-item-qty strong{font-family:${C.mono};font-size:clamp(20px,2.2vw,30px);letter-spacing:-1px}
        .egreso-display-item-qty span{color:var(--dim);font-size:12px;font-weight:850}
        .egreso-display-side{display:grid;gap:12px}
        .egreso-display-status{border:1px solid;min-height:104px;border-radius:18px;padding:18px;display:flex;align-items:center;gap:15px}
        .egreso-display-status-icon{width:62px;height:62px;border:1px solid;border-radius:18px;display:grid;place-items:center;flex-shrink:0}
        .egreso-display-status-title{font-size:clamp(20px,2vw,28px);font-weight:950;letter-spacing:-.6px;line-height:1.08;margin-top:5px}
        .egreso-display-status-copy{color:var(--muted);font-size:13px;line-height:1.45;margin-top:6px}
        .egreso-display-summary{padding:18px;display:grid;gap:16px}
        .egreso-display-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
        .egreso-display-summary-card{border:1px solid var(--border);background:var(--panel);border-radius:13px;padding:13px}
        .egreso-display-summary-card span{display:block;color:var(--dim);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.8px}
        .egreso-display-summary-card strong{display:block;font-family:${C.mono};font-size:22px;margin-top:6px}
        .egreso-display-destination{border-top:1px solid var(--border);padding-top:15px}
        .egreso-display-destination strong{display:block;font-size:17px;margin-top:6px}
        .egreso-display-destination p{color:var(--dim);font-size:12px;line-height:1.45;margin:5px 0 0}
        .egreso-display-processing svg{animation:egreso-tick 1.2s ease-in-out infinite}
        @keyframes egreso-tick{50%{transform:rotate(12deg) scale(1.06)}}
        @media(max-width:900px){
          .egreso-display-layout{grid-template-columns:1fr}
          .egreso-display-items{max-height:none}
          .egreso-display-side{grid-row:1}
          .egreso-display-progress span:not(.egreso-display-line){display:none}
        }
        @media(max-width:560px){
          .egreso-display-shell{padding:14px}
          .egreso-display-brand span,.egreso-display-live{display:none}
          .egreso-display-progress{margin-bottom:14px}
          .egreso-display-line{width:38px;margin:0 6px}
          .egreso-display-item{grid-template-columns:34px minmax(0,1fr);gap:9px}
          .egreso-display-item-index{width:32px;height:32px}
          .egreso-display-item-qty{grid-column:2;text-align:left;justify-content:flex-start}
        }
        @media(prefers-reduced-motion:reduce){.egreso-display-processing svg{animation:none}}
      `}</style>

      <header className="egreso-display-topbar">
        <div className="egreso-display-brand">
          <img src={logoK} alt="KlaseA" />
          <div>
            <strong>Pañol · Control de egreso</strong>
            <span>Constancia visual del material retirado</span>
          </div>
        </div>
        <div className="egreso-display-live"><i /> Actualización en vivo</div>
        <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 13, fontWeight: 900 }}>
          {clock.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <button type="button" className="egreso-display-fullscreen" onClick={toggleFullscreen} title="Pantalla completa">
          <Maximize2 size={17} />
        </button>
      </header>

      <ProgressSteps status={state.status} />

      {isIdle ? <EmptyState /> : (
        <div className="egreso-display-layout">
          <section className="egreso-display-panel">
            <div className="egreso-display-panel-head">
              <div style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}` }}>
                <PackageCheck size={20} />
              </div>
              <div>
                <div className="egreso-display-eyebrow">Detalle del retiro</div>
                <h1>Materiales cargados</h1>
              </div>
              <div className="egreso-display-count">{state.items.length} {state.items.length === 1 ? "material" : "materiales"}</div>
            </div>
            <div className="egreso-display-items">
              {state.items.map((item, index) => <ItemRow key={item.key || `${item.label}-${index}`} item={item} index={index} />)}
            </div>
          </section>

          <aside className="egreso-display-side">
            <StatusHero state={state} />
            <section className="egreso-display-panel egreso-display-summary">
              <div className="egreso-display-eyebrow">Resumen</div>
              <div className="egreso-display-summary-grid">
                <div className="egreso-display-summary-card">
                  <span>Renglones</span>
                  <strong>{state.totalLines || state.items.length}</strong>
                </div>
                <div className="egreso-display-summary-card">
                  <span>Unidades</span>
                  <strong>{fmtQty(state.totalUnits || totalUnits)}</strong>
                </div>
              </div>
              <div className="egreso-display-destination">
                <span className="egreso-display-eyebrow">Destino</span>
                <strong>{destination}</strong>
                {state.note && <p>{state.note}</p>}
              </div>
              {(state.updatedAt || state.completedAt) && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 11, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                  <Clock3 size={13} />
                  {state.status === "complete" ? "Confirmado" : "Actualizado"} a las {timeLabel(state.completedAt || state.updatedAt)}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
