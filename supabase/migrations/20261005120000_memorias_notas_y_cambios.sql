-- Memorias descriptivas: notas en cualquier campo, quién guardó y registro de
-- cambios.
--
-- obra_memorias tiene una columna por campo y sólo cinco columnas de nota
-- (starlink_obs, radar_obs…). La pantalla de Memorias guarda el resto de las
-- notas ("piso_obs", "madera_muebles_obs"…) y los campos sin columna propia en
-- `extras`, con el mismo nombre que tendría la columna.
--
-- Cada cambio queda en obra_memoria_cambios (campo, antes, después, quién y
-- cuándo), venga de Memorias o del mapa del galpón: sirve para saber cuándo el
-- cliente cambió de idea y quién lo cargó.
--
-- Se aplica a mano. Sin esta migración la pantalla funciona igual: sólo no
-- guarda notas en campos sin columna ni muestra los últimos cambios.

alter table public.obra_memorias
  add column if not exists extras jsonb not null default '{}'::jsonb,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

-- El piso del cockpit sólo aceptaba 'teca' o 'infinity'. La memoria guarda lo
-- que se eligió ("Infinity gris claro", "Seadek gris", "No lleva").
alter table public.obra_memorias drop constraint if exists obra_memorias_teca_tipo_check;

create table if not exists public.obra_memoria_cambios (
  id uuid primary key default gen_random_uuid(),
  memoria_id uuid,
  obra_codigo text,
  obra_id uuid,
  campo text not null,
  antes text,
  despues text,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_obra_memoria_cambios_memoria
  on public.obra_memoria_cambios(memoria_id, created_at desc);

alter table public.obra_memoria_cambios enable row level security;

drop policy if exists "obra_memoria_cambios lectura" on public.obra_memoria_cambios;
create policy "obra_memoria_cambios lectura"
  on public.obra_memoria_cambios
  for select to authenticated
  using (auth.uid() is not null);

-- Sólo se escribe desde el trigger (security definer).
grant select on public.obra_memoria_cambios to authenticated;

-- Quién guardó por última vez.
create or replace function public.obra_memorias_quien_guardo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_obra_memorias_quien_guardo on public.obra_memorias;
create trigger trg_obra_memorias_quien_guardo
before insert or update on public.obra_memorias
for each row execute function public.obra_memorias_quien_guardo();

-- Un renglón por campo que cambió (también los de `extras`). Vacío y null
-- cuentan igual para no llenar el registro con "" → null.
create or replace function public.obra_memorias_registrar_cambios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := to_jsonb(new);
  v_old_x jsonb := coalesce(v_old -> 'extras', '{}'::jsonb);
  v_new_x jsonb := coalesce(v_new -> 'extras', '{}'::jsonb);
  k text;
begin
  for k in select jsonb_object_keys(v_new) loop
    continue when k in ('id', 'obra_id', 'obra_codigo', 'created_at', 'updated_at', 'updated_by', 'extras');
    if nullif(v_old ->> k, '') is distinct from nullif(v_new ->> k, '') then
      insert into public.obra_memoria_cambios(memoria_id, obra_codigo, obra_id, campo, antes, despues, user_id)
      values (new.id, new.obra_codigo, new.obra_id, k, nullif(v_old ->> k, ''), nullif(v_new ->> k, ''), auth.uid());
    end if;
  end loop;

  for k in select jsonb_object_keys(v_old_x || v_new_x) loop
    if nullif(v_old_x ->> k, '') is distinct from nullif(v_new_x ->> k, '') then
      insert into public.obra_memoria_cambios(memoria_id, obra_codigo, obra_id, campo, antes, despues, user_id)
      values (new.id, new.obra_codigo, new.obra_id, k, nullif(v_old_x ->> k, ''), nullif(v_new_x ->> k, ''), auth.uid());
    end if;
  end loop;

  return null;
end;
$$;

drop trigger if exists trg_obra_memorias_registrar_cambios on public.obra_memorias;
create trigger trg_obra_memorias_registrar_cambios
after insert or update on public.obra_memorias
for each row execute function public.obra_memorias_registrar_cambios();
