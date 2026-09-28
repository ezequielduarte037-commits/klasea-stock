import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFeed } from './feed.mjs';
test('No muestra borradores ni avisos cerrados ni de otra sede; conserva parciales y urgentes', () => {
  const rows = [
    {id:'a',estado:'recibido',sede:'Pampa'}, {id:'b',estado:'borrador',sede:'Pampa'},
    {id:'c',estado:'enviado',sede:'Chubut'},
    {id:'d',estado:'parcial',sede:'Pampa',prioridad:'urgente',titulo:'Baron',items:[
      {estado:'recibido',descripcion:'Ya recibido'},
      {estado:'parcial',descripcion:'Piston',obra_snapshot_item_id:'s1'},
      {estado:'pendiente',descripcion:'TV',obra_snapshot_item_id:'s2'}]},
  ];
  const f = makeFeed(rows,{sede:'Stock Pampa'},new Map([['s1','37-42'],['s2','37-43']]));
  assert.equal(f.total,1);assert.equal(f.urgent,1);assert.equal(f.notices[0].items,2);
  assert.equal(f.notices[0].obra,'37-42 / 37-43');assert.equal(f.notices[0].detail,'Piston / TV');
});
test('Limita lo transmitido al dispositivo sin falsear la cantidad total de avisos', () => {
  const rows=Array.from({length:25},(_,i)=>({id:String(i),estado:'enviado',sede:'Pampa',prioridad:i===24?'urgente':'media',items:[]}));
  const f=makeFeed(rows,{sede:'ambas'});assert.equal(f.total,25);assert.equal(f.notices.length,20);
  assert.equal(f.notices[0].id,'24');assert.equal(f.notices[0].urgent,true);
});
