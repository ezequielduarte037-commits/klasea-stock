begin;

-- Sólo fusiona identidades verificadas. Los nombres con barra son alternativas
-- y los pedidos ya emitidos conservan su proveedor histórico.
do $$
declare
  v_iriarte uuid;
  v_casa_iriarte uuid;
  v_powerbat uuid;
  v_power_bat uuid;
begin
  select id into strict v_iriarte from public.panol_proveedores where nombre = 'Iriarte';
  select id into strict v_casa_iriarte from public.panol_proveedores where nombre = 'Casa Iriarte';
  select id into strict v_powerbat from public.panol_proveedores where nombre = 'PowerBat';
  select id into strict v_power_bat from public.panol_proveedores where nombre = 'Power Bat';

  update public.panol_materiales
     set proveedor_id = v_iriarte, proveedor = 'Iriarte'
   where proveedor_id = v_casa_iriarte;
  update public.panol_precios
     set proveedor_id = v_iriarte
   where proveedor_id = v_casa_iriarte;
  update public.panol_material_proveedores
     set proveedor_id = v_iriarte
   where proveedor_id = v_casa_iriarte
     and not exists (
       select 1 from public.panol_material_proveedores actual
        where actual.material_id = panol_material_proveedores.material_id
          and actual.proveedor_id = v_iriarte
     );

  update public.panol_materiales
     set proveedor_id = v_powerbat, proveedor = 'PowerBat'
   where proveedor_id = v_power_bat;
  update public.panol_precios
     set proveedor_id = v_powerbat
   where proveedor_id = v_power_bat;
  update public.panol_material_proveedores
     set proveedor_id = v_powerbat
   where proveedor_id = v_power_bat
     and not exists (
       select 1 from public.panol_material_proveedores actual
        where actual.material_id = panol_material_proveedores.material_id
          and actual.proveedor_id = v_powerbat
     );
  update public.panol_proveedores
     set activo = false,
         notas = concat_ws(' ', nullif(notas, ''), 'Alias de PowerBat; referencias activas fusionadas.')
   where id = v_power_bat and activo is distinct from false;
end;
$$;

commit;
