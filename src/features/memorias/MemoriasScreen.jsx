// Memorias descriptivas: lo que eligió cada cliente para su barco.
//
// Portada con todos los barcos activos (cuánto tienen definido y qué falta) y
// la ficha de cada uno, que se completa por secciones y se guarda sola. Lo que
// se define acá llega a la obra: los adicionales a su lista de materiales (y de
// ahí a Compras y al pañol) y las opciones de la línea a la matriz.
//
// URL: /memorias?obra=52-27 abre la ficha de ese barco.
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Cargando from "@/components/ui/Cargando";
import { CSS_MEMORIAS } from "./estilos";
import {
  avanceDe, camposDeObra, modeloDeObra, datosDeFila, filaDeObra, lineaDeObra, ordenLinea, semillaDeObra,
} from "./campos";
import {
  escucharMemorias, traerCantidadAdicionales, traerMatrizMemoria, traerMemorias, traerObrasActivas, traerPerfiles,
} from "./memoriasApi";
import { deSerieDe } from "./matriz";
import Portada from "./Portada";
import { imprimirMemorias } from "./imprimir";
import Ficha from "./ficha/Ficha";

export default function MemoriasScreen() {
  const [params, setParams] = useSearchParams();
  const codigoAbierto = params.get("obra");
  const idCanal = useId().replace(/[^a-zA-Z0-9]/g, "");

  const [obras, setObras] = useState([]);
  const [filas, setFilas] = useState([]);
  const [columnas, setColumnas] = useState(() => new Set());
  const [adicionales, setAdicionales] = useState(() => new Map());
  const [perfiles, setPerfiles] = useState(() => new Map());
  const [matriz, setMatriz] = useState(() => new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const [o, m, a, mz] = await Promise.allSettled([traerObrasActivas(), traerMemorias(), traerCantidadAdicionales(), traerMatrizMemoria()]);
    if (mz.status === "fulfilled") setMatriz(mz.value);
    if (o.status === "fulfilled") setObras(o.value);
    if (m.status === "fulfilled") {
      setFilas(m.value.filas);
      setColumnas(m.value.columnas);
    }
    if (a.status === "fulfilled") setAdicionales(a.value);
    const fallo = [o, m].find((r) => r.status === "rejected");
    setError(fallo ? fallo.reason?.message || "No se pudieron traer las memorias." : "");
    setCargando(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(t);
  }, [cargar]);

  // Cambios de otras personas (y los propios) llegan por realtime.
  useEffect(() => escucharMemorias(idCanal, (payload) => {
    setFilas((prev) => {
      if (payload.eventType === "DELETE") return prev.filter((f) => f.id !== payload.old?.id);
      const nueva = payload.new;
      if (!nueva?.id) return prev;
      const i = prev.findIndex((f) => f.id === nueva.id);
      if (i < 0) return [...prev, nueva];
      const copia = prev.slice();
      copia[i] = { ...prev[i], ...nueva };
      return copia;
    });
  }), [idCanal]);

  // Nombres de quién guardó cada memoria.
  const idsPerfiles = useMemo(() => [...new Set(filas.map((f) => f.updated_by).filter(Boolean))].sort().join(","), [filas]);
  useEffect(() => {
    if (!idsPerfiles) return undefined;
    let vivo = true;
    const t = setTimeout(async () => {
      const nombres = await traerPerfiles(idsPerfiles.split(","));
      if (vivo) setPerfiles(nombres);
    }, 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [idsPerfiles]);

  const alGuardar = useCallback((fila) => {
    if (!fila?.id) return;
    setFilas((prev) => {
      const i = prev.findIndex((f) => f.id === fila.id);
      if (i < 0) return [...prev, fila];
      const copia = prev.slice();
      copia[i] = fila;
      return copia;
    });
  }, []);

  // Por modelo: lo que la matriz ya trae de serie y las opciones de la línea.
  const matrizPorModelo = useMemo(() => new Map([...matriz].map(([modelo, v]) => [modelo, {
    deSerie: deSerieDe(v.filas),
    opciones: v.opciones,
    conMatriz: v.filas.length > 0,
  }])), [matriz]);

  const fichas = useMemo(() => obras.map((obra) => {
    const fila = filaDeObra(obra, filas);
    const matrizLinea = matrizPorModelo.get(modeloDeObra(obra)) || null;
    const campos = camposDeObra(obra, matrizLinea);
    const datos = datosDeFila(fila);
    return {
      obra,
      fila,
      campos,
      datos,
      avance: avanceDe(campos, datos),
      linea: lineaDeObra(obra),
      semilla: semillaDeObra(obra),
      matrizLinea,
      adicionales: adicionales.get(obra.id) || 0,
    };
  }).sort((a, b) => ordenLinea(a.linea, b.linea) || a.obra.codigo.localeCompare(b.obra.codigo, "es", { numeric: true })), [obras, filas, adicionales, matrizPorModelo]);

  const indice = fichas.findIndex((f) => f.obra.codigo === codigoAbierto);
  const abierta = indice >= 0 ? fichas[indice] : null;

  const abrir = useCallback((codigo) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (codigo) p.set("obra", codigo); else p.delete("obra");
      return p;
    });
    document.querySelector(".mem-vista")?.scrollTo({ top: 0 });
  }, [setParams]);

  return (
    <div className="mem">
      <style href="klasea-memorias" precedence="default">{CSS_MEMORIAS}</style>
      <div className="mem-vista">
        {abierta ? (
          <Ficha
            key={abierta.obra.id}
            ficha={abierta}
            anterior={fichas[indice - 1] || null}
            siguiente={fichas[indice + 1] || null}
            filas={filas}
            columnas={columnas}
            perfiles={perfiles}
            onFilaGuardada={alGuardar}
            onVolver={() => abrir(null)}
            onAbrir={abrir}
          />
        ) : codigoAbierto && cargando ? (
          <Cargando texto={`Abriendo la memoria de ${codigoAbierto}…`} />
        ) : (
          <Portada
            fichas={fichas}
            cargando={cargando && !obras.length}
            error={error}
            perfiles={perfiles}
            onAbrir={abrir}
            onRecargar={() => void cargar()}
            onImprimir={(lista, nombre) => void imprimirMemorias(lista, { titulo: `Memorias ${nombre}`, perfiles })}
          />
        )}
      </div>
    </div>
  );
}
