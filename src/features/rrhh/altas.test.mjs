import {test} from 'node:test';
import assert from 'node:assert/strict';
import {puedeGestionarAltas,empleadosDeVista} from './altas.js';
test('los provisorios se separan del equipo definitivo y de los ex empleados',()=>{
 const rows=[{id:'a',activo:true},{id:'b',activo:false},{id:'p',activo:true,ficha:false,provisorio:true},{id:'q',activo:false,provisorio:true}];
 assert.deepEqual(empleadosDeVista(rows).map(e=>e.id),['a']);
 assert.deepEqual(empleadosDeVista(rows,'ex').map(e=>e.id),['b']);
 assert.deepEqual(empleadosDeVista(rows,'provisorios').map(e=>e.id),['p','q']);
});
test('RRHH y Técnica gestionan altas; Pañol no confirma aunque tenga flag de admin',()=>{
 for(const role of ['rrhh','tecnica','admin','administracion'])assert.equal(puedeGestionarAltas({role}),true);
 for(const role of ['panol','compras','oficina'])assert.equal(puedeGestionarAltas({role}),false);
 assert.equal(puedeGestionarAltas({role:'panol',is_admin:true}),false);
 assert.equal(puedeGestionarAltas(null),false);
});
