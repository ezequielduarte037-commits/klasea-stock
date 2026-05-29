-- WhatsApp bot · tablas base
-- ─────────────────────────────────────────────────────────────────────────────
-- user_phones:
--   Asociación 1-a-1 entre un perfil del sistema y un número de WhatsApp.
--   Durante la verificación, phone = null y pending_code está poblado.
--   Una vez verificado, phone tiene el número en formato E.164 (sin "+",
--   ejemplo "5491136368671") y pending_code se limpia.
--
-- bot_conversations:
--   Estado de conversación multi-turno, indexado por teléfono.
--   Permite seguir flows tipo "creando pedido" donde el usuario manda
--   primero la descripción, después la urgencia, después confirma.

create extension if not exists pgcrypto;

-- ── user_phones ────────────────────────────────────────────────────────────
create table if not exists public.user_phones (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text unique,
  verified_at timestamptz,
  pending_code text,
  pending_code_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_phones is
  'Vinculación entre perfil del sistema y número de WhatsApp. Mientras dura la verificación, phone es null y pending_code tiene el código de 6 dígitos.';

create index if not exists idx_user_phones_phone
  on public.user_phones(phone)
  where phone is not null;

create index if not exists idx_user_phones_pending_code
  on public.user_phones(pending_code)
  where pending_code is not null;

drop trigger if exists trg_user_phones_updated_at on public.user_phones;
create trigger trg_user_phones_updated_at
  before update on public.user_phones
  for each row execute function public.touch_updated_at();

alter table public.user_phones enable row level security;

do $$
begin
  -- Cada usuario puede leer su propia fila
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_phones' and policyname = 'users read own phone') then
    create policy "users read own phone"
      on public.user_phones for select
      using (user_id = auth.uid());
  end if;

  -- Cada usuario puede crear/actualizar su propia fila desde la web
  -- (para generar código de verificación). El insert lo hace el frontend.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_phones' and policyname = 'users upsert own phone') then
    create policy "users upsert own phone"
      on public.user_phones for insert
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_phones' and policyname = 'users update own phone') then
    create policy "users update own phone"
      on public.user_phones for update
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  -- Admin puede ver/borrar todas (para gestión)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_phones' and policyname = 'admin manages all phones') then
    create policy "admin manages all phones"
      on public.user_phones for all
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and (p.is_admin or p.role = 'admin')
        )
      );
  end if;
end $$;

-- ── bot_conversations ──────────────────────────────────────────────────────
create table if not exists public.bot_conversations (
  phone text primary key,
  user_id uuid references public.profiles(id) on delete set null,
  state text not null default 'idle',
  context jsonb not null default '{}'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bot_conversations is
  'Estado de conversación multi-turno por número de teléfono. state controla flows pendientes (ej: awaiting_priority, awaiting_confirm). context guarda el draft del pedido en construcción.';

create index if not exists idx_bot_conversations_user
  on public.bot_conversations(user_id)
  where user_id is not null;

create index if not exists idx_bot_conversations_state
  on public.bot_conversations(state)
  where state <> 'idle';

drop trigger if exists trg_bot_conversations_updated_at on public.bot_conversations;
create trigger trg_bot_conversations_updated_at
  before update on public.bot_conversations
  for each row execute function public.touch_updated_at();

alter table public.bot_conversations enable row level security;

-- Solo el service role (edge function) accede a esta tabla.
-- No exponemos al frontend ni a usuarios autenticados normales.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bot_conversations' and policyname = 'admin reads bot conversations') then
    create policy "admin reads bot conversations"
      on public.bot_conversations for select
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and (p.is_admin or p.role = 'admin')
        )
      );
  end if;
end $$;

-- ── RPC: generar código de vinculación (callable desde el frontend) ────────
create or replace function public.generate_phone_verification_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- Código de 6 dígitos. Concentramos entropía en strings tipo "473829".
  v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');

  insert into public.user_phones (user_id, pending_code, pending_code_expires_at)
  values (v_uid, v_code, now() + interval '10 minutes')
  on conflict (user_id) do update
    set pending_code            = excluded.pending_code,
        pending_code_expires_at = excluded.pending_code_expires_at,
        updated_at              = now();

  return v_code;
end;
$$;

grant execute on function public.generate_phone_verification_code() to authenticated;

comment on function public.generate_phone_verification_code is
  'Genera un código de 6 dígitos válido por 10 minutos para vincular WhatsApp. El usuario debe enviar "vincular <código>" al bot para confirmar.';

-- ── RPC: desvincular teléfono propio ──────────────────────────────────────
create or replace function public.unlink_phone()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  delete from public.user_phones where user_id = auth.uid();
end;
$$;

grant execute on function public.unlink_phone() to authenticated;
