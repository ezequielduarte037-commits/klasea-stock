import { useCallback, useState } from "react";
import useNfcBridge from "@/features/panol/useNfcBridge";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { buscarEmpleadoPorNfc, normalizeNfcUid } from "@/features/rrhh/api";

// Quién retira, validado con la tarjeta NFC del empleado (lector por puente o
// lector que escribe como teclado). Si no hay tarjeta, se escribe el nombre.

export function useRetiroNfc({ enabled, onEmpleado, onError }) {
  const [empleado, setEmpleado] = useState(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const resolver = useCallback(async (rawCode) => {
    const uid = normalizeNfcUid(rawCode);
    if (!uid) return;
    setCode(uid);
    setStatus("buscando");
    setError("");
    try {
      const emp = await buscarEmpleadoPorNfc(uid);
      if (!emp) {
        setEmpleado(null);
        setStatus("error");
        setError("Tarjeta sin empleado asignado en RRHH.");
        onError?.("Tarjeta NFC sin empleado asignado en RRHH.");
        return;
      }
      if (emp.activo === false) {
        setEmpleado(null);
        setStatus("error");
        setError("La tarjeta es de un empleado inactivo.");
        onError?.("La tarjeta pertenece a un empleado inactivo.");
        return;
      }
      setEmpleado(emp);
      setStatus("ok");
      onEmpleado?.(emp);
    } catch (err) {
      setEmpleado(null);
      setStatus("error");
      setError(err.message || "No se pudo leer la tarjeta.");
      onError?.(err.message || "No se pudo leer la tarjeta NFC.");
    }
  }, [onEmpleado, onError]);

  useKeyboardWedge({ enabled, ignoreEditable: false, minLength: 4, timeoutMs: 65, onScan: resolver });
  const bridge = useNfcBridge({ enabled, onUid: resolver });

  const clear = useCallback(() => {
    setEmpleado(null);
    setCode("");
    setStatus("idle");
    setError("");
  }, []);

  return { empleado, code, setCode, status, error, resolver, clear, bridge };
}
