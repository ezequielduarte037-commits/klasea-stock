import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, FileText, Folder, LoaderCircle, ScanLine, Search, Upload, X } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { hasAdminAccess, puedeVerPrecios } from "@/lib/permissions";
import { SEDES, guardarSedeDelEquipo, sedeDelEquipo } from "@/features/consumibles/api";
import { canonicalPanolSede, fetchObrasEgreso } from "@/features/panol/panolApi";
import { archiveScannerFile, downloadScannerFile, launchScannerApp, openScannerFolder } from "@/features/panol/scannerBridge";
import { actualizarDatosDeRemito, archivarRemito, borrarRemitoEscaneado } from "@/features/panol/remitosScannerApi";
import {
  fetchCarpetasUsadas, fetchProveedoresConocidos, fetchRemitosArchivados, reasignarCarpetasDeRemito, reasignarObrasDeRemito,
} from "@/features/panol/remitosArchivoApi";
import { normalizarCarpetas } from "@/features/panol/carpetaRemitos";
import useEscaner from "@/features/panol/remitos/useEscaner";
import {
  TODOS, agruparPorMes, baseParaOtroEscaneo, buscarRemitos, carpetasDelArchivo, conIngreso, contextoDeArchivo,
  destinoCorto, remitosDeCarpeta, sinClasificar, tituloDeCarpeta,
} from "@/features/panol/remitos/archivoRemitos";
import {
  FilaRemito, Hoja, HojaDatos, HojaDetalle, HojaEscaner, PanelCarpetas, PendientesPC,
} from "@/features/panol/remitos/PiezasRemitos";
import { CSS_REMITOS } from "@/features/panol/remitos/estilosRemitos";

/**
 * Remitos: guardar y encontrar los papeles. NO mueve stock.
 *
 * A la izquierda las carpetas (por barco, proveedor o carpeta propia, más
 * "sin clasificar" y "con ingreso"); a la derecha los remitos de la carpeta,
 * del más nuevo al más viejo. Tocar uno abre el papel y sus datos.
 *
 * Escanear es guardar: se elige dónde va, la Pantum escanea, el PDF aparece
 * arriba de la lista y se guarda con esos datos. También se puede subir un
 * archivo (PDF o foto) desde cualquier PC o el celular.
 *
 * Ingresar materiales es otra cosa (/ingresos-panol): al confirmar un ingreso
 * se elige cuál de estos remitos es, y queda atado.
 */

const VISTA_KEY = "klasea.panol.remitos.vista";
const PAGINA = 120;

function leer(clave, porDefecto) {
  try { return window.localStorage.getItem(clave) || porDefecto; } catch { return porDefecto; }
}

