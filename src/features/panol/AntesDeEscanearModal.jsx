import { useEffect, useMemo, useState } from "react";
import { FileText, LoaderCircle, ScanLine, X } from "lucide-react";
import { C } from "@/theme";
import { fetchObrasEgreso } from "@/features/panol/panolApi";
import { carpetaFisicaDeRemito, normalizarCarpetas } from "@/features/panol/carpetaRemitos";
import { fetchProveedoresConocidos, hayColumnasDeRemito } from "@/features/panol/remitosArchivoApi";
import { haySoporteRemitosCarpetas } from "@/features/panol/remitosCarpetasApi";
import SelectorDestinosRemito from "@/features/panol/SelectorDestinosRemito";
import DestinosDeRemito from "@/features/panol/DestinosDeRemito";

/**
 * Los datos del remito: de qué barco es, de qué proveedor, dónde se archiva.
 *
 * Se usa en dos momentos y por eso tiene `modo`:
 *  - "escanear": antes de mover la lámpara. Además de clasificar, elige la
 *    carpeta de la PC donde el puente va a dejar el PDF.
 *  - "guardar": sobre un archivo que ya existe (uno subido a mano, o un escaneo
 *    viejo que quedó sin clasificar). Ahí no hay origen que elegir.
 *
 * Esta ventana es la que evita el peor error del circuito anterior: los datos se
 * elegían UNA vez y después se le pegaban a cualquier archivo que se procesara,
 * así que tres remitos de tres barcos distintos terminaban los tres en el barco
 * del último. Cada papel pasa por acá con sus propios datos.
 *
 * Barcos y carpetas conviven. Antes eran excluyentes -el campo de carpeta
 * desaparecía apenas elegías un barco-, así que no había forma de decir "es del
 * 55-1 y además va en Garantías". Ahora se eligen juntos en el mismo buscador y
 * la ventana muestra, antes de confirmar, todos los lugares donde va a estar.
 *
 * Nada de esto es obligatorio: si el remito es de stock general y no va a ningún
 * barco, se guarda igual y queda en la raíz. Frenar un ingreso por un campo sin
 * completar sería peor que tener un remito sin clasificar.
 */

const ORIGENES = [
  { valor: "glass", etiqueta: "Vidrio", detalle: "una hoja apoyada" },
  { valor: "feeder", etiqueta: "Alimentador", detalle: "varias hojas" },
];

