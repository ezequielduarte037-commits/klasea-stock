import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'vite';

const obra = { id:'obra-prueba', codigo:'52-24', modelo:'52', estado:'activa' };
const rows = ['Aro de prueba', 'Bomba de prueba', 'Cable de prueba'].map((descripcion,i) => ({ id:`item-${i}`, descripcion, cantidad:1, unidad:'unidad', estado:'pendiente', tipo:'base' }));
const api = {
  fetchCatalogo: 'async () => ({ categorias: [], materiales: [], proveedores: [] })',
  fetchObrasAvance: `async () => [${JSON.stringify(obra)}]`,
  fetchConjuntos: 'async () => []',
  fetchAddonsObra: 'async () => []',
  fetchStockLibrePanolMateriales: 'async () => []',
  fetchObrasMaterialSnapshots: 'async () => []',
  fetchObraMaterialSnapshot: 'async () => structuredClone(window.__rows)',
  cambiarEstadoObraSnapshot: `async (id, estado, nota, retirado_por) => {
    window.__saveCount = (window.__saveCount || 0) + 1;
    if (window.__failSave) throw new Error("Falla de prueba");
    if (window.__holdSave) await new Promise(resolve => { window.__finishSave = resolve });
    const row = window.__rows.find(row => row.id === id);
    Object.assign(row, { estado, retirado_por });
    return structuredClone(row);
  }`,
};
await writeFile('.tmp/fixture-lista-obra.html', '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./fixture-lista-obra.jsx"></script>');
await build({
  logLevel: 'error',
  build: { outDir: '.tmp/bundle-fixture-lista-obra', rollupOptions:{input:'.tmp/fixture-lista-obra.html'} },
  plugins:[{name:'test-lista-obra', enforce:'pre',
    transform(source,id) {
      if(id.replaceAll('\\','/').endsWith('/src/features/materiales/api.js')) {
        for(const [name, fn] of Object.entries(api)) {
          const re = new RegExp(`export (?:async )?function ${name}\\(`);
          assert.match(source,re);
          source = source.replace(re, `async function original_${name}(`) + `\nexport const ${name} = ${fn};`;
        }
        return source;
      }
      if(id.replaceAll('\\','/').endsWith('/src/supabaseClient.js')) {
        return source.replace('import.meta.env.VITE_SUPABASE_URL', "'http://127.0.0.1:5182'").replace('import.meta.env.VITE_SUPABASE_ANON_KEY', "'test'"); 
      }
    },
  }],
});
const pageHtml = await readFile('.tmp/bundle-fixture-lista-obra/.tmp/fixture-lista-obra.html');
const profile = new URL('./lista-obra-chrome/', import.meta.url).pathname.slice(1);
await mkdir(profile, { recursive:true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-crashpad-for-testing','--no-sandbox','--disable-background-networking','--disable-extensions','--no-first-run','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true});
const pause = ms => new Promise(r=>setTimeout(r,ms));
async function until(get, label) {
  for(let i=0;i<120;i++) {const value=await get(); if(value) return value; await pause(125);}
  throw new Error(`Timed out: ${label}`);
}
try {
  let id=0;
  let sessionId;
  let buffer='';
  const pending = new Map();
  chrome.stdio[4].on('data', chunk => {
    buffer += chunk.toString();
    const parts = buffer.split('\0');
    buffer=parts.pop();
    for (const part of parts) {
      const msg=JSON.parse(part);
      if (msg.id) {
        const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);msg.error?reject(msg.error):resolve(msg.result);
      }
      if (msg.method==='Runtime.exceptionThrown') console.error(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method==='Fetch.requestPaused') {
        void (async () => {
          const {requestId,request}=msg.params;
          const url=new URL(request.url);
          let mimeType='application/json';
          let body=Buffer.from('[]');
          if (url.host==='app.test' && /^\/(inicio-prueba|materiales)$/.test(url.pathname)) {
            mimeType='text/html'; body=pageHtml;
          } else if(url.host==='app.test' && url.pathname.startsWith('/assets/')) {
            mimeType=url.pathname.endsWith('.css')?'text/css':'text/javascript';
            body=await readFile('.tmp/bundle-fixture-lista-obra' + url.pathname).catch(()=>Buffer.alloc(0));
          }
          await cdp('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:mimeType},{name:'Access-Control-Allow-Origin',value:'*'}],body:body.toString('base64')});
        })().catch(console.error);
      }
    }
  });
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const num=++id;pending.set(num,{resolve,reject});chrome.stdio[3].write(JSON.stringify({id:num,method,params,sessionId})+'\0');});
  const {targetInfos}=await cdp('Target.getTargets');
  ({sessionId}=await cdp('Target.attachToTarget',{targetId:targetInfos.find(tab=>tab.type==='page').targetId,flatten:true}));
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  const js = async expression => {
    const { result, exceptionDetails } = await cdp('Runtime.evaluate',{expression,returnByValue:true});
    if(exceptionDetails) throw Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const button = (target, action) => `(() => {const el=[...document.querySelectorAll("button")].find(e=>e.getClientRects().length && ${target}); if (!el) return false; ${action || ''}; return true})()`;
  const byText = text => `e.textContent.trim() === ${JSON.stringify(text)}`;
  const byLabel = text => `e.getAttribute('aria-label') === ${JSON.stringify(text)}`;
  const click = async (target,label) => until(()=>js(button(target,'if (el.disabled) return false; el.click()')),label);
  const at = (param,value) => until(()=>js(`new URLSearchParams(location.search).get(${JSON.stringify(param)})===${JSON.stringify(value)}`),`${param}=${value}`);
  const title = (value) => until(()=>js(`document.querySelector("#obra-detail-title")?.textContent===${JSON.stringify(value)}`),value);
  try {
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
    await cdp('Page.navigate',{url:'http://app.test/inicio-prueba'});
    await click(byText('Materiales'),'Materiales');
    await click('e.textContent.includes("K52") && !e.textContent.includes("K55")','K52');
    await click('e.textContent.startsWith("52-24")','52-24');
    await at('obra','obra-prueba');
    await click('e.textContent.startsWith("Pendiente") && e.closest("[data-testid=obra-lista]")','Filtro Pendiente');
    await click(byLabel('Detalle de Aro de prueba'),'Detalle Aro');
    await at('item','item-0');
    await title('Aro de prueba');
    await js('window.__holdSave=true');
    await click(byText('Marcar instalado'),'Marcar instalado');
    await until(()=>js('Boolean(window.__finishSave)'),'guardado en curso');
    await at('item','item-0');
    await js('window.__finishSave(); window.__holdSave=false');
    await until(()=>js('document.querySelector("[role=dialog] [role=status]")?.textContent==="Instalado en el barco"'),'confirmación');
    await at('item','item-0');
    await click(byLabel('Ítem siguiente'),'Siguiente desde Pendiente');
    await title('Bomba de prueba');
    await js('history.back()');
    await at('item',null);
    assert.equal(await js('Boolean(document.querySelector("#obra-detail-title"))'), false);
    assert.equal(await js('Boolean(document.querySelector("[data-testid=obra-lista]"))'), true);
    assert.equal(await js(button(byLabel('Detalle de Aro de prueba'))), false);
    await js('history.forward()');
    await title('Bomba de prueba');
    await js('window.__failSave = true');
    await click(byText('Marcar instalado'),'Guardar con falla');
    await until(()=>js('document.querySelector("[role=dialog] [role=alert]")?.textContent==="Falla de prueba"'),'error visible');
    await at('item','item-1');
    await js('window.__failSave = false; window.__holdSave = true');
    await click(byText('Marcar instalado'),'Reintentar');
    await until(()=>js('window.__saveCount === 3'),'reintento en curso');
    await click(byText('Volver a la lista'),'Volver durante guardado');
    await at('item',null);
    await js('window.__finishSave(); window.__holdSave=false');
    await at('obra','obra-prueba');
    await click(byLabel('Detalle de Cable de prueba'),'Detalle Cable');
    await title('Cable de prueba');
    await js('history.back()');
    await at('item',null);
    await js('history.back()');
    await at('obra',null);
    await at('linea','52');
    await js('history.back()');
    await at('linea',null);
    await cdp('Page.navigate',{url:'http://app.test/materiales?linea=52&obra=obra-prueba&item=item-2'});
    await title('Cable de prueba');
    await click(byText('Volver a la lista'),'Volver desde enlace directo');
    await at('item',null);
    await at('obra','obra-prueba');
    console.log('OK: navegación móvil, filtro, guardado, error y enlace directo');
  } finally {}
} finally {
  chrome.kill();

}
