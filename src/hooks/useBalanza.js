import { useCallback, useEffect, useRef, useState } from "react";
import { CONFIG_KRETZ, balanzaCompartida, extraerTramasKretz, serialSoportado } from "@/lib/balanzaSerial";

/**
 * useBalanza — acceso a la balanza Kretz con lectura A PEDIDO.
 *
 * La balanza queda configurada en modo "A pedido de Peso" (menú COMUNI → MODO).
 * En ese modo no emite nada hasta que le mandamos un caracter de pedido ("P"),
 * y responde UNA trama: STX + "XX.XXX" (kg) + CR.
 *
 * Usa la conexión COMPARTIDA de la app (`balanzaCompartida`), no una propia. Por
 * eso el hook NO desconecta al desmontarse: si lo hiciera, navegar entre
 * pantallas cerraría el puerto y la próxima pantalla no podría abrirlo. La
 * conexión se suelta sola al cerrar/recargar la pestaña, o a mano con
 * `desconectar()`.
 *
 * Uso:
 *   const bal = useBalanza();
 *   await bal.conectar();              // requiere click del usuario la 1ra vez
 *   const { gramos } = await bal.leerPeso();
 */
export function useBalanza({ autoConectar = true } = {}) {
  const bal = balanzaCompartida();
  const [conectado, setConectado] = useState(() => bal.conectado);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");

  const bufferRef = useRef("");
  const pendienteRef = useRef(null); // { resolve, reject, timer }

  // Suscripción a la conexión compartida. Sólo agrega/quita listeners: no toca
  // el estado del puerto, así que montar y desmontar pantallas es inofensivo.
  useEffect(() => {
    const offChunk = bal.on("chunk", (bytes) => {
      bufferRef.current += Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
      const [tramas, resto] = extraerTramasKretz(bufferRef.current);
      bufferRef.current = resto;
      if (!tramas.length) return;
      const p = pendienteRef.current;
      if (!p) return;
      clearTimeout(p.timer);
      pendienteRef.current = null;
      setLeyendo(false);
      p.resolve(tramas[tramas.length - 1]);
    });
    const offError = bal.on("error", (err) => setError(err?.message || String(err)));
    const offClose = bal.on("close", () => setConectado(false));
    return () => { offChunk(); offError(); offClose(); };
  }, [bal]);

  const conectar = useCallback(async () => {
    setError("");
    try {
      await bal.conectar(CONFIG_KRETZ);
      setConectado(true);
      return true;
    } catch (err) {
      if (err?.name !== "NotFoundError") setError(err?.message || String(err));
      return false;
    }
  }, [bal]);

  const desconectar = useCallback(async () => {
    await bal.desconectar();
    setConectado(false);
  }, [bal]);

  // Reconexión silenciosa con un puerto ya autorizado (sin diálogo).
  useEffect(() => {
    if (!autoConectar || !serialSoportado() || bal.conectado) return undefined;
    let vivo = true;
    (async () => {
      try {
        const info = await bal.conectarRecordado(CONFIG_KRETZ);
        if (vivo && info) setConectado(true);
      } catch { /* si falla, el usuario conecta a mano */ }
    })();
    return () => { vivo = false; };
  }, [autoConectar, bal]);

  /**
   * Pide una lectura y espera la trama. Devuelve { kg, gramos, crudo }.
   * Rechaza si la balanza no contesta dentro del timeout.
   */
  const leerPeso = useCallback(async ({ timeoutMs = 2500 } = {}) => {
    if (!bal.conectado) throw new Error("La balanza no está conectada.");
    if (pendienteRef.current) throw new Error("Ya hay una lectura en curso.");
    setError("");
    setLeyendo(true);
    bufferRef.current = "";
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendienteRef.current = null;
        setLeyendo(false);
        const msg = "La balanza no respondió. Revisá que esté en modo «A pedido de Peso» (menú COMUNI).";
        setError(msg);
        reject(new Error(msg));
      }, timeoutMs);
      pendienteRef.current = { resolve, reject, timer };
      bal.enviar("P").catch((err) => {
        clearTimeout(timer);
        pendienteRef.current = null;
        setLeyendo(false);
        setError(err?.message || String(err));
        reject(err);
      });
    });
  }, [bal]);

  return { soportado: serialSoportado(), conectado, leyendo, error, conectar, desconectar, leerPeso, setError };
}

/**
 * Calidad de una calibración de peso unitario. El error del peso-pieza se
 * propaga a TODOS los conteos futuros, así que conviene muestra grande.
 * Con división de 5 g, el error absoluto de la lectura es ~±2,5 g.
 */
export function calidadCalibracion(gramosMuestra) {
  const g = Number(gramosMuestra) || 0;
  if (g <= 0) return null;
  const errorPct = (2.5 / g) * 100;
  if (errorPct <= 0.5) return { nivel: "excelente", errorPct, texto: "Excelente" };
  if (errorPct <= 1) return { nivel: "buena", errorPct, texto: "Buena" };
  if (errorPct <= 3) return { nivel: "aceptable", errorPct, texto: "Aceptable" };
  return { nivel: "pobre", errorPct, texto: "Muestra muy chica" };
}
