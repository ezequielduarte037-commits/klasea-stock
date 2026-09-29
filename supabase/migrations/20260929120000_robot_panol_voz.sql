-- Robot del pañol: preguntas por voz y pedidos de consumibles dictados.
--
-- El robot graba la pregunta y la manda a la edge function robot-panol-voz, que
-- valida la credencial del robot (la misma de panol_robot_feed), la pasa a
-- texto, consulta la base y devuelve la respuesta hablada.
--
-- Estas dos tablas son sólo de la función (clave de servicio). Nadie las lee
-- desde la app: RLS prendido y sin políticas.
--
-- 1. panol_robot_sesiones: lo que el robot "recuerda" entre una pregunta y la
--    siguiente (las últimas frases, el último material nombrado) y el pedido
--    que se está dictando. El pedido recién llega a Compras cuando alguien toca
--    dos veces el botón del robot; por voz sola no se manda nada.
-- 2. panol_robot_consultas: registro de cada pregunta (qué se oyó, qué
--    herramientas usó, qué contestó). Sirve para ver qué entiende mal y
--    mejorarlo. Se consulta desde el SQL editor.
begin;

create table if not exists public.panol_robot_sesiones (
  robot_id uuid primary key references public.panol_robots(id) on delete cascade,
  historial jsonb not null default '[]'::jsonb,
  pedido jsonb not null default '[]'::jsonb,
  confirmar_hasta timestamptz,
  ultimo_material_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.panol_robot_sesiones enable row level security;
revoke all on public.panol_robot_sesiones from anon, authenticated;

create table if not exists public.panol_robot_consultas (
  id bigint generated always as identity primary key,
  robot_id uuid not null references public.panol_robots(id) on delete cascade,
  oido text,
  respuesta text,
  herramientas jsonb not null default '[]'::jsonb,
  pedido_id uuid references public.purchase_requests(id) on delete set null,
  error text,
  ms integer,
  created_at timestamptz not null default now()
);
create index if not exists panol_robot_consultas_robot_fecha on public.panol_robot_consultas (robot_id, created_at desc);
alter table public.panol_robot_consultas enable row level security;
revoke all on public.panol_robot_consultas from anon, authenticated;

commit;
