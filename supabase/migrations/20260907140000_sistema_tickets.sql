-- Tickets: el canal para pedir mejoras y reportar problemas del sistema.
--
-- POR QUÉ. Hoy los pedidos al sistema llegan por WhatsApp, de palabra o en un
-- papel, y se pierden: nadie sabe qué se pidió, quién lo pidió, si alguien lo
-- está mirando ni por qué se decidió que no. Esto le da a cada pedido un lugar,
-- un estado y un hilo, para que el que lo pidió pueda ver cómo va sin
-- preguntar.
--
-- TRES TABLAS Y NADA MÁS:
--
--   sistema_tickets              el pedido, con su estado
--   sistema_ticket_votos         "a mí también me hace falta" (uno por persona)
--   sistema_ticket_seguimiento   el hilo: comentarios Y cambios de estado
--
-- El seguimiento es UNA tabla y no dos porque se lee como una sola línea de
-- tiempo. Un cambio de estado y un comentario son lo mismo desde el lado del
-- que espera una respuesta: algo pasó con mi pedido. Los cambios de estado los
-- escribe un trigger, así que no dependen de que el front se acuerde.
--
-- Los votos son lo que hace que esto sirva para decidir. Una lista de sesenta
-- pedidos sin orden es una lista que nadie mira; con votos, lo que le duele a
-- ocho personas sube solo.

-- ─────────────────────────────────────────────────────────────────────────────
-- Quién administra los tickets: los mismos que administran el sistema.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.puede_gestionar_tickets(p_uid uuid)
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
      and (coalesce(p.is_admin, false) or p.role in ('admin', 'tecnica'))
  );
$$;

comment on function public.puede_gestionar_tickets(uuid) is
  'Puede mover el estado de un ticket, priorizarlo y asignarlo. Cualquier usuario puede crear y comentar.';


-- ─────────────────────────────────────────────────────────────────────────────
-- El ticket
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sistema_tickets (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  detalle      text,
  -- Qué es. Cambia cómo se lee, no cómo se procesa.
  tipo         text not null default 'mejora'
                 check (tipo in ('mejora', 'problema', 'pedido')),
  -- De qué parte del sistema habla. Texto libre a propósito: obligar a elegir
  -- de una lista hace que la gente elija cualquier cosa con tal de seguir.
  pantalla     text,
  estado       text not null default 'nuevo'
                 check (estado in ('nuevo', 'en_curso', 'hecho', 'descartado')),
  -- La pone quien gestiona, no quien pide: si la elige el que pide, todo es
  -- urgente y la prioridad deja de ordenar nada.
  prioridad    text not null default 'sin_definir'
                 check (prioridad in ('sin_definir', 'baja', 'media', 'alta')),
  autor_id     uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  asignado_a   uuid references public.profiles(id) on delete set null,
  -- Qué se hizo, o por qué no se va a hacer. Cerrar sin explicar es la forma
  -- más rápida de que nadie vuelva a cargar un ticket.
  resolucion   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  cerrado_at   timestamptz
);

create index if not exists sistema_tickets_estado_idx  on public.sistema_tickets (estado, created_at desc);
create index if not exists sistema_tickets_autor_idx   on public.sistema_tickets (autor_id);

