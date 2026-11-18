import {build} from 'esbuild';
await build({
  entryPoints:['.tmp/aviso-85732-planilla-entry.mjs'],outfile:'.tmp/aviso-85732-planilla.mjs',bundle:true,platform:'node',format:'esm',packages:'external',
  plugins:[{name:'klasea-runtime',setup(b){
    b.onResolve({filter:/^@\/supabaseClient(?:\.js)?$/},()=>({path:'admin',namespace:'db'}));
    b.onResolve({filter:/^@\//},args=>b.resolve(process.cwd()+'/src/'+args.path.slice(2),{kind:args.kind,resolveDir:process.cwd()}));
    b.onLoad({filter:/.*/,namespace:'db'},()=>({contents:`
      import {createClient} from '@supabase/supabase-js';
      process.loadEnvFile('.env'); process.loadEnvFile('.env.backup.local');
      export const supabase=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
    `,resolveDir:process.cwd()}));
  }}],
});
