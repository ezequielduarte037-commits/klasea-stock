-- Permisos operativos de panol para Oficina Tecnica.
-- Tecnica puede operar stock/recepcion/egresos, pero NO se convierte en manager de compras.

create or replace function public.is_panol_manager(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and (
        coalesce(p.is_admin, false)
        or p.role in ('admin', 'compras', 'tecnica')
      )
  );
$$;

create or replace function public.is_panol_viewer(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and (
        coalesce(p.is_admin, false)
        or p.role in ('admin', 'compras', 'tecnica', 'oficina')
      )
  );
$$;

create or replace function public.can_see_envio(p_sede text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    public.is_panol_viewer(p_uid)
    or exists (
      select 1
      from public.profiles p
      where p.id = p_uid
        and p.role = 'panol'
        and coalesce(p.sede, '') in ('Ambas', p_sede)
    )
  );
$$;

create or replace function public.can_receive_envio(p_sede text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_panol_manager(p_uid) or exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and p.role = 'panol'
      and coalesce(p.sede, '') in ('Ambas', p_sede)
  );
$$;
