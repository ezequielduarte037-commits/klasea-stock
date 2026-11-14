import { useCallback, useEffect, useRef, useState } from "react";
import { almacenOperaciones, migrarColaAnterior } from "./mostradorPersistencia";
import { pendientesVisibles } from "./operacionesMostrador";
import { cerrarOperacion, procesarOperacion, revisarOperacion } from "./mostradorEnvios";

/** IndexedDB conserva también los enviados: el cupo no depende de una cola fugaz. */
export default function useColaSinConexion({ enviar, consultar, intervaloMs = 20_000, onEnviado } = {}) {
  const [operaciones, setOperaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const handlers = useRef({ enviar, consultar, onEnviado });
  const canalRef = useRef(null);
  const vivoRef = useRef(true);
  const migradoRef = useRef(false);
  const inicializandoRef = useRef(false);
  useEffect(() => { handlers.current = { enviar, consultar, onEnviado }; }, [enviar, consultar, onEnviado]);

  const actualizar = useCallback(async (avisar = true) => {
    const lista = await almacenOperaciones.listar();
    if (vivoRef.current) { setOperaciones(lista); if (migradoRef.current) setError(""); }
    if (avisar) canalRef.current?.postMessage("cambio");
    return lista;
  }, []);

  const registrarError = useCallback((err) => {
    if (vivoRef.current) setError(err?.message || "No se pudo guardar en este equipo. Conservá el carrito.");
  }, []);

  const encolar = useCallback(async (envio) => {
    try {
      const guardado = await almacenOperaciones.guardar(envio);
      await actualizar();
      return guardado;
    } catch (e) { registrarError(e); throw e; }
  }, [actualizar, registrarError]);

  const finalizar = useCallback(async (id, borrarBorrador) => {
    try {
      const guardado = await cerrarOperacion(id, { almacen: almacenOperaciones, borrarBorrador });
      await actualizar();
      return guardado;
    } catch (e) { registrarError(e); throw e; }
  }, [actualizar, registrarError]);

  const procesar = useCallback(async (id) => {
    try {
      const resultado = await procesarOperacion(id, {
        almacen: almacenOperaciones, enviar: handlers.current.enviar, consultar: handlers.current.consultar,
        token: crypto.randomUUID(), online: navigator.onLine !== false,
      });
      await actualizar();
      if (resultado.estado === "enviado") handlers.current.onEnviado?.(resultado);
      return resultado;
    } catch (e) { registrarError(e); throw e; }
  }, [actualizar, registrarError]);

  const revisar = useCallback(async (id, cambios = null) => {
    try {
      const resultado = await revisarOperacion(id, cambios, {
        almacen: almacenOperaciones, consultar: handlers.current.consultar, token: crypto.randomUUID(),
      });
      await actualizar();
      if (resultado.estado === "enviado") handlers.current.onEnviado?.(resultado);
      return resultado;
    } catch (e) { registrarError(e); throw e; }
  }, [actualizar, registrarError]);

  const intentar = useCallback(async () => {
    if (!migradoRef.current || enviandoRef.current || navigator.onLine === false) return;
    enviandoRef.current = true;
    if (vivoRef.current) setEnviando(true);
    try {
      const lista = await almacenOperaciones.listar();
      for (const envio of lista) {
        // El primer envío pertenece al cierre del carrito. Recién al finalizar
        // (o al recuperar tras F5) el reintento puede atender esa operación.
        if (!envio.finalizada || !["pendiente", "incierto"].includes(envio.estado)) continue;
        const resultado = await procesar(envio.id);
        if (resultado.estado === "incierto") break;
      }
      await actualizar(false);
    } catch (e) { registrarError(e); }
    finally { enviandoRef.current = false; if (vivoRef.current) setEnviando(false); }
  }, [actualizar, procesar, registrarError]);

  useEffect(() => {
    vivoRef.current = true;
    const canal = typeof BroadcastChannel === "function" ? new BroadcastChannel("klasea-consumibles-mostrador") : null;
    canalRef.current = canal;
    const inicializar = async () => {
      if (inicializandoRef.current) return;
      inicializandoRef.current = true;
      try {
        await migrarColaAnterior(almacenOperaciones, window.localStorage);
        migradoRef.current = true;
        await actualizar(false);
      } catch (e) { registrarError(e); }
      finally { inicializandoRef.current = false; if (vivoRef.current) setCargando(false); }
    };
    // Una migración fallida no puede desaparecer del aviso al sondear una
    // base vacía. Se vuelve a intentar conservando siempre la cola anterior.
    const leer = () => migradoRef.current ? actualizar(false).catch(registrarError) : inicializar();
    if (canal) canal.onmessage = leer;
    inicializar();
    const reloj = window.setInterval(intentar, intervaloMs);
    const sondeo = window.setInterval(leer, 5000);
    window.addEventListener("online", intentar);
    window.addEventListener("focus", leer);
    return () => {
      vivoRef.current = false;
      canalRef.current = null;
      canal?.close();
      window.clearInterval(reloj);
      window.clearInterval(sondeo);
      window.removeEventListener("online", intentar);
      window.removeEventListener("focus", leer);
    };
  }, [actualizar, intentar, intervaloMs, registrarError]);

  return { cola: pendientesVisibles(operaciones), operaciones, cargando, error, enviando, encolar, finalizar, procesar, revisar, intentar,
    leer: () => actualizar(false) };
}
