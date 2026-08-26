import { useEffect, useMemo, useState } from "react";
import { FolderOpen, LoaderCircle, ScanLine, X } from "lucide-react";
import { C } from "@/theme";
import { fetchObrasEgreso } from "@/features/panol/panolApi";
import { carpetaDeObra, carpetaParaMostrar } from "@/features/panol/carpetaRemitos";
import { hayColumnasDeRemito } from "@/features/panol/remitosArchivoApi";

/**
 * Lo que se pregunta antes de escanear. Sirve para dos cosas a la vez: el remito
 * queda archivado en la carpeta de su obra -Remitos\K55\55-1- y la IA lee el
 * documento sabiendo de quien viene, que es justo lo que le faltaba para no
 * tener que adivinar el proveedor.
 *
 * La obra NO es obligatoria: si el remito es de stock general y no va a ningun
 * barco, se escanea igual y queda en la raiz. Frenar un ingreso por un campo sin
 * completar seria peor que tener un remito sin clasificar.
 *
 * Quien lo usa lo monta solo cuando hace falta ({abierto && <Modal/>}), asi cada
 * vez arranca limpio y con lo que la pantalla ya sabe.
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
  proveedorSugerido = "",
  carpetasConocidas = [],
  origenInicial = "glass",
  soloArchivarInicial = false,
  permiteSoloArchivar = true,
  titulo: tituloVentana = "¿Qué vas a escanear?",
}) {
  const [obras, setObras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [obraId, setObraId] = useState(obraSugerida?.id ? String(obraSugerida.id) : "");
  const [proveedor, setProveedor] = useState(String(proveedorSugerido || ""));
  const [origen, setOrigen] = useState(origenInicial);
  const [titulo, setTitulo] = useState("");
  const [notas, setNotas] = useState("");
  // Archivar y ingresar son dos cosas distintas. A veces el remito llega, hay
  // que guardarlo, y el stock se carga otro dia o directamente ya se cargo por
  // otro lado. Forzar el ingreso hace que la bandeja de pendientes se llene de
  // cosas que en realidad estan resueltas.
  const [soloArchivar, setSoloArchivar] = useState(soloArchivarInicial);
  // No todo remito es de un barco. Los consumibles de Rebollar, la ferretería
  // de todos los meses, el service de una máquina: eso va a su propia carpeta y
  // meterlo en "stock general" lo vuelve imposible de encontrar despues.
  const [carpetaLibre, setCarpetaLibre] = useState("");
  // null mientras se averigua, para no mostrar un aviso que a lo mejor no va.
  const [faltaMigracion, setFaltaMigracion] = useState(null);
  // Un remito de Rebollar son treinta renglones de consumibles. Decirlo una vez
  // al principio evita marcarlos de a uno despues, que en la practica es lo que
  // nadie hace: quedan cargados como material comun y desaparecen de la pestaña
  // de Consumibles.
  const [esConsumibles, setEsConsumibles] = useState(false);

  useEffect(() => {
    let vivo = true;
    hayColumnasDeRemito()
      .then((hay) => { if (vivo) setFaltaMigracion(!hay); })
      .catch(() => { if (vivo) setFaltaMigracion(false); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    let vivo = true;
    fetchObrasEgreso()
      .then((filas) => { if (vivo) setObras(filas ?? []); })
      .catch(() => { if (vivo) setObras([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const porLinea = useMemo(() => {
    const mapa = new Map();
    for (const obra of obras) {
      if (obra?.estado === "entregada" || obra?.estado === "cancelada") continue;
      const linea = String(obra.linea_nombre || "").trim() || "Sin línea";
      mapa.set(linea, [...(mapa.get(linea) ?? []), obra]);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [obras]);

  const obraElegida = useMemo(
    () => obras.find((o) => String(o.id) === obraId) || null,
    [obras, obraId],
  );
  // Manda la obra cuando hay obra; si no, lo que se haya escrito. Las dos cosas
  // a la vez no tienen sentido: el remito esta en un lugar solo.
  const escrita = carpetaLibre.trim();
  const yaExistente = carpetasConocidas.find(
    (nombre) => String(nombre || "").trim().toLowerCase() === escrita.toLowerCase(),
  );
  const carpetaPropia = yaExistente || escrita;
  const carpeta = obraElegida ? carpetaDeObra(obraElegida) : carpetaPropia;

  // Las carpetas ya usadas, para no terminar con "Rebollar", "rebollar" y
  // "REBOLLAR" siendo tres carpetas distintas.
  const carpetasUsadas = useMemo(() => {
    const vistas = new Map();
    for (const nombre of carpetasConocidas) {
      const limpio = String(nombre || "").trim();
      if (!limpio) continue;
      const clave = limpio.toLowerCase();
      if (!vistas.has(clave)) vistas.set(clave, limpio);
    }
    return [...vistas.values()].sort((a, b) => a.localeCompare(b));
  }, [carpetasConocidas]);

  function confirmar() {
    onConfirmar?.({
      obra: obraElegida,
      carpeta,
      proveedor: proveedor.trim(),
      source: origen,
      titulo: titulo.trim(),
      notas: notas.trim(),
      soloArchivar,
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
          <ScanLine size={17} color={C.blue} />
          <div style={{ flex: 1, fontSize: 14.5, fontWeight: 950, color: C.text }}>{tituloVentana}</div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 14, overflowY: "auto", minHeight: 0 }}>
          {faltaMigracion ? (
            <div style={{ padding: "11px 13px", borderRadius: 9, background: C.redL, border: `1px solid ${C.redB}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: C.red, marginBottom: 4 }}>
                Falta correr la migración en Supabase
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, lineHeight: 1.5 }}>
                El remito se va a escanear y a guardar en la carpeta de la PC, pero <b>el barco, el tipo,
                la referencia y &ldquo;solo archivar&rdquo; NO se van a guardar en el sistema</b>. Hasta
                que la corras, lo que elijas acá abajo no tiene efecto.
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
            <div style={etiqueta}>Para qué barco</div>
            <select value={obraId} onChange={(event) => setObraId(event.target.value)} style={campo} disabled={cargando}>
              <option value="">{cargando ? "Cargando obras…" : "Sin obra · va a stock general"}</option>
              {porLinea.map(([linea, lista]) => (
                <optgroup key={linea} label={linea}>
                  {lista.map((obra) => (
                    <option key={obra.id} value={String(obra.id)}>{obra.codigo}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <div style={etiqueta}>
              De qué proveedor <span style={{ textTransform: "none", fontWeight: 700 }}>(opcional, ayuda a la IA)</span>
            </div>
            <input
              value={proveedor}
              onChange={(event) => setProveedor(event.target.value)}
              list="klasea-proveedores-escaneo"
              placeholder="Ej.: Iriarte"
              style={campo}
            />
            <datalist id="klasea-proveedores-escaneo">
              {proveedoresConocidos.map((nombre) => <option key={nombre} value={nombre} />)}
            </datalist>
          </div>

          {!obraElegida ? (
            <div>
              <div style={etiqueta}>
                Carpeta <span style={{ textTransform: "none", fontWeight: 700 }}>(si no es de un barco)</span>
              </div>
              <input
                value={carpetaLibre}
                onChange={(event) => setCarpetaLibre(event.target.value)}
                list="klasea-carpetas-escaneo"
                placeholder="Ej.: Consumibles Rebollar"
                style={campo}
              />
              <datalist id="klasea-carpetas-escaneo">
                {carpetasUsadas.map((nombre) => <option key={nombre} value={nombre} />)}
              </datalist>
              {yaExistente && yaExistente !== escrita ? (
                <div style={{ marginTop: 5, fontSize: 11, color: C.cyan, fontWeight: 750 }}>
                  Va a la carpeta que ya existe: <b>{yaExistente}</b>
                </div>
              ) : null}
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
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 9, border: `1px solid ${soloArchivar ? C.cyanB : C.border2}`, background: soloArchivar ? C.cyanL : C.panelSolid, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={soloArchivar}
                onChange={(event) => setSoloArchivar(event.target.checked)}
                style={{ marginTop: 2, accentColor: C.cyan, width: 15, height: 15, cursor: "pointer" }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 900, color: C.text }}>Solo archivar</span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: C.muted, lineHeight: 1.45 }}>
                  Lo guarda como documento y no abre el ingreso. Sirve para tener el papel cargado sin mover stock todavía.
                </span>
              </span>
            </label>
          ) : null}

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

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 9, background: C.panel2, border: `1px solid ${C.border}` }}>
            <FolderOpen size={14} color={C.dim} />
            <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 750, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Se guarda en <b style={{ color: C.text }}>{carpetaParaMostrar(carpeta)}</b>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: C.panel2, flexShrink: 0 }}>
          <button type="button" onClick={onCerrar} style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "9px 13px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={cargando} style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "9px 15px", cursor: cargando ? "default" : "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {cargando ? <LoaderCircle size={14} className="spin" /> : <ScanLine size={14} />}
            {soloArchivar ? "Escanear y archivar" : "Escanear"}
          </button>
        </div>
      </div>
    </div>
  );
}
