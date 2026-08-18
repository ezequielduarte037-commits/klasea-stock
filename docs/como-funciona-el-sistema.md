# Cómo funciona el sistema: materiales, pañol, compras y obras

Escrito leyendo el código el 15/08/2026. Describe **cómo funciona hoy**, no cómo
debería funcionar. Donde hay una trampa conocida, está marcada como tal.

---

## 1. La idea en una frase

Un material recorre siempre el mismo camino:

```
Matriz del modelo  →  Materiales de la obra  →  Pedido a compras  →  Compra
        →  Aviso a pañol  →  Recepción  →  Stock  →  Egreso a la obra
```

Lo único que **crea stock** es la recepción confirmada por pañol. Comprar algo no
lo pone en el pañol; lo pone *en camino*.

---

## 2. El recorrido, paso a paso

### Paso 1 — La matriz del modelo
Cada modelo de barco (K55, K37, K64…) tiene una lista de materiales que lleva.
Vive en la tabla `panol_material_modelo` y se edita desde **Materiales**.

Es una plantilla: no es de ninguna obra en particular y no tiene stock.

### Paso 2 — Fijar los materiales de la obra
Cuando arranca una obra, la matriz **se copia** a esa obra concreta. En el código
son `ensureObraMaterialSnapshot` y `reemplazarObraMaterialSnapshotSeguro`, y se
disparan desde la pantalla de Materiales.

Se copia, no se referencia: si mañana cambia la matriz del K55, las obras que ya
arrancaron **no cambian**. Eso es a propósito — una obra en curso no puede
cambiar de lista sola.

A esas filas se les puede agregar lo que no estaba en la matriz:
- **Adicionales / addons**: lo que pidió el cliente aparte.
- **Condicionantes**: lo que depende de una decisión todavía no tomada.

### Paso 3 — Pedir a compras
Desde los materiales de la obra se genera un pedido. Eso crea un
`purchase_request` con sus `purchase_request_items`, y cada ítem queda enganchado
a la fila de la obra que lo originó.

Compras trabaja sobre eso: cotiza, compra, carga precios.

### Paso 4 — Avisar a pañol
Cuando algo llega (o está por llegar), se crea un **envío** (`panol_envios` +
`panol_envio_items`). Técnica también puede crear avisos sin ser manager de
pañol — para eso se hizo la migración `tecnica_crea_envios_panol`.

El envío es el aviso: *"esto va para el pañol"*. Todavía no es stock.

### Paso 5 — Recepción
Pañol abre el envío y marca ítem por ítem qué llegó: recibido, parcial, o alguno
de los problemas. **Recién acá el material existe en el stock.**

Cuando todos los ítems de un pedido quedan recibidos, el pedido de compras pasa
solo a `recibido` — lo hace la función `sync_purchase_request_status_from_items`
en la base, no una persona.

### Paso 6 — Stock
El material queda disponible en una sede y, si está cargada, en una ubicación.
Desde acá se puede transferir entre sedes, ajustar por conteo físico, o egresar.

### Paso 7 — Egreso a la obra
Se entrega a la obra, con quién lo retiró y para qué sector. Eso **resta** del
stock y cierra el recorrido.

---

## 3. El vocabulario: los estados

Hay tres familias de estados distintas y es fácil confundirlas.

### Estado del envío (`panol_envios`)

| Estado | Qué significa |
|---|---|
| `borrador` | Se está armando, todavía no lo ve pañol |
| `enviado` | Avisado a pañol, esperando que lo reciban |
| `en_preparacion` | Pañol lo está procesando |
| `parcial` | Llegó una parte |
| `recibido` | Llegó todo |
| `cerrado` | Terminado, archivado |
| `cancelado` | No va más |

### Estado del ítem del envío (`panol_envio_items`)

| Estado | Qué significa |
|---|---|
| `pendiente` | Todavía no se recibió |
| `recibido` | Llegó completo |
| `parcial` | Llegó menos de lo esperado |
| `sin_info` | Llegó algo que no se sabe qué es |
| `falta_stock` | No lo tenían |
| `rechazado` | Llegó mal y se devolvió |

Los últimos tres son **avisos operativos**: pañol detectó un problema y alguien
tiene que resolverlo.

### Estado de la fila de materiales de la obra

Esta es la más complicada, porque la misma tabla guarda cosas muy distintas. Los
que vas a ver seguido:

| Estado | Qué significa |
|---|---|
| `pendiente` | Se necesita, todavía no se hizo nada |
| `preparado` | Listo para mandar |
| `en_panol` | Está físicamente en el pañol |
| `recibido` / `parcial` | Se recibió todo / una parte |
| `egresado` | Ya se entregó a la obra |
| `problema` / `faltante` | Algo salió mal |
| `reemplazado` | Se cambió por otro producto |

