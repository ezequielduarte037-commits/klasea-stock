import { Suspense, lazy, useEffect, useState } from "react";
import { useDiferido } from "@/hooks/useDiferido";

// Misma constante que exporta GlobalSearch; se repite para no importar ese
// módulo (y con él todo el buscador) en el bundle inicial.
const EVENTO_ABRIR = "klasea:open-global-search";

const importarBuscador = () => import("./GlobalSearch");
const GlobalSearch = lazy(importarBuscador);

// El buscador, con su índice de pantallas y el asistente, pesa unos 70 KB y
// nadie lo usa en el primer segundo: se descarga después de entrar. Si alguien
// lo pide antes de que llegue (Ctrl+K o la lupa), se abre apenas carga.
export default function BuscadorDiferido({ profile }) {
  const listo = useDiferido(importarBuscador);
  const [pedido, setPedido] = useState(false);

  useEffect(() => {
    if (listo) return undefined;
    const pedir = () => setPedido(true);
    const alTeclear = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      pedir();
    };
    window.addEventListener("keydown", alTeclear, true);
    window.addEventListener(EVENTO_ABRIR, pedir);
    return () => {
      window.removeEventListener("keydown", alTeclear, true);
      window.removeEventListener(EVENTO_ABRIR, pedir);
    };
  }, [listo]);

  if (!listo) return null;
  return (
    <Suspense fallback={null}>
      <GlobalSearch profile={profile} abrirAlMontar={pedido} />
    </Suspense>
  );
}
