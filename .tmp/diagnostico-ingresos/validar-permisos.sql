do $$ begin perform set_config('request.jwt.claim.sub',(select id::text from public.profiles where is_admin is true limit 1),true); end $$;
set local role authenticated;
with datos as (select public.consumibles_catalogo_ingresos() as valor)
select jsonb_array_length(valor->'materiales') productos,
       jsonb_array_length(valor->'configuraciones') configuraciones,
       jsonb_array_length(valor->'codigos') codigos,
       has_function_privilege('anon','public.consumibles_catalogo_ingresos()','execute') anon_permitido,
       (select prosecdef from pg_proc where oid='public.consumibles_catalogo_ingresos()'::regprocedure) usa_permisos_del_creador
from datos;
