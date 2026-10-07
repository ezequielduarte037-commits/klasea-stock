import { createECDH, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Genera archivos locales ignorados por Git. Nunca imprime claves privadas.
// Una segunda ejecución conserva el par VAPID: rotarlo corta suscripciones.
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs,value,index,args)=>{
  if(value.startsWith('--'))pairs.push([value.slice(2),args[index+1]]);
  return pairs;
},[]));
const projectRef = options['project-ref'] || 'fiwugzjeegzlgclfayfd';
const subject = options.subject || '';
if(!/^[a-z0-9]{20}$/.test(projectRef))throw new Error('Usá un project-ref válido de Supabase.');
let validSubject=false;
try{const url=new URL(subject);validSubject=url.protocol==='mailto:' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname) : url.protocol==='https:'&&url.hostname.includes('.')&&url.hostname!=='localhost';}catch{/* Valor obligatorio. */}
if(!validSubject||/[\r\n]/.test(subject))throw new Error('Indicá --subject mailto:tu-correo@tu-empresa.com o una URL HTTPS pública de contacto.');
const envPath = resolve('.env.push.local');
const sqlPath = resolve('tmp/notificaciones-push/activar_cron.sql');
let envText;
try{
  envText=await readFile(envPath,'utf8');
  if(!['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','PUSH_CRON_SECRET'].every(key=>new RegExp('^'+key+'=.+$','m').test(envText)))
    throw new Error('El archivo existente está incompleto. Revisalo sin regenerar claves de dispositivos activos.');
}catch(error){
  if(error.code!=='ENOENT')throw error;
  const key=createECDH('prime256v1');key.generateKeys();
  const privateKey=key.getPrivateKey();
  const privateBytes=Buffer.concat([Buffer.alloc(32-privateKey.length),privateKey]);
  envText=`VAPID_PUBLIC_KEY=${key.getPublicKey().toString('base64url')}\nVAPID_PRIVATE_KEY=${privateBytes.toString('base64url')}\nVAPID_SUBJECT=${subject}\nPUSH_CRON_SECRET=${randomBytes(32).toString('base64url')}\n`;
  await writeFile(envPath,envText,{flag:'wx',mode:0o600});
}
const cronSecret=envText.match(/^PUSH_CRON_SECRET=(.+)$/m)?.[1]?.trim();
if(!/^[A-Za-z0-9_-]{32,}$/.test(cronSecret||''))throw new Error('El token local de cron no es válido. Revisá el archivo local.');
const template=await readFile('supabase/sql-editor/activar_notificaciones_push_cron.sql','utf8');
await mkdir(dirname(sqlPath),{recursive:true});
await writeFile(sqlPath,template.replace('https://YOUR_PROJECT_REF.supabase.co',`https://${projectRef}.supabase.co`).replace('REPLACE_WITH_THE_SAME_PUSH_CRON_SECRET',cronSecret),{mode:0o600});
console.log('Configuración preparada. Las claves privadas no se imprimen.');
console.log('Secretos: .env.push.local (ignorado por Git; guardar en un lugar seguro).');
console.log('SQL completo: tmp/notificaciones-push/activar_cron.sql (contiene el token; no compartir).');
console.log(`Publicar secretos: npx supabase secrets set --env-file .env.push.local --project-ref ${projectRef}`);
console.log(`Publicar función: npx supabase functions deploy notificaciones-push --project-ref ${projectRef}`);
console.log('Luego aplicar el SQL completo en Supabase y publicar el frontend.');
