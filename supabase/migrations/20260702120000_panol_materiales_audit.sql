-- Historial de cambios del catalogo de materiales.
-- Permite reconstruir normalizaciones/ediciones masivas campo por campo.

alter table public.panol_materiales
  add column if not exists variantes jsonb not null default '[]'::jsonb;

alter table public.panol_materiales
  add column if not exists codigo_barra text;

create table if not exists public.panol_materiales_audit (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references public.panol_materiales(id) on delete set null,
  material_descripcion text,
  campo text not null,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  actor_id uuid references public.profiles(id) on delete set null,
  origen text not null default 'trigger',
  contexto jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_panol_materiales_audit_material_created
  on public.panol_materiales_audit (material_id, created_at desc);

create index if not exists idx_panol_materiales_audit_campo_created
  on public.panol_materiales_audit (campo, created_at desc);

create index if not exists idx_panol_materiales_audit_actor_created
  on public.panol_materiales_audit (actor_id, created_at desc);

alter table public.panol_materiales_audit enable row level security;

drop policy if exists "panol_materiales_audit_select_authenticated" on public.panol_materiales_audit;
create policy "panol_materiales_audit_select_authenticated"
  on public.panol_materiales_audit
  for select
  to authenticated
  using (auth.uid() is not null);

grant select on public.panol_materiales_audit to authenticated;

create or replace function public.panol_audit_materiales_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_origin text := coalesce(nullif(current_setting('app.audit_origin', true), ''), 'trigger');
  v_context jsonb := jsonb_build_object('txid', txid_current());
  v_change record;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  for v_change in
    select *
    from (values
      ('descripcion'::text, to_jsonb(old.descripcion), to_jsonb(new.descripcion)),
      ('proveedor'::text, to_jsonb(old.proveedor), to_jsonb(new.proveedor)),
      ('proveedor_id'::text, to_jsonb(old.proveedor_id), to_jsonb(new.proveedor_id)),
      ('categoria_id'::text, to_jsonb(old.categoria_id), to_jsonb(new.categoria_id)),
      ('codigo'::text, to_jsonb(old.codigo), to_jsonb(new.codigo)),
      ('codigo_barra'::text, to_jsonb(old.codigo_barra), to_jsonb(new.codigo_barra)),
      ('unidad_medida'::text, to_jsonb(old.unidad_medida), to_jsonb(new.unidad_medida)),
      ('precio_unitario'::text, to_jsonb(old.precio_unitario), to_jsonb(new.precio_unitario)),
      ('moneda'::text, to_jsonb(old.moneda), to_jsonb(new.moneda)),
      ('variantes'::text, to_jsonb(old.variantes), to_jsonb(new.variantes)),
      ('notas'::text, to_jsonb(old.notas), to_jsonb(new.notas)),
      ('imagen_url'::text, to_jsonb(old.imagen_url), to_jsonb(new.imagen_url)),
      ('revisado'::text, to_jsonb(old.revisado), to_jsonb(new.revisado)),
      ('activo'::text, to_jsonb(old.activo), to_jsonb(new.activo))
    ) as c(campo, valor_anterior, valor_nuevo)
  loop
    if v_change.valor_anterior is distinct from v_change.valor_nuevo then
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
        v_change.campo,
        v_change.valor_anterior,
        v_change.valor_nuevo,
        v_actor,
        v_origin,
        v_context
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_panol_materiales_audit on public.panol_materiales;
create trigger trg_panol_materiales_audit
  after update on public.panol_materiales
  for each row
  execute function public.panol_audit_materiales_changes();
