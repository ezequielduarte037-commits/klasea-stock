// MemoriaSelector — showroom táctil de acabados (iPad apaisado, cliente presente).
//
// Componente REUTILIZABLE: no sabe de Supabase ni del barco. Recibe las familias
// y ambientes por props y avisa por callbacks. La pantalla contenedora
// (MemoriasScreen) decide de dónde salen las texturas (fotos reales de
// assets/textures) y qué hacer al confirmar (persistir la memoria).
//
// Uso:
//   <MemoriaSelector
//     familias={FAMILIAS}
//     // [{ id, nombre, hint, cover,
//     //    items: [{ nombre, tex }],
//     //    ambientes: [{ key, label }] }]   ← los CAMPOS que acepta esta familia
//     initialSelecciones={{ madera_muebles: { fam: "maderas", item: "Oak" } }}
//     onToggle={(key, nombre) => patchField(key, nombre ?? "")}  // cada asignación
//     onConfirm={(sel) => guardarMemoria(sel)}                   // todos definidos
//   />
//
// Cada familia declara sus "ambientes" (los campos de la memoria que pueden
// recibir sus acabados: el piso sólo acepta Pisos, la dinette sólo Telas...).
// `tex` es un background CSS: foto (`url(${img}) center/cover`) o textura
// generativa (helpers en memoriaAcabados.js). Estilos scoped (.mems-) sobre
// los tokens de tema del sistema: claro/oscuro/HC sin toggle propio.
import { useEffect, useMemo, useRef, useState } from "react";
import { FAMILIAS_DEMO } from "./memoriaAcabados";

/* ── Íconos mínimos ────────────────────────────────────────────────────────── */
const IcCheck = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const IcBack = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
);
const IcX = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
);

const RING_C = 100.5; // circunferencia del anillo de progreso (r=16)

