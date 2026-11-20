// Lo propio del mostrador de ingresos, encima de CSS_MOSTRADOR y CSS_PANOL.
// Todo bajo `.mst.ing`; sólo tokens del tema, nada de ámbar.

export const CSS_INGRESO = `
.mst.ing .ing-total { color: var(--green); }
.mst.ing .ing-ayuda { display: flex; align-items: center; gap: 8px; margin: 14px 2px 0; font-size: 12.5px; color: var(--dim); line-height: 1.45; }
.mst.ing .ing-ayuda svg { flex-shrink: 0; }
.mst.ing .ing-pedidos { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.mst.ing .ing-pedido { min-height: 74px; text-align: left; }
.mst.ing .ing-pedido strong { font-family: inherit; font-size: 15px; font-weight: 650; line-height: 1.25; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mst.ing .ing-pedido em { font-style: normal; color: var(--red); font-weight: 600; }
.mst.ing .ing-pedido.is-urgente { border-color: var(--red-border); }
.mst.ing .ing-riel-titulo { font-family: inherit !important; font-weight: 600 !important; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.mst.ing .ing-pedido-cab { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.mst.ing .ing-pedido-cab h3 { margin: 0; font-size: 17px; font-weight: 650; line-height: 1.25; }
.mst.ing .ing-pedido-cab > div > span { font-size: 12.5px; color: var(--dim); }
.mst.ing .ing-falta { font-size: 12px; color: var(--dim); white-space: nowrap; }
.mst.ing .mpn-saldo { gap: 4px; align-items: center; }
.mst.ing .mpn-saldo.is-completo { border-color: var(--green-border); background: var(--green-soft); color: var(--green); }
.mst.ing .mpn-saldo.is-completo .mst-num { color: var(--green); }
.mst.ing .ing-estado { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 6px; border: 1px solid var(--border); white-space: nowrap; }
.mst.ing .ing-estado.is-ok { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
.mst.ing .ing-estado.is-parcial { color: var(--violet); border-color: var(--violet-border); background: var(--violet-soft); }
.mst.ing .ing-estado.is-mas { color: var(--cyan); border-color: var(--cyan-border); background: var(--cyan-soft); }
.mst.ing .ing-estado.is-nuevo { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.mst.ing .ing-destino {
  display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 0 8px;
  border: 1px solid var(--border-2); border-radius: 8px; background: var(--panel-solid); color: var(--text);
  font: inherit; font-size: 12px; font-weight: 600;
}
.mst.ing .ing-destino:hover { border-color: var(--blue); color: var(--blue); }
.mst.ing .ing-linea-frenada { background: var(--red-soft); }
.mst.ing .ing-estado.is-falta_stock { color: var(--cyan); border-color: var(--cyan-border); background: var(--cyan-soft); }
.mst.ing .ing-estado.is-sin_info { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.mst.ing .ing-novedad-btn {
  display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0;
  border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--dim);
}
.mst.ing .ing-novedad-btn:hover { border-color: var(--border-2); background: var(--panel); color: var(--violet); }
.mst.ing .ing-novedad-opcion.is-rechazado.is-elegida { border-color: var(--red); background: var(--red-soft); }
.mst.ing .ing-remito-btn { width: auto; padding: 0 12px; gap: 7px; display: inline-flex; align-items: center; font: inherit; font-size: 13px; font-weight: 600; color: var(--text); }
.mst.ing.is-angosto .ing-remito-btn { padding: 0; width: 40px; justify-content: center; }
.mst.ing .ing-remito-botones { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.mst.ing .ing-remito-boton {
  display: grid; justify-items: start; gap: 4px; padding: 16px; min-height: 110px; text-align: left;
  border: 1px solid var(--border-2); border-radius: 14px; background: var(--panel-solid); color: var(--text); font: inherit;
}
.mst.ing .ing-remito-boton svg { color: var(--blue); margin-bottom: 4px; }
.mst.ing .ing-remito-boton strong { font-size: 16px; font-weight: 650; }
.mst.ing .ing-remito-boton span { font-size: 12.5px; color: var(--dim); }
.mst.ing .ing-remito-boton:hover { border-color: var(--blue); }
.mst.ing .ing-remito-boton.is-principal { border-color: var(--blue-border); background: var(--blue-soft); }
.mst.ing .ing-remito-leyendo { display: flex; align-items: center; gap: 14px; padding: 18px; border: 1px solid var(--blue-border); border-radius: 14px; background: var(--blue-soft); color: var(--blue); }
.mst.ing .ing-remito-leyendo div { display: grid; gap: 2px; }
.mst.ing .ing-remito-leyendo strong { font-size: 15px; color: var(--text); }
.mst.ing .ing-remito-leyendo span { font-size: 12.5px; color: var(--muted); }
.mst.ing .ing-remito-vacio { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--dim); padding: 6px 2px; }
.mst.ing .ing-remito-lista { display: grid; gap: 6px; }
.mst.ing .ing-remito-fila { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid); }
.mst.ing .ing-remito-texto { flex: 1; min-width: 0; display: grid; gap: 2px; }
.mst.ing .ing-remito-texto strong { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mst.ing .ing-remito-texto span { font-size: 12px; color: var(--dim); }
.mst.ing .ing-remito-carrito {
  display: flex; align-items: center; gap: 8px; margin: 0 0 8px; padding: 6px 6px 6px 10px;
  border: 1px solid var(--blue-border); border-radius: 10px; background: var(--blue-soft); color: var(--blue); font-size: 13px;
}
.mst.ing .ing-remito-carrito-texto { flex: 1; min-width: 0; color: var(--text); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mst.ing .ing-mov { display: block; color: inherit; text-decoration: none; }
.mst.ing .ing-mov:hover { background: var(--panel); }
.mst.ing.is-angosto .ing-pedido-cab .ui-btn { flex: 1; justify-content: center; }
.mst.ing.is-angosto .ing-pedidos { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.mst.ing.is-angosto .ing-pedido strong { font-size: 14px; }
`;
