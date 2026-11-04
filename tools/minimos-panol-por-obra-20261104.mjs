// Quinta vuelta de los mínimos de barco (04/11/2026). Ezequiel: el mínimo
// fijo no sirve para lo que va asignado a cada barco (matafuegos que se
// vencen, anclas, equipos): la alerta tiene que salir de la lista estándar de
// las obras ("hay 1 y lo necesitan 3 barcos, faltan 2"). Eso es la pestaña
// "Falta para obras" del stock de pañol. Acá se pasan a 0 los mínimos que puso
// la vuelta estándar (20261103240000) en lo que se compra por barco; la
// ferretería chica conserva el suyo. Los mínimos cargados a mano no se tocan.
import fs from 'node:fs';

const [dir, sqlPath] = process.argv.slice(2);
const estandar = JSON.parse(fs.readFileSync(`${dir}/estandar.json`, 'utf8')).filter((c) => c.minimo > 0);
const FERRETERIA = /\bcodo|racor|cupla|entrerrosca|niple|\bt[eé]e?\b|\bte bronce|tap[oó]n|\btapa (bronce|de bronce)|reducci[oó]n|buje reduc|pasacasco|v[aá]lvula|miniesf|esf[eé]rica|cuchara|grasera|empalme|uni[oó]n|conector|abrazadera|espiga|terminal|fusible|bornera|precinto|grillete|c[aá]ncamo|sapito|omega|bisagra|levantapiso|pist[oó]n|llave de paso|llave esclusa|rejilla|virola|adaptador|tuerca|arandela|bul[oó]n|tornillo|varilla|estaño|flux|cinta|caño corrugado|cable|poliamida|tubo qc|ducto|fleje|cadena|cabo|botazo|percha|posavasos|gancho|manija|soporte|punto fijo|traba|cierre|perfil|luz|luces|plafon|pulsador|zocalo|toma|enchufe|ficha|funda|tira led|neon/i;
const MATERIAL_CHICO = /pasacasco|manguera|caño|curva|venteo|tapa tanque|caja (exterior|paso)|entrada de agua|[áa]nodo/i;
const POR_OBRA = /flexibles|cadena|giratorio|luz banda|bomba|tv\b|monocomando|duchador|canilla|microondas|termotanque|calefactor|vhf|ecosonda|antena|bocina|panel|instrum|switch|solenoide|t[ée]rmica|bater|filtro|tambucho|silenciador|separador|buje de bronce|brazo|guardamancebo|regulador|pileta|portarrollo|toallero|placas|caja de piso|caja (para|porta) bater|blower|compas|picaporte|defensa|chromecast|ficha marinco hembra interlock|boat toma|salida escape|bot[oó]n malacate|tunel|luz de nav|luz led hella/i;

const aCero = estandar.filter((c) => {
  if (POR_OBRA.test(c.descripcion)) return true;
  if (MATERIAL_CHICO.test(c.descripcion) && (c.precio == null || c.precio <= 100)) return false;
  return !((c.precio == null || c.precio <= 50) && FERRETERIA.test(c.descripcion));
});
console.log({ positivosEstandar: estandar.length, aCero: aCero.length, quedan: estandar.length - aCero.length });
fs.writeFileSync(`${dir}/por-obra.json`, JSON.stringify(aCero, null, 1));

const lit = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
fs.writeFileSync(sqlPath, `-- Mínimos de barco, quinta vuelta (04/11/2026). Lo que se compra para cada
-- barco (TV, bombas, griferías, equipos, flexibles de línea…) no lleva mínimo
-- fijo: la alerta sale de "Falta para obras" (lista estándar de las obras
-- activas contra lo libre). Pasan a 0 los que puso 20261103240000; la
-- ferretería chica conserva el suyo. Cálculo en
-- tools/minimos-panol-por-obra-20261104.mjs.
--
-- Sólo cambia los que siguen con el valor automático (nadie los tocó a mano).

begin;

create temp table zz_minimos (material_id uuid primary key, anterior numeric, descripcion text) on commit drop;
insert into zz_minimos (material_id, anterior, descripcion) values
${aCero.map((c) => `  (${lit(c.id)}::uuid, ${c.minimo}, ${lit(c.descripcion)})`).join(',\n')};

update public.panol_materiales m
set stock_minimo = 0
from zz_minimos z
where m.id = z.material_id
  and m.stock_minimo = z.anterior
  and not exists (
    select 1 from public.panol_materiales_audit a
    where a.material_id = m.id and a.campo = 'stock_minimo' and a.origen not like 'minimos_%'
  );

update public.panol_materiales_audit a
set origen = 'minimos_por_obra_20261104',
    contexto = coalesce(a.contexto, '{}'::jsonb) || jsonb_build_object('motivo', 'Se compra para cada barco: avisa "Falta para obras", no el mínimo')
from zz_minimos z
where a.material_id = z.material_id
  and a.campo = 'stock_minimo'
  and a.contexto->>'txid' = txid_current()::text;

commit;
`);
