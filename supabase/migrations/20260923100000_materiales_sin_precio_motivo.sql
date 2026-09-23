-- Un material que no lleva precio propio, y por qué.
--
-- Hay ítems de la matriz a los que no corresponde ponerles precio: lo que se
-- fabrica en el astillero, lo que trae el cliente, lo que viene incluido en
-- otro ítem. Hasta ahora eran indistinguibles de un precio que falta pedir, y
-- el costo del barco los contaba como faltantes para siempre. Nunca se iba a
-- llegar al 100% aunque no quedara nada por cotizar.
--
-- Con un motivo cargado el ítem deja de figurar "sin precio" y pasa a
-- "especificado": no suma plata -no hay plata que sumar- pero cuenta como
-- resuelto en la cobertura. Es lo mismo que hacen los conjuntos de Merniez y
-- Maxi, sin tener que armar un conjunto para cada caso suelto.
--
-- Va en el material y no en la matriz de cada modelo porque el motivo es del
-- material: una pieza que se fabrica en el astillero se fabrica en todos los
-- barcos.
--
-- Quién lo marcó y cuándo lo pone la base, no la pantalla: así queda aunque el
-- cambio venga de otro lado, y no se puede falsificar desde el navegador.

begin;

alter table public.panol_materiales
  add column if not exists sin_precio_motivo text,
  add column if not exists sin_precio_at timestamptz,
  add column if not exists sin_precio_por uuid references public.profiles(id) on delete set null;

comment on column public.panol_materiales.sin_precio_motivo is
  'Por qué este material no lleva precio propio (se fabrica en el astillero, lo provee el cliente, viene incluido en otro ítem...). Con motivo cargado el costo lo cuenta como resuelto, no como faltante.';

create or replace function public.panol_materiales_sellar_sin_precio()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cambio boolean;
begin
  new.sin_precio_motivo := nullif(trim(coalesce(new.sin_precio_motivo, '')), '');
  -- En un INSERT no hay fila vieja con la que comparar.
  if tg_op = 'INSERT' then
    v_cambio := new.sin_precio_motivo is not null;
  else
    v_cambio := new.sin_precio_motivo is distinct from old.sin_precio_motivo;
  end if;

  if v_cambio then
    if new.sin_precio_motivo is null then
      new.sin_precio_at := null;
      new.sin_precio_por := null;
    else
      new.sin_precio_at := now();
      new.sin_precio_por := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists panol_materiales_sellar_sin_precio on public.panol_materiales;
create trigger panol_materiales_sellar_sin_precio
  before insert or update of sin_precio_motivo on public.panol_materiales
  for each row execute function public.panol_materiales_sellar_sin_precio();

commit;
