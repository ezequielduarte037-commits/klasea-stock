// Últimos cambios de la memoria: qué campo, de qué a qué, quién y cuándo. Sólo
// aparece si la migración del registro está aplicada.
import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { traerCambios, traerPerfiles } from "../memoriasApi";
import { haceCuanto } from "../campos";

const VISIBLES = 12;

function legible(valor) {
  if (valor === "true") return "Sí";
  if (valor === "false") return "No";
  return valor;
}

export default function Cambios({ memoriaId, actualizada, campos }) {
  const [datos, setDatos] = useState(null);
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      const { ok, cambios } = await traerCambios(memoriaId);
      if (!ok) { if (vivo) setDatos({ ok: false, cambios: [], nombres: new Map() }); return; }
      const nombres = await traerPerfiles(cambios.map((c) => c.user_id));
      if (vivo) setDatos({ ok: true, cambios, nombres });
    }, 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [memoriaId, actualizada]);

  const etiquetas = useMemo(() => new Map(campos.map((c) => [c.key, c.label])), [campos]);
  if (!datos?.ok || !datos.cambios.length) return null;

  const nombreCampo = (campo) => {
    if (campo.endsWith("_obs")) return `${etiquetas.get(campo.slice(0, -4)) || campo.slice(0, -4)} · nota`;
    return etiquetas.get(campo) || campo.replace(/_/g, " ");
  };
  const lista = todos ? datos.cambios : datos.cambios.slice(0, VISIBLES);

  return (
    <section className="mem-seccion" data-tono="neutro">
      <div className="mem-seccion-cab">
        <span className="ic"><History size={16} /></span>
        <h2>Últimos cambios</h2>
        <span className="cuenta">{datos.cambios.length}</span>
      </div>
      <div className="mem-cambios">
        {lista.map((c) => (
          <div key={c.id} className="mem-cambio">
            <span>
              <b>{nombreCampo(c.campo)}</b>{": "}
              {c.antes != null && <><span className="de">{legible(c.antes)}</span>{" → "}</>}
              <span className="a">{c.despues != null ? legible(c.despues) : "borrado"}</span>
            </span>
            <time dateTime={c.created_at}>{haceCuanto(c.created_at)}</time>
            <small>{datos.nombres.get(c.user_id) || "Sin usuario"}</small>
          </div>
        ))}
        {datos.cambios.length > VISIBLES && (
          <button type="button" className="mem-link" style={{ justifySelf: "start", marginTop: 8 }} onClick={() => setTodos((v) => !v)}>
            {todos ? "Ver menos" : `Ver los ${datos.cambios.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
