# Lote 04 · Compras — Bandeja y pedidos

Estado: listo

## Hecho

- **Bandeja (`PurchaseRequestsScreen`)**: el encabezado, las pestañas y el menú "Más" ya estaban rehechos. Se acotó el `<style>` a `.compras-root` (incluido ReactQuill), para que no pinte el resto de la app. Los colores de origen (`#2dd4bf`, `#8b5cf6`, `#34d399`) y la prioridad "alta" (naranja) pasaron a tokens (`C.teal`, `C.violet`, `C.green`). El punto de "sin leer" dejó de latir. Bordes y fondos hechos con `var(--blue)55` o `rgba(96,165,250,…)` —que en tema claro se rompen— pasaron a `C.blueL` / `C.blueB`. Errores `#fca5a5` → `C.red`. El editor usa `<Cargando compacto />`. El botón sólido usa `var(--inverse-text)` en vez de `#08080a`.
- **Detalle (`PurchaseRequestDetail`)**: raíz `.prd-root`; overlays de imagen con `--overlay-strong`; hover y foco con tokens; el HTML de Quill usa `--blue` en los links; presupuesto, adjuntos, chat propio y vacíos con `-soft`/`-border` del tema.
- **Recibo (`ReciboModal`)**: overlay y sombra con tokens; en el celular sube como hoja inferior; título y cifras 750 → 700; rótulos 11 px / 600; el cerrar es `ui-btn-icono`.
- **Pedir a compras (`PedirAComprasModal`)**: bloques de plantilla y alta de ítem con `C.greenL` / `C.blueL`; textos sobre teal/azul → `var(--inverse-text)`; rótulos 11 px / 600 / `.07em`; el cerrar es `ui-btn-icono`. No cambiaron props ni el ruteo de pedidos.
- **Kit (`comprasUI.jsx`)**: el buscador usa `ui-input`. Exportaciones y props iguales.
- **Bicho (`ComprasBicho`)**: sombras con `--shadow`; el enviar usa `--inverse-text`.
- **Portal (`PortalProveedorScreen`)**: estados con tokens (ya no concatenan hex + `44`); "Cargando pedidos..." → `<Cargando />`; logo y botones con `ui-btn`; 100vh queda, es una ruta fuera del contenedor.

## Verificado

- `node scripts/comparar-lint.mjs` con los 7 archivos del lote: "Sin errores nuevos respecto de HEAD".
- `npm run build`: pasa (15,8 s).

## Sin verificar

- La mirada en pantalla. Al abrir `/compras` la sesión ya no estaba y cayó en `/login`. Falta 1280 / 390, oscuro y claro, el menú "Más", un detalle de pedido, el modal de pedir y el recibo (el recibo se abre desde Caja chica, lote 5).
- `/proveedor/:token` no se abrió: hace falta un link real de un proveedor.
- `ComprasBicho` sólo lo ve el rol compras; no se abrió el panel.

## Para coordinar

- `@keyframes spin` sigue declarado en `PurchaseRequestsScreen` porque las solapas del lote 5 (`Faltantes`, `Adicionales`, `Planilla`) lo usan mientras esta pantalla está montada. Conviene que cada una defina el suyo (o use `<Cargando />`) y se quite el global.
- `PedirAComprasModal` lo abren Maderas, Laminación, Muebles y Tornería: cambió el aspecto, no las props.
- `comprasUI.jsx` lo usa el lote 5: el `SearchInput` ahora tiene `ui-input`; el resto del kit no se tocó.

## Lógica o datos para revisar

- En la bandeja, un comentario dice que `purchase_requests.proveedor` está vacío en todas las filas, por eso no se puede agrupar por proveedor. No se tocó.
- El portal confirma entregas y sube facturas por la edge function: el aspecto no cambia ese circuito.
