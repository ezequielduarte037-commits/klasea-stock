// Estilos de Tornería. Mismo lenguaje que Muebles (.mbl) y Obras (.prd): barra
// del módulo, títulos con eyebrow, segmentados, chips, lista + detalle, la
// tarjeta "Ahora" y tonos por data-tono. Todo cuelga de .tor: el <style> de una
// pantalla queda montado mientras está abierta y un selector suelto le cambia el
// aspecto a toda la app. Colores sólo con tokens del tema.
export const CSS = `
.tor {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  background:
    radial-gradient(1100px 380px at 18% -12%, var(--glow-a), transparent 70%),
    radial-gradient(700px 300px at 100% 110%, var(--glow-b), transparent 70%),
    var(--bg);
  color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
}
.tor button { -webkit-appearance: none; appearance: none; }
.tor .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.tor h1, .tor h2, .tor h3, .tor p { margin: 0; }
.tor .spin { animation: tor-gira .8s linear infinite; }
@media (min-width: 900px) { .tor-solo-celular { display: none !important; } }

/* Tonos */
.tor [data-tono="azul"]    { --t: var(--blue);   --t-soft: var(--blue-soft);   --t-borde: var(--blue-border); }
.tor [data-tono="verde"]   { --t: var(--green);  --t-soft: var(--green-soft);  --t-borde: var(--green-border); }
.tor [data-tono="rojo"]    { --t: var(--red);    --t-soft: var(--red-soft);    --t-borde: var(--red-border); }
.tor [data-tono="violeta"] { --t: var(--violet); --t-soft: var(--violet-soft); --t-borde: var(--violet-border); }
.tor [data-tono="cian"]    { --t: var(--cyan);   --t-soft: var(--cyan-soft);   --t-borde: var(--cyan-border); }
.tor [data-tono="teal"]    { --t: var(--teal);   --t-soft: var(--teal-soft);   --t-borde: var(--teal-border); }
.tor [data-tono="neutro"]  { --t: var(--dim);    --t-soft: var(--panel-2);     --t-borde: var(--border); }

/* ── Barra del módulo ── */
.tor-nav {
  position: relative; z-index: 20; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--topbar-soft);
  -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
}
.tor-nav-marca { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 14px; font-weight: 650; color: var(--text); }
.tor-nav-marca svg { color: var(--blue); }
.tor-nav-sep { width: 1px; height: 22px; background: var(--border); flex-shrink: 0; }
.tor-nav .ui-tabs { flex: 0 1 auto; min-width: 0; }
.tor-nav .ui-tab { display: inline-flex; align-items: center; gap: 7px; }
.tor-nav .ui-tab svg { opacity: .75; }
.tor-nav .ui-tab .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.tor-nav .ui-tab[aria-selected="true"] .n { color: var(--blue); }
.tor-nav-der { margin-left: auto; display: flex; align-items: center; gap: 6px; }

.tor-vista { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; animation: tor-aparece .25s ease both; }

/* ── Barra de una vista ── */
.tor-barra { flex-shrink: 0; padding: 16px 24px 12px; position: relative; z-index: 5; }
.tor-barra-fila { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.tor-titulos { min-width: 0; flex: 1; animation: tor-sube .5s cubic-bezier(.22,1,.36,1) both; }
.tor-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.tor-h1 { margin-top: 3px; font-size: 24px; font-weight: 700; letter-spacing: -.02em; line-height: 1.12; }
.tor-h1 .acento { background: var(--brand-grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.tor-sub { margin-top: 5px; font-size: 13px; color: var(--dim); }
.tor-sub b { color: var(--muted); font-weight: 600; }
.tor-sub b.rojo { color: var(--red); }
.tor-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tor-filtros { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.tor-sp { flex: 1; }
.tor-scroll-x { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.tor-scroll-x::-webkit-scrollbar { display: none; }

.tor-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); flex-shrink: 0; }
.tor-seg button {
  display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 11px;
  border: 0; border-radius: 8px; background: transparent; color: var(--dim);
  font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap;
  transition: background-color .18s, color .18s, box-shadow .18s;
}
.tor-seg button:hover { color: var(--text); }
.tor-seg button.on { background: var(--panel-solid-3); color: var(--text); box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 4px 12px -6px var(--shadow); }
.tor-seg .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.tor-seg button.on .n { color: var(--blue); }

.tor-chip {
  display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 11px;
  border: 1px solid transparent; border-radius: 10px; background: transparent;
  color: var(--dim); font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0;
  transition: background-color .18s, border-color .18s, color .18s;
}
.tor-chip:hover { color: var(--text); background: var(--panel); }
.tor-chip.on { color: var(--text); background: var(--panel-2); border-color: var(--border-2); }
.tor-chip .pto { width: 7px; height: 7px; border-radius: 50%; background: var(--t, var(--muted)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--t, var(--muted)) 18%, transparent); }
.tor-chip .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.tor-chip.on .n { color: var(--text); }

.tor-buscar { position: relative; flex: 0 1 260px; min-width: 160px; }
.tor-buscar svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--subtle); pointer-events: none; }
.tor-buscar input { padding-left: 34px; min-height: 36px; font-size: 13px; }

.tor-btn-ic {
  width: 36px; height: 36px; display: grid; place-items: center; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--muted);
  transition: background-color .15s, color .15s, border-color .15s, transform .12s;
}
.tor-btn-ic:hover:not(:disabled) { background: var(--panel-2); color: var(--text); border-color: var(--border-2); }
.tor-btn-ic:active:not(:disabled) { transform: scale(.95); }
.tor-btn-ic:disabled { opacity: .35; cursor: default; }
.tor-btn-ic.on { background: var(--blue-soft); border-color: var(--blue-border); color: var(--blue); }
.tor .ui-btn.chico { min-height: 32px; padding: 0 11px; font-size: 12.5px; border-radius: 9px; }

.tor-estado {
  display: inline-flex; align-items: center; gap: 6px; min-height: 22px; padding: 0 9px;
  border: 1px solid var(--t-borde, var(--border)); border-radius: 999px; background: var(--t-soft, var(--panel-2)); color: var(--t, var(--dim));
  font-size: 11.5px; font-weight: 600; white-space: nowrap; line-height: 1;
}
.tor-estado.punto::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.tor-tag {
  display: inline-flex; align-items: center; gap: 5px; min-height: 20px; padding: 0 7px;
  border-radius: 6px; border: 1px solid var(--t-borde, var(--border)); background: var(--t-soft, var(--panel));
  color: var(--t, var(--muted)); font-size: 10.5px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap;
}
.tor-dias {
  display: inline-flex; align-items: center; gap: 4px; min-height: 22px; padding: 0 8px; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: 999px; background: var(--panel); color: var(--dim);
  font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 600; white-space: nowrap;
}
.tor-dias.demora { border-color: var(--red-border); background: var(--red-soft); color: var(--red); }

.tor-mini { height: 4px; border-radius: 99px; background: var(--panel-3); overflow: hidden; }
.tor-mini i { display: block; height: 100%; border-radius: 99px; background: var(--brand-grad); transform-origin: left; animation: tor-crece .8s cubic-bezier(.22,1,.36,1) both; }
.tor-mini i.lleno { background: var(--green); }
.tor-av { display: flex; height: 8px; border-radius: 99px; overflow: hidden; background: var(--panel-3); gap: 2px; }
.tor-av i { display: block; height: 100%; background: var(--t); transform-origin: left; animation: tor-crece .8s cubic-bezier(.22,1,.36,1) both; }

/* Anillo de avance de una obra */
.tor-anillo { position: relative; display: grid; place-items: center; flex-shrink: 0; }
.tor-anillo svg { position: absolute; top: 0; left: 0; transform: rotate(-90deg); }
.tor-anillo .fondo { stroke: var(--panel-3); }
.tor-anillo .arco { stroke: var(--blue); transition: stroke-dashoffset .6s cubic-bezier(.22,1,.36,1); }
.tor-anillo.lleno .arco { stroke: var(--green); }
.tor-anillo b { position: relative; font-family: 'JetBrains Mono', monospace; font-weight: 650; color: var(--text); }

.tor-aviso {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; flex-wrap: wrap;
  border: 1px solid var(--t-borde, var(--border)); border-radius: 12px; background: var(--t-soft, var(--panel));
  color: var(--t, var(--muted)); font-size: 12.5px; line-height: 1.5;
}
.tor-aviso > svg { flex-shrink: 0; }
.tor-aviso > span { flex: 1; min-width: 200px; color: var(--text); }
.tor-aviso b { color: var(--t, var(--text)); }
.tor-aviso .ui-btn { flex-shrink: 0; }

.tor-vacio { display: grid; justify-items: center; align-content: center; gap: 8px; padding: 60px 20px; text-align: center; color: var(--dim); font-size: 13px; }
.tor-vacio.chico { padding: 22px 12px; font-size: 12.5px; gap: 6px; }
.tor-vacio-ic { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; color: var(--blue); border: 1px solid var(--blue-border); background: linear-gradient(145deg, var(--blue-soft), var(--cyan-soft)); margin-bottom: 4px; }
.tor-vacio b { color: var(--text); font-size: 15px; font-weight: 650; }

/* ── Panel general: el tablero de etapas ── */
.tor-tablero {
  flex: 1; min-height: 0; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(208px, 1fr);
  gap: 12px; padding: 4px 24px 20px; overflow-x: auto; overscroll-behavior: contain;
}
.tor-col {
  min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 16px;
  background: color-mix(in srgb, var(--panel-solid) 55%, transparent);
  animation: tor-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 45ms);
}
.tor-col-cab { flex-shrink: 0; padding: 12px 14px 10px; border-bottom: 1px solid var(--border); }
.tor-col-tit { display: flex; align-items: center; gap: 8px; }
.tor-col-paso {
  width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 650;
  border: 1px solid var(--t-borde); background: var(--t-soft); color: var(--t);
}
.tor-col-tit b { font-size: 14px; font-weight: 650; }
.tor-col-tit .n { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 650; color: var(--t); }
.tor-col-tit .n.cero { color: var(--subtle); }
.tor-col-txt { margin-top: 4px; font-size: 12px; line-height: 1.4; color: var(--dim); }
.tor-col-cuerpo { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 10px; display: grid; grid-auto-rows: max-content; gap: 8px; align-content: start; }
.tor-col-pie { flex-shrink: 0; padding: 10px; border-top: 1px solid var(--border); display: grid; gap: 8px; }
.tor-col-pie .ui-btn { width: 100%; }
.tor-col-nota { padding: 2px 4px 0; font-size: 11.5px; color: var(--subtle); line-height: 1.4; }

/* Celular: los cinco pasos del circuito, enteros en una fila */
.tor-etapas { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; margin-top: 12px; padding: 3px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); }
.tor-etapa {
  position: relative; display: grid; justify-items: center; align-content: center; gap: 2px; min-height: 54px; padding: 6px 2px;
  border: 1px solid transparent; border-radius: 11px; background: transparent; color: var(--dim); font: inherit;
  transition: background-color .16s, border-color .16s, color .16s;
}
.tor-etapa .n { font-family: "JetBrains Mono", monospace; font-size: 17px; font-weight: 650; line-height: 1.1; color: var(--t); }
.tor-etapa .n.cero { color: var(--subtle); }
.tor-etapa .t { font-size: 11px; font-weight: 600; white-space: nowrap; }
.tor-etapa.on { background: var(--t-soft); border-color: var(--t-borde); color: var(--text); }
.tor-etapa + .tor-etapa::before { content: ""; position: absolute; left: -5px; top: 50%; width: 6px; height: 1.5px; border-radius: 2px; background: var(--border-3); }

/* Una obra dentro de una columna */
.tor-ocard { border: 1px solid var(--border); border-radius: 13px; background: var(--panel); overflow: hidden; }
.tor-ocard-cab {
  display: flex; align-items: center; gap: 8px; width: 100%; min-height: 42px; padding: 8px 10px 8px 12px;
  border: 0; background: transparent; color: var(--text); font: inherit; text-align: left;
}
button.tor-ocard-cab { cursor: pointer; }
button.tor-ocard-cab:hover { background: var(--panel-2); }
.tor-ocard-cod { font-family: 'JetBrains Mono', monospace; font-size: 13.5px; font-weight: 650; white-space: nowrap; }
.tor-ocard-linea { font-size: 11.5px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tor-ocard-der { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-shrink: 0; color: var(--subtle); }
.tor-ocard-cuerpo { display: grid; padding: 0 10px 8px; }
.tor-ocard-pie { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 10px 10px; }
.tor-ocard-pie .ui-btn { flex: 1 1 auto; }
.tor-ocard-txt { padding: 0 2px 8px; font-size: 12.5px; line-height: 1.45; color: var(--muted); }
.tor-ocard-txt b { color: var(--t, var(--text)); font-weight: 650; }

/* Pieza dentro de una tarjeta de obra */
.tor-prow {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; align-items: center;
  min-height: 46px; padding: 6px 2px; border: 0; border-top: 1px solid var(--border); background: transparent;
  color: inherit; font: inherit; text-align: left; width: 100%;
}
.tor-prow:first-child { border-top: 0; }
.tor-prow.sel { grid-template-columns: auto minmax(0, 1fr) auto; cursor: pointer; border-radius: 9px; padding: 6px; }
.tor-prow.sel:hover { background: var(--panel-2); }
.tor-prow.sel.on { background: var(--t-soft, var(--blue-soft)); }
.tor-prow-nom { font-size: 13px; font-weight: 600; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.tor-prow-sub { margin-top: 2px; font-size: 11.5px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tor-prow-der { display: flex; align-items: center; gap: 6px; }
.tor-check {
  width: 20px; height: 20px; flex-shrink: 0; border-radius: 6px; display: grid; place-items: center;
  border: 1.5px solid var(--border-3); background: var(--bg); color: var(--inverse-text);
  transition: background-color .18s, border-color .18s;
}
.tor-check.on { background: var(--t, var(--blue)); border-color: var(--t, var(--blue)); }

/* ── Obras: lista + detalle ── */
.tor-dos { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); border-top: 1px solid var(--border); }
.tor-lista { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 12px 24px 20px; display: grid; grid-auto-rows: max-content; gap: 8px; align-content: start; border-right: 1px solid var(--border); }
.tor-detalle { min-height: 0; overflow-y: auto; overscroll-behavior: contain; position: relative; container-type: inline-size; }

.tor-item {
  position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center;
  width: 100%; height: max-content; padding: 12px; border: 1px solid var(--border); border-radius: 14px;
  background: var(--panel); color: var(--text); font: inherit; text-align: left; cursor: pointer; outline: none;
  -webkit-tap-highlight-color: transparent;
  transition: background-color .16s, border-color .16s, box-shadow .16s;
  animation: tor-sube .42s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 26ms);
}
.tor-item:hover { border-color: var(--border-2); background: var(--panel-2); }
.tor-item:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.tor-item.on { border-color: var(--blue-border); background: color-mix(in srgb, var(--blue-soft) 70%, var(--panel)); box-shadow: 0 10px 28px -18px color-mix(in srgb, var(--blue) 60%, transparent); }
.tor-item.on::before { content: ""; position: absolute; left: -1px; top: 12px; bottom: 12px; width: 3px; border-radius: 0 3px 3px 0; background: var(--brand-grad); }
.tor-item.archivo { background: transparent; }
.tor-item-l1 { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.tor-item-nom { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 650; line-height: 1.2; }
.tor-item-linea { font-size: 12px; font-weight: 600; color: var(--blue); }
.tor-item-sub { margin-top: 4px; font-size: 12.5px; font-weight: 500; color: var(--t, var(--dim)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tor-item-sub[data-tono="neutro"] { color: var(--dim); font-weight: 400; }
.tor-item-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 7px; }
.tor-item-flecha { color: var(--subtle); }

/* ── Detalle de una obra ── */
.tor-panel { padding: 18px 24px 40px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-content: start; max-width: 1080px; animation: tor-aparece .3s ease both; }
.tor-cab { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: center; }
.tor-cab-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.tor-cab-tit { font-size: 22px; font-weight: 700; letter-spacing: -.015em; line-height: 1.15; }
.tor-cab-sub { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12.5px; color: var(--dim); }
.tor-cab-sub span { display: inline-flex; align-items: center; gap: 5px; }
.tor-cab-acc { display: flex; gap: 6px; align-items: center; position: relative; }
.tor-volver-movil { display: none; }
@container (max-width: 760px) {
  .tor-cab { grid-template-columns: auto minmax(0, 1fr); }
  .tor-cab-acc { grid-column: 1 / -1; flex-wrap: wrap; }
}

.tor-bloque { border: 1px solid var(--border); border-radius: 16px; background: var(--panel); padding: 14px 16px; animation: tor-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 40ms); }
.tor-bloque-cab { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.tor-bloque-cab h3 { font-size: 11px; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.tor-bloque-cab .der { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.tor-bloque-txt { font-size: 12.5px; color: var(--dim); line-height: 1.5; }

/* Ahora: qué toca hacer en esta obra */
.tor-ahora {
  position: relative; overflow: hidden; border-radius: 18px; padding: 16px 18px;
  border: 1px solid var(--blue-border);
  background:
    radial-gradient(420px 160px at 100% 0%, var(--glow-a), transparent 70%),
    color-mix(in srgb, var(--blue-soft) 45%, var(--panel-solid));
  box-shadow: var(--elev-1);
  animation: tor-sube .45s cubic-bezier(.22,1,.36,1) both;
}
.tor-ahora.listo { border-color: var(--green-border); background: radial-gradient(420px 160px at 100% 0%, var(--glow-b), transparent 70%), color-mix(in srgb, var(--green-soft) 40%, var(--panel-solid)); }
.tor-ahora-eyebrow { font-size: 11px; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; color: var(--blue); }
.tor-ahora.listo .tor-ahora-eyebrow { color: var(--green); }
.tor-ahora-tit { margin-top: 4px; font-size: 18px; font-weight: 700; letter-spacing: -.01em; }
.tor-ahora-txt { margin-top: 3px; font-size: 13px; color: var(--muted); line-height: 1.45; }
.tor-ahora-lineas { margin-top: 12px; display: grid; gap: 6px; }
.tor-ahora-linea {
  display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: center;
  min-height: 48px; padding: 7px 8px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid);
}
.tor-ahora-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; border: 1px solid var(--t-borde); background: var(--t-soft); color: var(--t); }
.tor-ahora-linea-txt { font-size: 13.5px; font-weight: 600; line-height: 1.3; }
.tor-ahora-linea-txt small { display: block; margin-top: 1px; font-size: 12px; font-weight: 400; color: var(--dim); }

/* Piezas de una obra */
.tor-piezas { display: grid; gap: 6px; }
.tor-grupo-cab { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 8px 2px 2px; }
.tor-grupo-cab .pto { width: 8px; height: 8px; border-radius: 50%; background: var(--g, var(--dim)); flex-shrink: 0; }
.tor-grupo-cab .nom { font-size: 12px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.tor-grupo-cab .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.tor-grupo-cab .regla { flex: 1; height: 1px; background: linear-gradient(90deg, var(--border), transparent); }

.tor-pieza { border: 1px solid var(--border); border-radius: 13px; background: var(--panel-solid); transition: border-color .15s, background-color .15s; }
.tor-pieza:hover { border-color: var(--border-2); }
.tor-pieza.abierta { border-color: var(--border-2); }
.tor-pieza.hecha { background: transparent; }
.tor-pieza-fila { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 12px; }
.tor-pieza-ic {
  width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0;
  border: 1px solid var(--t-borde, var(--border)); background: var(--t-soft, var(--panel-2)); color: var(--t, var(--muted));
}
.tor-pieza-txt { min-width: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; padding: 0; cursor: pointer; }
.tor-pieza-nom { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-size: 14px; font-weight: 600; line-height: 1.3; }
.tor-pieza.hecha .tor-pieza-nom { color: var(--muted); }
.tor-pieza-sub { margin-top: 3px; display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; font-size: 12px; color: var(--dim); }
.tor-pieza-acc { display: flex; gap: 6px; align-items: center; }
.tor-pieza-riel { padding: 0 12px 11px 58px; display: grid; gap: 7px; min-width: 0; }
.tor-forma { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; color: var(--dim); }
.tor-forma svg { color: var(--blue); flex-shrink: 0; }
.tor-forma b { color: var(--muted); font-weight: 600; }
.tor-pieza-mas { padding: 2px 12px 12px 58px; display: grid; gap: 10px; animation: tor-aparece .2s ease both; }
.tor-pieza-mas .linea { font-size: 12.5px; line-height: 1.45; color: var(--dim); }
.tor-pieza-mas .linea b { color: var(--muted); font-weight: 600; }
.tor-pieza-mas .linea.alerta { color: var(--cyan); }
.tor-pieza-mas .acciones { display: flex; gap: 6px; flex-wrap: wrap; }
.tor-cat { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: 12px; color: var(--dim); }
.tor-cat svg { flex-shrink: 0; color: var(--green); }
.tor-cat span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* El recorrido de un material, en un riel */
.tor-riel { display: flex; align-items: center; gap: 0; min-width: 0; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; position: relative; }
.tor-riel::-webkit-scrollbar { display: none; }
.tor-riel-nodo {
  min-height: 26px; display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; padding: 3px 9px;
  border: 1px solid var(--border); border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.tor-riel-via { flex: 1 1 10px; min-width: 10px; height: 3px; border-radius: 99px; margin: 0 4px; background: var(--panel-2); position: relative; overflow: hidden; }
.tor-riel-via[data-hecho="1"] { background: currentColor; }
.tor-riel-via[data-curso="1"]::after {
  content: ""; position: absolute; top: 0; right: 0; bottom: 0; left: 0; border-radius: 99px;
  background: linear-gradient(90deg, transparent, currentColor, transparent); animation: tor-via 1.5s linear infinite;
}

/* Filas de configuración (materiales) */
.tor-filas { display: grid; gap: 8px; }
.tor-fila { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px 14px; align-items: start; padding: 12px; border: 1px solid var(--border); border-radius: 13px; background: var(--panel-solid); }
.tor-fila.atencion { border-color: var(--cyan-border); background: color-mix(in srgb, var(--cyan-soft) 50%, var(--panel-solid)); }
.tor-fila.apagada { opacity: .55; }
.tor-fila-tit { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-size: 14px; font-weight: 600; line-height: 1.3; }
.tor-fila-txt { margin-top: 3px; font-size: 12px; color: var(--dim); line-height: 1.45; }
.tor-fila-txt.alerta { color: var(--cyan); }
.tor-fila-txt.ok { color: var(--green); }
.tor-fila-der { display: grid; justify-items: end; gap: 8px; }
.tor-fila-botones { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.tor-select { min-height: 32px; padding: 0 8px; border: 1px solid var(--border-2); border-radius: 9px; background: var(--panel-solid); color: var(--muted); font: inherit; font-size: 12.5px; }
.tor-planos { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
.tor-planos a { max-width: 170px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--blue-border); background: var(--blue-soft); color: var(--blue); font-size: 11.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }

/* Historial */
.tor-hist { display: grid; }
.tor-hist-item { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 7px 0; position: relative; font-size: 12.5px; }
button.tor-hist-item { width: 100%; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
button.tor-hist-item:hover .tor-hist-acc { color: var(--blue); }
.tor-hist-item::before { content: ""; position: absolute; left: 6px; top: 20px; bottom: -8px; width: 1.5px; background: var(--border); }
.tor-hist-item:last-child::before { display: none; }
.tor-hist-pto { width: 9px; height: 9px; margin: 4px 0 0 2.5px; border-radius: 50%; background: var(--t, var(--border-3)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--t, var(--border-3)) 18%, transparent); }
.tor-hist-acc { color: var(--text); line-height: 1.35; }
.tor-hist-quien { color: var(--subtle); font-size: 11.5px; margin-top: 1px; }
.tor-hist-fecha { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); white-space: nowrap; }

/* Pasos (gestión del circuito) */
.tor-pasos { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: 10px; }
.tor-operation { transition: border-color .16s ease, box-shadow .16s ease; }
.tor-operation:hover { border-color: var(--border-2) !important; }
.tor-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* ── Obras en el celular: las tarjetas de siempre (vistas/ObrasMovil) ── */
.tor .tor-process-card { width: 100%; height: max-content; text-align: left; outline: none; transition: border-color .16s ease; }
.tor .tor-process-card:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
@keyframes torCardEnter { 0% { opacity: 0; transform: translateY(10px) scale(.985); } 60% { opacity: 1; } 100% { opacity: 1; transform: none; } }
.tor .tor-route-card { transition: border-color .16s ease, box-shadow .16s ease; animation: torCardEnter .28s cubic-bezier(.16,1,.3,1) backwards; }
.tor .tor-group-head { display: flex; align-items: center; gap: 8px; }
.tor .tor-group-rule { flex: 1; height: 1px; min-width: 12px; background: linear-gradient(90deg, var(--border), transparent); }
.tor .tor-transform-card { container-type: inline-size; }
.tor .tor-transform-flow { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(300px,420px); align-items: center; gap: 12px; min-width: 0; }
.tor .tor-transform-connector { display: grid; place-items: center; align-self: center; padding: 0 2px; }
@container (max-width: 960px) {
  .tor .tor-transform-flow { grid-template-columns: minmax(0,1fr); align-items: stretch; }
  .tor .tor-transform-connector { padding: 3px 10px; }
  .tor .tor-transform-arrow { transform: rotate(90deg); }
}
@container (max-width: 900px) { .tor .tor-transform-sources { grid-template-columns: minmax(0,1fr); } }
.tor .tor-circuit-blocks { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%,560px),1fr)); gap: 10px; align-items: start; }
.tor .tor-transform-sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%,420px),1fr)); gap: 8px; align-items: start; }
.tor .tor-route-action, .tor .tor-management-toggle { transition: filter .14s ease, transform .1s ease; }
.tor .tor-route-action:active { transform: scale(.985); }
.tor .tor-operation-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
@media (max-width: 1120px) { .tor .tor-operation-grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .tor .tor-route-card { animation: none; } }

/* ── Menú de acciones: popover / hoja ── */
.tor-menu-fondo { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 3500; }
.tor-menu {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 3501; min-width: 272px; padding: 6px;
  border: 1px solid var(--border-2); border-radius: 14px; background: var(--panel-solid); box-shadow: var(--elev-2);
}
.tor-hoja-fondo { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 3500; background: var(--overlay); animation: tor-aparece .2s ease; }
.tor-hoja {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 3501; padding: 10px 10px calc(12px + env(safe-area-inset-bottom, 0px));
  border-radius: 20px 20px 0 0; border-top: 1px solid var(--border-2); background: var(--panel-solid);
  font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
  animation: tor-desde-abajo .32s cubic-bezier(.22,1,.36,1);
}
.tor-hoja-asa { width: 38px; height: 4px; margin: 0 auto 8px; border-radius: 99px; background: var(--border-3); }
.tor-hoja-tit { padding: 4px 12px 8px; font-size: 12.5px; color: var(--dim); }
.tor-opcion {
  display: flex; align-items: center; gap: 12px; width: 100%; min-height: 50px; padding: 6px 12px;
  border: 0; border-radius: 10px; background: transparent; color: var(--text); font: inherit; font-size: 14.5px; text-align: left; cursor: pointer;
}
.tor-opcion:hover { background: var(--panel-2); }
.tor-opcion svg { flex-shrink: 0; color: var(--dim); }
.tor-opcion small { display: block; margin-top: 1px; font-size: 12px; line-height: 1.35; color: var(--dim); }
.tor-opcion[data-peligro="1"], .tor-opcion[data-peligro="1"] svg { color: var(--red); }
.tor-opcion-sep { height: 1px; margin: 6px 8px; background: var(--border); }

/* ── Diálogos: tarjeta centrada; en el celular, hoja desde abajo ── */
.tor-modal-fondo {
  position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 3000; display: grid; place-items: center; padding: 14px;
  background: var(--overlay); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: tor-aparece .18s ease both;
}
.tor-modal {
  width: min(var(--ancho, 640px), 100%); max-height: min(88vh, 820px); display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--border-2); border-radius: 18px; background: var(--panel-solid); box-shadow: var(--elev-2);
  animation: tor-sube .3s cubic-bezier(.22,1,.36,1) both; font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
}
.tor-modal-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
.tor-modal-tit { font-size: 16px; font-weight: 650; line-height: 1.25; }
.tor-modal-sub { margin-top: 3px; font-size: 12.5px; line-height: 1.45; color: var(--dim); }
.tor-modal-cuerpo { padding: 16px 18px; overflow-y: auto; }
.tor-modal-pie { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--border); background: var(--panel-solid-2); }

@keyframes tor-sube { from { opacity: 0; transform: translateY(10px); } }
@keyframes tor-crece { from { transform: scaleX(0); } }
@keyframes tor-aparece { from { opacity: 0; } }
@keyframes tor-desde-abajo { from { opacity: .4; transform: translateY(100%); } }
@keyframes tor-gira { to { transform: rotate(360deg); } }
@keyframes tor-via { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) {
  .tor-riel-via[data-curso="1"]::after { animation: none; background: currentColor; opacity: .45; }
}

/* ── Celular ── */
@media (max-width: 899px) {
  .tor-solo-escritorio { display: none !important; }

  /* Las áreas van abajo, al alcance del pulgar (como Muebles y Compras). */
  .tor-nav {
    order: 3; min-height: 0; gap: 6px; padding: 4px 8px calc(4px + env(safe-area-inset-bottom));
    border-bottom: 0; border-top: 1px solid var(--border); background: var(--topbar);
  }
  .tor-nav-marca, .tor-nav-sep { display: none; }
  .tor-nav .ui-tabs { flex: 1; }
  .tor-nav .ui-tab { position: relative; flex: 1; flex-direction: column; justify-content: center; gap: 3px; min-height: 52px; padding: 0 6px; font-size: 11.5px; }
  .tor-nav .ui-tab svg { width: 19px; height: 19px; }
  .tor-nav .ui-tab .n { position: absolute; top: 4px; left: calc(50% + 9px); font-size: 10px; }
  .tor-nav .ui-tab[aria-selected="true"]::after { top: -5px; bottom: auto; left: 22%; right: 22%; }
  .tor-nav-der { margin-left: 0; }

  .tor-barra { padding: 12px 16px 10px; }
  .tor-h1 { font-size: 20px; }
  .tor-filtros { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 12px -16px 0; padding: 0 16px; }
  .tor-filtros::-webkit-scrollbar { display: none; }
  .tor-filtros > .tor-scroll-x, .tor-filtros > .tor-seg { flex: 0 0 auto; overflow: visible; }
  .tor-buscar { flex: 0 0 210px; }
  .tor-acciones { width: 100%; }
  .tor-acciones > .ui-btn { flex: 1; }
  .tor-vista.en-detalle > .tor-barra { display: none; }

  /* Tablero: una etapa por vez, elegida con los chips de arriba. */
  .tor-tablero { display: block; overflow-y: auto; padding: 0 16px 24px; }
  .tor-col { display: none; border: 0; background: transparent; animation: none; }
  .tor-col.activa { display: flex; }
  .tor-col-cab { padding: 2px 2px 10px; border-bottom: 0; }
  .tor-col-cuerpo { overflow: visible; padding: 0; }
  .tor-col-pie { position: sticky; bottom: 0; z-index: 4; padding: 12px 0 4px; border-top: 0; background: linear-gradient(transparent, var(--bg) 35%); }

  /* Lista y detalle se alternan: el detalle ocupa toda la pantalla. */
  .tor-dos { grid-template-columns: minmax(0, 1fr); }
  .tor-dos.con-detalle .tor-lista { display: none; }
  .tor-dos:not(.con-detalle) .tor-detalle { display: none; }
  .tor-lista { padding: 10px 16px 24px; border-right: 0; }
  .tor-panel { padding: 0 16px 32px; }
  .tor-volver-movil {
    display: flex; align-items: center; gap: 6px; position: sticky; top: 0; z-index: 9;
    margin: 0 -16px; padding: 10px 16px; border: 0; border-bottom: 1px solid var(--border);
    background: var(--topbar); -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
    color: var(--text); font: inherit; font-size: 14px; font-weight: 600; text-align: left; width: calc(100% + 32px);
  }
  .tor-cab { grid-template-columns: auto minmax(0, 1fr); }
  .tor-cab-acc { grid-column: 1 / -1; }
  .tor-cab-tit { font-size: 20px; }
  .tor-bloque { padding: 12px; border-radius: 14px; }
  .tor-ahora { padding: 14px; }
  .tor-ahora-linea { grid-template-columns: 30px minmax(0, 1fr); }
  .tor-ahora-linea > .ui-btn { grid-column: 1 / -1; width: 100%; }
  .tor-pieza-fila { grid-template-columns: auto minmax(0, 1fr); padding: 10px; }
  .tor-pieza-acc { grid-column: 1 / -1; }
  .tor-pieza-acc > .ui-btn { flex: 1; }
  .tor-pieza-mas { padding: 0 10px 12px; }
  .tor-fila { grid-template-columns: minmax(0, 1fr); }
  .tor-fila-der { justify-items: stretch; grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
  .tor-form-grid { grid-template-columns: 1fr; }
  .tor-form-grid > * { grid-column: 1 !important; }
  .tor-pasos { grid-template-columns: minmax(0, 1fr); }

  .tor-modal-fondo { place-items: end stretch; padding: 0; }
  .tor-modal { width: 100%; max-height: 92vh; border-radius: 20px 20px 0 0; border-bottom: 0; animation: tor-desde-abajo .32s cubic-bezier(.22,1,.36,1) both; }
  .tor-modal-pie .ui-btn, .tor-modal-pie button { flex: 1 1 130px; }
}
`;
