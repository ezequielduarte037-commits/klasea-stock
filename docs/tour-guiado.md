# Tour guiado / onboarding interno

Idea acordada el 2026-07-26. **No implementado todavía** — esto es el plan para
cuando se retome.

## El problema

El sistema tiene ~25 pantallas y 8 roles. Una persona nueva no tiene por dónde
empezar, y una persona con meses tampoco tiene dónde consultar cuando se traba
en una pantalla puntual.

El caso testigo: en el rediseño de Compras por Etapa, crear una etapa y no
encontrar cómo cargarle materiales. Ninguna inducción del primer día resuelve
eso — se resuelve con ayuda en esa pantalla, en ese momento.

## Por qué NO una presentación lineal

Se descartó la idea de una intro tipo slideshow/video como pieza principal:

- **Se saltea.** Se ve una vez, el primer día, cuando todavía no tenés contexto
  para que te sirva.
- **Se pudre.** El sistema cambia todas las semanas. Contenido pregrabado queda
  mintiendo al primer cambio de UI.
- **Es la opción más cara y la que menos veces se mira.**

## Lo que sí

Tres capas, en este orden de prioridad.

### Capa 1 — Tour contextual por pantalla (el núcleo)

Un botón `?` en el header de cada screen. Resalta los elementos **reales** de la
pantalla, con los **datos reales** del usuario, paso a paso: spotlight sobre el
elemento + tooltip al lado.

No puede desactualizarse respecto de la UI porque apunta a la UI misma. Si el
selector cambia de lugar, el spotlight lo sigue; si desaparece, el paso se saltea
solo (ver "tolerancia a fallos" abajo).

Es la capa que más rinde: barata de extender pantalla por pantalla y disponible
justo cuando estás trabado.

### Capa 2 — Bienvenida por rol (primer login)

4 a 6 pasos, no una película. Acá sí van las animaciones ricas, reusando el
lenguaje visual de `src/features/cliente/OnboardingExperience.jsx` para que el
sistema interno se sienta de la misma familia que el panel del cliente.

**Por rol**: al operario de pañol no se le muestra Marmolería. Termina soltando
al usuario en su pantalla principal con el tour de capa 1 disponible.

### Capa 3 — Centro de ayuda

Una screen para volver a ver cualquier tour y ver el mapa del sistema según el
rol propio. Se cuelga al lado de `/procedimientos`, que ya filtra contenido por
rol y guarda en Supabase.

## Arquitectura

```
src/features/ayuda/
  tours.js          ← TODO el contenido, como datos. Un objeto por pantalla.
  TourProvider.jsx  ← contexto: tour activo, paso actual, navegación
  Tour.jsx          ← el overlay: spotlight + tooltip + controles
  useTour.js        ← hook para disparar un tour desde cualquier screen
  BotonAyuda.jsx    ← el "?" que va en el header de cada screen
  ayudaStorage.js   ← qué tours ya vio cada usuario (generalizar
                      features/cliente/onboardingStorage.js)
```

### El contenido va en un solo archivo

Esto es lo que decide si el tour sobrevive seis meses o no. `tours.js` es un
registro plano:

```js
export const TOURS = {
  "compras-etapa": {
    titulo: "Compras por etapa",
    roles: ["admin", "oficina", "tecnica", "compras"],
    pasos: [
      {
        target: '[data-tour="obra-selector"]',
        titulo: "Empezá eligiendo la obra",
        cuerpo: "Cada obra tiene sus propias tandas de compra.",
      },
      {
        target: '[data-tour="nueva-etapa"]',
        titulo: "Creá una tanda",
        cuerpo: "Una etapa de compra agrupa lo que se compra junto.",
      },
      {
        target: '[data-tour="agregar-materiales"]',
        titulo: "Cargale los materiales",
        cuerpo: "Buscás por proveedor o rubro y marcás varios de una.",
      },
    ],
  },
};
```

Agregar un paso = agregar un objeto. Si el texto queda desparramado dentro de
cada pantalla, en dos meses nadie lo actualiza.

En las pantallas sólo se agregan atributos: `data-tour="obra-selector"`. Nada de
lógica de tour dentro de la screen.

## Las dos restricciones que lo pueden matar

### 1. Los PDA de pañol

`vite.config.js` ya documenta que los PDA traen Chrome ~60-75 y por eso el build
apunta a `es2019`. Justo la gente que más necesita el onboarding es la que menos
puede correr `framer-motion` con `backdrop-filter`.

El tour tiene que degradar: en esos equipos, tooltips estáticos sin blur ni
animación. Nunca cargar `three.js` por ese camino, y respetar
`prefers-reduced-motion`.

### 2. Tolerancia a fallos

Si un `data-tour` desaparece porque se refactorizó la pantalla, el tour **no
puede romperse ni bloquear la UI**. Un paso cuyo target no existe se saltea en
silencio (y conviene loguearlo en dev para que se note).

## Otras decisiones

- **Lazy load**: el bundle principal ya pesa 3,6 MB (899 kB gzip). El tour se
  carga con `lazy()` igual que `OnboardingExperience`, no entra al bundle base.
- **Persistencia**: por ahora `localStorage` por usuario, como el onboarding del
  cliente. Si hace falta saber quién completó qué (RRHH, inducción formal), pasa
  a una tabla en Supabase.
- **Reusar, no duplicar**: `onboardingStorage.js` (33 líneas) ya resuelve el
  "ya lo vio" — se generaliza en vez de escribir otro.

## Por dónde arrancar

Corte vertical: el motor de tours + **una sola pantalla cableada**, y esa
pantalla es **Compras por etapa**. Es la más fresca, es la que probadamente no se
entendía sola, y sirve de test real.

Si el tour hace que se entienda sin explicación verbal, funciona y se despliega
pantalla por pantalla. Si no, se tiró poco trabajo.

Serían ~4 archivos nuevos y `data-tour` en media docena de elementos.
Las capas 2 y 3, después, con el motor ya probado.
