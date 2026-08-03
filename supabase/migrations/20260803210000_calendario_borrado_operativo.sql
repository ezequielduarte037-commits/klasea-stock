-- Permite que Administracion del sistema y Compras eliminen movimientos
-- logisticos de prueba o cargados por error. El historial se elimina por
-- la FK calendario_eventos_historial.evento_id on delete cascade.

drop policy if exists "calendario baja admin" on public.calendario_eventos;
drop policy if exists "calendario baja operativa" on public.calendario_eventos;

create policy "calendario baja operativa"
on public.calendario_eventos for delete to authenticated
using (
  clase = 'solicitud_logistica'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'compras'))
  )
);