export default function RemitosPanolScreen({ profile }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [params] = useSearchParams();
  const escaner = useEscaner();

  const role = profile?.role;
  const isAdmin = hasAdminAccess(profile);
  const sedePerfil = canonicalPanolSede(profile?.sede);
  const sedeFija = role === "panol" && sedePerfil ? sedePerfil : null;
  const [sedeElegida, setSedeElegida] = useState(() => sedeDelEquipo() || "Chubut");
  const sede = sedeFija || sedeElegida;
  const puedeGuardar = isAdmin || role === "compras" || role === "panol";

  // ── Archivo ───────────────────────────────────────────────────────────────
  const [remitos, setRemitos] = useState(null);
  const [error, setError] = useState("");
  const [obras, setObras] = useState([]);
  const [cargandoObras, setCargandoObras] = useState(true);
  const [carpetasConocidas, setCarpetasConocidas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [vista, setVistaState] = useState(() => {
    const v = leer(VISTA_KEY, "barco");
    return ["barco", "proveedor", "carpeta"].includes(v) ? v : "barco";
  });
  const [carpeta, setCarpeta] = useState(TODOS);
  const [busqueda, setBusqueda] = useState(() => params.get("q") || "");
  const [mostrar, setMostrar] = useState(PAGINA);

  // ── Hojas y operaciones ───────────────────────────────────────────────────
  const [hoja, setHoja] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [ocupado, setOcupado] = useState("");
  // El escaneo lanzado: sus datos, los archivos que ya estaban y cuándo.
  const [escaneo, setEscaneo] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const archivo = await fetchRemitosArchivados({ limite: 2000 });
      setRemitos(archivo.remitos);
      setError("");
    } catch (e) {
      setError(e?.message || "No se pudieron traer los remitos.");
      setRemitos((r) => r ?? []);
    }
  }, []);

  const cargarListas = useCallback(() => {
    fetchCarpetasUsadas().then(setCarpetasConocidas).catch(() => {});
    fetchProveedoresConocidos().then(setProveedores).catch(() => {});
  }, []);

  useEffect(() => {
    cargar();
    cargarListas();
    let vivo = true;
    fetchObrasEgreso()
      .then((o) => { if (vivo) setObras(o || []); })
      .catch(() => {})
      .finally(() => { if (vivo) setCargandoObras(false); });
    return () => { vivo = false; };
  }, [cargar, cargarListas]);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const lista = useMemo(() => remitos ?? [], [remitos]);
  const grupos = useMemo(() => carpetasDelArchivo(lista, vista), [lista, vista]);
  const totales = useMemo(() => ({
    todos: lista.length,
    sinClasificar: lista.filter(sinClasificar).length,
    conIngreso: lista.filter(conIngreso).length,
  }), [lista]);
  const enCarpeta = useMemo(() => remitosDeCarpeta(lista, carpeta), [lista, carpeta]);
  const visibles = useMemo(() => buscarRemitos(enCarpeta, busqueda), [enCarpeta, busqueda]);
  const meses = useMemo(() => agruparPorMes(visibles.slice(0, mostrar)), [visibles, mostrar]);
  const titulo = tituloDeCarpeta(carpeta, grupos);

  function setVista(v) {
    setVistaState(v);
    try { window.localStorage.setItem(VISTA_KEY, v); } catch { /* sin almacenamiento */ }
    if (![TODOS, "sin_clasificar", "con_ingreso"].includes(carpeta)) setCarpeta(TODOS);
  }

  function elegirCarpeta(key) {
    setCarpeta(key);
    setMostrar(PAGINA);
    if (hoja?.tipo === "carpetas") setHoja(null);
    document.querySelector(".rmt-root .rmt-main")?.scrollTo({ top: 0 });
  }

  function elegirSede(s) {
    guardarSedeDelEquipo(s);
    setSedeElegida(s);
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function guardarArchivo(file, datos, { localId = "" } = {}) {
    if (!puedeGuardar) { toast.error("Tu usuario no puede guardar remitos."); return; }
    setOcupado(localId || "subida");
    setGuardando(true);
    try {
      const { receipt, duplicado } = await archivarRemito(file, {
        sede,
        proveedor: datos.proveedor,
        obraIds: (datos.obras || []).map((o) => o.id),
        carpetas: datos.carpetas || [],
        carpetaLocal: datos.carpetaFisica || "",
        titulo: datos.titulo || "",
        notas: datos.notas || "",
        soloArchivar: true,
      });
      if (localId) {
        await archiveScannerFile(localId).catch(() => {
          toast.warning("El remito se guardó, pero el archivo no se pudo sacar de Pendientes en la PC.");
        });
        escaner.cargar();
      }
      setHoja(null);
      await cargar();
      cargarListas();
      if (duplicado) {
        toast.info("Ese remito ya estaba guardado: te lo abro.");
        setHoja({ tipo: "detalle", remito: receipt });
        return;
      }
      toast.success(`Remito guardado ${destinoCorto(datos) === "sin barco ni proveedor" ? "sin clasificar" : `en ${destinoCorto(datos)}`}.`);
    } catch (e) {
      toast.error(e?.message || "No se pudo guardar el remito.");
    } finally {
      setGuardando(false);
      setOcupado("");
    }
  }

  async function guardarLocal(archivo, datos) {
    setOcupado(archivo.id);
    try {
      const file = await downloadScannerFile(archivo);
      await guardarArchivo(file, datos, { localId: archivo.id });
    } catch (e) {
      toast.error(e?.message || "No se pudo tomar el archivo del escáner.");
      setOcupado("");
    }
  }

  async function sacarLocal(archivo) {
    const ok = await confirmar({
      title: "Sacar sin guardar",
      message: `${archivo.name} sale de Pendientes en la PC y no se guarda en el sistema.`,
      confirmLabel: "Sacar",
    });
    if (!ok) return;
    setOcupado(archivo.id);
    try {
      await archiveScannerFile(archivo.id);
      escaner.cargar();
    } catch (e) {
      toast.error(e?.message || "No se pudo sacar el archivo.");
    } finally {
      setOcupado("");
    }
  }

  async function escanear(datos) {
    setHoja(null);
    setEscaneo({ contexto: datos, idsPrevios: escaner.archivos.map((a) => a.id), lanzadoEn: Date.now() });
    try {
      await launchScannerApp(datos.origen, datos.carpetaFisica);
      escaner.cargar();
      toast.success(`Escaneando para ${destinoCorto(datos)}. El PDF aparece acá arriba.`);
    } catch (e) {
      toast.error(e?.message || "No se pudo abrir el escáner.");
    }
  }

  async function guardarCambios(remito, datos) {
    setGuardando(true);
    try {
      const ok = await actualizarDatosDeRemito(remito.id, { proveedor: datos.proveedor, numero: datos.numero, titulo: datos.titulo, notas: datos.notas });
      if (!ok) { toast.warning("No se pudo guardar: revisá los permisos del usuario."); return; }
      const faltan = [];
      if (isAdmin) {
        const antes = (remito.obras || []).map((o) => String(o.id)).sort().join();
        if (antes !== [...datos.obraIds].map(String).sort().join() && !(await reasignarObrasDeRemito(remito.id, datos.obraIds))) faltan.push("los barcos");
        const cAntes = normalizarCarpetas(remito.carpetas || []).sort().join("|");
        if (cAntes !== normalizarCarpetas(datos.carpetas).sort().join("|") && !(await reasignarCarpetasDeRemito(remito.id, datos.carpetas))) faltan.push("las carpetas");
      }
      await cargar();
      cargarListas();
      setHoja(null);
      if (faltan.length) toast.warning(`Los datos se guardaron, pero no ${faltan.join(" ni ")}.`);
      else toast.success("Remito actualizado.");
    } catch (e) {
      toast.error(e?.message || "No se pudo guardar el remito.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(remito) {
    const ok = await confirmar({
      title: "Borrar el remito",
      message: `Se borran ${remito.proveedor || "el remito"} y su archivo. No se puede deshacer.`,
      confirmLabel: "Borrar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await borrarRemitoEscaneado(remito.id);
      setHoja(null);
      setRemitos((r) => (r || []).filter((x) => x.id !== remito.id));
      toast.success("Remito borrado.");
    } catch (e) {
      toast.error(e?.message || "No se pudo borrar el remito.");
    }
  }

  function subirArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setHoja({ tipo: "datos", modo: "nuevo", file, inicial: {} });
  }

  function abrirEscanear() {
    if (!escaner.conectado) { setHoja({ tipo: "escaner" }); return; }
    setHoja({ tipo: "datos", modo: "escanear", inicial: baseParaOtroEscaneo(escaneo?.contexto) });
  }

  // ── Hoja abierta ──────────────────────────────────────────────────────────
  let hojaVista = null;
  if (hoja?.tipo === "detalle") {
    const r = lista.find((x) => x.id === hoja.remito.id) || hoja.remito;
    hojaVista = (
      <HojaDetalle
        key={r.id}
        remito={r}
        puedeBorrar={isAdmin && !r.panol_envio_id}
        verPrecios={puedeVerPrecios(profile)}
        onEditar={() => setHoja({ tipo: "datos", modo: "editar", remito: r, inicial: r })}
        onBorrar={() => borrar(r)}
        onCerrar={() => setHoja(null)}
      />
    );
  } else if (hoja?.tipo === "datos") {
    hojaVista = (
      <HojaDatos
        key={`${hoja.modo}-${hoja.remito?.id || hoja.local?.id || hoja.file?.name || ""}`}
        modo={hoja.modo}
        inicial={hoja.inicial}
        archivoNombre={hoja.file?.name || hoja.local?.name || hoja.remito?.archivo_nombre || ""}
        obras={obras}
        cargandoObras={cargandoObras}
        proveedores={proveedores}
        carpetasConocidas={carpetasConocidas}
        puedeReasignar={hoja.modo !== "editar" || isAdmin}
        guardando={guardando}
        onCerrar={() => setHoja(hoja.modo === "editar" ? { tipo: "detalle", remito: hoja.remito } : null)}
        onGuardar={(datos) => {
          if (hoja.modo === "escanear") escanear(datos);
          else if (hoja.modo === "editar") guardarCambios(hoja.remito, datos);
          else if (hoja.local) guardarLocal(hoja.local, datos);
          else if (hoja.file) guardarArchivo(hoja.file, datos);
        }}
      />
    );
  } else if (hoja?.tipo === "escaner") {
    hojaVista = (
      <HojaEscaner
        escaner={escaner}
        onCerrar={() => setHoja(null)}
        onAbrirCarpeta={() => openScannerFolder({ carpeta: escaneo?.contexto?.carpetaFisica || "" }).catch((e) => toast.error(e?.message || "No se pudo abrir la carpeta."))}
      />
    );
  } else if (hoja?.tipo === "carpetas") {
    hojaVista = (
      <Hoja titulo="Carpetas" onCerrar={() => setHoja(null)} chica>
        <PanelCarpetas vista={vista} onVista={setVista} grupos={grupos} carpeta={carpeta} onCarpeta={elegirCarpeta} totales={totales} cargando={remitos == null} />
      </Hoja>
    );
  }

  const estadoEscaner = {
    conectado: ["is-ok", escaner.escaneando ? "Escaneando…" : "Escáner listo"],
    sin_vincular: ["is-medio", "Falta vincular"],
    sin_puente: ["", "Sin escáner"],
    buscando: ["", "Buscando escáner"],
  }[escaner.estado];

  return (
    <div className="rmt-root">
      <style>{CSS_REMITOS}</style>
      <PageHeader
        icon={FileText}
        eyebrow="Pañol"
        title="Remitos"
        actions={(
          <div className="rmt-acciones">
            {sedeFija ? (
              <span className="ui-chip is-activa" title="La sede de tu perfil">{sedeFija}</span>
            ) : (
              <div className="rmt-sede" role="group" aria-label="Sede donde se guardan">
                {SEDES.map((s) => (
                  <button key={s} type="button" className={`ui-chip${sede === s ? " is-activa" : ""}`} aria-pressed={sede === s} onClick={() => elegirSede(s)}>{s}</button>
                ))}
              </div>
            )}
            <button type="button" className="ui-btn rmt-estado-escaner" onClick={() => setHoja({ tipo: "escaner" })} title="Estado del escáner de esta PC">
              <span className={`rmt-punto ${estadoEscaner[0]}`} aria-hidden="true" />
              <span className="rmt-largo">{estadoEscaner[1]}</span>
            </button>
            <label className={`ui-btn${puedeGuardar ? "" : " is-disabled"}`} title="Guardar un PDF o una foto del remito">
              <Upload size={15} aria-hidden="true" /> <span className="rmt-largo">Subir archivo</span>
              <input type="file" hidden disabled={!puedeGuardar} accept="application/pdf,image/jpeg,image/png,image/webp,image/tiff,.pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff" onChange={subirArchivo} />
            </label>
            <button type="button" className="ui-btn ui-btn-primario" disabled={!puedeGuardar || escaner.escaneando} onClick={abrirEscanear}>
              {escaner.escaneando ? <LoaderCircle size={15} className="spin" /> : <ScanLine size={15} />}
              Escanear remito
            </button>
          </div>
        )}
      />

      <div className="rmt">
        <aside className="rmt-aside" aria-label="Carpetas">
          <PanelCarpetas vista={vista} onVista={setVista} grupos={grupos} carpeta={carpeta} onCarpeta={elegirCarpeta} totales={totales} cargando={remitos == null} />
        </aside>

        <main className="rmt-main">
          <div className="rmt-movil">
            <button type="button" className="rmt-movil-carpeta" onClick={() => setHoja({ tipo: "carpetas" })}>
              <Folder size={16} aria-hidden="true" />
              <span>{titulo}</span>
              {remitos ? <small className="rmt-cuenta">{visibles.length}</small> : null}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </div>

          {escaner.escaneando ? (
            <div className="rmt-aviso is-azul">
              <LoaderCircle size={17} className="spin" />
              <span className="rmt-aviso-texto"><strong>La Pantum está escaneando.</strong> Completá la ventana del controlador; el PDF aparece acá.</span>
            </div>
          ) : null}
          {escaneo && escaner.conectado ? (
            <div className="rmt-aviso">
              <ScanLine size={16} aria-hidden="true" />
              <span className="rmt-aviso-texto">Lo que se escanee ahora se guarda en <strong>{destinoCorto(escaneo.contexto)}</strong>.</span>
              <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => setEscaneo(null)} title="El próximo archivo va a preguntar los datos">Olvidar</button>
            </div>
          ) : null}
          <PendientesPC
            archivos={escaner.archivos}
            contextoDe={(a) => contextoDeArchivo(a, escaneo)}
            ocupado={ocupado}
            puedeGuardar={puedeGuardar}
            onGuardar={(a, contexto) => (contexto ? guardarLocal(a, contexto) : setHoja({ tipo: "datos", modo: "nuevo", local: a, inicial: {} }))}
            onCambiar={(a, contexto) => setHoja({ tipo: "datos", modo: "nuevo", local: a, inicial: contexto })}
            onSacar={sacarLocal}
          />

          <div className="rmt-cab">
            <h2 className="rmt-titulo">{titulo}<small>{remitos ? visibles.length : ""}</small></h2>
            <div className="rmt-buscar">
              <Search size={15} aria-hidden="true" />
              <input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setMostrar(PAGINA); }} aria-label="Buscar remitos" placeholder="Buscar" />
              {busqueda ? <button type="button" onClick={() => setBusqueda("")} aria-label="Borrar la búsqueda"><X size={14} /></button> : null}
            </div>
          </div>

          {error ? <div className="rmt-aviso is-rojo">{error}</div> : null}
          {remitos == null ? (
            <Cargando texto="Trayendo los remitos…" />
          ) : !visibles.length ? (
            <div className="rmt-vacio">
              <strong>{busqueda ? "No hay remitos que coincidan" : "No hay remitos acá"}</strong>
              {busqueda && carpeta !== TODOS ? (
                <button type="button" className="rmt-buscar-todo" onClick={() => elegirCarpeta(TODOS)}>Buscar en todo el archivo</button>
              ) : carpeta === "sin_clasificar" ? "Todos los remitos tienen barco o carpeta." : null}
            </div>
          ) : (
            <>
              {busqueda && carpeta !== TODOS ? (
                <div style={{ paddingTop: 10 }}>
                  <button type="button" className="rmt-buscar-todo" onClick={() => elegirCarpeta(TODOS)}>Buscar en todo el archivo</button>
                </div>
              ) : null}
              {meses.map((m) => (
                <section key={m.clave} aria-label={m.titulo}>
                  <div className="rmt-mes">{m.titulo}</div>
                  {m.remitos.map((r) => <FilaRemito key={r.id} remito={r} onAbrir={(x) => setHoja({ tipo: "detalle", remito: x })} />)}
                </section>
              ))}
              {visibles.length > mostrar ? (
                <div className="rmt-mas">
                  <button type="button" className="ui-btn" onClick={() => setMostrar((n) => n + PAGINA)}>
                    Ver más ({visibles.length - mostrar})
                  </button>
                </div>
              ) : null}
            </>
          )}
        </main>
      </div>

      {hojaVista}
    </div>
  );
}
