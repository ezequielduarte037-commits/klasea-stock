import test from "node:test";
import assert from "node:assert/strict";
import { separarRecepcionesDeMatriz } from "./recepcionesDeMatriz.js";
import { aporteDeFilaLedger, cantidadesDeFila } from "./estadoDeFila.js";

const base = { id:"matriz",materialId:"aire",source:"matriz",cantidad:2,snapshot_estado:"pedido",estadoObra:"pedido",purchase_request_id:"pedido-2" };
const remito = (extra={}) => ({ id:"remito-1",materialId:"aire",source:"remito",snapshot_tipo:"remito",snapshot_estado:"en_panol",recepcion_estado:"recibido",recepcion_cantidad_recibida:"1",cantidad:1,panol_envio_item_id:"rec-1",...extra });
const separar = (rows, live=[base]) => separarRecepcionesDeMatriz(live, rows, {
  keyOf:r=>r.materialId,esSoloMovimiento:r=>r.source==="egreso",tieneAdicional:()=>false,
});
const cantidades = (plan, recibos) => cantidadesDeFila({ ...plan,panolLedger:recibos.filter(r=>!r.omitirMovimientoDeMatriz).reduce((n,r)=>n+aporteDeFilaLedger(r).panol,0) });

test("K55-3: recibir uno acredita uno y conserva las dos unidades de matriz",()=>{
 const ingreso=remito();const rows=separar([base,ingreso]);
 assert.equal(rows[0],base);assert.equal(rows[1].soloMovimientoDeMatriz,true);assert.equal(ingreso.soloMovimientoDeMatriz,undefined);
 const q=cantidades(base,[rows[1]]);assert.deepEqual([q.necesita,q.panol,q.enCompras,q.faltaEntregar],[2,1,1,1]);
});
test("dos recepciones independientes completan la matriz sin reemplazarla por la última",()=>{
 const rows=separar([remito(),remito({id:"remito-2",panol_envio_item_id:"rec-2"})]);
 const q=cantidades(base,rows);assert.deepEqual([q.necesita,q.panol,q.enCompras],[2,2,0]);
});
test("la misma recepción referenciada desde matriz y remito se cuenta una vez",()=>{
 const recibida={...base,recepcion_estado:"parcial",recepcion_cantidad_recibida:"1",estadoObra:"en_panol",panol_envio_item_id:"rec-1"};
 const rows=separar([recibida,remito()],[recibida]);assert.equal(rows[1].omitirMovimientoDeMatriz,true);
 const q=cantidades(recibida,[rows[1]]);assert.deepEqual([q.necesita,q.panol,q.enCompras],[2,1,1]);
});
test("el remito parcialmente recibido aporta la cantidad recibida y no la pedida",()=>{
 const rows=separar([remito({cantidad:3,recepcion_estado:"parcial",recepcion_cantidad_recibida:"1"})]);
 assert.equal(aporteDeFilaLedger(rows[0]).panol,1);assert.equal(cantidades(base,rows).necesita,2);
});
test("un remito sin matriz sigue como material propio; adicionales y movimientos conservan su circuito",()=>{
 const sinBase=remito({materialId:"otro"}),adicional=remito({es_adicional:true}),egreso={materialId:"aire",source:"egreso",cantidad:1};
 const rows=separar([sinBase,adicional,egreso]);assert.deepEqual(rows,[sinBase,adicional,egreso]);
 const a=separarRecepcionesDeMatriz([base],[remito()],{keyOf:r=>r.materialId,esSoloMovimiento:()=>false,tieneAdicional:()=>true});
 assert.equal(a[0].soloMovimientoDeMatriz,undefined);
});
test("un ingreso anulado no suma stock ni reemplaza la necesidad",()=>{
 const [row]=separar([remito({obs:"[anulado]"})]);assert.equal(row.omitirMovimientoDeMatriz,true);assert.equal(cantidades(base,[row]).panol,0);
});