⚠️ **Trampa:** en el código conviven alrededor de **15 valores distintos** de
estado sobre esta misma tabla, y varios los pone una persona a mano. No todos
significan lo mismo según de dónde vino la fila. Si vas a sacar una conclusión
importante, no mires sólo el estado: mirá el `source`.

---

## 4. El `source`: de dónde vino cada fila

Todo el movimiento de pañol vive en una sola tabla,
`panol_obra_materiales_snapshot`, y lo que distingue una cosa de otra es el campo
`source`:

| `source` | Qué es |
|---|---|
| `matriz` | Lo que la obra necesita según el modelo |
| `adicionales`, `addon` | Lo que se agregó fuera de la matriz |
| `compra` | Vino de un pedido de compras |
| `remito` | Entró por un remito |
| `stock_general`, `stock_*` | Ingreso directo al stock |
| `transferencia_ingreso` / `transferencia_egreso` | Movimiento entre sedes |
| `egreso*` | Salida hacia una obra |
| `ajuste_ingreso` | Corrección que suma |
| `ajuste_ubicacion` | Sólo cambió de lugar, **no** cambia la cantidad |
| `reclasificacion_ingreso` / `reclasificacion_egreso` | Se reasignó a otra obra o producto |
| `conteo_fisico_reversion` | Corrección por conteo físico |
| `consumible_retiro` | Retiro de un consumible |

---

## 5. Cómo se calcula el stock

No hay un campo "cantidad en stock". El saldo **se calcula sumando movimientos**:

```
saldo = suma de lo que entró  −  suma de lo que salió
```

Una fila **suma** si:
- su estado es `en_panol`, `recibido` o `parcial`, **y**
- fue efectivamente recibida (`recepcion_estado` = recibido/parcial) **o** entró
  directo al stock (`stock_*`, `remito`, `transferencia_ingreso`, `ajuste_ingreso`).

Una fila **resta** si su `source` empieza con `egreso`, `transferencia_egreso`, o
es una reversión de conteo físico.

Todo lo demás **no cuenta**. En particular:

> **Lo que está en camino no suma hasta que se recibe.** Eso es correcto y es a
> propósito: si sumara, el pañol mostraría material que todavía no está en el
> galpón.

La receta canónica está en `src/features/panol/panolMovimientos.js`
(`rowCountsAsStock`, `rowIsEgreso`, `rowDelta`) y también existe como función SQL
(`panol_stock_movimiento_delta`).

---

## 6. Quién escribe en la base

El front **nunca inserta un movimiento de stock directamente**. Todo pasa por
funciones de la base (RPC), que son las que aplican las reglas:

| Función | Qué hace |
|---|---|
| `panol_ingresar_stock_general` | Ingreso directo al stock |
| `panol_registrar_conteo_fisico` | Ajuste por conteo |
| `panol_egresar_producto` / `panol_egresar_carrito` | Egreso |
| `panol_transferir_producto` | Movimiento entre sedes |
| `panol_crear_envio` / `panol_marcar_items` | Avisos y recepción |
| `panol_egresar_obra_materiales` | Entrega a la obra |
| `panol_set_stock_minimo` | Mínimo de reposición |
| `panol_crear_catalog_material` | Alta de producto |

Esto es bueno y conviene mantenerlo: significa que **las reglas viven en un solo
lugar**, y que simplificar una pantalla no puede romper la contabilidad.

---

## 7. Qué pantalla responde qué pregunta

| Pantalla | Pregunta que responde |
|---|---|
| **Catálogo maestro** | ¿Qué producto es este y cómo se identifica? |
| **Stock de pañol** | ¿Qué tenemos, cuánto y dónde? |
| **Recepción** | ¿Qué llegó o está por llegar? |
| **Materiales de obra** | ¿Qué necesita esta obra, qué se compró y qué se entregó? |
| **Compras** | ¿Qué se pidió, a quién y a cuánto? |
| **Movimientos** | ¿Qué pasó y quién lo hizo? |

Regla práctica: si estás buscando una respuesta en una pantalla que no es la de
su fila, probablemente falte una conexión, no un dato.

---

## 8. Requisito vs producto

Es la distinción más importante del catálogo y está **a medio migrar**:

- **Requisito** — lo que la obra necesita: *"un TV de 32 pulgadas"*. Genérico.
  No tiene stock ni se puede egresar.
- **Producto (SKU)** — lo que se compra y se mueve: *"Samsung UN32T4300"*.
  Concreto, tiene stock, código de barras y ubicación.

Hoy los dos viven en la misma tabla `panol_materiales`, distinguidos por el flag
`es_requisito`. Cuando una fila de obra ya resolvió qué producto concreto va, el
requisito original queda guardado en `requisito_material_id`, así no se pierde de
dónde venía.

---

## 9. Qué tiene que decirte la obra antes de comprar

Esta es la pregunta que más plata cuesta cuando no tiene respuesta: **¿esto ya lo
tenemos, o hay que comprarlo?**

