export const CSS_PEDIDOS = `
.ped { display: flex; flex-direction: column; gap: 16px; padding-bottom: 32px; }
.ped .ped-dim { color: var(--dim); }
.ped .ped-num { font-variant-numeric: tabular-nums; }

.ped .ped-carrito { overflow: hidden; }
.ped .ped-cab { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.ped .ped-cab h2 { margin: 0; font-size: 16px; font-weight: 650; display: inline-flex; align-items: center; gap: 8px; }
.ped .ped-cab .ped-cab-der { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ped .ped-prov { min-width: 160px; }

.ped .ped-buscar { position: relative; padding: 12px 16px 0; }
.ped .ped-buscar .ui-input { width: 100%; padding-left: 36px; box-sizing: border-box; }
.ped .ped-buscar-ico { position: absolute; left: 28px; top: 50%; transform: translateY(calc(-50% + 6px)); color: var(--dim); pointer-events: none; }
.ped .ped-res { list-style: none; margin: 8px 16px 0; padding: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.ped .ped-res li + li { border-top: 1px solid var(--border); }
.ped .ped-res button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: transparent; border: 0; color: var(--text); text-align: left; cursor: pointer; font: inherit; }
.ped .ped-res button:hover { background: var(--panel-2); }
.ped .ped-res-txt { display: flex; flex-direction: column; min-width: 0; }
.ped .ped-res-txt small { color: var(--dim); }

.ped .ped-lineas { list-style: none; margin: 0; padding: 8px 0; }
.ped .ped-linea { display: grid; grid-template-columns: 40px minmax(0, 1fr) 150px 110px 36px; gap: 12px; align-items: center; padding: 8px 16px; }
.ped .ped-linea + .ped-linea { border-top: 1px solid var(--border); }
.ped .ped-linea-txt { min-width: 0; display: flex; flex-direction: column; }
.ped .ped-linea-txt span { overflow-wrap: anywhere; }
.ped .ped-linea-txt small { color: var(--dim); }
.ped .ped-cant { display: flex; align-items: center; gap: 6px; }
.ped .ped-cant .ui-input { width: 72px; text-align: right; }
.ped .ped-cant small { color: var(--dim); font-size: 12px; line-height: 1.2; }
.ped .ped-sub { text-align: right; }
.ped .ped-vacio { margin: 0; padding: 22px 16px; text-align: center; color: var(--dim); }

.ped .ped-pie { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 16px; border-top: 1px solid var(--border); }
.ped .ped-pie .ped-total { margin-right: auto; font-size: 14px; }
.ped .ped-nota { padding: 0 16px 12px; }
.ped .ped-nota .ui-input { width: 100%; box-sizing: border-box; }

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

@media (max-width: 640px) {
  .ped .ped-linea { grid-template-columns: 36px minmax(0, 1fr) 36px; }
  .ped .ped-linea .ped-cant { grid-column: 2 / 3; }
  .ped .ped-linea .ped-sub { grid-column: 2 / 3; text-align: left; }
  .ped .ped-pie > * { flex: 1 1 auto; }
  .ped .ped-tabla th:nth-child(4), .ped .ped-tabla td:nth-child(4) { display: none; }
}
`;
