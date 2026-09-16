-- Guardar quien cambio el estado de un pedido y de sus renglones.
--
-- POR QUE. La campanita avisaba "Estado de pedido - Comprado" al mismo que
-- acababa de apretar "Comprado". No era un bug de la campanita: la base no
-- guarda el dato en ningun lado. purchase_requests tiene created_by y
-- last_comment_author_id, pero nada que diga quien movio el estado, y
-- purchase_log -que parecia ser eso- tiene 0 filas: nunca se escribio.
--
-- Con estas dos columnas la campanita puede hacer lo obvio: no avisarte de lo
-- que hiciste vos. Es lo mismo que ya hacia con los comentarios, que si tenian
-- autor y por eso eran las unicas que no se repetian solas.
--
-- NULO ES "NO FUI YO". Cuando escribe una edge function o un proceso con
-- service_role, auth.uid() viene en null. Eso queda como autor desconocido y la
-- notificacion se manda igual, que es lo correcto: si no sabemos quien fue,
-- no podemos suponer que fuiste vos.
--
-- COLUMNAS NUEVAS SIN DEFAULT NI BACKFILL: Postgres las agrega como metadato,
-- sin reescribir la tabla. Lo unico que necesita es un bloqueo exclusivo de un
-- instante, por eso el lock_timeout.

set lock_timeout = '5s';

alter table public.purchase_requests
  add column if not exists status_changed_by uuid references public.profiles(id) on delete set null,
  add column if not exists status_changed_at timestamptz;

alter table public.purchase_request_items
  add column if not exists status_changed_by uuid references public.profiles(id) on delete set null,
  add column if not exists status_changed_at timestamptz;

comment on column public.purchase_requests.status_changed_by is
  'Quien movio el estado por ultima vez. Null = lo movio un proceso automatico. Lo usa la campanita para no avisarte de tus propios cambios.';
comment on column public.purchase_request_items.status_changed_by is
  'Quien movio el estado de este renglon por ultima vez. Null = proceso automatico.';

create or replace function public.marcar_quien_cambio_el_estado()
returns trigger
language plpgsql
as $autor$
begin
  if tg_op = 'INSERT' then
    new.status_changed_by := coalesce(new.status_changed_by, auth.uid());
    new.status_changed_at := coalesce(new.status_changed_at, now());
    return new;
  end if;

  -- Solo cuando cambia el estado. Editar el titulo o adjuntar una foto no es
  -- un cambio de estado y no tiene que reaparecer como novedad.
  if new.status is distinct from old.status then
    new.status_changed_by := auth.uid();
    new.status_changed_at := now();
  end if;
  return new;
end
$autor$;

drop trigger if exists trg_pr_quien_cambio_el_estado on public.purchase_requests;
create trigger trg_pr_quien_cambio_el_estado
  before insert or update on public.purchase_requests
  for each row execute function public.marcar_quien_cambio_el_estado();

drop trigger if exists trg_pri_quien_cambio_el_estado on public.purchase_request_items;
create trigger trg_pri_quien_cambio_el_estado
  before insert or update on public.purchase_request_items
  for each row execute function public.marcar_quien_cambio_el_estado();

comment on function public.marcar_quien_cambio_el_estado() is
  'Deja registrado quien movio el estado de un pedido o de un renglon. Solo se dispara cuando el estado cambia de verdad.';
