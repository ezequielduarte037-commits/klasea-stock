// Estilos de Memorias. Todo va bajo .mem (o .mem-modal-fondo para los
// diálogos) para no tocar el resto de la app. Colores sólo con tokens del tema.
// Mismo lenguaje que Compras, Laminación y Muebles.
export const CSS_MEMORIAS = `
.mem {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  background:
    radial-gradient(1100px 380px at 18% -12%, var(--glow-a), transparent 70%),
    radial-gradient(700px 300px at 100% 110%, var(--glow-b), transparent 70%),
    var(--bg);
  color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
}
:where(.mem, .mem-modal-fondo) .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
:where(.mem, .mem-modal-fondo) h1, :where(.mem, .mem-modal-fondo) h2, :where(.mem, .mem-modal-fondo) h3, :where(.mem, .mem-modal-fondo) p { margin: 0; }

.mem-vista { position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.mem-pagina { width: min(2200px, 100%); margin: 0 auto; padding: 20px 28px 56px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-content: start; animation: mem-aparece .25s ease both; }

/* Tonos */
:where(.mem, .mem-modal-fondo) [data-tono="azul"]    { --t: var(--blue);   --t-soft: var(--blue-soft);   --t-borde: var(--blue-border); }
:where(.mem, .mem-modal-fondo) [data-tono="verde"]   { --t: var(--green);  --t-soft: var(--green-soft);  --t-borde: var(--green-border); }
:where(.mem, .mem-modal-fondo) [data-tono="rojo"]    { --t: var(--red);    --t-soft: var(--red-soft);    --t-borde: var(--red-border); }
:where(.mem, .mem-modal-fondo) [data-tono="violeta"] { --t: var(--violet); --t-soft: var(--violet-soft); --t-borde: var(--violet-border); }
:where(.mem, .mem-modal-fondo) [data-tono="cian"]    { --t: var(--cyan);   --t-soft: var(--cyan-soft);   --t-borde: var(--cyan-border); }
:where(.mem, .mem-modal-fondo) [data-tono="teal"]    { --t: var(--teal);   --t-soft: var(--teal-soft);   --t-borde: var(--teal-border); }
:where(.mem, .mem-modal-fondo) [data-tono="neutro"]  { --t: var(--muted);  --t-soft: var(--panel-2);     --t-borde: var(--border-2); }

/* ── Encabezado ── */
.mem-cab { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.mem-titulos { flex: 1; min-width: 0; animation: mem-sube .5s cubic-bezier(.22,1,.36,1) both; }
.mem-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.mem-h1 { margin-top: 3px; font-size: 26px; font-weight: 700; letter-spacing: -.02em; line-height: 1.12; }
.mem-h1 .acento { background: var(--brand-grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.mem-sub { margin-top: 5px; font-size: 13.5px; color: var(--dim); line-height: 1.5; }
.mem-sub b { color: var(--text); font-weight: 600; }
.mem-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mem-sp { flex: 1; }
.mem-rotulo { font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--subtle); }
:where(.mem, .mem-modal-fondo) .ui-btn.chico { min-height: 34px; padding: 0 12px; font-size: 12.5px; border-radius: 10px; }
:where(.mem, .mem-modal-fondo) .ui-btn[data-tono] { color: var(--t); border-color: var(--t-borde); background: var(--t-soft); }
:where(.mem, .mem-modal-fondo) .ui-btn[data-tono]:hover:not(:disabled) { border-color: var(--t); }

.mem-btn-ic {
  width: 36px; height: 36px; display: grid; place-items: center; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--muted);
  transition: background-color .15s, color .15s, border-color .15s, transform .12s;
}
.mem-btn-ic:hover:not(:disabled) { background: var(--panel-2); color: var(--text); border-color: var(--border-2); }
.mem-btn-ic:active:not(:disabled) { transform: scale(.95); }
.mem-btn-ic:disabled { opacity: .35; cursor: default; }
.mem-btn-ic.chico { width: 30px; height: 30px; border-radius: 8px; }
.mem-link { border: 0; background: transparent; padding: 0; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--blue); cursor: pointer; }
.mem-link:hover { text-decoration: underline; }

.mem-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); flex-shrink: 0; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.mem-seg::-webkit-scrollbar { display: none; }
.mem-seg button {
  display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 11px; flex-shrink: 0;
  border: 0; border-radius: 8px; background: transparent; color: var(--dim);
  font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap; cursor: pointer;
  transition: background-color .18s, color .18s, box-shadow .18s;
}
.mem-seg button:hover { color: var(--text); }
.mem-seg button.on { background: var(--panel-solid-3); color: var(--text); box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 4px 12px -6px var(--shadow); }
.mem-seg button.on[data-tono] { color: var(--t); background: var(--t-soft); box-shadow: inset 0 0 0 1px var(--t-borde); }
.mem-seg .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.mem-seg button.on .n { color: inherit; }

.mem-chips { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.mem-chips::-webkit-scrollbar { display: none; }
.mem-chip {
  display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 11px;
  border: 1px solid transparent; border-radius: 10px; background: transparent; cursor: pointer;
  color: var(--dim); font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0;
  transition: background-color .18s, border-color .18s, color .18s;
}
.mem-chip:hover { color: var(--text); background: var(--panel); }
.mem-chip.on { color: var(--text); background: var(--panel-2); border-color: var(--border-2); }
.mem-chip .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }

.mem-buscar { position: relative; flex: 0 1 300px; min-width: 180px; }
.mem-buscar svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--subtle); pointer-events: none; }
.mem-buscar input { padding-left: 34px; min-height: 36px; font-size: 13px; }

.mem-estado {
  display: inline-flex; align-items: center; gap: 6px; min-height: 22px; padding: 0 9px; flex-shrink: 0;
  border: 1px solid var(--t-borde); border-radius: 999px; background: var(--t-soft); color: var(--t);
  font-size: 11.5px; font-weight: 600; white-space: nowrap;
}
.mem-estado::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--t); }
.mem-estado.sin-punto::before { display: none; }

/* ── Portada ── */
.mem-filtros { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mem-grupo { display: grid; gap: 10px; animation: mem-sube .45s cubic-bezier(.22,1,.36,1) both; }
.mem-grupo-tit { display: flex; align-items: baseline; gap: 10px; padding: 4px 2px 0; }
.mem-grupo-tit h2 { font-size: 15px; font-weight: 650; }
.mem-grupo-tit .mono { font-size: 12px; color: var(--subtle); }
.mem-tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; }
.mem-tarjeta {
  position: relative; display: grid; gap: 10px; align-content: start; min-width: 0; padding: 15px 16px 14px;
  border: 1px solid var(--border); border-radius: 16px; background: var(--panel); color: var(--text);
  font: inherit; text-align: left; cursor: pointer; overflow: hidden;
  transition: border-color .18s, background-color .18s, transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s;
}
.mem-tarjeta::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: var(--t, var(--border-2)); opacity: .9; }
.mem-tarjeta:hover { border-color: var(--border-2); background: var(--panel-2); transform: translateY(-2px); box-shadow: var(--elev-1); }
.mem-tarjeta:active { transform: translateY(0) scale(.99); }
.mem-tarjeta-sup { display: flex; align-items: flex-start; gap: 10px; }
.mem-tarjeta-cod { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 650; letter-spacing: -.02em; line-height: 1.1; }
.mem-tarjeta-cli { margin-top: 3px; font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mem-tarjeta-cli.vacio { color: var(--subtle); font-style: italic; }
.mem-tarjeta-falta { font-size: 12.5px; color: var(--dim); line-height: 1.45; min-height: 36px; }
.mem-tarjeta-falta b { color: var(--muted); font-weight: 600; }
.mem-tarjeta-pie { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11.5px; color: var(--subtle); }
.mem-tarjeta-pie .mem-sp { min-width: 4px; }

.mem-anillo { position: relative; width: 44px; height: 44px; flex-shrink: 0; margin-left: auto; }
.mem-anillo svg { width: 44px; height: 44px; transform: rotate(-90deg); }
.mem-anillo circle { fill: none; stroke-width: 4; }
.mem-anillo .fondo { stroke: var(--border); }
.mem-anillo .valor { stroke: var(--t, var(--blue)); stroke-linecap: round; transition: stroke-dashoffset .6s cubic-bezier(.22,1,.36,1); }
.mem-anillo span { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: grid; place-items: center; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 650; color: var(--t, var(--text)); }

.mem-barra { height: 5px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
.mem-barra > i { display: block; height: 100%; border-radius: inherit; background: var(--t, var(--blue)); transition: width .5s cubic-bezier(.22,1,.36,1); }

.mem-vacio { display: grid; place-items: center; gap: 8px; padding: 46px 18px; border: 1px dashed var(--border-2); border-radius: 16px; color: var(--dim); text-align: center; font-size: 13.5px; }
.mem-vacio svg { color: var(--subtle); }

/* ── Ficha ── */
.mem-ficha-cab {
  position: sticky; top: 0; z-index: 30;
  padding: 14px 28px 12px; border-bottom: 1px solid var(--border);
  background: var(--topbar-soft); -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
}
.mem-ficha-cab-in { width: min(2200px, 100%); margin: 0 auto; display: grid; gap: 10px; }
.mem-ficha-fila { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
.mem-volver { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px 0 6px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.mem-volver:hover { color: var(--text); border-color: var(--border-2); }
.mem-ficha-tit { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex-wrap: wrap; }
.mem-ficha-tit .cod { font-family: 'JetBrains Mono', monospace; font-size: 24px; font-weight: 650; letter-spacing: -.02em; white-space: nowrap; flex-shrink: 0; }
.mem-ficha-tit .cli { font-size: 15px; color: var(--muted); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46ch; }
.mem-linea { flex-shrink: 0; display: inline-flex; align-items: center; min-height: 22px; padding: 0 9px; border: 1px solid var(--border-2); border-radius: 999px; font-size: 11.5px; font-weight: 600; color: var(--muted); background: var(--panel); }
.mem-avance { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
.mem-herr-cab { display: inline-flex; align-items: center; gap: 6px; }
.mem-herr-cab .ui-btn .txt { display: none; }
.mem-herr-pie { display: none; flex-wrap: wrap; gap: 8px; padding: 4px 0; }
.mem-avance .mem-barra { flex: 1 1 220px; max-width: 520px; height: 6px; }
.mem-avance-txt { font-size: 12.5px; color: var(--dim); white-space: nowrap; }
.mem-avance-txt b { color: var(--text); font-family: 'JetBrains Mono', monospace; font-weight: 650; }
.mem-guardado { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--dim); white-space: nowrap; }
.mem-guardado i { width: 7px; height: 7px; border-radius: 50%; background: var(--t, var(--green)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--t, var(--green)) 18%, transparent); }
.mem-guardado[data-tono="cian"] i { animation: mem-late 1s ease-in-out infinite alternate; }

.mem-ficha { width: min(2200px, 100%); margin: 0 auto; padding: 18px 28px 64px; display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 22px; align-items: start; }
.mem-indice { position: sticky; top: calc(var(--mem-cab, 130px) + 16px); display: grid; gap: 2px; animation: mem-sube .45s cubic-bezier(.22,1,.36,1) both; }
.mem-indice-cab { display: none; gap: 4px; overflow-x: auto; scrollbar-width: none; margin: 0 -4px -4px; padding: 0 4px 2px; }
.mem-indice-cab::-webkit-scrollbar { display: none; }
.mem-indice-cab .mem-indice-op { flex-shrink: 0; min-height: 32px; }
.mem-indice-cab .mem-indice-op .n { margin-left: 4px; }
.mem-indice-op {
  display: flex; align-items: center; gap: 9px; min-height: 36px; padding: 0 10px;
  border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--dim);
  font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; white-space: nowrap;
  transition: background-color .15s, color .15s, border-color .15s;
}
.mem-indice-op:hover { color: var(--text); background: var(--panel); }
.mem-indice-op.on { color: var(--text); background: var(--panel-2); border-color: var(--border-2); }
.mem-indice-op .pto { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; border: 2px solid var(--border-2); }
.mem-indice-op .pto.lleno { border-color: var(--green); background: var(--green); }
.mem-indice-op .pto.medio { border-color: var(--cyan); background: linear-gradient(90deg, var(--cyan) 50%, transparent 50%); }
.mem-indice-op .n { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--subtle); }
.mem-indice-sep { height: 1px; margin: 8px 6px; background: var(--border); }
.mem-indice-pie { display: grid; gap: 6px; padding: 4px 10px; font-size: 12px; color: var(--subtle); line-height: 1.45; }

.mem-secciones { display: grid; gap: 16px; min-width: 0; }
.mem-seccion { border: 1px solid var(--border); border-radius: 18px; background: var(--panel); overflow: hidden; scroll-margin-top: calc(var(--mem-cab, 130px) + 12px); animation: mem-sube .45s cubic-bezier(.22,1,.36,1) both; }
.mem-seccion-cab { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.mem-seccion-cab .ic { width: 32px; height: 32px; display: grid; place-items: center; flex-shrink: 0; border-radius: 10px; border: 1px solid var(--t-borde); background: var(--t-soft); color: var(--t); }
.mem-seccion-cab h2 { font-size: 16px; font-weight: 650; }
.mem-seccion-cab .cuenta { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--subtle); }
.mem-seccion-cab .usan { margin-left: auto; font-size: 12px; color: var(--subtle); }
.mem-seccion-cab .usan b { color: var(--dim); font-weight: 600; }
.mem-seccion-cuerpo { display: grid; }

.mem-sug-op {
  display: inline-flex; align-items: center; gap: 7px; min-height: 32px; max-width: 100%; padding: 0 11px;
  border: 1px solid var(--border); border-radius: 9px; background: var(--panel-solid); color: var(--muted);
  font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: border-color .15s, color .15s, background-color .15s, transform .12s;
}
.mem-sug-op:hover:not(:disabled) { color: var(--text); border-color: var(--border-2); }
.mem-sug-op:active:not(:disabled) { transform: scale(.97); }
.mem-sug-op:disabled { opacity: .4; cursor: default; }
.mem-sug-op.on { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.mem-sug-op .mem-sw { margin-left: -4px; }

/* Muestra de un material: foto, color o neutra si no se sabe cómo es. */
.mem-sw { display: inline-grid; place-items: center; width: 22px; height: 22px; flex-shrink: 0; border-radius: 6px; background: var(--sw); border: 1px solid var(--border-2); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); color: var(--subtle); }
.mem-sw.grande { width: 100%; height: 74px; border-radius: 10px 10px 0 0; border: 0; border-bottom: 1px solid var(--border); }

/* Hoja de definiciones */
.mem-defs { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; padding: 14px 18px 18px; }
.mem-def {
  position: relative; display: grid; gap: 7px; align-content: start; min-width: 0; min-height: 88px; padding: 12px 14px;
  border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); color: var(--text);
  font: inherit; text-align: left; cursor: pointer;
  transition: border-color .16s, background-color .16s, transform .16s cubic-bezier(.22,1,.36,1), box-shadow .16s;
}
.mem-def:hover { border-color: var(--border-2); transform: translateY(-1px); box-shadow: var(--elev-1); }
.mem-def:active { transform: scale(.99); }
.mem-def[data-estado="vacio"] { border-style: dashed; border-color: var(--border-2); background: transparent; }
.mem-def[data-estado="vacio"]:hover { border-color: var(--blue-border); background: var(--blue-soft); }
.mem-def-et { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--dim); line-height: 1.3; }
.mem-def-et .ok { margin-left: auto; color: var(--green); flex-shrink: 0; }
.mem-def-valor { display: flex; align-items: center; gap: 10px; min-width: 0; }
.mem-def-valor .mem-sw { width: 30px; height: 30px; border-radius: 8px; }
.mem-def-valor b { font-size: 15px; font-weight: 600; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; white-space: pre-line; }
.mem-def[data-estado="no"] .mem-def-valor b { color: var(--dim); font-weight: 500; }
.mem-def-valor .no { color: var(--subtle); flex-shrink: 0; }
.mem-def-vacio { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; color: var(--subtle); }
.mem-def:hover .mem-def-vacio { color: var(--blue); }
.mem-def-sub { font-size: 12px; color: var(--muted); }
.mem-def-nota { font-size: 12px; color: var(--dim); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mem-def-filas { display: grid; gap: 6px; }
.mem-def-filas .fila { display: grid; grid-template-columns: 58px 22px minmax(0, 1fr); align-items: center; gap: 8px; font-size: 13px; }
.mem-def-filas small { color: var(--dim); font-size: 12px; }
.mem-def-filas b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mem-def-filas em { grid-column: 2 / -1; color: var(--subtle); font-style: normal; font-size: 12.5px; }

.mem-cliente { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; padding: 14px 18px 18px; }
.mem-cliente-campo, .mem-notas { display: grid; gap: 6px; min-width: 0; }
.mem-cliente-campo span, .mem-notas span { font-size: 12px; font-weight: 600; color: var(--dim); }
.mem-cliente-campo .ui-input { min-height: 40px; font-size: 14.5px; }
.mem-notas { padding: 14px 18px 0; }
.mem-notas textarea.ui-input { min-height: 72px; padding: 10px 12px; line-height: 1.5; resize: vertical; font: inherit; font-size: 14px; }

/* Equipos */
.mem-equipos { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; align-items: start; padding: 14px 18px 16px; }
.mem-equipo { display: grid; gap: 8px; align-content: start; padding: 11px 12px; border: 1px dashed var(--border-2); border-radius: 13px; background: transparent; transition: border-color .2s, background-color .2s; }
.mem-equipo[data-valor="si"] { border-style: solid; border-color: var(--green-border); background: color-mix(in srgb, var(--green) 6%, transparent); }
.mem-equipo[data-valor="no"] { border-style: solid; border-color: var(--border); background: var(--panel-solid); }
.mem-equipo-sup { display: flex; align-items: center; gap: 10px; }
.mem-equipo-sup b { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; }
.mem-equipo[data-valor="no"] .mem-equipo-sup b { color: var(--dim); }
.mem-sino { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); flex-shrink: 0; }
.mem-sino button { min-width: 38px; min-height: 28px; padding: 0 9px; border: 0; border-radius: 7px; background: transparent; color: var(--dim); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: background-color .15s, color .15s; }
.mem-sino button:hover { color: var(--text); }
.mem-sino button.si.on { background: var(--green-soft); color: var(--green); box-shadow: inset 0 0 0 1px var(--green-border); }
.mem-sino button.no.on { background: var(--panel-2); color: var(--text); box-shadow: inset 0 0 0 1px var(--border-2); }
.mem-equipo .ui-input { min-height: 32px; font-size: 12.5px; }
.mem-mas { padding: 0 18px 16px; }

/* Opciones de la línea (condicionantes) */
.mem-opciones { margin: 0 18px 16px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); overflow: hidden; }
.mem-opciones-cab { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 14px; border-bottom: 1px solid var(--border); }
.mem-opciones-cab b { font-size: 13.5px; font-weight: 650; }
.mem-opciones-cab small { color: var(--dim); font-size: 12px; }
.mem-opcion { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid var(--border); }
.mem-opcion:first-of-type { border-top: 0; }
.mem-opcion-txt { flex: 1; min-width: 0; }
.mem-opcion-txt b { display: block; font-size: 13.5px; font-weight: 600; }
.mem-opcion-txt small { display: block; margin-top: 2px; font-size: 12px; color: var(--dim); line-height: 1.4; }
.mem-opcion-aviso { display: flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 12px; color: var(--violet); font-weight: 600; }
.mem-switch { position: relative; width: 40px; height: 24px; flex-shrink: 0; border: 1px solid var(--border-2); border-radius: 999px; background: var(--panel-2); cursor: pointer; transition: background-color .2s, border-color .2s; padding: 0; }
.mem-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--dim); transition: transform .22s cubic-bezier(.22,1,.36,1), background-color .2s; }
.mem-switch.on { background: var(--blue-soft); border-color: var(--blue-border); }
.mem-switch.on::after { transform: translateX(16px); background: var(--blue); }
.mem-switch:disabled { opacity: .5; cursor: default; }

/* Adicionales */
.mem-adic { display: grid; gap: 14px; padding: 14px 18px 18px; }
.mem-adic-lista { display: grid; border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); overflow: hidden; }
.mem-adic-fila { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid var(--border); min-width: 0; }
.mem-adic-fila:first-child { border-top: 0; }
.mem-adic-fila .img { width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0; background: var(--panel-2) center/cover no-repeat; border: 1px solid var(--border); display: grid; place-items: center; color: var(--subtle); }
.mem-adic-fila .txt { flex: 1; min-width: 0; }
.mem-adic-fila .txt b { display: block; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mem-adic-fila .txt small { display: block; margin-top: 2px; font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mem-adic-fila .cant { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: var(--muted); }
.mem-adic-alta { display: grid; grid-template-columns: minmax(0, 1fr) 84px auto auto; gap: 8px; align-items: center; padding: 12px; border: 1px solid var(--blue-border); border-radius: 14px; background: color-mix(in srgb, var(--blue) 5%, transparent); }
.mem-adic-alta .ui-input { min-height: 38px; font-size: 13.5px; }
.mem-adic-buscar { position: relative; min-width: 0; }
.mem-adic-vinculo { display: flex; align-items: center; gap: 8px; grid-column: 1 / -1; font-size: 12px; color: var(--teal); font-weight: 600; }
.mem-cat { position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 40; display: grid; padding: 5px; border: 1px solid var(--border-2); border-radius: 13px; background: var(--panel-solid); box-shadow: var(--elev-2); animation: mem-aparece .14s ease both; }
.mem-cat-tit { padding: 6px 9px 4px; font-size: 11px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; color: var(--subtle); }
.mem-cat-op { display: flex; align-items: center; gap: 10px; padding: 8px 9px; border: 0; border-radius: 9px; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.mem-cat-op:hover, .mem-cat-op.on { background: var(--panel-2); }
.mem-cat-op .img { width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0; background: var(--panel-2) center/cover no-repeat; border: 1px solid var(--border); }
.mem-cat-op b { display: block; font-size: 13px; font-weight: 600; }
.mem-cat-op small { display: block; font-size: 11.5px; color: var(--dim); }
.mem-sueltos { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12.5px; color: var(--dim); }

/* Avisos dentro de la ficha */
.mem-aviso { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border: 1px solid var(--t-borde); border-radius: 14px; background: var(--t-soft); font-size: 13px; color: var(--text); line-height: 1.45; }
.mem-aviso > svg { color: var(--t); flex-shrink: 0; }
.mem-aviso .txt { flex: 1; min-width: 220px; }
.mem-aviso .txt small { display: block; color: var(--dim); font-size: 12px; }

/* Últimos cambios */
.mem-cambios { display: grid; padding: 6px 18px 14px; }
.mem-cambio { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; padding: 9px 0; border-top: 1px solid var(--border); font-size: 13px; }
.mem-cambio:first-child { border-top: 0; }
.mem-cambio b { font-weight: 600; }
.mem-cambio .de { color: var(--subtle); text-decoration: line-through; }
.mem-cambio .a { color: var(--text); }
.mem-cambio small { grid-column: 1 / -1; color: var(--subtle); font-size: 11.5px; }
.mem-cambio time { color: var(--subtle); font-size: 11.5px; white-space: nowrap; }

/* ── Panel para elegir ── */
.mem-panel-fondo { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 8000; display: flex; justify-content: flex-end; background: color-mix(in srgb, var(--bg) 45%, transparent); animation: mem-aparece .16s ease both; color: var(--text); font-family: 'Outfit', system-ui, sans-serif; }
.mem-panel { width: min(520px, 100%); height: 100%; display: flex; flex-direction: column; border-left: 1px solid var(--border-2); background: var(--panel-solid); box-shadow: var(--elev-2); animation: mem-entra .28s cubic-bezier(.22,1,.36,1) both; }
.mem-panel-cab { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid var(--border); }
.mem-panel-cab h2 { margin: 3px 0 0; font-size: 21px; font-weight: 700; letter-spacing: -.01em; }
.mem-panel-cuerpo { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px 20px; display: grid; gap: 16px; align-content: start; animation: mem-aparece .18s ease both; }
.mem-panel-pie { display: flex; align-items: center; gap: 6px; padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); }
.mem-panel-pie .mono { font-size: 11.5px; opacity: .8; }

.mem-ops-grupo { display: grid; gap: 8px; }
.mem-ops { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.mem-ops.muestras { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
.mem-op {
  position: relative; display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 12px;
  border: 1px solid var(--border); border-radius: 11px; background: var(--panel); color: var(--text);
  font: inherit; font-size: 13.5px; font-weight: 600; text-align: left; cursor: pointer; overflow: hidden;
  transition: border-color .15s, background-color .15s, transform .12s;
}
.mem-op:hover { border-color: var(--border-2); background: var(--panel-2); }
.mem-op:active { transform: scale(.98); }
.mem-op.on { border-color: var(--blue); background: var(--blue-soft); box-shadow: inset 0 0 0 1px var(--blue); }
.mem-op .ok { margin-left: auto; color: var(--blue); flex-shrink: 0; }
.mem-op.con-muestra { flex-direction: column; align-items: stretch; gap: 0; padding: 0; min-height: 0; }
.mem-op.con-muestra .nom { padding: 8px 10px 9px; font-size: 12.5px; line-height: 1.3; }
.mem-op.con-muestra .ok { position: absolute; top: 7px; right: 7px; padding: 3px; border-radius: 50%; background: var(--blue); color: #fff; }
.mem-otro { display: grid; grid-template-columns: 52px minmax(0, 1fr); align-items: center; gap: 10px; }
.mem-otro > span { font-size: 12.5px; font-weight: 600; color: var(--dim); }
.mem-otro .ui-input { min-height: 38px; font-size: 13.5px; }
.mem-otro.on .ui-input { border-color: var(--blue-border); }
.mem-no-lleva { justify-self: start; display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 12px; border: 1px dashed var(--border-2); border-radius: 10px; background: transparent; color: var(--dim); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.mem-no-lleva:hover { color: var(--text); }
.mem-no-lleva.on { border-style: solid; color: var(--text); background: var(--panel-2); }
.mem-chips-elegir { display: flex; flex-wrap: wrap; gap: 6px; }
.mem-seg.ancho { display: flex; width: 100%; }
.mem-seg.ancho button { flex: 1; justify-content: center; min-height: 34px; }
.mem-lugar { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.mem-lugar-cab { display: flex; align-items: baseline; gap: 10px; }
.mem-lugar-cab b { font-size: 14px; }
.mem-lugar-cab span { font-size: 12.5px; color: var(--blue); font-weight: 600; }
.mem-lugar .ui-input.chico { min-height: 34px; font-size: 13px; }

/* ── Diálogos ── */
.mem-modal-fondo { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 9000; display: grid; place-items: center; padding: 18px; background: var(--overlay); animation: mem-aparece .18s ease both; color: var(--text); font-family: 'Outfit', system-ui, sans-serif; }
.mem-modal { width: min(560px, 100%); max-height: min(86vh, 760px); display: flex; flex-direction: column; border: 1px solid var(--border-2); border-radius: 18px; background: var(--panel-solid); box-shadow: var(--elev-2); overflow: hidden; animation: mem-sube .3s cubic-bezier(.22,1,.36,1) both; }
.mem-modal-cab { display: flex; align-items: flex-start; gap: 12px; padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
.mem-modal-cab h2 { font-size: 17px; font-weight: 650; }
.mem-modal-cab p { margin-top: 3px; font-size: 12.5px; color: var(--dim); line-height: 1.45; }
.mem-modal-cuerpo { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 18px; display: grid; gap: 8px; align-content: start; }
.mem-modal-pie { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border); }
.mem-opcion-barco { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, background-color .15s; }
.mem-opcion-barco:hover { border-color: var(--border-2); background: var(--panel-2); }
.mem-opcion-barco.on { border-color: var(--blue-border); background: var(--blue-soft); }
.mem-opcion-barco .cod { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 650; min-width: 64px; }
.mem-opcion-barco .txt { flex: 1; min-width: 0; font-size: 12.5px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.mem-showroom { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 9000; overflow-y: auto; background: var(--bg); }
.mem-showroom-cerrar { position: fixed; top: 14px; right: 16px; z-index: 2; }

@keyframes mem-aparece { from { opacity: 0; } to { opacity: 1; } }
@keyframes mem-sube { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes mem-entra { from { transform: translateX(28px); opacity: .4; } to { transform: none; opacity: 1; } }
@keyframes mem-late { from { opacity: .45; } to { opacity: 1; } }

@media (max-width: 1100px) {
  .mem-ficha { grid-template-columns: minmax(0, 1fr); }
  .mem-indice { display: none; }
  .mem-indice-cab { display: flex; }
}
@media (max-width: 899px) {
  .mem-pagina { padding: 14px 14px 48px; }
  .mem-herr-cab { display: none; }
  .mem-herr-pie { display: flex; }
  .mem-volver { padding: 0 8px; }
  .mem-volver .txt { display: none; }
  .mem-ficha-fila { flex-wrap: nowrap; gap: 8px; }
  .mem-ficha-tit { flex-wrap: nowrap; overflow: hidden; }
  .mem-avance { gap: 8px 10px; }
  .mem-avance .mem-barra { flex: 1 1 120px; }
  .mem-guardado { font-size: 11.5px; }
  .mem-h1 { font-size: 22px; }
  .mem-ficha-cab { padding: 10px 14px; }
  .mem-ficha { padding: 12px 14px 56px; }
  .mem-ficha-tit .cod { font-size: 20px; }
  .mem-ficha-tit .cli { max-width: 100%; font-size: 14px; }
  .mem-seccion-cab { padding: 12px 14px; }
  .mem-seccion-cab .usan { margin-left: 0; width: 100%; }
  .mem-equipos { grid-template-columns: minmax(0, 1fr); padding: 12px 14px 14px; }
  .mem-adic { padding: 12px 14px 16px; }
  .mem-adic-alta { grid-template-columns: minmax(0, 1fr) 76px; }
  .mem-adic-alta > .seg-tipo, .mem-adic-alta > .ui-btn { grid-column: span 1; }
  .mem-opciones { margin: 0 14px 14px; }
  .mem-tarjetas { grid-template-columns: minmax(0, 1fr); }
  .mem-modal-fondo { place-items: end stretch; padding: 0; }
  .mem-panel-fondo { align-items: flex-end; }
  .mem-panel { width: 100%; height: 92vh; border-left: 0; border-top: 1px solid var(--border-2); border-radius: 20px 20px 0 0; animation-name: mem-sube; }
  .mem-panel-cab { padding: 14px 16px 12px; }
  .mem-panel-cuerpo { padding: 14px 16px 18px; }
  .mem-panel-pie { padding-left: 16px; padding-right: 16px; }
  .mem-ops, .mem-ops.muestras { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mem-defs { grid-template-columns: minmax(0, 1fr); padding: 12px 14px 14px; }
  .mem-cliente { grid-template-columns: minmax(0, 1fr); padding: 12px 14px 14px; }
  .mem-notas { padding: 12px 14px 0; }
  .mem-modal { width: 100%; max-height: 90vh; border-radius: 20px 20px 0 0; padding-bottom: env(safe-area-inset-bottom); }
  .mem-ocultar-chico { display: none !important; }
}
`;
