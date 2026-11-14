// Arrancar la memoria desde otro barco parecido: completa sólo lo que está
// vacío (nunca pisa lo cargado ni copia los datos del cliente).
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { claveObra } from "@/features/equipos/equiposModelo";
import { MEMORIA_EXCEL_SEED } from "../memoriaExcelSeed";
import { datosDeFila, estaDefinido, leerSiNo, lineaDeObra, propio } from "../campos";
import { sinTildes } from "../acabados";
import { Modal } from "../ui";

function cantidadDeDatos(datos) {
  return Object.values(datos || {}).filter((v) => v !== null && v !== "" && typeof v !== "object").length;
}

function convertir(campo, valor) {
  if (valor == null || valor === "") return undefined;
  if (campo.tipo === "si_no") return leerSiNo(valor) ?? undefined;
  const texto = String(valor).trim();
  return texto || undefined;
}

export default function CopiarDeBarco({ ficha, datos, filas, puedeNota, onCopiar, onCerrar }) {
  const [q, setQ] = useState("");
  const [elegida, setElegida] = useState(null);
  const propia = claveObra(ficha.obra.codigo);

  const fuentes = useMemo(() => {
    const porClave = new Map();
    for (const fila of filas || []) {
      const clave = claveObra(fila.obra_codigo);
      if (!clave || clave === propia) continue;
      const d = datosDeFila(fila);
      const previa = porClave.get(clave);
      if (!previa || cantidadDeDatos(d) > cantidadDeDatos(previa.datos)) {
        porClave.set(clave, { clave, codigo: fila.obra_codigo, datos: d, origen: "memoria" });
      }
    }
    for (const [codigo, d] of Object.entries(MEMORIA_EXCEL_SEED)) {
      const clave = claveObra(codigo);
      if (!clave || clave === propia || porClave.has(clave)) continue;
      porClave.set(clave, { clave, codigo, datos: d, origen: "planilla" });
    }
    const campos = ficha.campos.filter((c) => c.seccion !== "cliente" && c.key !== "adicionales" && !c.serie && !c.opcion);
    return [...porClave.values()].map((f) => {
      const cambios = {};
      for (const c of campos) {
        const valor = convertir(c, propio(f.datos, c.key));
        if (valor !== undefined && !estaDefinido(c, datos[c.key])) cambios[c.key] = valor;
        const nota = String(propio(f.datos, `${c.key}_obs`) || "").trim();
        if (nota && puedeNota(c.key) && !String(datos[`${c.key}_obs`] || "").trim()) cambios[`${c.key}_obs`] = nota;
      }
      return { ...f, linea: lineaDeObra({ codigo: f.codigo }), cliente: propio(f.datos, "propietario") || propio(f.datos, "nombre_barco") || "", cambios, n: Object.keys(cambios).length };
    });
  }, [filas, propia, ficha.campos, datos, puedeNota]);

  const lista = useMemo(() => {
    const t = sinTildes(q);
    return fuentes
      .filter((f) => !t || sinTildes(`${f.codigo} ${f.cliente}`).includes(t))
      .sort((a, b) => Number(b.linea === ficha.linea) - Number(a.linea === ficha.linea) || b.n - a.n || String(b.codigo).localeCompare(String(a.codigo), "es", { numeric: true }))
      .slice(0, 60);
  }, [fuentes, q, ficha.linea]);

  const fuente = fuentes.find((f) => f.clave === elegida) || null;

  return (
    <Modal
      titulo="Copiar de otro barco"
      sub={`Completa sólo lo que está vacío en ${ficha.obra.codigo}. No toca lo ya cargado ni los datos del cliente.`}
      onCerrar={onCerrar}
      pie={(
        <>
          <button type="button" className="ui-btn chico" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario chico" disabled={!fuente?.n} onClick={() => onCopiar(fuente)}>
            {fuente?.n ? `Copiar ${fuente.n} dato${fuente.n === 1 ? "" : "s"} de ${fuente.codigo}` : "Elegí un barco"}
          </button>
        </>
      )}
    >
      <div className="mem-buscar" style={{ flex: "none", maxWidth: "none" }}>
        <Search size={15} />
        <input className="ui-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar barco o cliente" autoFocus />
      </div>
      {lista.map((f) => (
        <button
          key={f.clave}
          type="button"
          className={`mem-opcion-barco${elegida === f.clave ? " on" : ""}`}
          disabled={!f.n}
          style={!f.n ? { opacity: 0.45, cursor: "default" } : undefined}
          onClick={() => setElegida(f.clave)}
        >
          <span className="cod">{f.codigo}</span>
          <span className="txt">
            {f.linea}{f.cliente ? ` · ${f.cliente}` : ""}{f.origen === "planilla" ? " · planilla vieja" : ""}
          </span>
          <span className="mono" style={{ fontSize: 12, color: f.n ? "var(--blue)" : "var(--subtle)" }}>{f.n ? `+${f.n}` : "nada nuevo"}</span>
        </button>
      ))}
    </Modal>
  );
}
