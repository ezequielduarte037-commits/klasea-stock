-- Permite que el rol panol consulte el plano y el catalogo necesario para
-- ubicar stock. No habilita editar estanterias ni modificar materiales.
-- Idempotente: se puede ejecutar mas de una vez.

do $$
begin
  if to_regclass('public.panol_estanterias') is not null then
    execute 'grant select on public.panol_estanterias to authenticated';
    execute 'drop policy if exists "panol puede consultar estanterias" on public.panol_estanterias';
    execute $policy$
      create policy "panol puede consultar estanterias"
        on public.panol_estanterias for select
        to authenticated
        using (
          exists (
            select 1
              from public.profiles p
             where p.id = auth.uid()
               and (coalesce(p.is_admin, false) or p.role in ('admin','compras','tecnica','panol'))
          )
        )
    $policy$;
  end if;

  if to_regclass('public.panol_materiales') is not null then
    execute 'grant select on public.panol_materiales to authenticated';
    execute 'drop policy if exists "panol puede consultar materiales para mapa" on public.panol_materiales';
    execute $policy$
      create policy "panol puede consultar materiales para mapa"
        on public.panol_materiales for select
        to authenticated
        using (
          exists (
            select 1
              from public.profiles p
             where p.id = auth.uid()
               and (coalesce(p.is_admin, false) or p.role in ('admin','compras','tecnica','panol'))
          )
        )
    $policy$;
  end if;
end $$;
