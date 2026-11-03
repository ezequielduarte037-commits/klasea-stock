-- Las diferencias del conteo diario también las resuelve Compras: Ezequiel
-- (03/11/2026) decidió que todo lo de stock depende de Compras, no de Técnica.
begin;

create or replace function public.panol_conteo_puede_resolver(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and exists (
    select 1 from public.profiles p
    where p.id = p_uid and (coalesce(p.is_admin, false) or p.role in ('admin', 'oficina', 'compras'))
  );
$$;

commit;
