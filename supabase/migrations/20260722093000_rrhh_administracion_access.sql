-- Permite que el rol 'administracion' también sea gestor de RRHH
-- y pueda ver/modificar presentismo, legajos y ausencias.

create or replace function public.rrhh_es_gestor(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (coalesce(p.is_admin, false) or lower(coalesce(p.role::text, '')) in ('admin', 'rrhh', 'administracion'))
  );
$$;
