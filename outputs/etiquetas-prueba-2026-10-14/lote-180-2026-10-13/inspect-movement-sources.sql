select 'consumibles_tipos' as fuente, jsonb_agg(x) as detalle from
(select tipo,origen,count(*) as movimientos,count(distinct material_id) as productos,min(created_at) as desde,max(created_at) as hasta from public.consumibles_movimientos where anulado_at is null group by tipo,origen) x;
select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%movim%' or table_name ilike '%consum%') order by table_name;
select count(*) as activos_configurados,count(*) filter (where m.es_consumible=true) as activos_consumibles from public.consumibles_config c join public.panol_materiales m on m.id=c.material_id where m.activo is distinct from false and nullif(btrim(c.codigo_etiqueta),'') is not null;
