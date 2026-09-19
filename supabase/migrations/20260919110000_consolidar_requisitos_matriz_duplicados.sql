-- Una matriz puede haber quedado con dos filas para la misma necesidad:
-- el requisito genérico y el SKU que ya se cargaba directo antes de migrarlo.
-- Si el SKU está vinculado y coincide en modelo, variante y cantidad, se toma
-- como estándar del requisito y se elimina únicamente esa duplicación.

create or replace function public.panol_matriz_quitar_duplicado_producto_directo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.producto_predeterminado_id is null
     or new.producto_predeterminado_id = new.material_id
     or not exists (
       select 1
         from public.panol_materiales requisito
        where requisito.id = new.material_id
          and requisito.es_requisito is true
     ) then
    return new;
  end if;

  delete from public.panol_material_modelo directo
   where directo.id <> new.id
     and directo.material_id = new.producto_predeterminado_id
     and regexp_replace(regexp_replace(upper(coalesce(directo.modelo, '')), '[^A-Z0-9]+', '', 'g'), '^K', '')
       = regexp_replace(regexp_replace(upper(coalesce(new.modelo, '')), '[^A-Z0-9]+', '', 'g'), '^K', '')
     and coalesce(directo.variante, 'standard') = coalesce(new.variante, 'standard')
     and coalesce(directo.cantidad, 0) = coalesce(new.cantidad, 0);

  return new;
end;
$$;

drop trigger if exists trg_panol_matriz_quitar_duplicado_producto_directo on public.panol_material_modelo;
create trigger trg_panol_matriz_quitar_duplicado_producto_directo
after insert or update of producto_predeterminado_id, modelo, variante, cantidad
on public.panol_material_modelo
for each row execute function public.panol_matriz_quitar_duplicado_producto_directo();

-- Recupera las listas que ya tenían el SKU directo. Sólo se infiere el
-- estándar cuando hay una única coincidencia inequívoca entre el requisito y
-- un producto compatible con la misma cantidad.
with candidatos as (
  select
    requisito.id as fila_requisito_id,
    min(directo.material_id) as producto_id
  from public.panol_material_modelo requisito
  join public.panol_materiales material_requisito
    on material_requisito.id = requisito.material_id
   and material_requisito.es_requisito is true
  join public.panol_material_modelo directo
    on regexp_replace(regexp_replace(upper(coalesce(directo.modelo, '')), '[^A-Z0-9]+', '', 'g'), '^K', '')
       = regexp_replace(regexp_replace(upper(coalesce(requisito.modelo, '')), '[^A-Z0-9]+', '', 'g'), '^K', '')
   and coalesce(directo.variante, 'standard') = coalesce(requisito.variante, 'standard')
   and coalesce(directo.cantidad, 0) = coalesce(requisito.cantidad, 0)
  join public.panol_requisito_productos vinculo
    on vinculo.requisito_material_id = requisito.material_id
   and vinculo.producto_material_id = directo.material_id
   and vinculo.activo is true
  join public.panol_materiales producto
    on producto.id = directo.material_id
   and producto.es_requisito is distinct from true
  where requisito.producto_predeterminado_id is null
  group by requisito.id
  having count(distinct directo.material_id) = 1
)
update public.panol_material_modelo requisito
   set producto_predeterminado_id = candidatos.producto_id
  from candidatos
 where requisito.id = candidatos.fila_requisito_id;
