// Estilos de Laminación (Pampa y Chubut). Todo va bajo .lam para no tocar el
// resto de la app mientras la pantalla está montada. Colores sólo con tokens del
// tema (oscuro, claro y alto contraste). Mismo lenguaje que Obras y Muebles.
export const CSS_LAMINACION = `
.lam {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  background:
    radial-gradient(1100px 380px at 18% -12%, var(--glow-a), transparent 70%),
    radial-gradient(700px 300px at 100% 110%, var(--glow-b), transparent 70%),
    var(--bg);
  color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
}
.lam .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.lam h1, .lam h2, .lam h3, .lam p { margin: 0; }

/* ── Navegación ── */
.lam-nav {
  position: relative; z-index: 20; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--topbar-soft);
  -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
}
.lam-nav-marca { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 14px; font-weight: 650; }
.lam-nav-marca svg { color: var(--blue); }
.lam-sede { display: inline-flex; align-items: center; min-height: 22px; padding: 0 9px; border-radius: 999px; font-size: 11px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; border: 1px solid var(--t-borde); background: var(--t-soft); color: var(--t); }
.lam-nav-sep { width: 1px; height: 22px; background: var(--border); flex-shrink: 0; }
.lam-nav .ui-tabs { flex: 0 1 auto; min-width: 0; }
.lam-nav .ui-tab { display: inline-flex; align-items: center; gap: 7px; }
.lam-nav .ui-tab svg { opacity: .75; }
.lam-nav .ui-tab .n { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; display: inline-grid; place-items: center; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 650; color: var(--cyan); background: var(--cyan-soft); border: 1px solid var(--cyan-border); }
.lam-nav-acc { display: flex; align-items: center; gap: 6px; margin-left: 4px; }
.lam-nav .txt-corto { display: none; }

.lam-vista { position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.lam-pagina { width: min(2200px, 100%); margin: 0 auto; padding: 20px 28px 48px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-content: start; animation: lam-aparece .25s ease both; }

/* ── Encabezado de una pestaña ── */
.lam-cab { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.lam-titulos { flex: 1; min-width: 0; animation: lam-sube .5s cubic-bezier(.22,1,.36,1) both; }
.lam-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.lam-h1 { margin-top: 3px; font-size: 24px; font-weight: 700; letter-spacing: -.02em; line-height: 1.12; }
.lam-h1 .acento { background: var(--brand-grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.lam-sub { margin-top: 5px; font-size: 13px; color: var(--dim); }
.lam-sub b { color: var(--muted); font-weight: 600; }
.lam-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lam-filtros { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lam-sp { flex: 1; }
.lam-scroll-x { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.lam-scroll-x::-webkit-scrollbar { display: none; }

.lam-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); flex-shrink: 0; }
.lam-seg button {
  display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 11px;
  border: 0; border-radius: 8px; background: transparent; color: var(--dim);
  font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap;
  transition: background-color .18s, color .18s, box-shadow .18s;
}
.lam-seg button:hover { color: var(--text); }
.lam-seg button.on { background: var(--panel-solid-3); color: var(--text); box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 4px 12px -6px var(--shadow); }
.lam-seg .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.lam-seg button.on .n { color: var(--blue); }

.lam-chip {
  display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 11px;
  border: 1px solid transparent; border-radius: 10px; background: transparent;
  color: var(--dim); font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0;
  transition: background-color .18s, border-color .18s, color .18s;
}
.lam-chip:hover { color: var(--text); background: var(--panel); }
.lam-chip.on { color: var(--text); background: var(--panel-2); border-color: var(--border-2); }
.lam-chip .pto { width: 7px; height: 7px; border-radius: 50%; background: var(--t, var(--muted)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--t, var(--muted)) 18%, transparent); }
.lam-chip .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.lam-chip.on .n { color: var(--text); }

.lam-buscar { position: relative; flex: 0 1 280px; min-width: 170px; }
.lam-buscar svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--subtle); pointer-events: none; }
.lam-buscar input { padding-left: 34px; min-height: 36px; font-size: 13px; }

.lam-btn-ic {
  width: 36px; height: 36px; display: grid; place-items: center; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--muted);
  transition: background-color .15s, color .15s, border-color .15s, transform .12s;
}
.lam-btn-ic:hover:not(:disabled) { background: var(--panel-2); color: var(--text); border-color: var(--border-2); }
.lam-btn-ic:active:not(:disabled) { transform: scale(.95); }
.lam-btn-ic:disabled { opacity: .35; cursor: default; }
.lam-btn-ic.peligro:hover:not(:disabled) { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
.lam-btn-ic.chico { width: 30px; height: 30px; border-radius: 8px; }
.lam .ui-btn.chico { min-height: 32px; padding: 0 11px; font-size: 12.5px; border-radius: 9px; }
.lam .ui-btn[data-tono] { color: var(--t); border-color: var(--t-borde); background: var(--t-soft); }
.lam .ui-btn[data-tono]:hover:not(:disabled) { border-color: var(--t); }

/* Tonos */
.lam [data-tono="azul"]    { --t: var(--blue);   --t-soft: var(--blue-soft);   --t-borde: var(--blue-border); }
.lam [data-tono="verde"]   { --t: var(--green);  --t-soft: var(--green-soft);  --t-borde: var(--green-border); }
.lam [data-tono="rojo"]    { --t: var(--red);    --t-soft: var(--red-soft);    --t-borde: var(--red-border); }
.lam [data-tono="violeta"] { --t: var(--violet); --t-soft: var(--violet-soft); --t-borde: var(--violet-border); }
.lam [data-tono="cian"]    { --t: var(--cyan);   --t-soft: var(--cyan-soft);   --t-borde: var(--cyan-border); }
.lam [data-tono="teal"]    { --t: var(--teal);   --t-soft: var(--teal-soft);   --t-borde: var(--teal-border); }
.lam [data-tono="neutro"]  { --t: var(--dim);    --t-soft: var(--panel-2);     --t-borde: var(--border); }
.lam-estado {
  display: inline-flex; align-items: center; gap: 6px; min-height: 22px; padding: 0 9px;
  border: 1px solid var(--t-borde, var(--border)); border-radius: 999px; background: var(--t-soft, var(--panel-2)); color: var(--t, var(--dim));
  font-size: 11.5px; font-weight: 600; white-space: nowrap; line-height: 1;
}
.lam-estado.punto::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.lam-tag {
  display: inline-flex; align-items: center; gap: 5px; min-height: 20px; padding: 0 7px;
  border-radius: 6px; border: 1px solid var(--t-borde, var(--border)); background: var(--t-soft, var(--panel));
  color: var(--t, var(--muted)); font-size: 10.5px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap;
}
.lam-mini { height: 4px; border-radius: 99px; background: var(--panel-3); overflow: hidden; }
.lam-mini i { display: block; height: 100%; border-radius: 99px; background: var(--brand-grad); transform-origin: left; animation: lam-crece .8s cubic-bezier(.22,1,.36,1) both; }
.lam-mini i.lleno { background: var(--green); }
.lam-mini i[data-tono] { background: var(--t); }

.lam-aviso {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
  border: 1px solid var(--t-borde, var(--border)); border-radius: 12px; background: var(--t-soft, var(--panel));
  color: var(--t, var(--muted)); font-size: 12.5px; line-height: 1.5;
}
.lam-aviso > span { flex: 1; min-width: 0; color: var(--text); }
.lam-aviso > svg { flex-shrink: 0; margin-top: 2px; }
.lam-aviso button.cerrar { border: 0; background: transparent; color: inherit; padding: 2px; border-radius: 6px; display: grid; place-items: center; }

.lam-vacio { display: grid; justify-items: center; align-content: center; gap: 8px; padding: 44px 20px; text-align: center; color: var(--dim); font-size: 13px; }
.lam-vacio-ic { width: 48px; height: 48px; border-radius: 15px; display: grid; place-items: center; color: var(--blue); border: 1px solid var(--blue-border); background: linear-gradient(145deg, var(--blue-soft), var(--cyan-soft)); margin-bottom: 4px; }
.lam-vacio b { color: var(--text); font-size: 14.5px; font-weight: 650; }

/* ── Bloques ── */
.lam-bloque { border: 1px solid var(--border); border-radius: 16px; background: var(--panel); animation: lam-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 40ms); min-width: 0; }
.lam-bloque-cab { display: flex; align-items: center; gap: 12px; padding: 14px 16px; flex-wrap: wrap; }
.lam-bloque-cab + .lam-bloque-cuerpo { border-top: 1px solid var(--border); }
.lam-bloque-ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; border: 1px solid var(--t-borde, var(--blue-border)); background: var(--t-soft, var(--blue-soft)); color: var(--t, var(--blue)); }
.lam-bloque-tit { font-size: 15px; font-weight: 650; line-height: 1.25; }
.lam-bloque-txt { margin-top: 2px; font-size: 12.5px; color: var(--dim); line-height: 1.45; }
.lam-bloque-cab .der { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lam-bloque-cuerpo { padding: 14px 16px; min-width: 0; }
.lam-bloque-cuerpo.sin-pad { padding: 0; }
.lam-plegar { width: 100%; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; }
.lam-plegar .chev { color: var(--subtle); transition: transform .2s; }
.lam-plegar[aria-expanded="true"] .chev { transform: rotate(90deg); }

/* ── Formularios ── */
.lam-form { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.lam-campo { display: grid; gap: 6px; min-width: 0; grid-column: span 3; align-content: start; }
.lam-campo.c2 { grid-column: span 2; }
.lam-campo.c4 { grid-column: span 4; }
.lam-campo.c6 { grid-column: 1 / -1; }
.lam-campo > span, .lam-campo > label { font-size: 11.5px; font-weight: 600; color: var(--dim); }
.lam-campo .req { color: var(--blue); }
.lam-ayuda { font-size: 11.5px; color: var(--subtle); line-height: 1.45; }
.lam-con-lado { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
.lam-lado { border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); padding: 14px; display: grid; gap: 10px; position: sticky; top: 12px; }
.lam-lado-et { font-size: 11px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--subtle); }
.lam-cifras { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.lam-cifra { border: 1px solid var(--border); border-radius: 11px; padding: 9px 10px; background: var(--bg); }
.lam-cifra .et { font-size: 11px; color: var(--subtle); }
.lam-cifra .v { margin-top: 3px; font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 650; letter-spacing: -.02em; color: var(--t, var(--text)); }
.lam-cifra .u { font-size: 11px; color: var(--dim); margin-left: 3px; font-family: 'Outfit', sans-serif; font-weight: 500; }
.lam-form-pie { display: flex; align-items: center; gap: 10px; justify-content: flex-end; flex-wrap: wrap; grid-column: 1 / -1; }
.lam input[type="number"].ui-input, .lam .ui-input.num { font-family: 'JetBrains Mono', monospace; }
.lam textarea.ui-input { min-height: 70px; padding: 9px 12px; resize: vertical; line-height: 1.45; }
.lam select.ui-input { padding-right: 8px; }

/* ── Selector de obra ── */
.lam-sel { position: relative; min-width: 0; }
.lam-sel-boton {
  width: 100%; min-height: 40px; display: flex; align-items: center; gap: 10px; padding: 5px 10px 5px 12px;
  border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel); color: var(--text);
  font: inherit; font-size: 14px; text-align: left; transition: border-color .15s, box-shadow .15s;
}
.lam-sel-boton:hover { border-color: var(--border-3); }
.lam-sel-boton.abierto, .lam-sel-boton:focus-visible { border-color: var(--focus); box-shadow: 0 0 0 3px var(--blue-soft); outline: none; }
.lam-sel-boton .vacio { color: var(--subtle); flex: 1; }
.lam-sel-cod { font-family: 'JetBrains Mono', monospace; font-weight: 650; font-size: 14px; }
.lam-sel-meta { font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.lam-sel-chev { color: var(--subtle); flex-shrink: 0; }
.lam-sel-pop {
  position: absolute; z-index: 60; left: 0; right: 0; top: calc(100% + 6px); min-width: 280px;
  border: 1px solid var(--border-2); border-radius: 14px; background: var(--panel-solid); box-shadow: var(--elev-2);
  overflow: hidden; animation: lam-menu .16s cubic-bezier(.22,1,.36,1) both;
}
.lam-sel-pop.arriba { top: auto; bottom: calc(100% + 6px); }
.lam-sel-buscar { position: relative; padding: 8px; border-bottom: 1px solid var(--border); }
.lam-sel-buscar svg { position: absolute; left: 19px; top: 50%; transform: translateY(-50%); color: var(--subtle); pointer-events: none; }
.lam-sel-buscar input { padding-left: 32px; min-height: 36px; font-size: 13.5px; }
.lam-sel-lista { max-height: min(340px, 50vh); overflow-y: auto; overscroll-behavior: contain; padding: 4px; }
.lam-sel-grupo { padding: 8px 9px 4px; font-size: 10.5px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--subtle); }
.lam-sel-op {
  width: 100%; display: grid; grid-template-columns: minmax(64px, auto) minmax(0, 1fr) auto; gap: 10px; align-items: center;
  min-height: 38px; padding: 5px 9px; border: 0; border-radius: 9px; background: transparent; color: var(--text);
  font: inherit; font-size: 13px; text-align: left;
}
.lam-sel-op:hover, .lam-sel-op.activa { background: var(--panel-2); }
.lam-sel-op.on { background: var(--blue-soft); }
.lam-sel-op .cod { font-family: 'JetBrains Mono', monospace; font-weight: 650; }
.lam-sel-op .det { font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lam-sel-op .fec { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); white-space: nowrap; }
.lam-sel-op.otro .cod { font-family: inherit; font-weight: 600; }
.lam-sel-libre { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 8px 12px; border: 0; border-top: 1px solid var(--border); background: var(--panel); color: var(--dim); font: inherit; font-size: 12.5px; text-align: left; }
.lam-sel-libre:hover, .lam-sel-libre.activa { color: var(--text); background: var(--panel-2); }
.lam-sel-libre b { color: var(--text); font-weight: 600; }
.lam-sel-nada { padding: 14px 12px; font-size: 12.5px; color: var(--dim); }

/* ── Tablas y filas ── */
.lam-tabla { overflow-x: auto; }
.lam-t { width: 100%; border-collapse: collapse; font-size: 13px; }
.lam-t th { position: sticky; top: 0; z-index: 1; text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--subtle); background: var(--panel-solid); border-bottom: 1px solid var(--border-2); white-space: nowrap; }
.lam-t td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.lam-t tbody tr { transition: background-color .15s; }
.lam-t tbody tr:hover { background: var(--panel); }
.lam-t tbody tr:last-child td { border-bottom: 0; }
.lam-t .der { text-align: right; }
.lam-t .nom { font-weight: 600; color: var(--text); }
.lam-t .chico { font-size: 12px; color: var(--dim); margin-top: 2px; }
.lam-t .vacio { color: var(--subtle); }
.lam-cant { display: inline-flex; align-items: baseline; gap: 4px; font-family: 'JetBrains Mono', monospace; font-weight: 650; font-size: 13.5px; color: var(--t, var(--text)); white-space: nowrap; }
.lam-cant small { font-family: 'Outfit', sans-serif; font-weight: 500; font-size: 11px; color: var(--dim); }
.lam .ui-input.lam-min { width: 84px; min-height: 32px; padding: 0 8px; font-size: 13px; text-align: right; }
.lam-stock { display: grid; gap: 5px; min-width: 120px; }
.lam-stock-v { font-family: 'JetBrains Mono', monospace; font-size: 17px; font-weight: 650; letter-spacing: -.02em; color: var(--t, var(--text)); }
.lam-mas { font-size: 12px; color: var(--subtle); padding: 10px 16px 14px; }

.lam-filas { display: grid; }
.lam-fila { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 11px 16px; border-top: 1px solid var(--border); }
.lam-fila:first-child { border-top: 0; }
.lam-fila-tit { font-size: 13.5px; font-weight: 600; line-height: 1.3; }
.lam-fila-meta { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 3px; font-size: 12px; color: var(--dim); }
.lam-fila-acc { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }

/* ── Órdenes (recepción y pedidos) ── */
.lam-ordenes { display: grid; gap: 10px; }
.lam-orden { border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); overflow: hidden; animation: lam-sube .4s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 30ms); }
.lam-orden.abierta { border-color: var(--border-2); }
.lam-orden-cab { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 14px; }
.lam-orden-cab > button.plegar { border: 0; background: transparent; color: var(--subtle); padding: 4px; border-radius: 7px; display: grid; place-items: center; }
.lam-orden-cab > button.plegar:hover { background: var(--panel-2); color: var(--text); }
.lam-orden-l1 { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.lam-orden-ref { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 650; color: var(--muted); }
.lam-orden-tit { margin-top: 4px; font-size: 14.5px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.lam-orden-meta { margin-top: 3px; font-size: 12px; color: var(--dim); display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.lam-orden-acc { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.lam-orden-items { border-top: 1px solid var(--border); }
.lam-item { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 10px 14px 10px 44px; border-top: 1px solid var(--border); }
.lam-item:first-child { border-top: 0; }
.lam-item-nom { font-size: 13.5px; font-weight: 600; }
.lam-item-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 3px; font-size: 12px; color: var(--dim); }
.lam-item-meta b { font-weight: 600; color: var(--t, var(--text)); font-family: 'JetBrains Mono', monospace; }

/* ── Próximos desmoldes ── */
.lam-desm { display: grid; }
.lam-desm-fila { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 11px 16px; border-top: 1px solid var(--border); animation: lam-sube .4s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 28ms); }
.lam-desm-fila:first-child { border-top: 0; }
.lam-desm-fila.foco { background: color-mix(in srgb, var(--blue-soft) 55%, transparent); }
.lam-desm-fecha { display: grid; gap: 2px; }
.lam-desm-fecha .d { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 650; }
.lam-desm-fecha .r { font-size: 11.5px; color: var(--t, var(--dim)); font-weight: 600; }
.lam-desm-obra { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lam-desm-obra .cod { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 650; }
.lam-desm-ped { margin-top: 3px; font-size: 12px; color: var(--dim); }

/* ── Armar pedido ── */
.lam-pasos { display: grid; gap: 14px; }
.lam-paso { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 12px; }
.lam-paso-n { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 650; color: var(--blue); background: var(--blue-soft); border: 1px solid var(--blue-border); }
.lam-paso.hecho .lam-paso-n { color: var(--inverse-text); background: var(--brand-grad); border-color: transparent; }
.lam-paso-tit { font-size: 14px; font-weight: 650; margin: 4px 0 10px; }
.lam-dest-info { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
.lam-check {
  width: 22px; height: 22px; display: grid; place-items: center; flex-shrink: 0; border-radius: 6px; padding: 0;
  border: 1.5px solid var(--border-3); background: var(--bg); color: var(--inverse-text);
  transition: background-color .15s, border-color .15s;
}
.lam-check.on { background: var(--blue); border-color: var(--blue); }
.lam-marca { min-width: 30px; height: 26px; padding: 0 7px; display: inline-grid; place-items: center; border-radius: 7px; border: 1px solid var(--border); background: transparent; color: var(--subtle); font: inherit; font-size: 11px; font-weight: 650; }
.lam-marca.on { color: var(--t); border-color: var(--t-borde); background: var(--t-soft); }
.lam-t tr.fuera td { opacity: .5; }
.lam-t tr.pedido td { opacity: .55; }
.lam-t-items .col-chk { width: 40px; }
.lam-t-items .col-mat { min-width: 200px; }
.lam-vinculo { margin-top: 3px; font-size: 11.5px; color: var(--t, var(--dim)); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.lam-vinculo button { border: 0; background: transparent; color: var(--subtle); font: inherit; font-size: 11.5px; padding: 0 2px; text-decoration: underline; }
.lam-email { width: 100%; min-height: 300px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.65; resize: vertical; outline: none; }
.lam-barra-envio { position: sticky; bottom: 0; z-index: 5; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 12px 16px; border-top: 1px solid var(--border); background: color-mix(in srgb, var(--panel-solid) 94%, transparent); -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter); border-radius: 0 0 16px 16px; }
.lam-barra-envio .resumen { font-size: 12.5px; color: var(--dim); }
.lam-barra-envio .resumen b { color: var(--text); font-family: 'JetBrains Mono', monospace; }

/* ── Diálogo: tarjeta centrada; en el celular, hoja desde abajo ── */
.lam-modal-fondo { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 140; display: grid; place-items: center; padding: 16px; background: var(--overlay); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: lam-aparece .18s ease both; }
.lam-modal { width: min(560px, 100%); max-height: min(88vh, 820px); display: flex; flex-direction: column; border: 1px solid var(--border-2); border-radius: 18px; background: var(--panel-solid); box-shadow: var(--elev-2); overflow: hidden; animation: lam-sube .3s cubic-bezier(.22,1,.36,1) both; font-family: 'Outfit', system-ui, sans-serif; color: var(--text); }
.lam-modal.ancho { width: min(720px, 100%); }
.lam-modal-cab { display: flex; align-items: flex-start; gap: 12px; padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
.lam-modal-ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; border: 1px solid var(--t-borde, var(--blue-border)); background: var(--t-soft, var(--blue-soft)); color: var(--t, var(--blue)); }
.lam-modal-tit { font-size: 16px; font-weight: 650; line-height: 1.25; }
.lam-modal-sub { margin-top: 3px; font-size: 12.5px; color: var(--dim); line-height: 1.45; }
.lam-modal-cuerpo { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 18px; display: grid; gap: 12px; align-content: start; }
.lam-modal-pie { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; padding: 12px 18px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--panel-solid-2); }
.lam-lista-mod { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.lam-lista-mod > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 9px 12px; border-top: 1px solid var(--border); font-size: 13px; }
.lam-lista-mod > div:first-child { border-top: 0; }

.lam .spin { animation: lam-giro .8s linear infinite; }
@keyframes lam-giro { to { transform: rotate(360deg); } }
@keyframes lam-sube { from { opacity: 0; transform: translateY(10px); } }
@keyframes lam-crece { from { transform: scaleX(0); } }
@keyframes lam-aparece { from { opacity: 0; } }
@keyframes lam-menu { from { opacity: 0; transform: translateY(-4px) scale(.98); } }
@keyframes lam-desde-abajo { from { opacity: .4; transform: translateY(100%); } }

@media (max-width: 1280px) {
  .lam-nav-txt { display: none; }
  .lam-nav .ui-tab { padding: 0 10px; }
}

@media (max-width: 1100px) {
  .lam-con-lado { grid-template-columns: minmax(0, 1fr); }
  .lam-lado { position: static; }
}

@media (max-width: 899px) {
  /* Las pestañas van abajo, al alcance del pulgar (arriba las tapa el aviso
     de notificaciones de la app). */
  .lam-nav {
    order: 3; min-height: 0; gap: 4px; padding: 4px 6px calc(4px + env(safe-area-inset-bottom));
    border-bottom: 0; border-top: 1px solid var(--border); background: var(--topbar);
  }
  .lam-nav-marca, .lam-nav-sep, .lam-nav-acc { display: none; }
  .lam-nav .ui-tabs { flex: 1; }
  .lam-nav .ui-tab { flex: 1 0 auto; flex-direction: column; justify-content: center; gap: 3px; min-height: 52px; padding: 0 6px; font-size: 11px; }
  .lam-nav .ui-tab svg { width: 18px; height: 18px; }
  .lam-nav .ui-tab[aria-selected="true"]::after { top: -5px; bottom: auto; left: 22%; right: 22%; }
  .lam-nav .ui-tab .n { position: absolute; top: 3px; right: 4px; height: 16px; min-width: 16px; font-size: 9.5px; }
  .lam-nav .ui-tab .txt-largo { display: none; }
  .lam-nav .ui-tab .txt-corto { display: inline; }

  .lam-pagina { padding: 14px 16px 32px; }
  .lam-h1 { font-size: 20px; }
  .lam-filtros { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -16px; padding: 0 16px; }
  .lam-filtros::-webkit-scrollbar { display: none; }
  .lam-buscar { flex: 0 0 220px; }
  .lam-acciones { width: 100%; }
  .lam-acciones .ui-btn { flex: 1; }
  .lam-form { grid-template-columns: minmax(0, 1fr); }
  .lam-campo, .lam-campo.c2, .lam-campo.c4 { grid-column: 1 / -1; }
  .lam-bloque-cab { padding: 12px; }
  .lam-bloque-cuerpo { padding: 12px; }
  .lam-orden-cab { grid-template-columns: auto minmax(0, 1fr); }
  .lam-orden-acc { grid-column: 1 / -1; justify-content: flex-start; }
  .lam-item { grid-template-columns: minmax(0, 1fr); padding-left: 14px; }
  .lam-desm-fila { grid-template-columns: 78px minmax(0, 1fr); }
  .lam-desm-fila > :last-child { grid-column: 1 / -1; justify-self: start; }
  .lam-fila { grid-template-columns: minmax(0, 1fr); }
  .lam-fila-acc { justify-content: flex-start; }
  .lam-sel-pop { min-width: 0; }
  .lam-sel-op { min-height: 42px; }
  .lam-modal-fondo { place-items: end stretch; padding: 0; }
  .lam-modal, .lam-modal.ancho { width: 100%; max-height: 92vh; border-radius: 20px 20px 0 0; border-bottom: 0; animation: lam-desde-abajo .32s cubic-bezier(.22,1,.36,1) both; }
  .lam-modal-pie .ui-btn { flex: 1; }
}

/* Materiales del pedido en el celular: una tarjeta por renglón en vez de una
   tabla de 7 columnas que había que correr de costado. */
@media (max-width: 640px) {
  .lam-t-items, .lam-t-items thead, .lam-t-items tbody { display: block; }
  .lam-t-items thead tr { display: flex; }
  .lam-t-items thead th { display: none; }
  .lam-t-items thead th.col-chk { display: flex; align-items: center; gap: 10px; width: 100%; position: static; }
  .lam-t-items thead th.col-chk::after { content: "Elegir todos"; }
  .lam-t-items tbody tr { display: grid; grid-template-columns: 30px auto auto minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .lam-t-items tbody tr:last-child { border-bottom: 0; }
  .lam-t-items td { padding: 0; border: 0; }
  .lam-t-items td:nth-child(1) { grid-row: 1 / span 2; grid-column: 1; align-self: start; }
  .lam-t-items td:nth-child(2) { grid-row: 1; grid-column: 2 / 5; min-width: 0; }
  .lam-t-items td:nth-child(3) { grid-row: 2; grid-column: 2; }
  .lam-t-items td:nth-child(4) { grid-row: 2; grid-column: 3; }
  .lam-t-items td:nth-child(5) { grid-row: 2; grid-column: 4 / -1; text-align: left; white-space: nowrap; }
  .lam-t-items td:nth-child(6) { grid-row: 1; grid-column: 5; align-self: start; }
  .lam-t-items td:nth-child(7) { grid-row: 1; grid-column: 6; align-self: start; }
  .lam-t-items td.col-stock::before { content: "stock "; font-size: 11px; color: var(--subtle); }
  .lam-vinculo select { max-width: 100%; }
}
`;
