import { useEffect, useState } from "react";

// Para componentes que no hacen falta en el primer render (el buscador global,
// el widget de Compras): los saca del bundle inicial, que es lo que se baja
// antes de ver el login, también en el celular y en la PDA.
//
// Uso: declarar afuera `const importar = () => import("…")` y
// `const Pieza = lazy(importar)`; adentro, `const listo = useDiferido(importar)`
// y renderizar <Suspense fallback={null}><Pieza/></Suspense> sólo si `listo`.
//
// Devuelve true cuando la descarga terminó bien. Si falla (típico: un deploy
// nuevo cambió los nombres de los archivos), queda en false y el componente no
// se monta: la app sigue andando y AppVersionGuard ya avisa que hay versión
// nueva. Montar el lazy directamente dejaba subir ese error hasta la raíz,
// porque estos componentes están fuera de las rutas y de su error boundary.
//
// `importar` tiene que ser estable (declarado fuera del componente).
export function useDiferido(importar) {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let vivo = true;
    importar().then(
      () => { if (vivo) setListo(true); },
      () => { /* sin el componente; la app sigue */ },
    );
    return () => { vivo = false; };
  }, [importar]);
  return listo;
}
