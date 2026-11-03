-- Fusionar dos fichas de barco que son el mismo producto.
--
-- Caso típico (03/11/2026): la matriz apunta a una ficha (con código) y el
-- stock entró en otra creada después con el mismo nombre (Whale WX1514,
-- WX1503, WX1521, WX1502, Anafe 2 hornallas…). Así lo que llega nunca se ata
-- al renglón de la matriz.
--
-- Mueve a la ficha que queda TODO lo que apunta a la que sale (stock,
-- movimientos, matriz, pedidos, códigos, fotos, revisiones…): recorre las
-- claves foráneas de la base, así una tabla nueva no queda afuera. Si un
-- renglón choca con uno que la ficha que queda ya tiene (la misma línea en la
-- matriz, el mismo proveedor), se queda el de la ficha que queda.
-- Los registros de auditoría siguen apuntando a la ficha vieja, que no se
-- borra: queda inactiva, con su nombre en el alias de la nueva.
begin;
set local lock_timeout = '5s';

create table if not exists public.panol_material_fusiones (
  id uuid primary key default gen_random_uuid(),
  queda_id uuid not null references public.panol_materiales(id),
  sale_id uuid not null references public.panol_materiales(id),
  sale_descripcion text,
  nota text,
  detalle jsonb not null default '{}'::jsonb,
  hecho_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.panol_material_fusiones enable row level security;
drop policy if exists "fusiones lectura" on public.panol_material_fusiones;
create policy "fusiones lectura" on public.panol_material_fusiones for select to authenticated using (true);
revoke all on public.panol_material_fusiones from anon, authenticated;
grant select on public.panol_material_fusiones to authenticated;

create or replace function public.panol_fusionar_materiales(p_queda uuid, p_sale uuid, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_queda public.panol_materiales;
  v_sale public.panol_materiales;
  v_fk record;
  v_ctid tid;
  v_movidos integer;
  v_descartados integer;
  v_detalle jsonb := '{}'::jsonb;
  v_alias text;
begin
  if v_uid is null and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Usuario no autenticado';
  end if;
  if v_uid is not null and not (
    public.is_panol_manager(v_uid)
    or exists (select 1 from public.profiles p where p.id = v_uid and (coalesce(p.is_admin, false) or p.role in ('admin', 'tecnica')))
  ) then
    raise exception 'Sin permiso para fusionar productos';
  end if;
  if p_queda is null or p_sale is null or p_queda = p_sale then
    raise exception 'Elegí dos productos distintos';
  end if;

  select * into v_queda from public.panol_materiales where id = p_queda for update;
  select * into v_sale from public.panol_materiales where id = p_sale for update;
  if v_queda.id is null or v_sale.id is null then raise exception 'No encontré alguno de los dos productos'; end if;
  if v_queda.activo is false then raise exception '"%" está dado de baja: elegí un producto activo', v_queda.descripcion; end if;
  if coalesce(v_queda.es_consumible, false) or coalesce(v_sale.es_consumible, false) then
    raise exception 'Para consumibles se usa consumibles_fusionar';
  end if;
  -- Un requisito de matriz (genérico) y el producto elegido para él tienen a
  -- menudo el mismo nombre, pero no son repetidos: es como funciona la matriz.
  if coalesce(v_queda.es_requisito, false) <> coalesce(v_sale.es_requisito, false)
     or exists (
       select 1 from public.panol_requisito_productos rp
        where (rp.requisito_material_id = p_queda and rp.producto_material_id = p_sale)
           or (rp.requisito_material_id = p_sale and rp.producto_material_id = p_queda)
     ) then
    raise exception '"%" es un requisito de matriz y el otro es su producto: no son repetidos', v_queda.descripcion;
  end if;
  if exists (select 1 from public.panol_material_fusiones where sale_id = p_sale) then
    return jsonb_build_object('ya_fusionado', true, 'queda', p_queda, 'sale', p_sale);
  end if;

  perform set_config('app.audit_origin', 'fusion_materiales', true);

  for v_fk in
    select c.conrelid::regclass as tabla, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.contype = 'f'
       and c.confrelid = 'public.panol_materiales'::regclass
       and c.conrelid not in (
         'public.panol_materiales_audit'::regclass,
         'public.panol_obra_materiales_snapshot_audit'::regclass,
         'public.panol_material_duplicate_decisions'::regclass,
         'public.panol_material_fusiones'::regclass
       )
     order by 1, 2
  loop
    v_movidos := 0;
    v_descartados := 0;
    for v_ctid in execute format('select ctid from %s where %I = $1', v_fk.tabla, v_fk.col) using p_sale loop
      begin
        execute format('update %s set %I = $1 where ctid = $2', v_fk.tabla, v_fk.col) using p_queda, v_ctid;
        v_movidos := v_movidos + 1;
      exception when unique_violation then
        execute format('delete from %s where ctid = $1', v_fk.tabla) using v_ctid;
        v_descartados := v_descartados + 1;
      end;
    end loop;
    if v_movidos + v_descartados > 0 then
      v_detalle := v_detalle || jsonb_build_object(
        v_fk.tabla::text || '.' || v_fk.col,
        jsonb_build_object('movidos', v_movidos, 'descartados', v_descartados)
      );
    end if;
  end loop;

  -- El código y el código de barras de la que sale siguen encontrando el producto.
  insert into public.panol_material_codigos_barra (material_id, codigo, etiqueta, activo)
  select p_queda, t.c, left('De ' || v_sale.descripcion, 120), true
    from (select distinct btrim(c) as c from unnest(array[v_sale.codigo_barra, v_sale.codigo]) as c) t
   where nullif(t.c, '') is not null
     and t.c is distinct from v_queda.codigo_barra
     and t.c is distinct from v_queda.codigo
     and not exists (select 1 from public.panol_material_codigos_barra x where x.material_id = p_queda and x.codigo = t.c);

  v_alias := nullif(btrim(coalesce(v_queda.alias, '')), '');
  if lower(btrim(v_sale.descripcion)) <> lower(btrim(v_queda.descripcion))
     and position(lower(btrim(v_sale.descripcion)) in lower(coalesce(v_alias, ''))) = 0 then
    v_alias := concat_ws(' | ', v_alias, btrim(v_sale.descripcion));
  end if;

  update public.panol_materiales set
    alias = v_alias,
    codigo = coalesce(nullif(btrim(codigo), ''), v_sale.codigo),
    codigo_barra = coalesce(codigo_barra, v_sale.codigo_barra),
    proveedor = coalesce(nullif(btrim(proveedor), ''), v_sale.proveedor),
    proveedor_id = coalesce(proveedor_id, v_sale.proveedor_id),
    ubicacion = coalesce(nullif(btrim(ubicacion), ''), v_sale.ubicacion),
    ubicacion_obs = coalesce(ubicacion_obs, v_sale.ubicacion_obs),
    imagen_url = coalesce(imagen_url, v_sale.imagen_url),
    stock_minimo = coalesce(stock_minimo, v_sale.stock_minimo),
    precio_unitario = coalesce(precio_unitario, v_sale.precio_unitario),
    moneda = coalesce(moneda, v_sale.moneda),
    notas = coalesce(notas, v_sale.notas)
  where id = p_queda;

  update public.panol_materiales set
    activo = false,
    codigo_barra = null,
    notas = btrim(coalesce(notas || E'\n', '') || 'Fusionada en "' || v_queda.descripcion || '" el ' || to_char(now(), 'DD/MM/YYYY'))
  where id = p_sale;

  insert into public.panol_material_fusiones (queda_id, sale_id, sale_descripcion, nota, detalle, hecho_por)
  values (p_queda, p_sale, v_sale.descripcion, nullif(btrim(coalesce(p_nota, '')), ''), v_detalle, v_uid);

  return jsonb_build_object('queda', p_queda, 'sale', p_sale, 'detalle', v_detalle);
end;
$$;
revoke all on function public.panol_fusionar_materiales(uuid, uuid, text) from public, anon;
grant execute on function public.panol_fusionar_materiales(uuid, uuid, text) to authenticated;

commit;