comment on table public.sistema_tickets is
  'Pedidos de mejora, problemas y solicitudes sobre el sistema. Los carga cualquier usuario; el estado lo mueve quien gestiona.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Votos: uno por persona y por ticket, garantizado por la clave primaria.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sistema_ticket_votos (
  ticket_id  uuid not null references public.sistema_tickets(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

comment on table public.sistema_ticket_votos is
  '"A mí también me hace falta". Sirve para ordenar la lista por lo que más gente necesita.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Seguimiento: comentarios y cambios de estado en la misma línea de tiempo
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sistema_ticket_seguimiento (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.sistema_tickets(id) on delete cascade,
  -- 'comentario' lo escribe una persona; 'estado' lo escribe el trigger.
  tipo       text not null default 'comentario' check (tipo in ('comentario', 'estado')),
  autor_id   uuid references public.profiles(id) on delete restrict default auth.uid(),
  cuerpo     text,
  estado_de  text,
  estado_a   text,
  created_at timestamptz not null default now()
);

create index if not exists sistema_ticket_seguimiento_ticket_idx
  on public.sistema_ticket_seguimiento (ticket_id, created_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- El cambio de estado se anota solo
--
-- Va en un trigger y no en el front porque si depende de que la pantalla se
-- acuerde de escribirlo, el día que alguien cambie un estado desde el editor
-- SQL el historial queda con un agujero y nadie se entera.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sistema_tickets_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    -- La fecha de cierre acompaña al estado: si vuelve a abrirse, se limpia.
    if new.estado in ('hecho', 'descartado') then
      new.cerrado_at := coalesce(new.cerrado_at, now());
    else
      new.cerrado_at := null;
    end if;

    insert into public.sistema_ticket_seguimiento (ticket_id, tipo, autor_id, estado_de, estado_a)
    values (new.id, 'estado', auth.uid(), old.estado, new.estado);
  end if;

  return new;
end;
$$;

drop trigger if exists sistema_tickets_auditar_trg on public.sistema_tickets;
create trigger sistema_tickets_auditar_trg
before update on public.sistema_tickets
for each row execute function public.sistema_tickets_auditar();


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Leer lo puede TODO usuario autenticado, a propósito: un tablero de pedidos
-- que cada uno ve sólo los suyos no sirve para no repetir pedidos ni para
-- votar. Escribir su propio ticket también. Mover estados, no.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.sistema_tickets             enable row level security;
alter table public.sistema_ticket_votos        enable row level security;
alter table public.sistema_ticket_seguimiento  enable row level security;

drop policy if exists "tickets lectura" on public.sistema_tickets;
create policy "tickets lectura"
on public.sistema_tickets for select to authenticated
using (true);

drop policy if exists "tickets alta" on public.sistema_tickets;
create policy "tickets alta"
on public.sistema_tickets for insert to authenticated
with check (autor_id = auth.uid());

-- El autor puede corregir lo que escribió MIENTRAS NADIE LO HAYA TOMADO. Una
-- vez que está en curso, editar el pedido por abajo deja al que lo está
-- resolviendo trabajando sobre otra cosa.
drop policy if exists "tickets edicion" on public.sistema_tickets;
create policy "tickets edicion"
on public.sistema_tickets for update to authenticated
using (
  public.puede_gestionar_tickets(auth.uid())
  or (autor_id = auth.uid() and estado = 'nuevo')
)
with check (
  public.puede_gestionar_tickets(auth.uid())
  or (autor_id = auth.uid() and estado = 'nuevo')
);

drop policy if exists "tickets baja" on public.sistema_tickets;
create policy "tickets baja"
on public.sistema_tickets for delete to authenticated
using (
  public.puede_gestionar_tickets(auth.uid())
  or (autor_id = auth.uid() and estado = 'nuevo')
);

-- Votos: se ven todos, cada uno pone y saca el suyo.
drop policy if exists "tickets votos lectura" on public.sistema_ticket_votos;
create policy "tickets votos lectura"
on public.sistema_ticket_votos for select to authenticated
using (true);

drop policy if exists "tickets votos alta" on public.sistema_ticket_votos;
create policy "tickets votos alta"
on public.sistema_ticket_votos for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "tickets votos baja" on public.sistema_ticket_votos;
create policy "tickets votos baja"
on public.sistema_ticket_votos for delete to authenticated
using (user_id = auth.uid());

-- Seguimiento: lo lee cualquiera, comenta cualquiera, y no se edita ni se
-- borra. Un hilo que se puede reescribir después no sirve como historial.
drop policy if exists "tickets seguimiento lectura" on public.sistema_ticket_seguimiento;
create policy "tickets seguimiento lectura"
on public.sistema_ticket_seguimiento for select to authenticated
using (true);

drop policy if exists "tickets seguimiento alta" on public.sistema_ticket_seguimiento;
create policy "tickets seguimiento alta"
on public.sistema_ticket_seguimiento for insert to authenticated
with check (tipo = 'comentario' and autor_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- CONTROL — después de correr, los tres tienen que dar lo esperado
-- ─────────────────────────────────────────────────────────────────────────────
select 'tablas creadas' as control, count(*) as debe_dar_3
from information_schema.tables
where table_schema = 'public'
  and table_name in ('sistema_tickets', 'sistema_ticket_votos', 'sistema_ticket_seguimiento')
union all
select 'policies', count(*)
from pg_policies
where schemaname = 'public'
  and tablename in ('sistema_tickets', 'sistema_ticket_votos', 'sistema_ticket_seguimiento')
union all
select 'sos gestor de tickets (1 = si)', case when public.puede_gestionar_tickets(auth.uid()) then 1 else 0 end;
