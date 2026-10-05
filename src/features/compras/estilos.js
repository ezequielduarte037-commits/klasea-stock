// Estilos del módulo de Compras (gestión y pedidos). Todo va bajo .cmp para no
// tocar el resto de la app mientras la pantalla está montada. Colores sólo con
// tokens del tema (oscuro, claro y alto contraste); los de cada estado son los
// mismos que Compras venía usando. Mismo lenguaje que Laminación y Muebles.
export const CSS_COMPRAS_MODULO = `
.cmp {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  background:
    radial-gradient(1100px 380px at 18% -12%, var(--glow-a), transparent 70%),
    radial-gradient(700px 300px at 100% 110%, var(--glow-b), transparent 70%),
    var(--bg);
  color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
}
:where(.cmp, .cmp-ambito) .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
:where(.cmp, .cmp-ambito) h1, :where(.cmp, .cmp-ambito) h2, :where(.cmp, .cmp-ambito) h3, :where(.cmp, .cmp-ambito) p { margin: 0; }

/* Piezas del módulo usadas fuera de Compras (caja chica del cadete). */
.cmp-ambito { color: var(--text); font-family: "Outfit", system-ui, sans-serif; }
.cmp-ambito h1, .cmp-ambito h2, .cmp-ambito h3, .cmp-ambito p { margin: 0; }

/* ── Navegación ── */
.cmp-nav {
  position: relative; z-index: 20; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--topbar-soft);
  -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
}
.cmp-nav-marca { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 14px; font-weight: 650; white-space: nowrap; }
.cmp-nav-marca svg { color: var(--blue); }
.cmp-nav-sep { width: 1px; height: 22px; background: var(--border); flex-shrink: 0; }
.cmp-nav .ui-tabs { flex: 0 1 auto; min-width: 0; }
.cmp-nav .ui-tab { display: inline-flex; align-items: center; gap: 7px; }
.cmp-nav .ui-tab svg { opacity: .75; }
.cmp-nav .ui-tab .n { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; display: inline-grid; place-items: center; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 650; color: var(--cyan); background: var(--cyan-soft); border: 1px solid var(--cyan-border); }
.cmp-nav .ui-tab .chev { transition: transform .18s; opacity: .6; }
.cmp-nav .ui-tab[aria-expanded="true"] .chev { transform: rotate(180deg); }
.cmp-nav-acc { display: flex; align-items: center; gap: 6px; margin-left: 6px; }
.cmp-nav .txt-corto { display: none; }
.cmp-nuevo { white-space: nowrap; }

.cmp-menu {
  position: fixed; z-index: 120; overflow-y: auto; padding: 6px;
  border: 1px solid var(--border-2); border-radius: 14px;
  background: var(--panel-solid); box-shadow: var(--elev-2);
  animation: cmp-menu .16s cubic-bezier(.22,1,.36,1) both;
}
.cmp-menu-fondo { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 119; }
.cmp-menu-grupo + .cmp-menu-grupo { margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--border); }
.cmp-menu-tit { padding: 7px 10px 4px; color: var(--subtle); font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
.cmp-menu-op {
  width: 100%; display: flex; align-items: center; gap: 11px; padding: 8px 10px;
  border: 0; border-radius: 10px; background: transparent; color: var(--text);
  font: inherit; text-align: left; transition: background-color .12s;
}
.cmp-menu-op:hover { background: var(--panel-2); }
.cmp-menu-op > svg { flex-shrink: 0; color: var(--dim); }
.cmp-menu-op.on { background: var(--blue-soft); color: var(--blue); }
.cmp-menu-op.on > svg { color: var(--blue); }
.cmp-menu-op b { display: block; font-size: 13px; font-weight: 600; }
.cmp-menu-op small { display: block; margin-top: 1px; color: var(--dim); font-size: 11.5px; line-height: 1.35; }

.cmp-vista { position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.cmp-pagina { width: min(2200px, 100%); margin: 0 auto; padding: 20px 28px 48px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-content: start; animation: cmp-aparece .25s ease both; }
.cmp-pagina.ancha { width: 100%; max-width: none; }
.cmp-pagina.llena { height: 100%; padding-bottom: 18px; grid-template-rows: auto minmax(0, 1fr); }

/* ── Encabezado de una pestaña ── */
.cmp-cab { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.cmp-titulos { flex: 1; min-width: 0; animation: cmp-sube .5s cubic-bezier(.22,1,.36,1) both; }
.cmp-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.cmp-h1 { margin-top: 3px; font-size: 24px; font-weight: 700; letter-spacing: -.02em; line-height: 1.12; }
.cmp-h1 .acento { background: var(--brand-grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.cmp-sub { margin-top: 5px; font-size: 13px; color: var(--dim); line-height: 1.5; }
.cmp-sub b { color: var(--muted); font-weight: 600; }
.cmp-sub b.t { color: var(--t); }
.cmp-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cmp-filtros { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.cmp-sp { flex: 1; }
.cmp-scroll-x { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.cmp-scroll-x::-webkit-scrollbar { display: none; }
.cmp-rotulo { font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--subtle); }

.cmp-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); flex-shrink: 0; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.cmp-seg::-webkit-scrollbar { display: none; }
.cmp-seg button {
  display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 11px; flex-shrink: 0;
  border: 0; border-radius: 8px; background: transparent; color: var(--dim);
  font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap;
  transition: background-color .18s, color .18s, box-shadow .18s;
}
.cmp-seg button:hover:not(:disabled) { color: var(--text); }
.cmp-seg button:disabled { cursor: default; }
.cmp-seg button.on { background: var(--panel-solid-3); color: var(--text); box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 4px 12px -6px var(--shadow); }
.cmp-seg button.on[data-tono] { color: var(--t); background: var(--t-soft); box-shadow: inset 0 0 0 1px var(--t-borde); }
.cmp-seg .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.cmp-seg button.on .n { color: var(--blue); }

.cmp-chip {
  display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 11px;
  border: 1px solid transparent; border-radius: 10px; background: transparent;
  color: var(--dim); font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0;
  transition: background-color .18s, border-color .18s, color .18s;
}
.cmp-chip:hover { color: var(--text); background: var(--panel); }
.cmp-chip.on { color: var(--text); background: var(--panel-2); border-color: var(--border-2); }
.cmp-chip .pto { width: 7px; height: 7px; border-radius: 50%; background: var(--t, var(--muted)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--t, var(--muted)) 18%, transparent); }
.cmp-chip .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.cmp-chip.on .n { color: var(--text); }
.cmp-chip-sep { width: 1px; align-self: stretch; margin: 4px 2px; background: var(--border); flex-shrink: 0; }

.cmp-buscar { position: relative; flex: 0 1 300px; min-width: 180px; }
.cmp-buscar svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--subtle); pointer-events: none; }
.cmp-buscar input { padding-left: 34px; min-height: 36px; font-size: 13px; }
.cmp-buscar.ancho { flex: 1 1 300px; }

.cmp-btn-ic {
  width: 36px; height: 36px; display: grid; place-items: center; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--muted);
  transition: background-color .15s, color .15s, border-color .15s, transform .12s;
}
.cmp-btn-ic:hover:not(:disabled) { background: var(--panel-2); color: var(--text); border-color: var(--border-2); }
.cmp-btn-ic:active:not(:disabled) { transform: scale(.95); }
.cmp-btn-ic:disabled { opacity: .35; cursor: default; }
.cmp-btn-ic.peligro:hover:not(:disabled) { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
.cmp-btn-ic.chico { width: 30px; height: 30px; border-radius: 8px; }
:where(.cmp, .cmp-ambito) .ui-btn.chico, .cmp-modal .ui-btn.chico { min-height: 32px; padding: 0 11px; font-size: 12.5px; border-radius: 9px; }
:where(.cmp, .cmp-ambito) .ui-btn[data-tono] { color: var(--t); border-color: var(--t-borde); background: var(--t-soft); }
:where(.cmp, .cmp-ambito) .ui-btn[data-tono]:hover:not(:disabled) { border-color: var(--t); }
.cmp-link { border: 0; background: transparent; padding: 0; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--blue); }
.cmp-link:hover { text-decoration: underline; }

/* Tonos: los mismos colores que Compras usa para cada estado. */
:where(.cmp, .cmp-ambito) [data-tono="azul"],    .cmp-modal-fondo [data-tono="azul"]    { --t: var(--blue);   --t-soft: var(--blue-soft);   --t-borde: var(--blue-border); }
:where(.cmp, .cmp-ambito) [data-tono="verde"],   .cmp-modal-fondo [data-tono="verde"]   { --t: var(--green);  --t-soft: var(--green-soft);  --t-borde: var(--green-border); }
:where(.cmp, .cmp-ambito) [data-tono="rojo"],    .cmp-modal-fondo [data-tono="rojo"]    { --t: var(--red);    --t-soft: var(--red-soft);    --t-borde: var(--red-border); }
:where(.cmp, .cmp-ambito) [data-tono="violeta"], .cmp-modal-fondo [data-tono="violeta"] { --t: var(--violet); --t-soft: var(--violet-soft); --t-borde: var(--violet-border); }
:where(.cmp, .cmp-ambito) [data-tono="cian"],    .cmp-modal-fondo [data-tono="cian"]    { --t: var(--cyan);   --t-soft: var(--cyan-soft);   --t-borde: var(--cyan-border); }
:where(.cmp, .cmp-ambito) [data-tono="teal"],    .cmp-modal-fondo [data-tono="teal"]    { --t: var(--teal);   --t-soft: var(--teal-soft);   --t-borde: var(--teal-border); }
:where(.cmp, .cmp-ambito) [data-tono="naranja"], .cmp-modal-fondo [data-tono="naranja"] { --t: var(--orange); --t-soft: var(--orange-soft); --t-borde: var(--orange-border); }
:where(.cmp, .cmp-ambito) [data-tono="neutro"],  .cmp-modal-fondo [data-tono="neutro"]  { --t: var(--dim);    --t-soft: var(--panel-2);     --t-borde: var(--border); }

.cmp-estado {
  display: inline-flex; align-items: center; gap: 6px; min-height: 22px; padding: 0 9px;
  border: 1px solid var(--t-borde, var(--border)); border-radius: 999px; background: var(--t-soft, var(--panel-2)); color: var(--t, var(--dim));
  font-size: 11.5px; font-weight: 600; white-space: nowrap; line-height: 1;
}
.cmp-estado svg { flex-shrink: 0; }
.cmp-estado.grande { min-height: 28px; padding: 0 12px; font-size: 12.5px; }
.cmp-tag {
  display: inline-flex; align-items: center; gap: 5px; min-height: 20px; padding: 0 7px;
  border-radius: 6px; border: 1px solid var(--t-borde, var(--border)); background: var(--t-soft, var(--panel));
  color: var(--t, var(--muted)); font-size: 10.5px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
}
.cmp-punto-nuevo { width: 8px; height: 8px; border-radius: 50%; background: var(--violet); box-shadow: 0 0 0 3px var(--violet-soft); flex-shrink: 0; }

/* Progreso de un pedido: Nuevo → Revisión → Cotizando → Comprado → Recibido */
.cmp-prog { display: grid; gap: 5px; min-width: 0; }
.cmp-prog-barras { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 3px; }
.cmp-prog-barras i { height: 5px; border-radius: 99px; background: var(--panel-3); }
.cmp-prog-barras i.on { background: var(--t); }
.cmp-prog-barras i.actual { box-shadow: 0 0 0 2px color-mix(in srgb, var(--t) 25%, transparent); }
.cmp-prog-txt { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: var(--t); white-space: nowrap; }
.cmp-prog-txt svg { flex-shrink: 0; }
.cmp-prog.cancelado .cmp-prog-barras i { background: var(--panel-3); opacity: .6; }

.cmp-aviso {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
  border: 1px solid var(--t-borde, var(--border)); border-radius: 12px; background: var(--t-soft, var(--panel));
  color: var(--t, var(--muted)); font-size: 12.5px; line-height: 1.5;
}
.cmp-aviso > span { flex: 1; min-width: 0; color: var(--text); }
.cmp-aviso > svg { flex-shrink: 0; margin-top: 2px; }
.cmp-aviso button.cerrar { border: 0; background: transparent; color: inherit; padding: 2px; border-radius: 6px; display: grid; place-items: center; }

.cmp-vacio { display: grid; justify-items: center; align-content: center; gap: 8px; padding: 44px 20px; text-align: center; color: var(--dim); font-size: 13px; }
.cmp-vacio-ic { width: 48px; height: 48px; border-radius: 15px; display: grid; place-items: center; color: var(--blue); border: 1px solid var(--blue-border); background: linear-gradient(145deg, var(--blue-soft), var(--cyan-soft)); margin-bottom: 4px; }
.cmp-vacio b { color: var(--text); font-size: 14.5px; font-weight: 650; }

/* ── Bloques ── */
.cmp-bloque { border: 1px solid var(--border); border-radius: 16px; background: var(--panel); animation: cmp-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 40ms); min-width: 0; }
.cmp-bloque-cab { display: flex; align-items: center; gap: 12px; padding: 14px 16px; flex-wrap: wrap; }
.cmp-bloque-cab + .cmp-bloque-cuerpo { border-top: 1px solid var(--border); }
.cmp-bloque-ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; border: 1px solid var(--t-borde, var(--blue-border)); background: var(--t-soft, var(--blue-soft)); color: var(--t, var(--blue)); }
.cmp-bloque-tit { font-size: 15px; font-weight: 650; line-height: 1.25; }
.cmp-bloque-txt { margin-top: 2px; font-size: 12.5px; color: var(--dim); line-height: 1.45; }
.cmp-bloque-cab .der { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cmp-bloque-cuerpo { padding: 14px 16px; min-width: 0; }
.cmp-bloque-cuerpo.sin-pad { padding: 0; }

/* ── Grupos de una lista ── */
.cmp-grupos { display: grid; gap: 18px; min-width: 0; }
.cmp-grupo { display: grid; gap: 8px; min-width: 0; }
.cmp-grupo-cab { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.cmp-grupo-cab .pto { width: 8px; height: 8px; border-radius: 50%; background: var(--t, var(--dim)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--t, var(--dim)) 18%, transparent); flex-shrink: 0; }
.cmp-grupo-tit { font-size: 13.5px; font-weight: 650; }
.cmp-grupo-n { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--subtle); }
.cmp-grupo-txt { font-size: 12px; color: var(--dim); }
.cmp-grupo-cab .linea { flex: 1; height: 1px; background: var(--border); min-width: 20px; }
.cmp-lista { display: grid; gap: 6px; min-width: 0; grid-auto-rows: max-content; }
.cmp-mas { justify-self: center; }

/* Fila de un pedido (bandeja, lista y mis pedidos) */
.cmp-fila {
  position: relative; width: 100%; min-width: 0; text-align: left;
  display: grid; grid-template-columns: 34px minmax(0, 1fr) 168px 92px 16px; gap: 14px; align-items: center;
  padding: 11px 14px 11px 12px; border: 1px solid var(--border); border-radius: 13px;
  background: var(--panel-solid); color: var(--text); font: inherit;
  transition: border-color .15s, background-color .15s, transform .15s, box-shadow .15s;
  animation: cmp-sube .38s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 22ms);
}
.cmp-fila::before { content: ""; position: absolute; left: -1px; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: var(--marca, transparent); }
.cmp-fila:hover { border-color: var(--border-2); background: var(--panel-solid-2); }
.cmp-fila:active { transform: scale(.995); }
.cmp-fila.cerrada { opacity: .62; }
.cmp-fila-ic { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; color: var(--t); background: var(--t-soft); border: 1px solid var(--t-borde); }
.cmp-fila-main { min-width: 0; }
.cmp-fila-l1 { display: flex; align-items: center; gap: 7px; min-width: 0; }
.cmp-fila-tit { font-size: 14px; font-weight: 600; line-height: 1.3; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-fila-meta { display: flex; align-items: center; gap: 0; flex-wrap: wrap; margin-top: 3px; font-size: 12px; color: var(--dim); min-width: 0; }
.cmp-fila-meta > span + span::before { content: "·"; margin: 0 7px; color: var(--border-3); }
.cmp-fila-meta .obra { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 600; color: var(--muted); }
.cmp-fila-meta .motivo { color: var(--t, var(--dim)); font-weight: 600; }
.cmp-fila-fecha { display: grid; gap: 2px; justify-items: end; text-align: right; }
.cmp-fila-fecha .d { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); }
.cmp-fila-fecha .r { font-size: 11px; color: var(--t, var(--subtle)); font-weight: 600; white-space: nowrap; }
.cmp-fila-chev { color: var(--subtle); }
.cmp-fila.aviso .cmp-fila-ic { border-radius: 50%; }

/* Contenedor del detalle de un pedido (ocupa todo el alto, scrollea adentro). */
.cmp-det-cont { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.cmp-sel-boton.con-valor { padding-right: 42px; }

/* ── Detalle de un pedido ── */
.cmp-det { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; animation: cmp-aparece .2s ease both; }
.cmp-det-cab { display: grid; gap: 14px; padding: 14px 22px 16px; border-bottom: 1px solid var(--border); background: var(--topbar-soft); }
.cmp-det-l1 { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }
.cmp-det-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.cmp-det-tit { font-size: 21px; font-weight: 700; letter-spacing: -.015em; line-height: 1.2; overflow-wrap: anywhere; }
.cmp-det-meta { display: flex; flex-wrap: wrap; margin-top: 5px; font-size: 12.5px; color: var(--dim); }
.cmp-det-meta > span + span::before { content: "·"; margin: 0 7px; color: var(--border-3); }
.cmp-det-meta .obra { font-family: "JetBrains Mono", monospace; font-weight: 650; color: var(--muted); }
.cmp-det-acc { display: flex; gap: 6px; flex-shrink: 0; }
.cmp-det-recorrido { display: grid; gap: 10px; padding-left: 50px; }
.cmp-det-ahora { display: flex; align-items: center; gap: 4px 8px; flex-wrap: wrap; font-size: 13px; color: var(--dim); line-height: 1.5; }
.cmp-det-ahora b { color: var(--text); font-weight: 600; }
.cmp-det-ahora > b:first-child { color: var(--t); }
.cmp-det-ahora b.rojo { color: var(--red); }
.cmp-det-ahora .cmp-link { margin-left: 4px; }
.cmp-link.peligro { color: var(--red); }

.cmp-pasos { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); max-width: 640px; }
.cmp-pasito { position: relative; display: grid; justify-items: center; gap: 6px; padding: 0 2px; border: 0; background: transparent; color: var(--subtle); font: inherit; text-align: center; }
.cmp-pasito::before { content: ""; position: absolute; top: 15px; left: calc(-50% + 20px); right: calc(50% + 20px); height: 2px; border-radius: 2px; background: var(--border-2); }
.cmp-pasito:first-child::before { display: none; }
.cmp-pasito .bola { position: relative; z-index: 1; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; border: 1.5px solid var(--border-2); background: var(--panel-solid); color: var(--subtle); transition: background-color .2s, border-color .2s, color .2s, box-shadow .2s, transform .15s; }
.cmp-pasito .nom { font-size: 12px; font-weight: 600; white-space: nowrap; }
.cmp-pasito.pintado::before { background: var(--t); }
.cmp-pasito.hecho .bola { background: var(--t-soft); border-color: var(--t-borde); color: var(--t); }
.cmp-pasito.hecho .nom { color: var(--muted); }
.cmp-pasito.actual .bola { background: var(--t); border-color: var(--t); color: var(--inverse-text); box-shadow: 0 0 0 4px var(--t-soft); }
.cmp-pasito.actual .nom { color: var(--t); font-weight: 650; }
button.cmp-pasito:not(:disabled):hover .bola { border-color: var(--border-3); color: var(--text); transform: scale(1.06); }
button.cmp-pasito:disabled { cursor: default; }
.cmp-pasos.cancelado .bola { opacity: .55; }

.cmp-det-cuerpo { display: grid; grid-template-columns: minmax(0, 1fr) 340px; min-height: 0; }
.cmp-det-main { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-height: 0; border-right: 1px solid var(--border); }
.cmp-det-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 22px 26px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-content: start; }
.cmp-det-lado { min-height: 0; overflow-y: auto; padding: 18px 16px; display: grid; gap: 12px; align-content: start; }
.cmp-html.plegada { max-height: 190px; overflow: hidden; -webkit-mask-image: linear-gradient(#000 70%, transparent); mask-image: linear-gradient(#000 70%, transparent); }
.cmp-adjuntos { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.cmp-adj { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid); color: var(--text); font: inherit; text-align: left; transition: border-color .15s; }
.cmp-adj:hover:not(:disabled) { border-color: var(--border-2); }
.cmp-adj .ic { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; flex-shrink: 0; color: var(--blue); background: var(--blue-soft); border: 1px solid var(--blue-border); }
.cmp-adj .nom { display: block; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-adj .det { display: block; margin-top: 2px; font-size: 10.5px; color: var(--dim); text-transform: uppercase; }
.cmp-adj .bajar { font-size: 11px; font-weight: 600; color: var(--subtle); flex-shrink: 0; }
.cmp-adj-img { display: block; width: 100%; min-width: 0; padding: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--panel-2); color: var(--text); font: inherit; text-align: left; cursor: zoom-in; }
.cmp-adj-img img { display: block; width: 100%; height: 100px; object-fit: cover; }
.cmp-adj-img span { display: block; padding: 6px 9px; font-size: 11.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-visor { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 200; display: grid; place-items: center; padding: 24px; background: var(--overlay-strong); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.cmp-visor img { max-width: 94vw; max-height: 84vh; object-fit: contain; border-radius: 10px; box-shadow: 0 24px 80px var(--shadow-strong); }
.cmp-visor .cerrar { position: fixed; top: 18px; right: 18px; width: 40px; height: 40px; }

.cmp-item-alta { display: grid; grid-template-columns: minmax(0, 1fr) 84px 112px auto auto; gap: 8px; align-items: center; margin-bottom: 12px; padding: 10px; border: 1px solid var(--blue-border); border-radius: 12px; background: color-mix(in srgb, var(--blue-soft) 45%, transparent); }
.cmp-items-det { display: grid; gap: 8px; }
.cmp-item { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid); transition: border-color .15s; }
.cmp-item:hover { border-color: var(--border-2); }
.cmp-item.editando { border-color: var(--blue-border); }
.cmp-item select.estado { min-height: 32px; padding: 0 6px; font-size: 12px; font-weight: 600; color: var(--t); border-color: var(--t-borde); background: var(--t-soft); }
.cmp-item > .cmp-estado { justify-self: start; }
.cmp-item .nom { font-size: 14px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.cmp-item .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 4px; font-size: 12px; color: var(--dim); }
.cmp-item .cant { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--muted); padding: 1px 7px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); }
.cmp-item .prov { color: var(--blue); font-weight: 600; }
.cmp-item .meta a { display: inline-flex; align-items: center; gap: 3px; color: var(--cyan); font-weight: 600; text-decoration: none; }
.cmp-item .nota { font-style: italic; }
.cmp-item .acc { display: flex; gap: 6px; }
.cmp-item-editar { grid-column: 1 / -1; padding-top: 12px; border-top: 1px solid var(--border); }
.cmp-resumen-costos { display: grid; gap: 8px; max-width: 360px; }
.cmp-envio { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 9px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid); }
.cmp-envio .nom { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cmp-chat-cab { display: flex; align-items: center; gap: 8px; margin-top: 6px; color: var(--blue); }
.cmp-chat-cab b { color: var(--text); font-size: 14px; font-weight: 650; }
.cmp-chat-vacio { padding: 16px; border: 1px dashed var(--border-2); border-radius: 12px; color: var(--dim); font-size: 13px; line-height: 1.5; text-align: center; }
.cmp-chat { display: grid; gap: 10px; }
.cmp-msg { display: flex; }
.cmp-msg.mio { justify-content: flex-end; }
.cmp-msg-burbuja { width: min(640px, 88%); padding: 10px 13px; border: 1px solid var(--border); border-radius: 14px 14px 14px 4px; background: var(--panel-solid); animation: cmp-sube .3s cubic-bezier(.22,1,.36,1) both; }
.cmp-msg.mio .cmp-msg-burbuja { border-color: var(--blue-border); border-radius: 14px 14px 4px 14px; background: color-mix(in srgb, var(--blue-soft) 70%, var(--panel-solid)); }
.cmp-msg-cab { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.cmp-msg-cab b { font-size: 12.5px; font-weight: 600; }
.cmp-msg-cab .menc { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--cyan); }
.cmp-msg-cab .hora { margin-left: auto; font-size: 11px; color: var(--subtle); white-space: nowrap; }
.cmp-msg p { font-size: 14px; line-height: 1.55; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }

.cmp-escribir { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: end; padding: 12px 22px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--topbar-soft); }
.cmp-escribir textarea.ui-input { min-height: 44px; max-height: 180px; resize: vertical; }
.cmp-escribir .cmp-btn-ic { width: 44px; height: 44px; }
.cmp-enviar { width: 48px; min-height: 44px; padding: 0; justify-content: center; }
.cmp-escribir-archivos { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.cmp-escribir-archivo { position: relative; min-width: 0; min-height: 64px; display: flex; align-items: center; gap: 9px; padding: 8px 40px 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-2); overflow: hidden; }
.cmp-escribir-archivo.foto { padding: 0; }
.cmp-escribir-archivo.foto img { width: 100%; height: 72px; object-fit: cover; display: block; }
.cmp-escribir-archivo .nom { display: block; font-size: 11.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-escribir-archivo .det { display: block; margin-top: 2px; font-size: 10.5px; color: var(--dim); text-transform: uppercase; }
.cmp-escribir-archivo .quitar { position: absolute; top: 5px; right: 5px; background: var(--panel-solid); }

.cmp-lado-card { display: grid; gap: 10px; padding: 13px 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); }
.cmp-lado-tit { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--subtle); }
.cmp-dato { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 8px; align-items: center; font-size: 13px; min-height: 30px; }
.cmp-dato > span:first-child { color: var(--dim); font-size: 12.5px; }
.cmp-dato .v { justify-self: end; text-align: right; font-weight: 600; color: var(--t, var(--text)); overflow-wrap: anywhere; }
.cmp-dato .v.mono { font-family: "JetBrains Mono", monospace; font-size: 12.5px; }
.cmp-dato .ui-input { min-height: 34px; font-size: 13px; }
.cmp-dato.apilado { grid-template-columns: minmax(0, 1fr); gap: 6px; }
.cmp-seg.chica { justify-self: start; padding: 2px; }
.cmp-seg.chica button { min-height: 26px; padding: 0 8px; font-size: 11.5px; }
.cmp-persona-fila { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.cmp-persona-fila b { display: block; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-persona-fila small { display: block; margin-top: 1px; font-size: 11px; color: var(--subtle); }
.cmp-sumar-copia { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; padding-top: 10px; border-top: 1px solid var(--border); }
.cmp-sumar-copia .ui-input { min-height: 34px; font-size: 12.5px; }

/* ── Qué comprar ── */
.cmp-repo-plegar { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; padding: 0; }
.cmp-repo-plegar .chev { color: var(--subtle); flex-shrink: 0; transition: transform .2s; }
.cmp-repo-plegar[aria-expanded="true"] .chev { transform: rotate(90deg); }
.cmp-repo-fila { display: grid; grid-template-columns: minmax(0, 1fr) 130px 150px 150px; gap: 14px; align-items: center; padding: 11px 16px; border-top: 1px solid var(--border); }
.cmp-repo-fila:first-child { border-top: 0; }
.cmp-repo-fila .nom { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-repo-fila .meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 3px; font-size: 12px; color: var(--dim); }
.cmp-repo-fila .meta .mono { font-size: 11.5px; color: var(--subtle); }
.cmp-repo-fila .cifra { display: grid; gap: 1px; text-align: right; }
.cmp-repo-fila .cifra b { font-size: 13px; font-weight: 650; color: var(--t, var(--text)); }
.cmp-repo-fila .cifra small { font-size: 11px; color: var(--subtle); }
.cmp-repo-fila .accion { justify-self: end; }

/* ── Tablas (matriz y otras) ── */
.cmp-tabla { overflow: auto; max-height: calc(100vh - 260px); border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); }
.cmp-t { width: 100%; border-collapse: collapse; font-size: 13px; }
.cmp-t th { position: sticky; top: 0; z-index: 2; text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; color: var(--subtle); background: var(--panel-solid); border-bottom: 1px solid var(--border-2); white-space: nowrap; }
.cmp-t td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.cmp-t tbody tr { transition: background-color .15s; }
.cmp-t tbody tr:hover { background: var(--panel); }
.cmp-t tbody tr:last-child td { border-bottom: 0; }
.cmp-t .der { text-align: right; }
.cmp-t .centro { text-align: center; }
.cmp-t .nom { font-weight: 600; color: var(--text); }
.cmp-t .chico { font-size: 11.5px; color: var(--dim); margin-top: 2px; }
.cmp-matriz-linea { display: inline-flex; align-items: center; gap: 4px; color: var(--text); font-size: 11.5px; }
.cmp-matriz-sub { display: block; margin-top: 1px; font-size: 10px; font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--subtle); }
.cmp-matriz-celda b { display: block; font-family: "JetBrains Mono", monospace; font-size: 13px; font-weight: 600; color: var(--text); }
.cmp-matriz-celda small { display: block; font-size: 10px; color: var(--subtle); }
.cmp-matriz-celda.segura b { color: var(--green); font-weight: 700; }
.cmp-matriz-celda.suelta b { color: var(--dim); font-weight: 500; }

/* ── Faltantes ── */
.cmp-select-estado { width: auto; min-width: 124px; min-height: 32px; padding: 0 6px; font-size: 12px; font-weight: 600; color: var(--t); border-color: var(--t-borde); background: var(--t-soft); }
.cmp-falt { border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); overflow: hidden; }
.cmp-falt-cab, .cmp-falt-fila { display: grid; grid-template-columns: minmax(220px, 1.8fr) minmax(130px, 1fr) 130px 150px 140px; gap: 12px; align-items: center; padding: 9px 14px; }
.cmp-falt-cab { font-size: 11px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; color: var(--subtle); border-bottom: 1px solid var(--border-2); }
.cmp-falt-it { border-bottom: 1px solid var(--border); }
.cmp-falt-it:last-child { border-bottom: 0; }
.cmp-falt-fila { cursor: pointer; transition: background-color .15s; }
.cmp-falt-fila:hover, .cmp-falt-it.abierto .cmp-falt-fila { background: var(--panel); }
.cmp-falt-fila b { display: block; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-falt-fila small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-falt-fila .mat { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cmp-falt-fila .mat .chev { color: var(--subtle); flex-shrink: 0; transition: transform .2s; }
.cmp-falt-it.abierto .mat .chev { transform: rotate(90deg); }
.cmp-falt-fila .mat b::before { content: ""; display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 50%; background: var(--t); vertical-align: 1px; }
.cmp-falt-fila .falta b { color: var(--red); }
.cmp-falt-fila .cuando span { font-family: "JetBrains Mono", monospace; font-size: 11.5px; color: var(--muted); }
.cmp-falt-det { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .8fr); gap: 16px; padding: 12px 14px 14px 37px; border-top: 1px solid var(--border); background: var(--panel); }

/* ── Pedir a Compras (desde otros módulos) ── */
.cmp-plantilla { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px dashed var(--teal-border); border-radius: 12px; background: var(--teal-soft); color: var(--teal); }
.cmp-plantilla .ui-input { min-height: 34px; font-size: 13px; }
.cmp-items-dest { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); background: var(--panel-2); border-bottom: 1px solid var(--border); }
.cmp-items-dest .mono { font-size: 11px; color: var(--subtle); }
.cmp-pedir-fila { display: grid; grid-template-columns: minmax(0, 1fr) 76px 100px 190px 30px; gap: 8px; align-items: start; padding: 8px 10px; border-top: 1px solid var(--border); }
.cmp-items-dest + .cmp-pedir-fila { border-top: 0; }
.cmp-pedir-fila.extra { background: color-mix(in srgb, var(--cyan-soft) 60%, transparent); }
.cmp-pedir-fila .desc { display: grid; gap: 5px; min-width: 0; }
.cmp-pedir-fila .ui-input { min-height: 34px; font-size: 13px; }
.cmp-pedir-fila .dest, .cmp-pedir-alta .dest { min-width: 0; }
.cmp-pedir-alta { display: grid; gap: 8px; padding: 10px 12px; border: 1px dashed var(--blue-border); border-radius: 12px; background: color-mix(in srgb, var(--blue-soft) 40%, transparent); }
.cmp-pedir-alta-grilla { display: grid; grid-template-columns: minmax(0, 1fr) 76px 100px; gap: 8px; align-items: center; }
.cmp-pedir-alta-grilla .ui-input { min-height: 36px; font-size: 13px; }
.cmp-pedir-alta-grilla .desc { grid-column: 1 / -1; }
.cmp-pedir-alta-grilla .dest { grid-column: 1 / 2; }
.cmp-pedir-alta-grilla .notas { grid-column: 2 / -1; }
.cmp-pedir-alta-grilla > .ui-btn { grid-column: 1 / -1; justify-self: start; }
.cmp-tipos { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.cmp-tipo { display: grid; gap: 3px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); font: inherit; text-align: left; transition: border-color .15s, background-color .15s; }
.cmp-tipo:hover { border-color: var(--border-2); }
.cmp-tipo b { font-size: 13px; font-weight: 600; }
.cmp-tipo small { font-size: 11.5px; color: var(--dim); }
.cmp-tipo.on { border-color: var(--t-borde); background: var(--t-soft); }
.cmp-tipo.on b, .cmp-tipo.on small { color: var(--t); }

/* Detalle simplificado */
.cmp-desc { display: grid; gap: 6px; justify-items: start; padding: 12px 16px; border-left: 3px solid var(--border-3); border-radius: 4px 12px 12px 4px; background: var(--panel); }
.cmp-desc .cmp-html { width: 100%; }
.cmp-det-sec { display: grid; gap: 10px; min-width: 0; }
.cmp-det-sec + .cmp-det-sec, .cmp-adjuntos + .cmp-det-sec, .cmp-desc + .cmp-det-sec { margin-top: 6px; }
.cmp-det-sec-cab { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 32px; }
.cmp-det-sec-cab > b { font-size: 15px; font-weight: 650; }
.cmp-lado-nota { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--t, var(--dim)); }
.cmp-lado-tit .cmp-link { font-size: 12px; letter-spacing: 0; text-transform: none; }
.cmp-det-tit .cmp-tag { margin-left: 8px; vertical-align: 4px; }
.cmp-item .nom .cant { margin-left: 8px; vertical-align: 1px; font-weight: 500; }

/* ── Caja chica ── */
.cmp-caja { display: grid; gap: 14px; min-width: 0; }
.cmp-caja-actual { display: grid; grid-template-columns: minmax(0, 1.2fr) auto auto; gap: 18px; align-items: center; padding: 14px 16px; border: 1px solid var(--blue-border); border-radius: 16px; background: linear-gradient(120deg, var(--panel-solid), color-mix(in srgb, var(--blue-soft) 70%, var(--panel-solid))); }
.cmp-caja-actual.cerrada { border-color: var(--border); background: var(--panel); }
.cmp-caja-nombre { display: flex; align-items: center; gap: 12px; min-width: 0; }
.cmp-caja-nombre b { display: block; font-size: 16px; font-weight: 650; }
.cmp-caja-nombre small { display: block; margin-top: 2px; font-size: 12.5px; color: var(--dim); }
.cmp-caja-cifras { display: flex; gap: 22px; flex-wrap: wrap; }
.cmp-caja-cifras > div { display: grid; gap: 2px; }
.cmp-caja-cifras span { font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--subtle); }
.cmp-caja-cifras b { font-size: 16px; font-weight: 650; color: var(--t, var(--text)); }
.cmp-caja-cifras .saldo b { font-size: 21px; font-weight: 700; }
.cmp-caja-cifras small { font-size: 11.5px; color: var(--dim); }
.cmp-caja-cifras.modal { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.cmp-caja-cifras.modal > div { padding: 9px 11px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); }
.cmp-caja-acc { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.cmp-caja-grilla { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 14px; align-items: start; }
.cmp-caja-carga { position: sticky; top: 0; }
.cmp-caja-previa { display: flex !important; align-items: center; justify-content: space-between; gap: 10px; padding-top: 6px; border-top: 1px solid var(--border); }
.cmp-caja-previa .mono { font-size: 16px; font-weight: 650; color: var(--t); }
.cmp-caja-cajas { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .9fr); gap: 16px; align-items: start; }
.cmp-caja-op { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); font: inherit; text-align: left; transition: border-color .15s, background-color .15s; }
.cmp-caja-op:hover { border-color: var(--border-2); }
.cmp-caja-op.on { border-color: var(--blue-border); background: var(--blue-soft); }
.cmp-caja-op b { display: block; font-size: 13.5px; font-weight: 600; }
.cmp-caja-op small { display: flex; align-items: center; gap: 5px; margin-top: 2px; font-size: 12px; color: var(--dim); }
.cmp-caja-nueva { padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.cmp-caja-imp { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--t-borde); border-radius: 12px; background: var(--t-soft); }
.cmp-caja-imp .cab { display: flex; justify-content: space-between; gap: 8px; align-items: center; min-width: 0; }
.cmp-caja-imp .cab b { font-size: 12.5px; font-weight: 600; color: var(--t); white-space: nowrap; }
.cmp-caja-imp .cab small { font-size: 11px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-caja-imp .campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 6px; }
.cmp-caja-imp .ui-input { min-height: 32px; font-size: 12.5px; }

/* ── Hoja de ruta (Compras y la pantalla del cadete) ── */
.cmp-ruta { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.cmp-ruta-lado { display: grid; gap: 12px; align-content: start; position: sticky; top: 0; }
.cmp-ruta-saldo { font-size: 22px; font-weight: 700; color: var(--t); }
.cmp-ruta-main { display: grid; gap: 12px; min-width: 0; align-content: start; }
.cmp-ruta-cab { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.cmp-ruta-fecha { font-size: 20px; font-weight: 700; letter-spacing: -.01em; text-transform: capitalize; }
.cmp-ruta-barra { display: flex; height: 8px; border-radius: 99px; background: var(--panel-3); overflow: hidden; }
.cmp-ruta-barra i { display: block; height: 100%; transition: width .4s cubic-bezier(.22,1,.36,1); }
.cmp-ruta-pick { display: flex; gap: 10px; align-items: flex-start; padding: 9px 11px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); cursor: pointer; }
.cmp-ruta-pick.on { border-color: var(--blue-border); background: var(--blue-soft); }
.cmp-ruta-pick input { margin-top: 3px; }
.cmp-ruta-pick b { display: block; font-size: 13px; font-weight: 600; }
.cmp-ruta-pick small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--dim); }
.cmp-parada { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 10px 12px; border: 1px solid var(--border); border-left: 3px solid var(--t); border-radius: 12px; background: var(--panel-solid); }
.cmp-parada .orden { display: grid; justify-items: center; gap: 2px; }
.cmp-parada .orden .n, .cmp-parada-cad .n { font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 650; color: var(--dim); }
.cmp-parada .cab, .cmp-parada-cad .cab { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.cmp-parada .cab b { font-size: 14px; font-weight: 600; }
.cmp-parada .det, .cmp-parada-cad .det { margin-top: 3px; font-size: 13px; color: var(--muted); }
.cmp-parada .dir, .cmp-parada-cad .dir { display: flex; align-items: center; gap: 5px; margin-top: 3px; font-size: 12px; color: var(--blue); }
.cmp-parada .importe, .cmp-parada-cad .importe { margin-top: 4px; font-size: 13.5px; font-weight: 650; color: var(--green); }
.cmp-parada .motivo, .cmp-parada-cad .motivo { margin-top: 4px; font-size: 12.5px; color: var(--red); }
.cmp-parada-cad { border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); overflow: hidden; }
.cmp-parada-cad.resuelta { border-color: var(--t-borde); }
.cmp-parada-cad .cuerpo { display: flex; gap: 12px; align-items: flex-start; padding: 13px 14px; }
.cmp-parada-cad .cuerpo > .n { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; color: var(--t); background: var(--t-soft); font-size: 13px; }
.cmp-parada-cad .cab b { font-size: 15.5px; font-weight: 650; }
.cmp-parada-cad .acc { display: flex; gap: 8px; padding: 0 14px 14px; }
.cmp-parada-cad .acc .ui-btn { flex: 1; justify-content: center; min-height: 44px; }
.cmp-parada-cad .form { display: grid; gap: 10px; padding: 0 14px 14px; }
.cmp-parada-cad .form .acc { padding: 0; }
.cmp-parada-remito { display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; padding: 5px 11px 5px 5px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-2); color: var(--blue); font-size: 12.5px; font-weight: 600; text-decoration: none; }
.cmp-parada-remito img { width: 34px; height: 34px; border-radius: 7px; object-fit: cover; display: block; }
.cmp-ruta-pantalla { position: fixed; top: 0; right: 0; bottom: 0; left: 0; display: flex; flex-direction: column; background: radial-gradient(1100px 380px at 18% -12%, var(--glow-a), transparent 70%), var(--bg); }
.cmp-ruta-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--topbar-soft); }
.cmp-ruta-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: grid; gap: 14px; align-content: start; }

/* ── Adicionales: con la pantalla mediana la lista de tablas pasa arriba ── */
@media (max-width: 1250px) {
  .cmp-adic { grid-template-columns: minmax(0, 1fr) !important; }
  .cmp-adic-rail { max-height: 260px !important; }
}
@media (min-width: 900px) and (max-width: 1250px) {
  .cmp-adic-alta { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr) 70px !important; }
}

/* ── Registro ── */
.cmp-reg-dos { display: grid; grid-template-columns: minmax(300px, .8fr) minmax(0, 1.2fr); gap: 12px; }
.cmp-reg-obras { display: grid; grid-template-columns: minmax(280px, .45fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.cmp-reg-obras > :last-child { grid-column: 1 / -1; }

/* ── Tablero ── */
.cmp-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.cmp-kpi { display: grid; gap: 8px; padding: 14px 15px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); min-width: 0; animation: cmp-sube .45s cubic-bezier(.22,1,.36,1) both; }
.cmp-kpi .cab { display: flex; align-items: center; gap: 9px; }
.cmp-kpi .ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: var(--t); background: var(--t-soft); border: 1px solid var(--t-borde); }
.cmp-kpi .et { font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
.cmp-kpi .v-fila { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cmp-kpi .v { font-family: "JetBrains Mono", monospace; font-size: 26px; font-weight: 700; letter-spacing: -.02em; color: var(--text); }
.cmp-kpi .txt { font-size: 12px; color: var(--dim); line-height: 1.4; padding-top: 8px; border-top: 1px solid var(--border); }
.cmp-embudo { display: grid; gap: 8px; }
.cmp-embudo .fila { display: grid; grid-template-columns: 104px minmax(0, 1fr) 52px; gap: 10px; align-items: center; }
.cmp-embudo .et { font-size: 12.5px; font-weight: 600; color: var(--muted); }
.cmp-embudo .barra { height: 16px; border-radius: 6px; background: var(--panel-2); overflow: hidden; }
.cmp-embudo .barra i { display: block; height: 100%; border-radius: 6px; background: var(--t); transform-origin: left; animation: cmp-crece .8s cubic-bezier(.22,1,.36,1) both; }
.cmp-embudo .n { font-family: "JetBrains Mono", monospace; font-size: 13px; font-weight: 650; text-align: right; }
.cmp-tres { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.cmp-dos { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
.cmp-leyenda { display: grid; gap: 6px; }
.cmp-leyenda span { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; font-size: 12.5px; color: var(--muted); }
.cmp-leyenda i { width: 8px; height: 8px; border-radius: 50%; }
.cmp-mini-fila { width: 100%; text-align: left; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 9px 11px; border: 1px solid var(--border); border-left: 3px solid var(--t); border-radius: 10px; background: var(--panel-solid); color: var(--text); font: inherit; }
.cmp-mini-fila:hover { border-color: var(--border-2); border-left-color: var(--t); }
.cmp-mini-fila .tit { display: block; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-mini-fila .meta { display: block; margin-top: 2px; font-size: 11.5px; color: var(--dim); }
.cmp-mini-fila .der { font-family: "JetBrains Mono", monospace; font-size: 11.5px; font-weight: 650; color: var(--t); white-space: nowrap; }

/* Tarjetas de pedido (la vista estándar) */
.cmp-tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 10px; min-width: 0; }
.cmp-tarjeta {
  position: relative; display: flex; flex-direction: column; gap: 7px; min-width: 0; text-align: left;
  padding: 12px 14px 12px 16px; border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
  background: var(--panel-solid); color: var(--text); font: inherit;
  transition: border-color .15s, background-color .15s, transform .16s, box-shadow .16s;
  animation: cmp-sube .38s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i, 0) * 18ms);
}
.cmp-tarjeta::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--t); }
.cmp-tarjeta:hover { border-color: var(--border-2); background: var(--panel-solid-2); transform: translateY(-2px); box-shadow: 0 10px 26px -12px var(--shadow); }
.cmp-tarjeta:active { transform: translateY(0); }
.cmp-tarjeta.cerrada { opacity: .62; }
.cmp-tarjeta-cab { display: flex; align-items: center; gap: 7px; min-width: 0; }
.cmp-tarjeta-tit { font-size: 14.5px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cmp-tarjeta-desc { font-size: 12.5px; color: var(--dim); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cmp-tarjeta-motivo { font-size: 12px; font-weight: 600; color: var(--t); }
.cmp-tarjeta-pie { margin-top: auto; padding-top: 8px; display: grid; gap: 7px; border-top: 1px solid var(--border); }
.cmp-tarjeta-datos { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--subtle); }
.cmp-tarjeta-datos > span { display: inline-flex; align-items: center; gap: 4px; }
.cmp-tarjeta-datos .mono { color: var(--muted); }
.cmp-tarjeta .cmp-prog-barras i.on { background: var(--t); }

/* Vistazo de un pedido al pasar el mouse */
.cmp-vistazo {
  position: fixed; z-index: 90; display: grid; gap: 10px; max-height: min(460px, 80vh); overflow: hidden;
  padding: 13px 14px; border: 1px solid var(--border-2); border-radius: 14px; background: var(--panel-solid);
  box-shadow: var(--elev-2); pointer-events: none; animation: cmp-menu .16s cubic-bezier(.22,1,.36,1) both;
}
.cmp-vistazo::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--t); }
.cmp-vistazo-cab { display: grid; gap: 6px; justify-items: start; }
.cmp-vistazo-cab b { font-size: 14px; font-weight: 600; line-height: 1.3; }
.cmp-vistazo-fotos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.cmp-vistazo-fotos img { width: 100%; height: 86px; object-fit: cover; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); }
.cmp-vistazo-arch { display: flex; align-items: flex-start; gap: 7px; font-size: 12px; color: var(--muted); line-height: 1.4; }
.cmp-vistazo-arch svg { flex-shrink: 0; margin-top: 2px; color: var(--blue); }
.cmp-vistazo-items { display: grid; gap: 5px; }
.cmp-vistazo-items .it { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 12.5px; }
.cmp-vistazo-items .it i { width: 7px; height: 7px; border-radius: 50%; background: var(--t); }
.cmp-vistazo-items .it .d { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-vistazo-items .it .c { font-family: "JetBrains Mono", monospace; font-size: 11.5px; color: var(--dim); white-space: nowrap; }
.cmp-vistazo-desc { display: flex; gap: 7px; font-size: 12.5px; color: var(--muted); line-height: 1.45; }
.cmp-vistazo-desc svg { flex-shrink: 0; margin-top: 2px; color: var(--subtle); }

/* ── Formularios ── */
.cmp-form { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.cmp-campo { display: grid; gap: 6px; min-width: 0; grid-column: span 3; align-content: start; }
.cmp-campo.c2 { grid-column: span 2; }
.cmp-campo.c4 { grid-column: span 4; }
.cmp-campo.c6 { grid-column: 1 / -1; }
.cmp-campo > span, .cmp-campo > label, .cmp-et { font-size: 11.5px; font-weight: 600; color: var(--dim); }
.cmp-campo .req { color: var(--blue); }
.cmp-campo > .cmp-seg { justify-self: start; }
.cmp-ayuda { font-size: 11.5px; color: var(--subtle); line-height: 1.45; }
:where(.cmp, .cmp-ambito) input[type="number"].ui-input, :where(.cmp, .cmp-ambito) .ui-input.num, .cmp-modal .ui-input.num { font-family: 'JetBrains Mono', monospace; }
:where(.cmp, .cmp-ambito) textarea.ui-input, .cmp-modal textarea.ui-input { min-height: 70px; padding: 9px 12px; resize: vertical; line-height: 1.45; }
:where(.cmp, .cmp-ambito) select.ui-input, .cmp-modal select.ui-input { padding-right: 8px; }

/* Secciones numeradas del pedido nuevo */
.cmp-pasos-form { display: grid; gap: 18px; }
.cmp-paso { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 12px; }
.cmp-paso-n { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 650; color: var(--blue); background: var(--blue-soft); border: 1px solid var(--blue-border); }
.cmp-paso.hecho .cmp-paso-n { color: var(--inverse-text); background: var(--brand-grad); border-color: transparent; }
.cmp-paso-tit { font-size: 14px; font-weight: 650; margin: 4px 0 10px; }
.cmp-paso-tit small { font-size: 12px; font-weight: 500; color: var(--dim); margin-left: 6px; }

/* Ítems del pedido nuevo */
.cmp-items { border: 1px solid var(--border); border-radius: 12px; background: var(--panel); overflow: hidden; }
.cmp-items.alerta { border-color: var(--cyan-border); }
.cmp-item-fila { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto 30px; gap: 10px; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.cmp-item-fila .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); text-align: center; }
.cmp-item-fila .d { font-size: 13.5px; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.cmp-item-fila .d a { margin-left: 8px; font-size: 11.5px; font-weight: 600; color: var(--cyan); text-decoration: none; }
.cmp-item-fila .c { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); white-space: nowrap; }
.cmp-item-nuevo { display: grid; grid-template-columns: minmax(0, 1fr) 84px 112px auto; gap: 8px; padding: 10px; align-items: start; }
.cmp-item-nuevo .desc { display: grid; gap: 6px; min-width: 0; }
.cmp-item-nuevo .link { font-size: 12px; color: var(--cyan); }
.cmp-items-aviso { padding: 8px 12px; border-top: 1px solid var(--cyan-border); background: var(--cyan-soft); color: var(--cyan); font-size: 12px; font-weight: 600; }

/* Buscar el ítem en el catálogo del pañol */
.cmp-cat-sug { display: grid; gap: 2px; padding: 8px 10px 10px; border-top: 1px solid var(--teal-border); background: color-mix(in srgb, var(--teal-soft) 55%, transparent); }
.cmp-cat-sug-cab { display: flex; align-items: center; gap: 7px; padding: 0 2px 4px; font-size: 12px; font-weight: 600; color: var(--teal); }
.cmp-cat-op { display: grid; gap: 1px; width: 100%; padding: 7px 10px; border: 0; border-radius: 9px; background: transparent; color: var(--text); font: inherit; text-align: left; transition: background-color .12s; }
.cmp-cat-op:hover, .cmp-cat-op:focus-visible { background: var(--panel-solid); }
.cmp-cat-op .nom { font-size: 13px; font-weight: 600; }
.cmp-cat-op .det { font-size: 11.5px; color: var(--dim); }
.cmp-cat-elegido { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 9px 12px; border-top: 1px solid var(--teal-border); background: var(--teal-soft); color: var(--teal); }
.cmp-cat-elegido b { display: block; font-size: 12.5px; font-weight: 600; }
.cmp-cat-elegido small { display: block; font-size: 11.5px; color: var(--dim); }

/* Adjuntos */
.cmp-drop {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  border: 1.5px dashed var(--border-2); border-radius: 12px; background: var(--panel); color: var(--dim);
  transition: border-color .15s, background-color .15s, color .15s;
}
.cmp-drop:hover, .cmp-drop.sobre { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); }
.cmp-drop.lleno { opacity: .6; }
.cmp-drop b { display: block; color: var(--text); font-size: 13px; font-weight: 600; }
.cmp-drop small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--dim); }
.cmp-archivos { display: grid; gap: 6px; }
.cmp-archivo { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto 30px; gap: 10px; align-items: center; padding: 6px 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid); }
.cmp-archivo .ic { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: var(--blue-soft); color: var(--blue); }
.cmp-archivo .nom { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-archivo .peso { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--dim); }

/* Personas en copia */
.cmp-personas { display: flex; flex-wrap: wrap; gap: 6px; }
.cmp-persona {
  display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 10px 0 4px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--panel); color: var(--muted);
  font: inherit; font-size: 12.5px; font-weight: 600; transition: border-color .15s, background-color .15s, color .15s;
}
.cmp-persona:hover { border-color: var(--border-2); color: var(--text); }
.cmp-persona.on { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); }
.cmp-persona .rol { font-size: 10.5px; font-weight: 600; color: var(--subtle); text-transform: uppercase; letter-spacing: .04em; }
.cmp-avatar { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; font-size: 10px; font-weight: 700; color: var(--t, var(--blue)); background: var(--t-soft, var(--blue-soft)); border: 1px solid var(--t-borde, var(--blue-border)); }
.cmp-avatar.grande { width: 32px; height: 32px; font-size: 11.5px; border-radius: 10px; }

/* Borradores */
.cmp-borradores { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.cmp-borrador { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; }
.cmp-borrador b { display: block; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-borrador small { font-size: 11.5px; color: var(--dim); }

/* ── Selector de obra o destino ── */
.cmp-sel { position: relative; min-width: 0; }
.cmp-sel-boton {
  width: 100%; min-height: 40px; display: flex; align-items: center; gap: 10px; padding: 5px 10px 5px 12px;
  border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel); color: var(--text);
  font: inherit; font-size: 14px; text-align: left; transition: border-color .15s, box-shadow .15s;
}
.cmp-sel-boton:hover { border-color: var(--border-3); }
.cmp-sel-boton.abierto, .cmp-sel-boton:focus-visible { border-color: var(--focus); box-shadow: 0 0 0 3px var(--blue-soft); outline: none; }
.cmp-sel-boton .vacio { color: var(--subtle); flex: 1; }
.cmp-sel-boton.chico { min-height: 34px; font-size: 13px; padding: 3px 8px 3px 10px; }
.cmp-sel-boton.chico .cmp-sel-cod { font-size: 12.5px; }
.cmp-sel-cod { font-family: 'JetBrains Mono', monospace; font-weight: 650; font-size: 14px; white-space: nowrap; }
.cmp-sel-meta { font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.cmp-sel-chev { color: var(--subtle); flex-shrink: 0; }
.cmp-sel-pop {
  position: absolute; z-index: 60; left: 0; right: 0; top: calc(100% + 6px); min-width: 280px;
  border: 1px solid var(--border-2); border-radius: 14px; background: var(--panel-solid); box-shadow: var(--elev-2);
  overflow: hidden; animation: cmp-menu .16s cubic-bezier(.22,1,.36,1) both;
}
.cmp-sel-pop.arriba { top: auto; bottom: calc(100% + 6px); }
.cmp-sel-buscar { position: relative; padding: 8px; border-bottom: 1px solid var(--border); }
.cmp-sel-buscar svg { position: absolute; left: 19px; top: 50%; transform: translateY(-50%); color: var(--subtle); pointer-events: none; }
.cmp-sel-buscar input { padding-left: 32px; min-height: 36px; font-size: 13.5px; }
.cmp-sel-lista { max-height: 340px; overflow-y: auto; overscroll-behavior: contain; padding: 4px; }
.cmp-sel-grupo { padding: 8px 9px 4px; font-size: 10.5px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--subtle); }
.cmp-sel-op {
  width: 100%; display: grid; grid-template-columns: minmax(64px, auto) minmax(0, 1fr); gap: 10px; align-items: center;
  min-height: 38px; padding: 5px 9px; border: 0; border-radius: 9px; background: transparent; color: var(--text);
  font: inherit; font-size: 13px; text-align: left;
}
.cmp-sel-op:hover, .cmp-sel-op.activa { background: var(--panel-2); }
.cmp-sel-op.on { background: var(--blue-soft); }
.cmp-sel-op .cod { font-family: 'JetBrains Mono', monospace; font-weight: 650; }
.cmp-sel-op .det { font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmp-sel-op.otro .cod { font-family: inherit; font-weight: 600; }
.cmp-sel-libre { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 8px 12px; border: 0; border-top: 1px solid var(--border); background: var(--panel); color: var(--dim); font: inherit; font-size: 12.5px; text-align: left; }
.cmp-sel-libre:hover, .cmp-sel-libre.activa { color: var(--text); background: var(--panel-2); }
.cmp-sel-libre b { color: var(--text); font-weight: 600; }
.cmp-sel-nada { padding: 14px 12px; font-size: 12.5px; color: var(--dim); }

/* ── Avisos: lista y detalle ── */
.cmp-split { display: grid; grid-template-columns: minmax(300px, 400px) minmax(0, 1fr); gap: 14px; align-items: start; min-width: 0; }
.cmp-split-lista { display: grid; gap: 6px; min-width: 0; grid-auto-rows: max-content; }
.cmp-aviso-it {
  width: 100%; text-align: left; display: grid; gap: 6px; padding: 11px 13px; min-width: 0;
  border: 1px solid var(--border); border-radius: 13px; background: var(--panel-solid); color: var(--text); font: inherit;
  transition: border-color .15s, background-color .15s;
}
.cmp-aviso-it:hover { border-color: var(--border-2); }
.cmp-aviso-it.on { border-color: var(--blue-border); background: color-mix(in srgb, var(--blue-soft) 55%, var(--panel-solid)); box-shadow: inset 3px 0 0 var(--blue); }
.cmp-aviso-it .tit { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-aviso-it .sub { font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-aviso-it .pie { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-size: 11.5px; color: var(--dim); }
.cmp-detalle { border: 1px solid var(--border); border-radius: 16px; background: var(--panel-solid); min-width: 0; overflow: hidden; position: sticky; top: 0; }
.cmp-detalle-cab { padding: 16px; border-bottom: 1px solid var(--border); display: grid; gap: 10px; }
.cmp-detalle-tit { font-size: 18px; font-weight: 700; letter-spacing: -.01em; line-height: 1.25; }
.cmp-detalle-cuerpo { padding: 16px; display: grid; gap: 12px; }
.cmp-nota { padding: 10px 12px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); color: var(--muted); font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
.cmp-coment { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); }
.cmp-coment .quien { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.cmp-coment .quien b { font-weight: 600; }
.cmp-coment .quien span { color: var(--subtle); font-size: 11.5px; }
.cmp-coment p { font-size: 13px; color: var(--muted); line-height: 1.5; white-space: pre-wrap; }

/* ── Diálogo: tarjeta centrada; en el celular, hoja desde abajo ── */
.cmp-modal-fondo { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 140; display: grid; place-items: center; padding: 16px; background: var(--overlay); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: cmp-aparece .18s ease both; }
.cmp-modal { width: min(560px, 100%); max-height: min(90vh, 880px); display: flex; flex-direction: column; border: 1px solid var(--border-2); border-radius: 18px; background: var(--panel-solid); box-shadow: var(--elev-2); overflow: hidden; animation: cmp-sube .3s cubic-bezier(.22,1,.36,1) both; font-family: 'Outfit', system-ui, sans-serif; color: var(--text); }
.cmp-modal.ancho { width: min(760px, 100%); }
.cmp-modal.xl { width: min(880px, 100%); }
.cmp-modal-cab { display: flex; align-items: flex-start; gap: 12px; padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
.cmp-modal-ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; border: 1px solid var(--t-borde, var(--blue-border)); background: var(--t-soft, var(--blue-soft)); color: var(--t, var(--blue)); }
.cmp-modal-tit { font-size: 16px; font-weight: 650; line-height: 1.25; }
.cmp-modal-sub { margin-top: 3px; font-size: 12.5px; color: var(--dim); line-height: 1.45; }
.cmp-modal-cuerpo { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 18px; display: grid; gap: 14px; align-content: start; }
.cmp-modal-pie { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; padding: 12px 18px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--panel-solid-2); }
.cmp-modal-pie .izq { margin-right: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dim); }
.cmp-modal .cmp-btn-ic { width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--muted); display: grid; place-items: center; }

/* ── Editor de texto (Quill), con ámbito ── */
.cmp-editor { border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel); overflow: hidden; }
.cmp-editor .ql-toolbar.ql-snow { border: 0; border-bottom: 1px solid var(--border); background: var(--panel); padding: 6px 10px; }
.cmp-editor .ql-container.ql-snow { border: 0; font-family: 'Outfit', sans-serif; font-size: 14px; color: var(--text); }
.cmp-editor .ql-editor { min-height: 110px; padding: 12px; }
.cmp-editor .ql-editor.ql-blank::before { color: var(--subtle); font-style: normal; }
.cmp-editor .ql-snow .ql-stroke { stroke: var(--muted); }
.cmp-editor .ql-snow .ql-fill, .cmp-editor .ql-snow .ql-stroke.ql-fill { fill: var(--muted); }
.cmp-editor .ql-snow.ql-toolbar button:hover .ql-stroke, .cmp-editor .ql-snow.ql-toolbar button.ql-active .ql-stroke { stroke: var(--blue); }
.cmp-editor .ql-snow.ql-toolbar button:hover .ql-fill, .cmp-editor .ql-snow.ql-toolbar button.ql-active .ql-fill { fill: var(--blue); }
.cmp-editor .ql-snow .ql-picker { color: var(--muted); }
.cmp-editor .ql-snow .ql-picker-options { background: var(--panel-solid-2); border: 1px solid var(--border); }
.cmp-editor .ql-snow .ql-tooltip { background: var(--panel-solid-2); border: 1px solid var(--border); color: var(--text); box-shadow: 0 4px 12px var(--shadow); }
.cmp-editor .ql-snow .ql-tooltip input[type="text"] { background: var(--panel); border: 1px solid var(--border); color: var(--text); }
.cmp-editor .ql-snow .ql-tooltip a { color: var(--blue); }
.cmp-html { color: var(--muted); font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.cmp-html ul, .cmp-html ol { padding-left: 20px; margin: 6px 0; }
.cmp-html p { margin: 0 0 6px; }
.cmp-html p:last-child { margin: 0; }
.cmp-html a { color: var(--blue); text-decoration: underline; }

:where(.cmp, .cmp-ambito) .spin, .cmp-modal .spin { animation: cmp-giro .8s linear infinite; }
@keyframes cmp-giro { to { transform: rotate(360deg); } }
@keyframes cmp-sube { from { opacity: 0; transform: translateY(10px); } }
@keyframes cmp-aparece { from { opacity: 0; } }
@keyframes cmp-menu { from { opacity: 0; transform: translateY(-4px) scale(.98); } }
@keyframes cmp-crece { from { transform: scaleX(0); } }
@keyframes cmp-desde-abajo { from { opacity: .4; transform: translateY(100%); } }

@media (max-width: 1280px) {
  .cmp-nav-txt { display: none; }
  .cmp-nav .ui-tab { padding: 0 10px; }
}

@media (max-width: 1100px) {
  .cmp-reg-dos, .cmp-reg-obras { grid-template-columns: minmax(0, 1fr); }
  .cmp-ruta { grid-template-columns: 260px minmax(0, 1fr); }
  .cmp-caja-grilla { grid-template-columns: minmax(0, 1fr); }
  .cmp-caja-carga { position: static; }
  .cmp-caja-actual { grid-template-columns: minmax(0, 1fr); }
  .cmp-caja-acc { justify-content: flex-start; }
  .cmp-fila { grid-template-columns: 34px minmax(0, 1fr) 132px 84px; }
  .cmp-fila-chev { display: none; }
  .cmp-split { grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); }
}

@media (max-width: 899px) {
  /* Las pestañas van abajo, al alcance del pulgar (arriba las tapa el aviso
     de notificaciones de la app). */
  .cmp-nav {
    order: 3; min-height: 0; gap: 4px; padding: 4px 6px calc(4px + env(safe-area-inset-bottom));
    border-bottom: 0; border-top: 1px solid var(--border); background: var(--topbar);
  }
  .cmp-nav-marca, .cmp-nav-sep, .cmp-nav-refrescar { display: none; }
  .cmp-nav .ui-tabs { flex: 1; }
  .cmp-nav .ui-tab { flex: 1 0 auto; flex-direction: column; justify-content: center; gap: 3px; min-height: 52px; padding: 0 6px; font-size: 11px; }
  .cmp-nav .ui-tab svg { width: 18px; height: 18px; }
  .cmp-nav .ui-tab .chev { display: none; }
  .cmp-nav .ui-tab[aria-selected="true"]::after { top: -5px; bottom: auto; left: 22%; right: 22%; }
  .cmp-nav .ui-tab .n { position: absolute; top: 3px; right: 4px; height: 16px; min-width: 16px; font-size: 9.5px; }
  .cmp-nav .ui-tab .txt-largo { display: none; }
  .cmp-nav .ui-tab .txt-corto { display: inline; }
  .cmp-nav-acc { margin-left: 0; }
  .cmp-nuevo { width: 52px; min-height: 52px !important; padding: 0 !important; justify-content: center; border-radius: 14px !important; flex-direction: column; gap: 2px !important; font-size: 10.5px !important; }
  .cmp-nuevo .txt-largo { display: none; }
  .cmp-nuevo .txt-corto { display: inline; }

  .cmp.con-detalle .cmp-nav { display: none; }
  .cmp-pagina { padding: 14px 16px 32px; }
  .cmp-h1 { font-size: 20px; }
  .cmp-filtros.desliza { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -16px; padding: 0 16px; }
  .cmp-filtros.desliza::-webkit-scrollbar { display: none; }
  .cmp-buscar { flex: 1 1 100%; }
  .cmp-acciones { width: 100%; }
  .cmp-acciones .ui-btn { flex: 1; }
  .cmp-form { grid-template-columns: minmax(0, 1fr); }
  .cmp-campo, .cmp-campo.c2, .cmp-campo.c4 { grid-column: 1 / -1; }
  .cmp-bloque-cab { padding: 12px; }
  .cmp-bloque-cuerpo { padding: 12px; }

  .cmp-fila { grid-template-columns: 30px minmax(0, 1fr) auto; grid-template-areas: "ic main fecha" "ic prog prog"; gap: 8px 12px; padding: 11px 12px; }
  .cmp-fila > .cmp-fila-ic { grid-area: ic; width: 30px; height: 30px; border-radius: 9px; align-self: start; }
  .cmp-fila > .cmp-fila-main { grid-area: main; }
  .cmp-fila > .cmp-prog { grid-area: prog; }
  .cmp-fila > .cmp-fila-fecha { grid-area: fecha; align-self: start; }
  .cmp-fila-tit { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .cmp-fila.aviso { grid-template-areas: "ic main fecha"; }
  .cmp-fila.aviso > :nth-child(3) { grid-column: 2 / -1; }

  .cmp-split { grid-template-columns: minmax(0, 1fr); }
  .cmp-ruta { grid-template-columns: minmax(0, 1fr); }
  .cmp-ruta-lado { position: static; }
  .cmp-ruta-vistas { flex: 1 1 100%; }
  .cmp-ruta-vistas button { flex: 1; justify-content: center; min-height: 38px; }
  .cmp-ruta-scroll { padding: 12px; }
  .cmp-caja-cajas { grid-template-columns: minmax(0, 1fr); }
  .cmp-det { display: block; height: 100%; overflow-y: auto; }
  .cmp-det-cab { padding: 12px 14px 14px; }
  .cmp-det-tit { font-size: 18px; }
  .cmp-det-recorrido { padding-left: 0; }
  .cmp-pasito .nom { font-size: 10.5px; }
  .cmp-pasito .bola { width: 28px; height: 28px; }
  .cmp-pasito::before { top: 13px; left: calc(-50% + 16px); right: calc(50% + 16px); }
  .cmp-det-cuerpo { display: block; }
  .cmp-det-main { display: block; border-right: 0; }
  .cmp-det-scroll { overflow: visible; padding: 14px 14px 18px; }
  .cmp-escribir { position: sticky; bottom: 0; z-index: 5; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); background: var(--topbar); }
  .cmp-det-lado { overflow: visible; padding: 4px 14px 28px; }
  .cmp-item { grid-template-columns: minmax(0, 1fr) auto; }
  .cmp-item > select.estado, .cmp-item > .cmp-estado { grid-column: 1 / -1; justify-self: start; width: auto; }
  .cmp-item-alta { grid-template-columns: minmax(0, 1fr) 84px; }
  .cmp-item-alta > input:first-child { grid-column: 1 / -1; }
  .cmp-msg-burbuja { width: 92%; }
  .cmp-repo-fila { grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; padding: 11px 12px; }
  .cmp-repo-fila > div:first-child { grid-column: 1 / -1; }
  .cmp-repo-fila .cifra { text-align: left; }
  .cmp-repo-fila .accion { grid-column: 1 / -1; justify-self: start; }
  .cmp-tabla { max-height: none; }
  .cmp-falt-cab { display: none; }
  .cmp-falt-fila { grid-template-columns: minmax(0, 1fr) auto; gap: 6px 10px; padding: 11px 12px; }
  .cmp-falt-fila .mat { grid-column: 1 / -1; }
  .cmp-falt-fila .cuando { display: none; }
  .cmp-falt-det { grid-template-columns: minmax(0, 1fr); padding: 12px; }
  .cmp-pedir-fila { grid-template-columns: 84px minmax(0, 1fr) 30px; }
  .cmp-pedir-fila .desc { grid-column: 1 / -1; }
  .cmp-pedir-fila .dest { grid-column: 1 / -1; grid-row: 3; }
  .cmp-pedir-alta-grilla .dest, .cmp-pedir-alta-grilla .notas { grid-column: 1 / -1; }
  .cmp-plantilla { grid-template-columns: minmax(0, 1fr) auto; }
  .cmp-plantilla > svg { display: none; }
  .cmp-detalle { position: static; }
  .cmp-item-nuevo { grid-template-columns: minmax(0, 1fr) 84px; }
  .cmp-item-nuevo .desc { grid-column: 1 / -1; }
  .cmp-item-nuevo .ui-btn { min-height: 40px; }
  .cmp-sel-pop { min-width: 0; }
  .cmp-sel-op { min-height: 42px; }
  .cmp-modal-fondo { place-items: end stretch; padding: 0; }
  .cmp-modal, .cmp-modal.ancho, .cmp-modal.xl { width: 100%; max-height: 94vh; border-radius: 20px 20px 0 0; border-bottom: 0; animation: cmp-desde-abajo .32s cubic-bezier(.22,1,.36,1) both; }
  .cmp-modal-pie .ui-btn { flex: 1; }
  .cmp-modal-pie .izq { flex: 1 1 100%; }
}
`;
