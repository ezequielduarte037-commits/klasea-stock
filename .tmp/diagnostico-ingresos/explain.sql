do $$ begin perform set_config('request.jwt.claim.sub',(select id::text from public.profiles where is_admin is true limit 1),true); end $$;
set local role authenticated;
explain (analyze,buffers,format json) select * from public.consumibles_config order by material_id limit 1000;
explain (analyze,buffers,format json) select id,codigo,codigo_barra,descripcion,alias,notas,unidad_medida,categoria_id,imagen_url,ubicacion,stock_minimo,peso_unitario_g,peso_calibrado_at,proveedor,activo from public.panol_materiales where es_consumible is true and (activo is null or activo is true) order by descripcion,id limit 1000;
