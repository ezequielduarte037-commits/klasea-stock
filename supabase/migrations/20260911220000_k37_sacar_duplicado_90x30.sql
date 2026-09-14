-- Saca la fila estándar de más del buje 90x30 en el K37.
--
-- El "Buje de bronce 90x30 para tuerca de hélice" quedó con sus dos filas en el
-- K37: la condicional -que es la que corresponde, porque es una tuerca de hélice
-- y sin eje no hay hélice- y una estándar creada después, que lo hace aparecer
-- en la matriz del barco con el cartel "Base" como si todo K37 lo llevara.
--
-- La fila de más no la escribió nadie a mano queriendo: la creaba la pantalla.
-- setCantidadModelo escribía siempre variante = 'standard' sin mirar con qué
-- variante estaba cargado el material, así que editarle la cantidad a cualquier
-- ítem del paquete de línea de eje le agregaba una fila estándar al lado. Eso ya
-- está corregido en el código; esto limpia lo que alcanzó a crear.
--
-- Se borra sólo la estándar del 90x30 en el K37. La condicional queda, y las
-- filas del K52 -donde esta tuerca sí va siempre- no se tocan.

begin;

delete from public.panol_material_modelo mm
 using public.panol_materiales m
 where mm.material_id = m.id
   and m.descripcion = 'Buje de bronce 90x30 para tuerca de hélice'
   and mm.modelo = '37'
   and mm.variante = 'standard'
   -- Sólo si la condicional existe: si por lo que sea la estándar fuera la única
   -- fila del K37, borrarla sacaría el material de la línea en vez de corregirlo.
   and exists (
     select 1 from public.panol_material_modelo eje
      where eje.material_id = mm.material_id
        and eje.modelo = '37'
        and eje.variante = 'linea_eje'
   );

commit;

-- ── Verificación ──────────────────────────────────────────────────────────
-- Tiene que quedar cero duplicados en toda la matriz, y el 90x30 con una sola
-- fila en el K37: la condicional.

select 'duplicados en toda la matriz' as control, count(*)::text as valor
  from public.panol_material_modelo a
 where exists (
   select 1 from public.panol_material_modelo b
    where b.material_id = a.material_id
      and b.modelo = a.modelo
      and b.variante is distinct from a.variante
 )
union all
select 'filas del 90x30 en K37', string_agg(mm.variante || ' x ' || mm.cantidad, ' / ')
  from public.panol_material_modelo mm
  join public.panol_materiales m on m.id = mm.material_id
 where m.descripcion = 'Buje de bronce 90x30 para tuerca de hélice'
   and mm.modelo = '37';