export default function AntesDeEscanearModal({
  onCerrar,
  onConfirmar,
  proveedoresConocidos = [],
  obraSugerida = null,
  obrasSugeridas = [],
  proveedorSugerido = "",
  carpetasConocidas = [],
  origenInicial = "glass",
  soloArchivarInicial = false,
  permiteSoloArchivar = true,
  modo = "escanear",
  archivoNombre = "",
  tituloInicial = "",
  notasInicial = "",
  carpetasIniciales = [],
  esConsumiblesInicial = false,
  titulo: tituloVentana = "",
}) {
  const guardando = modo === "guardar";
  const encabezado = tituloVentana || (guardando ? "Datos de este remito" : "¿Qué vas a escanear?");
  const [obras, setObras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [obraIds, setObraIds] = useState(() => {
    const sugeridas = obrasSugeridas.length ? obrasSugeridas : obraSugerida ? [obraSugerida] : [];
    return [...new Set(sugeridas.map((obra) => String(obra?.id || "")).filter(Boolean))];
  });
  const [proveedor, setProveedor] = useState(String(proveedorSugerido || ""));
  const [origen, setOrigen] = useState(origenInicial);
  const [titulo, setTitulo] = useState(String(tituloInicial || ""));
  const [notas, setNotas] = useState(String(notasInicial || ""));
  // Archivar y ingresar son dos cosas distintas. A veces el remito llega, hay
  // que guardarlo, y el stock se carga otro dia o directamente ya se cargo por
  // otro lado. Forzar el ingreso hace que la bandeja de pendientes se llene de
  // cosas que en realidad estan resueltas.
  const [soloArchivar, setSoloArchivar] = useState(soloArchivarInicial);
  // No todo remito es de un barco. Los consumibles de Rebollar, la ferretería
  // de todos los meses, el service de una máquina: eso va a su propia carpeta y
  // meterlo en "stock general" lo vuelve imposible de encontrar despues. Y un
  // remito puede estar en un barco Y en una carpeta a la vez: son dos preguntas
  // distintas -de quién es y dónde lo busco- y antes solo se podía contestar una.
  const [carpetasElegidas, setCarpetasElegidas] = useState(() => normalizarCarpetas(carpetasIniciales));
  // null mientras se averigua, para no mostrar un aviso que a lo mejor no va.
  const [faltaMigracion, setFaltaMigracion] = useState(null);
  const [hayCarpetas, setHayCarpetas] = useState(true);
  // Un remito de Rebollar son treinta renglones de consumibles. Decirlo una vez
  // al principio evita marcarlos de a uno despues, que en la practica es lo que
  // nadie hace: quedan cargados como material comun y desaparecen de la pestaña
  // de Consumibles.
  const [esConsumibles, setEsConsumibles] = useState(Boolean(esConsumiblesInicial));
  const esMultiobra = obraIds.length > 1;
  // Multiobra es documental. Hasta que exista reparto por renglon, intentar
  // abrir el ingreso haria que alguien eligiera una obra arbitraria.
  const soloArchivoEfectivo = esMultiobra || soloArchivar;

  // El campo de proveedor siempre tuvo datalist, pero durante mucho tiempo nadie
  // le pasaba la lista y salia vacio: habia que escribir el nombre de memoria, y
  // asi es como una misma empresa termina cargada de cuatro formas distintas.
  // Si quien monta la ventana no la trae, la buscamos nosotros.
  const [proveedoresPropios, setProveedoresPropios] = useState([]);
  const listaProveedores = proveedoresConocidos.length ? proveedoresConocidos : proveedoresPropios;

  useEffect(() => {
    let vivo = true;
    hayColumnasDeRemito()
      .then((hay) => { if (vivo) setFaltaMigracion(!hay); })
      .catch(() => { if (vivo) setFaltaMigracion(false); });
    haySoporteRemitosCarpetas()
      .then((hay) => { if (vivo) setHayCarpetas(hay); })
      .catch(() => { if (vivo) setHayCarpetas(false); });
    if (!proveedoresConocidos.length) {
      fetchProveedoresConocidos()
        .then((lista) => { if (vivo) setProveedoresPropios(lista); })
        .catch(() => { if (vivo) setProveedoresPropios([]); });
    }
    return () => { vivo = false; };
  }, [proveedoresConocidos.length]);

  useEffect(() => {
    let vivo = true;
    fetchObrasEgreso()
      .then((filas) => { if (vivo) setObras(filas ?? []); })
      .catch(() => { if (vivo) setObras([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const obrasElegidas = useMemo(() => {
    const porId = new Map(obras.map((obra) => [String(obra.id), obra]));
    // Las sugeridas ya vienen completas y evitan que el selector parpadee vacio
    // mientras carga el listado general.
    for (const obra of [...obrasSugeridas, obraSugerida].filter(Boolean)) {
      porId.set(String(obra.id), obra);
    }
    return obraIds.map((id) => porId.get(String(id))).filter(Boolean);
  }, [obras, obraIds, obrasSugeridas, obraSugerida]);
  // El PDF local vive en una carpeta sola: con varias obras va a Multiobra, y si
  // no hay barco manda la carpeta elegida o, en última instancia, la del
  // proveedor. En el sistema, en cambio, aparece en todas a la vez.
  const carpeta = carpetaFisicaDeRemito({
    obras: obrasElegidas,
    carpetas: carpetasElegidas,
    proveedor,
  });

  // Las carpetas ya usadas, para no terminar con "Rebollar", "rebollar" y
  // "REBOLLAR" siendo tres carpetas distintas.
  const carpetasUsadas = useMemo(
    () => normalizarCarpetas(carpetasConocidas).sort((a, b) => a.localeCompare(b)),
    [carpetasConocidas],
  );

  function confirmar() {
    onConfirmar?.({
      obra: obrasElegidas.length === 1 ? obrasElegidas[0] : null,
      obras: obrasElegidas,
      carpeta,
      carpetas: carpetasElegidas,
      proveedor: proveedor.trim(),
      source: origen,
      titulo: titulo.trim(),
      notas: notas.trim(),
      soloArchivar: soloArchivoEfectivo,
      esConsumibles,
    });
  }

  const etiqueta = { fontSize: 11, fontWeight: 900, color: C.dim, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 };
  const campo = {
    width: "100%", border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text,
    borderRadius: 9, padding: "9px 11px", fontFamily: C.sans, fontSize: 13, fontWeight: 700, outline: "none",
  };

  return (
    <div
      onClick={onCerrar}
      style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 16, fontFamily: C.sans }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(460px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          display: "flex",
          flexDirection: "column",
          background: C.panelSolid,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          boxShadow: "0 18px 50px rgba(15,23,42,0.28)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {guardando ? <FileText size={17} color={C.blue} /> : <ScanLine size={17} color={C.blue} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 950, color: C.text }}>{encabezado}</div>
            {archivoNombre ? (
              <div style={{ fontSize: 11, fontWeight: 750, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {archivoNombre}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 14, overflowY: "auto", minHeight: 0 }}>
          {faltaMigracion ? (
            <div style={{ padding: "11px 13px", borderRadius: 9, background: C.redL, border: `1px solid ${C.redB}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: C.red, marginBottom: 4 }}>
                Falta correr la migración multiobra en Supabase
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, lineHeight: 1.5 }}>
                El archivo documental sigue disponible, pero <b>no se puede guardar una selección
                de varias obras</b> hasta aplicar la migración nueva. No confirmes un remito
                multiobra mientras aparezca este aviso.
              </div>
            </div>
          ) : null}

          <div>
            <div style={etiqueta}>Qué trae este remito</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { valor: false, etiqueta: "Materiales", detalle: "para una obra" },
                { valor: true, etiqueta: "Consumibles", detalle: "de uso general" },
              ].map((opcion) => {
                const activo = esConsumibles === opcion.valor;
                return (
                  <button
                    key={String(opcion.valor)}
                    type="button"
                    onClick={() => setEsConsumibles(opcion.valor)}
                    style={{
                      flex: 1, border: `1px solid ${activo ? C.blueB : C.border2}`, background: activo ? C.blueL : C.panelSolid,
                      color: activo ? C.blue : C.text, borderRadius: 9, padding: "9px 8px", cursor: "pointer",
                      fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "grid", gap: 2,
                    }}
                  >
                    <span>{opcion.etiqueta}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: activo ? C.blue : C.dim }}>{opcion.detalle}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={etiqueta}>
              De qué proveedor <span style={{ textTransform: "none", fontWeight: 700 }}>(opcional, y es su carpeta)</span>
            </div>
            <input
              value={proveedor}
              onChange={(event) => setProveedor(event.target.value)}
              list="klasea-proveedores-escaneo"
              placeholder="Ej.: Iriarte"
              style={campo}
            />
            <datalist id="klasea-proveedores-escaneo">
              {listaProveedores.map((nombre) => <option key={nombre} value={nombre} />)}
            </datalist>
          </div>

          <div>
            <div style={etiqueta}>
              Guardar en <span style={{ textTransform: "none", fontWeight: 700 }}>(los barcos y carpetas que hagan falta)</span>
            </div>
            <SelectorDestinosRemito
              obras={obras}
              obraIds={obraIds}
              onObrasChange={setObraIds}
              carpetas={carpetasElegidas}
              onCarpetasChange={setCarpetasElegidas}
              carpetasConocidas={carpetasUsadas}
              proveedor={proveedor}
              permiteCarpetas={hayCarpetas}
              cargando={cargando}
            />
          </div>

          <DestinosDeRemito
            obras={obrasElegidas}
            carpetas={carpetasElegidas}
            proveedor={proveedor}
            mostrarRutaFisica={!guardando}
          />

          {!hayCarpetas && carpetasElegidas.length ? (
            <div style={{ fontSize: 11.5, color: C.cyan, fontWeight: 800, lineHeight: 1.45 }}>
              Falta la migración de carpetas: el remito va a quedar solo en la primera
              (<b>{carpetasElegidas[0]}</b>) y sin las demás.
            </div>
          ) : null}

          <div>
            <div style={etiqueta}>
              Referencia <span style={{ textTransform: "none", fontWeight: 700 }}>(opcional, para encontrarlo después)</span>
            </div>
            <input
              value={titulo}
              onChange={(event) => setTitulo(event.target.value)}
              placeholder="Ej.: Grifería del baño de proa"
              style={campo}
            />
          </div>

          <div>
            <div style={etiqueta}>Nota <span style={{ textTransform: "none", fontWeight: 700 }}>(opcional)</span></div>
            <textarea
              value={notas}
              onChange={(event) => setNotas(event.target.value)}
              rows={2}
              placeholder="Lo que convenga aclarar: falta una caja, viene con la factura aparte…"
              style={{ ...campo, resize: "vertical", minHeight: 54, fontWeight: 600 }}
            />
          </div>

          {permiteSoloArchivar ? (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 9, border: `1px solid ${soloArchivoEfectivo ? C.cyanB : C.border2}`, background: soloArchivoEfectivo ? C.cyanL : C.panelSolid, cursor: esMultiobra ? "default" : "pointer" }}>
              <input
                type="checkbox"
                checked={soloArchivoEfectivo}
                onChange={(event) => setSoloArchivar(event.target.checked)}
                disabled={esMultiobra}
                style={{ marginTop: 2, accentColor: C.cyan, width: 15, height: 15, cursor: esMultiobra ? "default" : "pointer" }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 900, color: C.text }}>
                  {esMultiobra ? "Solo archivar · requerido para multiobra" : "Solo archivar"}
                </span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: C.muted, lineHeight: 1.45 }}>
                  {esMultiobra
                    ? "Guarda un solo PDF dentro de todas las obras elegidas, sin repartir cantidades ni elegir un destino de stock."
                    : "Guarda el papel y no lo lee con IA ni abre el ingreso. Es lo más rápido y no puede fallar: el remito queda buscable y el stock se carga otro día, si hace falta."}
                </span>
              </span>
            </label>
          ) : null}

          {!guardando ? (
            <div>
              <div style={etiqueta}>De dónde</div>
              <div style={{ display: "flex", gap: 8 }}>
                {ORIGENES.map((opcion) => {
                  const activo = origen === opcion.valor;
                  return (
                    <button
                      key={opcion.valor}
                      type="button"
                      onClick={() => setOrigen(opcion.valor)}
                      style={{
                        flex: 1, border: `1px solid ${activo ? C.blueB : C.border2}`, background: activo ? C.blueL : C.panelSolid,
                        color: activo ? C.blue : C.text, borderRadius: 9, padding: "9px 8px", cursor: "pointer",
                        fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "grid", gap: 2,
                      }}
                    >
                      <span>{opcion.etiqueta}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: activo ? C.blue : C.dim }}>{opcion.detalle}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: C.panel2, flexShrink: 0 }}>
          <button type="button" onClick={onCerrar} style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "9px 13px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={cargando} style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "9px 15px", cursor: cargando ? "default" : "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {cargando ? <LoaderCircle size={14} className="spin" /> : guardando ? <FileText size={14} /> : <ScanLine size={14} />}
            {guardando
              ? (soloArchivoEfectivo ? "Guardar sin leer" : "Guardar y leer")
              : (soloArchivoEfectivo ? "Escanear y archivar" : "Escanear")}
          </button>
        </div>
      </div>
    </div>
  );
}
