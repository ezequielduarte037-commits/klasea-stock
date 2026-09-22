-- Un precio para un conjunto de materiales.
--
-- Hay proveedores que no cotizan pieza por pieza. Merniez arma los mazos de
-- cables y las cajas del barco entero y pasa un solo número; Maxi Herrero
-- hace lo mismo con la herrería; los tanques de combustible se cobran por
-- modelo. Hasta ahora eso no se podía guardar: los 23 cableados del K52
-- figuraban los 23 como "sin precio" y el costo del modelo salía corto sin
-- que nada avisara por qué.
--
-- Un conjunto es eso: un nombre, un proveedor, un modelo, UN precio y la
-- lista de materiales que cubre. En Costo de obra el conjunto suma una sola
-- vez y sus materiales dejan de contarse como faltantes: pasan a decir que
-- están incluidos. No se inventa ningún unitario.
--
-- Un conjunto sin precio tampoco es lo mismo que un material sin precio: es
-- una cotización que hay que pedir, y se ve como una sola línea.

begin;

-- ─── 1. Tablas ──────────────────────────────────────────────────────────────
create table if not exists public.panol_conjuntos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  proveedor text,
  proveedor_id uuid references public.panol_proveedores(id) on delete set null,
  modelo text check (modelo in ('37', '52', '55')),   -- null = vale para cualquiera
  precio numeric,                                     -- null = falta la cotización
  moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  fecha date,                                         -- la del precio, para saber si envejeció
  fuente text,                                        -- de qué papel salió
  notas text,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.panol_conjunto_items (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.panol_conjuntos(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (conjunto_id, material_id)
);

create index if not exists panol_conjunto_items_material_idx
  on public.panol_conjunto_items (material_id);

comment on table public.panol_conjuntos is
  'Precio único para un grupo de materiales que el proveedor no cotiza por separado (mazos de Merniez, herrería de Maxi, tanques por modelo).';

-- ─── 2. Permisos ────────────────────────────────────────────────────────────
alter table public.panol_conjuntos enable row level security;
drop policy if exists "panol_conjuntos_select" on public.panol_conjuntos;
create policy "panol_conjuntos_select" on public.panol_conjuntos
  for select to authenticated using (auth.uid() is not null);
drop policy if exists "panol_conjuntos_escritura" on public.panol_conjuntos;
create policy "panol_conjuntos_escritura" on public.panol_conjuntos
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
grant select, insert, update, delete on public.panol_conjuntos to authenticated;

alter table public.panol_conjunto_items enable row level security;
drop policy if exists "panol_conjunto_items_select" on public.panol_conjunto_items;
create policy "panol_conjunto_items_select" on public.panol_conjunto_items
  for select to authenticated using (auth.uid() is not null);
drop policy if exists "panol_conjunto_items_escritura" on public.panol_conjunto_items;
create policy "panol_conjunto_items_escritura" on public.panol_conjunto_items
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
grant select, insert, update, delete on public.panol_conjunto_items to authenticated;

-- ─── 3. Los tres conjuntos que ya conocemos ─────────────────────────────────
-- Cableado y tableros Merniez · K52: 23 materiales
with nuevo as (
  insert into public.panol_conjuntos (nombre, proveedor, proveedor_id, modelo, precio, moneda, fecha, fuente, notas)
  select 'Cableado y tableros Merniez · K52', 'Merniez', 'bac07734-1221-41b2-9958-9b7873be3b8c', '52', null, 'ARS', null, null, 'Merniez arma todos los mazos y las cajas juntos y los cobra en un solo número. Falta pedirle la cotización del conjunto.'
   where not exists (select 1 from public.panol_conjuntos where nombre = 'Cableado y tableros Merniez · K52')
  returning id
)
insert into public.panol_conjunto_items (conjunto_id, material_id)
select nuevo.id, m.id
  from nuevo
  cross join public.panol_materiales m
 where m.id in (
    '9e94762c-e284-431f-ad95-df721c56e73c',   -- Cableado J Arco radar K52
    'd3c75cf2-4db0-4095-8a94-ccec700d7776',   -- Cableado S Alimentaciones sala de maquinas
    'f8c2ee61-94c9-40cc-8778-026e3aa54714',   -- Caja de relays 2 (Merniez) K52
    'b2de006f-6304-486f-ad6a-daf114c7b3fe',   -- Caja 5 (Merniez) K52
    '94a8c23c-2afb-4f99-b200-5a2d911fb0c6',   -- Caja 6 (Merniez) K52
    '8c39e939-215a-4a00-8523-6ac5c02a59ef',   -- Tablero 12v (Merniez) K52
    '86e8c4f6-0674-472d-ba8a-41a763916473',   -- Cableado K llaves selectoras K52
    '4aa281c4-e029-44a7-9e2d-d9b52ca29ab8',   -- Caja de relays 1 (Merniez) K52
    'e1b2d232-a547-4dd8-9225-16e5612e9afb',   -- Tablero 220 (Merniez) K52
    '3c4633d1-5bbe-438f-83c7-0f7ed0da4f37',   -- Cableado E Alimentaciones Popa K52
    '62fb8c55-7b52-4e36-aecd-b9b2b889432d',   -- Cableado L comando a proa K52
    '86180865-a461-45b1-938b-3653a8e98ca1',   -- Cableado i Sala de máquinas babor K52
    '3a2588dc-82f7-4cd3-9c7b-7f42f2b34e8d',   -- Cableado R Motores K52
    'a8a23877-a221-4506-b0d6-1cd087f06579',   -- Cableado M Cockpit
    'fb4d4043-8f5b-483e-babf-df5735f497e0',   -- Cableado A Sentina Proa K52
    'aca5c8e1-12ab-4f2c-b88a-193911567e56',   -- Cableado B Sentina Camarote Principal K52
    'abdd1bfd-9e6d-4cb8-bb96-6ad1f543bdd6',   -- Cableado F Caja bornera a sala de máquinas
    '1df4fba6-7a79-43d6-ac41-886f66100b3a',   -- Cableado H Sala de máquinas mámparo
    '3f5bb692-3172-4783-ac21-ac40c17644c0',   -- Cableado C Sentina banda estribor a proa K52
    '423485ed-27db-4e0e-a8c9-adee4ee013cf',   -- Cableado D Sentina banda estribor a proa K52
    'ad6b6d21-b5fb-4e3c-83f5-074184d6e9ae',   -- Cableado N Tablero principal - comando K52
    '167af695-b2e2-4a1c-be1b-d7e296b4538e',   -- Cableado G Sala de máquinas estribor K52
    '46f2c8cb-5c5a-4d9a-ac93-a5f4821e6a78'    -- Cableado Ñ K52
 );

-- Cableado y tableros Merniez · K55: 13 materiales
with nuevo as (
  insert into public.panol_conjuntos (nombre, proveedor, proveedor_id, modelo, precio, moneda, fecha, fuente, notas)
  select 'Cableado y tableros Merniez · K55', 'Merniez', 'bac07734-1221-41b2-9958-9b7873be3b8c', '55', null, 'ARS', null, null, 'Mismo caso que el K52: un precio por todo el conjunto.'
   where not exists (select 1 from public.panol_conjuntos where nombre = 'Cableado y tableros Merniez · K55')
  returning id
)
insert into public.panol_conjunto_items (conjunto_id, material_id)
select nuevo.id, m.id
  from nuevo
  cross join public.panol_materiales m
 where m.id in (
    'dc8e6bdf-f576-41e6-ac51-e2dde6e6afcf',   -- Cableado i máquinas babor K55
    'f45ce03a-2694-4095-bf18-b94f7870073a',   -- Cableado A salon K55
    '8aafe4c7-1864-4ec7-b87f-a2259c61d01e',   -- Tablero 12vcc (con caja) Merniez K55
    '81015263-894d-43f8-8681-bd7c55b3d863',   -- Cableado E Camarote Babor y baño proa K55
    '29b0a013-4f64-473e-afca-88f053ab98d0',   -- CAJA DE COMANDO K55 MERNIEZ
    'f44d1b4f-1229-4313-af36-fbd07e9fb6f9',   -- Cableado D camarote de proa K55
    'a779a981-bddd-4a29-9564-5d2b572a6203',   -- Cableado B camarote principal K55
    'a8ea7ce2-fb1e-46c4-a0cd-3f17ccd740d5',   -- Cableado G máquinas estribor K55
    'dcd2ac4e-46fa-4120-96f4-48be140e5dff',   -- Cableado J Fly K55
    '06cb82a1-f632-4a10-a6fb-4ad65204d447',   -- Cableado C cocina K55
    'df2afe1d-6992-422d-838c-99fd0d2e7e15',   -- Cableado H máquinas proa K55
    '7095bf04-c24e-4833-ae09-b38050f781af',   -- Cableado F Caja conexiones máquinas estribor K55
    '7bea0e9b-90d1-47a2-9895-b33cecaf44bf'    -- Cableado K controles cortes batería K55
 );

-- Herrería Maxi Herrero · K52: 15 materiales
with nuevo as (
  insert into public.panol_conjuntos (nombre, proveedor, proveedor_id, modelo, precio, moneda, fecha, fuente, notas)
  select 'Herrería Maxi Herrero · K52', 'Maxi Herrero', '58b18365-51ef-44f1-a818-ddf84a9421ad', '52', null, 'ARS', null, null, 'Maxi entrega la herrería del barco por trabajo, no por pieza. Falta el número del conjunto.'
   where not exists (select 1 from public.panol_conjuntos where nombre = 'Herrería Maxi Herrero · K52')
  returning id
)
insert into public.panol_conjunto_items (conjunto_id, material_id)
select nuevo.id, m.id
  from nuevo
  cross join public.panol_materiales m
 where m.id in (
    '29b3a919-2afd-431b-8292-c603ae8daf05',   -- JUEGO DE RIEL P/ PUERTA CORREDIZA K52
    '50bf35a7-afcf-45c4-b794-b21e40d67b4e',   -- JUEGO DE HERRAJE PORTA PISTON K52
    'cd110c37-1210-4f66-82d4-309d9c211895',   -- PASAMANO POPA K52
    '96736408-0f23-4cc8-b2ef-6da125bff6b4',   -- FLEJE P/ PUERTA CORREDIZA K52
    '8ff29083-a562-4097-b0b6-d8e8ff01ccc8',   -- BARRAL DE BAÑO K52
    'ef1f9a62-6f7e-4a2f-9894-b399a4689322',   -- HERRAJE REFUERZO P/ PUERTA CORREDIZA K52
    '9519b16a-acdd-4b5f-8866-f94fd7f27751',   -- PUNTERA DE BOTAZO - K52
    '701692de-133e-4f69-a7ff-a94f32b15b2c',   -- ESCALERA SALA MAQUINA K52
    '5f270eb7-301c-43bc-b3c5-b98a160ebd7c',   -- BITAS K52
    'fe08d3d6-a277-4b51-99d3-9180008972e5',   -- BISAGRA DE BAUL K52
    'b34a250b-bd2f-4786-b244-fca185eadeb9',   -- TINTEROS ASIENTO K52
    'd82d7d4e-0871-4736-a55f-47b41c87b2ad',   -- PUNTALES ASIENTO K52
    '407956b6-862b-4ad3-a3f4-0da4ec30f043',   -- PUERTA POPA K52
    'ebe74b34-00c9-454e-ab61-dbd70826c4d1',   -- ESCALERA PLANCHADA K52
    '4d8976eb-a02a-41a8-b778-d692afeff8f4'    -- BISAGRA BUTACA K52
 );

commit;