### Los cinco números de cada ítem

Por cada material de la lista de una obra hacen falta cinco cantidades, no una:

| | Qué responde |
|---|---|
| **Necesita** | Cuánto lleva la obra según la matriz + adicionales |
| **Pedido** | Cuánto se pidió a compras |
| **Comprado** | Cuánto se compró efectivamente |
| **Recibido** | Cuánto llegó al pañol |
| **Entregado** | Cuánto se egresó a la obra |

### Los dos faltantes, que no son el mismo

- **Falta comprar** — lo que todavía no está cubierto por una compra activa.
  Esta es la lista de compras.
- **Falta entregar** — lo que la obra todavía no recibió, aunque ya esté comprado
  o incluso ya esté en el pañol. Esto no se compra: se va a buscar.

Confundirlos es comprar dos veces lo mismo.

### Lo que hay hoy

Cada fila de materiales de obra **ya guarda los enganches**: a qué pedido de
compras pertenece, a qué envío de pañol, si se recibió y cuándo se egresó. La
pantalla lo muestra como avisos del tipo *"tiene un pedido de compras asociado"*
o *"Pañol: recibido"*.

O sea: la trazabilidad de **ese ítem en particular** existe.

### Lo que falta

⚠️ **La obra no cruza contra el stock del pañol.** La lista de la obra no te dice
*"de esto ya hay 6 en Pampa"* si esas 6 unidades no están asignadas a esta obra.
Y ese es justamente el caso que hace que se compre de nuevo algo que ya está en
el galpón.

Ese cruce sí existe en **Compras sugeridas**, pero mira el consumo del pañol, no
los requerimientos de las obras. Son dos preguntas distintas y hoy sólo está
respondida la segunda.

⚠️ **Y el estado se puede poner a mano.** Que una fila diga "comprado" no prueba
que se haya comprado. Lo único duro es el enganche al pedido y la recepción
registrada.

---

## 10. Las trampas de hoy

Cosas reales del sistema actual. No son opiniones: están en el código.

**a) Los saldos negativos están escondidos.**
Las funciones de saldo terminan en `greatest(..., 0)`. Si el cálculo da −4, la
pantalla muestra 0. El negativo no se arregla: se tapa. Un producto en 0 puede
ser "no hay" o "hay un lío en el historial".

**b) Hay cuatro lugares que calculan el stock.**
La función SQL, `panolMovimientos.js`, y copias propias dentro de las pantallas.
No son idénticas: por ejemplo, una cuenta `reclasificacion_egreso` como salida y
otra no. **Dos pantallas pueden mostrar números distintos del mismo producto.**

**c) La base y el repositorio de migraciones no están sincronizados.**
Varias funciones del front detectan "columna inexistente" y **reintentan sin ese
campo**. Es decir: podés editar un alias, ver "guardado", y que no se haya
guardado nada. Si algo no queda después de editar, es por acá.

**d) Estados que parecen calculados pero se ponen a mano.**
Que una fila diga `en_panol` no prueba que el material esté en el pañol: puede
haberlo marcado una persona. Lo único que prueba que algo entró es que exista un
movimiento de recepción.

**e) Comprar no es tener.**
Si compras marca algo como comprado, eso no crea stock, y está bien que sea así.
"Falta comprar" y "falta entregar" son dos cosas distintas y hay que mirarlas por
separado.

---

## 11. Reglas de oro

1. **Sólo la recepción crea stock.** Ni la compra, ni el aviso, ni marcar un estado.
2. **Lo que está en camino no se cuenta como que está.**
3. **El nombre no es la identidad.** Dos productos con el mismo nombre pueden ser
   distintos, y el mismo producto puede estar escrito de cinco formas. Lo que
   manda es el ID.
4. **No crear un producto nuevo cuando no se encuentra uno.** Así nacen los
   duplicados. Si no aparece, es un caso a identificar, no un producto nuevo.
5. **Los movimientos no se borran.** Si algo está mal, se corrige con otro
   movimiento que deje rastro.
6. **Antes de comprar, preguntale al pañol.** Que no esté asignado a esta obra no
   quiere decir que no lo tengamos.

---

## Glosario rápido

| Palabra | Qué es |
|---|---|
| **Matriz** | Lista de materiales de un modelo de barco. Plantilla. |
| **Snapshot** | La copia de la matriz fijada en una obra concreta. |
| **Envío / aviso** | Que algo va para el pañol. No es stock todavía. |
| **Requisito** | Lo que se necesita, en genérico. |
| **Producto / SKU** | Lo que se compra y se mueve. Concreto. |
| **Sede** | Dónde está: Pampa, Chubut… |
| **Egreso** | Salida del pañol hacia una obra. |
| **Cubeta** | Cómo está agrupado el stock: con existencia, por reponer, en camino, sin ubicación, a conciliar. |
