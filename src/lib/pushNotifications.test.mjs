import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as support from './webPushSupport.js';

const source = (await readFile(new URL('./pushNotifications.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const factory = new Function('supabase', ...Object.keys(support), source + '\nreturn {loadPushState,enablePush,disablePush,clearPushForLogout};');

async function harness(run) {
  const saved = new Map(['window','navigator','location','localStorage','MessageChannel'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const storage = new Map(), calls = [], bindings = [], closed = [];
  let subscription = null, subscribeError = null, backendError = null, subscribePromise = null;
  const mockSubscription = {endpoint:'https://fcm.googleapis.com/fcm/send/device',toJSON:()=>({endpoint:mockSubscription.endpoint,keys:{}}),
    async unsubscribe(){calls.push('unsubscribe-local');subscription=null;return true;}};
  const reg = {active:{scriptURL:'https://klasea.test/klasea-push-sw.js',postMessage(data,ports){bindings.push(data.userId);queueMicrotask(()=>ports[0].back.onmessage({data:{ok:true}}));}},
    pushManager:{getSubscription:async()=>subscription,subscribe(){calls.push('subscribe-gesture');return subscribeError ? Promise.reject(subscribeError) : subscribePromise || Promise.resolve(subscription=mockSubscription);}},
    getNotifications:async()=>[{close(){closed.push(true);}}]};
  const publicKey = Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url');
  const supabase = {functions:{async invoke(name,{body}){calls.push(body.action);if(backendError&&body.action==='subscribe')return {data:null,error:backendError};return {data:body.action==='config'?{enabled:true,publicKey}:{enabled:true},error:null};}},
    from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})};}};
  const nav = {userAgent:'Android',serviceWorker:{register:async()=>reg,getRegistrations:async()=>[reg]},clearAppBadge:async()=>calls.push('clear-badge')};
  const values = {navigator:nav,location:{origin:'https://klasea.test'},window:{navigator:nav,isSecureContext:true,PushManager:function(){},Notification:{permission:'default'},dispatchEvent(){}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    MessageChannel:class {constructor(){this.port1={close(){}};this.port2={back:this.port1};}}};
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true});
  const api=factory(supabase,...Object.values(support));
  try {await run({api,reg,calls,bindings,closed,storage,mockSubscription,setBackendError:value=>backendError=value,setSubscribePromise:value=>subscribePromise=value});}
  finally {for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('preparar no pide permiso; activar conserva el gesto del usuario antes de cualquier await',()=>harness(async h=>{
  const prepared=await h.api.loadPushState({id:'A',role:'tecnica'});
  assert.equal(prepared.phase,'ready');assert.ok(!h.calls.includes('subscribe-gesture'));
  const activation=h.api.enablePush(prepared,'A');
  assert.equal(h.calls.at(-1),'subscribe-gesture');
  await activation;
  assert.equal(h.storage.get('klasea.push.owner'),'A');assert.equal(h.calls.at(-1),'subscribe');
}));

test('un error de registro servidor deshace el alta local y no anuncia activación',()=>harness(async h=>{
  const prepared=await h.api.loadPushState({id:'A',role:'tecnica'});
  h.setBackendError({context:{clone:()=>({json:async()=>({error:'La sesión venció'})})}});
  await assert.rejects(h.api.enablePush(prepared,'A'),/sesión venció/);
  assert.equal(h.storage.has('klasea.push.owner'),false);assert.equal(h.calls.at(-1),'unsubscribe-local');
}));

test('una activación pendiente no registra el dispositivo si cambia la cuenta',()=>harness(async h=>{
  let resolve,current=true;h.setSubscribePromise(new Promise(done=>resolve=done));
  const prepared=await h.api.loadPushState({id:'A',role:'tecnica'});
  const activation=h.api.enablePush(prepared,'A',()=>current);
  current=false;resolve(h.mockSubscription);
  await assert.rejects(activation,/sesión cambió/);
  assert.ok(!h.calls.includes('subscribe'));assert.equal(h.calls.at(-1),'unsubscribe-local');
}));

test('salir desvincula el worker, corta recepción local y cierra avisos sin depender de red',()=>harness(async h=>{
  const prepared=await h.api.loadPushState({id:'A',role:'tecnica'});await h.api.enablePush(prepared,'A');
  await h.api.clearPushForLogout();
  assert.equal(h.bindings.at(-1),null);assert.equal(h.storage.has('klasea.push.owner'),false);
  assert.ok(h.calls.includes('unsubscribe-local'));assert.ok(!h.calls.includes('unsubscribe'));
  assert.equal(h.closed.length,1);assert.equal(h.calls.at(-1),'clear-badge');
}));
