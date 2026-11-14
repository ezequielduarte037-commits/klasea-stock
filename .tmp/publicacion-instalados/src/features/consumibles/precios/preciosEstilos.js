export const PRECIOS_CSS = `
  .precios-root { width: 100%; min-width: 0; padding: 22px 26px 36px; font-family: 'Outfit', sans-serif; color: var(--text); }
  .precios-root h2 { margin: 0; font-size: 19px; font-weight: 650; letter-spacing: -.02em; overflow-wrap: anywhere; }
  .precios-root h3 { margin: 0; font-size: 15px; font-weight: 650; }
  .precios-root p { line-height: 1.5; }
  .precios-root .precios-num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
  .precios-root .precios-ayuda { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .precios-root .precios-encabezado, .precios-root .precios-titulo-fila { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
  .precios-root .precios-encabezado { margin-bottom: 18px; }
  .precios-root .precios-titulo-fila { margin-bottom: 14px; }
  .precios-root .precios-titulo-fila > div { min-width: 0; }
  .precios-root .precios-acciones { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .precios-root .ui-btn { min-height: 40px; font-weight: 600; }
  .precios-root .ui-input { width: 100%; min-width: 0; min-height: 40px; }
  .precios-root .precios-panel { background: var(--panel-solid); border: 1px solid var(--border); border-radius: 14px; padding: 18px; min-width: 0; box-shadow: var(--elev-1); }
  .precios-root .precios-layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 16px; align-items: start; }
  .precios-root .precios-contenido { min-width: 0; display: grid; gap: 16px; }
  .precios-root .precios-label { display: grid; gap: 6px; font-size: 12px; color: var(--muted); margin: 14px 0; }
  .precios-root .precios-listas-scroll { max-height: 660px; overflow-y: auto; margin: 0 -18px -18px; border-radius: 0 0 14px 14px; }
  .precios-root .precios-lista { display: grid; gap: 6px; width: 100%; border: 0; border-top: 1px solid var(--border); border-left: 3px solid transparent; border-radius: 0; padding: 14px 15px; background: transparent; color: var(--text); font-family: inherit; text-align: left; transition: background .15s, border-color .15s; }
  .precios-root .precios-lista:hover { background: var(--panel-2); }
  .precios-root .precios-lista.is-activa { border-left-color: var(--blue); background: var(--blue-soft); }
  .precios-root .precios-lista strong { font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
  .precios-root .precios-lista span { font-size: 11px; color: var(--muted); }
  .precios-root .precios-lista small { font-size: 10px; color: var(--dim); overflow-wrap: anywhere; }
  .precios-root .precios-selector-celular { display: none; }
  .precios-root .precios-metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 14px; margin: 0; }
  .precios-root .precios-metadata dt { color: var(--muted); font-size: 11px; margin-bottom: 6px; }
  .precios-root .precios-metadata dd { margin: 0; font-size: 12px; font-weight: 500; overflow-wrap: anywhere; }
  .precios-root .precios-pasar { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 13px; }
  .precios-root .precios-pasar > div:first-child { flex: 1; min-width: 180px; }
  .precios-root .precios-pasar > .precios-error, .precios-root .precios-pasar > .precios-aviso { width: 100%; }
  .precios-root .precios-aviso, .precios-root .precios-error { padding: 11px 13px; border: 1px solid var(--cyan-border); border-radius: 10px; background: var(--cyan-soft); color: var(--cyan); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .precios-root .precios-error { border-color: var(--red-border); background: var(--red-soft); color: var(--red); }
  .precios-root .precios-error .ui-btn { margin-top: 10px; }
  .precios-root .precios-resumen { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 0 16px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .precios-root .precios-resumen > div { padding: 12px; border-right: 1px solid var(--border); min-width: 0; }
  .precios-root .precios-resumen > div:last-child { border-right: 0; }
  .precios-root .precios-resumen span { display: block; color: var(--muted); font-size: 11px; line-height: 1.35; }
  .precios-root .precios-resumen strong { display: block; font-size: 19px; margin-top: 7px; font-weight: 600; }
  .precios-root .precios-resumen small { display: block; color: var(--dim); font-size: 10px; line-height: 1.4; margin-top: 5px; }
  .precios-root .precios-filtros { display: flex; gap: 8px; margin-bottom: 12px; }
  .precios-root .precios-filtros > select { max-width: 210px; }
  .precios-root .precios-buscar { position: relative; min-width: 0; flex: 1; }
  .precios-root .precios-buscar > svg { position: absolute; top: 12px; left: 12px; color: var(--muted); }
  .precios-root .precios-buscar input { padding-left: 36px; }
  .precios-root .precios-orden-celular { display: none; }
  .precios-root .precios-tabla { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
  .precios-root .precios-tabla th { text-align: left; color: var(--muted); font-weight: 500; border-bottom: 1px solid var(--border); }
  .precios-root .precios-tabla th:nth-child(1) { width: 12%; }
  .precios-root .precios-tabla th:nth-child(2) { width: 29%; }
  .precios-root .precios-tabla th:nth-child(3) { width: 15%; }
  .precios-root .precios-tabla th:last-child:nth-child(7) { width: 42px; }
  .precios-root .precios-tabla th button { display: inline-flex; align-items: center; gap: 4px; min-height: 40px; border: 0; padding: 0 3px; background: transparent; color: inherit; font: inherit; }
  .precios-root .precios-tabla td { padding: 12px 4px; border-bottom: 1px solid var(--border); vertical-align: middle; overflow-wrap: anywhere; }
  .precios-root .precios-tabla td small { display: block; color: var(--dim); margin-top: 4px; font-family: 'Outfit', sans-serif; font-size: 10px; }
  .precios-root .precios-tabla .precios-producto { font-size: 12px; font-weight: 500; }
  .precios-root .precios-tabla .precios-vinculado { color: var(--teal); }
  .precios-root .precios-estado { display: inline-block; padding: 4px 6px; border-radius: 6px; font-size: 10px; font-weight: 500; line-height: 1.3; }
  .precios-root .precios-paginado { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 14px; }
  .precios-root .precios-paginado > div { display: flex; gap: 6px; }
  .precios-root .precios-vacio { padding: 30px 14px; text-align: center; color: var(--muted); font-size: 13px; }
  .precios-root .precios-vacio > svg { margin-bottom: 12px; color: var(--blue); }
  .precios-root .precios-vacio p { margin-bottom: 0; }
  .precios-root .precios-grafico { width: 100%; min-width: 0; height: 200px; }
  .precios-root .precios-historial-lista { max-height: 220px; overflow: auto; margin-top: 12px; }
  .precios-root .precios-historial-lista > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); font-size: 11px; }
  .precios-root .precios-historial-lista small { display: block; margin-top: 5px; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .precios-root .precios-historial-lista strong { font-weight: 500; }
  .precios-root .precios-importar { margin-bottom: 18px; border-color: var(--blue-border); }
  .precios-root .precios-campos { border: 0; padding: 0; margin: 0 0 16px; min-width: 0; }
  .precios-root .precios-archivo { position: relative; display: flex; align-items: center; gap: 12px; padding: 18px; border: 1px dashed var(--blue-border); border-radius: 12px; background: var(--blue-soft); color: var(--blue); overflow-wrap: anywhere; }
  .precios-root .precios-archivo > span { min-width: 0; font-weight: 500; }
  .precios-root .precios-archivo > svg { flex-shrink: 0; }
  .precios-root .precios-archivo small { display: block; margin-top: 5px; color: var(--muted); font-weight: 400; }
  .precios-root .precios-archivo input { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .precios-root .precios-archivo:focus-within { outline: 2px solid var(--blue); outline-offset: 2px; }
  .precios-root .precios-form-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1.3fr); gap: 14px; margin: 16px 0 12px; }
  .precios-root .precios-form-grid label { display: grid; gap: 7px; align-content: start; color: var(--muted); font-size: 12px; }
  .precios-root .precios-form-grid small { line-height: 1.5; color: var(--dim); }
  .precios-root .precios-detalles { margin-top: 14px; color: var(--muted); font-size: 12px; }
  .precios-root .precios-detalles summary { min-height: 40px; padding: 10px 0; cursor: pointer; font-weight: 500; }
  .precios-root .precios-detalles ul { max-height: 230px; overflow: auto; margin: 8px 0; padding-left: 22px; }
  .precios-root .precios-detalles li { margin-bottom: 7px; overflow-wrap: anywhere; }
  .precios-root .precios-check { display: flex; align-items: center; gap: 9px; min-height: 44px; }
  .precios-root .precios-check input { accent-color: var(--blue); width: 18px; height: 18px; flex-shrink: 0; }
  .precios-root .precios-guardar { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 18px; }
  .precios-root .precios-guardar .ui-btn { flex-shrink: 0; }
  .precios-root .precios-sr { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); }
  @media (max-width: 1190px) {
    .precios-root .precios-layout { grid-template-columns: 220px minmax(0, 1fr); }
    .precios-root .precios-filtros { flex-wrap: wrap; }
    .precios-root .precios-buscar { flex-basis: 100%; }
  }
  @media (max-width: 980px) {
    .precios-root .precios-layout { grid-template-columns: minmax(0, 1fr); }
    .precios-root .precios-listas-scroll { display: none; }
    .precios-root .precios-selector-celular { display: grid; }
    .precios-root .precios-listas { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
    .precios-root .precios-listas > h3 { grid-column: 1 / -1; }
    .precios-root .precios-listas label { margin: 0; }
  }
  @media (max-width: 700px) {
    .precios-root { padding: 16px 14px 28px; }
    .precios-root .precios-encabezado { flex-wrap: wrap; }
    .precios-root .precios-acciones { width: 100%; justify-content: flex-end; }
    .precios-root .precios-panel { padding: 14px; }
    .precios-root .precios-listas, .precios-root .precios-form-grid { grid-template-columns: minmax(0, 1fr); }
    .precios-root .precios-resumen { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .precios-root .precios-resumen > div:nth-child(2) { border-right: 0; }
    .precios-root .precios-resumen > div:nth-child(-n+2) { border-bottom: 1px solid var(--border); }
    .precios-root .precios-pasar .ui-btn-primario { width: 100%; white-space: normal; }
    .precios-root .precios-filtros > select { flex: 1; max-width: none; }
    .precios-root .precios-filtros > select:first-of-type { flex-basis: 100%; }
    .precios-root .precios-orden-celular { display: inline-flex; }
    .precios-root .precios-tabla thead { display: none; }
    .precios-root .precios-tabla, .precios-root .precios-tabla tbody { display: block; }
    .precios-root .precios-tabla tr { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); position: relative; padding: 14px 0; border-bottom: 1px solid var(--border); gap: 10px 14px; }
    .precios-root .precios-tabla td { display: block; padding: 0; border: 0; min-width: 0; font-size: 12px; }
    .precios-root .precios-tabla td::before { content: attr(data-label); display: block; color: var(--muted); font: 10px 'Outfit', sans-serif; margin-bottom: 5px; }
    .precios-root .precios-tabla .precios-codigo { grid-column: 1 / -1; padding-right: 44px; color: var(--dim); }
    .precios-root .precios-tabla .precios-producto { grid-column: 1 / -1; font-size: 13px; }
    .precios-root .precios-tabla .precios-codigo::before, .precios-root .precios-tabla .precios-producto::before, .precios-root .precios-tabla .precios-historial-accion::before { display: none; }
    .precios-root .precios-tabla .precios-historial-accion { position: absolute; top: 14px; right: 0; }
    .precios-root .precios-paginado, .precios-root .precios-guardar { flex-wrap: wrap; }
    .precios-root .precios-paginado > div { width: 100%; justify-content: flex-end; }
    .precios-root .precios-guardar .ui-btn { width: 100%; }
    .precios-root .precios-grafico { height: 180px; }
  }
`;
