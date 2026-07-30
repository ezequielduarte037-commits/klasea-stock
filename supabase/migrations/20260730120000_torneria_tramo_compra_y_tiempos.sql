-- Tornería: el tramo de compra y los tiempos que hasta ahora no se medían.
--
-- El circuito arrancaba en el astillero, como si el material ya estuviera. En la
-- practica casi todo se compra primero, y el tramo Compras -> Comprado ->
-- Astillero es donde se pierde la mayor parte del tiempo. Se agregan dos cosas:
--
--   1. El vinculo con purchase_requests, para que compras trabaje en SU pantalla
--      y torneria vea el avance sin que nadie cargue el estado dos veces.
--   2. Una marca de tiempo por transicion. compra_estado ya existia, pero sin
--      fechas: se sabia en que estado estaba cada item y nada sobre cuanto tardo.
--
-- Dos casos NO llevan tramo de compra:
--   - Los conjuntos (es_resultado): no se compran, se forman de sus componentes.
--     El trigger de conjuntos ya los deja en compra_estado = 'no_aplica'.
--   - Los que arrancan en un proveedor (origen <> 'Astillero'): van del proveedor
--     directo al taller, nunca paran en el astillero.

alter table public.torneria_items
  add column if not exists purchase_request_id uuid
    references public.purchase_requests(id) on delete set null,
  add column if not exists solicitado_at timestamptz,
  add column if not exists comprado_at timestamptz,
  add column if not exists recibido_astillero_at timestamptz;

comment on column public.torneria_items.purchase_request_id is
  'Pedido a compras que trajo este material. Su status sincroniza compra_estado, para no cargar el avance dos veces.';
comment on column public.torneria_items.solicitado_at is
  'Cuando se pidio a compras. Inicio del reloj de compra.';
comment on column public.torneria_items.comprado_at is
  'Cuando compras cerro la compra. Sirve para separar "tardo en comprarse" de "tardo en llegar".';
comment on column public.torneria_items.recibido_astillero_at is
  'Cuando el material llego al astillero. Fin del reloj de compra y arranque de la espera antes de salir al taller.';

create index if not exists idx_torneria_items_purchase_request
  on public.torneria_items (purchase_request_id)
  where purchase_request_id is not null;

-- ── Marcas de tiempo al cambiar de estado ──────────────────────────────────
-- Se estampan en trigger y no desde el frontend para que valgan igual si el
-- estado lo mueve compras, un admin desde el panel de Supabase, o el trigger de
-- sincronizacion de mas abajo.
--
-- Las fechas no se borran al avanzar: 'comprado' conserva su solicitado_at. Solo
-- se limpian si el item vuelve a 'pendiente_solicitud', que es un rehacer real.
create or replace function public.torneria_items_estampar_compra()
returns trigger
language plpgsql
as $$
begin
  if new.compra_estado is distinct from old.compra_estado then
    case new.compra_estado
      when 'pendiente_solicitud' then
        new.solicitado_at := null;
        new.comprado_at := null;
        new.recibido_astillero_at := null;
      when 'solicitado' then
        new.solicitado_at := coalesce(new.solicitado_at, now());
      when 'comprado' then
        -- Si alguien salta de pendiente a comprado, el pedido igual existio:
        -- sin solicitado_at el tiempo de compra quedaria en cero y mentiria.
        new.solicitado_at := coalesce(new.solicitado_at, now());
        new.comprado_at := coalesce(new.comprado_at, now());
      when 'recibido_astillero' then
        new.solicitado_at := coalesce(new.solicitado_at, now());
        new.recibido_astillero_at := coalesce(new.recibido_astillero_at, now());
      else
        null;
    end case;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_torneria_items_estampar_compra on public.torneria_items;
create trigger trg_torneria_items_estampar_compra
  before update on public.torneria_items
  for each row execute function public.torneria_items_estampar_compra();

-- ── Compras trabaja en su pantalla y torneria se entera ────────────────────
-- Mapeo de purchase_requests.status a compra_estado. 'nuevo', 'en_revision' y
-- 'cotizando' son todos "ya lo pedimos, todavia no esta comprado".
create or replace function public.torneria_sincronizar_compra_desde_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_estado := case new.status
    when 'nuevo' then 'solicitado'
    when 'en_revision' then 'solicitado'
    when 'cotizando' then 'solicitado'
    when 'comprado' then 'comprado'
    when 'recibido' then 'recibido_astillero'
    else null
  end;

  -- 'cancelado' no se mapea: que el pedido se cancele no significa que el
  -- material ya no haga falta. Queda como estaba y alguien decide.
  if v_estado is null then
    return new;
  end if;

  update public.torneria_items
     set compra_estado = v_estado,
         updated_at = now()
   where purchase_request_id = new.id
     and compra_estado <> 'no_aplica'
     and compra_estado is distinct from v_estado;

  return new;
end;
$$;

drop trigger if exists trg_purchase_request_sync_torneria on public.purchase_requests;
create trigger trg_purchase_request_sync_torneria
  after update of status on public.purchase_requests
  for each row execute function public.torneria_sincronizar_compra_desde_pedido();

-- ── Tiempos ya calculados ─────────────────────────────────────────────────
-- Vista para reportes y para no repetir la resta en cada pantalla. La espera en
-- el astillero se mide contra la PRIMERA salida real del material, que es el
-- momento en que dejo de estar esperando.
create or replace view public.torneria_items_tiempos
with (security_invoker = true) as
select
  i.id as item_id,
  i.proceso_id,
  i.clave,
  i.descripcion,
  i.compra_estado,
  i.solicitado_at,
  i.comprado_at,
  i.recibido_astillero_at,
  primera.salida_at as primera_salida_at,
  case
    when i.solicitado_at is not null and i.recibido_astillero_at is not null
      then extract(epoch from (i.recibido_astillero_at - i.solicitado_at)) / 86400.0
  end as dias_compra,
  case
    when i.solicitado_at is not null and i.comprado_at is not null
      then extract(epoch from (i.comprado_at - i.solicitado_at)) / 86400.0
  end as dias_hasta_comprar,
  case
    when i.comprado_at is not null and i.recibido_astillero_at is not null
      then extract(epoch from (i.recibido_astillero_at - i.comprado_at)) / 86400.0
  end as dias_entrega,
  case
    when i.recibido_astillero_at is not null and primera.salida_at is not null
      then extract(epoch from (primera.salida_at - i.recibido_astillero_at)) / 86400.0
  end as dias_espera_astillero
from public.torneria_items i
left join lateral (
  select min(m.fecha) as salida_at
    from public.torneria_operacion_items oi
    join public.torneria_movimientos m on m.operacion_id = oi.operacion_id
   where oi.item_id = i.id
     and m.tipo = 'salida'
) primera on true
where i.activo;

comment on view public.torneria_items_tiempos is
  'Tiempos de cada material: cuanto tardo en comprarse, en llegar, y cuanto espero en el astillero antes de salir al taller.';

grant select on public.torneria_items_tiempos to authenticated;
