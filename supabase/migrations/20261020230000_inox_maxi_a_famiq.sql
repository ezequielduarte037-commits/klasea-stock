-- Los materiales inox 316 de 20261020220000 son de Famiq, no de Maxi Herrero.
--
-- Ezequiel aclaró (20/10/2026): Maxi Herrero usa estos caños, tubos y chapas
-- para fabricar los herrajes, pero los compramos nosotros a Famiq. No hay en el
-- sistema un campo para "material que se le entrega al herrero", así que el
-- proveedor pasa a Famiq y queda la observación "Material para Maxi Herrero".
-- Las cantidades en la matriz de cada línea no cambian.

begin;

create temp table _inox on commit drop as
select id from public.panol_materiales where origen = 'maxi_inox_20oct2026';

do $$
begin
  if (select count(*) from _inox) <> 17 then
    raise exception 'No están los 17 materiales inox esperados: revisar a mano';
  end if;
  if not exists (select 1 from public.panol_proveedores where id = '0d87c851-0a3f-4828-b17c-d7486ba41f7a' and nombre = 'Famiq') then
    raise exception 'No está el proveedor Famiq';
  end if;
end $$;

update public.panol_materiales m
   set proveedor = 'Famiq',
       proveedor_id = '0d87c851-0a3f-4828-b17c-d7486ba41f7a',
       notas = concat_ws(' · ', nullif(m.notas, ''), 'Material para Maxi Herrero (fabricación de herrajes)')
 where m.id in (select id from _inox);

delete from public.panol_material_proveedores
 where material_id in (select id from _inox)
   and proveedor_id = '58b18365-51ef-44f1-a818-ddf84a9421ad';

insert into public.panol_material_proveedores (material_id, proveedor_id)
select id, '0d87c851-0a3f-4828-b17c-d7486ba41f7a' from _inox
on conflict do nothing;

commit;
