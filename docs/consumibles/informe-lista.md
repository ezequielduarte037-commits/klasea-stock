# Lista del día siguiente

Pantalla del carril planificado, en `/pedido-panol`. El encargado arma desde el celular, hasta las 15, lo que su cuadrilla retira a las 7. Enviar crea una solicitud digital en la bandeja que pañol ya tiene (`Solicitudes de pañol`), sin tocar esa pantalla.

## Archivos

- `src/features/consumibles/lista/ListaManianaScreen.jsx` — la pantalla (reemplaza el lugar reservado).
- `src/features/consumibles/lista/listaApi.js` — catálogo, obras, mis listas y el envío.
- `src/features/consumibles/lista/listaLib.js` — fechas, búsqueda, plantillas y borrador en el celular.

No hay migración. No se tocó `App.jsx`, `api.js`, `ConsumiblesScreen.jsx`, el menú ni el tema. No se escribió nada en producción (la única consulta fue de lectura, para confirmar las policies).

## Cómo entra el pedido

`enviarLista` usa `crearSolicitud` y `agregarItemsDesdeCatalogo` de `solicitudesPanolApi.js`, igual que el pedido digital de Solicitudes:

- cabecera con `origen: 'digital'` y `estado: 'enviada'` (ya aparece en la bandeja; no queda en borrador);
- `tipo: ['Consumibles']`;
- ítems del catálogo con `es_consumible: true`.

Si los ítems fallan, se borra la cabecera para no dejar un pedido vacío en la cola. Un trigger de la base vuelve a copiar `es_consumible` desde `panol_materiales`: por eso la pantalla solo ofrece materiales que ya están marcados. No se lee `consumibles_config` ni `consumibles_stock`.

El encargado ve solo lo suyo (la RLS de solicitudes ya filtra por `created_by`). Mientras sigue en `enviada` puede anularla: la policy no le deja pasarla a `cancelado`, así que anular es borrar la fila.

## Decisiones

- Obra **o** sector, no los dos. La obra sale de `produccion_obras` con `estado = 'activa'`.
- Hay que elegir pañol (Pampa o Chubut). Si el perfil ya tiene sede, viene elegida. Sin sede, pañol no sabe de qué galpón sale.
- Día de retiro: mañana. Viernes, sábado y domingo caen al lunes (el prompt pide el viernes; el finde sigue la misma regla para no armar un retiro en un día cerrado). Se puede elegir otro día, incluso hoy.
- Después de las 15 (hora Argentina, a partir de las 15:01) hay un aviso y no se bloquea el envío. La misma frase queda en `observaciones`: «Llegó después de las 15. Prepararla a la mañana.» Así pañol la ve en la bandeja actual.
- «Repetir la de ayer» copia los consumibles de la lista de ayer. Si ayer no hubo (el lunes, después del finde), el botón dice «Repetir la última». No cambia la obra ni el día.
- Al abrir, si no hay un borrador a medias, la obra o el sector quedan en los de la última lista. El carrito no se llena solo, para no reenviar sin mirar.
- Plantillas y borrador viven en `localStorage` de ese celular (`klasea.consumibles.lista.*`). Otro teléfono no las ve.
- «Los que más pedís» cuenta una vez por lista anterior de esta persona, solo ítems con `es_consumible`. Tocar de nuevo suma uno.
- Cantidad con +/− y también tipeando el número. En la búsqueda, el − en 1 saca el ítem. En tu lista, el − se frena en 1 y se quita con el tacho.
- Estados en «Enviadas»: Enviada, Preparando, Lista (`listo`), Entregada. También Sin enviar, por si alguna quedó en borrador.

## Verificación

- `npx eslint src/features/consumibles/lista` — sin errores.
- `npx vite build --outDir tmp/build-cursor --emptyOutDir` — terminó bien (el chunk es `ListaManianaScreen`).
- Fechas (viernes/sábado/domingo → lunes, corte de las 15, «ayer» vs «última») probadas con un script de Node sobre `listaLib.js`.
- No levanté el servidor ni abrí el navegador: el brief pide que la prueba en pantalla la haga el coordinador.

## Cómo probar

Entrar logueado a `/pedido-panol` (cualquier rol con sesión). En el celular, 390 px de ancho.

1. Elegir obra o sector, y el pañol si no vino solo.
2. El día tiene que decir mañana, o el lunes si es viernes.
3. Buscar por nombre (dos letras), sumar con la fila, ajustar con +/−.
4. Guardar una plantilla, salir y volver: tiene que seguir en ese celular. «Repetir la de ayer» aparece al día siguiente.
5. Enviar. En Solicitudes de pañol tiene que estar la N° nueva, origen digital, estado enviada, ítems marcados consumible.
6. En «Enviadas», el estado tiene que coincidir cuando pañol la pasa a preparando / lista / entregada (al volver a la pestaña se relee).
7. Pasadas las 15, el aviso celeste aparece y el envío igual sale, con la nota en observaciones.
8. Si la prueba es en producción, anular la lista mientras dice Enviada, así no queda en la cola de las 7.

Temas oscuro, claro y, si da, alto contraste. A 1280 px el contenido queda en una columna de 640 px, que es el mismo flujo del celular.

## Qué falta

- No está en el menú ni en el buscador. La ruta ya estaba registrada; no toqué `Sidebar.jsx` ni `navIndex.js`. Hay que agregar el acceso para que el encargado la encuentre (sugerencia: «Para mañana», visible para cualquier usuario con sesión, no solo pañol).
- Las plantillas no se sincronizan entre celulares.
- «Los que más pedís» arranca vacío: las listas de papel las cargó pañol (`created_by` es el pañolero), así que no cuentan como de esta persona. Se llena con lo que mande desde acá.
- No se edita una lista que pañol ya tomó (`preparando` en adelante).
- Cantidades enteras. El peso y el canje son del mostrador, no de esta lista.
