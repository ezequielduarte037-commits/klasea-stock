import {JSDOM} from './minimum-tests/node_modules/jsdom/lib/api.js';
import {build} from 'esbuild';import assert from 'node:assert/strict';import {createRequire}from'node:module';import path from'node:path';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await build({entryPoints:['src/features/panol/MinimumBatchEditor.jsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','react-dom/*'],alias:{'@/theme':path.resolve('src/theme/index.js')},outfile:'.tmp/minimum-batch.cjs'});
const require=createRequire(import.meta.url);const React=require('react');const {act}=React;const{createRoot}=require('react-dom/client');const Editor=require('./minimum-batch.cjs').default;const root=createRoot(document.getElementById('root'));
const groups=[{material:{id:'a'},label:'Placas antiruido',codigo:'A06499',proveedor:'Baron',stockMinimo:5},{material:{id:'b'},label:'Bomba',stockMinimo:null},{material:{id:'c'},label:'Cable',stockMinimo:3}];let calls=[],fail=true,closed=false;
await act(async()=>root.render(React.createElement(Editor,{groups,onSave:async(g,v)=>{calls.push([g.material.id,v]);if(g.material.id==='b'&&fail)throw Error('Sin conexión');},onClose:()=>closed=true})));
const inputs=()=>[...document.querySelectorAll('[data-minimum-batch-input]')];const button=()=>[...document.querySelectorAll('button')].find(x=>x.textContent.startsWith('Guardar'));
async function type(el,value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});}
await type(inputs()[0],'0');await type(inputs()[1],'12.5');await type(inputs()[2],'');assert.equal(calls.length,0,'Drafts must not write immediately');
await act(async()=>{inputs()[0].focus();inputs()[0].dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});assert.equal(document.activeElement,inputs()[1]);
const list=inputs()[0].parentElement.parentElement;list.scrollTop=220;const initialOrder=inputs().map(x=>x.getAttribute('aria-label'));
await act(async()=>button().click());assert.deepEqual(calls,[['a',0],['b',12.5],['c',null]]);assert.equal(list.scrollTop,220);assert.deepEqual(inputs().map(x=>x.getAttribute('aria-label')),initialOrder);assert.equal(inputs()[1].value,'12.5');assert.ok(document.body.textContent.includes('Quedan 1 sin guardar'));assert.equal(closed,false);
fail=false;calls=[];await act(async()=>button().click());assert.deepEqual(calls,[['b',12.5]],'Retry only failures');assert.equal(button().disabled,true);
await type(inputs()[0],'-1');assert.equal(button().disabled,true);assert.equal(inputs()[0].getAttribute('aria-invalid'),'true');await type(inputs()[0],'2');
const search=document.querySelector('input:not([data-minimum-batch-input])');await type(search,'Baron');assert.equal(inputs().length,1);await type(search,'');assert.equal(inputs()[0].value,'2');
console.log('PASS: staged multiple edits, Enter next, zero/null/decimal values, stable order and scroll, partial failure retry, validation, drafts across search.');await act(async()=>root.unmount());
