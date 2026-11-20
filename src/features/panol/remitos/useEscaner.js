import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchScannerFiles,
  fetchScannerHealth,
  getScannerPairingKey,
  saveScannerPairingKey,
} from "@/features/panol/scannerBridge";

/**
 * El puente del escáner (KlaseaScannerBridge, en la PC del pañol que tiene la
 * Pantum). Pregunta seguido cuando está conectado —para que el PDF aparezca
 * apenas termina el escaneo— y espaciado cuando no hay puente en esta PC.
 *
 * estado: "buscando" | "conectado" | "sin_vincular" (el puente responde pero
 * falta el código) | "sin_puente" (esta PC no tiene el puente).
 */
export default function useEscaner() {
  const [health, setHealth] = useState(null);
  const [estado, setEstado] = useState("buscando");
  const [archivos, setArchivos] = useState([]);
  const [error, setError] = useState("");
  const [codigo, setCodigo] = useState(() => getScannerPairingKey());
  const vivoRef = useRef(true);
  const estadoRef = useRef("buscando");

  const cargar = useCallback(async () => {
    let siguiente = "sin_puente";
    try {
      const h = await fetchScannerHealth();
      if (!vivoRef.current) return;
      setHealth(h);
      siguiente = "sin_vincular";
      const lista = await fetchScannerFiles();
      if (!vivoRef.current) return;
      setArchivos(lista);
      setError("");
      siguiente = "conectado";
    } catch (e) {
      if (!vivoRef.current) return;
      setArchivos([]);
      setError(e?.message || "");
      if (siguiente === "sin_puente") setHealth(null);
    }
    estadoRef.current = siguiente;
    setEstado(siguiente);
  }, []);

  useEffect(() => {
    vivoRef.current = true;
    let reloj = null;
    const vuelta = async () => {
      await cargar();
      if (!vivoRef.current) return;
      reloj = window.setTimeout(vuelta, estadoRef.current === "conectado" ? 3500 : 20_000);
    };
    vuelta();
    return () => {
      vivoRef.current = false;
      window.clearTimeout(reloj);
    };
  }, [cargar]);

  const vincular = useCallback(async (valor) => {
    const key = saveScannerPairingKey(valor);
    setCodigo(key);
    await cargar();
    return Boolean(key);
  }, [cargar]);

  return {
    estado,
    conectado: estado === "conectado",
    escaneando: Boolean(health?.scanning),
    ultimoError: health?.lastError || "",
    version: health?.version || "",
    archivos,
    error,
    codigo,
    setCodigo,
    cargar,
    vincular,
  };
}