export default function MemoriaSelector({
  familias = FAMILIAS_DEMO,
  initialSelecciones = {},
  onToggle,
  onChange,
  onConfirm,
  titulo = "Elegí los acabados de tu barco",
  subtitulo = "Tocá una familia para ver las muestras. Cada elección se aplica a los ambientes del barco y queda registrada en la memoria descriptiva.",
}) {
  // selecciones: { [ambienteKey]: { fam, item } } — la key es el campo real de
  // la memoria (madera_muebles, piso, tapiceria_dinette...), así el estado
  // mapea 1:1 con lo que persiste MemoriasScreen.
  const [selecciones, setSelecciones] = useState(initialSelecciones);
  const [famAbierta, setFamAbierta] = useState(null); // id de familia o null (home)
  const [sheetPick, setSheetPick] = useState(null);   // { fam, item } o null
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmada, setConfirmada] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const famById = useMemo(
    () => new Map(familias.map((f) => [f.id, f])),
    [familias],
  );
  // Todos los "slots" (campo + familia dueña) para progreso y resumen.
  const slots = useMemo(
    () => familias.flatMap((f) => (f.ambientes || []).map((a) => ({ ...a, fam: f.id }))),
    [familias],
  );
  const texOf = (famId, item) =>
    famById.get(famId)?.items.find((i) => i.nombre === item)?.tex || "";
  const nombreFam = (famId) => famById.get(famId)?.nombre || "";

  const definidos = slots.filter((s) => selecciones[s.key]).length;
  const completo = slots.length > 0 && definidos === slots.length;
  const pct = slots.length ? definidos / slots.length : 0;

  function toggleAmbiente(slot) {
    if (!sheetPick) return;
    const cur = selecciones[slot.key];
    const mine = cur && cur.fam === sheetPick.fam && cur.item === sheetPick.item;
    const next = { ...selecciones };
    if (mine) delete next[slot.key];
    else next[slot.key] = { fam: sheetPick.fam, item: sheetPick.item };
    setSelecciones(next);
    setConfirmada(false);
    onToggle?.(slot.key, mine ? null : sheetPick.item);
    onChange?.(next);
  }

  function confirmar() {
    setConfirmada(true);
    setModalOpen(false);
    setToast("Memoria confirmada");
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
    onConfirm?.(selecciones);
  }

  const fam = famAbierta ? famById.get(famAbierta) : null;

  return (
    <div className="mems">
      <style>{CSS}</style>

      {/* ── HOME: familias ── */}
      {!fam && (
        <div className="mems-view">
          <div className="mems-hero">
            <h1>{titulo}</h1>
            <p>{subtitulo}</p>
          </div>
          <div className="mems-fams">
            {familias.map((f) => {
              const propios = f.ambientes || [];
              const usados = propios.filter((a) => selecciones[a.key]).length;
              const cover = f.items[f.cover ?? 0]?.tex || f.items[0]?.tex;
              return (
                <button key={f.id} type="button" className="mems-fam" onClick={() => setFamAbierta(f.id)}>
                  <span className="mems-tex" style={{ background: cover }} />
                  <span className="mems-veil" />
                  {propios.length > 0 && (
                    <span className="mems-done">
                      {usados === propios.length ? <IcCheck size={12} /> : null}
                      {usados}/{propios.length}
                    </span>
                  )}
                  <span className="mems-lab">
                    <b>{f.nombre}</b>
                    <span>{f.items.length} muestras{f.hint ? ` · ${f.hint}` : ""}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── FAMILIA: muestras ── */}
      {fam && (
        <div className="mems-view">
          <button type="button" className="mems-back" onClick={() => setFamAbierta(null)}>
            <IcBack /> Familias
          </button>
          <div className="mems-famtitle">
            <h2>{fam.nombre}</h2>
            <span>{fam.items.length} muestras — tocá una para elegir ambientes</span>
          </div>
          {/* key={fam.id}: al cambiar de familia se remonta y la cascada se re-anima */}
          <div className="mems-rail" key={fam.id}>
            {fam.items.map((it, i) => {
              const ambs = (fam.ambientes || [])
                .filter((a) => selecciones[a.key]?.item === it.nombre && selecciones[a.key]?.fam === fam.id)
                .map((a) => a.label);
              return (
                <button
                  key={it.nombre}
                  type="button"
                  className={`mems-sw${ambs.length ? " sel" : ""}`}
                  style={{ animationDelay: `${i * 70}ms` }}
                  onClick={() => setSheetPick({ fam: fam.id, item: it.nombre })}
                >
                  <span className="mems-chip">
                    <span className="mems-tex" style={{ background: it.tex }} />
                    <span className="mems-mark"><IcCheck /></span>
                  </span>
                  <span className="mems-name">
                    <b>{it.nombre}</b>
                    <span>{ambs.length ? ambs.join(" · ") : " "}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── HOJA: aplicar a ambientes ── */}
      <div className={`mems-sheetwrap${sheetPick ? " open" : ""}`} aria-hidden={!sheetPick}>
        <div className="mems-sheetback" onClick={() => setSheetPick(null)} />
        <div className="mems-sheet">
          <div className="mems-grab" />
          {sheetPick && (
            <>
              <div className="mems-sheethead">
                <div className="mems-mini">
                  <span className="mems-tex" style={{ background: texOf(sheetPick.fam, sheetPick.item) }} />
                </div>
                <div>
                  <b>{nombreFam(sheetPick.fam)} · {sheetPick.item}</b>
                  <p>¿En qué ambientes va este acabado?</p>
                </div>
              </div>
              <div className="mems-ambs">
                {(famById.get(sheetPick.fam)?.ambientes || []).map((slot) => {
                  const cur = selecciones[slot.key];
                  const mine = cur && cur.fam === sheetPick.fam && cur.item === sheetPick.item;
                  const other = cur && !mine;
                  return (
                    <button
                      key={slot.key}
                      type="button"
                      className={`mems-amb${mine ? " on" : ""}${other ? " other" : ""}`}
                      onClick={() => toggleAmbiente(slot)}
                    >
                      {slot.label}
                      {other && <span className="mems-tag">{cur.item}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="mems-sheetfoot">
                <button type="button" className="mems-primary" onClick={() => setSheetPick(null)}>
                  <IcCheck size={16} /> Listo
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── FAB: Mi selección ── */}
      <button type="button" className="mems-fab" onClick={() => setModalOpen(true)}>
        <span className="mems-ring">
          <svg width="38" height="38" viewBox="0 0 38 38" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="19" cy="19" r="16" stroke="var(--panel-2)" strokeWidth="4" fill="none" />
            <circle
              cx="19" cy="19" r="16" stroke="var(--green)" strokeWidth="4" fill="none"
              strokeLinecap="round" strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - pct)}
              style={{ transition: "stroke-dashoffset .5s cubic-bezier(.22,1,.36,1)" }}
            />
          </svg>
          <span className="mems-ringn">{definidos}/{slots.length}</span>
        </span>
        <span className="mems-fabt">
          <b>Mi selección</b>
          <span>{definidos ? `${definidos} de ${slots.length} ambientes definidos` : "Sin ambientes definidos"}</span>
        </span>
      </button>

      {/* ── MODAL: resumen ── */}
      <div className={`mems-modalwrap${modalOpen ? " open" : ""}`} aria-hidden={!modalOpen}>
        <div className="mems-modalback" onClick={() => setModalOpen(false)} />
        <div className="mems-modal">
          <header>
            <div>
              <h3>Mi selección</h3>
              <p className="mems-sub">{definidos}/{slots.length} ambientes definidos</p>
            </div>
            <button type="button" className="mems-iconbtn" onClick={() => setModalOpen(false)} aria-label="Cerrar">
              <IcX />
            </button>
          </header>
          <div className="mems-prog"><i style={{ width: `${pct * 100}%` }} /></div>
          <div className="mems-rows">
            {slots.map((slot) => {
              const s = selecciones[slot.key];
              return (
                <div key={slot.key} className="mems-row">
                  <span className="mems-thumb">
                    {s && <span className="mems-tex" style={{ background: texOf(s.fam, s.item) }} />}
                  </span>
                  <span className="mems-ambn">
                    <b>{slot.label}</b>
                    <span>{s ? `${nombreFam(s.fam)} · ${s.item}` : "Todavía sin elegir"}</span>
                  </span>
                  {!s && <span className="mems-pend">Pendiente</span>}
                </div>
              );
            })}
          </div>
          <footer>
            <span className="mems-hint">
              {confirmada
                ? "Memoria confirmada. Cualquier cambio la vuelve a borrador."
                : completo
                  ? "Todo listo para confirmar."
                  : `Completá los ${slots.length} ambientes para confirmar.`}
            </span>
            <button type="button" className="mems-primary" disabled={!completo || confirmada} onClick={confirmar}>
              <IcCheck size={16} /> Confirmar memoria
            </button>
          </footer>
        </div>
      </div>

      <div className={`mems-toast${toast ? " show" : ""}`}>
        <span style={{ color: "var(--green)", display: "inline-flex" }}><IcCheck size={16} /></span>
        {toast}
      </div>
    </div>
  );
}

/* ── Estilos scoped (.mems-*) sobre los tokens de tema del sistema ─────────── */
const CSS = `
.mems{font-family:'Outfit',system-ui,-apple-system,sans-serif;color:var(--text);letter-spacing:-.01em;-webkit-tap-highlight-color:transparent}
.mems *{box-sizing:border-box}
.mems button{font-family:inherit;cursor:pointer;color:inherit}
.mems-view{padding:26px 26px 120px;max-width:1280px;margin:0 auto}
.mems-hero h1{margin:0;font-size:30px;font-weight:700;letter-spacing:-.03em}
.mems-hero p{margin:8px 0 0;font-size:14px;color:var(--dim);max-width:560px;line-height:1.5}
.mems-tex{position:absolute;inset:0}

.mems-fams{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-top:26px}
.mems-fam{position:relative;height:210px;border-radius:20px;overflow:hidden;border:1px solid var(--border);text-align:left;padding:0;background:var(--panel-solid);box-shadow:0 2px 8px var(--shadow);transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s ease}
.mems-fam:hover{transform:translateY(-4px);box-shadow:0 16px 34px -14px var(--shadow)}
.mems-fam:active{transform:scale(.985)}
.mems-fam .mems-tex{transition:transform 6s ease}
.mems-fam:hover .mems-tex{transform:scale(1.06)}
.mems-veil{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.55) 0%,transparent 55%)}
.mems-lab{position:absolute;left:20px;bottom:16px;right:20px;color:#fff;display:flex;align-items:baseline;justify-content:space-between;gap:10px;text-shadow:0 1px 10px rgba(0,0,0,.45)}
.mems-lab b{font-size:21px;font-weight:700;letter-spacing:-.02em}
.mems-lab span{font-size:12px;opacity:.85}
.mems-done{position:absolute;top:14px;right:14px;display:inline-flex;align-items:center;gap:6px;background:rgba(0,0,0,.42);color:#fff;border-radius:999px;padding:5px 11px;font-size:11px;font-weight:600;backdrop-filter:blur(6px);z-index:1}

.mems-back{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--border);background:transparent;border-radius:999px;padding:10px 18px;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:18px;min-height:44px}
.mems-back:active{transform:scale(.97)}
.mems-famtitle{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.mems-famtitle h2{margin:0;font-size:26px;font-weight:700;letter-spacing:-.03em}
.mems-famtitle span{font-size:13px;color:var(--dim)}

.mems-rail{display:grid;grid-auto-flow:column;grid-auto-columns:min(300px,72vw);gap:16px;overflow-x:auto;padding:22px 4px 26px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
.mems-rail::-webkit-scrollbar{height:6px}
.mems-rail::-webkit-scrollbar-thumb{background:var(--border-2);border-radius:99px}
.mems-sw{scroll-snap-align:start;border:none;background:none;padding:0;text-align:left;opacity:0;transform:translateY(14px);animation:memsIn .5s cubic-bezier(.22,1,.36,1) forwards}
@keyframes memsIn{to{opacity:1;transform:translateY(0)}}
.mems-chip{display:block;position:relative;height:300px;border-radius:18px;overflow:hidden;border:1px solid var(--border);box-shadow:0 2px 10px var(--shadow);transition:transform .35s cubic-bezier(.22,1,.36,1),outline-color .2s;outline:3px solid transparent;outline-offset:3px}
.mems-sw:active .mems-chip{transform:scale(1.04)}
.mems-sw.sel .mems-chip{outline-color:var(--blue);transform:scale(1.02)}
.mems-name{margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.mems-name b{font-size:16px;font-weight:600}
.mems-name span{font-size:11.5px;color:var(--dim)}
.mems-mark{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;background:var(--blue);color:#fff;display:grid;place-items:center;opacity:0;transform:scale(.5);transition:all .25s cubic-bezier(.34,1.56,.64,1)}
.mems-sw.sel .mems-mark{opacity:1;transform:scale(1)}

.mems-sheetwrap{position:fixed;top:0;left:0;right:0;bottom:0;z-index:60;pointer-events:none}
.mems-sheetwrap.open{pointer-events:auto}
.mems-sheetback{position:absolute;inset:0;background:var(--overlay);opacity:0;transition:opacity .3s}
.mems-sheetwrap.open .mems-sheetback{opacity:1}
.mems-sheet{position:absolute;left:0;right:0;bottom:0;background:var(--panel-solid);border-top:1px solid var(--border);border-radius:22px 22px 0 0;padding:20px 26px calc(24px + env(safe-area-inset-bottom));transform:translateY(102%);transition:transform .38s cubic-bezier(.22,1,.36,1);max-height:70vh;overflow-y:auto;box-shadow:0 -18px 50px var(--shadow)}
.mems-sheetwrap.open .mems-sheet{transform:translateY(0)}
.mems-grab{width:44px;height:5px;border-radius:99px;background:var(--border-2);margin:0 auto 16px}
.mems-sheethead{display:flex;gap:14px;align-items:center}
.mems-mini{width:64px;height:64px;border-radius:14px;overflow:hidden;border:1px solid var(--border);flex-shrink:0;position:relative}
.mems-sheethead b{font-size:17px;font-weight:700}
.mems-sheethead p{margin:3px 0 0;font-size:12.5px;color:var(--dim)}
.mems-ambs{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.mems-amb{min-height:48px;border-radius:14px;border:1px solid var(--border-2);background:transparent;padding:11px 18px;font-size:14px;font-weight:600;color:var(--muted);display:inline-flex;align-items:center;gap:9px;transition:all .2s ease}
.mems-amb:active{transform:scale(.96)}
.mems-amb.on{background:var(--blue);border-color:var(--blue);color:#fff}
.mems-amb.other{border-style:dashed}
.mems-tag{font-size:10px;font-weight:600;opacity:.75}
.mems-sheetfoot{display:flex;justify-content:flex-end;margin-top:20px}

.mems-primary{min-height:48px;border:none;border-radius:14px;background:var(--blue);color:#fff;font-size:14.5px;font-weight:700;padding:12px 26px;display:inline-flex;align-items:center;gap:8px}
.mems-primary:active{transform:scale(.97)}
.mems-primary[disabled]{opacity:.45;cursor:default}

.mems-fab{position:fixed;right:24px;bottom:24px;z-index:50;display:inline-flex;align-items:center;gap:12px;border:1px solid var(--border);border-radius:999px;background:var(--panel-solid);padding:12px 20px 12px 14px;box-shadow:0 14px 34px -12px var(--shadow);transition:transform .25s cubic-bezier(.22,1,.36,1)}
.mems-fab:active{transform:scale(.96)}
.mems-ring{position:relative;width:38px;height:38px;flex-shrink:0}
.mems-ringn{position:absolute;inset:0;display:grid;place-items:center;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
.mems-fabt{text-align:left}
.mems-fabt b{display:block;font-size:13.5px;font-weight:700}
.mems-fabt span{font-size:11px;color:var(--dim)}

.mems-modalwrap{position:fixed;top:0;left:0;right:0;bottom:0;z-index:70;display:grid;place-items:center;padding:22px;pointer-events:none}
.mems-modalwrap.open{pointer-events:auto}
.mems-modalback{position:absolute;inset:0;background:var(--overlay);opacity:0;transition:opacity .3s}
.mems-modalwrap.open .mems-modalback{opacity:1}
.mems-modal{position:relative;width:min(640px,94vw);max-height:86vh;overflow-y:auto;background:var(--panel-solid);border:1px solid var(--border);border-radius:22px;box-shadow:0 30px 80px -20px var(--shadow);opacity:0;transform:translateY(18px) scale(.98);transition:all .35s cubic-bezier(.22,1,.36,1)}
.mems-modalwrap.open .mems-modal{opacity:1;transform:none}
.mems-modal header{padding:22px 26px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.mems-modal h3{margin:0;font-size:20px;font-weight:700;letter-spacing:-.02em}
.mems-sub{margin:5px 0 0;font-size:12.5px;color:var(--dim);font-variant-numeric:tabular-nums}
.mems-iconbtn{width:44px;height:44px;border-radius:12px;border:1px solid var(--border);background:transparent;display:grid;place-items:center;color:var(--dim)}
.mems-prog{margin:18px 26px 0;height:6px;border-radius:99px;background:var(--panel-2);overflow:hidden}
.mems-prog i{display:block;height:100%;border-radius:99px;background:var(--green);transition:width .5s cubic-bezier(.22,1,.36,1)}
.mems-rows{padding:16px 14px 8px}
.mems-row{display:flex;align-items:center;gap:14px;padding:12px;border-radius:14px;transition:background .15s}
.mems-row:hover{background:var(--panel)}
.mems-thumb{width:52px;height:52px;border-radius:12px;overflow:hidden;border:1px solid var(--border);flex-shrink:0;position:relative;background:var(--panel-2)}
.mems-ambn{flex:1;min-width:0}
.mems-ambn b{display:block;font-size:14.5px;font-weight:600}
.mems-ambn span{font-size:12px;color:var(--dim)}
.mems-pend{font-size:11.5px;color:var(--amber);font-weight:600}
.mems-modal footer{position:sticky;bottom:0;background:var(--panel-solid);border-top:1px solid var(--border);padding:16px 26px;display:flex;align-items:center;gap:12px;justify-content:space-between;border-radius:0 0 22px 22px}
.mems-hint{font-size:12px;color:var(--dim)}

.mems-toast{position:fixed;left:50%;bottom:32px;transform:translate(-50%,20px);z-index:90;background:var(--panel-solid);border:1px solid var(--border);border-radius:14px;padding:13px 22px;font-size:13.5px;font-weight:600;box-shadow:0 18px 44px -14px var(--shadow);opacity:0;pointer-events:none;transition:all .35s cubic-bezier(.22,1,.36,1);display:flex;align-items:center;gap:9px;color:var(--text)}
.mems-toast.show{opacity:1;transform:translate(-50%,0)}

@media (prefers-reduced-motion: reduce){
  .mems *,.mems *::before,.mems *::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
  .mems-sw{opacity:1;transform:none;animation:none}
}
`;
