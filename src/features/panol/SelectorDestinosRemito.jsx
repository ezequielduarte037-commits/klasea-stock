import { useMemo, useRef, useState } from "react";
import { Building2, FolderPlus, Folder, Ship, X } from "lucide-react";
import { C } from "@/theme";
import { CARPETA_PROVEEDORES, normalizarCarpeta } from "@/features/panol/carpetaRemitos";

/**
 * Donde se guarda un remito: barcos y carpetas, en un solo buscador.
 *
 * Antes eran dos controles separados y excluyentes -un desplegable de obras y,
 * SOLO si no habias elegido ninguna, un campo de texto para la carpeta-. Con eso
 * era imposible decir lo mas normal del mundo: "este remito es del 55-1 y
 * ademas va en la carpeta del proveedor". Aca todo entra en la misma lista: se
 * escribe una vez y aparecen los barcos y las carpetas que coinciden, se eligen
 * los que sean, y si lo escrito no existe se crea la carpeta en el acto.
 *
 * La carpeta del proveedor no se elige: sale sola del nombre del proveedor y se
 * muestra para que se vea que el remito tambien va a estar ahi. Si se pudiera
 * tildar aparte quedaria desincronizada el dia que alguien corrige el nombre.
 */

function idsUnicos(ids) {
  return [...new Set((ids || []).map(String).filter(Boolean))];
}

/**
 * Con que se compara una carpeta: minusculas y sin acentos.
 *
 * Sin sacar los acentos, escribir "garantias" no encontraria "Garantías" y el
 * buscador ofreceria crearla de nuevo. Terminarian existiendo las dos, con la
 * mitad de los remitos en cada una, que es justo el problema que esta pantalla
 * viene a resolver. Nadie escribe los acentos cuando busca apurado.
 */
