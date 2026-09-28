import tls from 'node:tls';
import { readFile, writeFile } from 'node:fs/promises';
const env={};
for(const name of ['.env','.env.local']) {
  try { for(const line of (await readFile(name,'utf8')).split(/\r?\n/)) {
    const m=line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
  }} catch(e){if(e.code!=='ENOENT')throw e;}
}
const host=new URL(env.VITE_SUPABASE_URL).hostname;
if(!host.endsWith('.supabase.co'))throw Error('Host inesperado');
const output=process.argv[2];if(!output)throw Error('Indicar ruta de cloud_ca.h');
const socket=tls.connect({host,port:443,servername:host,rejectUnauthorized:true});
socket.setTimeout(10000,()=>socket.destroy(Error('TLS timeout')));
socket.on('error',e=>{console.error(e.message);process.exitCode=1});
socket.on('secureConnect',async()=>{
  try {
    if(!socket.authorized)throw Error('TLS no verificado');
    let cert=socket.getPeerCertificate(true);
    const seen=new Set();
    while(cert.issuerCertificate&&cert.issuerCertificate.fingerprint256!==cert.fingerprint256&&!seen.has(cert.fingerprint256)) {
      seen.add(cert.fingerprint256);cert=cert.issuerCertificate;
    }
    if(!cert.raw)throw Error('No se obtuvo raiz');
    const pem='-----BEGIN CERTIFICATE-----\n'+cert.raw.toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END CERTIFICATE-----\n';
    await writeFile(output,`#pragma once\nconst char CLOUD_ROOT_CA[] PROGMEM = R"ROOTCA(${pem})ROOTCA";\n`);
    console.log('CA obtenida desde una conexion TLS verificada.');
  } catch(e){console.error(e.message);process.exitCode=1;} finally{socket.end();}
});
