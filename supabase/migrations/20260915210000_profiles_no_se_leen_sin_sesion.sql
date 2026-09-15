-- profiles: que no se pueda leer sin sesion.
--
-- QUE PASABA. Con la anon key -que viaja en el JS del navegador, o sea que es
-- publica- cualquiera podia hacer un select sobre profiles y recibia las 30
-- filas: usuario, rol y is_admin de todo el astillero. Eso es la lista de a
-- quien atacar: dice quien es admin, y el mail interno se arma solo
-- (usuario@klasea.local). Verificado el 2026-09-15 con la anon key del .env.
--
-- POR QUE PASABA. La unica policy de select sobre profiles que esta en este
-- repo es la de 20260521124500_purchase_requests.sql y pide
-- "auth.uid() is not null", que para anon es falso. O sea que en la base hay
-- otra policy mas permisiva, creada a mano desde el panel de Supabase y que
-- nunca entro como migracion. Por eso esto primero borra lo que encuentre y
-- despues deja una sola, explicita.
--
-- LO QUE NO CAMBIA. Un usuario logueado sigue leyendo todos los perfiles: los
-- necesita para poner nombre al autor de un comentario, al que pidio una
-- compra y a la lista de Configuracion. Lo unico que se corta es el acceso
-- sin sesion.

alter table public.profiles enable row level security;

-- Borra cualquier policy de SELECT sobre profiles que alcance a anon o a
-- public. No se pueden nombrar de antemano porque se crearon fuera del repo.
do $limpiar$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('SELECT', 'ALL')
      and (roles is null or roles && array['anon', 'public']::name[])
  loop
    execute format('drop policy if exists %I on public.profiles', p.policyname);
    raise notice 'profiles: policy borrada -> %', p.policyname;
  end loop;
end
$limpiar$;

drop policy if exists "authenticated users can read basic profiles" on public.profiles;

create policy "perfiles visibles solo con sesion"
  on public.profiles for select
  to authenticated
  using (true);

comment on table public.profiles is
  'Perfiles del personal interno. Solo se leen con sesion iniciada: la anon key es publica y sin esta restriccion exponia la lista de administradores.';
