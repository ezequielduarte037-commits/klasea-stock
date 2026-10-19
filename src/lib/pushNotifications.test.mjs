import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as support from './webPushSupport.js';

const source = (await readFile(new URL('./pushNotifications.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const factory = new Function('supabase', ...Object.keys(support), source + '\nreturn {loadPushState,enablePush,disablePush,clearPushForLogout,resumePushForSession};');

async function harness(run) {
  const saved = new Map(['window','navigator','location','localStorage','MessageChannel'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const storage = new Map(), calls = [], bindings = [], closed = [];
  let subscription = null, subscribeError = null, backendError = null, subscribePromise = null, configError = null, savedError = null, getSubscriptionPromise = null;
  const mockSubscription = {endpoint:'https://fcm.googleapis.com/fcm/send/device',toJSON:()=>({endpoint:mockSubscription.endpoint,keys:{}}),
    async unsubscribe(){calls.push('unsubscribe-local');subscription=null;return true;}};
  const reg = {active:{scriptURL:'https://klasea.test/klasea-push-sw.js',postMessage(data,ports){bindings.push(data.userId);queueMicrotask(()=>ports[0].back.onmessage({data:{ok:true}}));}},
    pushManager:{getSubscription:async()=>{calls.push('get-subscription');return getSubscriptionPromise||subscription;},subscribe(){calls.push('subscribe-gesture');return subscribeError ? Promise.reject(subscribeError) : subscribePromise || Promise.resolve(subscription=mockSubscription);}},
    getNotifications:async()=>[{close(){closed.push(true);}}]};
  const publicKey = Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url');
  const supabase = {functions:{async invoke(name,{body}){calls.push(body.action);if((backendError&&body.action==='subscribe')||(configError&&body.action==='config'))return {data:null,error:backendError||configError};return {data:body.action==='config'?{enabled:true,publicKey}:{enabled:true},error:null};}},
    from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='notificaciones_push_suscripciones'?{last_error:savedError}:null,error:null})};}};
  const nav = {userAgent:'Android',serviceWorker:{register:async()=>reg,getRegistrations:async()=>[reg]},clearAppBadge:async()=>calls.push('clear-badge')};
  const values = {navigator:nav,location:{origin:'https://klasea.test'},window:{navigator:nav,isSecureContext:true,PushManager:function(){},Notification:{permission:'default'},dispatchEvent(){}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    MessageChannel:class {constructor(){this.port1={close(){}};this.port2={back:this.port1};}}};
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true});
  const api=factory(supabase,...Object.values(support));
  try {await run({api,reg,calls,bindings,closed,storage,mockSubscription,setBackendError:value=>backendError=value,setSubscribePromise:value=>subscribePromise=value,
    setSubscription:value=>subscription=value,setConfigError:value=>configError=value,setSavedError:value=>savedError=value,
    setSubscribeError:value=>subscribeError=value,setGetSubscriptionPromise:value=>getSubscriptionPromise=value,
    setPermission:value=>values.window.Notification.permission=value});}
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

test('un corte al guardar conserva el alta local y se recupera sin otra activación',()=>harness(async h=>{
  const prepared=await h.api.loadPushState({id:'A',role:'tecnica'});
  h.setBackendError({context:{clone:()=>({json:async()=>({error:'La sesión venció'})})}});
  await assert.rejects(h.api.enablePush(prepared,'A'),/sesión venció/);
  assert.equal(h.storage.get('klasea.push.owner'),'A');assert.equal(h.storage.get('klasea.push.enabled.A'),'true');
  assert.ok(!h.calls.includes('unsubscribe-local'));
  h.setBackendError(null);assert.equal((await h.api.loadPushState({id:'A',role:'tecnica'})).phase,'active');
  assert.equal(h.calls.filter(c=>c==='subscribe-gesture').length,1);
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
  assert.equal(h.storage.get('klasea.push.enabled.A'),'true');
  assert.equal(await h.api.loadPushState({id:'A',role:'tecnica'}),null,'no se reconecta mientras se está saliendo');
  h.api.resumePushForSession();h.setPermission('granted');
  assert.equal((await h.api.loadPushState({id:'A',role:'tecnica'})).phase,'active');
}));

test('si desaparece la suscripción se renueva con el permiso existente y la elección guardada',()=>harness(async h=>{
  const prepared=await h.api.loadPushState({id:'A',role:'tecnica'});await h.api.enablePush(prepared,'A');
  h.setPermission('granted');h.setSubscription(null);
  const recovered=await h.api.loadPushState({id:'A',role:'tecnica'});
  assert.equal(recovered.phase,'active');assert.equal(h.calls.filter(c=>c==='subscribe-gesture').length,2);
}));

test('el primer permiso y la baja explícita nunca se reactivan automáticamente',()=>harness(async h=>{
  h.setPermission('granted');
  const initial=await h.api.loadPushState({id:'A',role:'tecnica'});
  assert.equal(initial.phase,'ready');assert.ok(!h.calls.includes('subscribe-gesture'));
  await h.api.enablePush(initial,'A');await h.api.disablePush(h.reg);
  assert.equal(h.storage.get('klasea.push.enabled.A'),'false');
  assert.equal((await h.api.loadPushState({id:'A',role:'tecnica'})).phase,'ready');
  assert.equal(h.calls.filter(c=>c==='subscribe-gesture').length,1);
}));

test('una cuenta nueva no hereda el permiso de activación de otra persona',()=>harness(async h=>{
  await h.api.enablePush(await h.api.loadPushState({id:'A',role:'tecnica'}),'A');h.setPermission('granted');
  const other=await h.api.loadPushState({id:'B',role:'tecnica'});
  assert.equal(other.phase,'ready');assert.ok(h.calls.includes('unsubscribe-local'));
  assert.equal(h.calls.filter(c=>c==='subscribe-gesture').length,1);
  assert.equal(h.storage.has('klasea.push.enabled.B'),false);
}));

test('una suscripción con 410 se reemplaza en vez de revivir el endpoint vencido',()=>harness(async h=>{
  await h.api.enablePush(await h.api.loadPushState({id:'A',role:'tecnica'}),'A');h.setPermission('granted');h.setSavedError('push_http_410');
  const recovered=await h.api.loadPushState({id:'A',role:'tecnica'});
  assert.equal(recovered.phase,'active');assert.ok(h.calls.includes('unsubscribe-local'));
  assert.equal(h.calls.filter(c=>c==='subscribe-gesture').length,2);
}));

test('un fallo de conexión se muestra pendiente y conserva la suscripción',()=>harness(async h=>{
  await h.api.enablePush(await h.api.loadPushState({id:'A',role:'tecnica'}),'A');
  h.setConfigError({});const pending=await h.api.loadPushState({id:'A',role:'tecnica'});
  assert.equal(pending.phase,'reconnecting');assert.equal(pending.subscription,h.mockSubscription);
  assert.ok(!h.calls.includes('unsubscribe-local'));
  h.setConfigError(null);assert.equal((await h.api.loadPushState({id:'A',role:'tecnica'})).phase,'active');
}));

test('una comprobación vieja no borra la suscripción de una activación nueva',()=>harness(async h=>{
  let resolve,current=true;h.setGetSubscriptionPromise(new Promise(done=>resolve=done));
  const checking=h.api.loadPushState({id:'A',role:'tecnica'},()=>current);
  while(!h.calls.includes('get-subscription'))await Promise.resolve();
  current=false;resolve(h.mockSubscription);
  assert.equal(await checking,null);assert.ok(!h.calls.includes('unsubscribe-local'));
}));

test('si el navegador pide gesto conserva el botón y nunca fuerza un permiso bloqueado',()=>harness(async h=>{
  h.storage.set('klasea.push.enabled.A','true');h.setPermission('granted');
  const error=new Error('Gesture required');error.name='NotAllowedError';h.setSubscribeError(error);
  assert.equal((await h.api.loadPushState({id:'A',role:'tecnica'})).phase,'ready');
  const intentos=h.calls.filter(c=>c==='subscribe-gesture').length;h.setPermission('denied');
  assert.equal((await h.api.loadPushState({id:'A',role:'tecnica'})).phase,'blocked');
  assert.equal(h.calls.filter(c=>c==='subscribe-gesture').length,intentos);
}));
