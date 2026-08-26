-- Cuenta para demostraciones comerciales sobre datos reales.
-- Conserva un rol operativo en profiles para que las RLS de lectura existentes
-- funcionen, pero toda escritura del usuario queda bloqueada en la base.

begin;

alter table public.profiles
  add column if not exists is_demo boolean not null default false;

create or replace function public.es_cuenta_demo(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_demo
    from public.profiles p
    where p.id = p_uid
  ), false);
$$;

revoke all on function public.es_cuenta_demo(uuid) from public;
grant execute on function public.es_cuenta_demo(uuid) to authenticated;

create or replace function public.bloquear_escritura_cuenta_demo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.es_cuenta_demo(auth.uid()) then
    raise exception 'La cuenta de presentacion es de solo lectura.'
      using errcode = '42501';
  end if;
  return null;
end;
$$;

revoke all on function public.bloquear_escritura_cuenta_demo() from public;

-- El trigger también cubre RPC SECURITY DEFINER: auth.uid() conserva al usuario
-- que inició la llamada, aunque la función tenga privilegios elevados.
do $$
declare
  v_table record;
begin
  for v_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'drop trigger if exists trg_bloquear_escritura_cuenta_demo on %I.%I',
      v_table.schema_name,
      v_table.table_name
    );
    execute format(
      'create trigger trg_bloquear_escritura_cuenta_demo before insert or update or delete on %I.%I for each statement execute function public.bloquear_escritura_cuenta_demo()',
      v_table.schema_name,
      v_table.table_name
    );
  end loop;
end $$;

-- Evita adjuntos huérfanos desde una cuenta demo. Si una instalación de
-- Supabase no permite alterar storage.objects, no se frena el resto del cambio.
do $$
begin
  execute 'drop trigger if exists trg_bloquear_escritura_cuenta_demo on storage.objects';
  execute 'create trigger trg_bloquear_escritura_cuenta_demo before insert or update or delete on storage.objects for each statement execute function public.bloquear_escritura_cuenta_demo()';
exception
  when insufficient_privilege then
    raise notice 'No se pudo proteger storage.objects; las tablas public siguen en solo lectura para demo.';
end $$;

comment on column public.profiles.is_demo is
  'Cuenta externa de presentacion: UI sin importes y escrituras bloqueadas por trigger.';

commit;
