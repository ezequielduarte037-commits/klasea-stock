# Caja Klase A

Sistema interno para llevar **caja en pesos y dólares**, la **distribución de gastos**
por categoría y mes, y la **cuenta corriente de clientes** (deuda en proceso / entregados).

Reemplaza las 3 planillas de Excel: cargás cada movimiento **una sola vez** y se
refleja en todas las vistas.

- **Frontend:** React + Vite
- **Base de datos + login:** Supabase (Postgres)
- **Hosting:** Vercel

---

## Cómo se conectan las planillas viejas

| Planilla vieja | En el sistema |
|---|---|
| Caja (USD y $) | Pantalla **Caja**: un movimiento = fecha, moneda, entrada/salida, monto, descripción y categoría. El saldo se calcula solo. |
| Distribución de gastos | Pantalla **Distribución**: NO se carga aparte. Es un reporte automático de las *salidas* de caja, agrupadas por categoría y mes. |
| Clientes + Resumen | Pantalla **Clientes**: cada cliente con sus movimientos (debe/haber), saldo automático y estado (en proceso / entregado). Al cargar un pago, podés impactarlo de una en la Caja. |

---

## Puesta en marcha (paso a paso)

### 1) Crear el proyecto en Supabase
1. Entrá a https://supabase.com → **New project**.
2. Nombre: `klasea-caja`. Guardá la contraseña de la base. Región: **South America (São Paulo)**.
3. Cuando termine, andá a **Project Settings → API** y copiá:
   - **Project URL** → va en `VITE_SUPABASE_URL`
   - **anon public key** → va en `VITE_SUPABASE_ANON_KEY`

### 2) Crear las tablas
En el dashboard de Supabase → **SQL Editor** → **New query**, pegá el bloque de
[Esquema SQL](#esquema-sql) de más abajo y dale **Run**. Es idempotente (lo podés
correr más de una vez sin romper nada).

### 3) Crear el usuario de login
Supabase → **Authentication → Users → Add user** → email + contraseña para vos y/o
tu jefe. (El sistema usa login por email/contraseña; no hay registro abierto.)

### 4) Correr en tu compu
```bash
npm install
copy .env.example .env      # en Windows (en Mac/Linux: cp .env.example .env)
# editá .env con la URL y la anon key del paso 1
npm run dev
```
Abrí http://localhost:5173 e ingresá con el usuario del paso 3.

### 5) Subir a Vercel
1. Subí el proyecto a un repo de GitHub (nuevo, propio de este sistema).
2. Entrá a https://vercel.com → **Add New → Project** → importá el repo.
3. En **Environment Variables** cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. **Deploy**. Cada `git push` actualiza el sitio solo.

---

## Esquema SQL

```sql
-- ============ TABLAS ============
create table if not exists categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden int default 0
);

create table if not exists movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  moneda text not null check (moneda in ('ARS','USD')),
  tipo text not null check (tipo in ('entrada','salida')),
  monto numeric(14,2) not null check (monto > 0),
  descripcion text default '',
  categoria_id uuid references categorias_gasto(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  estado text not null default 'en_proceso' check (estado in ('en_proceso','entregado')),
  created_at timestamptz default now()
);

create table if not exists movimientos_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  fecha date not null default current_date,
  detalle text default '',
  debe numeric(14,2) not null default 0,
  haber numeric(14,2) not null default 0,
  moneda text not null default 'ARS' check (moneda in ('ARS','USD')),
  created_at timestamptz default now()
);

-- ============ SEGURIDAD (RLS) ============
-- Cualquier usuario logueado puede leer/escribir todo. Sin login, nada.
alter table categorias_gasto    enable row level security;
alter table movimientos_caja     enable row level security;
alter table clientes             enable row level security;
alter table movimientos_cliente  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['categorias_gasto','movimientos_caja','clientes','movimientos_cliente'] loop
    execute format('drop policy if exists auth_all on %I', t);
    execute format('create policy auth_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ============ CATEGORÍAS INICIALES ============
insert into categorias_gasto (nombre, orden)
select v.nombre, v.orden from (values
  ('Proveedores',1),('Recio',2),('Motores y trimer',3),('Deuda',4),
  ('Contratistas y sueldos',5),('Obra FK',6),('Caja compras',7),('Retiro',8),
  ('Cheques',9),('Varios',10),('Abonos y alquiler',11),('Teva',12),('Chubut',13)
) as v(nombre, orden)
where not exists (select 1 from categorias_gasto);
```
