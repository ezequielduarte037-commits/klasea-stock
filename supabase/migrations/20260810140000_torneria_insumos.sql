-- Insumos de tornería: material que va al taller y NO vuelve.
--
-- El circuito de tornería estaba modelado como un viaje de ida y vuelta: la
-- pieza sale del astillero, la trabajan y vuelve. Para una pata de gallo o unas
-- cachas eso es exacto.
--
-- Pero una parte de lo que se manda no es una pieza: es insumo. Un lote de
-- broncería y bujes, barras, bulones. Eso sale del proveedor, llega al taller y
-- ahí se queda: es la materia prima con la que el tornero hace los trabajos.
-- Nunca "vuelve", porque lo que vuelve son las piezas hechas con eso.
--
-- Con el modelo de ida y vuelta esos materiales quedaban para siempre en
-- "retiro pendiente", ensuciando el tablero con una espera que nunca se iba a
-- cumplir y falseando los tiempos: un insumo entregado hace 200 dias figuraba
-- como una pieza extraviada.
--
-- El circuito de un insumo termina donde llega:
--
--    Compras → Comprado → Proveedor → Listo → Taller     (y ahi termina)
--
-- en vez de
--
--    Compras → Comprado → Astillero → Listo → Taller → Retiro → Astillero

alter table public.torneria_items
  add column if not exists es_insumo boolean not null default false;

comment on column public.torneria_items.es_insumo is
  'Material que se entrega al taller y no vuelve: es la materia prima del trabajo, no una pieza a trabajar. Su circuito termina en la entrega.';

alter table public.torneria_plantilla_items
  add column if not exists es_insumo boolean not null default false;

comment on column public.torneria_plantilla_items.es_insumo is
  'Heredado por las obras nuevas de la linea. Un lote de bulones es insumo en el K37 y en todos los demas.';

-- ── Se hereda, como el vinculo con el catalogo ────────────────────────────
-- Que algo sea insumo es una propiedad del material, no una decision sobre ESE
-- barco: si el lote de broncería es insumo en el K52, lo es en todos. Marcarlo
-- una vez por obra es el mismo trabajo repetido que ya nos habia molestado con
-- el vinculo al catalogo.
create or replace function public.torneria_propagar_insumo_a_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plantilla_item_id is null
     or new.es_insumo is not distinct from old.es_insumo then
    return new;
  end if;

  update public.torneria_plantilla_items
     set es_insumo = new.es_insumo,
         updated_at = now()
   where id = new.plantilla_item_id
     and es_insumo is distinct from new.es_insumo;

  -- Las obras que ya existen se alinean solas. Aca si se pisa el valor de las
  -- otras obras —a diferencia del vinculo al catalogo— porque no hay un caso
  -- razonable donde el mismo material sea insumo en un barco y pieza en otro:
  -- si lo es, es un error de carga y conviene que se vea corregido en todos.
  update public.torneria_items
     set es_insumo = new.es_insumo,
         updated_at = now()
   where plantilla_item_id = new.plantilla_item_id
     and id <> new.id
     and es_insumo is distinct from new.es_insumo
     and activo;

  return new;
end;
$$;

drop trigger if exists trg_torneria_propagar_insumo on public.torneria_items;
create trigger trg_torneria_propagar_insumo
  after update of es_insumo on public.torneria_items
  for each row execute function public.torneria_propagar_insumo_a_plantilla();

-- ── Las obras nuevas nacen con la marca puesta ────────────────────────────
-- torneria_crear_proceso copia la plantilla columna por columna y no conoce
-- es_insumo. En vez de redefinir esa funcion entera —es larga y toca items,
-- operaciones y componentes— se completa el valor apenas se insertan los items.
-- El trigger lee de su plantilla y sirve para cualquier via de alta, no solo
-- para crear_proceso.
--
-- Va BEFORE y escribe sobre new, no con un UPDATE posterior: un UPDATE
-- dispararia trg_torneria_propagar_insumo por cada item insertado, y crear una
-- obra terminaria recorriendo todas las demas obras de la linea una vez por
-- renglon. Aca no se dispara nada.
create or replace function public.torneria_heredar_insumo_de_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_insumo boolean;
begin
  if new.plantilla_item_id is null or new.es_insumo then
    return new;
  end if;

  select es_insumo into v_insumo
    from public.torneria_plantilla_items
   where id = new.plantilla_item_id;

  new.es_insumo := coalesce(v_insumo, false);
  return new;
end;
$$;

drop trigger if exists trg_torneria_heredar_insumo on public.torneria_items;
create trigger trg_torneria_heredar_insumo
  before insert on public.torneria_items
  for each row execute function public.torneria_heredar_insumo_de_plantilla();

-- ── Por que el estado terminal no se toca desde la base ───────────────────
-- El tramo de un insumo se queda en 'enviado' para siempre, porque nadie va a
-- registrar un regreso que no existe.
--
-- La tentacion era forzar 'recibido' al salir. No se hace: cantidad_recibida es
-- una columna DERIVADA —torneria_recalcular_operacion la recalcula sumando los
-- movimientos de tipo 'recepcion'— asi que cualquier valor escrito a mano se
-- pisa en el siguiente recalculo, y mientras tanto el numero miente.
--
-- Entonces la regla vive donde corresponde: para un insumo, 'enviado' ES el
-- estado final. El frontend lo lee asi y no ofrece el regreso. La ventaja es
-- que desmarcar es_insumo devuelve el tramo a esperar la vuelta sin haber
-- ensuciado ningun dato.
