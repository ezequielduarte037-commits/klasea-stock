-- Links del catalogo + limpieza de observaciones ruidosas del import K55.
-- La observacion queda para notas reales del Excel; el resto de metadata queda fuera de la vista diaria.

alter table public.panol_materiales
  add column if not exists links jsonb not null default '[]'::jsonb;

update public.panol_materiales
   set links = '[]'::jsonb
 where links is null
    or jsonb_typeof(links) <> 'array';

comment on column public.panol_materiales.links is
  'Links utiles del material: ficha tecnica, ML, proveedor, plano, etc. Array JSON de {label,url,nota}.';

-- Los addons K55 importados recibieron observaciones tecnicas de importacion
-- (fila, estado, rubro, score de duplicado). No son observaciones operativas.
do $$
begin
  if to_regclass('public.panol_obra_addons') is not null then
    update public.panol_obra_addons
       set observaciones = null
     where observaciones ~* 'K55 Excel fila'
       and (
         observaciones ~* 'Estado Excel:'
         or observaciones ~* 'Rubro:'
         or observaciones ~* 'Analisis duplicados:'
       );
  end if;
end $$;

-- Para materiales nuevos del import K55, conservar solamente la linea OBS real
-- cuando existia en el Excel. Si no habia OBS real, limpiar la nota.
update public.panol_materiales
   set notas = nullif(
     btrim(
       coalesce(
         substring(notas from '(?m)^OBS:\s*([^\r\n]+)'),
         ''
       )
     ),
     ''
   )
 where origen in ('import_k55_excel', 'import_k55_opc_sin_obra')
   and notas is not null
   and (
     notas ~* 'Import K55 Excel'
     or notas ~* 'K55 Excel fila'
     or notas ~* 'Flag original:'
     or notas ~* 'Rubro original:'
     or notas ~* 'Analisis duplicados:'
     or notas ~* 'sin obra definida'
   );

-- En materiales reutilizados, si se habia agregado "[K55 Excel fila X]" antes
-- de una observacion real, sacar solo la etiqueta tecnica.
update public.panol_materiales
   set notas = nullif(btrim(regexp_replace(notas, '\[K55 Excel fila [0-9]+\]\s*', '', 'g')), '')
 where notas ~ '\[K55 Excel fila [0-9]+\]';
