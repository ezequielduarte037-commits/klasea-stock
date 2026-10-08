// Estilos de Revisiones técnicas: todo con el prefijo .rv, sin CSS global.
export const CSS = `
  .rv { position: absolute; top: 0; right: 0; bottom: 0; left: 0; overflow-y: auto; overflow-x: hidden; color: var(--text); }
  .rv-cuerpo { max-width: 1180px; margin: 0 auto; padding: 16px 24px 56px; display: grid; gap: 22px; }
  .rv-error { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--red-border); background: var(--red-soft); color: var(--red); font-size: 13px; }
  .rv-vacio { color: var(--dim); font-size: 13px; padding: 10px 2px; margin: 0; }
  .rv-sec-tit { display: flex; align-items: baseline; gap: 10px; margin: 0 0 10px; font-size: 15px; font-weight: 650; }
  .rv-sec-tit small { font-size: 12.5px; font-weight: 400; color: var(--dim); }

  /* Anillo */
  .rv-anillo { position: relative; display: inline-grid; place-items: center; flex-shrink: 0; }
  .rv-anillo svg { position: absolute; inset: 0; }
  .rv-anillo-centro { position: relative; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; color: var(--text); text-align: center; line-height: 1.1; }
  .rv-anillo.is-completo .rv-anillo-centro { color: var(--green); }

  /* Hoy */
  .rv-hoy { position: relative; overflow: hidden; border-radius: 20px; border: 1px solid var(--border-2); background: var(--panel-solid); box-shadow: var(--elev-2); }
  .rv-hoy-agua { position: absolute; inset: 0; opacity: .55; pointer-events: none; }
  .rv-hoy-dentro { position: relative; padding: 20px 22px 22px; display: grid; gap: 16px; }
  .rv-hoy-top { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
  .rv-hoy-top h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -.01em; }
  .rv-hoy-top p { margin: 3px 0 0; color: var(--dim); font-size: 13px; }
  .rv-hoy-linea { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); padding: 4px 10px; border-radius: 99px; border: 1px solid var(--border-2); background: var(--panel); }
  .rv-misiones { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .rv-mision { display: flex; align-items: center; gap: 13px; min-height: 92px; padding: 14px; text-align: left; border-radius: 16px;
    border: 1px solid var(--border-2); background: color-mix(in srgb, var(--panel-solid) 88%, transparent); color: var(--text); font: inherit; cursor: pointer;
    transition: transform .18s cubic-bezier(.22,1,.36,1), border-color .15s, background-color .15s; }
  .rv-mision:hover { transform: translateY(-2px); border-color: var(--blue-border); }
  .rv-mision.is-hecha { border-color: var(--green-border); background: color-mix(in srgb, var(--green-soft) 60%, var(--panel-solid)); }
  .rv-mision-txt { min-width: 0; display: grid; gap: 3px; }
  .rv-mision-txt small { font-size: 11.5px; color: var(--dim); text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
  .rv-mision-txt b { font-size: 14.5px; font-weight: 600; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .rv-mision-txt span { font-size: 12px; color: var(--muted); }
  .rv-hoy-listo { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--green-border); background: var(--green-soft); color: var(--green); font-size: 13.5px; }
  .rv-hoy-listo div { flex: 1; color: var(--muted); }
  .rv-hoy-listo b { color: var(--green); font-weight: 650; }
  .rv-atrasos { font-size: 12.5px; color: var(--violet); }
  .rv-aviso { padding: 12px 15px; border-radius: 14px; border: 1px solid var(--border); background: var(--panel); color: var(--muted); font-size: 13px; line-height: 1.55; }
  .rv-aviso strong { color: var(--text); font-weight: 600; }

  /* Líneas */
  .rv-lineas { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
  .rv-linea { padding: 16px; display: grid; gap: 12px; border-radius: 16px; border: 1px solid var(--border); background: var(--panel-solid); box-shadow: var(--elev-1); }
  .rv-linea.is-mia { border-color: var(--blue-border); }
  .rv-linea-top { display: flex; align-items: center; gap: 12px; }
  .rv-linea-k { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; line-height: 1; }
  .rv-linea-quien { flex: 1; min-width: 0; display: grid; gap: 3px; }
  .rv-linea-quien small { color: var(--dim); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv-chip-ok { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
  .rv-chip-atraso { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
  .rv-flujos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .rv-flujo { display: grid; gap: 5px; padding: 8px 9px; border-radius: 10px; background: var(--panel); border: 1px solid var(--border); }
  .rv-flujo small { font-size: 11.5px; color: var(--dim); }
  .rv-flujo b { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 600; }
  .rv-mini { height: 4px; border-radius: 99px; background: var(--panel-2); overflow: hidden; }
  .rv-mini i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--blue), var(--cyan)); transition: width .5s cubic-bezier(.22,1,.36,1); }
  .rv-linea-lib { margin: 0; font-size: 12.5px; color: var(--green); line-height: 1.45; }
  .rv-liberar { justify-self: start; }

  /* Riel */
  .rv-riel { position: relative; display: flex; align-items: flex-end; gap: 2px; overflow-x: auto; scrollbar-width: none; padding: 2px 2px 0; }
  .rv-riel::-webkit-scrollbar { display: none; }
  .rv-riel-linea { position: absolute; left: 8px; right: 8px; bottom: 24px; height: 2px; background: var(--border-2); border-radius: 2px; }
  .rv-riel-sem { position: relative; flex: 1 0 22px; min-width: 22px; display: grid; justify-items: center; gap: 4px; padding: 0; border: 0; background: none; color: var(--dim); font: inherit; }
  button.rv-riel-sem { cursor: pointer; }
  .rv-riel-sem i { position: relative; width: 12px; height: 26px; display: flex; align-items: flex-end; justify-content: center; }
  .rv-riel-sem i::after { content: ""; position: absolute; bottom: -3px; width: 10px; height: 10px; border-radius: 50%; background: var(--panel-solid); border: 2px solid var(--border-3); }
  .rv-riel-sem i b { width: 4px; border-radius: 2px; background: color-mix(in srgb, var(--blue) 45%, transparent); margin-bottom: 9px; }
  .rv-riel-sem small { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; line-height: 1; padding-top: 6px; }
  .rv-riel-caja { min-width: 0; display: grid; gap: 6px; }
  .rv-riel-sem.is-desmolde i::after { border-color: var(--cyan); }
  .rv-riel-sem.is-botada i::after { border-color: var(--teal); }
  .rv-riel-sem.is-desmolde small { color: var(--cyan); font-weight: 600; }
  .rv-riel-sem.is-botada small { color: var(--teal); font-weight: 600; }
  .rv-riel-leyenda { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; color: var(--dim); }
  .rv-riel-leyenda span { display: inline-flex; align-items: center; gap: 6px; }
  .rv-riel-leyenda i { width: 9px; height: 9px; border-radius: 50%; border: 2px solid; }
  .rv-riel-leyenda i.is-desmolde { border-color: var(--cyan); }
  .rv-riel-leyenda i.is-botada { border-color: var(--teal); }
  .rv-riel-sem.is-ok i::after { background: var(--green); border-color: var(--green); }
  .rv-riel-sem.is-corregir i::after { background: var(--red); border-color: var(--red); }
  .rv-riel-sem.is-activa i::after { border-color: var(--blue); box-shadow: 0 0 0 4px var(--blue-soft); }
  .rv-riel-sem.is-activa small { color: var(--blue); font-weight: 600; }
  .rv-riel.is-compacto .rv-riel-sem { flex-basis: 14px; min-width: 14px; }
  .rv-riel.is-compacto .rv-riel-sem i { height: 14px; }
  .rv-riel.is-compacto .rv-riel-sem i b { display: none; }
  .rv-riel.is-compacto .rv-riel-sem small { font-size: 9.5px; }
  .rv-riel.is-compacto .rv-riel-sem:not(.is-desmolde):not(.is-botada) small { visibility: hidden; }
  .rv-riel.is-compacto .rv-riel-linea { bottom: 19px; }

  /* Calendario de días */
  .rv-dias { display: grid; gap: 6px; }
  .rv-dia { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 12px; align-items: start; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel-solid); }
  .rv-dia.is-hoy { border-color: var(--blue-border); }
  .rv-dia-fecha { display: grid; gap: 1px; }
  .rv-dia-fecha b { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 600; }
  .rv-dia-fecha small { font-size: 11.5px; color: var(--dim); text-transform: capitalize; }
  .rv-dia-lotes { display: flex; flex-wrap: wrap; gap: 6px; }
  .rv-pill { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; max-width: 100%; padding: 0 11px; border-radius: 99px; border: 1px solid var(--border-2);
    background: var(--panel); color: var(--text); font: inherit; font-size: 12.5px; cursor: pointer; }
  .rv-pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv-pill small { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--dim); }
  .rv-pill:hover { border-color: var(--blue-border); }
  .rv-pill.is-hecha { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
  .rv-pill.is-k { cursor: default; font-family: 'JetBrains Mono', monospace; color: var(--blue); border-color: transparent; background: none; padding: 0 2px; }

  /* Vista de una revisión */
  .rv-vista { min-height: 100%; display: flex; flex-direction: column; }
  .rv-vista-top { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 12px; padding: 12px 18px; background: var(--panel-solid); border-bottom: 1px solid var(--border); }
  .rv-vista-tit { flex: 1; min-width: 0; }
  .rv-vista-tit small { color: var(--dim); font-size: 12px; }
  .rv-vista-tit h1 { margin: 2px 0 0; font-size: 16px; font-weight: 650; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv-vista-num { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 600; color: var(--muted); }
  .rv-barra { height: 3px; background: var(--panel-2); }
  .rv-barra i { display: block; height: 100%; background: linear-gradient(90deg, var(--blue), var(--cyan)); transition: width .4s cubic-bezier(.22,1,.36,1); }
  .rv-vista-cuerpo { width: 100%; max-width: 860px; margin: 0 auto; padding: 16px 18px 64px; display: grid; gap: 12px; }
  .rv-ayuda { color: var(--dim); font-size: 13px; line-height: 1.5; margin: 0; }
  .rv-solo-lectura { margin: 0; font-size: 12.5px; color: var(--violet); }
  .rv-fin { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 15px 16px; border-radius: 14px; border: 1px solid var(--green-border); background: var(--green-soft); color: var(--green); font-size: 13.5px; }
  .rv-fin div { flex: 1; min-width: 200px; color: var(--muted); line-height: 1.5; }
  .rv-fin b { color: var(--green); font-weight: 650; }

  /* Tarjeta de producto (de a una) */
  .rv-foco { display: grid; gap: 12px; }
  .rv-foco > *, .rv-vista-cuerpo > *, .rv-linea > *, .rv-cuerpo > * { min-width: 0; }
  .rv-foco-nav { display: flex; align-items: center; gap: 8px; }
  .rv-puntos { flex: 1; display: flex; flex-wrap: wrap; gap: 3px; }
  .rv-puntos button { flex: 0 0 auto; width: 9px; height: 9px; min-width: 0; min-height: 0; padding: 0; border-radius: 50%; border: 0; background: var(--border-2); cursor: pointer; }
  .rv-puntos button.is-ok { background: var(--green); }
  .rv-puntos button.is-mal { background: var(--red); }
  .rv-puntos button.is-actual { outline: 2px solid var(--blue); outline-offset: 2px; }
  .rv-tarjeta { position: relative; padding: 22px 22px 18px; border-radius: 20px; border: 1px solid var(--border-2); background: var(--panel-solid); box-shadow: var(--elev-2);
    display: grid; gap: 10px; animation: rvEntrar .26s cubic-bezier(.22,1,.36,1); }
  @keyframes rvEntrar { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  .rv-tarjeta-rubro { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .rv-tarjeta h2 { margin: 0; font-size: 21px; font-weight: 650; line-height: 1.3; letter-spacing: -.01em; overflow-wrap: anywhere; }
  .rv-tarjeta-req { font-size: 13px; color: var(--muted); }
  .rv-datos { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-top: 4px; }
  .rv-dato { padding: 9px 11px; border-radius: 12px; background: var(--panel); border: 1px solid var(--border); display: grid; gap: 2px; }
  .rv-dato small { font-size: 11.5px; color: var(--dim); }
  .rv-dato b { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
  .rv-señal { font-size: 12.5px; padding: 8px 11px; border-radius: 10px; line-height: 1.45; }
  .rv-señal.is-uso { color: var(--green); background: var(--green-soft); border: 1px solid var(--green-border); }
  .rv-señal.is-sinuso { color: var(--cyan); background: var(--cyan-soft); border: 1px solid var(--cyan-border); }
  .rv-señal.is-falta { color: var(--violet); background: var(--violet-soft); border: 1px solid var(--violet-border); }
  .rv-decidir { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 6px; }
  .rv-decidir .ui-btn { min-height: 52px; min-width: 0; padding: 8px 12px; font-size: 15px; border-radius: 14px; white-space: normal; text-align: center; line-height: 1.25; }
  .rv-btn-bien { background: var(--green-soft); border-color: var(--green-border); color: var(--green); }
  .rv-btn-bien:hover:not(:disabled) { background: var(--green-soft); border-color: var(--green); }
  .rv-kbd { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; padding: 1px 5px; border-radius: 5px; border: 1px solid currentColor; opacity: .6; }
  .rv-mal { display: grid; gap: 8px; padding: 12px; border-radius: 14px; border: 1px solid var(--red-border); background: var(--red-soft); }
  .rv-mal-opciones { display: flex; flex-wrap: wrap; gap: 7px; }
  .rv-respuesta { display: flex; align-items: center; gap: 8px; padding: 11px 13px; border-radius: 12px; font-size: 13.5px; }
  .rv-respuesta.is-ok { color: var(--green); background: var(--green-soft); border: 1px solid var(--green-border); }
  .rv-respuesta.is-mal { color: var(--red); background: var(--red-soft); border: 1px solid var(--red-border); }
  .rv-respuesta span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .rv-respuesta small { color: var(--dim); }
  .rv-form { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; width: 100%; }
  .rv-form label { display: grid; gap: 4px; font-size: 12px; color: var(--dim); flex: 1; min-width: 140px; }
  .rv-lista-items { display: grid; gap: 6px; }
  .rv-fila { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel-solid); font: inherit; color: var(--text); text-align: left; cursor: pointer; width: 100%; }
  .rv-fila span { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .rv-fila b { font-weight: 500; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv-fila small { font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv-fila .is-ok { color: var(--green); } .rv-fila .is-mal { color: var(--red); }

  /* Condicionante */
  .rv-cond { display: grid; gap: 14px; padding: 20px; border-radius: 20px; border: 1px solid var(--border-2); background: var(--panel-solid); box-shadow: var(--elev-2); }
  .rv-cond-tit { display: grid; gap: 6px; }
  .rv-cond-tit h2 { margin: 0; font-size: 21px; font-weight: 650; letter-spacing: -.01em; }
  .rv-cond-tit p { margin: 0; font-size: 14px; color: var(--muted); line-height: 1.5; }
  .rv-ejemplo { font-size: 12.5px; color: var(--muted); padding: 9px 12px; border-radius: 12px; background: var(--panel); border: 1px dashed var(--border-2); }
  .rv-campo { display: grid; gap: 6px; font-size: 12.5px; color: var(--dim); }
  .rv-segmentos { display: flex; flex-wrap: wrap; gap: 5px; }
  .rv-seg { min-height: 36px; padding: 0 12px; border-radius: 99px; border: 1px solid var(--border-2); background: var(--panel); color: var(--muted); font: inherit; font-size: 12.5px; cursor: pointer; }
  .rv-seg[aria-pressed="true"] { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); font-weight: 600; }
  .rv-cond-items { display: grid; gap: 7px; }
  .rv-cond-item { display: grid; grid-template-columns: minmax(0, 1fr) auto 86px 38px; gap: 8px; align-items: center; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); }
  .rv-cond-item > span { font-size: 13px; overflow-wrap: anywhere; }
  .rv-cond-item .ui-input { min-height: 36px; }
  .rv-resultados { display: grid; gap: 4px; max-height: 260px; overflow-y: auto; }
  .rv-resultado { display: grid; gap: 1px; padding: 8px 11px; min-height: 42px; text-align: left; border-radius: 10px; border: 1px solid var(--border); background: var(--panel); color: var(--text); font: inherit; cursor: pointer; }
  .rv-resultado span { font-size: 13px; } .rv-resultado small { font-size: 11.5px; color: var(--dim); }
  .rv-resultado:hover { border-color: var(--blue-border); }
  .rv-accion-chip { font-size: 11.5px; padding: 2px 8px; border-radius: 99px; border: 1px solid var(--border-2); color: var(--muted); white-space: nowrap; }
  .rv-accion-chip.is-extra { color: var(--green); border-color: var(--green-border); }
  .rv-accion-chip.is-quita { color: var(--red); border-color: var(--red-border); }
  .rv-accion-chip.is-matriz { color: var(--blue); border-color: var(--blue-border); }
  .rv-pie { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

  /* Semana del plan */
  .rv-plan-riel { padding: 14px 14px 8px; border-radius: 16px; border: 1px solid var(--border); background: var(--panel-solid); }
  .rv-etapa { display: grid; gap: 9px; padding: 14px 15px; border-radius: 16px; border: 1px solid var(--border); background: var(--panel-solid); }
  .rv-etapa-top { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
  .rv-etapa-top h3 { margin: 0; flex: 1; min-width: 160px; font-size: 15px; font-weight: 600; line-height: 1.3; }
  .rv-etapa-span { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--muted); padding: 3px 8px; border-radius: 99px; background: var(--panel); border: 1px solid var(--border); white-space: nowrap; }
  .rv-etapa-sub { font-size: 11.5px; color: var(--dim); text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
  .rv-tareas { margin: 0; padding-left: 18px; display: grid; gap: 2px; font-size: 13px; color: var(--muted); }
  .rv-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .rv-chip-mat { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; min-height: 30px; padding: 0 4px 0 10px; border-radius: 99px; border: 1px solid var(--teal-border); background: var(--teal-soft); color: var(--text); font-size: 12.5px; }
  .rv-chip-mat span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv-chip-mat button { width: 26px; height: 26px; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--dim); cursor: pointer; }
  .rv-chip-mat button:hover { color: var(--red); background: var(--red-soft); }
  .rv-sin-ubicar { display: grid; gap: 8px; padding: 14px; border-radius: 16px; border: 1px dashed var(--violet-border); background: color-mix(in srgb, var(--violet-soft) 50%, transparent); }
  .rv-sin-ubicar-fila { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .rv-sin-ubicar-fila > span { flex: 1; min-width: 150px; font-size: 13.5px; }
  .rv-mini-input { width: 72px; min-height: 36px; }

  @media (max-width: 760px) {
    .rv-misiones { grid-template-columns: 1fr; }
    .rv-mision { min-height: 74px; }
  }
  @media (max-width: 640px) {
    .rv-cuerpo { padding: 12px 14px 44px; gap: 18px; }
    .rv-hoy-dentro { padding: 16px; }
    .rv-hoy-top h2 { font-size: 19px; }
    .rv-hoy-linea { margin-left: 0; }
    .rv-vista-top { padding: 10px 12px; }
    .rv-vista-cuerpo { padding: 12px 12px 52px; }
    .rv-tarjeta { padding: 18px 16px 16px; }
    .rv-tarjeta h2 { font-size: 18px; }
    .rv-dia { grid-template-columns: 58px minmax(0, 1fr); gap: 10px; }
    .rv-cond { padding: 16px; }
    .rv-cond-item { grid-template-columns: minmax(0, 1fr) 76px 38px; }
    .rv-cond-item .rv-segmentos { grid-column: 1 / -1; }
  }
  @media (prefers-reduced-motion: reduce) { .rv-tarjeta { animation: none; } }
`;
