const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {});

process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function check() {
  const { data: mats, error: err1 } = await supabase
    .from('materiales')
    .select('id, nombre, stock_actual')
    .in('nombre', ['Fibrofacil 3mm', 'PVC 20mm']);
    
  if (err1) {
    console.error(err1);
    return;
  }
  
  console.log("Materiales:", mats);
  
  for (const mat of mats) {
    const { data: movs, error: err2 } = await supabase
      .from('movimientos')
      .select('id, delta, created_at, obs, obra')
      .eq('material_id', mat.id);
      
    if (err2) {
      console.error(err2);
      continue;
    }
    
    const sum = movs.reduce((acc, m) => acc + (Number(m.delta) || 0), 0);
    console.log(`\nMovimientos para ${mat.nombre} (ID: ${mat.id}):`);
    console.log(`Cantidad de movimientos: ${movs.length}`);
    console.log(`Suma de deltas: ${sum}`);
    console.log(`stock_actual en tabla: ${mat.stock_actual}`);
    console.log("Movimientos detallados:", movs);
  }
}

check();
