// Baja lo necesario para proponer stock mínimo (03/11/2026): catálogo, ledger
// de pañol, movimientos de consumibles y stock de consumibles por sede.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');
process.loadEnvFile('.env.backup.local');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

async function all(table, select, apply = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(db.from(table).select(select)).order(table === 'consumibles_config' ? 'material_id' : 'id').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const materiales = await all('panol_materiales', 'id,codigo,descripcion,unidad_medida,categoria_id,proveedor,es_consumible,es_requisito,stock_minimo,activo,ubicacion,created_at');
const categorias = await all('panol_categorias', 'id,nombre,parent_id');
const snapshot = await all('panol_obra_materiales_snapshot', '*,obra:produccion_obras!panol_obra_materiales_snapshot_obra_id_fkey(id,codigo,estado)');
const movs = await all('consumibles_movimientos', 'id,material_id,sede,tipo,cantidad,obra_id,sector,carril,origen,anulado_at,created_at,empleado_nombre');
const { data: cstock, error } = await db.from('consumibles_stock').select('*');
if (error) throw error;
const config = await all('consumibles_config', '*', (q) => q);

for (const [k, v] of Object.entries({ materiales, categorias, snapshot, movs, cstock, config })) {
  fs.writeFileSync(`${out}/${k}.json`, JSON.stringify(v));
  console.log(k, v.length);
}
