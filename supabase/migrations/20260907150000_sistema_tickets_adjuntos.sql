-- Capturas en los tickets.
--
-- POR QUÉ. "No me deja guardar" no se puede resolver; una captura de la
-- pantalla con el error sí. Es la diferencia entre tres idas y vueltas
-- preguntando qué decía el cartel y arreglarlo de una.
--
-- El archivo va al bucket `ticket-attachments`, que ya existe y ya es público
-- -lo usa el panel del cliente-, bajo el prefijo `sistema/` para no mezclarse
-- con lo de allá. Acá sólo se guarda a qué ticket pertenece cada archivo.
--
-- Se corre después de 20260907140000_sistema_tickets.sql.

create table if not exists public.sistema_ticket_adjuntos (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.sistema_tickets(id) on delete cascade,
  url        text not null,
  nombre     text,
  tipo       text,
  autor_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists sistema_ticket_adjuntos_ticket_idx
  on public.sistema_ticket_adjuntos (ticket_id, created_at);

comment on table public.sistema_ticket_adjuntos is
  'Capturas y fotos de un ticket. El archivo vive en el bucket ticket-attachments, prefijo sistema/.';

alter table public.sistema_ticket_adjuntos enable row level security;

drop policy if exists "tickets adjuntos lectura" on public.sistema_ticket_adjuntos;
create policy "tickets adjuntos lectura"
on public.sistema_ticket_adjuntos for select to authenticated
using (true);

drop policy if exists "tickets adjuntos alta" on public.sistema_ticket_adjuntos;
create policy "tickets adjuntos alta"
on public.sistema_ticket_adjuntos for insert to authenticated
with check (autor_id = auth.uid());

-- Borra el que lo subió, o quien gestiona. La fila se va sola si se borra el
-- ticket (on delete cascade); el archivo en el bucket queda, que es barato y
-- evita perder algo por un clic de más.
drop policy if exists "tickets adjuntos baja" on public.sistema_ticket_adjuntos;
create policy "tickets adjuntos baja"
on public.sistema_ticket_adjuntos for delete to authenticated
using (autor_id = auth.uid() or public.puede_gestionar_tickets(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────────
-- CONTROL
-- ─────────────────────────────────────────────────────────────────────────────
select 'tabla de adjuntos' as control, count(*) as debe_dar_1
from information_schema.tables
where table_schema = 'public' and table_name = 'sistema_ticket_adjuntos'
union all
select 'policies', count(*)
from pg_policies
where schemaname = 'public' and tablename = 'sistema_ticket_adjuntos';
