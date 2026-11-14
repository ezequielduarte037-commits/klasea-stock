import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { useAhora } from "@/hooks/useAhora";
import { actualizarSolicitud } from "@/features/panol/solicitudesPanolApi";
import { fetchCatalogo, fetchObrasActivas, hoyArgentina, indexarCodigos } from "@/features/consumibles/api";
import { conPlazoLectura } from "../lecturas";
import { fetchEmpleadosMostrador } from "../mostrador/mostradorApi";
import Bandeja from "./Bandeja";
import Detalle from "./Detalle";
import { NuevaSolicitud } from "./Hojas";
import { CSS_SOLICITUDES } from "./solicitudesEstilos";
import { buscarEnHistorial, fetchBandeja, mensajeError } from "./solicitudesApi";
import { armarBandeja } from "./solicitudesLogica";

// Roles que preparan y entregan (los mismos que `panol_es_operador_solicitudes`).
const ROLES_OPERADOR = ["admin", "panol", "tecnica", "oficina"];

// Si el canal en vivo no trae nada (la tabla no está publicada o se cortó),
// la bandeja igual se renueva sola cada tanto mientras la pestaña está a la vista.
const RECARGA_MS = 60 * 1000;
const SIN_FILAS = [];

/**
 * Solicitudes de pañol, el carril planificado de Consumibles: el encargado
 * carga la lista hasta las 15 (celular) o deja el papel; pañol la prepara a la
 * tarde y se retira al día siguiente a las 7 con tarjeta.
 *
 * Bandeja a la izquierda y detalle a la derecha en la PC; en el celular, el
 * detalle tapa la bandeja. Se actualiza sola (canal realtime + recarga al
 * volver a la pestaña).
 */
