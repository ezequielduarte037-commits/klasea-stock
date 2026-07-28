-- Stock mínimo operativo del catálogo de pañol.
-- NULL significa "todavía no configurado"; 0 es un mínimo explícito válido.

alter table public.panol_materiales
  add column if not exists stock_minimo numeric(14,3);

alter table public.panol_materiales
  drop constraint if exists panol_materiales_stock_minimo_check;

alter table public.panol_materiales
  add constraint panol_materiales_stock_minimo_check
  check (stock_minimo is null or stock_minimo >= 0);

comment on column public.panol_materiales.stock_minimo is
  'Umbral operativo de reposición. NULL indica que el mínimo todavía no fue definido.';

create index if not exists idx_panol_materiales_stock_minimo_configurado
  on public.panol_materiales (stock_minimo)
  where activo is distinct from false and stock_minimo is not null;

create or replace function public.panol_set_stock_minimo(
  p_material_id uuid,
  p_stock_minimo numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_material public.panol_materiales%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = auth.uid();

  if v_profile.id is null or not (
    coalesce(v_profile.is_admin, false)
    or coalesce(v_profile.role in ('admin', 'tecnica', 'compras', 'panol'), false)
  ) then
    raise exception 'No tenés permisos para cambiar el stock mínimo';
  end if;

  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo';
  end if;

  update public.panol_materiales
  set stock_minimo = p_stock_minimo
  where id = p_material_id
  returning * into v_material;

  if not found then
    raise exception 'Material no encontrado';
  end if;

  return jsonb_build_object(
    'id', v_material.id,
    'stock_minimo', v_material.stock_minimo
  );
end;
$$;

revoke all on function public.panol_set_stock_minimo(uuid, numeric) from public;
grant execute on function public.panol_set_stock_minimo(uuid, numeric) to authenticated;

create or replace function public.panol_audit_stock_minimo_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.stock_minimo is distinct from new.stock_minimo then
    insert into public.panol_materiales_audit (
      material_id,
      material_descripcion,
      campo,
      valor_anterior,
      valor_nuevo,
      actor_id,
      origen,
      contexto
    )
    values (
      new.id,
      new.descripcion,
      'stock_minimo',
      to_jsonb(old.stock_minimo),
      to_jsonb(new.stock_minimo),
      auth.uid(),
      'stock_maestro',
      jsonb_build_object('txid', txid_current())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_materiales_stock_minimo_audit on public.panol_materiales;
create trigger trg_panol_materiales_stock_minimo_audit
  after update of stock_minimo on public.panol_materiales
  for each row
  execute function public.panol_audit_stock_minimo_change();
