-- Pañol no da de alta productos de los barcos.
--
-- Desde el 19/10/2026 un usuario de Pañol sólo puede crear productos marcados
-- como consumibles. Lo de los barcos que llega sin ficha entra al stock sin
-- producto y Técnica lo crea o lo vincula desde Stock → Movimientos →
-- Productos a crear. Hasta ahora pañol creaba productos al recibir remitos
-- (86 en 60 días), sin rubro ni línea.
--
-- Va en la base y no sólo en la pantalla: panol_materiales tiene la política
-- panol_all_authenticated, así que cualquier usuario puede insertar. Tampoco
-- se puede convertir un consumible en producto de barco desmarcándolo.
--
-- Sin usuario (service role, migraciones) no se aplica. Un perfil de pañol con
-- is_admin cuenta como administración.

create or replace function public.panol_materiales_panol_solo_consumibles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.es_consumible is true then
    return new;
  end if;
  -- En un UPDATE sólo importa sacarle la marca a un consumible.
  if tg_op = 'UPDATE' and old.es_consumible is not true then
    return new;
  end if;
  if exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and lower(coalesce(p.role::text, '')) = 'panol'
       and not coalesce(p.is_admin, false)
  ) then
    if tg_op = 'UPDATE' then
      raise exception 'Pañol no puede sacarle la marca de consumible a un producto. Pedíselo a Técnica.'
        using errcode = '42501';
    end if;
    raise exception 'Pañol no da de alta productos de los barcos. Ingresalo sin ficha: Técnica lo crea o lo vincula desde Productos a crear.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_materiales_panol_solo_consumibles on public.panol_materiales;
create trigger trg_panol_materiales_panol_solo_consumibles
before insert or update of es_consumible on public.panol_materiales
for each row execute function public.panol_materiales_panol_solo_consumibles();
