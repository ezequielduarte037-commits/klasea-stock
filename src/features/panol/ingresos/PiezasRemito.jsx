import { useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, FileScan, FileUp, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { fmtNum } from "@/features/consumibles/mostrador/mostradorLogica";
import { Hoja } from "@/features/panol/mostrador/CapasPanol";
import { escanearRemito, fetchRemitosPorIngresar, releerRemito, remitoSinLeer, scannerReceiptFileUrl } from "./ingresosApi";
import { referenciaDeRemito } from "./ingresosLogica";

const fecha = (iso) => {
  const d = new Date(`${String(iso || "").slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
};

const ESTADO_REMITO = {
  pendiente: "Sin leer",
  requiere_revision: "Con dudas",
  listo_ingreso: "Leído",
  parcial: "Ingresado en parte",
};

/**
 * Escanear un remito desde el mostrador: foto o archivo → se guarda → la IA
 * lo lee → los renglones van al carrito (`onLeido`). Abajo, los remitos que
 * se escanearon antes (acá o en el escáner) y todavía no se ingresaron.
 */
export function EscanearRemito({ sede, esTactil = false, remitoActual = null, onLeido, onCerrar }) {
  const toast = useToast();
  const fotoRef = useRef(null);
  const archivoRef = useRef(null);
  const vivoRef = useRef(true);
  const [paso, setPaso] = useState(null); // null | "guardando" | "leyendo"
  const [error, setError] = useState("");
  const [remitos, setRemitos] = useState(null);

  useEffect(() => {
    vivoRef.current = true;
    fetchRemitosPorIngresar(sede)
      .then((r) => { if (vivoRef.current) setRemitos(r); })
      .catch(() => { if (vivoRef.current) setRemitos([]); });
    return () => { vivoRef.current = false; };
  }, [sede]);

  const ocupado = Boolean(paso);

  async function resolver(promesa) {
    setError("");
    try {
      const r = await promesa;
      if (!vivoRef.current) return;
      if (!r.ok) {
        setError(r.mensaje || "La IA no pudo leer el remito. Quedó guardado: podés reintentar.");
        fetchRemitosPorIngresar(sede).then((l) => { if (vivoRef.current) setRemitos(l); }).catch(() => {});
        return;
      }
      if (r.dudas?.length) toast.warning(`La IA leyó con dudas: ${r.dudas.slice(0, 2).join(" · ")}`);
      onLeido(r.receipt, { duplicado: r.duplicado });
    } catch (e) {
      if (vivoRef.current) setError(e?.message || "No se pudo guardar el remito.");
    } finally {
      if (vivoRef.current) setPaso(null);
    }
  }

  function alElegirArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || ocupado) return;
    setPaso("guardando");
    // archivarRemito guarda primero y lee después; el cartel pasa a "leyendo" al rato.
    const reloj = window.setTimeout(() => { if (vivoRef.current) setPaso((p) => (p ? "leyendo" : p)); }, 2500);
    resolver(escanearRemito(file, { sede }).finally(() => window.clearTimeout(reloj)));
  }

  function cargarGuardado(receipt) {
    if (ocupado) return;
    if (remitoSinLeer(receipt)) {
      setPaso("leyendo");
      resolver(releerRemito(receipt));
      return;
    }
    onLeido(receipt, { duplicado: false });
  }

  async function verArchivo(receipt) {
    try {
      const url = await scannerReceiptFileUrl(receipt.archivo_url);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err?.message || "No se pudo abrir el archivo.");
    }
  }

  const otros = (remitos || []).filter((r) => r.id !== remitoActual?.id);

  return (
    <Hoja
      titulo="Escanear remito"
      sub={`La IA lee los renglones y los suma al carrito: lo que esperaba un pedido va a ese pedido. Pañol ${sede}.`}
      chica={false}
      onCerrar={() => { if (!ocupado) onCerrar(); }}
    >
      <input ref={fotoRef} type="file" accept="image/*" capture="environment" hidden onChange={alElegirArchivo} />
      <input ref={archivoRef} type="file" accept="image/*,application/pdf" hidden onChange={alElegirArchivo} />

      {ocupado ? (
        <div className="ing-remito-leyendo" role="status">
          <LoaderCircle size={22} className="mst-gira" aria-hidden="true" />
          <div>
            <strong>{paso === "guardando" ? "Guardando el remito…" : "Leyendo el remito…"}</strong>
            <span>{paso === "guardando" ? "Primero queda guardado el papel." : "La IA tarda entre 10 segundos y medio minuto."}</span>
          </div>
        </div>
      ) : (
        <div className="ing-remito-botones">
          {esTactil ? (
            <button type="button" className="ing-remito-boton is-principal" onClick={() => fotoRef.current?.click()}>
              <Camera size={26} aria-hidden="true" />
              <strong>Sacar foto</strong>
              <span>Con el remito derecho y entero</span>
            </button>
          ) : null}
          <button type="button" className={`ing-remito-boton${esTactil ? "" : " is-principal"}`} onClick={() => archivoRef.current?.click()}>
            <FileUp size={26} aria-hidden="true" />
            <strong>{esTactil ? "Elegir archivo" : "Elegir el archivo"}</strong>
            <span>PDF o imagen del escáner</span>
          </button>
        </div>
      )}

      {error ? <div className="mst-error" style={{ marginTop: 12 }}>{error}</div> : null}

      <div className="mst-bloque" style={{ marginTop: 18 }}>
        <div className="mst-bloque-titulo">Escaneados sin ingresar</div>
        {remitos == null ? (
          <div className="ing-remito-vacio"><LoaderCircle size={15} className="mst-gira" aria-hidden="true" /> Buscando…</div>
        ) : !otros.length ? (
          <div className="ing-remito-vacio">No hay remitos esperando en {sede}.</div>
        ) : (
          <div className="ing-remito-lista">
            {otros.map((r) => {
              const sinLeer = remitoSinLeer(r);
              const pendientes = (r.items || []).filter((it) => !it.scanner_ingreso_envio_id).length;
              return (
                <div key={r.id} className="ing-remito-fila">
                  <div className="ing-remito-texto">
                    <strong>{referenciaDeRemito(r)}</strong>
                    <span>
                      {fecha(r.fecha || r.created_at)}
                      {" · "}{ESTADO_REMITO[r.recepcion_estado] || (sinLeer ? "Sin leer" : "Leído")}
                      {!sinLeer ? ` · ${fmtNum(pendientes)} ${pendientes === 1 ? "renglón" : "renglones"}` : ""}
                    </span>
                  </div>
                  {r.archivo_url ? (
                    <button type="button" className="mst-icono-btn" onClick={() => verArchivo(r)} aria-label="Ver el archivo" title="Ver el archivo">
                      <ExternalLink size={15} />
                    </button>
                  ) : null}
                  <button type="button" className="ui-btn" disabled={ocupado} onClick={() => cargarGuardado(r)}>
                    {sinLeer ? <RotateCcw size={14} aria-hidden="true" /> : null}
                    {sinLeer ? "Leer" : "Cargar"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Hoja>
  );
}

/** El remito cargado en el carrito: de dónde salieron esas líneas. */
export function RemitoEnCarrito({ remito, onSoltar }) {
  const toast = useToast();
  async function ver() {
    try {
      const url = await scannerReceiptFileUrl(remito.archivoUrl);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err?.message || "No se pudo abrir el archivo.");
    }
  }
  return (
    <div className="ing-remito-carrito">
      <FileScan size={16} aria-hidden="true" />
      <span className="ing-remito-carrito-texto">{remito.referencia}</span>
      {remito.archivoUrl ? (
        <button type="button" className="ui-btn ui-btn-fantasma" style={{ minHeight: 30, padding: "0 8px" }} onClick={ver}>
          Ver <ExternalLink size={13} aria-hidden="true" />
        </button>
      ) : null}
      <button type="button" className="mst-quitar" onClick={onSoltar} aria-label="Soltar el remito (las líneas quedan)" title="Soltar el remito: las líneas quedan en el carrito">
        <X size={14} />
      </button>
    </div>
  );
}