function clave(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function coincide(texto, consulta) {
  return clave(texto).includes(consulta);
}

function Ficha({ icono, texto, color, soft, border, onQuitar, titulo = "", disabled = false }) {
  return (
    <span
      title={titulo}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${border}`,
        background: soft,
        color,
        borderRadius: 999,
        padding: onQuitar ? "4px 5px 4px 9px" : "4px 10px",
        fontSize: 11.5,
        fontWeight: 900,
        maxWidth: "100%",
      }}
    >
      {icono}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{texto}</span>
      {onQuitar ? (
        <button
          type="button"
          onClick={onQuitar}
          disabled={disabled}
          aria-label={`Quitar ${texto}`}
          style={{
            width: 19,
            height: 19,
            border: "none",
            borderRadius: 999,
            background: "transparent",
            color,
            cursor: disabled ? "default" : "pointer",
            display: "grid",
            placeItems: "center",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <X size={11} />
        </button>
      ) : null}
    </span>
  );
}

function Opcion({ icono, titulo, detalle, color, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="panol-destino-opcion"
      style={{
        width: "100%",
        border: "none",
        borderRadius: 8,
        background: "transparent",
        color: C.text,
        textAlign: "left",
        padding: "7px 9px",
        display: "flex",
        alignItems: "center",
        gap: 9,
        cursor: disabled ? "default" : "pointer",
        fontFamily: C.sans,
      }}
    >
      <span style={{ color, display: "flex", flexShrink: 0 }}>{icono}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {titulo}
        </span>
        {detalle ? (
          <span style={{ display: "block", color: C.dim, fontSize: 10.5, fontWeight: 700 }}>{detalle}</span>
        ) : null}
      </span>
    </button>
  );
}

export default function SelectorDestinosRemito({
  obras = [],
  obraIds = [],
  onObrasChange,
  carpetas = [],
  onCarpetasChange,
  carpetasConocidas = [],
  proveedor = "",
  permiteCarpetas = true,
  disabled = false,
  cargando = false,
}) {
  const [consulta, setConsulta] = useState("");
  const entradaRef = useRef(null);

  const elegidas = idsUnicos(obraIds);
  const elegidasSet = new Set(elegidas);
  const obrasPorId = useMemo(() => new Map(obras.map((obra) => [String(obra.id), obra])), [obras]);

  const carpetasElegidas = useMemo(() => {
    const vistas = new Map();
    for (const nombre of carpetas || []) {
      const limpio = normalizarCarpeta(nombre);
      if (limpio && !vistas.has(clave(limpio))) vistas.set(clave(limpio), limpio);
    }
    return [...vistas.values()];
  }, [carpetas]);
  const carpetasSet = new Set(carpetasElegidas.map(clave));

  const q = clave(consulta);
  const escrita = normalizarCarpeta(consulta);

  // Barcos que se pueden sumar: los que no estan elegidos ni terminados.
  const obrasSugeridas = useMemo(() => {
    const disponibles = obras.filter((obra) => {
      if (elegidasSet.has(String(obra.id))) return false;
      if (obra?.estado === "entregada" || obra?.estado === "cancelada") return false;
      if (!q) return true;
      return coincide(obra.codigo, q) || coincide(obra.linea_nombre, q);
    });
    return disponibles
      .sort((a, b) => String(a.linea_nombre || "").localeCompare(String(b.linea_nombre || ""))
        || String(a.codigo || "").localeCompare(String(b.codigo || "")))
      .slice(0, q ? 12 : 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obras, q, elegidas.join("|")]);

  const carpetasSugeridas = useMemo(() => {
    const vistas = new Map();
    for (const nombre of carpetasConocidas) {
      const limpio = normalizarCarpeta(nombre);
      if (!limpio) continue;
      const id = clave(limpio);
      if (carpetasSet.has(id) || vistas.has(id)) continue;
      if (q && !coincide(limpio, q)) continue;
      vistas.set(id, limpio);
    }
    return [...vistas.values()].sort((a, b) => a.localeCompare(b)).slice(0, q ? 8 : 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carpetasConocidas, q, carpetasElegidas.join("|")]);

  // "Crear" solo cuando lo escrito no existe ya, ni elegido ni en la lista: si
  // no, se ofreceria crear una carpeta que es la misma de mas abajo escrita con
  // otra mayuscula o sin el acento, que es como se parte una carpeta en dos.
  const existente = escrita
    ? carpetasConocidas.map(normalizarCarpeta).find((nombre) => clave(nombre) === clave(escrita)) || ""
    : "";
  const yaExiste = Boolean(escrita) && (carpetasSet.has(clave(escrita)) || Boolean(existente));
  const puedeCrear = permiteCarpetas && Boolean(escrita) && !yaExiste;

  const proveedorCarpeta = normalizarCarpeta(proveedor);

  function agregarObra(id) {
    if (disabled || !id || elegidasSet.has(String(id))) return;
    onObrasChange?.([...elegidas, String(id)]);
    setConsulta("");
    entradaRef.current?.focus();
  }

  function quitarObra(id) {
    if (disabled) return;
    onObrasChange?.(elegidas.filter((actual) => actual !== String(id)));
  }

  /**
   * Si lo escrito es una carpeta que ya existe -aunque sea con otras mayusculas
   * o sin el acento- se guarda con el nombre que ya tiene. Al pañolero le da lo
   * mismo, y a la carpeta la mantiene entera.
   */
  function agregarCarpeta(nombre) {
    const limpio = normalizarCarpeta(nombre);
    if (disabled || !limpio || carpetasSet.has(clave(limpio))) return;
    const conocida = carpetasConocidas.map(normalizarCarpeta).find((existe) => clave(existe) === clave(limpio));
    onCarpetasChange?.([...carpetasElegidas, conocida || limpio]);
    setConsulta("");
    entradaRef.current?.focus();
  }

  function quitarCarpeta(nombre) {
    if (disabled) return;
    onCarpetasChange?.(carpetasElegidas.filter((actual) => clave(actual) !== clave(nombre)));
  }

  /** Enter toma lo primero de la lista, que es lo que uno espera al escribir. */
  function alTeclear(evento) {
    if (evento.key === "Escape" && consulta) {
      evento.preventDefault();
      setConsulta("");
      return;
    }
    if (evento.key !== "Enter") return;
    evento.preventDefault();
    // Sin nada escrito la lista es el catalogo entero: tomar "el primero" seria
    // meter un barco al azar en el remito.
    if (!consulta.trim()) return;
    if (obrasSugeridas.length) {
      agregarObra(obrasSugeridas[0].id);
      return;
    }
    if (carpetasSugeridas.length) {
      agregarCarpeta(carpetasSugeridas[0]);
      return;
    }
    if (puedeCrear) agregarCarpeta(escrita);
  }

  const sinResultados = !obrasSugeridas.length && !carpetasSugeridas.length && !puedeCrear;
  const hayElegido = elegidas.length > 0 || carpetasElegidas.length > 0;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <style>{`
        .panol-destino-opcion:hover:enabled { background: var(--panel-2); }
      `}</style>

      {hayElegido || proveedorCarpeta ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {elegidas.map((id) => {
            const obra = obrasPorId.get(id);
            return (
              <Ficha
                key={`obra-${id}`}
                icono={<Ship size={12} style={{ flexShrink: 0 }} />}
                texto={obra?.codigo || "Obra no disponible"}
                color={C.blue}
                soft={C.blueL}
                border={C.blueB}
                titulo={obra?.linea_nombre ? `Línea ${obra.linea_nombre}` : "Obra del remito"}
                onQuitar={() => quitarObra(id)}
                disabled={disabled}
              />
            );
          })}
          {carpetasElegidas.map((nombre) => (
            <Ficha
              key={`carpeta-${nombre.toLowerCase()}`}
              icono={<Folder size={12} style={{ flexShrink: 0 }} />}
              texto={nombre}
              color={C.violet}
              soft={C.violetL}
              border={C.violetB}
              titulo="Carpeta propia"
              onQuitar={() => quitarCarpeta(nombre)}
              disabled={disabled}
            />
          ))}
          {proveedorCarpeta ? (
            <Ficha
              icono={<Building2 size={12} style={{ flexShrink: 0 }} />}
              texto={`${CARPETA_PROVEEDORES}\\${proveedorCarpeta}`}
              color={C.teal}
              soft={C.tealL}
              border={C.tealB}
              titulo="Sale del proveedor: se actualiza sola si cambiás ese nombre"
            />
          ) : null}
        </div>
      ) : null}

      <input
        ref={entradaRef}
        value={consulta}
        onChange={(evento) => setConsulta(evento.target.value)}
        onKeyDown={alTeclear}
        disabled={disabled}
        maxLength={60}
        aria-label="Buscar un barco o una carpeta"
        placeholder={cargando ? "Cargando barcos…" : "Buscar barco o carpeta, o escribir una nueva…"}
        style={{
          width: "100%",
          border: `1px solid ${hayElegido ? C.blueB : C.border2}`,
          background: C.panelSolid,
          color: C.text,
          borderRadius: 9,
          padding: "9px 11px",
          fontFamily: C.sans,
          fontSize: 13,
          fontWeight: 750,
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      <div style={{
        border: `1px solid ${C.border}`,
        background: C.panel2,
        borderRadius: 10,
        padding: 5,
        maxHeight: 186,
        overflowY: "auto",
      }}>
        {puedeCrear ? (
          <Opcion
            icono={<FolderPlus size={15} />}
            titulo={`Crear carpeta «${escrita}»`}
            detalle="Queda disponible para los próximos remitos"
            color={C.violet}
            onClick={() => agregarCarpeta(escrita)}
            disabled={disabled}
          />
        ) : null}

        {carpetasSugeridas.length ? (
          <>
            <div style={{ padding: "6px 9px 3px", color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>
              Carpetas
            </div>
            {carpetasSugeridas.map((nombre) => (
              <Opcion
                key={`sug-carpeta-${nombre.toLowerCase()}`}
                icono={<Folder size={15} />}
                titulo={nombre}
                color={C.violet}
                onClick={() => agregarCarpeta(nombre)}
                disabled={disabled}
              />
            ))}
          </>
        ) : null}

        {obrasSugeridas.length ? (
          <>
            <div style={{ padding: "6px 9px 3px", color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>
              Barcos
            </div>
            {obrasSugeridas.map((obra) => (
              <Opcion
                key={`sug-obra-${obra.id}`}
                icono={<Ship size={15} />}
                titulo={obra.codigo}
                detalle={obra.linea_nombre || "Sin línea"}
                color={C.blue}
                onClick={() => agregarObra(obra.id)}
                disabled={disabled}
              />
            ))}
          </>
        ) : null}

        {sinResultados ? (
          <div style={{ padding: "12px 9px", color: C.dim, fontSize: 11.5, fontWeight: 750, textAlign: "center" }}>
            {cargando
              ? "Cargando…"
              : !permiteCarpetas && escrita
                ? "Falta la migración de carpetas para poder crear una."
                : consulta
                  ? "Nada con ese nombre."
                  : "Ya está todo elegido."}
          </div>
        ) : null}
      </div>

      {!hayElegido && !proveedorCarpeta ? (
        <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 700 }}>
          Sin barco ni carpeta: el remito queda en el archivo general.
        </div>
      ) : null}

      {elegidas.length > 1 ? (
        <div style={{ color: C.cyan, fontSize: 11.5, fontWeight: 800 }}>
          Multiobra · un solo PDF visible desde {elegidas.length} barcos.
        </div>
      ) : null}
    </div>
  );
}
