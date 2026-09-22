-- Un equipo guardado para un barco no es stock.
--
-- Al cargar un motor se podía elegir el barco y dejar el estado que viene
-- puesto ("en galpón"), y quedaba en las dos listas a la vez: en el barco y
-- en "Motores disponibles en el galpón" como stock libre. Pasó con el motor
-- del 37-40 (ticket de davidtec del 19/09/2026).
--
-- Desde acá la base lo corrige sola: si un equipo tiene barco y quedó en
-- 'en_galpon', pasa a 'asignado' (reservado, físicamente en el galpón). No
-- toca ningún otro estado: 'comprado' y 'pedido' sí pueden tener barco,
-- porque son equipos que todavía no llegaron.

-- ─── Lo ya cargado ──────────────────────────────────────────────────────────
update public.equipos
   set estado = 'asignado'
 where estado = 'en_galpon'
   and (obra_id is not null or coalesce(trim(obra_codigo), '') <> '');

-- ─── Para lo que venga ──────────────────────────────────────────────────────
create or replace function public.equipos_reserva_coherente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'en_galpon'
     and (new.obra_id is not null or coalesce(trim(new.obra_codigo), '') <> '') then
    new.estado := 'asignado';
  end if;
  return new;
end;
$$;

drop trigger if exists equipos_reserva_coherente on public.equipos;
create trigger equipos_reserva_coherente
  before insert or update on public.equipos
  for each row execute function public.equipos_reserva_coherente();
