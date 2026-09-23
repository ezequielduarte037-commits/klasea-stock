/**
 * EquiposScreen — control de motores y grupos electrógenos.
 *
 * Qué motor y qué grupo lleva cada barco, qué hay en el galpón, qué falta
 * llegar y la historia de cada número de serie (para postventa). Hoy se lleva
 * en dos Excel; esta vista los reúne en un módulo operativo. Los datos
 * iniciales salen de equiposSeed.js y, si
 * hay sesión, de la base: qué barcos siguen en producción y qué dice la memoria
 * de cada uno sobre motores y grupo (Mercury y Volvo todavía no están cargados).
 *
 * Los filtros (línea, motores y grupos) valen para las cuatro vistas y viven en
 * la URL junto con la vista elegida: se pueden pasar por link.
 *
 * Las altas nuevas se guardan en la tabla equipos, creada por la migración
 * 20260918100000_equipos_motores_grupos.sql; los Excel siguen como base inicial.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowRightLeft, Cog, History, PackageCheck, PackageOpen, Search, Ship, SlidersHorizontal, Trash2, Warehouse, X, Zap } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { AnimatedNumber } from "@/components/ui/motion";
import { supabase } from "@/supabaseClient";
import {
  CLAVES_FILTRO,
  ESTADOS,
  FACETAS,
  FACETAS_POR_VISTA,
  SECCIONES_FILTRO,
  TIPO_POR_VISTA,
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
  resumen,
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

function EstadoChip({ estado, urgente = false }) {
  const meta = ESTADOS[estado] || { label: estado, tono: "neutro" };
  const color = urgente ? TONOS.rojo : TONOS[meta.tono];
  return <span className="eq-estado" style={{ "--c": color }}>{urgente ? "Urgente" : meta.label}</span>;
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
  if (motor.marca === "FPT Iveco") return `Iveco ${modelo}`.trim();
  if (motor.marca === "Volvo Penta") return /^volvo\s+/i.test(modelo)
    ? modelo.replace(/^volvo\s+/i, "Volvo Penta ")
    : `Volvo Penta ${modelo}`.trim();
  if (motor.marca && !modelo.toLowerCase().startsWith(motor.marca.toLowerCase())) return `${motor.marca} ${modelo}`.trim();
  return modelo || motor.marca || "Motor sin identificar";
}

function contar(vista, cantidad) {
  const [singular, plural] = UNIDADES[vista];
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

function equipoDesdeBase(equipo) {
  return { ...equipo, obra: equipo.obra_codigo || null, movimientos: equipo.movimientos || [], stock_confirmado: true };
}

function payloadEquipo(equipo) {
  const campos = [
    "tipo", "marca", "modelo", "potencia", "transmision", "numero_serie", "cajas", "proveedor",
    "obra_id", "obra_codigo", "posicion", "estado", "fecha_estimada", "urgente", "fecha_compra",
    "fecha_retiro", "fecha_ingreso", "fecha_instalacion", "fecha_entrega", "garantia_hasta",
    "compra_cliente", "notas", "purchase_request_id", "panol_envio_item_id", "origen",
  ];
  const payload = Object.fromEntries(campos.map((campo) => [campo, equipo[campo] ?? (campo === "obra_codigo" ? equipo.obra ?? null : null)]));
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

export default function EquiposScreen() {
  const [datos, setDatos] = useState(equiposIniciales);
  const [base, setBase] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [cargandoEquipo, setCargandoEquipo] = useState(false);
  const [equipoGestion, setEquipoGestion] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [params, setParams] = useSearchParams();
  const idPanel = useId();

  // Con sesión, las obras (cuáles siguen en producción) y lo que dice la
  // memoria de cada barco sobre motores y grupo. Si la memoria no se puede
  // leer, se sigue sin ella.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from("produccion_obras").select("id,codigo,estado"),
      supabase.from("obra_memorias").select("obra_codigo,motorizacion,grupo_electrogeno"),
      supabase.from("equipos").select("*"),
      supabase.from("equipo_movimientos").select("equipo_id,tipo,estado_anterior,estado_nuevo,obra_anterior,obra_nueva,fecha,nota,created_at"),
    ]).then(([obras, memorias, equipos, movimientos]) => {
      if (!vivo || obras.error) return;
      setBase({ obras: obras.data || [], memorias: memorias.error ? [] : memorias.data || [] });
      if (!equipos.error && equipos.data?.length) {
        const historial = movimientos.error ? [] : movimientos.data || [];
        const guardados = equipos.data.map((equipo) => ({
          ...equipo,
          movimientos: historial
            .filter((movimiento) => movimiento.equipo_id === equipo.id && movimiento.tipo !== "alta")
            .map((movimiento) => ({
              tipo: movimiento.tipo,
              desde: movimiento.obra_anterior,
              hacia: movimiento.obra_nueva,
              fecha: movimiento.fecha,
              nota: movimiento.nota,
              estado_anterior: movimiento.estado_anterior,
              estado_nuevo: movimiento.estado_nuevo,
            })),
        }));
        setDatos((actual) => integrarEquipos(actual, guardados));
      }
    });
    return () => { vivo = false; };
  }, []);

  const pestana = PESTANAS.some((tab) => tab.key === params.get("vista")) ? params.get("vista") : "barcos";
  const filtros = useMemo(() => Object.fromEntries(CLAVES_FILTRO.map((key) => [key, params.getAll(key)])), [params]);

  const cambiarParams = (cambiar) => setParams((actual) => {
    const siguiente = new URLSearchParams(actual);
    cambiar(siguiente);
    return siguiente;
  }, { replace: true });
  const elegirPestana = (key) => cambiarParams((p) => (key === "barcos" ? p.delete("vista") : p.set("vista", key)));
  const alternarFiltro = (key, valor) => cambiarParams((p) => {
    const actuales = p.getAll(key);
    p.delete(key);
    const siguientes = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
    for (const v of siguientes) p.append(key, v);
  });
  const limpiarFiltros = () => cambiarParams((p) => {
    for (const key of CLAVES_FILTRO) p.delete(key);
  });

  const guardarEquipo = async (payload) => {
    const { data, error } = await supabase.from("equipos").insert(payload).select("*").single();
    if (error) {
      if (error.code === "23505" && /numero_serie|serie/i.test(error.message || "")) {
        throw new Error("Ese número de serie ya está cargado en otro equipo. Revisalo antes de guardar.");
      }
      if (/does not exist|schema cache/i.test(error.message || "")) {
        throw new Error("El guardado de equipos todavía no está habilitado. Contactá a administración.");
      }
      throw error;
    }
    const equipo = equipoDesdeBase(data);
    setDatos((actual) => integrarEquipos(actual, [equipo]));
    setMensaje(`${equipo.marca} ${equipo.modelo} quedó cargado.`);
    setCargandoEquipo(false);
    elegirPestana(equipo.estado === "instalado" ? "barcos" : "galpon");
  };

  const materializarEquipo = async (equipo) => {
    if (!String(equipo.id).startsWith("eq-")) return equipo;
    if (equipo.origen) {
      const { data: existente, error: buscarError } = await supabase.from("equipos").select("*").eq("origen", equipo.origen).maybeSingle();
      if (buscarError) throw buscarError;
      if (existente) return equipoDesdeBase(existente);
    }
    const { data, error } = await supabase.from("equipos").insert(payloadEquipo(equipo)).select("*").single();
    if (error) throw error;
    return { ...equipoDesdeBase(data), movimientos: equipo.movimientos || [] };
  };

  const moverEquipo = async (equipo, destino) => {
    let persistido;
    try {
      persistido = await materializarEquipo(equipo);
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
      const cambioDestino = persistido.estado !== actualizado.estado || claveObra(persistido.obra) !== claveObra(actualizado.obra);
      actualizado.movimientos = [
        ...(persistido.movimientos || []),
        ...(cambioDestino ? [{
          tipo: persistido.obra && actualizado.obra && persistido.obra !== actualizado.obra ? "cambio_barco"
            : persistido.obra && !actualizado.obra ? "devuelto"
              : actualizado.estado === "instalado" ? "instalacion"
                : actualizado.estado === "asignado" ? "reserva"
                  : persistido.estado === "comprado" ? "retiro" : "otro",
          desde: persistido.obra,
          hacia: actualizado.obra,
          fecha: new Date().toISOString().slice(0, 10),
          nota: cambioSerie ? null : destino.nota || null,
          estado_anterior: persistido.estado,
          estado_nuevo: actualizado.estado,
        }] : []),
      ];
      setDatos((actual) => integrarEquipos(actual, [actualizado]));
      const nombre = actualizado.tipo === "motor" ? nombreMotor(actualizado) : nombreGrupo(actualizado);
      setMensaje(`${nombre}: ${ESTADOS[actualizado.estado]?.label || "actualizado"}${cambioSerie ? ` · serie ${serieNueva || "sin número"}` : ""}.`);
      setEquipoGestion(null);
      elegirPestana(actualizado.estado === "entregado" ? "entregados" : actualizado.estado === "instalado" ? "barcos" : "galpon");
    } catch (error) {
      if (error.code === "23505" && /numero_serie|serie/i.test(error.message || "")) {
        throw new Error("Ese número de serie ya está cargado en otro equipo. Revisalo antes de guardar.");
      }
      if (/does not exist|schema cache/i.test(error.message || "")) throw new Error("La gestión de equipos todavía no está habilitada. Contactá a administración.");
      throw error;
    }
  };

  const eliminarEquipo = async (equipo) => {
    const esInicial = String(equipo.id).startsWith("eq-");
    let persistido = equipo;
    if (esInicial && equipo.origen) {
      const { data, error } = await supabase.from("equipos").select("*").eq("origen", equipo.origen).maybeSingle();
      if (error) throw error;
      persistido = data || null;
    }

    const constancia = `Carga errónea eliminada del control${equipo.numero_serie ? ` · serie original: ${equipo.numero_serie}` : ""}`;
    const notas = [persistido?.notas || equipo.notas, constancia].filter(Boolean).join("\n");
    const cambios = { estado: "baja", obra_id: null, obra_codigo: null, numero_serie: null, notas };
    const consulta = persistido
      ? supabase.from("equipos").update(cambios).eq("id", persistido.id)
      : supabase.from("equipos").insert({ ...payloadEquipo(equipo), ...cambios });
    const { data, error } = await consulta.select("*").single();
    if (error) throw error;

    setDatos((actual) => integrarEquipos(actual, [data]));
    setMensaje(`${equipo.tipo === "motor" ? "El motor" : "El grupo"} se eliminó del control.${equipo.numero_serie ? " Su número de serie quedó disponible para cargarlo correctamente." : ""}`);
    setEquipoGestion(null);
  };

  const vista = useMemo(() => aplicarBase(datos, base), [datos, base]);
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
  const totales = useMemo(() => resumen(vista, todosLosBarcos), [vista, todosLosBarcos]);
  const ultimosGrupos = useMemo(() => ultimosGruposEntregados(vista, 5), [vista]);

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

  const segunMemoria = Object.entries(totales.marcasSinNumero)
    .map(([marcaMemoria, cantidad]) => `${cantidad} ${marcaMemoria.split(" ")[0]}`)
    .join(" · ");

  const galpon = filtrados.galpon;
  const pendientesRetiro = galpon.filter((equipo) => equipo.estado === "comprado");
  const pendientesRecepcion = galpon.filter((equipo) => equipo.estado === "pedido");
  // Lo que tiene barco va a "reservados" aunque haya quedado guardado como
  // stock: si no, el mismo motor figuraba libre y en el barco a la vez.
  const enStock = (equipo) => equipo.estado === "en_galpon" && !equipo.obra;
  const reservado = (equipo) => equipo.estado === "asignado" || (equipo.estado === "en_galpon" && !!equipo.obra);
  const motoresDisponibles = galpon.filter((equipo) => equipo.tipo === "motor" && enStock(equipo));
  const motoresReservados = galpon.filter((equipo) => equipo.tipo === "motor" && reservado(equipo));
  const gruposReservados = galpon.filter((equipo) => equipo.tipo === "generador" && reservado(equipo));
  const gruposLibres = galpon.filter((equipo) => equipo.tipo === "generador" && enStock(equipo));
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
        subtitle="Qué lleva cada barco, qué está disponible y qué compra falta retirar, por número de serie."
        actions={(
          <button type="button" className="ui-btn ui-btn-primario" onClick={() => setCargandoEquipo(true)}>
            <Cog size={15} /> Cargar equipo
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
              <tab.Icono size={14} /> {tab.label} <span className="eq-pestana-cuenta">{filtrados[tab.key].length}</span>
            </button>
          ))}
        </div>
      </PageHeader>

      <main className="eq-cuerpo">
        {mensaje && <div className="eq-mensaje" role="status">{mensaje}<button type="button" onClick={() => setMensaje("")} aria-label="Cerrar"><X size={14} /></button></div>}

        <section className="eq-kpis" aria-label="Resumen">
          <Kpi tono="violeta" valor={totales.faltanLlegar} titulo="Pendientes de recepción" detalle={`${totales.barcosConFaltantes} barcos${totales.urgentes ? ` · ${totales.urgentes} urgentes` : ""}`} />
          <Kpi
            tono="azul"
            valor={totales.stockFisico}
            titulo="Stock confirmado"
            detalle={`${totales.pendientesRetiro} compras pendientes de retiro`}
          />
          <Kpi tono="verde" valor={totales.instalados} titulo="Motores instalados" detalle="en barcos en producción" />
          <Kpi
            tono="neutro"
            valor={totales.sinDatos}
            titulo="Motorización por completar"
            detalle={base ? (segunMemoria ? `${segunMemoria} por identificar` : "Requiere completar la ficha técnica") : "Actualizando información…"}
          />
        </section>

        {pestana === "barcos" && ultimosGrupos.length > 0 && (
          <UltimosGrupos grupos={ultimosGrupos} onVerTodos={() => elegirPestana("entregados")} />
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
            <div className="eq-barcos">
              {filtrados.barcos.map((barco, i) => <TarjetaBarco key={barco.codigo} barco={barco} indice={i} foco={foco} onGestionar={setEquipoGestion} />)}
            </div>
          ) : vacio
        )}

        {pestana === "galpon" && (
          galpon.length ? (
            <div className="eq-listas">
              {pendientesRetiro.length > 0 && (
                <Lista titulo="En proveedor · a retirar" icono={PackageOpen} vacio="No hay compras pendientes de retiro.">
                  {pendientesRetiro.map((equipo) => (
                    <li key={equipo.id} className="eq-fila">
                      <span className="eq-fila-codigo">{equipo.obra || "Stock"}</span>
                      <span className="eq-fila-texto eq-fila-dos-lineas">
                        <strong>{equipo.tipo === "motor" ? nombreMotor(equipo) : nombreGrupo(equipo)}{equipo.proveedor ? ` · ${equipo.proveedor}` : ""}</strong>
                        <small>{equipo.obra_detalle ? `Compra para ${equipo.obra_detalle}` : "Compra sin barco asignado"}</small>
                      </span>
                      <span className={`eq-serie${equipo.numero_serie ? "" : " is-vacia"}`}>{equipo.numero_serie || "retiro sin registrar"}</span>
                      <EstadoChip estado="comprado" />
                      <GestionarButton onClick={() => setEquipoGestion(equipo)} />
                    </li>
                  ))}
                </Lista>
              )}
              {pendientesRecepcion.length > 0 && (
                <Lista titulo="Pedidos · pendientes de recepción" icono={History}>
                  {pendientesRecepcion.map((equipo) => (
                    <li key={equipo.id} className="eq-fila">
                      <span className="eq-fila-codigo">{equipo.obra || "Sin barco"}</span>
                      <span className="eq-fila-texto">{equipo.tipo === "motor" ? nombreMotor(equipo) : nombreGrupo(equipo)}</span>
                      <span className={`eq-serie${equipo.numero_serie ? "" : " is-vacia"}`}>{equipo.numero_serie || "sin número"}</span>
                      <EstadoChip estado={equipo.estado} urgente={equipo.urgente} />
                      <GestionarButton onClick={() => setEquipoGestion(equipo)} />
                    </li>
                  ))}
                </Lista>
              )}
              {(motoresDisponibles.length > 0 || !filtrando) && (
                <Lista titulo="Motores libres en galpón" icono={Cog} vacio="No hay motores libres en el galpón.">
                  {motoresDisponibles.map((motor) => (
                    <li key={motor.id} className="eq-fila">
                      <span className="eq-fila-codigo is-libre">Stock</span>
                      <span className="eq-fila-texto">{nombreMotor(motor)}{motor.cajas ? ` · ${motor.cajas}` : ""}</span>
                      <span className={`eq-serie${motor.numero_serie ? "" : " is-vacia"}`}>{motor.numero_serie || "sin número"}</span>
                      <EstadoChip estado={motor.estado} />
                      <GestionarButton onClick={() => setEquipoGestion(motor)} />
                    </li>
                  ))}
                </Lista>
              )}
              {(motoresReservados.length > 0 || !filtrando) && (
                <Lista titulo="Motores reservados para barco" icono={Cog} vacio="No hay motores reservados.">
                  {motoresReservados.map((motor) => (
                    <li key={motor.id} className="eq-fila">
                      <span className="eq-fila-codigo">{motor.obra}</span>
                      <span className="eq-fila-texto">{nombreMotor(motor)}{motor.cajas ? ` · ${motor.cajas}` : ""}</span>
                      <span className={`eq-serie${motor.numero_serie ? "" : " is-vacia"}`}>{motor.numero_serie || "sin número"}</span>
                      <EstadoChip estado={motor.estado} />
                      <GestionarButton onClick={() => setEquipoGestion(motor)} />
                    </li>
                  ))}
                </Lista>
              )}
              {(gruposReservados.length > 0 || !filtrando) && (
                <Lista titulo="Grupos reservados para barco" icono={Zap} vacio="No hay grupos reservados.">
                  {gruposReservados.map((grupo) => (
                    <li key={grupo.id} className="eq-fila">
                      <span className="eq-fila-codigo">{grupo.obra}</span>
                      <span className="eq-fila-texto">{nombreGrupo(grupo)} · {grupo.proveedor}</span>
                      <span className={`eq-serie${grupo.numero_serie ? "" : " is-vacia"}`}>{grupo.numero_serie || "sin número"}</span>
                      <EstadoChip estado={grupo.estado} />
                      <GestionarButton onClick={() => setEquipoGestion(grupo)} />
                    </li>
                  ))}
                </Lista>
              )}
              {(gruposLibres.length > 0 || !filtrando) && (
                <Lista titulo="Grupos libres en galpón" icono={Zap} vacio="No hay grupos libres en el galpón.">
                  {gruposLibres.map((grupo) => (
                    <li key={grupo.id} className="eq-fila">
                      <span className="eq-fila-codigo is-libre">Stock</span>
                      <span className="eq-fila-texto">{nombreGrupo(grupo)} · {grupo.proveedor}{grupo.obra_origen ? ` · volvió de ${grupo.obra_origen}` : ""}</span>
                      <span className={`eq-serie${grupo.numero_serie ? "" : " is-vacia"}`}>{grupo.numero_serie || "sin número"}</span>
                      <EstadoChip estado={grupo.estado} />
                      <GestionarButton onClick={() => setEquipoGestion(grupo)} />
                    </li>
                  ))}
                </Lista>
              )}
            </div>
          ) : vacio
        )}

        {pestana === "entregados" && (
          filtrados.entregados.length ? (
            <div className="eq-listas">
              {agruparPorLinea(filtrados.entregados).map((grupoLinea) => (
                <Lista key={grupoLinea.linea} titulo={grupoLinea.linea} icono={Ship} cuenta={grupoLinea.barcos.length}>
                  {grupoLinea.barcos.map((barco) => <FilaEntregado key={barco.codigo} barco={barco} foco={foco} onGestionar={setEquipoGestion} />)}
                </Lista>
              ))}
            </div>
          ) : vacio
        )}

        {pestana === "movimientos" && (
          filtrados.movimientos.length ? (
            <ol className="eq-historia">
              {filtrados.movimientos.map((movimiento, i) => (
                <li key={`${movimiento.grupo.id}-${movimiento.desde}-${movimiento.hacia}`} style={{ "--i": Math.min(i, 20) }}>
                  <span className="eq-historia-fecha">{formatearFecha(movimiento.fecha) || "sin fecha"}</span>
                  <span className="eq-historia-mov">
                    <strong>{movimiento.desde || (movimiento.tipo === "retiro" ? "Proveedor" : "Stock")}</strong>
                    <ArrowRight size={14} />
                    <strong>{movimiento.hacia || (movimiento.estado_nuevo === "comprado" ? "Proveedor" : "Stock")}</strong>
                  </span>
                  <span className="eq-historia-equipo">
                    {movimiento.grupo.tipo === "motor" ? nombreMotor(movimiento.grupo) : nombreGrupo(movimiento.grupo)}
                    {movimiento.grupo.proveedor ? ` · ${movimiento.grupo.proveedor}` : ""}
                    {movimiento.nota ? ` · ${movimiento.nota}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          ) : vacio
        )}
      </main>
      {cargandoEquipo && <EquipoModal obras={(base?.obras || []).filter((obra) => obra.estado === "activa")} onCerrar={() => setCargandoEquipo(false)} onGuardar={guardarEquipo} />}
      {equipoGestion && (
        <GestionEquipoModal
          equipo={equipoGestion}
          obras={(base?.obras || []).filter((obra) => obra.estado === "activa")}
          onCerrar={() => setEquipoGestion(null)}
          onMover={moverEquipo}
          onEliminar={eliminarEquipo}
        />
      )}
    </div>
  );
}

const ESTADOS_FORM = {
  motor: [
    ["pedido", "Pedido al proveedor"],
    ["comprado", "En proveedor · a retirar"],
    ["en_galpon", "En galpón · libre"],
    ["asignado", "Reservado para barco"],
    ["instalado", "Instalado"],
  ],
  generador: [
    ["comprado", "En proveedor · a retirar"],
    ["en_galpon", "En galpón · libre"],
    ["asignado", "Reservado para barco"],
    ["instalado", "Instalado"],
  ],
};

function EquipoModal({ obras = [], onCerrar, onGuardar }) {
  const [draft, setDraft] = useState({
    tipo: "motor", marca: "", modelo: "", potencia: "", transmision: "", numero_serie: "",
    proveedor: "", obra_codigo: "", posicion: "", estado: "en_galpon", fecha: "", notas: "", urgente: false,
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
  // si se elige "stock en galpón", se limpia el barco. Así no se puede guardar
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
    estado: tipo === "motor" ? "en_galpon" : "comprado",
    transmision: tipo === "motor" ? actual.transmision : "",
    posicion: tipo === "motor" ? actual.posicion : "",
  }));
  const fechaLabel = draft.estado === "comprado" ? "Fecha de compra" : draft.estado === "pedido" ? "Recepción estimada" : "Fecha de ingreso";

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
    const obra = obras.find((item) => claveObra(item.codigo) === claveObra(draft.obra_codigo));
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

  return (
    <div className="eq-modal-fondo" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget && !guardando) onCerrar(); }}>
      <section className="eq-modal" role="dialog" aria-modal="true" aria-labelledby="eq-modal-titulo">
        <header className="eq-modal-cabeza">
          <div>
            <span className="eq-modal-eyebrow">Nuevo registro</span>
            <h2 id="eq-modal-titulo">Cargar equipo</h2>
            <p>Registrá el equipo desde la compra hasta su instalación.</p>
          </div>
          <button type="button" className="eq-modal-cerrar" onClick={onCerrar} disabled={guardando} aria-label="Cerrar"><X size={18} /></button>
        </header>

        <form onSubmit={enviar} className="eq-form">
          <div className="eq-tipo" role="group" aria-label="Tipo de equipo">
            <button type="button" className={draft.tipo === "motor" ? "is-activo" : ""} onClick={() => cambiarTipo("motor")}><Cog size={15} /> Motor</button>
            <button type="button" className={draft.tipo === "generador" ? "is-activo" : ""} onClick={() => cambiarTipo("generador")}><Zap size={15} /> Grupo electrógeno</button>
          </div>

          <div className="eq-form-grid">
            <label className="eq-campo"><span>Estado</span><select className="ui-input" value={draft.estado} onChange={(e) => cambiarEstado(e.target.value)}>{ESTADOS_FORM[draft.tipo].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="eq-campo"><span>{fechaLabel}</span><input className="ui-input" type="date" value={draft.fecha} onChange={(e) => cambiar("fecha", e.target.value)} /></label>
            <label className="eq-campo"><span>Marca *</span><input className="ui-input" autoFocus value={draft.marca} onChange={(e) => cambiar("marca", e.target.value)} placeholder={draft.tipo === "motor" ? "FPT Iveco, Volvo, Mercury…" : "Kohler, Onan, Sleeper…"} /></label>
            <label className="eq-campo"><span>Modelo *</span><input className="ui-input" value={draft.modelo} onChange={(e) => cambiar("modelo", e.target.value)} placeholder={draft.tipo === "motor" ? "570 Angular" : "9 kVA"} /></label>
            <label className="eq-campo"><span>{draft.tipo === "motor" ? "Potencia (HP)" : "Potencia (kVA)"}</span><input className="ui-input" type="number" step="0.1" value={draft.potencia} onChange={(e) => cambiar("potencia", e.target.value)} /></label>
            <label className="eq-campo"><span>Número de serie</span><input className="ui-input" value={draft.numero_serie} onChange={(e) => cambiar("numero_serie", e.target.value)} placeholder="Se puede completar después" /></label>
            <label className="eq-campo"><span>Proveedor</span><input className="ui-input" value={draft.proveedor} onChange={(e) => cambiar("proveedor", e.target.value)} placeholder="Proveedor o compra del cliente" /></label>
            <label className="eq-campo">
              <span>Barco</span>
              <input
                className="ui-input"
                list="eq-obras-activas"
                value={draft.obra_codigo}
                onChange={(e) => cambiarObra(e.target.value)}
                placeholder="Ej. 52-25"
              />
              <datalist id="eq-obras-activas">
                {obras.map((obra) => <option key={obra.id} value={obra.codigo} />)}
              </datalist>
              <small className="eq-campo-ayuda">Con barco queda reservado; sin barco, libre en galpón.</small>
            </label>
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

function Kpi({ tono, valor, titulo, detalle }) {
  return (
    <div className="eq-kpi" style={{ "--c": TONOS[tono] }}>
      <span className="eq-kpi-valor"><AnimatedNumber value={valor} /></span>
      <span className="eq-kpi-titulo">{titulo}</span>
      <span className="eq-kpi-detalle">{detalle}</span>
    </div>
  );
}

function UltimosGrupos({ grupos, onVerTodos }) {
  return (
    <section className="eq-ultimos" aria-label="Últimos grupos entregados">
      <header className="eq-ultimos-cabeza">
        <div>
          <span className="eq-ultimos-eyebrow">Referencia rápida</span>
          <h2>Qué grupo llevaron las últimas embarcaciones</h2>
        </div>
        <button type="button" className="eq-ultimos-ver" onClick={onVerTodos}>Ver entregados <ArrowRight size={14} /></button>
      </header>
      <div className="eq-ultimos-lista">
        {grupos.map((grupo) => (
          <article key={`${grupo.id}-${grupo.obra}`} className="eq-ultimo">
            <span className="eq-ultimo-barco">{grupo.obra}</span>
            <span className="eq-ultimo-equipo"><Zap size={13} /> {nombreGrupo(grupo)}</span>
            <span className="eq-ultimo-meta">{grupo.proveedor || "Proveedor pendiente"} · {formatearFecha(grupo.fecha_entrega)}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function Lista({ titulo, icono, cuenta, vacio, children }) {
  const Icono = icono;
  const items = Array.isArray(children) ? children : [children];
  const hay = items.flat().filter(Boolean).length > 0;
  return (
    <section className="eq-lista">
      <header>
        <Icono size={15} />
        <h3>{titulo}</h3>
        <span>{cuenta ?? items.flat().filter(Boolean).length}</span>
      </header>
      {hay ? <ul>{children}</ul> : <p className="eq-lista-vacia">{vacio}</p>}
    </section>
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

function GestionarButton({ onClick, compacto = false }) {
  return (
    <button type="button" className={`eq-gestionar${compacto ? " is-compacto" : ""}`} onClick={onClick} title="Mover o corregir equipo" aria-label="Gestionar equipo">
      <ArrowRightLeft size={14} /> {!compacto && <span>Gestionar</span>}
    </button>
  );
}

function GestionEquipoModal({ equipo, obras, onCerrar, onMover, onEliminar }) {
  const [estado, setEstado] = useState(equipo.estado === "baja" ? "en_galpon" : equipo.estado);
  const [obraCodigo, setObraCodigo] = useState(equipo.obra || "");
  const [numeroSerie, setNumeroSerie] = useState(equipo.numero_serie || "");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmarBaja, setConfirmarBaja] = useState(false);
  const [error, setError] = useState("");
  const necesitaBarco = estado === "asignado" || estado === "instalado" || estado === "entregado";
  const nombre = equipo.tipo === "motor" ? nombreMotor(equipo) : nombreGrupo(equipo);

  useEffect(() => {
    const cerrar = (evento) => { if (evento.key === "Escape" && !guardando) onCerrar(); };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [guardando, onCerrar]);

  const cambiarEstado = (siguiente) => {
    setEstado(siguiente);
    if (!["asignado", "instalado", "entregado"].includes(siguiente)) setObraCodigo("");
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
      const obra = obras.find((item) => item.codigo === obraCodigo);
      await onMover(equipo, { estado, obraId: obra?.id || null, obraCodigo: obraCodigo || null, numeroSerie, nota });
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
            <p>{equipo.obra ? `${ESTADOS[equipo.estado]?.label || "Asignado"} · ${equipo.obra}` : ESTADOS[equipo.estado]?.label || "Sin destino"}{equipo.numero_serie ? ` · Serie ${equipo.numero_serie}` : ""}</p>
          </div>
          <button type="button" className="eq-modal-cerrar" onClick={onCerrar} disabled={guardando} aria-label="Cerrar"><X size={18} /></button>
        </header>

        <form className="eq-form" onSubmit={guardar}>
          <div className="eq-destinos" role="group" aria-label="Nuevo destino">
            <button type="button" className={estado === "comprado" ? "is-activo" : ""} onClick={() => cambiarEstado("comprado")}><PackageOpen size={15} /><span><strong>En proveedor</strong><small>Comprado, falta retirarlo</small></span></button>
            <button type="button" className={estado === "pedido" ? "is-activo" : ""} onClick={() => cambiarEstado("pedido")}><History size={15} /><span><strong>Pedido</strong><small>Sin entrega del proveedor</small></span></button>
            <button type="button" className={estado === "en_galpon" ? "is-activo" : ""} onClick={() => cambiarEstado("en_galpon")}><Warehouse size={15} /><span><strong>En galpón · libre</strong><small>Sin asignar</small></span></button>
            <button type="button" className={estado === "asignado" ? "is-activo" : ""} onClick={() => cambiarEstado("asignado")}><Ship size={15} /><span><strong>Reservado para barco</strong><small>En el galpón, destinado a un barco</small></span></button>
            <button type="button" className={estado === "instalado" ? "is-activo" : ""} onClick={() => cambiarEstado("instalado")}><Cog size={15} /><span><strong>Instalado</strong><small>Montado en el barco</small></span></button>
            <button type="button" className={estado === "entregado" ? "is-activo" : ""} onClick={() => cambiarEstado("entregado")}><PackageCheck size={15} /><span><strong>Entregado</strong><small>Sale de producción</small></span></button>
          </div>

          {necesitaBarco && (
            <label className="eq-campo">
              <span>Barco de destino *</span>
              <select className="ui-input" value={obraCodigo} onChange={(evento) => setObraCodigo(evento.target.value)}>
                <option value="">Elegir barco…</option>
                {equipo.obra && !obras.some((obra) => obra.codigo === equipo.obra) && <option value={equipo.obra}>{equipo.obra}</option>}
                {obras.map((obra) => <option key={obra.id} value={obra.codigo}>{obra.codigo}</option>)}
              </select>
            </label>
          )}
          <label className="eq-campo">
            <span>Número de serie</span>
            <input className="ui-input" value={numeroSerie} onChange={(evento) => setNumeroSerie(evento.target.value)} placeholder="Cargar al recibir el equipo" autoComplete="off" />
            <small className="eq-campo-ayuda">Se puede completar o corregir ahora, junto con el estado y el barco.</small>
          </label>
          <label className="eq-campo"><span>Motivo o referencia</span><textarea className="ui-input eq-textarea" value={nota} onChange={(evento) => setNota(evento.target.value)} placeholder="Ej. Se reasigna al 52-26 por cambio de configuración…" /></label>
          {error && <p className="eq-form-error" role="alert">{error}</p>}

          <footer className="eq-modal-pie eq-modal-pie-gestion">
            <button type="button" className={`eq-btn-baja${confirmarBaja ? " is-confirmando" : ""}`} onClick={eliminar} disabled={guardando}>
              <Trash2 size={14} /> {confirmarBaja ? "Confirmar eliminación" : "Eliminar registro erróneo"}
            </button>
            <button type="button" className="ui-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
            <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
          </footer>
          {confirmarBaja && (
            <p className="eq-eliminar-aviso" role="alert">
              Se quitará {nombre} de las vistas{equipo.numero_serie ? ` y se liberará la serie ${equipo.numero_serie}` : ""}. La corrección quedará registrada.
              <button type="button" onClick={() => setConfirmarBaja(false)} disabled={guardando}>Volver</button>
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

function FilaEntregado({ barco, foco, onGestionar }) {
  const cajas = barco.motores.find((motor) => motor.cajas)?.cajas;
  const motor = barco.motores[0] ? nombreMotor(barco.motores[0]) : barco.memoria?.motores;
  return (
    <li className="eq-fila eq-fila-entregado">
      <span className="eq-fila-codigo">{barco.codigo}</span>
      <span className="eq-fila-texto">
        <span className={`eq-fila-linea${foco.motores ? " is-foco" : ""}`}>
          {motor || "Motorización pendiente"}{cajas ? ` · ${cajas}` : ""}
        </span>
        {barco.grupos?.length ? barco.grupos.map((grupo) => (
          <span key={grupo.id} className={`eq-fila-linea eq-fila-grupo${foco.grupo ? " is-foco" : ""}`}>
            <Zap size={12} aria-hidden="true" />
            <span className="eq-entregado-grupo-texto">{nombreGrupo(grupo)}{grupo.numero_serie ? ` · serie ${grupo.numero_serie}` : ""}{grupo.proveedor ? ` · ${grupo.proveedor}` : ""}</span>
            <GestionarButton compacto onClick={() => onGestionar(grupo)} />
          </span>
        )) : (
          <span className="eq-fila-linea eq-fila-grupo"><Zap size={12} aria-hidden="true" />Grupo pendiente</span>
        )}
      </span>
      <span className="eq-series">
        {barco.motores.length
          ? barco.motores.map((m) => <span key={m.id} className="eq-serie-accion"><span className="eq-serie">{m.numero_serie || "—"}</span><GestionarButton compacto onClick={() => onGestionar(m)} /></span>)
          : <span className="eq-serie is-vacia">sin número</span>}
      </span>
    </li>
  );
}

function TarjetaBarco({ barco, indice, foco, onGestionar }) {
  const [resaltado, setResaltado] = useState(null);
  const motores = barco.motores;
  const claseMotor = `eq-renglon${foco.motores ? " is-foco" : ""}`;
  return (
    <article className={`eq-barco${barco.urgente ? " is-urgente" : ""}${barco.sinDatos ? " is-sin-datos" : ""}`} style={{ "--i": Math.min(indice, 16) }}>
      <PlantaBarco motores={motores.slice(0, 2)} grupo={barco.grupo} resaltado={resaltado} />
      <div className="eq-barco-cuerpo">
        <header className="eq-barco-cabeza">
          <h3>{barco.codigo}</h3>
          <span className="eq-barco-linea">{barco.linea}</span>
          {barco.faltan > 0 && (
            <span className="eq-estado" style={{ "--c": barco.urgente ? TONOS.rojo : TONOS.violeta }}>
              {barco.urgente ? "Urgente" : "Recepción pendiente"}{barco.fechaEstimada ? ` · ${barco.fechaEstimada}` : ""}
            </span>
          )}
        </header>

        {barco.sinDatos && barco.memoria?.motores ? (
          <div className={claseMotor} onMouseEnter={() => setResaltado("motores")} onMouseLeave={() => setResaltado(null)}>
            <Cog size={14} />
            <span className="eq-renglon-texto">
              {barco.memoria.motores}
              <span className="eq-renglon-extra">Definido en la ficha técnica · pendiente de identificación</span>
            </span>
            <span className="eq-estado" style={{ "--c": TONOS.neutro }}>Sin registrar</span>
          </div>
        ) : barco.sinDatos ? (
          <p className="eq-sin-datos">Motorización pendiente de definir.</p>
        ) : (
          motores.map((motor, i) => (
            <div key={motor.id} className={claseMotor} onMouseEnter={() => setResaltado(i)} onMouseLeave={() => setResaltado(null)}>
              <Cog size={14} />
              <span className="eq-renglon-texto">
                {nombreMotor(motor)}
                <span className={`eq-serie${motor.numero_serie ? "" : " is-vacia"}`}>{motor.numero_serie || "sin número"}</span>
              </span>
              <EstadoChip estado={motor.estado} urgente={motor.urgente} />
              <GestionarButton compacto onClick={() => onGestionar(motor)} />
            </div>
          ))
        )}

        {barco.grupos?.length ? barco.grupos.map((grupo) => (
          <div key={grupo.id} className={`eq-renglon${foco.grupo ? " is-foco" : ""}`} onMouseEnter={() => setResaltado("grupo")} onMouseLeave={() => setResaltado(null)}>
            <Zap size={14} />
            <span className="eq-renglon-texto">
              {nombreGrupo(grupo)}
              <span className="eq-renglon-extra">
                {grupo.proveedor}
                {grupo.numero_serie ? ` · serie ${grupo.numero_serie}` : ""}
                {grupo.fecha_entrega ? ` · ${formatearFecha(grupo.fecha_entrega)}` : ""}
                {grupo.obra_origen && grupo.obra_origen !== barco.codigo ? ` · vino de ${grupo.obra_origen}` : ""}
                {grupo.compra_cliente ? " · compra del cliente" : ""}
              </span>
            </span>
            <EstadoChip estado={grupo.estado} />
            <GestionarButton compacto onClick={() => onGestionar(grupo)} />
          </div>
        )) : (
          <div className={`eq-renglon${foco.grupo ? " is-foco" : ""}`} onMouseEnter={() => setResaltado("grupo")} onMouseLeave={() => setResaltado(null)}>
            <Zap size={14} />
            {barco.memoria?.grupo ? (
              <>
                <span className="eq-renglon-texto">
                  {barco.memoria.grupo}
                  <span className="eq-renglon-extra">Definido en la ficha técnica · pendiente de registrar</span>
                </span>
                <span className="eq-estado" style={{ "--c": TONOS.neutro }}>Sin registrar</span>
              </>
            ) : (
              <span className="eq-renglon-texto is-vacio">Grupo pendiente de definir</span>
            )}
          </div>
        )}

        {barco.marcaDistinta && (
          <p className="eq-nota is-alerta">Revisar motorización: la ficha técnica indica «{barco.memoria.motores}».</p>
        )}
        {motores.some((m) => m.cajas) && (
          <p className="eq-nota">Cajas: {[...new Set(motores.map((m) => m.cajas).filter(Boolean))].join(" · ")}</p>
        )}
      </div>
    </article>
  );
}

// La sala de máquinas vista desde arriba: el casco (proa arriba), los motores
// atrás y el grupo adelante de ellos, cada uno con el color de su estado.
function PlantaBarco({ motores, grupo, resaltado }) {
  const doble = motores.length !== 1;
  const posiciones = doble ? [30, 66] : [48];
  const estadoGrupo = grupo?.estado || "sin_dato";
  return (
    <svg className="pb" viewBox="0 0 120 220" aria-hidden="true">
      <path className="pb-casco" pathLength="1" d="M60,8 C84,38 100,84 101,136 L99,204 Q60,214 21,204 L19,136 C20,84 36,38 60,8 Z" />
      <path className="pb-cubierta" pathLength="1" d="M60,24 C77,47 89,86 90,134 L89,195 Q60,203 31,195 L30,134 C31,86 43,47 60,24 Z" />
      <path className="pb-mamparo" pathLength="1" d="M26,134 L94,134" />
      <g className={`pb-eq${resaltado === "grupo" ? " is-resaltado" : ""}`} data-estado={estadoGrupo} style={{ "--d": ".7s" }}>
        <rect x="45" y="110" width="30" height="16" rx="4" />
        <path d="M51,118 L55,114 L55,122 L59,118" className="pb-rayo" />
      </g>
      {posiciones.map((x, i) => {
        const motor = motores[i];
        const estado = motor ? motor.estado : "sin_dato";
        const activo = resaltado === i || resaltado === "motores";
        return (
          <g key={x} className={`pb-eq${activo ? " is-resaltado" : ""}`} data-estado={estado} data-urgente={motor?.urgente ? "true" : undefined} style={{ "--d": `${0.85 + i * 0.12}s` }}>
            <rect x={x} y="144" width="24" height="40" rx="5" />
            <path d={`M${x + 5},152 H${x + 19} M${x + 5},159 H${x + 19} M${x + 5},166 H${x + 19}`} className="pb-cilindros" />
            <path d={`M${x + 12},184 V206`} className="pb-eje" />
          </g>
        );
      })}
    </svg>
  );
}

const CSS = `
  .eq {
    position: absolute; top: 0; right: 0; bottom: 0; left: 0;
    overflow-y: auto; overflow-x: hidden;
    color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
  }
  .eq-pestana-cuenta { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--dim); }
  .eq-cuerpo { max-width: 1440px; margin: 0 auto; padding: 16px 28px 40px; }
  .eq-mensaje {
    display: flex; align-items: center; gap: 10px; margin: 0 0 12px; padding: 9px 12px;
    border: 1px solid var(--green-border); border-radius: 10px; background: var(--green-soft); color: var(--green); font-size: 13px; font-weight: 550;
  }
  .eq-mensaje button { margin-left: auto; display: grid; place-items: center; padding: 2px; border: 0; background: transparent; color: inherit; cursor: pointer; }
  .eq-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .eq-kpi {
    position: relative; overflow: hidden; display: grid; gap: 3px; padding: 14px 16px 14px 18px;
    border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); box-shadow: var(--elev-1);
  }
  .eq-kpi::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: var(--c); }
  .eq-kpi-valor { font-family: 'JetBrains Mono', monospace; font-size: 26px; font-weight: 600; line-height: 1.1; color: var(--c); }
  .eq-kpi-titulo { font-size: 13.5px; font-weight: 600; }
  .eq-kpi-detalle { font-size: 12.5px; color: var(--dim); }

  /* ── Últimas embarcaciones ── */
  .eq-ultimos {
    margin-top: 12px; padding: 12px 14px 14px; border: 1px solid var(--border);
    border-radius: 14px; background: var(--panel-solid); box-shadow: var(--elev-1);
  }
  .eq-ultimos-cabeza { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
  .eq-ultimos-eyebrow { display: block; margin-bottom: 2px; color: var(--dim); font-size: 10.5px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; }
  .eq-ultimos h2 { margin: 0; font-size: 14px; font-weight: 650; }
  .eq-ultimos-ver {
    display: inline-flex; align-items: center; gap: 5px; padding: 4px 0; border: 0; background: transparent;
    color: var(--blue); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
  }
  .eq-ultimos-ver:hover { text-decoration: underline; text-underline-offset: 3px; }
  .eq-ultimos-lista { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
  .eq-ultimo { min-width: 0; display: grid; gap: 2px; padding: 9px 10px; border-radius: 10px; background: var(--panel); }
  .eq-ultimo-barco { font-family: 'JetBrains Mono', monospace; font-size: 13.5px; font-weight: 650; color: var(--text); }
  .eq-ultimo-equipo { min-width: 0; display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 12.5px; font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .eq-ultimo-equipo svg { flex-shrink: 0; color: var(--violet); }
  .eq-ultimo-meta { color: var(--dim); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── Búsqueda y filtros ── */
  .eq-filtros { display: flex; align-items: center; gap: 10px; margin: 16px 0 10px; }
  .eq-buscar { position: relative; flex: 1 1 auto; min-width: 0; max-width: 520px; }
  .eq-buscar svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
  .eq-buscar .ui-input { padding-left: 36px; }
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
    font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: filter .15s;
  }
  .eq-activo:hover { filter: brightness(1.12); }
  .eq-activo.no-aplica { border-color: var(--border-2); background: transparent; color: var(--dim); font-weight: 500; }
  .eq-activo.no-aplica { text-decoration: line-through; text-decoration-color: var(--subtle); }
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
  .eq-seccion h3 {
    margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim);
  }
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
  .eq-opcion:focus-visible, .eq-activo:focus-visible, .eq-limpiar:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
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

  /* ── Tarjetas por barco ── */
  .eq-barcos { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
  .eq-barco {
    display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 14px; align-items: start;
    padding: 14px 14px 12px 10px; border: 1px solid var(--border); border-radius: 16px;
    background: var(--panel-solid); box-shadow: var(--elev-1);
    animation: eq-sube .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i) * 35ms);
    transition: border-color .15s;
  }
  .eq-barco:hover { border-color: var(--border-2); }
  .eq-barco.is-urgente { border-color: var(--red-border); }
  .eq-barco.is-sin-datos { background: var(--panel); box-shadow: none; }
  .eq-barco-cuerpo { min-width: 0; display: grid; gap: 7px; }
  .eq-barco-cabeza { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 2px; }
  .eq-barco-cabeza h3 { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 600; letter-spacing: -.02em; }
  .eq-barco-linea { font-size: 12px; color: var(--dim); }
  .eq-renglon {
    display: grid; grid-template-columns: 16px minmax(0, 1fr) auto 28px; align-items: center; gap: 8px;
    padding: 7px 8px; border-radius: 10px; background: var(--panel); font-size: 13px;
    transition: background-color .15s, box-shadow .15s;
  }
  .eq-renglon:hover { background: var(--panel-2); }
  .eq-renglon.is-foco { background: var(--blue-soft); box-shadow: inset 0 0 0 1px var(--blue-border); }
  .eq-renglon > svg { color: var(--dim); }
  .eq-renglon-texto { min-width: 0; display: grid; gap: 1px; font-weight: 500; }
  .eq-renglon-texto.is-vacio { color: var(--subtle); font-weight: 400; }
  .eq-renglon-extra { font-size: 12px; color: var(--dim); font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .eq-sin-datos { margin: 0; font-size: 12.5px; color: var(--dim); line-height: 1.45; }
  .eq-nota { margin: 0; font-size: 12px; color: var(--violet); }
  .eq-nota.is-alerta { color: var(--red); }

  /* ── Planta del barco ── */
  .pb { width: 84px; height: auto; display: block; overflow: visible; }
  .pb-casco { fill: color-mix(in srgb, var(--panel-2) 70%, transparent); stroke: color-mix(in srgb, var(--text) 55%, transparent); stroke-width: 2;
    stroke-dasharray: 1; stroke-dashoffset: 1; animation: pb-dibujar 1s cubic-bezier(.65,0,.35,1) forwards; }
  .pb-cubierta, .pb-mamparo { fill: none; stroke: color-mix(in srgb, var(--text) 25%, transparent); stroke-width: 1.2;
    stroke-dasharray: 1; stroke-dashoffset: 1; animation: pb-dibujar 1s cubic-bezier(.65,0,.35,1) .25s forwards; }
  .pb-eq { opacity: 0; animation: pb-aparecer .4s ease var(--d) forwards; transition: filter .15s; }
  .pb-eq rect { fill: var(--pb-fondo, transparent); stroke: var(--pb-borde, var(--border-3)); stroke-width: 2; }
  .pb-cilindros, .pb-rayo { fill: none; stroke: var(--pb-borde, var(--border-3)); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; opacity: .8; }
  .pb-eje { stroke: color-mix(in srgb, var(--text) 35%, transparent); stroke-width: 2; stroke-linecap: round; }
  .pb-eq[data-estado="instalado"] { --pb-fondo: var(--green-soft); --pb-borde: var(--green); }
  .pb-eq[data-estado="asignado"] { --pb-fondo: var(--cyan-soft); --pb-borde: var(--cyan); }
  .pb-eq[data-estado="en_galpon"] { --pb-fondo: var(--blue-soft); --pb-borde: var(--blue); }
  .pb-eq[data-estado="comprado"] rect { stroke-dasharray: 4 3; }
  .pb-eq[data-estado="comprado"] { --pb-fondo: transparent; --pb-borde: var(--violet); }
  .pb-eq[data-estado="pedido"] rect { stroke-dasharray: 4 3; }
  .pb-eq[data-estado="pedido"] { --pb-fondo: transparent; --pb-borde: var(--violet); }
  .pb-eq[data-urgente="true"] { --pb-borde: var(--red); }
  .pb-eq[data-estado="sin_dato"] rect { stroke-dasharray: 2 3; }
  .pb-eq[data-estado="sin_dato"] { --pb-fondo: transparent; --pb-borde: var(--border-3); }
  .pb-eq.is-resaltado { filter: drop-shadow(0 0 6px var(--pb-borde)); }

  /* ── Listas ── */
  .eq-listas { display: grid; gap: 14px; }
  .eq-lista { border: 1px solid var(--border); border-radius: 16px; background: var(--panel-solid); box-shadow: var(--elev-1); overflow: hidden; }
  .eq-lista header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .eq-lista header svg { color: var(--dim); }
  .eq-lista header h3 { margin: 0; font-size: 14.5px; font-weight: 650; }
  .eq-lista header span { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: var(--dim); }
  .eq-lista ul { list-style: none; margin: 0; padding: 4px 0; }
  .eq-lista-vacia { margin: 0; padding: 16px; font-size: 13px; color: var(--dim); }
  .eq-fila {
    display: grid; grid-template-columns: 76px minmax(0, 1fr) auto auto auto; align-items: center; gap: 12px;
    padding: 9px 16px; border-bottom: 1px solid var(--border); font-size: 13px;
  }
  .eq-fila:last-child { border-bottom: 0; }
  .eq-fila-entregado { grid-template-columns: 76px minmax(0, 1fr) auto; }
  .eq-fila-codigo { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
  .eq-fila-codigo.is-libre { color: var(--blue); }
  .eq-fila-texto { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .eq-fila-dos-lineas { display: grid; gap: 1px; white-space: normal; }
  .eq-fila-dos-lineas strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-size: 13px; font-weight: 550; }
  .eq-fila-dos-lineas small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dim); font-size: 11.5px; }
  .eq-fila-entregado .eq-fila-texto { display: grid; gap: 2px; }
  .eq-fila-linea { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 6px; }
  .eq-fila-grupo { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--dim); }
  .eq-fila-grupo svg { flex-shrink: 0; }
  .eq-entregado-grupo-texto { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .eq-fila-grupo .eq-gestionar { flex: 0 0 auto; margin-left: 4px; }
  .eq-fila-linea.is-foco { color: var(--blue); }
  .eq-series { display: flex; flex-wrap: wrap; gap: 8px 12px; }
  .eq-serie-accion { display: inline-flex; align-items: center; gap: 4px; }
  .eq-gestionar {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 28px; padding: 0 8px;
    border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--dim); cursor: pointer;
    font: inherit; font-size: 11.5px; font-weight: 600;
    transition: border-color .15s, background-color .15s, color .15s, transform .15s;
  }
  .eq-gestionar.is-compacto { width: 28px; padding: 0; }
  .eq-gestionar:hover { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); transform: translateY(-1px); }

  .eq-historia { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .eq-historia li {
    display: grid; grid-template-columns: 84px auto minmax(0, 1fr); align-items: center; gap: 14px;
    padding: 10px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid);
    font-size: 13px; animation: eq-sube .4s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i) * 25ms);
  }
  .eq-historia-fecha { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: var(--dim); }
  .eq-historia-mov { display: inline-flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; }
  .eq-historia-mov svg { color: var(--violet); }
  .eq-historia-mov strong { font-weight: 600; }
  .eq-historia-equipo { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .eq-vacio { display: grid; justify-items: center; gap: 10px; padding: 40px 20px; color: var(--dim); font-size: 13px; }

  /* ── Carga de equipo ── */
  .eq-modal-fondo {
    position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px;
    background: color-mix(in srgb, #02050a 72%, transparent); backdrop-filter: blur(6px);
    animation: eq-fondo .18s ease both;
  }
  .eq-modal {
    width: min(720px, 100%); max-height: min(820px, calc(100vh - 48px)); overflow: auto;
    border: 1px solid var(--border-2); border-radius: 18px; background: var(--panel-solid); box-shadow: var(--elev-3);
    animation: eq-modal-entra .25s cubic-bezier(.22,1,.36,1) both;
  }
  .eq-modal-cabeza { display: flex; align-items: flex-start; gap: 16px; padding: 18px 20px 15px; border-bottom: 1px solid var(--border); }
  .eq-modal-cabeza > div { min-width: 0; }
  .eq-modal-eyebrow { display: block; margin-bottom: 3px; color: var(--blue); font-size: 10.5px; font-weight: 650; letter-spacing: .11em; text-transform: uppercase; }
  .eq-modal-cabeza h2 { margin: 0; font-size: 20px; font-weight: 650; }
  .eq-modal-cabeza p { margin: 3px 0 0; color: var(--dim); font-size: 12.5px; }
  .eq-modal-cerrar { margin-left: auto; flex: 0 0 auto; display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); color: var(--muted); cursor: pointer; }
  .eq-form { display: grid; gap: 15px; padding: 18px 20px 20px; }
  .eq-tipo { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .eq-tipo button { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel); color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .eq-tipo button.is-activo { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); }
  .eq-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .eq-campo { min-width: 0; display: grid; gap: 6px; }
  .eq-campo-ayuda { font-size: 11.5px; line-height: 1.4; color: var(--dim); }
  .eq-campo > span { color: var(--muted); font-size: 11.5px; font-weight: 600; }
  .eq-campo .ui-input { width: 100%; }
  .eq-textarea { min-height: 74px; padding-top: 10px; resize: vertical; }
  .eq-check { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12.5px; cursor: pointer; }
  .eq-form-error { margin: 0; padding: 9px 11px; border: 1px solid var(--red-border); border-radius: 9px; background: var(--red-soft); color: var(--red); font-size: 12.5px; }
  .eq-modal-pie { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }
  .eq-modal-gestion { width: min(680px, 100%); }
  .eq-destinos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .eq-destinos button {
    min-width: 0; display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 9px;
    padding: 10px 11px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); color: var(--muted);
    font: inherit; text-align: left; cursor: pointer;
  }
  .eq-destinos button > svg { color: var(--dim); }
  .eq-destinos button > span { min-width: 0; display: grid; gap: 1px; }
  .eq-destinos strong { color: var(--text); font-size: 12.5px; font-weight: 650; }
  .eq-destinos small { color: var(--dim); font-size: 11.5px; }
  .eq-destinos button.is-activo { border-color: var(--blue-border); background: var(--blue-soft); }
  .eq-destinos button.is-activo > svg, .eq-destinos button.is-activo strong { color: var(--blue); }
  .eq-modal-pie-gestion { align-items: center; }
  .eq-btn-baja {
    margin-right: auto; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 10px;
    border: 1px solid var(--red-border); border-radius: 9px; background: transparent; color: var(--red);
    font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .eq-btn-baja.is-confirmando { background: var(--red-soft); }
  .eq-eliminar-aviso { display: flex; align-items: center; gap: 10px; margin: -6px 0 0; padding: 10px 12px; border: 1px solid var(--red-border); border-radius: 9px; background: var(--red-soft); color: var(--text); font-size: 12px; }
  .eq-eliminar-aviso button { flex: 0 0 auto; margin-left: auto; padding: 4px 8px; border: 0; background: transparent; color: var(--red); font: inherit; font-weight: 650; cursor: pointer; }

  @keyframes eq-sube { from { opacity: 0; transform: translateY(10px); } }
  @keyframes eq-fondo { from { opacity: 0; } }
  @keyframes eq-modal-entra { from { opacity: 0; transform: translateY(14px) scale(.985); } }
  @keyframes pb-dibujar { to { stroke-dashoffset: 0; } }
  @keyframes pb-aparecer { to { opacity: 1; } }

  @media (prefers-reduced-motion: reduce) {
    .eq-panel { transition: none; }
  }

  @media (max-width: 899px) {
    .eq-cuerpo { padding: 12px 12px 32px; }
    .eq-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .eq-kpi { padding: 12px 12px 12px 15px; }
    .eq-kpi-valor { font-size: 22px; }
    .eq-ultimos { padding-inline: 12px; }
    .eq-ultimos-lista { display: flex; overflow-x: auto; margin-inline: -12px; padding: 0 12px 2px; scrollbar-width: none; }
    .eq-ultimos-lista::-webkit-scrollbar { display: none; }
    .eq-ultimo { flex: 0 0 190px; }
    .eq-buscar { max-width: none; }
    .eq-btn-filtros { min-height: 42px; }
    /* En el celular cada faceta es una fila que se desliza de costado: el
       panel no se hace eterno aunque haya 14 potencias de grupo. */
    .eq-panel-secciones { grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .eq-seccion { padding: 12px 0 14px; gap: 12px; }
    .eq-seccion h3, .eq-faceta-titulo { padding: 0 14px; }
    .eq-faceta-opciones { flex-wrap: nowrap; overflow-x: auto; padding: 0 14px 2px; scrollbar-width: none; }
    .eq-faceta-opciones::-webkit-scrollbar { display: none; }
    .eq-opcion { min-height: 38px; }
    .eq-panel-pie { flex-wrap: wrap; }
    .eq-panel-pie > span { flex-basis: 100%; }
    .eq-panel-pie .ui-btn-primario { flex: 1; justify-content: center; }
    .eq-barcos { grid-template-columns: minmax(0, 1fr); }
    .eq-barco { grid-template-columns: 64px minmax(0, 1fr); gap: 10px; }
    .pb { width: 64px; }
    .eq-fila { grid-template-columns: 64px minmax(0, 1fr) auto; }
    .eq-fila > .eq-estado { grid-column: 2; justify-self: start; }
    .eq-fila > .eq-gestionar { grid-column: 3; grid-row: 2; }
    .eq-fila-entregado { grid-template-columns: 64px minmax(0, 1fr); }
    .eq-fila-entregado .eq-series { grid-column: 2; }
    .eq-eliminar-aviso { flex-wrap: wrap; }
    .eq-historia li { grid-template-columns: 1fr; gap: 4px; }
    .eq-modal-fondo { align-items: end; padding: 0; }
    .eq-modal { width: 100%; max-height: 92vh; border-radius: 18px 18px 0 0; }
    .eq-form-grid { grid-template-columns: minmax(0, 1fr); }
    .eq-destinos { grid-template-columns: minmax(0, 1fr); }
    .eq-modal-pie-gestion { flex-wrap: wrap; }
    .eq-btn-baja { flex-basis: 100%; justify-content: center; margin-right: 0; }
  }
`;
