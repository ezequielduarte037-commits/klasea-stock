-- Que un numero de pieza no se reuse nunca.
--
-- El trigger anterior asignaba max(nro_pieza) + 1. Si se borraba la pieza mas
-- alta de una linea, el maximo bajaba y la siguiente pieza nueva recibia ese
-- mismo numero. Dos piezas distintas con el mismo numero en momentos distintos
-- es justo lo que estos numeros existen para evitar: una hoja impresa vieja
-- pasaria a señalar la pieza equivocada.
--
-- Se guarda una marca de agua por linea que solo sube. Borrar piezas deja
-- huecos en la numeracion, y esta bien: un hueco se entiende, un numero
-- reciclado no.

alter table public.prod_lineas
  add column if not exists nro_pieza_seq integer not null default 0;

comment on column public.prod_lineas.nro_pieza_seq is
  'Ultimo numero de pieza entregado en esta linea. Solo sube: los numeros no se reusan aunque se borren piezas.';

-- Arranca desde el numero mas alto que ya se entrego.
update public.prod_lineas l
set nro_pieza_seq = greatest(
  l.nro_pieza_seq,
  coalesce((
    select max(lm.nro_pieza)
    from public.prod_linea_muebles lm
    where lm.linea_id = l.id
  ), 0)
);

-- El UPDATE toma el row lock de la linea, asi que dos altas simultaneas en la
-- misma linea se serializan y no pueden sacar el mismo numero.
create or replace function public.prod_linea_muebles_set_nro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nro_pieza is null then
    update public.prod_lineas
       set nro_pieza_seq = nro_pieza_seq + 1
     where id = new.linea_id
    returning nro_pieza_seq into new.nro_pieza;

    -- Si la linea no existe el insert va a fallar igual por la foreign key,
    -- pero sin numero el trigger dejaria pasar un null silencioso.
    if new.nro_pieza is null then
      raise exception 'No existe la linea % para numerar la pieza', new.linea_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prod_linea_muebles_set_nro on public.prod_linea_muebles;
create trigger trg_prod_linea_muebles_set_nro
  before insert on public.prod_linea_muebles
  for each row execute function public.prod_linea_muebles_set_nro();
