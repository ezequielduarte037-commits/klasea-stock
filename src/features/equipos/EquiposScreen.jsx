/**
 * EquiposScreen — control de motores y grupos electrógenos.
 *
 * Qué motor y qué grupo lleva cada barco, qué hay en el galpón, qué falta
 * llegar y la historia de cada número de serie (para postventa). Los datos
 * iniciales salen de los Excel (equiposSeed.js) y se cruzan con la base: qué
 * barcos siguen en producción, qué dice la memoria de cada uno y los equipos ya
 * cargados o movidos desde acá (tabla equipos).
 *
 * Arriba de "Por barco" va lo que hay que resolver (recepciones atrasadas,
 * compras para retirar, datos a revisar); después los barcos agrupados por
 * línea, una fila cada uno, que se abre para ver y mover cada equipo.
 *
 * Los filtros (línea, motores y grupos) valen para las cuatro vistas y viven en
 * la URL junto con la vista elegida: se pueden pasar por link.
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowRightLeft, ChevronDown, Cog, History, PackageCheck, PackageOpen, Plus, Search, Ship, SlidersHorizontal, Trash2, Warehouse, X, Zap } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/supabaseClient";
import {
  CLAVES_FILTRO,
  ESTADOS,
  ESTADOS_BARCO,
  FACETAS,
  FACETAS_POR_VISTA,
  MARCAS_MOTOR,
  SECCIONES_FILTRO,
  TIPO_POR_VISTA,
  aResolver,
  agruparPorLinea,
  aplicarBase,
  claveObra,
  barcosEnProduccion,
  barcosEntregados,
  equiposEnGalpon,
  equiposIniciales,
  etiquetaDeFiltro,
  filtrar,
  formatearFecha,
  movimientosDeGrupos,
  opcionesDeFiltro,
  recepcionVencida,
  textoFechaEstimada,
  ultimosGruposEntregados,
} from "./equiposModelo";

const TONOS = {
  violeta: "var(--violet)",
  azul: "var(--blue)",
  cian: "var(--cyan)",
  verde: "var(--green)",
  neutro: "var(--muted)",
  rojo: "var(--red)",
};

const PESTANAS = [
  { key: "barcos", label: "Por barco", Icono: Ship },
  { key: "galpon", label: "Existencias", Icono: Warehouse },
  { key: "entregados", label: "Entregados", Icono: PackageCheck },
  { key: "movimientos", label: "Movimientos", Icono: History },
];

// Qué cuenta cada vista: los números de los filtros son de esto.
const UNIDADES = {
  barcos: ["barco", "barcos"],
  galpon: ["equipo", "equipos"],
  entregados: ["barco", "barcos"],
  movimientos: ["movimiento", "movimientos"],
};

const FACETAS_DE_MOTOR = ["motor", "modelo", "estado_motor"];
const FACETAS_DE_GRUPO = ["grupo", "kva", "proveedor", "estado_grupo"];

const MARCAS_GRUPO = ["Kohler", "Onan", "Sleeper", "Maze"];

const TIPOS_MOVIMIENTO = {
  reasignacion: "Cambio de barco",
  cambio_barco: "Cambio de barco",
  devuelto: "Volvió al galpón",
  reserva: "Reserva",
  instalacion: "Instalación",
  ingreso: "Llegó",
  retiro: "Retiro del proveedor",
  compra: "Compra",
  entrega: "Entrega del barco",
  baja: "Baja",
  otro: "Actualización",
};

function EstadoChip({ estado, urgente = false, vencida = false }) {
  const meta = ESTADOS[estado] || { label: estado, tono: "neutro" };
  const rojo = urgente || vencida;
  return (
    <span className="eq-estado" style={{ "--c": rojo ? TONOS.rojo : TONOS[meta.tono] }}>
      {urgente ? "Urgente" : vencida ? "Atrasado" : meta.label}
    </span>
  );
}

function nombreGrupo(grupo) {
  if (!grupo) return "";
  const kva = grupo.potencia ? `${String(grupo.potencia).replace(".", ",")} kVA` : grupo.modelo;
  return grupo.marca && grupo.marca !== "Sin marca" ? `${grupo.marca} ${kva}` : kva;
}

function nombreMotor(motor) {
  if (!motor) return "";
  const modelo = String(motor.modelo || "").trim();
  if (/^cursor\b/i.test(modelo)) return modelo;
  if (motor.marca === "FPT Iveco") return `Iveco ${modelo.replace(/^(fpt|ftp)?\s*iveco\s*/i, "")}`.trim();
  if (motor.marca === "Volvo Penta") return /^volvo\s+/i.test(modelo)
    ? modelo.replace(/^volvo(\s+penta)?\s+/i, "Volvo Penta ")
    : `Volvo Penta ${modelo}`.trim();
  if (motor.marca && !modelo.toLowerCase().startsWith(motor.marca.toLowerCase())) return `${motor.marca} ${modelo}`.trim();
  return modelo || motor.marca || "Motor sin identificar";
}

const nombreEquipo = (equipo) => (equipo.tipo === "motor" ? nombreMotor(equipo) : nombreGrupo(equipo));

// "2 × Iveco 570 Angular" si son iguales; si no, cada uno.
function resumenMotores(motores) {
  const cuenta = new Map();
  for (const motor of motores) {
    const nombre = nombreMotor(motor);
    cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1);
  }
  return [...cuenta].map(([nombre, n]) => (n > 1 ? `${n} × ${nombre}` : nombre)).join(" · ");
}

function contar(vista, cantidad) {
  const [singular, plural] = UNIDADES[vista];
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

function equipoDesdeBase(equipo) {
  return { ...equipo, obra: equipo.obra_codigo || null, movimientos: equipo.movimientos || [], stock_confirmado: true };
}

// El barco elegido de la lista de obras ("ANTAGO-A-30") y el que viene del
// Excel ("A30") son el mismo: se buscan por la clave.
const obraDe = (obras, codigo) => (codigo ? obras.find((obra) => claveObra(obra.codigo) === claveObra(codigo)) || null : null);

function payloadEquipo(equipo, obras = []) {
  const campos = [
    "tipo", "marca", "modelo", "potencia", "transmision", "numero_serie", "cajas", "proveedor",
    "obra_id", "obra_codigo", "posicion", "estado", "fecha_estimada", "urgente", "fecha_compra",
    "fecha_retiro", "fecha_ingreso", "fecha_instalacion", "fecha_entrega", "garantia_hasta",
    "compra_cliente", "notas", "purchase_request_id", "panol_envio_item_id", "origen",
  ];
  const payload = Object.fromEntries(campos.map((campo) => [campo, equipo[campo] ?? null]));
  const obra = obraDe(obras, equipo.obra_codigo || equipo.obra);
  payload.obra_id = payload.obra_id || obra?.id || null;
  payload.obra_codigo = payload.obra_codigo || obra?.codigo || equipo.obra || null;
  payload.urgente = Boolean(equipo.urgente);
  payload.compra_cliente = Boolean(equipo.compra_cliente);
  payload.marca = payload.marca || "Sin marca";
  if (payload.fecha_estimada && !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.fecha_estimada))) {
    payload.notas = [payload.notas, `Recepción estimada en planilla: ${payload.fecha_estimada}`].filter(Boolean).join("\n");
    payload.fecha_estimada = null;
  }
  return payload;
}

function integrarEquipos(actual, guardados) {
  const ids = new Set(guardados.map((equipo) => equipo.id));
  const origenes = new Set(guardados.map((equipo) => equipo.origen).filter(Boolean));
  const conservar = (equipo) => !ids.has(equipo.id) && (!equipo.origen || !origenes.has(equipo.origen));
  const activos = guardados.filter((equipo) => equipo.estado !== "baja").map(equipoDesdeBase);
  return {
    motores: [...actual.motores.filter(conservar), ...activos.filter((equipo) => equipo.tipo === "motor" && equipo.estado !== "comprado")],
    grupos: [...actual.grupos.filter(conservar), ...activos.filter((equipo) => equipo.tipo === "generador" && equipo.estado !== "comprado")],
    comprasGrupos: [...actual.comprasGrupos.filter(conservar), ...activos.filter((equipo) => equipo.estado === "comprado")],
  };
}

const serieNormal = (valor) => String(valor || "").replace(/\s/g, "").toUpperCase();

function errorDeGuardado(error, accion) {
  if (error?.code === "23505" && /numero_serie|serie/i.test(error.message || "")) {
    return new Error("Ese número de serie ya está cargado en otro equipo. Revisalo antes de guardar.");
  }
  if (/does not exist|schema cache/i.test(error?.message || "")) {
    return new Error(`${accion} de equipos todavía no está habilitado. Contactá a administración.`);
  }
  return error;
}

export default function EquiposScreen() {
  const toast = useToast();
  const [datos, setDatos] = useState(equiposIniciales);
  const [base, setBase] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [cargandoEquipo, setCargandoEquipo] = useState(null);
  const [equipoGestion, setEquipoGestion] = useState(null);
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [params, setParams] = useSearchParams();
  const idPanel = useId();

  // Con sesión, las obras (cuáles siguen en producción), lo que dice la
  // memoria de cada barco y los equipos ya guardados. Si la memoria no se puede
  // leer, se sigue sin ella. Hasta que llega la base no se muestra nada: sin
  // ella, los barcos entregados del Excel parecían en producción.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from("produccion_obras").select("id,codigo,estado"),
      supabase.from("obra_memorias").select("obra_codigo,motorizacion,grupo_electrogeno"),
      supabase.from("equipos").select("*"),
      supabase.from("equipo_movimientos").select("equipo_id,tipo,estado_anterior,estado_nuevo,obra_anterior,obra_nueva,fecha,nota,created_at"),
    ]).then(([obras, memorias, equipos, movimientos]) => {
      if (!vivo) return;
      setCargando(false);
      if (obras.error) return;
      setBase({ obras: obras.data || [], memorias: memorias.error ? [] : memorias.data || [] });
      if (!equipos.error && equipos.data?.length) {
        const historial = movimientos.error ? [] : movimientos.data || [];
        const guardados = equipos.data.map((equipo) => ({
          ...equipo,
          movimientos: historial
            .filter((movimiento) => movimiento.equipo_id === equipo.id && movimiento.tipo !== "alta")
            .map((movimiento) => ({
              tipo: movimiento.tipo,
              desde: claveObra(movimiento.obra_anterior),
              hacia: claveObra(movimiento.obra_nueva),
              fecha: movimiento.fecha,
              nota: movimiento.nota,
              estado_anterior: movimiento.estado_anterior,
              estado_nuevo: movimiento.estado_nuevo,
            })),
        }));
        setDatos((actual) => integrarEquipos(actual, guardados));
      }
    }, () => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const pestana = PESTANAS.some((tab) => tab.key === params.get("vista")) ? params.get("vista") : "barcos";
  const filtros = useMemo(() => Object.fromEntries(CLAVES_FILTRO.map((key) => [key, params.getAll(key)])), [params]);

  const cambiarParams = useCallback((cambiar) => setParams((actual) => {
    const siguiente = new URLSearchParams(actual);
    cambiar(siguiente);
    return siguiente;
  }, { replace: true }), [setParams]);
  const elegirPestana = useCallback((key) => cambiarParams((p) => (key === "barcos" ? p.delete("vista") : p.set("vista", key))), [cambiarParams]);
  const alternarFiltro = (key, valor) => cambiarParams((p) => {
    const actuales = p.getAll(key);
    p.delete(key);
    const siguientes = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
    for (const v of siguientes) p.append(key, v);
  });
  const limpiarFiltros = () => cambiarParams((p) => {
    for (const key of CLAVES_FILTRO) p.delete(key);
  });

  const obrasActivas = useMemo(() => (base?.obras || []).filter((obra) => obra.estado === "activa"), [base]);
  const vista = useMemo(() => aplicarBase(datos, base), [datos, base]);
  const todosLosEquipos = useMemo(() => [...vista.motores, ...vista.grupos, ...vista.comprasGrupos], [vista]);

  // El número de serie se busca en todo lo que se ve, Excel incluido: la base
  // sólo conoce lo que ya se guardó, y así se cargaba dos veces el mismo motor.
  const serieEnUso = useCallback((serie, tipo, propio = null) => {
    const buscada = serieNormal(serie);
    if (!buscada) return null;
    return todosLosEquipos.find((equipo) => equipo.tipo === tipo && serieNormal(equipo.numero_serie) === buscada
      && equipo.id !== propio?.id && (!propio?.origen || equipo.origen !== propio.origen)) || null;
  }, [todosLosEquipos]);

  const guardarEquipo = async (payload) => {
    const repetido = serieEnUso(payload.numero_serie, payload.tipo);
    if (repetido) {
      throw new Error(`La serie ${payload.numero_serie} ya es de ${nombreEquipo(repetido)}${repetido.obra ? ` (${repetido.obra})` : ""}. Usá Gestionar sobre ese equipo.`);
    }
    const { data, error } = await supabase.from("equipos").insert(payload).select("*").single();
    if (error) throw errorDeGuardado(error, "El guardado");
    const equipo = equipoDesdeBase(data);
    setDatos((actual) => integrarEquipos(actual, [equipo]));
    toast.success(`${nombreEquipo(equipo)} quedó cargado.`);
    setCargandoEquipo(null);
    if (equipo.obra && equipo.estado !== "en_galpon") {
      elegirPestana("barcos");
      setAbiertos((actual) => new Set(actual).add(claveObra(equipo.obra)));
    } else {
      elegirPestana("galpon");
    }
  };

  const materializarEquipo = async (equipo) => {
    if (!String(equipo.id).startsWith("eq-")) return equipo;
    if (equipo.origen) {
      const { data: existente, error: buscarError } = await supabase.from("equipos").select("*").eq("origen", equipo.origen).maybeSingle();
      if (buscarError) throw buscarError;
      if (existente) return equipoDesdeBase(existente);
    }
    const { data, error } = await supabase.from("equipos").insert(payloadEquipo(equipo, obrasActivas)).select("*").single();
    if (error) throw error;
    return { ...equipoDesdeBase(data), movimientos: equipo.movimientos || [] };
  };

  const moverEquipo = async (equipo, destino) => {
    const repetido = serieEnUso(destino.numeroSerie, equipo.tipo, equipo);
    if (repetido) {
      throw new Error(`La serie ${destino.numeroSerie} ya es de ${nombreEquipo(repetido)}${repetido.obra ? ` (${repetido.obra})` : ""}.`);
    }
    try {
      const persistido = await materializarEquipo(equipo);
      const serieAnterior = String(persistido.numero_serie || "").trim();
      const serieNueva = String(destino.numeroSerie || "").trim();
      const cambioSerie = serieAnterior !== serieNueva;
      let data;
      let error;
      if (cambioSerie) {
        // Serie y destino se guardan juntos: una serie duplicada no debe dejar
        // el motor marcado como recibido o movido a otro barco.
        const constancia = `${new Date().toISOString().slice(0, 10)} · Serie: ${serieAnterior || "sin número"} → ${serieNueva || "sin número"}${destino.nota ? ` · ${destino.nota}` : ""}`;
        const notas = [persistido.notas, constancia].filter(Boolean).join("\n");
        ({ data, error } = await supabase.from("equipos").update({
          estado: destino.estado,
          obra_id: destino.obraId || null,
          obra_codigo: destino.obraCodigo || null,
          numero_serie: serieNueva || null,
          notas,
        }).eq("id", persistido.id).select("*").single());
      } else {
        ({ data, error } = await supabase.rpc("equipo_mover", {
          p_equipo: persistido.id,
          p_estado: destino.estado,
          p_obra: destino.obraId || null,
          p_obra_codigo: destino.obraCodigo || null,
          p_nota: destino.nota || null,
        }));
      }
      if (error) throw error;
      const actualizado = equipoDesdeBase(Array.isArray(data) ? data[0] : data);
      const antes = claveObra(persistido.obra);
      const despues = claveObra(actualizado.obra);
      const cambioDestino = persistido.estado !== actualizado.estado || antes !== despues;
      actualizado.movimientos = [
        ...(persistido.movimientos || []),
        ...(cambioDestino ? [{
          tipo: antes && despues && antes !== despues ? "cambio_barco"
            : antes && !despues ? "devuelto"
              : actualizado.estado === "instalado" ? "instalacion"
                : persistido.estado === "pedido" && actualizado.estado !== "pedido" ? "ingreso"
                  : actualizado.estado === "asignado" ? "reserva"
                    : persistido.estado === "comprado" ? "retiro"
                      : actualizado.estado === "entregado" ? "entrega" : "otro",
          desde: antes,
          hacia: despues,
          fecha: new Date().toISOString().slice(0, 10),
          nota: cambioSerie ? null : destino.nota || null,
          estado_anterior: persistido.estado,
          estado_nuevo: actualizado.estado,
        }] : []),
      ];
      setDatos((actual) => integrarEquipos(actual, [actualizado]));
      toast.success(`${nombreEquipo(actualizado)}: ${ESTADOS[actualizado.estado]?.label || "actualizado"}${cambioSerie ? ` · serie ${serieNueva || "sin número"}` : ""}.`);
      setEquipoGestion(null);
    } catch (error) {
      throw errorDeGuardado(error, "La gestión");
    }
  };

  const eliminarEquipo = async (equipo) => {
    const esInicial = String(equipo.id).startsWith("eq-");
    let persistido = equipo;
    if (esInicial) {
      persistido = null;
      if (equipo.origen) {
        const { data, error } = await supabase.from("equipos").select("*").eq("origen", equipo.origen).maybeSingle();
        if (error) throw error;
        persistido = data || null;
      }
    }

    const constancia = `Carga errónea eliminada del control${equipo.numero_serie ? ` · serie original: ${equipo.numero_serie}` : ""}`;
    const notas = [persistido?.notas || equipo.notas, constancia].filter(Boolean).join("\n");
    const cambios = { estado: "baja", obra_id: null, obra_codigo: null, numero_serie: null, notas };
    const consulta = persistido
      ? supabase.from("equipos").update(cambios).eq("id", persistido.id)
      : supabase.from("equipos").insert({ ...payloadEquipo(equipo, obrasActivas), ...cambios });
    const { data, error } = await consulta.select("*").single();
    if (error) throw errorDeGuardado(error, "La gestión");

    setDatos((actual) => integrarEquipos(actual, [data]));
    toast.success(`${equipo.tipo === "motor" ? "El motor" : "El grupo"} se eliminó del control.${equipo.numero_serie ? " Su número de serie quedó libre." : ""}`);
    setEquipoGestion(null);
  };

  const termino = busqueda.trim().toLowerCase();
  const items = useMemo(() => ({
    barcos: barcosEnProduccion(vista, { termino }),
    galpon: equiposEnGalpon(vista, termino),
    entregados: barcosEntregados(vista, termino),
    movimientos: movimientosDeGrupos(vista, termino),
  }), [vista, termino]);
  const filtrados = useMemo(() => Object.fromEntries(Object.entries(items).map(([key, lista]) => (
    [key, filtrar(lista, TIPO_POR_VISTA[key], filtros, FACETAS_POR_VISTA[key])]
  ))), [items, filtros]);
  const facetas = useMemo(
    () => opcionesDeFiltro(items[pestana], TIPO_POR_VISTA[pestana], filtros, FACETAS_POR_VISTA[pestana]),
    [items, pestana, filtros],
  );
  const todosLosBarcos = useMemo(() => barcosEnProduccion(vista), [vista]);
  const puntos = useMemo(() => aResolver(vista, todosLosBarcos), [vista, todosLosBarcos]);
  const ultimosGrupos = useMemo(() => ultimosGruposEntregados(vista, 6), [vista]);

  // Los filtros elegidos, con los que no valen en esta vista tachados (por
  // ejemplo, la marca de motor en Movimientos, que son sólo de grupos).
  const activos = CLAVES_FILTRO.flatMap((key) => filtros[key].map((valor) => ({
    key,
    valor,
    texto: `${FACETAS[key].corto || FACETAS[key].label}: ${etiquetaDeFiltro(key, valor)}`,
    aplica: FACETAS_POR_VISTA[pestana].includes(key),
  })));
  const enUso = activos.filter((activo) => activo.aplica).length;
  const filtrando = enUso > 0 || Boolean(termino);
  const foco = {
    motores: FACETAS_DE_MOTOR.some((key) => filtros[key].length),
    grupo: FACETAS_DE_GRUPO.some((key) => filtros[key].length),
  };

  const alternarBarco = (codigo) => setAbiertos((actual) => {
    const siguiente = new Set(actual);
    if (siguiente.has(codigo)) siguiente.delete(codigo);
    else siguiente.add(codigo);
    return siguiente;
  });

  // Desde "A resolver": abre el barco y lo trae a la vista. Si la búsqueda o
  // un filtro lo esconden, se sacan.
  const irABarco = (codigo) => {
    if (!filtrados.barcos.some((barco) => barco.codigo === codigo)) {
      setBusqueda("");
      limpiarFiltros();
    }
    setAbiertos((actual) => new Set(actual).add(codigo));
    window.requestAnimationFrame(() => {
      document.getElementById(`eq-barco-${codigo}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const pedidosDe = useCallback((codigo, tipo) => {
    const clave = claveObra(codigo);
    if (!clave) return [];
    return [...vista.motores, ...vista.grupos].filter((equipo) => equipo.tipo === tipo && equipo.estado === "pedido" && equipo.obra === clave);
  }, [vista]);

  const vacio = (
    <Vacio
      texto={filtrando ? "Nada coincide con la búsqueda y los filtros." : "No hay nada para mostrar."}
      onLimpiar={enUso > 0 ? limpiarFiltros : null}
    />
  );

  return (
    <div className="eq">
      <style href="klasea-equipos" precedence="default">{CSS}</style>
      <PageHeader
        icon={Cog}
        eyebrow="Pañol · Control de equipos"
        title="Motores y grupos"
        subtitle="Qué lleva cada barco, qué está en el galpón y qué falta llegar, por número de serie."
        actions={(
          <button type="button" className="ui-btn ui-btn-primario" onClick={() => setCargandoEquipo({})}>
            <Plus size={15} /> Cargar equipo
          </button>
        )}
      >
        <div className="ui-tabs eq-pestanas" role="tablist" aria-label="Vistas">
          {PESTANAS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={pestana === tab.key}
              className={`ui-tab${pestana === tab.key ? " is-activa" : ""}`}
              onClick={() => elegirPestana(tab.key)}
            >
              <tab.Icono size={14} /> {tab.label} {!cargando && <span className="eq-pestana-cuenta">{filtrados[tab.key].length}</span>}
            </button>
          ))}
        </div>
      </PageHeader>

      <main className="eq-cuerpo">
        {cargando ? <Cargando texto="Cruzando equipos con las obras…" /> : (
          <>
            {!base && (
              <p className="eq-aviso">No se pudo leer la base: se muestra sólo lo de las planillas y puede haber barcos ya entregados.</p>
            )}

            {pestana === "barcos" && puntos.length > 0 && (
              <AResolver puntos={puntos} onIr={irABarco} onGestionar={setEquipoGestion} />
            )}

            <div className="eq-filtros">
              <label className="eq-buscar">
                <Search size={15} aria-hidden="true" />
                <input
                  className="ui-input"
                  value={busqueda}
                  onChange={(evento) => setBusqueda(evento.target.value)}
                  placeholder="Número de serie, barco o modelo…"
                  aria-label="Buscar"
                />
                {busqueda && (
                  <button type="button" className="eq-buscar-borrar" onClick={() => setBusqueda("")} aria-label="Borrar búsqueda"><X size={14} /></button>
                )}
              </label>
              <button
                type="button"
                className={`ui-btn eq-btn-filtros${panelAbierto ? " is-abierto" : ""}`}
                aria-expanded={panelAbierto}
                aria-controls={idPanel}
                onClick={() => setPanelAbierto((abierto) => !abierto)}
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                Filtros
                {enUso > 0 && <span className="eq-btn-filtros-cuenta">{enUso}</span>}
              </button>
            </div>

            {activos.length > 0 && (
              <div className="eq-activos" aria-label="Filtros en uso">
                {activos.map((activo) => (
                  <button
                    key={`${activo.key}=${activo.valor}`}
                    type="button"
                    className={`eq-activo${activo.aplica ? "" : " no-aplica"}`}
                    onClick={() => alternarFiltro(activo.key, activo.valor)}
                    title={activo.aplica ? "Sacar este filtro" : "No se usa en esta vista. Tocalo para sacarlo."}
                    aria-label={`Sacar filtro ${activo.texto}`}
                  >
                    {activo.texto}
                    <X size={13} aria-hidden="true" />
                  </button>
                ))}
                <button type="button" className="eq-limpiar" onClick={limpiarFiltros}>Limpiar filtros</button>
              </div>
            )}

            <PanelFiltros
              id={idPanel}
              abierto={panelAbierto}
              facetas={facetas}
              vista={pestana}
              resultados={filtrados[pestana].length}
              hayFiltros={enUso > 0}
              onAlternar={alternarFiltro}
              onLimpiar={limpiarFiltros}
              onCerrar={() => setPanelAbierto(false)}
            />

            {pestana === "barcos" && (
              filtrados.barcos.length ? (
                <div className="eq-lineas">
                  {agruparPorLinea(filtrados.barcos).map((grupoLinea) => (
                    <section key={grupoLinea.linea || "otros"} className="eq-linea">
                      <header className="eq-linea-cabeza">
                        <h2>{grupoLinea.linea || "Otros"}</h2>
                        <span>{contar("barcos", grupoLinea.barcos.length)}</span>
                      </header>
                      <ul className="eq-linea-lista">
                        {grupoLinea.barcos.map((barco) => (
                          <FilaBarco
                            key={barco.codigo}
                            barco={barco}
                            abierto={abiertos.has(barco.codigo) || (Boolean(termino) && filtrados.barcos.length <= 3)}
                            foco={foco}
                            onAlternar={() => alternarBarco(barco.codigo)}
                            onGestionar={setEquipoGestion}
                            onCargar={(inicial) => setCargandoEquipo(inicial)}
                          />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : vacio
            )}

            {pestana === "galpon" && (
              filtrados.galpon.length ? <Existencias equipos={filtrados.galpon} filtrando={filtrando} onGestionar={setEquipoGestion} /> : vacio
            )}

            {pestana === "entregados" && (
              <>
                {!filtrando && ultimosGrupos.length > 0 && <UltimosGrupos grupos={ultimosGrupos} />}
                {filtrados.entregados.length ? (
                  <div className="eq-lineas">
                    {agruparPorLinea(filtrados.entregados).map((grupoLinea) => (
                      <section key={grupoLinea.linea} className="eq-linea">
                        <header className="eq-linea-cabeza">
                          <h2>{grupoLinea.linea}</h2>
                          <span>{contar("entregados", grupoLinea.barcos.length)}</span>
                        </header>
                        <ul className="eq-linea-lista">
                          {grupoLinea.barcos.map((barco) => <FilaEntregado key={barco.codigo} barco={barco} foco={foco} onGestionar={setEquipoGestion} />)}
                        </ul>
                      </section>
                    ))}
                  </div>
                ) : vacio}
              </>
            )}

            {pestana === "movimientos" && (
              filtrados.movimientos.length ? (
                <ol className="eq-historia">
                  {filtrados.movimientos.map((movimiento, i) => <FilaMovimiento key={`${movimiento.grupo.id}-${i}`} movimiento={movimiento} />)}
                </ol>
              ) : vacio
            )}
          </>
        )}
      </main>
      {cargandoEquipo && (
        <EquipoModal
          inicial={cargandoEquipo}
          obras={obrasActivas}
          pedidosDe={pedidosDe}
          onRecibir={(equipo) => { setCargandoEquipo(null); setEquipoGestion(equipo); }}
          onCerrar={() => setCargandoEquipo(null)}
          onGuardar={guardarEquipo}
        />
      )}
      {equipoGestion && (
        <GestionEquipoModal
          equipo={equipoGestion}
          obras={obrasActivas}
          onCerrar={() => setEquipoGestion(null)}
          onMover={moverEquipo}
          onEliminar={eliminarEquipo}
        />
      )}
    </div>
  );
}

// ─── A resolver ─────────────────────────────────────────────────────────────

function AResolver({ puntos, onIr, onGestionar }) {
  return (
    <section className="eq-resolver" aria-label="A resolver">
      {puntos.map((punto) => {
        const cantidad = punto.barcos?.length ?? punto.equipos.length;
        return (
          <article key={punto.key} className={`eq-punto${cantidad > 6 ? " is-ancho" : ""}`} style={{ "--c": TONOS[punto.tono] }}>
            <header>
              <span className="eq-punto-cuenta">{cantidad}</span>
              <div>
                <h2>{punto.titulo}</h2>
                <p>{punto.detalle}</p>
              </div>
            </header>
            <div className="eq-punto-chips">
              {punto.barcos?.map((barco) => (
                <button key={barco.codigo} type="button" className="eq-punto-chip" onClick={() => onIr(barco.codigo)} title={`Ver ${barco.codigo}`}>
                  <strong>{barco.codigo}</strong>
                  {barco.nota && <span>{barco.nota}</span>}
                </button>
              ))}
              {punto.equipos?.map((equipo) => (
                <button key={equipo.id} type="button" className="eq-punto-chip" onClick={() => onGestionar(equipo)} title="Registrar el retiro">
                  <strong>{equipo.obra || "Stock"}</strong>
                  <span>{nombreEquipo(equipo)}{equipo.proveedor ? ` · ${equipo.proveedor}` : ""}</span>
                </button>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}

// ─── Por barco ──────────────────────────────────────────────────────────────

const PUNTO_ESTADO = {
  comprado: "var(--violet)",
  pedido: "var(--violet)",
  en_galpon: "var(--blue)",
  asignado: "var(--cyan)",
  instalado: "var(--green)",
  entregado: "var(--muted)",
};

function Serie({ equipo }) {
  const vencida = equipo.estado === "pedido" && recepcionVencida(equipo.fecha_estimada);
  return (
    <span className={`eq-serie-chip${equipo.numero_serie ? "" : " is-vacia"}`} style={{ "--c": vencida || equipo.urgente ? "var(--red)" : PUNTO_ESTADO[equipo.estado] || "var(--subtle)" }} title={ESTADOS[equipo.estado]?.label}>
      <i aria-hidden="true" />
      {equipo.numero_serie || (equipo.estado === "pedido" ? "por llegar" : equipo.estado === "comprado" ? "a retirar" : "sin número")}
    </span>
  );
}

function FilaBarco({ barco, abierto, foco, onAlternar, onGestionar, onCargar }) {
  const meta = ESTADOS_BARCO[barco.estado];
  const fecha = ["atrasado", "por_llegar"].includes(barco.estado) && barco.fechaEstimada ? textoFechaEstimada(barco.fechaEstimada) : "";
  const idDetalle = `eq-detalle-${barco.codigo}`;
  return (
    <li id={`eq-barco-${barco.codigo}`} className={`eq-b${abierto ? " is-abierto" : ""}`} style={{ "--c": TONOS[meta.tono] }}>
      <button type="button" className="eq-b-fila" aria-expanded={abierto} aria-controls={idDetalle} onClick={onAlternar}>
        <span className="eq-b-codigo">{barco.codigo}</span>
        <span className={`eq-b-celda is-motores${foco.motores ? " is-foco" : ""}`}>
          <Cog size={14} aria-hidden="true" />
          {barco.sinDatos ? (
            <span className="eq-b-texto is-suave">
              <strong>{barco.memoria?.motores || "Motorización sin definir"}</strong>
              <small>{barco.memoria?.motores ? "según la memoria · sin registrar" : "ni en la memoria ni cargada"}</small>
            </span>
          ) : (
            <span className="eq-b-texto">
              <strong>{resumenMotores(barco.motores)}</strong>
              <span className="eq-b-series">{barco.motores.map((motor) => <Serie key={motor.id} equipo={motor} />)}</span>
            </span>
          )}
        </span>
        <span className={`eq-b-celda is-grupo${foco.grupo ? " is-foco" : ""}`}>
          <Zap size={14} aria-hidden="true" />
          {barco.grupo ? (
            <span className="eq-b-texto">
              <strong>{nombreGrupo(barco.grupo)}{barco.grupos.length > 1 ? ` + ${barco.grupos.length - 1}` : ""}</strong>
              <small>{ESTADOS[barco.grupo.estado]?.label}{barco.grupo.proveedor ? ` · ${barco.grupo.proveedor}` : ""}</small>
            </span>
          ) : (
            <span className="eq-b-texto is-suave">
              <strong>{barco.memoria?.grupo || "Sin grupo"}</strong>
              {barco.memoria?.grupo && <small>según la memoria · sin registrar</small>}
            </span>
          )}
        </span>
        <span className="eq-b-estado">
          <span className="eq-estado">{meta.label}{fecha ? ` · ${fecha}` : ""}</span>
        </span>
        <ChevronDown size={16} className="eq-b-flecha" aria-hidden="true" />
      </button>
      {abierto && (
        <div id={idDetalle} className="eq-b-detalle">
          {barco.sobran > 0 && (
            <p className="eq-b-alerta">
              Tiene {barco.motores.length} motores cargados y {barco.memoria?.motores ? `la memoria dice ${barco.esperados}` : `lleva ${barco.esperados}`}. Si un pedido llegó y se cargó como motor nuevo, eliminá el pedido que sobra con «Gestionar».
            </p>
          )}
          {barco.marcaDistinta && (
            <p className="eq-b-alerta">La memoria indica «{barco.memoria.motores}» y lo cargado es de otra marca.</p>
          )}
          {barco.motores.map((motor) => <RenglonEquipo key={motor.id} equipo={motor} onGestionar={onGestionar} />)}
          {barco.grupos.map((grupo) => <RenglonEquipo key={grupo.id} equipo={grupo} barco={barco.codigo} onGestionar={onGestionar} />)}
          {(barco.memoria?.motores || barco.memoria?.grupo) && (
            <p className="eq-b-memoria">
              <span>Memoria</span>
              {[barco.memoria.motores && `Motores: ${barco.memoria.motores}`, barco.memoria.grupo && `Grupo: ${barco.memoria.grupo}`].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="eq-b-acciones">
            {barco.sinDatos && (
              <button type="button" className="ui-btn ui-btn-suave" onClick={() => onCargar({ tipo: "motor", obra_codigo: barco.codigo, marca: barco.memoria?.marca || "" })}>
                <Plus size={14} /> Cargar motor
              </button>
            )}
            {!barco.grupos.length && (
              <button type="button" className="ui-btn" onClick={() => onCargar({ tipo: "generador", obra_codigo: barco.codigo })}>
                <Plus size={14} /> Cargar grupo
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function detalleEquipo(equipo, barco) {
  return [
    equipo.numero_serie ? `serie ${equipo.numero_serie}` : null,
    equipo.cajas ? `cajas ${equipo.cajas}` : null,
    equipo.posicion,
    equipo.proveedor,
    equipo.estado === "pedido" && equipo.fecha_estimada ? `llega ${textoFechaEstimada(equipo.fecha_estimada)}` : null,
    equipo.fecha_entrega ? `colocado ${formatearFecha(equipo.fecha_entrega)}` : null,
    equipo.obra_origen && equipo.obra_origen !== barco ? `vino de ${equipo.obra_origen}` : null,
    equipo.compra_cliente ? "compra del cliente" : null,
  ].filter(Boolean).join(" · ");
}

function RenglonEquipo({ equipo, barco = null, onGestionar }) {
  const Icono = equipo.tipo === "motor" ? Cog : Zap;
  const detalle = detalleEquipo(equipo, barco);
  return (
    <div className="eq-renglon">
      <Icono size={14} aria-hidden="true" />
      <span className="eq-renglon-texto">
        <strong>{nombreEquipo(equipo)}</strong>
        {detalle && <small>{detalle}</small>}
      </span>
      <EstadoChip estado={equipo.estado} urgente={equipo.urgente && equipo.estado === "pedido"} vencida={equipo.estado === "pedido" && recepcionVencida(equipo.fecha_estimada)} />
      <GestionarButton onClick={() => onGestionar(equipo)} />
    </div>
  );
}

// ─── Existencias ────────────────────────────────────────────────────────────

function Existencias({ equipos, filtrando, onGestionar }) {
  const porBarco = (a, b) => String(a.obra || "~").localeCompare(String(b.obra || "~"), "es", { numeric: true }) || String(a.tipo).localeCompare(String(b.tipo));
  const secciones = [
    { key: "retirar", titulo: "Para retirar del proveedor", Icono: PackageOpen, vacio: "No hay compras pendientes de retiro.", lista: equipos.filter((e) => e.estado === "comprado") },
    { key: "llegar", titulo: "Por llegar", Icono: History, vacio: "No hay pedidos pendientes.", lista: equipos.filter((e) => e.estado === "pedido") },
    { key: "reservados", titulo: "Reservados para un barco", Icono: Ship, vacio: "No hay equipos reservados.", lista: equipos.filter((e) => e.estado === "asignado") },
    { key: "libres", titulo: "Libres en el galpón", Icono: Warehouse, vacio: "No hay equipos libres en el galpón.", lista: equipos.filter((e) => e.estado === "en_galpon") },
  ];
  return (
    <div className="eq-lineas">
      {secciones.filter((seccion) => seccion.lista.length || !filtrando).map((seccion) => (
        <section key={seccion.key} className="eq-linea">
          <header className="eq-linea-cabeza">
            <seccion.Icono size={15} aria-hidden="true" />
            <h2>{seccion.titulo}</h2>
            <span>{contar("galpon", seccion.lista.length)}</span>
          </header>
          {seccion.lista.length ? (
            <ul className="eq-linea-lista">
              {[...seccion.lista].sort(porBarco).map((equipo, i, lista) => (
                <FilaExistencia key={equipo.id} equipo={equipo} repite={i > 0 && lista[i - 1].obra === equipo.obra && Boolean(equipo.obra)} onGestionar={onGestionar} />
              ))}
            </ul>
          ) : <p className="eq-linea-vacia">{seccion.vacio}</p>}
        </section>
      ))}
    </div>
  );
}

function FilaExistencia({ equipo, repite, onGestionar }) {
  const Icono = equipo.tipo === "motor" ? Cog : Zap;
  const vencida = equipo.estado === "pedido" && recepcionVencida(equipo.fecha_estimada);
  const extra = [
    equipo.proveedor,
    equipo.cajas ? `cajas ${equipo.cajas}` : null,
    equipo.estado === "pedido" ? (equipo.fecha_estimada ? `llega ${textoFechaEstimada(equipo.fecha_estimada)}` : "sin fecha estimada") : null,
    equipo.estado === "en_galpon" && equipo.obra_origen ? `volvió de ${equipo.obra_origen}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <li className={`eq-fila${repite ? " is-repite" : ""}`}>
      <span className={`eq-fila-codigo${equipo.obra ? "" : " is-libre"}`}>{repite ? "" : equipo.obra || "Stock"}</span>
      <span className="eq-fila-texto">
        <Icono size={14} aria-hidden="true" />
        <span>
          <strong>{nombreEquipo(equipo)}</strong>
          {extra && <small className={vencida ? "is-alerta" : ""}>{extra}</small>}
        </span>
      </span>
      <span className={`eq-serie${equipo.numero_serie ? "" : " is-vacia"}`}>{equipo.numero_serie || "sin número"}</span>
      <EstadoChip estado={equipo.estado} urgente={equipo.urgente && equipo.estado === "pedido"} vencida={vencida} />
      <GestionarButton onClick={() => onGestionar(equipo)} />
    </li>
  );
}

// ─── Entregados ─────────────────────────────────────────────────────────────

function UltimosGrupos({ grupos }) {
  return (
    <section className="eq-ultimos" aria-label="Últimos grupos colocados">
      <h2>Últimos grupos colocados</h2>
      <div className="eq-ultimos-lista">
        {grupos.map((grupo) => (
          <article key={`${grupo.id}-${grupo.obra}`} className="eq-ultimo">
            <span className="eq-ultimo-barco">{grupo.obra}</span>
            <span className="eq-ultimo-equipo">{nombreGrupo(grupo)}</span>
            <span className="eq-ultimo-meta">{[grupo.proveedor, formatearFecha(grupo.fecha_entrega)].filter(Boolean).join(" · ")}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function FilaEntregado({ barco, foco, onGestionar }) {
  const cajas = barco.motores.find((motor) => motor.cajas)?.cajas;
  return (
    <li className="eq-fila eq-fila-entregado">
      <span className="eq-fila-codigo">{barco.codigo}</span>
      <span className={`eq-entregado-celda${foco.motores ? " is-foco" : ""}`}>
        <Cog size={14} aria-hidden="true" />
        <span>
          <strong>{barco.motores.length ? resumenMotores(barco.motores) : barco.memoria?.motores || "Motorización sin registrar"}</strong>
          <span className="eq-b-series">
            {barco.motores.map((motor) => (
              <button key={motor.id} type="button" className="eq-serie-boton" onClick={() => onGestionar(motor)} title="Mover o corregir">
                {motor.numero_serie || "sin número"}
              </button>
            ))}
            {cajas && <small>cajas {cajas}</small>}
          </span>
        </span>
      </span>
      <span className={`eq-entregado-celda${foco.grupo ? " is-foco" : ""}`}>
        <Zap size={14} aria-hidden="true" />
        <span>
          {barco.grupos.length ? barco.grupos.map((grupo) => (
            <button key={grupo.id} type="button" className="eq-grupo-boton" onClick={() => onGestionar(grupo)} title="Mover o corregir">
              {nombreGrupo(grupo)}{grupo.proveedor ? <small> · {grupo.proveedor}</small> : null}{grupo.numero_serie ? <small> · {grupo.numero_serie}</small> : null}
            </button>
          )) : <span className="is-suave">{barco.memoria?.grupo || "Sin grupo registrado"}</span>}
        </span>
      </span>
    </li>
  );
}

// ─── Movimientos ────────────────────────────────────────────────────────────

function FilaMovimiento({ movimiento }) {
  const { desde, hacia } = movimiento;
  const mismoBarco = desde && hacia && desde === hacia;
  const lugar = (codigo, estado) => codigo || (estado === "comprado" ? "Proveedor" : estado === "pedido" ? "Pedido" : "Galpón");
  return (
    <li className="eq-mov">
      <span className="eq-mov-fecha">{formatearFecha(movimiento.fecha) || "sin fecha"}</span>
      <span className="eq-mov-tipo">{TIPOS_MOVIMIENTO[movimiento.tipo] || "Actualización"}</span>
      <span className="eq-mov-ruta">
        {mismoBarco ? (
          <>
            <strong>{hacia}</strong>
            <span>{ESTADOS[movimiento.estado_anterior]?.label || "—"}</span>
            <ArrowRight size={13} aria-hidden="true" />
            <span>{ESTADOS[movimiento.estado_nuevo]?.label || "—"}</span>
          </>
        ) : (
          <>
            <strong>{movimiento.tipo === "compra" ? "Proveedor" : lugar(desde, movimiento.estado_anterior)}</strong>
            <ArrowRight size={13} aria-hidden="true" />
            <strong>{lugar(hacia, movimiento.estado_nuevo)}</strong>
          </>
        )}
      </span>
      <span className="eq-mov-equipo">
        {nombreEquipo(movimiento.grupo)}
        {movimiento.grupo.proveedor ? ` · ${movimiento.grupo.proveedor}` : ""}
        {movimiento.nota ? ` · ${movimiento.nota}` : ""}
      </span>
    </li>
  );
}

// ─── Carga y gestión ────────────────────────────────────────────────────────

const ESTADOS_FORM = [
  ["pedido", "Pedido al proveedor"],
  ["comprado", "En proveedor · a retirar"],
  ["en_galpon", "En galpón · libre"],
  ["asignado", "Reservado para barco"],
  ["instalado", "Instalado"],
];

function EquipoModal({ inicial = {}, obras = [], pedidosDe, onRecibir, onCerrar, onGuardar }) {
  const [draft, setDraft] = useState(() => {
    const tipo = inicial.tipo || "motor";
    const obra = obraDe(obras, inicial.obra_codigo)?.codigo || inicial.obra_codigo || "";
    return {
      tipo, marca: inicial.marca || "", modelo: "", potencia: "", transmision: "", numero_serie: "",
      proveedor: "", obra_codigo: obra, posicion: "", estado: obra ? "asignado" : "en_galpon", fecha: "", notas: "", urgente: false,
    };
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const cerrar = (evento) => { if (evento.key === "Escape" && !guardando) onCerrar(); };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [guardando, onCerrar]);

  const cambiar = (key, value) => setDraft((actual) => ({ ...actual, [key]: value }));
  // Un equipo con barco no es stock: si se elige el barco, queda reservado. Y
  // si se elige "libre en galpón", se limpia el barco. Así no se puede guardar
  // un motor que diga a la vez "es de este barco" y "está libre".
  const cambiarObra = (value) => setDraft((actual) => ({
    ...actual,
    obra_codigo: value,
    estado: value.trim() && actual.estado === "en_galpon" ? "asignado" : actual.estado,
  }));
  // Comprado y pedido sí pueden tener barco ("comprado para el 52-25"); el
  // único que no puede es el stock.
  const cambiarEstado = (estado) => setDraft((actual) => ({
    ...actual,
    estado,
    obra_codigo: estado === "en_galpon" ? "" : actual.obra_codigo,
  }));
  const cambiarTipo = (tipo) => setDraft((actual) => ({
    ...actual,
    tipo,
    marca: "",
    transmision: tipo === "motor" ? actual.transmision : "",
    posicion: tipo === "motor" ? actual.posicion : "",
  }));
  const fechaLabel = draft.estado === "comprado" ? "Fecha de compra" : draft.estado === "pedido" ? "Recepción estimada" : "Fecha de ingreso";

  // Si el barco ya tiene un pedido de este tipo, lo que llegó es ese pedido:
  // cargarlo como equipo nuevo dejaba el pedido colgado y el barco con un motor
  // de más (pasó en el 37-44).
  const pedidos = draft.estado !== "pedido" ? pedidosDe(draft.obra_codigo, draft.tipo) : [];

  const enviar = async (evento) => {
    evento.preventDefault();
    setError("");
    if (!draft.marca.trim() || !draft.modelo.trim()) {
      setError("Completá marca y modelo.");
      return;
    }
    if ((draft.estado === "asignado" || draft.estado === "instalado") && !draft.obra_codigo.trim()) {
      setError("Indicá el barco para un equipo reservado o instalado.");
      return;
    }
    if (draft.estado === "en_galpon" && draft.obra_codigo.trim()) {
      setError("Un equipo con barco no puede quedar libre: elegí «Reservado para barco» o dejá el barco vacío.");
      return;
    }
    setGuardando(true);
    const obra = obraDe(obras, draft.obra_codigo);
    const payload = {
      tipo: draft.tipo,
      marca: draft.marca.trim(),
      modelo: draft.modelo.trim(),
      potencia: draft.potencia === "" ? null : Number(draft.potencia),
      transmision: draft.transmision || null,
      numero_serie: draft.numero_serie.trim() || null,
      proveedor: draft.proveedor.trim() || null,
      // Con el barco de la lista queda el vínculo real; escrito a mano, al
      // menos el código (la base completa el resto desde la obra).
      obra_id: obra?.id || null,
      obra_codigo: obra?.codigo || draft.obra_codigo.trim() || null,
      posicion: draft.posicion || null,
      estado: draft.estado,
      fecha_compra: draft.estado === "comprado" && draft.fecha ? draft.fecha : null,
      fecha_estimada: draft.estado === "pedido" && draft.fecha ? draft.fecha : null,
      fecha_ingreso: !["comprado", "pedido"].includes(draft.estado) && draft.fecha ? draft.fecha : null,
      urgente: draft.estado === "pedido" && draft.urgente,
      notas: draft.notas.trim() || null,
    };
    try {
      await onGuardar(payload);
    } catch (err) {
      setError(err.message || "No se pudo guardar el equipo.");
      setGuardando(false);
    }
  };

  const marcas = draft.tipo === "motor" ? MARCAS_MOTOR : MARCAS_GRUPO;

  return (
    <div className="eq-modal-fondo" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget && !guardando) onCerrar(); }}>
      <section className="eq-modal" role="dialog" aria-modal="true" aria-labelledby="eq-modal-titulo">
        <header className="eq-modal-cabeza">
          <div>
            <span className="eq-modal-eyebrow">Nuevo registro</span>
            <h2 id="eq-modal-titulo">Cargar equipo</h2>
            <p>Para un equipo que todavía no figura. Lo que ya está (un pedido que llegó, un grupo que cambia de barco) se mueve con «Gestionar».</p>
          </div>
          <button type="button" className="eq-modal-cerrar" onClick={onCerrar} disabled={guardando} aria-label="Cerrar"><X size={18} /></button>
        </header>

        <form onSubmit={enviar} className="eq-form">
          <div className="eq-tipo" role="group" aria-label="Tipo de equipo">
            <button type="button" aria-pressed={draft.tipo === "motor"} className={draft.tipo === "motor" ? "is-activo" : ""} onClick={() => cambiarTipo("motor")}><Cog size={15} /> Motor</button>
            <button type="button" aria-pressed={draft.tipo === "generador"} className={draft.tipo === "generador" ? "is-activo" : ""} onClick={() => cambiarTipo("generador")}><Zap size={15} /> Grupo electrógeno</button>
          </div>

          <div className="eq-form-grid">
            <label className="eq-campo">
              <span>Barco</span>
              <input className="ui-input" list="eq-obras-activas" value={draft.obra_codigo} onChange={(e) => cambiarObra(e.target.value)} placeholder="Ej. 52-25 · vacío si es stock" />
              <datalist id="eq-obras-activas">
                {obras.map((obra) => <option key={obra.id} value={obra.codigo} />)}
              </datalist>
            </label>
            <label className="eq-campo"><span>Estado</span><select className="ui-input" value={draft.estado} onChange={(e) => cambiarEstado(e.target.value)}>{ESTADOS_FORM.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>

          {pedidos.length > 0 && (
            <div className="eq-aviso-pedido" role="note">
              <p>{draft.obra_codigo} tiene {pedidos.length === 1 ? "un pedido" : `${pedidos.length} pedidos`} de {draft.tipo === "motor" ? "motor" : "grupo"} sin recibir. Si lo que llegó es eso, recibilo así no queda duplicado.</p>
              <div>
                {pedidos.map((pedido) => (
                  <button key={pedido.id} type="button" className="ui-btn ui-btn-suave" onClick={() => onRecibir(pedido)}>
                    Recibir {nombreEquipo(pedido)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="eq-form-grid">
            <label className="eq-campo">
              <span>Marca *</span>
              <input className="ui-input" list="eq-marcas" autoFocus value={draft.marca} onChange={(e) => cambiar("marca", e.target.value)} placeholder={draft.tipo === "motor" ? "FPT Iveco, Volvo Penta, Mercury…" : "Kohler, Onan, Sleeper…"} />
              <datalist id="eq-marcas">{marcas.map((marca) => <option key={marca} value={marca} />)}</datalist>
            </label>
            <label className="eq-campo"><span>Modelo *</span><input className="ui-input" value={draft.modelo} onChange={(e) => cambiar("modelo", e.target.value)} placeholder={draft.tipo === "motor" ? "570 Angular" : "9 kVA"} /></label>
            <label className="eq-campo"><span>{draft.tipo === "motor" ? "Potencia (HP)" : "Potencia (kVA)"}</span><input className="ui-input" type="number" step="0.1" inputMode="decimal" value={draft.potencia} onChange={(e) => cambiar("potencia", e.target.value)} /></label>
            <label className="eq-campo"><span>Número de serie</span><input className="ui-input" value={draft.numero_serie} onChange={(e) => cambiar("numero_serie", e.target.value)} placeholder="Se puede completar después" autoComplete="off" /></label>
            <label className="eq-campo"><span>Proveedor</span><input className="ui-input" value={draft.proveedor} onChange={(e) => cambiar("proveedor", e.target.value)} placeholder="Proveedor o compra del cliente" /></label>
            <label className="eq-campo"><span>{fechaLabel}</span><input className="ui-input" type="date" value={draft.fecha} onChange={(e) => cambiar("fecha", e.target.value)} /></label>
            {draft.tipo === "motor" && <label className="eq-campo"><span>Transmisión</span><select className="ui-input" value={draft.transmision} onChange={(e) => cambiar("transmision", e.target.value)}><option value="">Sin definir</option><option value="Angular">Angular</option><option value="V-drive">V-drive</option><option value="Pata">Pata</option></select></label>}
            {draft.tipo === "motor" && <label className="eq-campo"><span>Posición</span><select className="ui-input" value={draft.posicion} onChange={(e) => cambiar("posicion", e.target.value)}><option value="">Sin definir</option><option value="babor">Babor</option><option value="estribor">Estribor</option><option value="centro">Centro</option></select></label>}
          </div>

          <label className="eq-campo"><span>Notas</span><textarea className="ui-input eq-textarea" value={draft.notas} onChange={(e) => cambiar("notas", e.target.value)} placeholder="Compra, retiro, garantía o cualquier dato útil…" /></label>
          {draft.estado === "pedido" && <label className="eq-check"><input type="checkbox" checked={draft.urgente} onChange={(e) => cambiar("urgente", e.target.checked)} /> Marcar como urgente</label>}
          {error && <p className="eq-form-error" role="alert">{error}</p>}

          <footer className="eq-modal-pie">
            <button type="button" className="ui-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
            <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar equipo"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

const DESTINOS = [
  { estado: "comprado", Icono: PackageOpen, titulo: "En proveedor", texto: "Comprado, falta retirarlo" },
  { estado: "pedido", Icono: History, titulo: "Pedido", texto: "Sin entrega del proveedor" },
  { estado: "en_galpon", Icono: Warehouse, titulo: "En galpón · libre", texto: "Sin barco" },
  { estado: "asignado", Icono: Ship, titulo: "Reservado para barco", texto: "En el galpón, destinado a un barco" },
  { estado: "instalado", Icono: Cog, titulo: "Instalado", texto: "Montado en el barco" },
  { estado: "entregado", Icono: PackageCheck, titulo: "Entregado", texto: "El barco salió" },
];

const CON_BARCO = ["asignado", "instalado", "entregado"];

function GestionEquipoModal({ equipo, obras, onCerrar, onMover, onEliminar }) {
  const [estado, setEstado] = useState(equipo.estado === "baja" ? "en_galpon" : equipo.estado);
  // El barco del equipo como figura en la lista de obras, si está activo.
  const [obraCodigo, setObraCodigo] = useState(() => obraDe(obras, equipo.obra)?.codigo || equipo.obra || "");
  const [numeroSerie, setNumeroSerie] = useState(equipo.numero_serie || "");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmarBaja, setConfirmarBaja] = useState(false);
  const [error, setError] = useState("");
  const necesitaBarco = CON_BARCO.includes(estado);
  const puedeBarco = estado !== "en_galpon";
  const nombre = nombreEquipo(equipo);
  const fueraDeLista = obraCodigo && !obraDe(obras, obraCodigo);

  useEffect(() => {
    const cerrar = (evento) => { if (evento.key === "Escape" && !guardando) onCerrar(); };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [guardando, onCerrar]);

  // Sólo "libre en galpón" saca el barco: un pedido o una compra pueden ser
  // para un barco, y antes tocar «Pedido» le borraba el barco sin avisar.
  const cambiarEstado = (siguiente) => {
    setEstado(siguiente);
    if (siguiente === "en_galpon") setObraCodigo("");
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    setError("");
    if (necesitaBarco && !obraCodigo) {
      setError("Elegí el barco de destino.");
      return;
    }
    setGuardando(true);
    try {
      const obra = obraDe(obras, obraCodigo);
      await onMover(equipo, { estado, obraId: obra?.id || null, obraCodigo: obra?.codigo || obraCodigo || null, numeroSerie, nota });
    } catch (err) {
      setError(err.message || "No se pudo actualizar el equipo.");
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!confirmarBaja) {
      setConfirmarBaja(true);
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onEliminar(equipo);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el equipo.");
      setGuardando(false);
      setConfirmarBaja(false);
    }
  };

  return (
    <div className="eq-modal-fondo" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget && !guardando) onCerrar(); }}>
      <section className="eq-modal eq-modal-gestion" role="dialog" aria-modal="true" aria-labelledby="eq-gestion-titulo">
        <header className="eq-modal-cabeza">
          <div>
            <span className="eq-modal-eyebrow">Mover o corregir</span>
            <h2 id="eq-gestion-titulo">{nombre}</h2>
            <p>{[ESTADOS[equipo.estado]?.label, equipo.obra, equipo.numero_serie ? `serie ${equipo.numero_serie}` : null].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" className="eq-modal-cerrar" onClick={onCerrar} disabled={guardando} aria-label="Cerrar"><X size={18} /></button>
        </header>

        <form className="eq-form" onSubmit={guardar}>
          <div className="eq-destinos" role="group" aria-label="Nuevo estado">
            {DESTINOS.map((destino) => (
              <button key={destino.estado} type="button" aria-pressed={estado === destino.estado} className={estado === destino.estado ? "is-activo" : ""} onClick={() => cambiarEstado(destino.estado)}>
                <destino.Icono size={15} />
                <span><strong>{destino.titulo}</strong><small>{destino.texto}</small></span>
              </button>
            ))}
          </div>

          {puedeBarco && (
            <label className="eq-campo">
              <span>{necesitaBarco ? "Barco *" : "Barco (opcional)"}</span>
              <select className="ui-input" value={obraCodigo} onChange={(evento) => setObraCodigo(evento.target.value)}>
                <option value="">{necesitaBarco ? "Elegir barco…" : "Sin barco"}</option>
                {fueraDeLista && <option value={obraCodigo}>{obraCodigo}</option>}
                {obras.map((obra) => <option key={obra.id} value={obra.codigo}>{obra.codigo}</option>)}
              </select>
            </label>
          )}
          <label className="eq-campo">
            <span>Número de serie</span>
            <input className="ui-input" value={numeroSerie} onChange={(evento) => setNumeroSerie(evento.target.value)} placeholder="Cargar al recibir el equipo" autoComplete="off" />
          </label>
          <label className="eq-campo"><span>Motivo o referencia</span><textarea className="ui-input eq-textarea" value={nota} onChange={(evento) => setNota(evento.target.value)} placeholder="Ej. Se pasa al 52-26 por cambio de configuración…" /></label>
          {error && <p className="eq-form-error" role="alert">{error}</p>}

          {confirmarBaja && (
            <p className="eq-eliminar-aviso" role="alert">
              Se quita {nombre} del control{equipo.numero_serie ? ` y se libera la serie ${equipo.numero_serie}` : ""}. La corrección queda registrada.
              <button type="button" onClick={() => setConfirmarBaja(false)} disabled={guardando}>Volver</button>
            </p>
          )}
          <footer className="eq-modal-pie eq-modal-pie-gestion">
            <button type="button" className={`eq-btn-baja${confirmarBaja ? " is-confirmando" : ""}`} onClick={eliminar} disabled={guardando}>
              <Trash2 size={14} /> {confirmarBaja ? "Confirmar eliminación" : "Eliminar carga errónea"}
            </button>
            <button type="button" className="ui-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
            <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

// El panel se despliega debajo de la búsqueda (no flota): en el celular se
// recorre igual que el resto y no tapa los resultados. Cerrado queda inerte
// para el teclado y los lectores de pantalla.
function PanelFiltros({ id, abierto, facetas, vista, resultados, hayFiltros, onAlternar, onLimpiar, onCerrar }) {
  return (
    <div id={id} className={`eq-panel${abierto ? " is-abierto" : ""}`} inert={!abierto}>
      <div className="eq-panel-interior">
        {facetas.length ? (
          <div className="eq-panel-secciones">
            {SECCIONES_FILTRO.map((seccion) => {
              const suyas = facetas.filter((faceta) => faceta.seccion === seccion.key);
              if (!suyas.length) return null;
              return (
                <section key={seccion.key} className="eq-seccion" aria-label={seccion.label}>
                  <h3>{seccion.label}</h3>
                  {suyas.map((faceta) => (
                    <div key={faceta.key} className="eq-faceta" role="group" aria-label={`${seccion.label}: ${faceta.label}`}>
                      <span className="eq-faceta-titulo">{faceta.label}</span>
                      <div className="eq-faceta-opciones">
                        {faceta.opciones.map((opcion) => (
                          <button
                            key={opcion.valor}
                            type="button"
                            className={`eq-opcion${opcion.activa ? " is-activa" : ""}`}
                            aria-pressed={opcion.activa}
                            disabled={!opcion.activa && opcion.cantidad === 0}
                            onClick={() => onAlternar(faceta.key, opcion.valor)}
                          >
                            {opcion.label}
                            <span className="eq-opcion-cuenta">{opcion.cantidad}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        ) : (
          <p className="eq-panel-nada">En esta vista no hay nada para filtrar con la búsqueda actual.</p>
        )}
        <footer className="eq-panel-pie">
          <span>Los números cuentan {UNIDADES[vista][1]}.</span>
          {hayFiltros && <button type="button" className="ui-btn" onClick={onLimpiar}>Limpiar</button>}
          <button type="button" className="ui-btn ui-btn-primario" onClick={onCerrar}>Ver {contar(vista, resultados)}</button>
        </footer>
      </div>
    </div>
  );
}

function Vacio({ texto, onLimpiar }) {
  return (
    <div className="eq-vacio">
      <Search size={22} />
      <span>{texto}</span>
      {onLimpiar && <button type="button" className="ui-btn" onClick={onLimpiar}>Limpiar filtros</button>}
    </div>
  );
}

function GestionarButton({ onClick }) {
  return (
    <button type="button" className="eq-gestionar" onClick={onClick} title="Mover o corregir equipo">
      <ArrowRightLeft size={14} aria-hidden="true" /> <span>Gestionar</span>
    </button>
  );
}

const CSS = `
  .eq {
    position: absolute; top: 0; right: 0; bottom: 0; left: 0;
    overflow-y: auto; overflow-x: hidden;
    color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
  }
  .eq-pestana-cuenta { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--dim); }
  .eq-cuerpo { max-width: 1280px; margin: 0 auto; padding: 18px 28px 48px; }
  .eq-aviso { margin: 0 0 12px; padding: 9px 12px; border: 1px solid var(--red-border); border-radius: 10px; background: var(--red-soft); color: var(--red); font-size: 13px; }

  /* ── A resolver ── */
  .eq-resolver { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .eq-punto {
    min-width: 0; display: grid; align-content: start; gap: 10px; padding: 13px 14px 14px;
    border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid);
    box-shadow: inset 3px 0 0 var(--c), var(--elev-1);
    animation: eq-sube .4s cubic-bezier(.22,1,.36,1) both;
  }
  .eq-punto.is-ancho { grid-column: 1 / -1; }
  .eq-punto header { display: flex; align-items: flex-start; gap: 10px; }
  .eq-punto-cuenta { flex: 0 0 auto; min-width: 30px; font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 600; line-height: 1.05; color: var(--c); }
  .eq-punto h2 { margin: 0; font-size: 13.5px; font-weight: 600; }
  .eq-punto p { margin: 2px 0 0; font-size: 12px; line-height: 1.35; color: var(--dim); }
  .eq-punto-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .eq-punto-chip {
    min-width: 0; max-width: 100%; display: inline-flex; align-items: baseline; gap: 6px; min-height: 28px; padding: 4px 9px;
    border: 1px solid var(--border-2); border-radius: 8px; background: var(--panel); color: var(--text);
    font: inherit; font-size: 12px; cursor: pointer; transition: border-color .15s, background-color .15s;
  }
  .eq-punto-chip:hover { border-color: color-mix(in srgb, var(--c) 55%, transparent); background: color-mix(in srgb, var(--c) 8%, var(--panel)); }
  .eq-punto-chip strong { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .eq-punto-chip span { min-width: 0; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── Búsqueda y filtros ── */
  .eq-filtros { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; }
  .eq-buscar { position: relative; flex: 1 1 auto; min-width: 0; max-width: 520px; }
  .eq-buscar > svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
  .eq-buscar .ui-input { width: 100%; padding-left: 36px; padding-right: 34px; }
  .eq-buscar-borrar { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 7px; background: transparent; color: var(--dim); cursor: pointer; }
  .eq-buscar-borrar:hover { background: var(--panel-2); color: var(--text); }
  .eq-btn-filtros { flex-shrink: 0; min-height: 40px; }
  .eq-btn-filtros.is-abierto { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); }
  .eq-btn-filtros-cuenta {
    display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px;
    border-radius: 999px; background: var(--blue); color: var(--inverse-text);
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 600;
  }

  .eq-activos { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 12px; }
  .eq-activo {
    display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 8px 0 11px;
    border: 1px solid var(--blue-border); border-radius: 999px; background: var(--blue-soft); color: var(--blue);
    font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
  }
  .eq-activo.no-aplica { border-color: var(--border-2); background: transparent; color: var(--dim); font-weight: 500; text-decoration: line-through; text-decoration-color: var(--subtle); }
  .eq-limpiar {
    padding: 4px 6px; border: 0; background: none; color: var(--dim); cursor: pointer;
    font: inherit; font-size: 12.5px; text-decoration: underline; text-underline-offset: 3px;
  }
  .eq-limpiar:hover { color: var(--text); }

  .eq-panel {
    display: grid; grid-template-rows: 0fr; opacity: 0;
    transition: grid-template-rows .32s cubic-bezier(.22,1,.36,1), opacity .2s ease;
  }
  .eq-panel.is-abierto { grid-template-rows: 1fr; opacity: 1; }
  .eq-panel-interior { min-height: 0; overflow: hidden; }
  .eq-panel-secciones { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 10px; }
  .eq-seccion {
    display: grid; align-content: start; gap: 14px; padding: 14px 16px 16px;
    border: 1px solid var(--border); border-radius: 16px; background: var(--panel-solid);
  }
  .eq-seccion h3 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
  .eq-faceta { display: grid; gap: 7px; }
  .eq-faceta-titulo { font-size: 12.5px; font-weight: 600; color: var(--muted); }
  .eq-faceta-opciones { display: flex; flex-wrap: wrap; gap: 6px; }
  .eq-opcion {
    flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 10px 0 12px;
    border: 1px solid var(--border-2); border-radius: 999px; background: var(--panel); color: var(--text);
    font: inherit; font-size: 12.5px; font-weight: 500; white-space: nowrap; cursor: pointer;
    transition: border-color .15s, background-color .15s, color .15s;
  }
  .eq-opcion:hover:not(:disabled) { border-color: var(--border-3); background: var(--panel-2); }
  .eq-opcion.is-activa { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); font-weight: 600; }
  .eq-opcion:disabled { opacity: .4; cursor: default; }
  .eq-opcion-cuenta { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--dim); }
  .eq-opcion.is-activa .eq-opcion-cuenta { color: inherit; opacity: .75; }
  .eq-panel-nada { margin: 0; padding: 14px 16px; border: 1px dashed var(--border-2); border-radius: 14px; font-size: 13px; color: var(--dim); }
  .eq-panel-pie { display: flex; align-items: center; gap: 8px; padding: 10px 0 16px; font-size: 12.5px; color: var(--dim); }
  .eq-panel-pie > span { margin-right: auto; }

  .eq-estado {
    flex-shrink: 0; display: inline-flex; align-items: center; min-height: 22px; padding: 0 9px;
    border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); border-radius: 999px;
    background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c);
    font-size: 11.5px; font-weight: 600; white-space: nowrap;
  }
  .eq-serie { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: var(--text); }
  .eq-serie.is-vacia { color: var(--subtle); font-family: 'Outfit', system-ui, sans-serif; font-style: italic; }

  /* ── Bloques por línea (barcos, existencias, entregados) ── */
  .eq-lineas { display: grid; gap: 16px; }
  .eq-linea { border: 1px solid var(--border); border-radius: 16px; background: var(--panel-solid); box-shadow: var(--elev-1); overflow: hidden; }
  .eq-linea-cabeza { display: flex; align-items: center; gap: 8px; padding: 11px 16px; border-bottom: 1px solid var(--border); }
  .eq-linea-cabeza > svg { color: var(--dim); }
  .eq-linea-cabeza h2 { margin: 0; font-size: 14px; font-weight: 650; }
  .eq-linea-cabeza > span { margin-left: auto; font-size: 12px; color: var(--dim); }
  .eq-linea-lista { list-style: none; margin: 0; padding: 0; }
  .eq-linea-vacia { margin: 0; padding: 14px 16px; font-size: 13px; color: var(--dim); }

  /* ── Fila de barco ── */
  .eq-b { border-bottom: 1px solid var(--border); }
  .eq-b:last-child { border-bottom: 0; }
  .eq-b-fila {
    width: 100%; display: grid; grid-template-columns: 86px minmax(0, 1.25fr) minmax(0, 1fr) 190px 18px; align-items: center; gap: 14px;
    padding: 11px 16px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
    transition: background-color .15s;
  }
  .eq-b-fila:hover, .eq-b.is-abierto .eq-b-fila { background: var(--panel); }
  .eq-b-codigo { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
  .eq-b-celda { min-width: 0; display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: start; gap: 8px; border-radius: 8px; }
  .eq-b-celda > svg { margin-top: 2px; color: var(--dim); }
  .eq-b-celda.is-foco > svg, .eq-b-celda.is-foco strong { color: var(--blue); }
  .eq-b-texto { min-width: 0; display: grid; gap: 4px; }
  .eq-b-texto strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; font-weight: 500; }
  .eq-b-texto small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--dim); }
  .eq-b-texto.is-suave strong { color: var(--muted); font-weight: 400; }
  .eq-b-series { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .eq-b-series small { font-size: 11.5px; color: var(--dim); }
  .eq-serie-chip { display: inline-flex; align-items: center; gap: 5px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); }
  .eq-serie-chip i { width: 7px; height: 7px; border-radius: 999px; background: var(--c); flex: 0 0 auto; }
  .eq-serie-chip.is-vacia { font-family: 'Outfit', system-ui, sans-serif; font-style: italic; color: var(--dim); }
  .eq-serie-chip.is-vacia i { background: transparent; box-shadow: inset 0 0 0 1.5px var(--c); }
  .eq-b-estado { justify-self: end; min-width: 0; }
  .eq-b-estado .eq-estado { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .eq-b-flecha { color: var(--dim); transition: transform .2s cubic-bezier(.22,1,.36,1); }
  .eq-b.is-abierto .eq-b-flecha { transform: rotate(180deg); }
  .eq-b-detalle { display: grid; gap: 6px; padding: 4px 16px 14px 116px; background: var(--panel); animation: eq-sube .25s cubic-bezier(.22,1,.36,1) both; }
  .eq-b-alerta { margin: 0 0 2px; padding: 8px 11px; border: 1px solid var(--red-border); border-radius: 9px; background: var(--red-soft); color: var(--text); font-size: 12.5px; line-height: 1.4; }
  .eq-b-memoria { margin: 2px 0 0; font-size: 12px; color: var(--dim); }
  .eq-b-memoria span { margin-right: 6px; font-size: 10.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--subtle); }
  .eq-b-acciones { display: flex; flex-wrap: wrap; gap: 8px; }
  .eq-b-acciones:empty { display: none; }
  .eq-renglon {
    display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; align-items: center; gap: 10px;
    padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid); font-size: 13px;
  }
  .eq-renglon > svg { color: var(--dim); }
  .eq-renglon-texto { min-width: 0; display: grid; gap: 1px; }
  .eq-renglon-texto strong { font-weight: 500; }
  .eq-renglon-texto small { font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .eq-gestionar {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 30px; padding: 0 9px;
    border: 1px solid var(--border-2); border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer;
    font: inherit; font-size: 12px; font-weight: 600;
    transition: border-color .15s, background-color .15s, color .15s;
  }
  .eq-gestionar:hover { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); }

  /* ── Filas de existencias y entregados ── */
  .eq-fila {
    display: grid; grid-template-columns: 76px minmax(0, 1fr) 110px 150px auto; align-items: center; gap: 12px;
    padding: 9px 16px; border-top: 1px solid var(--border); font-size: 13px;
  }
  .eq-fila > .eq-estado { justify-self: end; }
  .eq-fila:first-child { border-top: 0; }
  .eq-fila.is-repite { border-top-color: transparent; padding-top: 3px; }
  .eq-fila-codigo { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
  .eq-fila-codigo.is-libre { color: var(--blue); font-weight: 500; }
  .eq-fila-texto { min-width: 0; display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: start; gap: 8px; }
  .eq-fila-texto > svg { margin-top: 2px; color: var(--dim); }
  .eq-fila-texto > span { min-width: 0; display: grid; gap: 1px; }
  .eq-fila-texto strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .eq-fila-texto small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--dim); }
  .eq-fila-texto small.is-alerta { color: var(--red); }
  .eq-fila-entregado { grid-template-columns: 76px minmax(0, 1.2fr) minmax(0, 1fr); align-items: start; }
  .eq-entregado-celda { min-width: 0; display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 8px; }
  .eq-entregado-celda > svg { margin-top: 2px; color: var(--dim); }
  .eq-entregado-celda > span { min-width: 0; display: grid; gap: 4px; justify-items: start; }
  .eq-entregado-celda strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .eq-entregado-celda .is-suave { color: var(--dim); }
  .eq-entregado-celda.is-foco > svg, .eq-entregado-celda.is-foco strong { color: var(--blue); }
  .eq-serie-boton, .eq-grupo-boton {
    max-width: 100%; padding: 2px 6px; margin-left: -6px; border: 0; border-radius: 6px; background: transparent; color: var(--muted);
    font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .eq-serie-boton { font-family: 'JetBrains Mono', monospace; font-size: 12px; margin-left: 0; }
  .eq-grupo-boton { color: var(--text); }
  .eq-grupo-boton small { color: var(--dim); font-size: 12px; }
  .eq-serie-boton:hover, .eq-grupo-boton:hover { background: var(--blue-soft); color: var(--blue); }

  .eq-ultimos { margin-bottom: 16px; }
  .eq-ultimos h2 { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
  .eq-ultimos-lista { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
  .eq-ultimo { min-width: 0; display: grid; gap: 2px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel-solid); }
  .eq-ultimo-barco { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; }
  .eq-ultimo-equipo { font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .eq-ultimo-meta { font-size: 11.5px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── Movimientos ── */
  .eq-historia { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: 16px; background: var(--panel-solid); box-shadow: var(--elev-1); overflow: hidden; }
  .eq-mov {
    display: grid; grid-template-columns: 74px 140px minmax(0, auto) minmax(0, 1fr); align-items: center; gap: 14px;
    padding: 10px 16px; border-top: 1px solid var(--border); font-size: 13px;
  }
  .eq-mov:first-child { border-top: 0; }
  .eq-mov-fecha { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--dim); }
  .eq-mov-tipo { font-size: 12px; font-weight: 600; color: var(--muted); }
  .eq-mov-ruta { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
  .eq-mov-ruta strong { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
  .eq-mov-ruta span { color: var(--muted); }
  .eq-mov-ruta svg { color: var(--violet); flex: 0 0 auto; }
  .eq-mov-equipo { min-width: 0; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .eq-vacio { display: grid; justify-items: center; gap: 10px; padding: 40px 20px; color: var(--dim); font-size: 13px; }

  /* ── Carga y gestión ── */
  .eq-modal-fondo {
    position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px;
    background: color-mix(in srgb, #02050a 72%, transparent); backdrop-filter: blur(6px);
    animation: eq-fondo .18s ease both;
  }
  .eq-modal {
    width: min(720px, 100%); max-height: min(860px, calc(100vh - 48px)); overflow: auto;
    border: 1px solid var(--border-2); border-radius: 18px; background: var(--panel-solid); box-shadow: var(--elev-2);
    animation: eq-modal-entra .25s cubic-bezier(.22,1,.36,1) both;
  }
  .eq-modal-cabeza { display: flex; align-items: flex-start; gap: 16px; padding: 18px 20px 15px; border-bottom: 1px solid var(--border); }
  .eq-modal-cabeza > div { min-width: 0; }
  .eq-modal-eyebrow { display: block; margin-bottom: 3px; color: var(--blue); font-size: 10.5px; font-weight: 600; letter-spacing: .11em; text-transform: uppercase; }
  .eq-modal-cabeza h2 { margin: 0; font-size: 20px; font-weight: 650; }
  .eq-modal-cabeza p { margin: 4px 0 0; color: var(--dim); font-size: 12.5px; line-height: 1.4; }
  .eq-modal-cerrar { margin-left: auto; flex: 0 0 auto; display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); color: var(--muted); cursor: pointer; }
  .eq-form { display: grid; gap: 14px; padding: 18px 20px 20px; }
  .eq-tipo { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .eq-tipo button { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel); color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .eq-tipo button.is-activo { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); }
  .eq-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .eq-campo { min-width: 0; display: grid; gap: 6px; }
  .eq-campo > span { color: var(--muted); font-size: 11.5px; font-weight: 600; }
  .eq-campo .ui-input { width: 100%; }
  .eq-textarea { min-height: 70px; padding-top: 10px; resize: vertical; }
  .eq-check { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12.5px; cursor: pointer; }
  .eq-aviso-pedido { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--violet-border); border-radius: 10px; background: var(--violet-soft); }
  .eq-aviso-pedido p { margin: 0; font-size: 12.5px; line-height: 1.4; color: var(--text); }
  .eq-aviso-pedido div { display: flex; flex-wrap: wrap; gap: 6px; }
  .eq-form-error { margin: 0; padding: 9px 11px; border: 1px solid var(--red-border); border-radius: 9px; background: var(--red-soft); color: var(--red); font-size: 12.5px; }
  .eq-modal-pie { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }
  .eq-modal-gestion { width: min(680px, 100%); }
  .eq-destinos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .eq-destinos button {
    min-width: 0; display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: start; gap: 8px;
    padding: 10px 11px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); color: var(--muted);
    font: inherit; text-align: left; cursor: pointer;
  }
  .eq-destinos button > svg { margin-top: 1px; color: var(--dim); }
  .eq-destinos button > span { min-width: 0; display: grid; gap: 2px; }
  .eq-destinos strong { color: var(--text); font-size: 12.5px; font-weight: 600; }
  .eq-destinos small { color: var(--dim); font-size: 11.5px; line-height: 1.3; }
  .eq-destinos button.is-activo { border-color: var(--blue-border); background: var(--blue-soft); }
  .eq-destinos button.is-activo > svg, .eq-destinos button.is-activo strong { color: var(--blue); }
  .eq-modal-pie-gestion { align-items: center; }
  .eq-btn-baja {
    margin-right: auto; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 10px;
    border: 1px solid var(--red-border); border-radius: 9px; background: transparent; color: var(--red);
    font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .eq-btn-baja.is-confirmando { background: var(--red-soft); }
  .eq-eliminar-aviso { display: flex; align-items: center; gap: 10px; margin: 0; padding: 10px 12px; border: 1px solid var(--red-border); border-radius: 9px; background: var(--red-soft); color: var(--text); font-size: 12px; }
  .eq-eliminar-aviso button { flex: 0 0 auto; margin-left: auto; padding: 4px 8px; border: 0; background: transparent; color: var(--red); font: inherit; font-weight: 600; cursor: pointer; }

  .eq-punto-chip:focus-visible, .eq-b-fila:focus-visible, .eq-opcion:focus-visible, .eq-activo:focus-visible,
  .eq-limpiar:focus-visible, .eq-gestionar:focus-visible, .eq-serie-boton:focus-visible, .eq-grupo-boton:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }

  @keyframes eq-sube { from { opacity: 0; transform: translateY(6px); } }
  @keyframes eq-fondo { from { opacity: 0; } }
  @keyframes eq-modal-entra { from { opacity: 0; transform: translateY(14px) scale(.985); } }

  @media (prefers-reduced-motion: reduce) {
    .eq-panel { transition: none; }
  }

  @media (max-width: 1100px) {
    .eq-b-fila { grid-template-columns: 76px minmax(0, 1.2fr) minmax(0, 1fr) 150px 18px; gap: 12px; }
    .eq-b-detalle { padding-left: 16px; }
    .eq-ultimos-lista { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  @media (max-width: 899px) {
    .eq-cuerpo { padding: 12px 12px 32px; }
    .eq-resolver { display: flex; align-items: flex-start; overflow-x: auto; margin: 0 -12px 14px; padding: 0 12px 2px; scroll-snap-type: x mandatory; scrollbar-width: none; }
    .eq-resolver::-webkit-scrollbar { display: none; }
    .eq-punto { flex: 0 0 min(84%, 320px); scroll-snap-align: start; }
    .eq-punto-chips { max-height: 98px; overflow-y: auto; }
    .eq-buscar { max-width: none; }
    .eq-btn-filtros { min-height: 42px; }
    .eq-buscar .ui-input { min-height: 42px; }
    /* En el celular cada faceta es una fila que se desliza de costado. */
    .eq-panel-secciones { grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .eq-seccion { padding: 12px 0 14px; gap: 12px; }
    .eq-seccion h3, .eq-faceta-titulo { padding: 0 14px; }
    .eq-faceta-opciones { flex-wrap: nowrap; overflow-x: auto; padding: 0 14px 2px; scrollbar-width: none; }
    .eq-faceta-opciones::-webkit-scrollbar { display: none; }
    .eq-opcion { min-height: 38px; }
    .eq-panel-pie { flex-wrap: wrap; }
    .eq-panel-pie > span { flex-basis: 100%; }
    .eq-panel-pie .ui-btn-primario { flex: 1; justify-content: center; }

    .eq-linea-cabeza { padding: 10px 14px; }
    .eq-b-fila { grid-template-columns: minmax(0, 1fr) auto 16px; grid-template-areas: "codigo estado flecha" "motores motores motores" "grupo grupo grupo"; gap: 7px 10px; padding: 12px 14px; }
    .eq-b-codigo { grid-area: codigo; }
    .eq-b-celda.is-motores { grid-area: motores; }
    .eq-b-celda.is-grupo { grid-area: grupo; }
    .eq-b-estado { grid-area: estado; }
    .eq-b-estado .eq-estado { max-width: 52vw; }
    .eq-b-flecha { grid-area: flecha; }
    .eq-b-detalle { padding: 2px 12px 12px; }
    .eq-renglon { grid-template-columns: 16px minmax(0, 1fr) auto; }
    .eq-renglon > .eq-estado { grid-column: 2; grid-row: 2; justify-self: start; }
    .eq-renglon > .eq-gestionar { grid-column: 3; grid-row: 1 / span 2; }
    .eq-renglon-texto small { white-space: normal; }
    .eq-gestionar { min-height: 38px; padding: 0 10px; }

    .eq-fila { grid-template-columns: 58px minmax(0, 1fr) auto; gap: 6px 10px; padding: 10px 14px; }
    .eq-fila > .eq-serie { grid-column: 2; grid-row: 2; }
    .eq-fila > .eq-estado { grid-column: 2; grid-row: 3; justify-self: start; }
    .eq-fila > .eq-gestionar { grid-column: 3; grid-row: 1 / span 3; align-self: center; }
    .eq-fila-entregado { grid-template-columns: 58px minmax(0, 1fr); }
    .eq-fila-entregado > .eq-entregado-celda:last-child { grid-column: 2; }
    .eq-ultimos-lista { display: flex; overflow-x: auto; margin: 0 -12px; padding: 0 12px 2px; scrollbar-width: none; }
    .eq-ultimos-lista::-webkit-scrollbar { display: none; }
    .eq-ultimo { flex: 0 0 170px; }

    .eq-mov { grid-template-columns: 64px minmax(0, 1fr); gap: 3px 10px; padding: 10px 14px; }
    .eq-mov-tipo { grid-column: 2; }
    .eq-mov-ruta { grid-column: 2; white-space: normal; flex-wrap: wrap; }
    .eq-mov-equipo { grid-column: 2; white-space: normal; }

    .eq-modal-fondo { align-items: end; padding: 0; }
    .eq-modal { width: 100%; max-height: 92vh; border-radius: 18px 18px 0 0; padding-bottom: env(safe-area-inset-bottom); }
    .eq-form-grid { grid-template-columns: minmax(0, 1fr); }
    .eq-destinos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .eq-modal-pie-gestion { flex-wrap: wrap; }
    .eq-btn-baja { flex-basis: 100%; justify-content: center; margin-right: 0; }
    .eq-eliminar-aviso { flex-wrap: wrap; }
  }
`;
