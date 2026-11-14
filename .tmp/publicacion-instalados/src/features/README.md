# Organizacion de features

Esta carpeta agrupa la aplicacion por dominios funcionales. La regla practica:
si un archivo representa una ruta, una vista interna, un modal o un helper usado
principalmente por un dominio, vive dentro del feature correspondiente.

- `admin`: tablero administrativo.
- `alertas`: pantallas y vistas de alertas.
- `calendario`: calendario general y paneles de calendario de barcos.
- `cliente`: panel del cliente, onboarding y experiencia asociada.
- `configuracion`: usuarios, clientes y parametros de sistema.
- `home`: pantalla inicial del personal interno.
- `inventario`: panol, pedidos, movimientos, compras sugeridas y ajustes.
- `laminacion`: vistas de laminacion y obras de laminacion.
- `marmoleria`: flujo de marmoleria.
- `muebles`: flujo de muebles y enchapado.
- `obras`: gestion de obras, planificacion, mapa de produccion y piezas.
- `postventa`: flota, ubicaciones y tickets de postventa.
- `procedimientos`: biblioteca de procedimientos.

Los assets compartidos viven en `src/assets`, separados por tipo (`boats`,
`galpon`, `logos`). Los componentes compartidos siguen en `src/components`.
La carpeta `src/legacy` conserva versiones antiguas o no usadas mientras se
decide si se eliminan definitivamente.
