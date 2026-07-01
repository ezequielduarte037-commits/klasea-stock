import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = envContent.split('\n').reduce((acc, line) => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length > 0) acc[key.trim()] = rest.join('=').trim().replace(/['"]/g, '').replace('\r', '');
  return acc;
}, {});

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('panol_materiales').select('proveedor');
  if (error) {
    console.error(error); return;
  }
  const s = new Set();
  for (const r of data) if (r.proveedor) s.add(r.proveedor);
  console.log("panol_materiales providers:", [...s].sort().slice(0, 50));
  
  const { data: d2 } = await supabase.from('panol_obra_materiales_snapshot').select('proveedor');
  const s2 = new Set();
  for (const r of d2 || []) if (r.proveedor) s2.add(r.proveedor);
  console.log("snapshot providers:", [...s2].sort().slice(0, 50));
}
run().catch(console.error);
