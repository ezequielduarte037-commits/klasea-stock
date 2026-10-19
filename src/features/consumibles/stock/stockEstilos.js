/**
 * Estilos de Stock y reposición. Todo con la clase `.stk` (raíz de la pestaña
 * y capa de la ficha, que va en un portal). PC primero, con versión celular
 * en tarjetas. Bajo el mínimo en cian, negativo en rojo, cantidades en teal.
 */
export const CSS_STOCK = `
  .stk { font-family: 'Outfit', system-ui, sans-serif; color: var(--text); }
  .stk .stk-num { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .stk .stk-dim { color: var(--dim); }
  .stk .is-num { text-align: right; justify-content: flex-end; }
  .stk .is-negativo { color: var(--red); }
  .stk .stk-girando { animation: stk-giro .8s linear infinite; }
  @keyframes stk-giro { to { transform: rotate(360deg); } }

  .stk.stk-root { max-width: 1500px; margin: 0 auto; padding: 14px 20px 40px; }
  .stk .stk-barra { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .stk .stk-barra-der { margin-left: auto; display: flex; gap: 8px; }
  .stk .stk-vistas { display: inline-flex; padding: 3px; gap: 3px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
  .stk .stk-vistas > button {
    display: inline-flex; align-items: center; gap: 7px;
    min-height: 36px; padding: 0 14px; border: 0; border-radius: 9px;
    background: transparent; color: var(--dim); font: inherit; font-size: 13.5px; font-weight: 500;
  }
  .stk .stk-vistas > button.is-activa { background: var(--panel-solid); color: var(--text); font-weight: 600; box-shadow: var(--elev-1); }
  .stk .stk-cuenta {
    min-width: 22px; height: 20px; padding: 0 6px; display: inline-grid; place-items: center;
    border-radius: 999px; background: var(--cyan-soft); color: var(--cyan); font-size: 11.5px; font-weight: 600;
  }

  .stk .stk-filtros { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .stk .stk-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  .stk .stk-chips::-webkit-scrollbar { display: none; }
  .stk .stk-chip {
    flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px;
    min-height: 34px; padding: 0 12px;
    border: 1px solid var(--border-2); border-radius: 999px; background: var(--panel);
    color: var(--muted); font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap;
  }
  .stk .stk-chip .stk-num { font-size: 11.5px; color: var(--dim); }
  .stk .stk-chip.is-activa { background: var(--blue-soft); border-color: var(--blue-border); color: var(--blue); font-weight: 600; }
  .stk .stk-chip.is-activa .stk-num { color: var(--blue); }
  .stk .stk-chip.is-rojo .stk-num { color: var(--red); }
  .stk .stk-buscar { position: relative; flex: 1; min-width: 200px; max-width: 360px; }
  .stk .stk-buscar .ui-input { padding-left: 34px; padding-right: 34px; }
  .stk .stk-buscar .ui-input::-webkit-search-cancel-button { display: none; }
  .stk .stk-buscar-ico { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
  .stk .stk-buscar-x { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); width: 34px; height: 34px; display: grid; place-items: center; border: 0; background: transparent; color: var(--dim); border-radius: 8px; }
  .stk .stk-rubro { width: auto; min-width: 170px; max-width: 240px; }

  /* ── Tabla ─────────────────────────────────────────────────────────── */
  .stk .stk-tabla { margin-top: 12px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--panel-solid); overflow: hidden; }
  .stk .stk-fila {
    display: grid; align-items: center; column-gap: 12px;
    grid-template-columns: minmax(220px, 1fr) 92px 120px 80px 86px 86px 96px 100px;
    min-height: 52px; padding: 4px 14px;
    border-bottom: 1px solid var(--border);
  }
  .stk .stk-fila:last-child { border-bottom: 0; }
  .stk .stk-fila.is-cab {
    position: sticky; top: 0; z-index: 1; min-height: 40px;
    background: var(--panel-solid-2); color: var(--dim);
    font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
  }
  .stk .stk-fila.is-cab > * { display: inline-flex; align-items: center; gap: 4px; }
  .stk .stk-fila.is-cab > button { border: 0; padding: 0; background: transparent; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; }
  .stk .stk-fila.is-cab > button:hover { color: var(--text); }
  .stk .stk-fila.is-bajo { background: linear-gradient(90deg, var(--cyan-soft), transparent 45%); }
  .stk .stk-fila.is-negativo { background: linear-gradient(90deg, var(--red-soft), transparent 45%); }
  .stk .stk-prod {
    display: flex; align-items: center; gap: 10px; min-width: 0;
    padding: 6px 0; border: 0; background: transparent; color: var(--text); font: inherit; text-align: left;
  }
  .stk .stk-prod-texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
  .stk .stk-ficha-imagen { display: flex; justify-content: center; }
  .stk .stk-prod-desc { font-size: 14px; font-weight: 500; line-height: 1.25; }
  .stk .stk-prod:hover .stk-prod-desc { color: var(--blue); }
  .stk .stk-prod-meta { font-size: 12px; color: var(--dim); }
  .stk .c-ubic { font-size: 13px; }
  .stk .stk-stock { font-size: 15px; font-weight: 600; color: var(--teal); }
  .stk .stk-stock.is-bajo { color: var(--cyan); }
  .stk .stk-stock.is-negativo { color: var(--red); }
  .stk .stk-sin-contar { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 1px; font-size: 12.5px; color: var(--dim); }
  .stk .stk-sin-contar small { font-size: 11px; color: var(--violet); }
  .stk .c-conteo { font-size: 12.5px; }
  .stk .c-cons { font-size: 13.5px; }
  .stk .stk-sin { padding: 28px; text-align: center; color: var(--dim); }

  .stk .stk-editable {
    min-width: 64px; min-height: 34px; padding: 0 8px;
    border: 1px dashed transparent; border-radius: 8px; background: transparent;
    color: var(--text); font-size: 13.5px; text-align: right;
  }
  .stk .stk-editable:hover { border-color: var(--border-2); background: var(--panel); }
  .stk .stk-editable.is-vacio { color: var(--subtle); }
  .stk .stk-sug { font-size: 11.5px; color: var(--violet); }
  .stk .stk-input { min-height: 34px; height: 34px; padding: 0 8px; text-align: right; font-size: 13.5px; }
  .stk .stk-input.is-guardando { opacity: .55; }

  .stk .stk-vacio { max-width: 520px; margin: 32px auto; padding: 26px; text-align: center; color: var(--muted); }
  .stk .stk-vacio svg { color: var(--blue); }
  .stk .stk-vacio h3 { margin: 10px 0 6px; font-size: 17px; font-weight: 650; color: var(--text); }
  .stk .stk-vacio p { margin: 0 0 16px; line-height: 1.45; }

  /* ── Pedido sugerido ───────────────────────────────────────────────── */
  .stk .stk-pedido { display: flex; flex-direction: column; gap: 14px; margin-top: 14px; }
  .stk .stk-grupo { overflow: hidden; }
  .stk .stk-grupo-cab { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 16px; border-bottom: 1px solid var(--border); }
  .stk .stk-grupo-tit { flex: 1; min-width: 200px; }
  .stk .stk-grupo-tit h3 { margin: 0 0 2px; font-size: 16px; font-weight: 650; }
  .stk .stk-grupo-tit .stk-dim { font-size: 13px; }
  .stk .stk-grupo-acciones { display: flex; gap: 8px; flex-wrap: wrap; }
  .stk .stk-aviso { margin: 0; padding: 10px 16px; background: var(--cyan-soft); border-bottom: 1px solid var(--border); font-size: 13px; }
  .stk .stk-ped-fila {
    display: grid; align-items: center; column-gap: 12px;
    grid-template-columns: 28px minmax(220px, 1fr) 110px 110px 170px 110px 120px;
    min-height: 54px; padding: 6px 16px; border-bottom: 1px solid var(--border);
  }
  .stk .stk-ped-fila:last-child { border-bottom: 0; }
  .stk .stk-ped-fila.is-cab { min-height: 36px; background: var(--panel-solid-2); color: var(--dim); font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .stk .stk-ped-fila.is-fuera { opacity: .5; }
  .stk .stk-ped-fila > [role="cell"] { font-size: 13.5px; }
  .stk .stk-ped-fila small { color: var(--dim); font-size: 11.5px; }
  .stk .stk-ped-check input { width: 18px; height: 18px; accent-color: var(--blue); }
  .stk .stk-ped-prod { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .stk .stk-ped-prod .stk-dim { font-size: 12px; }
  .stk .stk-link { padding: 0; border: 0; background: transparent; color: var(--text); font: inherit; font-weight: 500; text-align: left; }
  .stk .stk-link:hover { color: var(--blue); }
  .stk .stk-ped-fila .stk-input { width: 72px; display: inline-block; }
  .stk .stk-ped-unidad { display: block; margin-top: 2px; }
  .stk .stk-ped-sub { font-weight: 600; }

  /* ── Ficha (hoja lateral) ──────────────────────────────────────────── */
  .stk .stk-ficha { display: flex; flex-direction: column; gap: 14px; }
  .stk .stk-lbl { display: block; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dim); }
  .stk .stk-ficha-stocks { display: grid; grid-template-columns: 1.3fr 1fr 1.2fr; gap: 10px; }
  .stk .stk-ficha-stock { display: flex; flex-direction: column; gap: 2px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
  .stk .stk-ficha-stock .stk-dim { font-size: 12px; }
  .stk .stk-ficha-grande { font-size: 28px; font-weight: 700; color: var(--teal); line-height: 1.1; }
  .stk .stk-ficha-grande.is-negativo { color: var(--red); }
  .stk .stk-ficha-media { font-size: 20px; font-weight: 600; line-height: 1.2; }
  .stk .stk-ficha-limites { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .stk .stk-campo { display: flex; flex-direction: column; gap: 5px; }
  .stk .stk-campo .stk-input { height: 40px; min-height: 40px; font-size: 15px; }
  .stk .stk-sugerido { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 9px 12px; border: 1px solid var(--violet-border); border-radius: 10px; background: var(--violet-soft); font-size: 13px; }
  .stk .stk-sugerido .stk-dim { font-size: 12px; }
  .stk .stk-usar { margin-left: auto; min-height: 32px; }
  .stk .stk-costo { grid-column: 1 / -1; font-size: 12.5px; }
  .stk .stk-ficha-tit { margin: 6px 0 0; font-size: 14px; font-weight: 650; }
  .stk .stk-error { color: var(--red); font-size: 13px; }
  .stk .stk-movs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .stk .stk-mov { padding: 10px 0; border-bottom: 1px solid var(--border); }
  .stk .stk-mov.is-anulado { opacity: .6; }
  .stk .stk-mov.is-anulado .stk-mov-cant { text-decoration: line-through; }
  .stk .stk-mov-fila { display: flex; align-items: center; gap: 8px; }
  .stk .stk-mov-fecha { font-size: 12.5px; color: var(--dim); }
  .stk .stk-mov-cant { margin-left: auto; font-size: 15px; font-weight: 600; }
  .stk .stk-mov-cant.is-suma { color: var(--green); }
  .stk .stk-mov-cant.is-resta { color: var(--text); }
  .stk .stk-mov-detalle { margin-top: 4px; font-size: 13px; color: var(--muted); }
  .stk .stk-mov-nota { margin-top: 3px; font-size: 12.5px; color: var(--dim); font-style: italic; }
  .stk .stk-mov-anulado { margin-top: 4px; font-size: 12.5px; color: var(--red); }
  .stk .stk-mov-anular { min-height: 30px; padding: 0 8px; margin-top: 4px; font-size: 12.5px; }
  .stk .stk-anular { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
  .stk .stk-anular-btns { display: flex; gap: 8px; justify-content: flex-end; }
  .stk .stk-tag {
    display: inline-flex; align-items: center; min-height: 22px; padding: 0 8px;
    border: 1px solid var(--blue-border); border-radius: 999px; background: var(--blue-soft);
    color: var(--blue); font-size: 11.5px; font-weight: 600;
  }
  .stk .stk-tag[data-tono="violeta"] { border-color: var(--violet-border); background: var(--violet-soft); color: var(--violet); }
  .stk .stk-tag[data-tono="verde"] { border-color: var(--green-border); background: var(--green-soft); color: var(--green); }
  .stk .stk-tag[data-tono="teal"] { border-color: var(--teal-border); background: var(--teal-soft); color: var(--teal); }
  .stk .stk-tag[data-tono="rojo"] { border-color: var(--red-border); background: var(--red-soft); color: var(--red); }
  .stk .stk-tag[data-tono="gris"] { border-color: var(--border-2); background: var(--panel-2); color: var(--muted); font-weight: 500; }

  /* ── Celular ───────────────────────────────────────────────────────── */
  @media (max-width: 899px) {
    .stk.stk-root { padding: 12px 12px 32px; }
    .stk .stk-filtros { flex-direction: column; align-items: stretch; }
    .stk .stk-buscar { max-width: none; }
    .stk .stk-rubro { max-width: none; width: 100%; }
    .stk .stk-tabla { border: 0; background: transparent; overflow: visible; }
    .stk .stk-fila.is-cab { display: none; }
    .stk .stk-fila {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-areas: "prod prod prod stock" "min max cons otra" "ubic ubic conteo conteo";
      row-gap: 8px; column-gap: 8px;
      margin-bottom: 8px; padding: 10px 12px;
      border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid);
    }
    .stk .stk-fila:last-child { border-bottom: 1px solid var(--border); }
    .stk .c-prod { grid-area: prod; }
    .stk .c-stock { grid-area: stock; }
    .stk .c-min { grid-area: min; }
    .stk .c-max { grid-area: max; }
    .stk .c-cons { grid-area: cons; }
    .stk .c-otra { grid-area: otra; }
    .stk .c-ubic { grid-area: ubic; }
    .stk .c-conteo { grid-area: conteo; }
    .stk .stk-fila > [data-lbl] { text-align: left; }
    .stk .stk-fila > [data-lbl]::before {
      content: attr(data-lbl); display: block; margin-bottom: 2px;
      font-family: 'Outfit', system-ui, sans-serif; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dim);
    }
    .stk .stk-fila > .c-stock { text-align: right; }
    .stk .stk-editable { min-height: 38px; text-align: left; padding: 0 6px; border-color: var(--border); }
    .stk .stk-input { text-align: left; min-height: 38px; height: 38px; }

    .stk .stk-ped-fila.is-cab { display: none; }
    .stk .stk-ped-fila {
      grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: "chk prod prod" "chk a b" "chk c c" "chk e f";
      row-gap: 6px; padding: 12px;
    }
    .stk .stk-ped-fila > :nth-child(1) { grid-area: chk; align-self: start; }
    .stk .stk-ped-fila > :nth-child(2) { grid-area: prod; }
    .stk .stk-ped-fila > :nth-child(3) { grid-area: a; }
    .stk .stk-ped-fila > :nth-child(4) { grid-area: b; }
    .stk .stk-ped-fila > :nth-child(5) { grid-area: c; }
    .stk .stk-ped-fila > :nth-child(6) { grid-area: e; }
    .stk .stk-ped-fila > :nth-child(7) { grid-area: f; }
    .stk .stk-ped-fila > [data-lbl] { text-align: left; }
    .stk .stk-ped-fila > [data-lbl]::before {
      content: attr(data-lbl); display: block; margin-bottom: 2px;
      font-family: 'Outfit', system-ui, sans-serif; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dim);
    }
    .stk .stk-grupo-acciones { width: 100%; }
    .stk .stk-grupo-acciones > * { flex: 1; }
    .stk .stk-ficha-stocks { grid-template-columns: 1fr 1fr; }
    .stk .stk-ficha-stocks > :first-child { grid-column: 1 / -1; }
  }
`;
