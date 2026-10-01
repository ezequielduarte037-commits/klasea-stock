// Estilos del módulo Obras (Planta y Configuración). Todo va bajo .prd para
// no tocar el resto de la app mientras la pantalla está montada. Colores sólo
// con tokens del tema: funcionan en oscuro, claro y alto contraste.
export const CSS_PRODUCCION = `
.prd {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  background:
    radial-gradient(1100px 380px at 18% -12%, var(--glow-a), transparent 70%),
    radial-gradient(700px 300px at 100% 110%, var(--glow-b), transparent 70%),
    var(--bg);
  color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
}
.prd .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }

/* ── Navegación del módulo ── */
.prd-nav {
  position: relative; z-index: 20; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--topbar-soft);
  -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
}
.prd-volver {
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  min-height: 36px; padding: 0 10px 0 6px; border: 0; border-radius: 10px;
  background: transparent; color: var(--text); font: inherit; font-size: 14px; font-weight: 650;
  transition: background-color .15s;
}
.prd-volver:hover { background: var(--panel-2); }
.prd-nav-sep { width: 1px; height: 22px; background: var(--border); flex-shrink: 0; }
.prd-nav .ui-tabs { flex: 1; min-width: 0; }
.prd-nav .ui-tab { display: inline-flex; align-items: center; gap: 7px; }
.prd-nav .ui-tab svg { opacity: .75; }

.prd-vista { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; animation: prd-aparece .25s ease both; }

/* ── Barra de la vista ── */
.prd-barra { flex-shrink: 0; padding: 16px 24px 12px; position: relative; z-index: 5; }
.prd-barra-fila { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.prd-titulos { min-width: 0; flex: 1; animation: prd-sube .5s cubic-bezier(.22,1,.36,1) both; }
.prd-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.prd-h1 { margin: 3px 0 0; font-size: 24px; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }
.prd-h1 .acento { background: var(--brand-grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.prd-sub { margin-top: 5px; font-size: 13px; color: var(--dim); }
.prd-sub b { color: var(--muted); font-weight: 600; }
.prd-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.prd-filtros { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.prd-sp { flex: 1; }
.prd-scroll-x { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.prd-scroll-x::-webkit-scrollbar { display: none; }

.prd-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); flex-shrink: 0; }
.prd-seg button {
  display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 11px;
  border: 0; border-radius: 8px; background: transparent; color: var(--dim);
  font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap;
  transition: background-color .18s, color .18s, box-shadow .18s;
}
.prd-seg button:hover { color: var(--text); }
.prd-seg button.on { background: var(--panel-solid-3); color: var(--text); box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 4px 12px -6px var(--shadow); }
.prd-seg .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.prd-seg button.on .n { color: var(--blue); }

.prd-chip {
  display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 11px;
  border: 1px solid transparent; border-radius: 10px; background: transparent;
  color: var(--dim); font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0;
  transition: background-color .18s, border-color .18s, color .18s;
}
.prd-chip:hover { color: var(--text); background: var(--panel); }
.prd-chip.on { color: var(--text); background: var(--panel-2); border-color: var(--border-2); }
.prd-chip .pto { width: 7px; height: 7px; border-radius: 50%; background: var(--c, var(--muted)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c, var(--muted)) 18%, transparent); }
.prd-chip .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }

.prd-buscar { position: relative; flex: 0 1 220px; min-width: 150px; }
.prd-buscar svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--subtle); pointer-events: none; }
.prd-buscar input { padding-left: 34px; min-height: 36px; font-size: 13px; }

.prd-btn-ic {
  width: 36px; height: 36px; display: grid; place-items: center; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--muted);
  transition: background-color .15s, color .15s, border-color .15s, transform .12s;
}
.prd-btn-ic:hover:not(:disabled) { background: var(--panel-2); color: var(--text); border-color: var(--border-2); }
.prd-btn-ic:active:not(:disabled) { transform: scale(.95); }
.prd-btn-ic:disabled { opacity: .35; cursor: default; }
.prd-btn-ic.on { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }

/* Tonos */
.prd [data-tono="azul"]    { --t: var(--blue);   --t-soft: var(--blue-soft);   --t-borde: var(--blue-border); }
.prd [data-tono="verde"]   { --t: var(--green);  --t-soft: var(--green-soft);  --t-borde: var(--green-border); }
.prd [data-tono="rojo"]    { --t: var(--red);    --t-soft: var(--red-soft);    --t-borde: var(--red-border); }
.prd [data-tono="violeta"] { --t: var(--violet); --t-soft: var(--violet-soft); --t-borde: var(--violet-border); }
.prd [data-tono="cian"]    { --t: var(--cyan);   --t-soft: var(--cyan-soft);   --t-borde: var(--cyan-border); }
.prd [data-tono="teal"]    { --t: var(--teal);   --t-soft: var(--teal-soft);   --t-borde: var(--teal-border); }
.prd [data-tono="neutro"]  { --t: var(--dim);    --t-soft: var(--panel-2);     --t-borde: var(--border); }
.prd-estado {
  display: inline-flex; align-items: center; gap: 6px; min-height: 22px; padding: 0 9px;
  border: 1px solid var(--t-borde); border-radius: 999px; background: var(--t-soft); color: var(--t);
  font-size: 11.5px; font-weight: 600; white-space: nowrap; line-height: 1;
}
.prd-estado::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

/* Anillo de avance */
.prd-anillo { position: relative; display: inline-grid; place-items: center; flex-shrink: 0; }
.prd-anillo svg { transform: rotate(-90deg); display: block; }
.prd-anillo .fondo { stroke: var(--panel-3); }
.prd-anillo .arco { stroke: url(#prd-grad); transition: stroke-dashoffset .9s cubic-bezier(.22,1,.36,1); }
.prd-anillo .arco.lleno { stroke: var(--green); }
.prd-anillo > span { position: absolute; font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text); letter-spacing: -.02em; }
.prd-anillo.vacio > span { color: var(--subtle); }

/* ── Cuerpo de Planta ── */
.prd-cuerpo { flex: 1; min-height: 0; display: flex; position: relative; }
.prd-gantt {
  flex: 1; min-width: 0; overflow: auto; position: relative; overscroll-behavior: contain;
  border-top: 1px solid var(--border);
}
.prd-g-in { position: relative; min-height: 100%; }
.prd-g-cab { position: sticky; top: 0; z-index: 6; display: flex; height: 52px; background: var(--bg); border-bottom: 1px solid var(--border-2); }
.prd-g-izq { position: sticky; left: 0; z-index: 4; flex-shrink: 0; background: var(--bg); border-right: 1px solid var(--border); }
.prd-g-cab .prd-g-izq { z-index: 7; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 10px 0 18px; font-size: 10.5px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--subtle); }
.prd-g-cab-txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prd-zoom { display: inline-flex; gap: 1px; padding: 2px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); flex-shrink: 0; }
.prd-zoom button { min-height: 24px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--dim); font: inherit; font-size: 11px; font-weight: 600; letter-spacing: 0; text-transform: none; transition: background-color .15s, color .15s; }
.prd-zoom button:hover { color: var(--text); }
.prd-zoom button.on { background: var(--panel-solid-3); color: var(--text); }
.prd-zoom-salir { flex-shrink: 0; min-height: 26px; padding: 0 10px; border: 1px solid var(--blue-border); border-radius: 8px; background: var(--blue-soft); color: var(--blue); font: inherit; font-size: 11.5px; font-weight: 600; letter-spacing: 0; text-transform: none; }

/* Eje: meses arriba y, cuando entran, los lunes abajo. */
.prd-g-eje { position: relative; flex-shrink: 0; overflow: hidden; }
.prd-g-mes { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--border); }
.prd-g-mes span { position: absolute; left: 8px; top: 9px; font-size: 12px; font-weight: 500; color: var(--dim); white-space: nowrap; text-transform: capitalize; }
.prd-g-eje.dos .prd-g-mes span { top: 8px; }
.prd-g-mes.anio { border-left-color: var(--border-3); }
.prd-g-mes.anio span { color: var(--text); font-weight: 650; }
.prd-g-mes.anio span b { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; margin-left: 6px; padding: 1px 5px; border-radius: 5px; background: var(--panel-2); color: var(--muted); }
.prd-g-mes.s0 { border-left: 1.5px solid var(--violet-border); }
.prd-g-mes.corte { border-left-color: transparent; }
.prd-g-mes.s0 span { color: var(--violet); font-weight: 650; text-transform: none; }
.prd-g-sem { position: absolute; top: 30px; transform: translateX(-50%); font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--subtle); }
.prd-g-hoy-cab {
  position: absolute; bottom: 6px; z-index: 2; transform: translateX(-50%);
  padding: 2px 8px; border-radius: 99px; background: var(--cyan); color: var(--inverse-text);
  font-size: 10.5px; font-weight: 700; letter-spacing: .03em; white-space: nowrap;
  box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--cyan) 70%, transparent);
  animation: prd-aparece .6s .3s both;
}

/* Grilla y línea de hoy van por detrás de las filas: las barras la tapan. */
.prd-g-cuerpo { position: relative; }
.prd-g-grilla { position: absolute; top: 0; bottom: 0; pointer-events: none; z-index: 0; }
.prd-g-grilla i { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--border); opacity: .5; }
.prd-g-grilla i.anio { border-left-color: var(--border-3); opacity: .7; }
.prd-g-grilla i.sem { opacity: .22; }
.prd-g-grilla i.s0 { border-left: 1.5px dashed var(--violet-border); opacity: 1; }
.prd-g-hoy { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: linear-gradient(180deg, var(--cyan), color-mix(in srgb, var(--cyan) 30%, transparent)); box-shadow: 0 0 14px color-mix(in srgb, var(--cyan) 45%, transparent); }

.prd-g-grupo { display: flex; height: 38px; position: relative; z-index: 1; }
.prd-g-grupo .prd-g-izq { display: flex; align-items: center; gap: 9px; padding: 0 18px; background: var(--panel-solid); border-bottom: 1px solid var(--border); }
.prd-g-grupo .prd-g-pista { background: color-mix(in srgb, var(--panel-solid) 55%, transparent); border-bottom: 1px solid var(--border); }
.prd-g-grupo .nombre { font-size: 12.5px; font-weight: 650; letter-spacing: .02em; }
.prd-g-grupo .n { font-size: 11px; color: var(--subtle); }
.prd-g-grupo .pto { width: 8px; height: 8px; border-radius: 3px; background: var(--c, var(--muted)); }

.prd-g-fila { display: flex; min-height: 64px; position: relative; z-index: 1; cursor: pointer; animation: prd-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 22ms); }
.prd-g-fila .prd-g-izq, .prd-g-sub .prd-g-izq { border-bottom: 1px solid var(--border); transition: background-color .18s, opacity .3s ease; }
.prd-g-fila .prd-g-pista { border-bottom: 1px solid var(--border); transition: background-color .18s, opacity .3s ease; }
.prd-g-fila:hover .prd-g-izq { background: var(--panel-solid-2); }
.prd-g-fila:hover .prd-g-pista { background: color-mix(in srgb, var(--panel) 70%, transparent); }
.prd-g-fila.sel .prd-g-izq { background: var(--panel-solid-2); }
.prd-g-fila.sel .prd-g-pista { background: color-mix(in srgb, var(--blue-soft) 38%, transparent); }
.prd-g-fila.sel .prd-g-izq::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: var(--brand-grad); }
.prd-g-fila .prd-g-izq { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 8px 12px 8px 18px; }
/* Con una obra elegida, las demás se corren a un segundo plano. */
/* Se atenúa el contenido y no la celda fija de la izquierda: si no, al
   desplazar se verían las barras por detrás del nombre. */
.prd-g-izq > * { transition: opacity .3s ease; }
.prd-g-cuerpo.hay-sel .prd-g-fila:not(.sel) > .prd-g-izq > *,
.prd-g-cuerpo.hay-sel .prd-g-fila:not(.sel) > .prd-g-pista,
.prd-g-cuerpo.hay-sel .prd-g-grupo > .prd-g-izq > * { opacity: var(--prd-atenuado); }
.prd-g-cuerpo.hay-sel .prd-g-fila:not(.sel):hover > .prd-g-izq > *,
.prd-g-cuerpo.hay-sel .prd-g-fila:not(.sel):hover > .prd-g-pista { opacity: .9; }
.prd-g-l1 { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.prd-g-cod { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; }
.prd-g-l2 { margin-top: 4px; font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prd-g-l2 em { font-style: normal; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--subtle); margin-left: 4px; }
.prd-g-der { display: flex; align-items: center; gap: 8px; }
.prd-g-enfocar {
  display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px;
  border: 1px solid var(--blue-border); border-radius: 9px; background: var(--blue-soft); color: var(--blue);
  font: inherit; font-size: 12px; font-weight: 600; white-space: nowrap;
  animation: prd-aparece .25s both; transition: background-color .15s, transform .12s;
}
.prd-g-enfocar:hover { background: color-mix(in srgb, var(--blue) 22%, transparent); }
.prd-g-enfocar:active { transform: scale(.96); }
.prd-g-pista { position: relative; flex-shrink: 0; }

/* Barra de la obra: plan contra real. Gris = falta; cian tenue = ya debería
   estar hecho (inicio → hoy); degradé = reportado. La diferencia es el atraso. */
.prd {
  --prd-barra: color-mix(in srgb, var(--muted) 13%, var(--panel-solid));
  --prd-esperado: color-mix(in srgb, var(--cyan) 22%, var(--panel-solid));
  --prd-atenuado: .38;
}
[data-theme="light"] .prd {
  --prd-barra: color-mix(in srgb, var(--muted) 20%, var(--panel-solid));
  --prd-esperado: color-mix(in srgb, var(--cyan) 30%, var(--panel-solid));
  --prd-atenuado: .5;
}
.prd-barra-o {
  position: absolute; top: 50%; height: 16px; margin-top: -8px; z-index: 1; overflow: hidden;
  border-radius: 8px; background: var(--prd-barra);
  box-shadow: inset 0 0 0 1px var(--border-2);
  transform-origin: left center; animation: prd-crece .7s cubic-bezier(.22,1,.36,1) both;
  animation-delay: calc(90ms + var(--i, 0) * 22ms);
}
.prd-barra-o.sug { box-shadow: inset 0 0 0 1px var(--border); }
.prd-barra-o .esperado { position: absolute; left: 0; top: 0; bottom: 0; background: var(--prd-esperado); box-shadow: inset -1px 0 0 color-mix(in srgb, var(--cyan) 45%, transparent); }
.prd-barra-o .hecho {
  position: absolute; left: 0; top: 0; bottom: 0; border-radius: 8px;
  background: var(--brand-grad); box-shadow: 0 0 14px -2px color-mix(in srgb, var(--blue) 70%, transparent);
  transform-origin: left center; animation: prd-crece .9s cubic-bezier(.22,1,.36,1) both;
  animation-delay: calc(260ms + var(--i, 0) * 22ms);
}
.prd-barra-o i { position: absolute; top: 5px; bottom: 5px; width: 1px; border-radius: 1px; background: color-mix(in srgb, var(--bg) 55%, transparent); pointer-events: none; }
.prd-g-fila:hover .prd-barra-o { box-shadow: inset 0 0 0 1px var(--border-3); }
.prd-g-fila.sel .prd-barra-o { box-shadow: inset 0 0 0 1px var(--blue-border), 0 0 0 3px color-mix(in srgb, var(--blue) 12%, transparent); }
.prd-hito {
  position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; z-index: 2; pointer-events: auto;
  transform: rotate(45deg); border-radius: 3px; background: var(--violet); border: 2px solid var(--bg);
  box-shadow: 0 0 10px color-mix(in srgb, var(--violet) 60%, transparent);
  animation: prd-aparece .5s both; animation-delay: calc(380ms + var(--i, 0) * 22ms);
}

/* La fecha de fin sigue a la barra y, si la barra salió de pantalla, se queda
   pegada al borde izquierdo. "Arranca" hace lo mismo del lado derecho. */
.prd-fin-caja, .prd-ini-caja { position: absolute; top: 0; bottom: 0; display: flex; align-items: center; pointer-events: none; z-index: 1; }
.prd-fin-caja { right: 0; }
.prd-ini-caja { left: 0; justify-content: flex-end; }
.prd-pegado { position: sticky; pointer-events: auto; container-type: scroll-state; }
.prd-pegado.izq { left: calc(var(--izq, 300px) + 10px); }
.prd-pegado.der { right: 10px; }
.prd-fin {
  min-height: 20px; padding: 0 6px; border: 0; border-radius: 6px; background: color-mix(in srgb, var(--bg) 80%, transparent);
  color: var(--subtle); font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 500; white-space: nowrap;
  transition: color .15s, background-color .15s, opacity .2s;
}
.prd-fin:hover { color: var(--text); background: var(--panel-2); }
/* La de inicio sólo se ve cuando la barra quedó a la derecha (o si la obra todavía no arrancó). */
.prd-pegado.der .prd-fin { opacity: 0; pointer-events: none; }
.prd-pegado.der.siempre .prd-fin { opacity: 1; pointer-events: auto; }
@container scroll-state(stuck: right) { .prd-fin { opacity: 1; pointer-events: auto; color: var(--muted); background: var(--panel-solid-2); } .prd-fin::after { content: " →"; } }
@container scroll-state(stuck: left) { .prd-fin { color: var(--muted); background: var(--panel-solid-2); } .prd-fin::before { content: "← "; } }

.prd-g-sub { display: flex; min-height: 38px; position: relative; z-index: 1; cursor: pointer; animation: prd-sube .38s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--j, 0) * 24ms); }
.prd-g-sub .prd-g-izq { display: flex; align-items: center; gap: 9px; padding: 0 12px 0 34px; background: var(--panel-solid); }
.prd-g-sub .prd-g-pista { border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--panel) 45%, transparent); }
.prd-g-sub:hover .prd-g-izq { background: var(--panel-solid-2); }
.prd-g-sub.sel .prd-g-izq { background: var(--panel-solid-3); }
.prd-g-sub .nom { flex: 1; min-width: 0; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
.prd-g-sub.sel .nom { color: var(--text); font-weight: 600; }
.prd-g-sub .cnt { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--subtle); }
.prd-g-cuerpo.foco .prd-g-sub { min-height: 44px; }

.prd-nodo2 {
  display: inline-grid; place-items: center; flex-shrink: 0; border-radius: 50%;
  border: 1.5px dashed var(--border-3); background: var(--panel-solid); color: var(--subtle);
}
.prd-nodo2.completado { border: 0; background: var(--green); color: var(--inverse-text); }
.prd-nodo2.en_curso { border: 0; background: var(--brand-grad); color: var(--inverse-text); box-shadow: 0 0 0 3px var(--blue-soft); }
.prd-nodo2.vencida { border: 1.5px solid var(--cyan-border); background: var(--cyan-soft); color: var(--cyan); }
.prd-nodo2.bloqueado { border: 1.5px solid var(--red-border); background: var(--red-soft); color: var(--red); }
.prd-nodo2 svg { display: block; }
.prd-nodo2.en_curso svg { margin-left: 1px; }
.prd-est-txt { font-size: 11px; font-weight: 600; white-space: nowrap; color: var(--subtle); }
.prd-est-txt.completado { color: var(--green); }
.prd-est-txt.en_curso { color: var(--blue); }
.prd-est-txt.vencida { color: var(--cyan); }
.prd-est-txt.bloqueado { color: var(--red); }
.prd-nodo { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; border: 2px solid var(--border-3); background: var(--bg); }
.prd-nodo.completado { background: var(--green); border-color: var(--green); }
.prd-nodo.en_curso { background: var(--blue); border-color: var(--blue); box-shadow: 0 0 0 4px var(--blue-soft); }
.prd-nodo.vencida { border-color: var(--cyan); background: var(--cyan-soft); }
.prd-nodo.bloqueado { border-color: var(--red); background: var(--red-soft); }

.prd-barra-et {
  position: absolute; top: 50%; height: 22px; margin-top: -11px; border-radius: 7px; min-width: 8px;
  display: flex; align-items: center; overflow: hidden;
  background: color-mix(in srgb, var(--muted) 16%, var(--panel-solid)); border: 1px solid var(--border-2);
  transform-origin: left center; animation: prd-crece .55s cubic-bezier(.22,1,.36,1) both;
  animation-delay: calc(80ms + var(--j, 0) * 24ms);
  transition: box-shadow .18s;
}
.prd-g-cuerpo.foco .prd-barra-et { height: 28px; margin-top: -14px; border-radius: 8px; }
.prd-barra-et .txt { position: relative; z-index: 1; padding: 0 9px; font-size: 11px; font-weight: 600; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prd-barra-et.completado { background: color-mix(in srgb, var(--green) 26%, var(--panel-solid)); border-color: var(--green-border); }
.prd-barra-et.completado .txt { color: var(--green); }
.prd-barra-et.en_curso { background: linear-gradient(90deg, color-mix(in srgb, var(--blue) 30%, var(--panel-solid)), color-mix(in srgb, var(--cyan) 22%, var(--panel-solid))); border: 1.5px solid var(--blue); }
.prd-barra-et.en_curso .txt { color: var(--text); }
.prd-barra-et.vencida { background: color-mix(in srgb, var(--cyan) 9%, var(--panel-solid)); border: 1px dashed var(--cyan-border); }
.prd-barra-et.vencida .txt { color: var(--cyan); }
.prd-barra-et.bloqueado { background: color-mix(in srgb, var(--red) 20%, var(--panel-solid)); border-color: var(--red-border); }
.prd-barra-et.sug.pendiente { border-style: dashed; }
.prd-barra-et.sug.pendiente .txt { color: var(--dim); }
.prd-barra-et .prog { position: absolute; left: 0; top: 0; bottom: 0; background: color-mix(in srgb, var(--blue) 28%, transparent); }
.prd-g-sub.sel .prd-barra-et { box-shadow: 0 0 0 3px var(--blue-soft), 0 8px 18px -10px var(--shadow); }

.prd-tip {
  position: fixed; z-index: 60; pointer-events: none; max-width: 300px;
  padding: 9px 11px; border-radius: 11px; border: 1px solid var(--border-2);
  background: var(--panel-solid); box-shadow: var(--elev-2); font-size: 12px; color: var(--muted);
  animation: prd-aparece .15s both;
}
.prd-tip b { display: block; color: var(--text); font-size: 12.5px; font-weight: 650; margin-bottom: 3px; }
.prd-tip .mono { font-size: 11px; }

.prd-leyenda {
  flex-shrink: 0; display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  padding: 8px 24px; border-top: 1px solid var(--border); background: var(--topbar-soft);
  font-size: 11.5px; color: var(--dim);
}
.prd-leyenda span { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.prd-leyenda i { display: inline-block; flex-shrink: 0; }
.prd-lg-barra { width: 24px; height: 10px; border-radius: 5px; background: var(--prd-barra); box-shadow: inset 0 0 0 1px var(--border-2); }
.prd-lg-barra.esperado { background: var(--prd-esperado); box-shadow: none; }
.prd-lg-barra.hecho { background: var(--brand-grad); box-shadow: none; }
.prd-leyenda .prd-nodo2 { vertical-align: middle; }
.prd-lg-s0 { width: 9px; height: 9px; transform: rotate(45deg); border-radius: 2px; background: var(--violet); }
.prd-lg-hoy { width: 2px; height: 14px; border-radius: 2px; background: var(--cyan); }

.prd-vacio { display: grid; justify-items: center; gap: 8px; padding: 70px 20px; text-align: center; color: var(--dim); }
.prd-vacio strong { color: var(--text); font-size: 15px; font-weight: 600; }

/* ── Panel de obra ── */
.prd-panel {
  position: relative; z-index: 8; flex-shrink: 0; width: clamp(380px, 31vw, 470px);
  display: flex; flex-direction: column; min-height: 0;
  border-left: 1px solid var(--border-2); background: var(--panel-solid);
  box-shadow: -24px 0 48px -32px var(--shadow-strong);
  animation: prd-desde-der .42s cubic-bezier(.22,1,.36,1) both;
}
.prd-panel-cab { flex-shrink: 0; position: relative; z-index: 3; padding: 14px 16px 12px 20px; border-bottom: 1px solid var(--border); background: radial-gradient(280px 150px at 100% 0%, var(--glow-a), transparent 72%); }
.prd-panel-top { display: flex; align-items: center; gap: 6px; position: relative; z-index: 3; }
.prd-panel-cod { margin-top: 8px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; position: relative; z-index: 1; }
.prd-panel-cod h2 { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 28px; font-weight: 700; letter-spacing: -.03em; line-height: 1; }
.prd-panel-cod span { font-size: 13px; color: var(--dim); }
.prd-panel-cuerpo { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.prd-heroe { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.prd-datos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
.prd-dato small { display: block; font-size: 10.5px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--subtle); }
.prd-dato b { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 13.5px; font-weight: 600; min-width: 0; }
.prd-dato b > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prd-dato .suave { color: var(--subtle); font-weight: 500; font-size: 11.5px; }
.prd-editar { border: 0; background: transparent; color: var(--subtle); padding: 2px 4px; border-radius: 6px; display: inline-grid; place-items: center; }
.prd-editar:hover { color: var(--blue); background: var(--blue-soft); }
.prd-fecha-edit { display: flex; gap: 6px; margin-top: 4px; }
.prd-fecha-edit input { min-height: 32px; font-size: 12.5px; padding: 0 8px; font-family: 'JetBrains Mono', monospace; color-scheme: var(--input-color-scheme, dark); }

.prd-aviso {
  margin: 14px 16px 0 20px; display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap;
  padding: 11px 12px; border-radius: 12px; border: 1px solid var(--t-borde); background: var(--t-soft);
  font-size: 12.5px; line-height: 1.45; animation: prd-sube .45s .1s cubic-bezier(.22,1,.36,1) both;
}
.prd-aviso > svg { color: var(--t); flex-shrink: 0; margin-top: 1px; }
.prd-aviso p { margin: 0; flex: 1; min-width: 180px; color: var(--text); }
.prd-aviso p span { color: var(--dim); }
.prd-aviso .acc { display: flex; gap: 6px; flex-wrap: wrap; width: 100%; padding-left: 26px; }
.prd-aviso .ui-btn { min-height: 32px; font-size: 12.5px; padding: 0 11px; }

.prd-sec { padding: 16px 16px 6px 20px; }
.prd-sec-cab { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.prd-sec-cab h3 { margin: 0; font-size: 14px; font-weight: 650; letter-spacing: -.01em; }
.prd-sec-cab span { font-size: 12px; color: var(--subtle); }
.prd-sec-cab .prd-sp + button { margin-left: auto; }

.prd-ruta { position: relative; }
.prd-ruta-item { position: relative; }
.prd-ruta-item::before { content: ""; position: absolute; left: 13px; top: 30px; bottom: -6px; width: 2px; border-radius: 2px; background: var(--border); }
.prd-ruta-item:last-child::before { display: none; }
.prd-ruta-item.completado::before { background: color-mix(in srgb, var(--green) 45%, var(--border)); }
.prd-ruta-btn {
  width: 100%; display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 10px; align-items: start;
  padding: 8px 8px 8px 0; border: 0; border-radius: 12px; background: transparent; color: var(--text); font: inherit; text-align: left;
  transition: background-color .18s;
}
.prd-ruta-btn:hover { background: var(--panel); }
.prd-ruta-item.abierta > .prd-ruta-btn { background: var(--panel-2); }
.prd-ruta-btn .prd-nodo2 { margin: 2px 0 0 5px; }
.prd-ruta-nom { font-size: 13.5px; font-weight: 600; line-height: 1.3; }
.prd-ruta-item.completado .prd-ruta-nom { color: var(--dim); }
.prd-ruta-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 3px; font-size: 11.5px; color: var(--subtle); }
.prd-ruta-meta .mono { font-size: 11px; }
.prd-ruta-der { display: grid; justify-items: end; gap: 5px; padding-top: 1px; }
.prd-mini { width: 54px; height: 4px; border-radius: 99px; background: var(--panel-3); overflow: hidden; }
.prd-mini i { display: block; height: 100%; border-radius: 99px; background: var(--brand-grad); transform-origin: left; animation: prd-crece .7s cubic-bezier(.22,1,.36,1) both; }
.prd-mini.lleno i { background: var(--green); }
.prd-hoy-tag { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--blue); background: var(--blue-soft); border: 1px solid var(--blue-border); border-radius: 5px; padding: 1px 5px; }
.prd-sug-tag { font-size: 10.5px; color: var(--dim); border: 1px dashed var(--border-3); border-radius: 99px; padding: 0 7px; }

.prd-etapa { margin: 4px 0 12px 36px; padding: 12px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); display: grid; gap: 12px; animation: prd-sube .35s cubic-bezier(.22,1,.36,1) both; }
.prd-est3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 3px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); }
.prd-est3 button {
  min-height: 36px; border: 1px solid transparent; border-radius: 9px; background: transparent;
  color: var(--dim); font: inherit; font-size: 12.5px; font-weight: 600;
  transition: background-color .2s, color .2s, border-color .2s, transform .12s;
}
.prd-est3 button:hover:not(:disabled) { color: var(--text); }
.prd-est3 button:active:not(:disabled) { transform: scale(.97); }
.prd-est3 button:disabled { cursor: default; }
.prd-est3 button.on.pendiente { background: var(--panel-3); border-color: var(--border-2); color: var(--text); }
.prd-est3 button.on.en_curso { background: var(--blue-soft); border-color: var(--blue-border); color: var(--blue); }
.prd-est3 button.on.completado { background: var(--green-soft); border-color: var(--green-border); color: var(--green); }
.prd-nota { font-size: 12px; line-height: 1.45; color: var(--dim); padding: 9px 11px; border-radius: 10px; background: var(--bg); border: 1px solid var(--border); }
.prd-nota b { color: var(--text); font-weight: 600; }
.prd-nota.ok { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; border-color: var(--green-border); background: var(--green-soft); color: var(--text); }
.prd-nota.ok span { flex: 1; min-width: 150px; }
.prd-sub-cab { display: flex; align-items: center; gap: 8px; }
.prd-sub-cab b { font-size: 12.5px; font-weight: 650; }
.prd-sub-cab .mono { font-size: 11.5px; color: var(--dim); }
.prd-sub-cab .prd-mini { flex: 1; width: auto; }
.prd-sub-cab .lnk { margin-left: auto; }
.lnk { border: 0; background: transparent; color: var(--blue); font: inherit; font-size: 12px; font-weight: 600; padding: 3px 4px; border-radius: 6px; }
.lnk:hover { background: var(--blue-soft); }

.prd-tareas { display: grid; }
.prd-tarea { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 6px 2px; border-bottom: 1px solid var(--border); font-size: 12.5px; line-height: 1.35; }
.prd-tarea:last-child { border-bottom: 0; }
.prd-check {
  width: 22px; height: 22px; flex-shrink: 0; display: grid; place-items: center; padding: 0;
  border: 1.5px solid var(--border-3); border-radius: 7px; background: transparent; color: var(--inverse-text);
  transition: background-color .2s, border-color .2s, transform .15s;
}
.prd-check:hover:not(:disabled) { border-color: var(--green); }
.prd-check:active:not(:disabled) { transform: scale(.9); }
.prd-check.on { background: var(--green); border-color: var(--green); }
.prd-check.curso { border-color: var(--blue); box-shadow: inset 0 0 0 4px var(--panel-solid), inset 0 0 0 10px var(--blue); }
.prd-check svg path { stroke-dasharray: 16; animation: prd-trazo .3s cubic-bezier(.65,0,.35,1) both; }
.prd-tarea-nom { flex: 1; min-width: 0; }
.prd-tarea.hecha .prd-tarea-nom { color: var(--subtle); text-decoration: line-through; text-decoration-color: var(--border-3); }
.prd-tarea-nom small { display: block; margin-top: 2px; font-size: 11px; color: var(--cyan); }
.prd-av { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; font-size: 10px; font-weight: 650; color: var(--blue); background: var(--blue-soft); border: 1px solid var(--blue-border); }
.prd-clip { display: inline-flex; align-items: center; gap: 3px; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--subtle); }
.prd-mas { width: 28px; height: 28px; flex-shrink: 0; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--subtle); }
.prd-mas:hover { background: var(--panel-2); color: var(--text); }
.prd-alta { display: flex; gap: 6px; }
.prd-alta .ui-input { min-height: 36px; font-size: 13px; }
.prd-alta .ui-btn { min-height: 36px; }
.prd-prods { display: grid; gap: 1px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
.prd-prod { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 7px 10px; background: var(--bg); font-size: 12px; }
.prd-prod span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prd-prod .mono { font-size: 11px; color: var(--muted); white-space: nowrap; }
.prd-detalle-op { display: grid; gap: 4px; font-size: 12px; color: var(--dim); }
.prd-detalle-op b { color: var(--muted); font-weight: 600; }

.prd-panel-pie { flex-shrink: 0; display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 16px 12px 20px; border-top: 1px solid var(--border); background: var(--panel-solid-2); }
.prd-panel-pie .ui-btn { min-height: 36px; font-size: 13px; }

.prd-menu {
  position: absolute; z-index: 40; min-width: 210px; padding: 6px;
  border: 1px solid var(--border-2); border-radius: 13px; background: var(--panel-solid);
  box-shadow: var(--elev-2); animation: prd-menu .18s cubic-bezier(.22,1,.36,1) both;
}
.prd-menu button { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 0 10px; border: 0; border-radius: 9px; background: transparent; color: var(--text); font: inherit; font-size: 13px; text-align: left; }
.prd-menu button:hover { background: var(--panel-2); }
.prd-menu button.peligro { color: var(--red); }
.prd-menu hr { border: 0; border-top: 1px solid var(--border); margin: 5px 4px; }
.prd-menu-titulo { padding: 6px 10px 4px; font-size: 10.5px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--subtle); }

/* ── Obras terminadas: fuera del Gantt, en una lista ── */
.prd-term { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 24px 28px; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; align-content: start; border-top: 1px solid var(--border); padding-top: 16px; }
.prd-term-card {
  display: grid; gap: 8px; padding: 14px; text-align: left; font: inherit; color: var(--text);
  border: 1px solid var(--border); border-radius: 15px; background: var(--panel-solid); box-shadow: var(--elev-1);
  animation: prd-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 30ms);
  transition: transform .18s cubic-bezier(.22,1,.36,1), border-color .18s;
}
.prd-term-card:hover { transform: translateY(-2px); border-color: var(--green-border); }
.prd-term-card.sel { border-color: var(--blue-border); box-shadow: 0 0 0 1px var(--blue-border); }
.prd-term-card .fila { display: flex; align-items: center; gap: 8px; }
.prd-term-card .meta { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--dim); }
.prd-term-card .meta b { color: var(--muted); font-weight: 600; }

/* ── Celular: tarjetas ── */
.prd-tarjetas { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 16px 24px; display: grid; gap: 10px; align-content: start; }
.prd-t-grupo { display: flex; align-items: center; gap: 8px; margin: 12px 2px 2px; font-size: 12px; font-weight: 650; color: var(--muted); }
.prd-t-grupo .pto { width: 8px; height: 8px; border-radius: 3px; background: var(--c, var(--muted)); }
.prd-t-grupo .n { color: var(--subtle); font-weight: 500; }
.prd-tarjeta {
  width: 100%; display: grid; gap: 10px; padding: 14px; text-align: left; font: inherit; color: var(--text);
  border: 1px solid var(--border); border-radius: 16px; background: var(--panel-solid); box-shadow: var(--elev-1);
  animation: prd-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 28ms);
  transition: transform .15s, border-color .15s;
}
.prd-tarjeta:active { transform: scale(.985); }
.prd-t-cab { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; align-items: center; }
.prd-t-linea { position: relative; height: 26px; }
.prd-t-linea .prd-barra-o { left: 0; right: 0; height: 14px; margin-top: -7px; border-radius: 7px; }
.prd-t-fechas { display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--subtle); }

/* ── Configuración ── */
.prd-lineas { display: flex; gap: 10px; overflow-x: auto; scrollbar-width: none; padding: 2px 24px 14px; flex-shrink: 0; }
.prd-lineas::-webkit-scrollbar { display: none; }
.prd-linea {
  position: relative; flex: 0 0 auto; width: 188px; display: grid; gap: 8px; padding: 12px 13px; text-align: left;
  border: 1px solid var(--border); border-radius: 15px; background: var(--panel-solid); color: var(--text); font: inherit;
  box-shadow: var(--elev-1); transition: transform .18s cubic-bezier(.22,1,.36,1), border-color .18s, box-shadow .18s;
  animation: prd-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 35ms);
}
.prd-linea:hover { transform: translateY(-2px); border-color: var(--border-2); }
.prd-linea.on { border-color: var(--blue-border); box-shadow: 0 0 0 1px var(--blue-border), 0 14px 30px -18px color-mix(in srgb, var(--blue) 60%, transparent); }
.prd-linea.on::before { content: ""; position: absolute; left: 14px; right: 14px; top: -1px; height: 2px; border-radius: 0 0 2px 2px; background: var(--brand-grad); }
.prd-linea-cab { display: flex; align-items: center; gap: 8px; }
.prd-linea-cab b { font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
.prd-linea-cab .pto { width: 9px; height: 9px; border-radius: 3px; background: var(--c, var(--muted)); }
.prd-linea-cab small { margin-left: auto; font-size: 11px; color: var(--subtle); }
.prd-linea-barras { display: grid; gap: 5px; }
.prd-linea-barra { display: grid; grid-template-columns: 58px minmax(0,1fr) 34px; gap: 6px; align-items: center; font-size: 10.5px; color: var(--subtle); }
.prd-linea-barra .prd-mini { width: auto; }
.prd-linea-barra .mono { text-align: right; font-size: 10px; }

.prd-pasos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 0 24px 14px; flex-shrink: 0; }
.prd-paso {
  position: relative; display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 11px; align-items: center;
  padding: 11px 13px; text-align: left; font: inherit; color: var(--text);
  border: 1px solid var(--border); border-radius: 14px; background: var(--panel);
  transition: border-color .18s, background-color .18s, transform .18s;
}
.prd-paso:hover { border-color: var(--border-2); background: var(--panel-2); }
.prd-paso.on { border-color: var(--t-borde); background: var(--t-soft); }
.prd-paso-ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; border: 1px solid var(--t-borde); background: var(--t-soft); color: var(--t); }
.prd-paso b { display: block; font-size: 13.5px; font-weight: 650; }
.prd-paso small { display: block; margin-top: 2px; font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prd-paso .prd-mini { position: absolute; left: 13px; right: 13px; bottom: 7px; width: auto; height: 3px; }

.prd-conf { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid var(--border); }
.prd-conf-barra { flex-shrink: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 24px; border-bottom: 1px solid var(--border); background: var(--topbar-soft); font-size: 12.5px; color: var(--dim); }
.prd-conf-barra b { color: var(--text); font-weight: 600; }

.prd-rec { flex: 1; min-height: 0; overflow: auto; position: relative; }
.prd-rec-in { position: relative; min-height: 100%; }
.prd-rec-cab { position: sticky; top: 0; z-index: 6; display: flex; height: 38px; background: var(--bg); border-bottom: 1px solid var(--border-2); }
.prd-rec-izq { position: sticky; left: 0; z-index: 4; flex-shrink: 0; background: var(--bg); border-right: 1px solid var(--border); }
.prd-rec-cab .prd-rec-izq { z-index: 7; display: flex; align-items: center; padding: 0 16px; font-size: 10.5px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--subtle); }
.prd-rec-eje { position: relative; flex-shrink: 0; }
.prd-rec-eje i { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--border); }
.prd-rec-eje i span { position: absolute; left: 5px; top: 11px; font-family: 'JetBrains Mono', monospace; font-style: normal; font-size: 10.5px; color: var(--subtle); white-space: nowrap; }
.prd-rec-eje i.z { border-left: 1.5px solid var(--violet-border); }
.prd-rec-eje i.z span { color: var(--violet); font-weight: 700; }
.prd-rec-fila { display: flex; min-height: 48px; animation: prd-sube .4s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 24ms); }
.prd-rec-fila.arrastrando { opacity: .45; }
.prd-rec-fila.destino .prd-rec-izq { box-shadow: inset 0 2px 0 var(--blue); }
.prd-rec-fila .prd-rec-izq { display: flex; align-items: center; gap: 8px; padding: 0 10px 0 6px; border-bottom: 1px solid var(--border); background: var(--bg); }
.prd-rec-fila:hover .prd-rec-izq { background: var(--panel-solid-2); }
.prd-rec-fila.sel .prd-rec-izq { background: var(--panel-solid-3); }
.prd-asa { width: 22px; height: 30px; display: grid; place-items: center; border: 0; background: transparent; color: var(--subtle); cursor: grab; flex-shrink: 0; border-radius: 6px; }
.prd-asa:hover { color: var(--text); background: var(--panel-2); }
.prd-rec-num { width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; flex-shrink: 0; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 700; color: var(--dim); background: var(--panel-2); }
.prd-rec-nom { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--text); font: inherit; font-size: 13px; font-weight: 550; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 6px 2px; border-radius: 6px; }
.prd-rec-nom:hover { color: var(--blue); }
.prd-rec-s { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 650; color: var(--muted); min-width: 46px; text-align: right; }
.prd-rec-s.no { color: var(--cyan); }
.prd-rec-pista { position: relative; flex-shrink: 0; border-bottom: 1px solid var(--border); }
.prd-rec-pista i { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--border); opacity: .5; pointer-events: none; }
.prd-rec-pista i.z { border-left: 1.5px solid var(--violet-border); opacity: 1; }
.prd-rec-bar {
  position: absolute; top: 50%; height: 26px; margin-top: -13px; border-radius: 8px; min-width: 16px;
  display: flex; align-items: center; padding: 0 12px 0 9px; overflow: hidden; touch-action: none; user-select: none; cursor: grab;
  background: linear-gradient(90deg, var(--blue-soft), color-mix(in srgb, var(--cyan-soft) 80%, transparent));
  border: 1.5px solid var(--blue); color: var(--blue); font-size: 11px; font-weight: 650; white-space: nowrap;
  transform-origin: left center; animation: prd-crece .6s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(100ms + var(--i, 0) * 24ms);
  transition: box-shadow .18s;
}
.prd-rec-bar:hover { box-shadow: 0 8px 20px -10px color-mix(in srgb, var(--blue) 70%, transparent); }
.prd-rec-bar.moviendo { cursor: grabbing; box-shadow: 0 12px 28px -10px color-mix(in srgb, var(--blue) 80%, transparent); z-index: 3; }
.prd-rec-bar .asa-der { position: absolute; right: 0; top: 0; bottom: 0; width: 12px; cursor: ew-resize; display: grid; place-items: center; }
.prd-rec-bar .asa-der::after { content: ""; width: 2px; height: 12px; border-radius: 2px; background: currentColor; opacity: .55; }
.prd-rec-libre { position: absolute; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--cyan); white-space: nowrap; }
.prd-rec-libre .ui-btn { min-height: 30px; font-size: 12px; padding: 0 10px; }
.prd-pasos-mov { display: flex; align-items: center; gap: 4px; }
.prd-pasos-mov button { width: 30px; height: 30px; }

.prd-dos { flex: 1; min-height: 0; display: grid; grid-template-columns: 290px minmax(0, 1fr); }
.prd-dos > aside { min-height: 0; overflow-y: auto; border-right: 1px solid var(--border); padding: 10px; background: color-mix(in srgb, var(--panel-solid) 55%, transparent); }
.prd-dos > section { min-height: 0; overflow-y: auto; padding: 16px 24px 30px; }
.prd-et-item {
  width: 100%; display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 9px; align-items: center;
  min-height: 46px; padding: 6px 10px 6px 6px; margin-bottom: 3px; text-align: left; font: inherit; color: var(--text);
  border: 1px solid transparent; border-radius: 11px; background: transparent;
  transition: background-color .15s, border-color .15s, transform .15s;
}
.prd-et-item:hover { background: var(--panel); }
.prd-et-item.on { background: var(--blue-soft); border-color: var(--blue-border); }
.prd-et-item.destino { border-color: var(--green); background: var(--green-soft); transform: translateX(3px); }
.prd-et-item .nom { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prd-et-item small { display: block; font-size: 11px; color: var(--subtle); margin-top: 1px; }
.prd-et-item .cnt { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); padding: 2px 7px; border-radius: 99px; background: var(--panel-2); }
.prd-et-item.on .cnt { background: var(--blue-soft); color: var(--blue); }

.prd-lista { border: 1px solid var(--border); border-radius: 14px; overflow: hidden; background: var(--panel-solid); }
.prd-fila-t { display: flex; align-items: center; gap: 9px; min-height: 46px; padding: 6px 10px 6px 6px; border-bottom: 1px solid var(--border); font-size: 13px; transition: background-color .15s; }
.prd-fila-t:last-child { border-bottom: 0; }
.prd-fila-t:hover { background: var(--panel); }
.prd-fila-t.destino { box-shadow: inset 0 2px 0 var(--blue); }
.prd-fila-t .nom { flex: 1; min-width: 0; }
.prd-fila-t .nom small { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 3px; font-size: 11px; color: var(--subtle); }
.prd-dep { color: var(--cyan); background: var(--cyan-soft); border: 1px solid var(--cyan-border); border-radius: 5px; padding: 0 5px; font-weight: 600; }
.prd-form { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--blue-border); border-radius: 13px; background: color-mix(in srgb, var(--blue-soft) 50%, transparent); }
.prd-form-g { display: grid; grid-template-columns: minmax(0, 1fr) 90px 90px 80px; gap: 8px; }
.prd-form label { display: grid; gap: 4px; font-size: 10.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--subtle); }
.prd-form label .ui-input { min-height: 36px; font-size: 13px; text-transform: none; letter-spacing: 0; font-weight: 400; }
.prd-form textarea.ui-input { min-height: 60px; padding: 8px 12px; resize: vertical; }
.prd-form-acc { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.prd-deps { display: flex; flex-wrap: wrap; gap: 5px; max-height: 120px; overflow-y: auto; }
.prd-deps button { min-height: 26px; padding: 0 9px; border-radius: 99px; border: 1px solid var(--border); background: transparent; color: var(--dim); font: inherit; font-size: 11.5px; font-weight: 600; }
.prd-deps button.on { border-color: var(--cyan); background: var(--cyan-soft); color: var(--cyan); }

.prd-prod-cab { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.prd-prod-cab .prd-buscar { flex: 1 1 220px; }
.prd-prod-cab select.ui-input { width: auto; min-height: 36px; font-size: 12.5px; max-width: 200px; }
.prd-prod-fila {
  width: 100%; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 10px; align-items: center;
  min-height: 48px; padding: 7px 12px; text-align: left; font: inherit; color: var(--text);
  border: 0; border-bottom: 1px solid var(--border); background: transparent; transition: background-color .12s;
}
.prd-prod-fila:last-child { border-bottom: 0; }
.prd-prod-fila:hover { background: var(--panel); }
.prd-prod-fila.on { background: var(--blue-soft); }
.prd-prod-fila[draggable="true"] { cursor: grab; }
.prd-prod-fila .box { width: 18px; height: 18px; border-radius: 6px; border: 1.5px solid var(--border-3); display: grid; place-items: center; color: var(--inverse-text); transition: background-color .15s, border-color .15s; }
.prd-prod-fila.on .box { background: var(--blue); border-color: var(--blue); }
.prd-prod-fila .d { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prd-prod-fila .m { display: flex; gap: 8px; margin-top: 2px; font-size: 11px; color: var(--subtle); white-space: nowrap; overflow: hidden; }
.prd-prod-fila .q { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); white-space: nowrap; }
.prd-asig { display: grid; grid-template-columns: minmax(0, 1fr) minmax(160px, 220px) 76px 84px 30px; gap: 8px; align-items: center; min-height: 50px; padding: 7px 10px 7px 12px; border-bottom: 1px solid var(--border); }
.prd-asig:last-child { border-bottom: 0; }
.prd-asig .ui-input { min-height: 32px; font-size: 12px; padding: 0 8px; }
.prd-flotante {
  position: sticky; bottom: 12px; z-index: 5; margin-top: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 12px; border-radius: 14px; border: 1px solid var(--blue-border);
  background: color-mix(in srgb, var(--panel-solid) 88%, transparent);
  -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
  box-shadow: var(--elev-2); animation: prd-sube .3s cubic-bezier(.22,1,.36,1) both;
}
.prd-flotante b { font-size: 13px; }
.prd-flotante select.ui-input { width: auto; min-height: 36px; max-width: 260px; font-size: 12.5px; }
.prd-cobertura { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; padding: 10px 10px 14px; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
.prd-cobertura b { font-size: 13px; font-weight: 650; }
.prd-cobertura small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--dim); line-height: 1.4; }

.prd-cajon { position: absolute; top: 0; right: 0; bottom: 0; z-index: 12; width: min(440px, 100%); display: flex; flex-direction: column; background: var(--panel-solid); border-left: 1px solid var(--border-2); box-shadow: -30px 0 60px -30px var(--shadow-strong); animation: prd-desde-der .38s cubic-bezier(.22,1,.36,1) both; }
.prd-cajon-cab { display: flex; align-items: center; gap: 10px; padding: 14px 16px 12px 20px; border-bottom: 1px solid var(--border); }
.prd-cajon-cab h3 { margin: 0; flex: 1; font-size: 16px; font-weight: 650; }
.prd-cajon-cuerpo { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px; display: grid; gap: 12px; align-content: start; }
.prd-cajon-pie { display: flex; gap: 8px; align-items: center; padding: 12px 20px; border-top: 1px solid var(--border); }
.prd-paso-num { display: flex; align-items: center; gap: 6px; }
.prd-paso-num .ui-input { text-align: center; font-family: 'JetBrains Mono', monospace; width: 90px; }

@keyframes prd-sube { from { opacity: 0; transform: translateY(10px); } }
@keyframes prd-crece { from { transform: scaleX(0); } }
@keyframes prd-aparece { from { opacity: 0; } }
@keyframes prd-desde-der { from { opacity: 0; transform: translateX(28px); } }
@keyframes prd-desde-abajo { from { opacity: .4; transform: translateY(100%); } }
@keyframes prd-menu { from { opacity: 0; transform: translateY(-4px) scale(.98); } }
@keyframes prd-trazo { from { stroke-dashoffset: 16; } }

@media (max-width: 1180px) {
  .prd-panel { position: absolute; top: 0; right: 0; bottom: 0; width: min(440px, 92%); box-shadow: -30px 0 60px -30px var(--shadow-strong); }
}
@media (max-width: 899px) {
  .prd-nav { padding: 6px 10px; gap: 6px; }
  .prd-volver span { display: none; }
  .prd-barra { padding: 14px 16px 10px; }
  .prd-h1 { font-size: 21px; }
  .prd-eyebrow { display: none; }
  .prd-acciones { width: 100%; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .prd-acciones .prd-buscar { flex: 1 1 auto; min-width: 0; }
  .prd-filtros { gap: 8px; margin-top: 12px; }
  .prd-filtros > .prd-scroll-x { width: 100%; order: 3; margin: 0 -16px; padding: 0 16px; width: calc(100% + 32px); }
  .prd-buscar { flex: 1 1 160px; }
  .prd-leyenda { display: none; }
  .prd-g-cab-txt { display: none; }
  .prd-g-enfocar span { display: none; }
  .prd-g-cab .prd-g-izq { justify-content: flex-start; padding-left: 8px; }
  /* El panel tapa la vista entera (filtros incluidos): se ubica contra .prd-vista. */
  .prd-cuerpo { position: static; }
  .prd-panel { position: absolute; top: 0; right: 0; bottom: 0; left: 0; width: auto; border-left: 0; z-index: 30; animation-name: prd-desde-abajo; }
  .prd-panel-cab { padding: 12px 12px 12px 16px; }
  .prd-heroe, .prd-sec { padding-left: 16px; padding-right: 12px; }
  .prd-aviso { margin-left: 16px; margin-right: 12px; }
  .prd-etapa { margin-left: 0; }
  .prd-panel-pie { padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px)) 16px; }
  .prd-tarea { min-height: 46px; }
  .prd-check { width: 26px; height: 26px; }
  .prd-lineas { padding: 2px 16px 12px; }
  .prd-pasos { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 0 16px 12px; }
  .prd-paso { grid-template-columns: 1fr; gap: 6px; padding: 10px; justify-items: start; }
  .prd-paso-ic { width: 32px; height: 32px; border-radius: 10px; }
  .prd-paso small { white-space: normal; }
  .prd-conf-barra { padding: 10px 16px; }
  .prd-dos { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .prd-dos > aside { border-right: 0; border-bottom: 1px solid var(--border); padding: 8px 16px; display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
  .prd-dos > aside::-webkit-scrollbar { display: none; }
  .prd-dos > aside .prd-cobertura { display: none; }
  .prd-dos > aside .prd-et-item { width: auto; flex: 0 0 auto; max-width: 220px; margin: 0; grid-template-columns: minmax(0,1fr) auto; }
  .prd-dos > aside .prd-et-item > .prd-rec-num { display: none; }
  .prd-dos > section { padding: 12px 16px 24px; }
  .prd-form-g { grid-template-columns: 1fr 1fr; }
  .prd-form-g > label:first-child { grid-column: 1 / -1; }
  .prd-asig { grid-template-columns: minmax(0, 1fr) 70px 30px; }
  .prd-asig > select { grid-column: 1 / -1; grid-row: 2; }
  .prd-asig > .unidad { display: none; }
  .prd-cajon { width: 100%; animation-name: prd-desde-abajo; }
}
`;
