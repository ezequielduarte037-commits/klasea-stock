-- Purchase Requests: denormalizar el autor del último comentario
-- Antes el cliente pedía todos los comments para calcular el "sin leer".
-- Ahora viaja en la propia fila de purchase_requests.

alter table public.purchase_requests
  add column if not exists last_comment_at        timestamptz,
  add column if not exists last_comment_author_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_purchase_requests_last_comment_at
  on public.purchase_requests(last_comment_at desc nulls last);

-- Trigger: mantener last_comment_* sincronizado
create or replace function public.purchase_requests_sync_last_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.purchase_requests
       set last_comment_at        = new.created_at,
           last_comment_author_id = new.author_id
     where id = new.request_id;
    return new;
  elsif (tg_op = 'DELETE') then
    -- Si se borra un comment, recalcular el último (puede quedar NULL)
    update public.purchase_requests pr
       set last_comment_at        = sub.last_at,
           last_comment_author_id = sub.last_author
      from (
        select request_id,
               max(created_at) as last_at,
               (array_agg(author_id order by created_at desc))[1] as last_author
          from public.request_comments
         where request_id = old.request_id
         group by request_id
      ) sub
     where pr.id = old.request_id
       and sub.request_id = pr.id;

    -- Si ya no quedan comments, blanquear
    if not exists (select 1 from public.request_comments where request_id = old.request_id) then
      update public.purchase_requests
         set last_comment_at = null,
             last_comment_author_id = null
       where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_request_comments_sync_last on public.request_comments;
create trigger trg_request_comments_sync_last
  after insert or delete on public.request_comments
  for each row execute function public.purchase_requests_sync_last_comment();

-- Backfill inicial
update public.purchase_requests pr
   set last_comment_at        = sub.last_at,
       last_comment_author_id = sub.last_author
  from (
    select request_id,
           max(created_at) as last_at,
           (array_agg(author_id order by created_at desc))[1] as last_author
      from public.request_comments
     group by request_id
  ) sub
 where pr.id = sub.request_id;
