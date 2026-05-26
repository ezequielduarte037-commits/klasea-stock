-- Purchase Requests module
-- Run from Supabase SQL editor or via `supabase db push`.

create extension if not exists pgcrypto;

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  photo_url text,
  photo_path text,
  priority text not null default 'media'
    check (priority in ('baja', 'media', 'alta', 'urgente')),
  status text not null default 'nuevo'
    check (status in ('nuevo', 'en_revision', 'cotizando', 'comprado', 'recibido', 'cancelado')),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  project_id uuid references public.produccion_obras(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  needed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'purchase_requests'
      and constraint_name = 'purchase_requests_project_id_fkey'
  ) then
    alter table public.purchase_requests drop constraint purchase_requests_project_id_fkey;
  end if;

  update public.purchase_requests pr
  set project_id = null
  where project_id is not null
    and not exists (
      select 1
      from public.produccion_obras po
      where po.id = pr.project_id
    );

  alter table public.purchase_requests
    add constraint purchase_requests_project_id_fkey
    foreign key (project_id) references public.produccion_obras(id) on delete set null;
end $$;

comment on table public.purchase_requests is 'Internal purchase requests replacing email purchase flows.';
comment on column public.purchase_requests.project_id is 'Related project/casco. Current project catalog is public.produccion_obras.';

create table if not exists public.request_followers (
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

comment on table public.request_followers is 'CC/followers for purchase requests. Prefer this over uuid arrays for RLS, joins, auditability and notifications.';

create table if not exists public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.request_comment_mentions (
  comment_id uuid not null references public.request_comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, mentioned_user_id)
);

create index if not exists idx_purchase_requests_created_by on public.purchase_requests(created_by);
create index if not exists idx_purchase_requests_project_id on public.purchase_requests(project_id);
create index if not exists idx_purchase_requests_status on public.purchase_requests(status);
create index if not exists idx_purchase_requests_priority on public.purchase_requests(priority);
create index if not exists idx_purchase_requests_created_at on public.purchase_requests(created_at desc);
create index if not exists idx_request_followers_user_id on public.request_followers(user_id);
create index if not exists idx_request_comments_request_id on public.request_comments(request_id, created_at);

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'authenticated users can read basic profiles') then
    create policy "authenticated users can read basic profiles"
      on public.profiles for select
      using (auth.uid() is not null);
  end if;
end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_purchase_requests_updated_at on public.purchase_requests;
create trigger trg_purchase_requests_updated_at
before update on public.purchase_requests
for each row execute function public.touch_updated_at();

drop trigger if exists trg_request_comments_updated_at on public.request_comments;
create trigger trg_request_comments_updated_at
before update on public.request_comments
for each row execute function public.touch_updated_at();

create or replace function public.is_purchase_user(p_uid uuid)
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
      and (coalesce(p.is_admin, false) or p.role in ('admin', 'compras'))
  );
$$;

create or replace function public.same_role_as_request(p_request_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.purchase_requests pr
    join public.profiles creator on creator.id = pr.created_by
    join public.profiles viewer on viewer.id = p_uid
    where pr.id = p_request_id
      and viewer.role = creator.role
      and viewer.role in ('tecnica', 'oficina', 'panol')
  );
$$;

create or replace function public.can_access_purchase_request(p_request_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    public.is_purchase_user(p_uid)
    or exists (
      select 1
      from public.purchase_requests pr
      where pr.id = p_request_id
        and (pr.created_by = p_uid or pr.assigned_to = p_uid)
    )
    or exists (
      select 1
      from public.request_followers rf
      where rf.request_id = p_request_id
        and rf.user_id = p_uid
    )
    or public.same_role_as_request(p_request_id, p_uid)
  );
$$;

drop function if exists public.same_department_as_request(uuid, uuid);

alter table public.purchase_requests enable row level security;
alter table public.request_followers enable row level security;
alter table public.request_comments enable row level security;
alter table public.request_comment_mentions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_requests' and policyname = 'purchase requests are visible to participants') then
    create policy "purchase requests are visible to participants"
      on public.purchase_requests for select
      using (public.can_access_purchase_request(id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_requests' and policyname = 'authenticated users can create purchase requests') then
    create policy "authenticated users can create purchase requests"
      on public.purchase_requests for insert
      with check (auth.uid() is not null and created_by = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_requests' and policyname = 'participants can update visible purchase requests') then
    create policy "participants can update visible purchase requests"
      on public.purchase_requests for update
      using (public.can_access_purchase_request(id, auth.uid()))
      with check (public.can_access_purchase_request(id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_requests' and policyname = 'creators and compras can delete purchase requests') then
    create policy "creators and compras can delete purchase requests"
      on public.purchase_requests for delete
      using (created_by = auth.uid() or public.is_purchase_user(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'request_followers' and policyname = 'followers visible to request participants') then
    create policy "followers visible to request participants"
      on public.request_followers for select
      using (public.can_access_purchase_request(request_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'request_followers' and policyname = 'participants can add followers') then
    create policy "participants can add followers"
      on public.request_followers for insert
      with check (public.can_access_purchase_request(request_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'request_followers' and policyname = 'participants can remove followers') then
    create policy "participants can remove followers"
      on public.request_followers for delete
      using (public.can_access_purchase_request(request_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'request_comments' and policyname = 'comments visible to request participants') then
    create policy "comments visible to request participants"
      on public.request_comments for select
      using (public.can_access_purchase_request(request_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'request_comments' and policyname = 'participants can comment') then
    create policy "participants can comment"
      on public.request_comments for insert
      with check (author_id = auth.uid() and public.can_access_purchase_request(request_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'request_comments' and policyname = 'authors can edit own comments') then
    create policy "authors can edit own comments"
      on public.request_comments for update
      using (author_id = auth.uid())
      with check (author_id = auth.uid() and public.can_access_purchase_request(request_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'request_comment_mentions' and policyname = 'mentions visible to request participants') then
    create policy "mentions visible to request participants"
      on public.request_comment_mentions for select
      using (
        exists (
          select 1 from public.request_comments rc
          where rc.id = comment_id
            and public.can_access_purchase_request(rc.request_id, auth.uid())
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'request_comment_mentions' and policyname = 'comment authors can create mentions') then
    create policy "comment authors can create mentions"
      on public.request_comment_mentions for insert
      with check (
        exists (
          select 1 from public.request_comments rc
          where rc.id = comment_id
            and rc.author_id = auth.uid()
            and public.can_access_purchase_request(rc.request_id, auth.uid())
        )
      );
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'purchase-request-photos',
  'purchase-request-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'purchase request photos readable') then
    create policy "purchase request photos readable"
      on storage.objects for select
      using (bucket_id = 'purchase-request-photos');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated users upload purchase request photos') then
    create policy "authenticated users upload purchase request photos"
      on storage.objects for insert
      with check (bucket_id = 'purchase-request-photos' and auth.uid() is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'owners manage purchase request photos') then
    create policy "owners manage purchase request photos"
      on storage.objects for update
      using (bucket_id = 'purchase-request-photos' and owner = auth.uid())
      with check (bucket_id = 'purchase-request-photos' and owner = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'owners delete purchase request photos') then
    create policy "owners delete purchase request photos"
      on storage.objects for delete
      using (bucket_id = 'purchase-request-photos' and (owner = auth.uid() or public.is_purchase_user(auth.uid())));
  end if;
end $$;
