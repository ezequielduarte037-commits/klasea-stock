-- Tabla para los Lotes de Producción (Juegos completos)
CREATE TABLE IF NOT EXISTS prod_muebles_lotes (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null default 'Oberti',
  unidad_id uuid references prod_unidades(id) on delete cascade,
  linea_id uuid not null references prod_lineas(id) on delete cascade,
  color_chapa text,
  estado_proceso text not null default 'Pendiente Materiales',
  tablones_enviados boolean not null default false,
  observaciones text,
  creado_el timestamptz default now(),
  actualizado_el timestamptz default now()
);
