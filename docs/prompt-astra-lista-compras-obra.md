# Prompt para Astra — rediseño de la lista de compras por obra

Copiá todo lo que está debajo de la línea y pegalo en el chat.

---

Sos un diseñador de producto especializado en herramientas internas densas (ERP,
software de operaciones industriales). No hagas landing pages: esto es una
pantalla de trabajo que se usa varias horas por día.

## El contexto

Klase A es un astillero argentino que fabrica embarcaciones. Tiene un sistema
interno propio (React + Supabase, español rioplatense, tema oscuro y claro).

Dentro del sistema hay un módulo **"Listas de compras"**. Su estructura es:

```
Líneas de producción  →  K37 / K52 / K55  →  cada obra (barco)  →  LA PANTALLA A REDISEÑAR
```

Cada **línea** es un modelo de barco. Cada **obra** es una unidad concreta en
construcción (37-39, 37-40, 52-23, 55-1…). La pantalla que hay que rediseñar es
la que se abre al entrar a una obra: **la lista de todo lo que ese barco necesita
comprar, recibir y entregar.**

## Los números reales

- 3 líneas de producción, 19 obras activas (35 en total en la base)
- 1.895 materiales en el catálogo
- 908 filas de matriz (material × modelo, la "receta" del barco)
- 7.664 filas de snapshot por obra (el estado operativo real)
- **Una obra tiene entre 1 y 1.585 ítems. La mediana es 174.**
- 40 proveedores, 13–20 rubros por línea
- Cobertura de precios: K37 91%, K52 43%, K55 34%

Es decir: la pantalla típica muestra ~200 ítems y la peor ~1.600. Cualquier
diseño que asuma "una lista de 20 renglones" no sirve.

## Qué es cada cosa (vocabulario del negocio)

- **Matriz**: la receta del modelo. "Un K37 lleva 13 codos de bronce de 1/2\"."
  Es igual para todas las obras de esa línea.
- **Snapshot de obra**: lo que realmente pasó con ese ítem en ESA obra.
- **Adicional**: algo que se sumó a una obra puntual y no está en la matriz
  (el cliente lo pidió, o hizo falta). Hoy son 73 de 7.664.
- **Pañol**: el depósito. Un material puede estar comprado pero todavía no
  recibido en pañol, o recibido pero no entregado a la obra.
- **Egresado**: ya salió del pañol hacia la obra. Ese ítem está resuelto.
- **Stock libre**: unidades que hay en el pañol sin dueño asignado y que podrían
  usarse para esta obra sin comprar nada.

## Los estados por los que pasa un ítem

Del más crudo al resuelto, con los volúmenes reales del sistema:

| estado | qué significa | filas |
|---|---|---|
| `pendiente` | hace falta y no se hizo nada | 3.402 |
| `pedido` | se pidió a compras | 33 |
| `comprado` | comprado, no llegó | 17 |
| `en_panol` | está en el depósito | 2.773 |
| `recibido` / `parcial` | llegó, total o parcialmente | 64 |
| `egresado` | entregado a la obra | 1.375 |

## Qué hay hoy y por qué no se entiende

La pantalla actual es **un solo componente de 2.412 líneas** con:

- 33 estados de React
- una tabla plana con todos los ítems de la obra
- 4 filtros combinables: búsqueda de texto, proveedor, rubro, tipo, estado
- 4 agrupaciones alternativas: por **proveedor**, por **rubro**, por **etapa**,
  por **tipo**
- selección múltiple con acciones masivas
- un bloque aparte para "adicionales" con su propio buscador y su propio modal
- acciones dispersas: promover un adicional a la matriz, reasignar un adicional a
  otra obra, vincular con una orden de compra, avisar a pañol, editar el precio,
  editar el ítem del catálogo, borrar
- etiquetas que conviven sin jerarquía clara: "Falta comprar", "Falta entregar",
  "En compras", "En pañol", "Entregado", "Con movimiento", "Comprado",
  "Pendiente", "Egresado"

El resultado es que **nadie sabe por dónde empezar**. La pantalla muestra todo a
la vez con el mismo peso visual y deja que el usuario arme la consulta mental.

## Quiénes la usan y para qué

1. **Compras** — pregunta: *"¿qué tengo que comprar para esta obra, y a quién?"*
   Necesita agrupar por proveedor y sacar un pedido.
2. **Pañol** — pregunta: *"¿qué llegó y qué le tengo que entregar a esta obra?"*
3. **Oficina técnica** — pregunta: *"¿cómo viene esta obra? ¿qué la está
   frenando?"*
4. **Dirección** — pregunta: *"¿cuánto va costando este barco?"*

Hoy los cuatro miran la misma tabla indiferenciada.

## Lo que necesito de vos

**1. Diagnóstico.** Antes de dibujar nada, decime en pocas líneas cuál creés que
es el error estructural de la pantalla actual. No quiero "está sobrecargada":
quiero cuál es el modelo mental equivocado que impone.

**2. Propuesta de estructura.** ¿Cómo organizarías esto? Me interesa
especialmente que resuelvas:

- Cómo pasar de "una tabla con todo" a algo que responda la pregunta de cada rol
  sin obligar a configurar filtros cada vez.
- Qué debería ver alguien en los primeros 3 segundos.
- Cómo mostrar el estado de un ítem sin nueve etiquetas distintas.
- Cómo tratar los adicionales: ¿bloque aparte, o integrados con una marca?
- Cómo hacer que una lista de 1.585 ítems sea navegable.
- Qué acciones merecen estar siempre a la vista y cuáles no.

**3. Mockups en HTML.** Generá HTML autocontenido (un archivo, CSS embebido, sin
frameworks ni CDN) con **datos de ejemplo realistas** —nombres de materiales
náuticos en español, proveedores, cantidades, los estados de arriba—. Quiero al
menos:

- la vista principal de la obra
- el estado con muchos ítems (mostrá cómo se ve con 200+ y cómo se navega)
- el detalle o panel de un ítem
- una vista pensada para compras (agrupada por proveedor, lista para pedir)

Que funcione en oscuro y claro. Usá variables CSS para los colores.

**4. Alternativas.** Dame 2 o 3 direcciones distintas, no una sola. Por ejemplo
una conservadora (mejorar la tabla) y una que replantee de cero. Decime los
costos de cada una.

## Restricciones que no se negocian

- **Densidad operativa.** Esto no es un dashboard bonito: la gente necesita ver
  muchos datos rápido. Nada de tarjetas gigantes con mucho aire.
- **Español rioplatense**, mismo registro que el resto del sistema: etiquetas
  cortas y directas, sin explicaciones largas en la interfaz, sin instructivos
  dentro de los campos.
- **Nada de ámbar ni amarillo** en la paleta. Está prohibido en este sistema.
- Tiene que funcionar con teclado y verse bien desde 1280px. Hay tablets en el
  pañol, así que decime qué pasa en pantalla chica.
- No inventes datos que el sistema no tiene: trabajá con los campos que te
  describí.

## Cómo quiero la respuesta

Primero el diagnóstico y la propuesta en texto, después los HTML. Si algo de lo
que te conté no te cierra o te falta información para decidir, preguntame antes
de dibujar.
