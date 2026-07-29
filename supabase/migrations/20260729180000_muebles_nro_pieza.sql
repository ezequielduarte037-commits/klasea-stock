-- Numero de pieza fijo para los muebles de cada linea.
--
-- El taller identifica cada mueble por su numero. Hasta ahora ese numero era la
-- posicion en la lista, asi que agregar una pieza en el medio corria a todas las
-- siguientes y el numero dejaba de significar algo. Pasa a guardarse.
--
-- Por que vive en prod_linea_muebles y no en prod_muebles: el catalogo de
-- muebles es compartido entre lineas (un mismo mueble puede estar en K52 y en
-- K55). El numero es del mueble DENTRO de una linea, asi que corresponde a la
-- relacion, no al mueble.

alter table public.prod_linea_muebles
  add column if not exists nro_pieza integer;

comment on column public.prod_linea_muebles.nro_pieza is
  'Numero con el que el taller identifica esta pieza dentro de la linea. Se asigna una vez y no se recalcula: agregar muebles nuevos no renumera los existentes.';

-- Backfill con el orden que la pantalla venia mostrando (sector, despues
-- nombre), para que los numeros que ya se imprimieron sigan siendo los mismos.
with numerados as (
  select
    lm.linea_id,
    lm.mueble_id,
    row_number() over (
      partition by lm.linea_id
      order by coalesce(m.sector, ''), coalesce(m.nombre, '')
    ) as n
  from public.prod_linea_muebles lm
  join public.prod_muebles m on m.id = lm.mueble_id
)
update public.prod_linea_muebles lm
set nro_pieza = numerados.n
from numerados
where numerados.linea_id = lm.linea_id
  and numerados.mueble_id = lm.mueble_id
  and lm.nro_pieza is null;

-- Los muebles nuevos van al final de su linea. Se hace en trigger y no en el
-- frontend para que valga tambien cuando se copia una linea entera o se inserta
-- desde el panel de Supabase.
create or replace function public.prod_linea_muebles_set_nro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nro_pieza is null then
    select coalesce(max(nro_pieza), 0) + 1
      into new.nro_pieza
      from public.prod_linea_muebles
     where linea_id = new.linea_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prod_linea_muebles_set_nro on public.prod_linea_muebles;
create trigger trg_prod_linea_muebles_set_nro
  before insert on public.prod_linea_muebles
  for each row execute function public.prod_linea_muebles_set_nro();

-- Dos piezas de la misma linea no pueden compartir numero: si pasara, el numero
-- dejaria de servir para lo unico que sirve.
create unique index if not exists uq_prod_linea_muebles_nro
  on public.prod_linea_muebles (linea_id, nro_pieza)
  where nro_pieza is not null;
