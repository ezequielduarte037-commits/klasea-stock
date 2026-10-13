select jsonb_build_object(
 'registro',(select jsonb_agg(x) from (select tipo,origen,count(*) as movimientos,count(distinct material_id) as productos,min(created_at) as desde,max(created_at) as hasta from public.consumibles_movimientos where anulado_at is null group by tipo,origen) x),
 'historico',(select jsonb_build_object('filas',count(*),'productos',count(distinct material_id),'desde',min(coalesce(egreso_at,created_at)),'hasta',max(coalesce(egreso_at,created_at))) from public.panol_obra_materiales_snapshot where source='solicitud_consumible_retiro' and lower(coalesce(notas,'')||' '||coalesce(egreso_nota,'')) not like '%[anulado]%')
) as resumen;
