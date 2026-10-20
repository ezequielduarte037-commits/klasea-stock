export const CSS_PEDIDOS = `
.ped { display: flex; flex-direction: column; gap: 14px; padding-bottom: 40px; }
.ped .ped-dim { color: var(--dim); }
.ped .ped-num { font-variant-numeric: tabular-nums; }

/* ── Barra ─────────────────────────────────────────────────────────── */
.ped .ped-barra { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.ped .ped-barra-prov { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; }
.ped .ped-barra-prov .ui-input { width: auto; min-width: 160px; font-weight: 600; }
.ped .ped-otros { font-size: 13px; }

/* ── Armado: productos + carrito ───────────────────────────────────── */
.ped .ped-armado { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
.ped .ped-catalogo { min-width: 0; display: flex; flex-direction: column; gap: 10px; }

.ped .ped-filtros { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ped .ped-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.ped .ped-chips::-webkit-scrollbar { display: none; }
.ped .ped-chip {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px;
  min-height: 34px; padding: 0 12px;
  border: 1px solid var(--border-2); border-radius: 999px; background: var(--panel);
  color: var(--muted); font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer;
}
.ped .ped-chip .ped-num { font-size: 11.5px; color: var(--dim); }
.ped .ped-chip.is-activa { background: var(--blue-soft); border-color: var(--blue-border); color: var(--blue); font-weight: 600; }
.ped .ped-chip.is-activa .ped-num { color: var(--blue); }
.ped .ped-buscar { position: relative; flex: 1; min-width: 220px; }
.ped .ped-buscar .ui-input { width: 100%; box-sizing: border-box; padding-left: 34px; padding-right: 34px; }
.ped .ped-buscar .ui-input::-webkit-search-cancel-button { display: none; }
.ped .ped-buscar-ico { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
.ped .ped-buscar-x { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); width: 34px; height: 34px; display: grid; place-items: center; border: 0; background: transparent; color: var(--dim); border-radius: 8px; cursor: pointer; }
.ped .ped-rubro { width: auto; min-width: 170px; max-width: 240px; }

.ped .ped-productos { list-style: none; margin: 0; padding: 0; overflow: hidden; }
.ped .ped-prod { display: grid; grid-template-columns: minmax(0, 1fr) 150px 210px; gap: 12px; align-items: center; padding: 6px 12px 6px 6px; border-left: 3px solid transparent; }
.ped .ped-prod + .ped-prod { border-top: 1px solid var(--border); }
.ped .ped-prod.is-elegido { background: var(--blue-soft); border-left-color: var(--blue); }
.ped .ped-prod-info { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 4px 6px; border: 0; border-radius: 8px; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.ped .ped-prod-info:disabled { cursor: default; }
.ped .ped-prod:not(.is-elegido) .ped-prod-info:hover { background: var(--panel-2); }
.ped .ped-prod-txt { display: flex; flex-direction: column; min-width: 0; }
.ped .ped-prod-desc { font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.ped .ped-prod-meta { font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ped .ped-prod-stock { font-size: 13px; text-align: right; }
.ped .ped-prod-stock .is-bajo { color: var(--red); }
.ped .ped-sumar { justify-self: end; gap: 6px; }
.ped .ped-sumar small { font-weight: 400; font-size: 11.5px; }
.ped .ped-paso { justify-self: end; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.ped .ped-paso .ui-btn-icono { width: 32px; height: 32px; min-height: 32px; }
.ped .ped-paso-n { width: 58px; text-align: center; font-weight: 650; }
.ped .ped-paso-u { width: 100%; text-align: right; font-size: 11.5px; }
.ped .ped-sin { padding: 24px; text-align: center; color: var(--dim); }
.ped .ped-mas { align-self: center; }

.ped .ped-carrito { position: sticky; top: 12px; max-height: calc(100vh - 24px); display: flex; flex-direction: column; overflow: hidden; }
.ped .ped-carrito-cab { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 14px 14px 10px; border-bottom: 1px solid var(--border); }
.ped .ped-carrito-cab h2 { margin: 0; font-size: 15px; font-weight: 650; display: inline-flex; align-items: center; gap: 7px; }
.ped .ped-carrito-cab .ped-dim { font-size: 12.5px; white-space: nowrap; }
.ped .ped-vacio { margin: 0; padding: 22px 16px; text-align: center; color: var(--dim); font-size: 13.5px; line-height: 1.45; }
.ped .ped-lineas { list-style: none; margin: 0; padding: 4px 0; overflow-y: auto; flex: 1; min-height: 60px; }
.ped .ped-linea { display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 14px; }
.ped .ped-linea + .ped-linea { border-top: 1px solid var(--border); }
.ped .ped-linea-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 13.5px; }
.ped .ped-linea-txt small { font-size: 12px; }
.ped .ped-carrito-pie { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px; border-top: 1px solid var(--border); }
.ped .ped-total { font-size: 14px; }
.ped .ped-confirmar { width: 100%; justify-content: center; }
.ped .ped-carrito-btns { display: flex; gap: 8px; }
.ped .ped-carrito-btns > * { flex: 1; justify-content: center; }
.ped .ped-flotante { display: none; }

/* ── Pedidos hechos ────────────────────────────────────────────────── */
.ped .ped-hechos { margin-top: 8px; }
.ped .ped-hechos h2 { margin: 0 0 8px; font-size: 15px; font-weight: 650; }
.ped .ped-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.ped .ped-item { overflow: hidden; }
.ped .ped-item-cab { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: transparent; border: 0; color: var(--text); text-align: left; cursor: pointer; font: inherit; }
.ped .ped-item-tit { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ped .ped-item-tit small { color: var(--dim); }
.ped .ped-estado { flex-shrink: 0; }
.ped .ped-estado[data-tono="azul"] { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.ped .ped-estado[data-tono="violeta"] { color: var(--violet); border-color: var(--violet-border); background: var(--violet-soft); }
.ped .ped-estado[data-tono="verde"] { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
.ped .ped-item-cuerpo { border-top: 1px solid var(--border); padding: 8px 14px 14px; }
.ped .ped-tabla { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.ped .ped-tabla th { text-align: left; font-weight: 600; color: var(--dim); font-size: 12px; padding: 6px 4px; }
.ped .ped-tabla td { padding: 6px 4px; border-top: 1px solid var(--border); }
.ped .ped-tabla .is-num { text-align: right; white-space: nowrap; }
.ped .ped-tabla .is-falta { color: var(--red); }
.ped .ped-tabla .is-ok { color: var(--green); }
.ped .ped-acciones { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }

@media (max-width: 1100px) {
  .ped .ped-armado { grid-template-columns: minmax(0, 1fr); }
  .ped .ped-carrito { position: static; max-height: none; }
  .ped .ped-lineas { overflow: visible; }
  .ped .ped-flotante {
    display: inline-flex; position: fixed; z-index: 30; left: 50%; transform: translateX(-50%);
    bottom: calc(14px + env(safe-area-inset-bottom)); box-shadow: var(--elev-2, 0 10px 30px rgba(0,0,0,.25));
    max-width: calc(100vw - 32px); white-space: nowrap;
  }
}
@media (max-width: 720px) {
  .ped .ped-prod { grid-template-columns: minmax(0, 1fr) auto; row-gap: 4px; padding: 8px 10px 8px 4px; }
  .ped .ped-prod-info { grid-column: 1 / -1; }
  .ped .ped-prod-stock { text-align: left; padding-left: 56px; }
  .ped .ped-rubro { flex: 1; max-width: none; }
  .ped .ped-tabla th:nth-child(4), .ped .ped-tabla td:nth-child(4) { display: none; }
}
`;
