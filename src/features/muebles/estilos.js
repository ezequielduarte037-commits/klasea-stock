// Estilos del módulo Muebles (Seguimiento, Recepción y Stock). Todo va bajo
// .mbl para no tocar el resto de la app mientras la pantalla está montada.
// Colores sólo con tokens del tema: funcionan en oscuro, claro y alto
// contraste. Mismo lenguaje que Obras (.prd): barra del módulo, títulos,
// segmentados, chips, paneles y tonos por data-tono.
export const CSS_MUEBLES = `
.mbl {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  background:
    radial-gradient(1100px 380px at 18% -12%, var(--glow-a), transparent 70%),
    radial-gradient(700px 300px at 100% 110%, var(--glow-b), transparent 70%),
    var(--bg);
  color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
}
.mbl .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.mbl h1, .mbl h2, .mbl h3, .mbl p { margin: 0; }

/* ── Navegación del módulo ── */
.mbl-nav {
  position: relative; z-index: 20; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--topbar-soft);
  -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
}
.mbl-nav-marca { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 14px; font-weight: 650; color: var(--text); }
.mbl-nav-marca svg { color: var(--blue); }
.mbl-nav-sep { width: 1px; height: 22px; background: var(--border); flex-shrink: 0; }
.mbl-nav .ui-tabs { flex: 0 1 auto; min-width: 0; }
.mbl-nav .ui-tab { display: inline-flex; align-items: center; gap: 7px; }
.mbl-nav .ui-tab svg { opacity: .75; }
.mbl-nav .ui-tab .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }

.mbl-vista { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; animation: mbl-aparece .25s ease both; }

/* ── Barra de una vista ── */
.mbl-barra { flex-shrink: 0; padding: 16px 24px 12px; position: relative; z-index: 5; }
.mbl-barra-fila { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.mbl-titulos { min-width: 0; flex: 1; animation: mbl-sube .5s cubic-bezier(.22,1,.36,1) both; }
.mbl-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.mbl-h1 { margin-top: 3px; font-size: 24px; font-weight: 700; letter-spacing: -.02em; line-height: 1.12; }
.mbl-h1 .acento { background: var(--brand-grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.mbl-sub { margin-top: 5px; font-size: 13px; color: var(--dim); }
.mbl-sub b { color: var(--muted); font-weight: 600; }
.mbl-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mbl-filtros { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.mbl-sp { flex: 1; }
.mbl-scroll-x { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.mbl-scroll-x::-webkit-scrollbar { display: none; }

.mbl-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); flex-shrink: 0; }
.mbl-seg button {
  display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 11px;
  border: 0; border-radius: 8px; background: transparent; color: var(--dim);
  font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap;
  transition: background-color .18s, color .18s, box-shadow .18s;
}
.mbl-seg button:hover { color: var(--text); }
.mbl-seg button.on { background: var(--panel-solid-3); color: var(--text); box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 4px 12px -6px var(--shadow); }
.mbl-seg .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.mbl-seg button.on .n { color: var(--blue); }

.mbl-chip {
  display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 11px;
  border: 1px solid transparent; border-radius: 10px; background: transparent;
  color: var(--dim); font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0;
  transition: background-color .18s, border-color .18s, color .18s;
}
.mbl-chip:hover { color: var(--text); background: var(--panel); }
.mbl-chip.on { color: var(--text); background: var(--panel-2); border-color: var(--border-2); }
.mbl-chip .pto { width: 7px; height: 7px; border-radius: 50%; background: var(--t, var(--muted)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--t, var(--muted)) 18%, transparent); }
.mbl-chip .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.mbl-chip.on .n { color: var(--text); }

.mbl-buscar { position: relative; flex: 0 1 260px; min-width: 160px; }
.mbl-buscar svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--subtle); pointer-events: none; }
.mbl-buscar input { padding-left: 34px; min-height: 36px; font-size: 13px; }

.mbl-btn-ic {
  width: 36px; height: 36px; display: grid; place-items: center; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--muted);
  transition: background-color .15s, color .15s, border-color .15s, transform .12s;
}
.mbl-btn-ic:hover:not(:disabled) { background: var(--panel-2); color: var(--text); border-color: var(--border-2); }
.mbl-btn-ic:active:not(:disabled) { transform: scale(.95); }
.mbl-btn-ic:disabled { opacity: .35; cursor: default; }
.mbl-btn-ic.peligro:hover:not(:disabled) { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
.mbl .ui-btn.chico { min-height: 32px; padding: 0 11px; font-size: 12.5px; border-radius: 9px; }

/* Tonos */
.mbl [data-tono="azul"]    { --t: var(--blue);   --t-soft: var(--blue-soft);   --t-borde: var(--blue-border); }
.mbl [data-tono="verde"]   { --t: var(--green);  --t-soft: var(--green-soft);  --t-borde: var(--green-border); }
.mbl [data-tono="rojo"]    { --t: var(--red);    --t-soft: var(--red-soft);    --t-borde: var(--red-border); }
.mbl [data-tono="violeta"] { --t: var(--violet); --t-soft: var(--violet-soft); --t-borde: var(--violet-border); }
.mbl [data-tono="cian"]    { --t: var(--cyan);   --t-soft: var(--cyan-soft);   --t-borde: var(--cyan-border); }
.mbl [data-tono="teal"]    { --t: var(--teal);   --t-soft: var(--teal-soft);   --t-borde: var(--teal-border); }
.mbl [data-tono="neutro"]  { --t: var(--dim);    --t-soft: var(--panel-2);     --t-borde: var(--border); }
.mbl-estado {
  display: inline-flex; align-items: center; gap: 6px; min-height: 22px; padding: 0 9px;
  border: 1px solid var(--t-borde, var(--border)); border-radius: 999px; background: var(--t-soft, var(--panel-2)); color: var(--t, var(--dim));
  font-size: 11.5px; font-weight: 600; white-space: nowrap; line-height: 1;
}
.mbl-estado.punto::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.mbl-tag {
  display: inline-flex; align-items: center; gap: 5px; min-height: 20px; padding: 0 7px;
  border-radius: 6px; border: 1px solid var(--t-borde, var(--border)); background: var(--t-soft, var(--panel));
  color: var(--t, var(--muted)); font-size: 10.5px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap;
}

/* Barras de avance */
.mbl-mini { height: 4px; border-radius: 99px; background: var(--panel-3); overflow: hidden; }
.mbl-mini i { display: block; height: 100%; border-radius: 99px; background: var(--brand-grad); transform-origin: left; animation: mbl-crece .8s cubic-bezier(.22,1,.36,1) both; }
.mbl-mini i.lleno { background: var(--green); }
.mbl-av { display: flex; height: 8px; border-radius: 99px; overflow: hidden; background: var(--panel-3); gap: 2px; }
.mbl-av i { display: block; height: 100%; transform-origin: left; animation: mbl-crece .8s cubic-bezier(.22,1,.36,1) both; }
.mbl-av i[data-tono] { background: var(--t); }

/* Avisos */
.mbl-aviso {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
  border: 1px solid var(--t-borde, var(--border)); border-radius: 12px; background: var(--t-soft, var(--panel));
  color: var(--t, var(--muted)); font-size: 12.5px; line-height: 1.5;
}
.mbl-aviso > span { flex: 1; min-width: 0; color: var(--text); }
.mbl-aviso button.cerrar { border: 0; background: transparent; color: inherit; padding: 2px; border-radius: 6px; display: grid; place-items: center; }

.mbl-vacio { display: grid; justify-items: center; align-content: center; gap: 8px; padding: 60px 20px; text-align: center; color: var(--dim); font-size: 13px; }
.mbl-vacio-ic { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; color: var(--blue); border: 1px solid var(--blue-border); background: linear-gradient(145deg, var(--blue-soft), var(--cyan-soft)); margin-bottom: 4px; }
.mbl-vacio b { color: var(--text); font-size: 15px; font-weight: 650; }

/* ── Dos paneles: lista + detalle ── */
.mbl-dos { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); border-top: 1px solid var(--border); }
.mbl-lista { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 12px 24px 20px; display: grid; grid-auto-rows: max-content; gap: 8px; align-content: start; border-right: 1px solid var(--border); }
.mbl-detalle { min-height: 0; overflow-y: auto; overscroll-behavior: contain; position: relative; container-type: inline-size; }

.mbl-item {
  position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center;
  width: 100%; padding: 12px 12px 12px 12px; border: 1px solid var(--border); border-radius: 14px;
  background: var(--panel); color: var(--text); font: inherit; text-align: left;
  transition: background-color .16s, border-color .16s, transform .16s cubic-bezier(.22,1,.36,1), box-shadow .16s;
  animation: mbl-sube .42s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 26ms);
}
.mbl-item:hover { border-color: var(--border-2); background: var(--panel-2); }
.mbl-item.on { border-color: var(--blue-border); background: color-mix(in srgb, var(--blue-soft) 70%, var(--panel)); box-shadow: 0 10px 28px -18px color-mix(in srgb, var(--blue) 60%, transparent); }
.mbl-item.on::before { content: ""; position: absolute; left: -1px; top: 12px; bottom: 12px; width: 3px; border-radius: 0 3px 3px 0; background: var(--brand-grad); }
.mbl-item-sw > span { width: 100% !important; height: 100% !important; border-radius: 0 !important; border: 0 !important; }
.mbl-item-sw { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; overflow: hidden; background: var(--panel-2); border: 1px solid var(--border); color: var(--subtle); flex-shrink: 0; }
.mbl-item-l1 { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.mbl-item-nom { font-size: 14px; font-weight: 600; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mbl-item-sub { margin-top: 2px; font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mbl-item-av { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; margin-top: 9px; font-size: 11.5px; color: var(--muted); }
.mbl-item-av .mono { color: var(--subtle); font-size: 11px; }
.mbl-item-flecha { color: var(--subtle); align-self: center; }

/* ── Panel de detalle ── */
.mbl-panel { padding: 18px 24px 40px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-content: start; max-width: 980px; animation: mbl-aparece .3s ease both; }
.mbl-cab { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: center; }
.mbl-cab-sw { width: 58px; height: 58px; border-radius: 16px; display: grid; place-items: center; overflow: hidden; border: 1px solid var(--border-2); background: var(--panel-2); color: var(--subtle); box-shadow: var(--elev-1); }
.mbl-cab-sw > span { width: 100% !important; height: 100% !important; border-radius: 0 !important; }
.mbl-cab-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.mbl-cab-tit { font-size: 21px; font-weight: 700; letter-spacing: -.015em; line-height: 1.15; overflow-wrap: anywhere; }
.mbl-cab-sub { margin-top: 3px; font-size: 12.5px; color: var(--dim); }
.mbl-cab-acc { display: flex; gap: 6px; align-items: center; }
.mbl-volver-movil { display: none; }

.mbl-bloque { border: 1px solid var(--border); border-radius: 16px; background: var(--panel); padding: 14px 16px; animation: mbl-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 40ms); }
.mbl-bloque-cab { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.mbl-bloque-cab h3 { font-size: 11px; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.mbl-bloque-cab .der { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.mbl-bloque-txt { font-size: 12.5px; color: var(--dim); line-height: 1.5; }

/* Con el detalle angosto, las acciones del encabezado bajan a su renglón. */
@container (max-width: 760px) {
  .mbl-cab { grid-template-columns: auto minmax(0, 1fr); }
  .mbl-cab-acc { grid-column: 1 / -1; justify-content: flex-start !important; flex-wrap: wrap; }
}

/* Recorrido de etapas */
.mbl-ruta { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(86px, 1fr); overflow-x: auto; scrollbar-width: thin; padding-bottom: 4px; }
.mbl-paso {
  position: relative; display: grid; justify-items: center; align-content: start; gap: 8px;
  min-height: 82px; padding: 4px 6px 6px; border: 0; border-radius: 12px; background: transparent;
  color: var(--subtle); font: inherit; text-align: center;
  transition: background-color .15s, color .15s;
}
.mbl-paso::before { content: ""; position: absolute; top: 18px; left: calc(-50% + 18px); right: calc(50% + 18px); height: 2px; border-radius: 2px; background: var(--border-2); }
.mbl-paso:first-child::before { display: none; }
.mbl-paso.hecho::before, .mbl-paso.actual::before { background: var(--brand-grad); }
.mbl-paso:not(:disabled):hover { background: var(--panel-2); color: var(--text); }
.mbl-paso:disabled { cursor: default; }
.mbl-paso-nodo {
  position: relative; z-index: 1; width: 30px; height: 30px; border-radius: 50%;
  display: grid; place-items: center; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 650;
  border: 1.5px solid var(--border-3); background: var(--bg); color: var(--subtle);
  transition: transform .2s cubic-bezier(.22,1,.36,1);
}
.mbl-paso.hecho .mbl-paso-nodo { border-color: transparent; background: var(--brand-grad); color: var(--inverse-text); }
.mbl-paso.actual .mbl-paso-nodo { border-color: var(--blue); color: var(--blue); background: var(--blue-soft); box-shadow: 0 0 0 5px color-mix(in srgb, var(--blue) 14%, transparent); transform: scale(1.08); }
.mbl-paso-et { font-size: 11.5px; font-weight: 500; line-height: 1.25; }
.mbl-paso.hecho .mbl-paso-et { color: var(--muted); }
.mbl-paso.actual .mbl-paso-et { color: var(--text); font-weight: 650; }

/* La etapa actual: qué hacer y cómo avanzar */
.mbl-ahora {
  position: relative; overflow: hidden; border-radius: 18px; padding: 16px 18px;
  border: 1px solid var(--blue-border);
  background:
    radial-gradient(420px 160px at 100% 0%, var(--glow-a), transparent 70%),
    color-mix(in srgb, var(--blue-soft) 45%, var(--panel-solid));
  box-shadow: var(--elev-1);
  animation: mbl-sube .45s cubic-bezier(.22,1,.36,1) both;
}
.mbl-ahora-eyebrow { font-size: 11px; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; color: var(--blue); }
.mbl-ahora-tit { margin-top: 4px; font-size: 18px; font-weight: 700; letter-spacing: -.01em; }
.mbl-ahora-txt { margin-top: 3px; font-size: 13px; color: var(--muted); line-height: 1.45; }
.mbl-ahora-cuerpo { margin-top: 12px; display: grid; gap: 10px; }
.mbl-ahora-acc { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

/* Filas del circuito (OT, herrajes, recepción) */
.mbl-filas { display: grid; gap: 8px; }
.mbl-fila { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 12px; border: 1px solid var(--border); border-radius: 13px; background: var(--panel-solid); }
.mbl-fila-ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; border: 1px solid var(--t-borde, var(--border)); background: var(--t-soft, var(--panel-2)); color: var(--t, var(--muted)); flex-shrink: 0; }
.mbl-fila-tit { font-size: 13.5px; font-weight: 600; line-height: 1.3; }
.mbl-fila-txt { margin-top: 2px; font-size: 12px; color: var(--dim); line-height: 1.45; }
.mbl-fila-acc { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.mbl-fila-der { display: grid; justify-items: end; gap: 6px; }

/* Tareas con tilde */
.mbl-tareas { display: grid; gap: 2px; margin-top: 10px; }
.mbl-tarea {
  display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 4px 8px; margin: 0 -8px;
  border: 0; border-radius: 9px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; text-align: left;
  transition: background-color .15s, color .15s;
}
.mbl-tarea:not(:disabled):hover { background: var(--panel-2); color: var(--text); }
.mbl-tarea:disabled { cursor: default; }
.mbl-tarea.on { color: var(--text); }
.mbl-check {
  width: 20px; height: 20px; flex-shrink: 0; border-radius: 6px; display: grid; place-items: center;
  border: 1.5px solid var(--border-3); background: var(--bg); color: var(--inverse-text);
  transition: background-color .18s, border-color .18s, transform .18s cubic-bezier(.22,1,.36,1);
}
.mbl-tarea.on .mbl-check, .mbl-check.on { background: var(--green); border-color: var(--green); }
.mbl-tarea:active:not(:disabled) .mbl-check { transform: scale(.9); }

/* Datos clave */
.mbl-datos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 16px; }
.mbl-dato-et { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--subtle); margin-bottom: 5px; }
.mbl-dato-v { font-size: 13px; color: var(--text); line-height: 1.4; overflow-wrap: anywhere; }
.mbl-dato-v.vacio { color: var(--subtle); }
.mbl-obs { margin-top: 12px; padding: 10px 12px; border-radius: 11px; background: var(--bg); border: 1px solid var(--border); font-size: 12.5px; color: var(--muted); line-height: 1.5; white-space: pre-wrap; }

/* Historial */
.mbl-hist { display: grid; }
.mbl-hist-item { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 7px 0; position: relative; font-size: 12.5px; }
.mbl-hist-item::before { content: ""; position: absolute; left: 6px; top: 20px; bottom: -8px; width: 1.5px; background: var(--border); }
.mbl-hist-item:last-child::before { display: none; }
.mbl-hist-pto { width: 9px; height: 9px; margin: 4px 0 0 2.5px; border-radius: 50%; background: var(--t, var(--border-3)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--t, var(--border-3)) 18%, transparent); }
.mbl-hist-acc { color: var(--text); line-height: 1.35; }
.mbl-hist-quien { color: var(--subtle); font-size: 11.5px; margin-top: 1px; }
.mbl-hist-fecha { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); white-space: nowrap; }

/* ── Recepción ── */
.mbl-dos.rec { grid-template-columns: minmax(260px, 300px) minmax(0, 1fr); }
.mbl-riel { min-height: 0; display: flex; flex-direction: column; border-right: 1px solid var(--border); background: color-mix(in srgb, var(--panel-solid) 40%, transparent); }
.mbl-riel-cab { flex-shrink: 0; padding: 12px 14px 10px 18px; border-bottom: 1px solid var(--border); display: grid; gap: 8px; }
.mbl-riel-cuerpo { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 6px 8px 16px 12px; }
.mbl-riel-pie { flex-shrink: 0; padding: 10px 14px 12px 18px; border-top: 1px solid var(--border); }
.mbl-linea-cab { display: flex; align-items: center; gap: 8px; padding: 12px 6px 6px; }
.mbl-linea-cab .nom { font-size: 12px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.mbl-linea-cab .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.mbl-linea-cab .der { margin-left: auto; display: flex; gap: 2px; }
.mbl-link { border: 0; background: transparent; color: var(--blue); font: inherit; font-size: 12px; font-weight: 600; padding: 4px 6px; border-radius: 7px; }
.mbl-link:hover { background: var(--blue-soft); }
.mbl-link.tenue { color: var(--dim); }
.mbl-link.tenue:hover { color: var(--text); background: var(--panel-2); }
.mbl-obra {
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; align-items: center;
  width: 100%; min-height: 50px; padding: 8px 10px; border: 1px solid transparent; border-radius: 11px;
  background: transparent; color: var(--text); font: inherit; text-align: left;
  transition: background-color .15s, border-color .15s;
}
.mbl-obra:hover { background: var(--panel-2); }
.mbl-obra.on { background: color-mix(in srgb, var(--blue-soft) 70%, var(--panel)); border-color: var(--blue-border); }
.mbl-obra.on::before { content: ""; position: absolute; left: -1px; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: var(--brand-grad); }
.mbl-obra-cod { display: flex; align-items: center; gap: 7px; min-width: 0; font-family: 'JetBrains Mono', monospace; font-size: 13.5px; font-weight: 600; white-space: nowrap; }
.mbl-obra-cuenta { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); text-align: right; }
.mbl-obra .mbl-mini { grid-column: 1 / -1; height: 3px; }
.mbl-obra.plantilla { min-height: 40px; color: var(--dim); }
.mbl-obra.plantilla .mbl-obra-cod { font-family: inherit; font-size: 12.5px; font-weight: 600; }
.mbl-alta { display: flex; gap: 6px; }
.mbl-alta .ui-input { min-height: 34px; font-size: 13px; }

.mbl-rec { padding: 18px 24px 40px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-content: start; max-width: 1100px; }
.mbl-resumen { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px 18px; align-items: center; padding: 14px 16px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel); }
.mbl-pct { font-family: 'JetBrains Mono', monospace; font-size: 34px; font-weight: 650; letter-spacing: -.04em; line-height: 1; }
.mbl-pct small { font-size: 16px; color: var(--dim); margin-left: 1px; }
.mbl-pct-et { font-size: 11.5px; color: var(--dim); margin-top: 4px; }
.mbl-resumen .mbl-scroll-x { grid-column: 1 / -1; margin: 0 -4px; flex-wrap: wrap; overflow: visible; }

.mbl-sector { margin-top: 8px; }
.mbl-sector-cab { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 0 8px; margin: 0 -8px; background: var(--bg); border-bottom: 1px solid var(--border); }
.mbl-sector-cab .nom { font-size: 12px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.mbl-sector-cab .n { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.mbl-sector-cab .mbl-mini { width: 64px; }
.mbl-pieza {
  display: grid; grid-template-columns: 30px 46px minmax(0, 1fr) auto auto; gap: 12px; align-items: center;
  min-height: 64px; padding: 8px 6px; border-bottom: 1px solid var(--border);
  transition: background-color .15s;
}
.mbl-pieza.sel { grid-template-columns: 22px 30px 46px minmax(0, 1fr) auto; cursor: pointer; }
.mbl-pieza:hover { background: var(--panel); }
.mbl-pieza.marcada { background: var(--blue-soft); }
.mbl-pieza-nro { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: var(--muted); text-align: right; }
.mbl-pieza.hecha .mbl-pieza-nro { color: var(--subtle); }
.mbl-thumb { width: 46px; height: 46px; border-radius: 10px; overflow: hidden; display: grid; place-items: center; background: var(--panel-2); border: 1px solid var(--border); color: var(--subtle); padding: 0; flex-shrink: 0; }
.mbl-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
button.mbl-thumb:hover { border-color: var(--border-3); }
.mbl-pieza-nom { border: 0; background: transparent; color: var(--text); font: inherit; font-size: 14px; font-weight: 500; text-align: left; padding: 0; line-height: 1.3; }
.mbl-pieza-nom:hover { color: var(--blue); }
.mbl-pieza.hecha .mbl-pieza-nom { color: var(--dim); }
.mbl-pieza-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 3px; font-size: 11.5px; color: var(--subtle); }
.mbl-pieza-meta .ok { color: var(--green); }
.mbl-nota { border: 0; background: transparent; color: var(--subtle); font: inherit; font-size: 12px; padding: 1px 0; text-align: left; }
.mbl-nota:hover { color: var(--text); }
.mbl-nota.con { color: var(--muted); font-style: italic; }
.mbl-nota-input { width: 100%; margin-top: 4px; border: 0; border-bottom: 1px solid var(--border-2); background: transparent; color: var(--text); font: inherit; font-size: 12.5px; padding: 3px 0; outline: none; }

/* Estado de una pieza: un toque elige el estado (antes había botón y lista). */
.mbl-est4 { display: inline-grid; grid-template-columns: repeat(4, auto); gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 11px; background: var(--bg); }
.mbl-est4 button {
  display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 0 9px; border: 1px solid transparent; border-radius: 8px;
  background: transparent; color: var(--subtle); font: inherit; font-size: 12px; font-weight: 600; white-space: nowrap;
  transition: background-color .16s, color .16s, border-color .16s;
}
.mbl-est4 button:hover:not(:disabled) { color: var(--text); background: var(--panel-2); }
.mbl-est4 button.on { color: var(--t); background: var(--t-soft); border-color: var(--t-borde); }
.mbl-est4 button:disabled { cursor: default; }
@media (min-width: 900px) and (max-width: 1320px) {
  .mbl-est4 button:not(.on) .txt { display: none; }
  .mbl-est4 button { padding: 0 8px; }
}
.mbl-check-sel { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--border-3); display: grid; place-items: center; color: var(--inverse-text); }
.mbl-check-sel.on { background: var(--blue); border-color: var(--blue); }

.mbl-flotante {
  position: sticky; top: 0; z-index: 8; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 10px 12px; border: 1px solid var(--blue-border); border-radius: 14px;
  background: color-mix(in srgb, var(--panel-solid) 92%, transparent);
  -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
  box-shadow: var(--elev-2); animation: mbl-sube .3s cubic-bezier(.22,1,.36,1) both;
}
.mbl-flotante .cuenta { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 650; color: var(--blue); min-width: 92px; }

.mbl-agregar { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--blue-border); border-radius: 16px; background: color-mix(in srgb, var(--blue-soft) 45%, transparent); animation: mbl-sube .35s cubic-bezier(.22,1,.36,1) both; }
.mbl-cat-lista { display: grid; gap: 2px; max-height: 220px; overflow-y: auto; }
.mbl-cat-item { display: grid; grid-template-columns: 96px minmax(0,1fr) auto auto; gap: 10px; align-items: center; min-height: 40px; padding: 4px 10px; border: 0; border-radius: 9px; background: transparent; color: var(--text); font: inherit; font-size: 13px; text-align: left; }
.mbl-cat-item:hover { background: var(--panel-2); }
.mbl-cat-item .sec { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mbl-cat-item .med { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.mbl-cat-item .mas { color: var(--blue); font-size: 12px; font-weight: 600; }

/* Formularios */
.mbl-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.mbl-form.tres { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.mbl-form .ancho { grid-column: 1 / -1; }
.mbl-campo { display: grid; gap: 6px; min-width: 0; }
.mbl-campo > span { font-size: 11.5px; font-weight: 600; color: var(--dim); }
.mbl textarea.ui-input, .mbl-modal textarea.ui-input { min-height: 76px; padding: 9px 12px; resize: vertical; line-height: 1.45; }
.mbl select.ui-input, .mbl-modal select.ui-input { padding-right: 8px; }

/* Diálogo: tarjeta centrada; en el celular, hoja desde abajo. */
.mbl-modal-fondo { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 140; display: grid; place-items: center; padding: 16px; background: var(--overlay); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: mbl-aparece .18s ease both; }
.mbl-modal { width: min(560px, 100%); max-height: min(88vh, 820px); display: flex; flex-direction: column; border: 1px solid var(--border-2); border-radius: 18px; background: var(--panel-solid); box-shadow: var(--elev-2); overflow: hidden; animation: mbl-sube .3s cubic-bezier(.22,1,.36,1) both; font-family: 'Outfit', system-ui, sans-serif; color: var(--text); }
.mbl-modal.ancho { width: min(780px, 100%); }
.mbl-modal-cab { display: flex; align-items: flex-start; gap: 12px; padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
.mbl-modal-ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; border: 1px solid var(--t-borde, var(--blue-border)); background: var(--t-soft, var(--blue-soft)); color: var(--t, var(--blue)); }
.mbl-modal-tit { font-size: 16px; font-weight: 650; line-height: 1.25; }
.mbl-modal-sub { margin-top: 3px; font-size: 12.5px; color: var(--dim); line-height: 1.45; }
.mbl-modal-cuerpo { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 18px; display: grid; gap: 12px; align-content: start; }
.mbl-modal-pie { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; padding: 12px 18px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--panel-solid-2); }
.mbl-lista-puntos { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; font-size: 13px; color: var(--muted); line-height: 1.45; }
.mbl-lista-puntos li { display: grid; grid-template-columns: 8px minmax(0,1fr); gap: 9px; }
.mbl-lista-puntos li::before { content: ""; width: 6px; height: 6px; border-radius: 50%; margin-top: 7px; background: var(--violet); }

/* Capa que se abre sobre la vista (OT de preparación) */
.mbl-capa { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 30; overflow-y: auto; overscroll-behavior: contain; background: var(--bg); animation: mbl-desde-der .32s cubic-bezier(.22,1,.36,1) both; }

/* ── Stock ── */
.mbl-grilla { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 24px 32px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); grid-auto-rows: max-content; gap: 12px; align-content: start; }
.mbl-tarjeta { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel); transition: border-color .16s, transform .18s cubic-bezier(.22,1,.36,1); animation: mbl-sube .42s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 30ms); }
.mbl-tarjeta:hover { border-color: var(--border-2); transform: translateY(-2px); }
.mbl-tarjeta-pie { margin-top: auto; display: grid; gap: 10px; }

/* ── OT de preparación (capa sobre Seguimiento) ── */
.mbl-ot { min-height: 100%; }
.mbl-ot-barra {
  position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  min-height: 52px; padding: 6px 18px; border-bottom: 1px solid var(--border);
  background: var(--topbar); -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
}
.mbl-ot-ruta { font-size: 13px; color: var(--dim); white-space: nowrap; }
.mbl-ot-ruta b { color: var(--text); font-weight: 600; }
.mbl-ot-estado { display: inline-flex; align-items: center; gap: 8px; padding: 0 4px 0 11px; min-height: 36px; border: 1px solid var(--t-borde); border-radius: 10px; background: var(--t-soft); color: var(--t); font-size: 12px; font-weight: 600; }
.mbl-ot-estado select { border: 0; background: transparent; color: var(--t); font: inherit; font-size: 13.5px; font-weight: 650; padding: 6px 4px; outline: none; }
.mbl-ot-estado select option { color: var(--text); background: var(--panel-solid); }

.mbl-imprimir { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
.mbl-imp { display: grid; gap: 8px; align-content: start; padding: 12px; border: 1px solid var(--border); border-radius: 13px; background: var(--panel-solid); }
.mbl-imp.destacado { border-color: var(--blue-border); background: color-mix(in srgb, var(--blue-soft) 45%, var(--panel-solid)); }
.mbl-imp-cab { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 650; }
.mbl-imp-n { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 650; color: var(--blue); background: var(--blue-soft); border: 1px solid var(--blue-border); }
.mbl-imp-txt { font-size: 12px; color: var(--dim); line-height: 1.45; min-height: 34px; }
.mbl-imp .ui-btn { justify-self: start; }

.mbl-hojas { display: grid; gap: 6px; }
.mbl-hoja { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 10px 10px 10px 8px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid); transition: border-color .15s, background-color .15s; }
.mbl-hoja.vacia { background: transparent; border-style: dashed; }
.mbl-hoja.editando { border-color: var(--blue-border); background: color-mix(in srgb, var(--blue-soft) 40%, var(--panel-solid)); }
.mbl-hoja-id { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; font-size: 13px; font-weight: 650; color: var(--muted); background: var(--panel-2); }
.mbl-hoja.vacia .mbl-hoja-id { color: var(--subtle); background: transparent; border: 1px dashed var(--border-2); }
.mbl-hoja-val { display: block; width: 100%; border: 0; background: transparent; color: var(--text); font-size: 13.5px; font-weight: 600; line-height: 1.55; text-align: left; white-space: pre-wrap; padding: 3px 0; border-radius: 6px; }
.mbl-hoja-val:hover { color: var(--blue); }
.mbl-hoja-cargar { border: 0; background: transparent; color: var(--blue); font: inherit; font-size: 13px; font-weight: 600; padding: 5px 0; text-align: left; }
.mbl-hoja-cargar:hover { text-decoration: underline; }
.mbl-hoja-meta { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin-top: 6px; font-size: 12px; color: var(--dim); }
.mbl-hoja-ayuda { margin-top: 6px; font-size: 11.5px; color: var(--subtle); }
.mbl-kit { margin-top: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 4px 14px; }
.mbl-kit-fila { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--muted); }
.mbl-kit-fila .mono { color: var(--violet); font-weight: 650; text-align: right; }

@keyframes mbl-sube { from { opacity: 0; transform: translateY(10px); } }
@keyframes mbl-crece { from { transform: scaleX(0); } }
@keyframes mbl-aparece { from { opacity: 0; } }
@keyframes mbl-desde-der { from { opacity: 0; transform: translateX(28px); } }
@keyframes mbl-desde-abajo { from { opacity: .4; transform: translateY(100%); } }

@media (max-width: 1180px) {
  .mbl-datos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 899px) {
  /* En el celular las áreas van abajo, al alcance del pulgar (arriba las
     tapa el aviso de notificaciones de la app). */
  .mbl-nav {
    order: 3; min-height: 0; gap: 6px; padding: 4px 8px calc(4px + env(safe-area-inset-bottom));
    border-bottom: 0; border-top: 1px solid var(--border); background: var(--topbar);
  }
  .mbl-nav-marca, .mbl-nav-sep { display: none; }
  .mbl-nav .ui-tabs { flex: 1; }
  .mbl-nav .ui-tab { flex: 1; flex-direction: column; justify-content: center; gap: 3px; min-height: 52px; padding: 0 6px; font-size: 11.5px; }
  .mbl-nav .ui-tab svg { width: 19px; height: 19px; }
  .mbl-nav .ui-tab[aria-selected="true"]::after { top: -5px; bottom: auto; left: 22%; right: 22%; }
  .mbl-solo-escritorio { display: none !important; }
  .mbl-tab.en-detalle > .mbl-barra { display: none; }
  .mbl-rec .mbl-sector-cab { top: 44px; }
  .mbl-barra { padding: 12px 16px 10px; }
  .mbl-h1 { font-size: 20px; }
  .mbl-filtros { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 12px -16px 0; padding: 0 16px; }
  .mbl-filtros::-webkit-scrollbar { display: none; }
  .mbl-buscar { flex: 0 0 220px; }
  .mbl-acciones { width: 100%; }
  .mbl-acciones .ui-btn { flex: 1; }

  /* Lista y detalle se alternan: el detalle ocupa toda la pantalla. */
  .mbl-dos, .mbl-dos.rec { grid-template-columns: minmax(0, 1fr); }
  .mbl-dos.con-detalle .mbl-lista, .mbl-dos.con-detalle .mbl-riel { display: none; }
  .mbl-dos:not(.con-detalle) .mbl-detalle { display: none; }
  .mbl-lista { padding: 10px 16px 24px; border-right: 0; }
  .mbl-riel { border-right: 0; }
  .mbl-riel-cuerpo { padding: 6px 10px 16px; }
  .mbl-panel, .mbl-rec { padding: 0 16px 32px; }
  .mbl-volver-movil {
    display: flex; align-items: center; gap: 6px; position: sticky; top: 0; z-index: 9;
    margin: 0 -16px; padding: 10px 16px; border: 0; border-bottom: 1px solid var(--border);
    background: var(--topbar); -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
    color: var(--text); font: inherit; font-size: 14px; font-weight: 600; text-align: left; width: calc(100% + 32px);
  }
  .mbl-cab { grid-template-columns: auto minmax(0, 1fr); }
  .mbl-cab-acc { grid-column: 1 / -1; }
  .mbl-cab-sw { width: 50px; height: 50px; border-radius: 14px; }
  .mbl-cab-tit { font-size: 19px; }
  .mbl-bloque { padding: 12px; border-radius: 14px; }
  .mbl-datos { grid-template-columns: minmax(0, 1fr); }
  .mbl-fila { grid-template-columns: auto minmax(0, 1fr); }
  .mbl-fila-der { grid-column: 2; justify-items: start; }
  .mbl-ruta { grid-auto-columns: 92px; margin: 0 -12px; padding: 0 12px 4px; }

  .mbl-pieza { grid-template-columns: 26px 42px minmax(0, 1fr) auto; gap: 10px; }
  .mbl-pieza .mbl-pieza-quitar { grid-row: 1; grid-column: 4; }
  .mbl-pieza.sel { grid-template-columns: 22px 26px minmax(0, 1fr) auto; }
  .mbl-pieza.sel .mbl-thumb { display: none; }
  .mbl-pieza .mbl-est4 { grid-column: 1 / -1; width: 100%; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .mbl-pieza .mbl-est4 button { justify-content: center; min-height: 36px; padding: 0 4px; }
  .mbl-thumb { width: 42px; height: 42px; }
  .mbl-pct { font-size: 28px; }
  .mbl-cat-item { grid-template-columns: minmax(0,1fr) auto; }
  .mbl-cat-item .sec, .mbl-cat-item .med { display: none; }
  .mbl-form, .mbl-form.tres { grid-template-columns: minmax(0, 1fr); }
  .mbl-grilla { padding: 4px 16px 24px; grid-template-columns: minmax(0, 1fr); }

  .mbl-ot-barra { padding: 6px 12px; }
  .mbl-ot-ruta { display: none; }
  .mbl-ot .mbl-panel { padding-top: 14px; }
  .mbl-hoja { grid-template-columns: 30px minmax(0, 1fr) auto; gap: 8px; }

  .mbl-modal-fondo { place-items: end stretch; padding: 0; }
  .mbl-modal, .mbl-modal.ancho { width: 100%; max-height: 92vh; border-radius: 20px 20px 0 0; border-bottom: 0; animation: mbl-desde-abajo .32s cubic-bezier(.22,1,.36,1) both; }
  .mbl-modal-pie .ui-btn { flex: 1; }
}
`;