export default function SolicitudesTab({ profile, sede }) {
  const toast = useToast();
  const idCanal = useId();
  const ahora = useAhora(60 * 1000);
  const hoyIso = hoyArgentina(ahora);
  const raizRef = useRef(null);

  const [angosto, setAngosto] = useState(false);
  const [filas, setFilas] = useState(null);
  const [errorBandeja, setErrorBandeja] = useState("");
  const [version, setVersion] = useState(0);
  const [pulso, setPulso] = useState(0);
  const [grupo, setGrupo] = useState("preparar");
  const [busqueda, setBusqueda] = useState("");
  const [historial, setHistorial] = useState({ q: "", filas: [] });
  const [seleccion, setSeleccion] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [asignando, setAsignando] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [obras, setObras] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [estadoEmpleados, setEstadoEmpleados] = useState("cargando");

  const puedeOperar = Boolean(profile?.is_admin) || ROLES_OPERADOR.includes(String(profile?.role ?? "").toLowerCase());

  // ── Ancho del contenedor ─────────────────────────────────────────────────
  useEffect(() => {
    const el = raizRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const obs = new ResizeObserver(([e]) => setAngosto(e.contentRect.width < 900));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Bandeja ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    conPlazoLectura(fetchBandeja({ sede }))
      .then((data) => { if (vivo) { setFilas(data); setErrorBandeja(""); } })
      .catch((e) => { if (vivo) setErrorBandeja(mensajeError(e, "No se pudo traer la bandeja.")); });
    return () => { vivo = false; };
  }, [sede, version]);

  // Buscar también en el historial (lo entregado hace más de una semana).
  const q = busqueda.trim();
  useEffect(() => {
    if (q.length < 2) return undefined;
    let vivo = true;
    const t = setTimeout(() => {
      buscarEnHistorial({ sede, q })
        .then((data) => { if (vivo) setHistorial({ q, filas: data }); })
        .catch(() => { if (vivo) setHistorial({ q, filas: [] }); });
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [sede, q]);

  // ── Datos de apoyo: catálogo de la sede, obras y personas ────────────────
  useEffect(() => {
    let vivo = true;
    fetchCatalogo({ sede })
      .then((data) => { if (vivo) setCatalogo(data); })
      .catch((e) => { if (vivo) toast.error(mensajeError(e, "No se pudo traer el catálogo de consumibles.")); });
    return () => { vivo = false; };
  }, [sede, toast]);

  useEffect(() => {
    let vivo = true;
    fetchObrasActivas().then((data) => { if (vivo) setObras(data); }).catch(() => {});
    // RRHH para firmar sin tarjeta y reconocer tarjetas sin ir a la base: ~225 personas.
    fetchEmpleadosMostrador()
      .then((data) => { if (vivo) { setEmpleados(data); setEstadoEmpleados("ok"); } })
      .catch(() => { if (vivo) setEstadoEmpleados("error"); });
    return () => { vivo = false; };
  }, []);

  // ── En vivo ──────────────────────────────────────────────────────────────
  const programada = useRef(null);
  useEffect(() => {
    const renovar = () => {
      clearTimeout(programada.current);
      // Varias filas cambian juntas (un "marcar todo"): se junta en una recarga.
      programada.current = setTimeout(() => {
        setVersion((v) => v + 1);
        setPulso((p) => p + 1);
      }, 400);
    };
    const canal = supabase
      .channel(`cns-solicitudes-${sede}-${idCanal.replace(/[^a-zA-Z0-9]/g, "")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "panol_solicitudes" }, renovar)
      .on("postgres_changes", { event: "*", schema: "public", table: "panol_solicitud_items" }, renovar)
      .subscribe();

    const alVolver = () => { if (document.visibilityState === "visible") renovar(); };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    const reloj = setInterval(() => { if (document.visibilityState === "visible") renovar(); }, RECARGA_MS);

    return () => {
      clearTimeout(programada.current);
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      supabase.removeChannel(canal);
    };
  }, [sede, idCanal]);

  // ── Derivados ────────────────────────────────────────────────────────────
  const porId = useMemo(() => new Map((catalogo ?? []).map((i) => [i.id, i])), [catalogo]);
  const indice = useMemo(() => indexarCodigos(catalogo ?? []), [catalogo]);
  const historialVigente = useMemo(() => (q.length >= 2 && historial.q === q ? historial.filas : SIN_FILAS), [q, historial]);
  const buscandoHistorial = q.length >= 2 && historial.q !== q;
  const bandeja = useMemo(
    () => armarBandeja([...(filas ?? []), ...historialVigente], { sede, busqueda, ahora: ahora.getTime() }),
    [filas, historialVigente, sede, busqueda, ahora],
  );

  const recargar = () => setVersion((v) => v + 1);

  async function asignarSede(s, nuevaSede) {
    setAsignando(s.id);
    try {
      await actualizarSolicitud(s.id, { sede_origen: nuevaSede });
      toast.success(`N° ${s.numero} quedó en el pañol ${nuevaSede}.`);
      recargar();
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo asignar la sede."));
    } finally {
      setAsignando(null);
    }
  }

  function alCrear(creada) {
    setNueva(false);
    setGrupo("preparar");
    setBusqueda("");
    setSeleccion(creada.id);
    toast.success(`N° ${creada.numero} creada. Cargá los renglones o leé la foto de la hoja.`);
    recargar();
  }

  // En el celular el detalle tapa la bandeja, pero la bandeja sigue montada
  // (inerte): al volver queda en el mismo lugar del scroll.
  const tapada = angosto && Boolean(seleccion);

  return (
    <div ref={raizRef} className={`sol${angosto ? " is-angosto" : ""}`}>
      <style>{CSS_SOLICITUDES}</style>
      <div className="sol-cuerpo">
        <Bandeja
          bandeja={bandeja}
          grupo={grupo}
          onGrupo={setGrupo}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          buscandoHistorial={buscandoHistorial}
          seleccion={seleccion}
          onElegir={setSeleccion}
          onNueva={() => setNueva(true)}
          onAsignarSede={asignarSede}
          asignando={asignando}
          cargando={filas == null && !errorBandeja}
          error={filas == null ? errorBandeja : ""}
          onReintentar={recargar}
          hoyIso={hoyIso}
          sede={sede}
          puedeOperar={puedeOperar}
          inerte={tapada}
        />

        {seleccion ? (
          <Detalle
            key={seleccion}
            solicitudId={seleccion}
            sede={sede}
            catalogo={catalogo}
            porId={porId}
            indice={indice}
            obras={obras}
            empleados={empleados}
            cargandoEmpleados={estadoEmpleados === "cargando"}
            puedeOperar={puedeOperar}
            angosto={angosto}
            pulso={pulso}
            onVolver={() => setSeleccion(null)}
            onCambio={recargar}
            onSalio={() => { setSeleccion(null); recargar(); }}
          />
        ) : !angosto ? (
          <section className="sol-detalle" aria-label="Solicitud">
            <div className="sol-detalle-vacio">
              <div>
                <ClipboardList size={34} style={{ color: "var(--dim)", marginBottom: 10 }} aria-hidden="true" />
                <p style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>Elegí una solicitud de la bandeja</p>
                <p style={{ margin: "4px 0 0" }}>Para preparar, entregar con tarjeta o imprimir la hoja.</p>
              </div>
            </div>
          </section>
        ) : null}

        {nueva ? <NuevaSolicitud sede={sede} obras={obras} onCerrar={() => setNueva(false)} onCreada={alCrear} /> : null}
      </div>
    </div>
  );
}
