import { useEffect, useState } from "react";
import { cargarFeriadosAnio } from "./feriados";

const VACIO = new Map();

export default function useFeriados(desde, hasta) {
  const primero = Number(desde?.slice(0, 4));
  const ultimo = Number(hasta?.slice(0, 4));
  const valido = Boolean(desde && hasta && desde <= hasta && Number.isInteger(primero) && Number.isInteger(ultimo));
  const clave = valido ? `${primero}:${ultimo}` : "";
  const [resultado, setResultado] = useState(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!clave) return;
    let activo = true;
    // Los años anteriores al inicio de la fuente se tratan como no disponibles.
    const tareas = primero >= 2016 && ultimo - primero <= 100
      ? Array.from({ length: ultimo - primero + 1 }, (_, i) => cargarFeriadosAnio(primero + i))
      : [Promise.reject(new Error("Rango de años sin calendario."))];
    Promise.all(tareas)
      .then((listas) => {
        if (activo) setResultado({ clave, intento, feriados: new Map(listas.flat().map((dia) => [dia.fecha, dia])) });
      })
      .catch(() => {
        if (activo) setResultado({ clave, intento, error: new Error("No se pudo verificar el calendario de feriados de este período.") });
      });
    return () => { activo = false; };
  }, [clave, primero, ultimo, intento]);

  const actual = resultado?.clave === clave && resultado.intento === intento ? resultado : null;
  return {
    feriados: actual?.feriados ?? VACIO,
    cargandoFeriados: Boolean(clave && !actual),
    errorFeriados: actual?.error,
    reintentarFeriados: () => setIntento((valor) => valor + 1),
  };
}
