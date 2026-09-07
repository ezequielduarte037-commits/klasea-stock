import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Wallet,
  X,
} from "lucide-react";
import { C } from "@/theme";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import {
  agregarProveedorAMateriales,
  aplicarPrecioMaterial,
  fetchCatalogo,
  guardarProveedor,
  proveedoresDeMaterial,
  quitarProveedorMasivo,
} from "@/features/materiales/api";
import { descargarXlsx } from "@/features/compras/xlsx";
import { cuandoSeActualizo, dolarGuardado, fetchDolarOficial } from "@/lib/dolarOficial";
import {
  agruparFaltantes,
  aplicarPreciosRecuperados,
  fetchPreciosDeRemitos,
  MODELOS_BARCO,
  resumenDeModelo,
  SIN_PROVEEDOR,
} from "@/features/costos/costoBarcoApi";

/**
 * Cuánto sale el material de un barco.
 *
 * La pantalla contesta dos preguntas a la vez y esa es toda su razón de ser:
 * cuánto da la cuenta, y cuánto se le puede creer. Un total de materiales con
 * cincuenta precios faltantes no es un costo: es un piso. Por eso el número
 * grande nunca aparece solo — siempre con la cobertura al lado y con lo que
 * falta a un clic.
 *
 * La segunda mitad es la lista de trabajo, y está agrupada POR PROVEEDOR porque
 * es la única forma en que esto avanza de verdad: nadie completa precios
 * material por material, se le manda una lista a Iriarte y vuelven veinte
 * juntos. Arriba de todo van los que no hay que pedirle a nadie, porque el
 * precio ya entró con un remito y sólo falta pasarlo en limpio.
 */

const TABS = [
  { id: "costo", label: "Costo por rubro" },
  { id: "faltan", label: "Falta precio" },
];

function fmt(valor, moneda = "ARS") {
  const numero = Number(valor || 0);
  const signo = moneda === "USD" ? "US$" : "$";
  return `${signo} ${numero.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function pct(valor) {
  return `${Math.round((valor || 0) * 100)}%`;
}

/** Para buscar: sin tildes y en minúscula, así "resina" encuentra "Resina". */
function sinTildes(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Pone dos importes en la misma moneda para poder ordenarlos.
 *
 * NO es para mostrar: el número que sale de acá no se le enseña a nadie. Sirve
 * sólo para decidir qué renglón va arriba, y cuando no hay cotización usa un
 * valor de referencia para que un motor en dólares no quede debajo de un balde
 * de resina en pesos.
 */
function paraOrdenar(fila, tipoCambio) {
  return fila.moneda === "USD" ? fila.costo * (tipoCambio > 0 ? tipoCambio : 1000) : fila.costo;
}

const ESTADOS = {
  firme: { label: "al día", color: () => C.green, soft: () => C.greenL, borde: () => C.greenB },
  viejo: { label: "+6 meses", color: () => C.blue, soft: () => C.blueL, borde: () => C.blueB },
  recuperable: { label: "en un remito", color: () => C.violet, soft: () => C.violetL, borde: () => C.violetB },
  falta: { label: "sin precio", color: () => C.red, soft: () => C.redL, borde: () => C.redB },
};

function Chip({ children, color = C.dim, soft = C.panel2, border = C.border, title = "" }) {
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      border: `1px solid ${border}`, background: soft, color,
      borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

/**
 * El campo para escribir el precio de un material, en la misma fila.
 *
 * Guarda con Enter o al salir del campo, no con un botón: cuando llega la
 * respuesta de un proveedor hay veinte números para tipear seguidos y frenar a
 * apretar algo en cada uno hace que nadie lo haga. Tab pasa al siguiente.
 */
function CampoPrecio({ fila, grupo, cargado, ocupado, onGuardar }) {
  const [texto, setTexto] = useState("");
  const [moneda, setMoneda] = useState("ARS");

  if (cargado) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 6, color: C.green, fontSize: 12, fontWeight: 850 }}>
        <Check size={13} /> {fmt(cargado.precio, cargado.moneda)}
      </div>
    );
  }

  const guardar = () => { if (texto.trim()) onGuardar(fila, texto, moneda, grupo); };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
      <input
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        onBlur={guardar}
        onKeyDown={(evento) => { if (evento.key === "Enter") { evento.preventDefault(); evento.currentTarget.blur(); } }}
        disabled={ocupado}
        placeholder="precio"
        inputMode="decimal"
        aria-label={`Precio de ${fila.material.descripcion}`}
        style={{
          width: 92, border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text,
          borderRadius: 7, padding: "6px 8px", fontFamily: C.mono, fontSize: 12, outline: "none",
          textAlign: "right", boxSizing: "border-box",
        }}
      />
      <button
        type="button"
        onClick={() => setMoneda((actual) => (actual === "ARS" ? "USD" : "ARS"))}
        title="Cambiar moneda"
        style={{
          border: `1px solid ${moneda === "USD" ? C.blueB : C.border2}`,
          background: moneda === "USD" ? C.blueL : C.panel,
          color: moneda === "USD" ? C.blue : C.dim,
          borderRadius: 7, padding: "6px 7px", cursor: "pointer",
          fontFamily: C.mono, fontSize: 10.5, fontWeight: 900, minWidth: 38,
        }}
      >
        {moneda === "USD" ? "US$" : "$"}
      </button>
      {ocupado ? <LoaderCircle size={13} className="spin" style={{ color: C.dim }} /> : null}
    </div>
  );
}

/**
 * Los materiales de un rubro, del más caro al más barato.
 *
 * Es la pregunta que la tabla de rubros dejaba sin contestar. Saber que
 * Motorización es el 83% del barco no sirve de mucho: lo que hace falta es ver
 * que son dos motores, y que el resto del rubro junto no llega al 1%. Un barco
 * casi siempre son tres o cuatro renglones y una cola larga, y hasta que no se
 * ve así no se sabe dónde vale la pena pelear el precio.
 *
 * Los que no tienen precio quedan abajo -cuestan cero mientras nadie los
 * cotice- y marcados en rojo, para que no se lean como baratos.
 */
function DetalleRubro({ rubro, filas, tipoCambio, isMobile, onIrAFaltantes }) {
  const columnas = isMobile
    ? "minmax(0,1fr) 92px"
    : "minmax(0,2fr) 146px minmax(105px,.85fr) 40px";
  const ordenadas = [...filas].sort((a, b) => paraOrdenar(b, tipoCambio) - paraOrdenar(a, tipoCambio));
  // Sobre qué se calcula el porcentaje de cada renglón: el rubro, no el barco.
  // Dentro del desglose lo que importa es el peso relativo entre sus materiales.
  const base = rubro.ars + rubro.usd * (tipoCambio > 0 ? tipoCambio : 1000);

  return (
    <div style={{ background: C.panelSolid, borderTop: `1px solid ${C.border}` }}>
      {ordenadas.map((fila) => {
        const estado = ESTADOS[fila.estado] || ESTADOS.falta;
        const parte = base > 0 ? paraOrdenar(fila, tipoCambio) / base : 0;
        return (
          <div key={fila.material.id} className="costo-fila" style={{
            display: "grid", gridTemplateColumns: columnas, gap: 10,
            padding: "8px 14px 8px 26px", alignItems: "center",
            borderTop: `1px solid ${C.border}`,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span title={fila.material.descripcion} style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fila.material.descripcion}
                </span>
                {fila.estado !== "firme" ? (
                  <Chip color={estado.color()} soft={estado.soft()} border={estado.borde()}>{estado.label}</Chip>
                ) : null}
              </div>
              {fila.origen || fila.material.codigo ? (
                <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 700, marginTop: 2 }}>
                  {[fila.material.codigo, fila.origen].filter(Boolean).join(" · ")}
                </div>
              ) : null}
            </div>
            <div style={{ textAlign: "right", color: C.dim, fontFamily: C.mono, fontSize: 11.5 }}>
              {fila.cantidad} {fila.material.unidad_medida || "u"}
              {fila.precio != null ? ` × ${fmt(fila.precio, fila.moneda)}` : ""}
            </div>
            {!isMobile ? (
              // El recuperable va en violeta porque ese importe TODAVÍA NO está
              // en el total de arriba: es lo que valdría al aplicar el remito.
              // En negro, al lado de los que sí suman, se leería como plata ya
              // contada.
              <div style={{ textAlign: "right", fontFamily: C.mono, fontSize: 12.5, fontWeight: 850, color: fila.estado === "falta" ? C.dim : fila.estado === "recuperable" ? C.violet : C.text }}>
                {fila.estado === "falta" ? "—" : fmt(fila.costo, fila.moneda)}
              </div>
            ) : null}
            {!isMobile ? (
              // Sólo para los que suman: el porcentaje se mide contra el costo
              // confirmado del rubro, y un recuperable no está adentro de ese
              // número. Mostrarlo daría un 340% sin sentido.
              <div style={{ textAlign: "right", color: C.dim, fontFamily: C.mono, fontSize: 10.5, fontWeight: 800 }}>
                {fila.estado !== "firme" && fila.estado !== "viejo" ? "" : parte > 0.005 ? pct(parte) : ""}
              </div>
            ) : null}
          </div>
        );
      })}
      {rubro.falta + rubro.recuperable ? (
        <button type="button" onClick={onIrAFaltantes} style={{
          width: "100%", border: "none", borderTop: `1px solid ${C.border}`, background: "transparent",
          color: C.red, padding: "9px 14px 9px 26px", textAlign: "left", cursor: "pointer",
          fontFamily: C.sans, fontSize: 11.5, fontWeight: 900,
        }}>
          Cotizar los {rubro.falta + rubro.recuperable} de {rubro.nombre} →
        </button>
      ) : null}
    </div>
  );
}

/**
 * Alta rápida de proveedor, sin salir de la pantalla.
 *
 * Sólo el nombre es obligatorio. El mail y el teléfono están porque son
 * exactamente lo que hace falta para mandarle el pedido de precios, que es lo
 * que uno va a hacer treinta segundos después de darlo de alta. El resto de la
 * ficha se completa en Materiales si algún día hace falta.
 */
function ModalNuevoProveedor({ nombreInicial = "", onCerrar, onCreado }) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [guardando, setGuardando] = useState(false);

  const campo = {
    width: "100%", boxSizing: "border-box", border: `1px solid ${C.border2}`,
    background: C.panelSolid, color: C.text, borderRadius: 9, padding: "9px 11px",
    fontFamily: C.sans, fontSize: 13, fontWeight: 700, outline: "none",
  };
  const etiqueta = { fontSize: 10, fontWeight: 900, color: C.dim, textTransform: "uppercase", letterSpacing: .9, marginBottom: 5 };

  async function crear() {
    const limpio = nombre.trim();
    if (!limpio) return;
    setGuardando(true);
    try {
      const id = await guardarProveedor({ nombre: limpio, email: email.trim() || null, telefono: telefono.trim() || null, activo: true });
      await onCreado?.({ id, nombre: limpio });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 16, fontFamily: C.sans }}
    >
      <div onClick={(evento) => evento.stopPropagation()} style={{ width: "min(400px, 100%)", background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 18px 50px var(--shadow)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: `1px solid ${C.border}` }}>
          <Building2 size={16} color={C.blue} />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 950, color: C.text }}>Proveedor nuevo</div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 15, display: "grid", gap: 12 }}>
          <div>
            <div style={etiqueta}>Nombre</div>
            <input
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              onKeyDown={(evento) => { if (evento.key === "Enter") crear(); }}
              placeholder="Ej.: Turbodiesel"
              autoFocus
              style={campo}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={etiqueta}>Mail <span style={{ textTransform: "none", fontWeight: 700 }}>(opcional)</span></div>
              <input value={email} onChange={(evento) => setEmail(evento.target.value)} placeholder="ventas@…" style={campo} />
            </div>
            <div>
              <div style={etiqueta}>Teléfono <span style={{ textTransform: "none", fontWeight: 700 }}>(opcional)</span></div>
              <input value={telefono} onChange={(evento) => setTelefono(evento.target.value)} placeholder="11 …" style={campo} />
            </div>
          </div>
          <div style={{ color: C.dim, fontSize: 11, fontWeight: 700, lineHeight: 1.5 }}>
            El mail y el teléfono son para mandarle el pedido de precios. El resto de la ficha se completa en Materiales.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 15px", borderTop: `1px solid ${C.border}`, background: C.panel2 }}>
          <button type="button" onClick={onCerrar} style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "9px 13px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}>
            Cancelar
          </button>
          <button type="button" onClick={crear} disabled={guardando || !nombre.trim()} style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "9px 15px", cursor: guardando || !nombre.trim() ? "default" : "pointer", opacity: nombre.trim() ? 1 : .5, fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {guardando ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />} Crear
          </button>
        </div>
      </div>
    </div>
  );
}

/** La barra de cobertura: firme, viejo, recuperable y lo que falta. */
function BarraCobertura({ total }) {
  const partes = [
    { clave: "firme", n: total.firme, color: C.green, label: "con precio al día" },
    { clave: "viejo", n: total.viejo, color: C.blue, label: "precio de más de 6 meses" },
    { clave: "recuperable", n: total.recuperable, color: C.violet, label: "el precio ya está en un remito" },
    { clave: "falta", n: total.falta, color: C.red, label: "hay que pedirlo" },
  ].filter((parte) => parte.n > 0);
  const suma = total.items || 1;

  return (
    <div style={{ display: "grid", gap: 7 }}>
      <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: C.panel2, border: `1px solid ${C.border}` }}>
        {partes.map((parte) => (
          <div key={parte.clave} title={`${parte.n} ${parte.label}`} style={{ width: `${(parte.n / suma) * 100}%`, background: parte.color }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {partes.map((parte) => (
          <span key={parte.clave} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11.5, fontWeight: 750 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: parte.color, flexShrink: 0 }} />
            <b style={{ color: C.text, fontFamily: C.mono }}>{parte.n}</b> {parte.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CostoBarcoScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();

  const [modelo, setModelo] = useState("55");
  const [tab, setTab] = useState("costo");
  const [catalogo, setCatalogo] = useState({ materiales: [], categorias: [], proveedores: [] });
  const [recuperables, setRecuperables] = useState(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [abiertos, setAbiertos] = useState({});
  // Con qué precio se costea cuando un material tiene varios proveedores. Por
  // defecto el de la ficha, que es el de siempre; "barato" es la comparación
  // que contesta "cuánto nos ahorraríamos comprando bien".
  const [criterio, setCriterio] = useState("ultimo");
  // Alta de proveedor. Guarda a qué fila hay que asignárselo al crearlo, así
  // "no está en la lista → lo creo → queda asignado" es un solo movimiento.
  const [nuevoProveedor, setNuevoProveedor] = useState(null);
  // Selección para trabajar de a varios. Va por material y no por fila: el
  // mismo material puede estar en dos grupos -si lo venden dos proveedores- y
  // tildarlo en uno es tildar ese material, no esa aparición.
  const [seleccion, setSeleccion] = useState(() => new Set());
  // Qué hace el desplegable de la barra: reemplazar el proveedor del material o
  // sumarle uno más. Los dos hacen falta y son cosas distintas — "este lo
  // compramos en Baron" no es lo mismo que "esto también lo vende Baron,
  // pidámosle precio" — y hasta ahora sólo se podía lo primero.
  const [modoProveedor, setModoProveedor] = useState("sumar");
  // Los proveedores elegidos para esta tanda. Es una lista y no uno solo
  // porque asignar de a uno obligaba a rehacer toda la selección de
  // materiales para el segundo proveedor: se elegían veinte artículos, se les
  // ponía Baron, la selección se iba y había que volver a buscarlos para
  // ponerles Trimer.
  const [elegidos, setElegidos] = useState([]);
  // Qué rubro está desplegado en la tabla de costos. Uno por vez: abrir varios
  // deja una lista de doscientos renglones donde ya no se ve la comparación
  // entre rubros, que es para lo que está la tabla.
  const [rubroAbierto, setRubroAbierto] = useState(null);
  // Filtros de la lista de faltantes. `filtroRubro` es el puente desde la tabla
  // de costos: se hace clic en "faltan 7" de Herrajes y se cae acá con esos 7.
  const [busca, setBusca] = useState("");
  const [filtroRubro, setFiltroRubro] = useState(null);

  const alternarSeleccion = useCallback((materialId) => {
    setSeleccion((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(materialId)) siguiente.delete(materialId);
      else siguiente.add(materialId);
      return siguiente;
    });
  }, []);

  const alternarGrupo = useCallback((items) => {
    setSeleccion((actual) => {
      const siguiente = new Set(actual);
      const ids = items.map((fila) => fila.material.id);
      // Si ya estaban todos, el clic los saca; si faltaba alguno, los suma.
      if (ids.every((id) => siguiente.has(id))) ids.forEach((id) => siguiente.delete(id));
      else ids.forEach((id) => siguiente.add(id));
      return siguiente;
    });
  }, []);
  // Los que se acaban de cargar a mano. Se quedan a la vista aunque ya tengan
  // precio: si la fila desapareciera al escribir el número, cargar veinte
  // seguidos sería un salto de renglón atrás de otro.
  const [reciencargados, setRecienCargados] = useState(new Map());
  // El dólar viene del oficial vendedor y se refresca solo. Se puede pisar a
  // mano -a veces se costea a un tipo de cambio acordado con el cliente- y en
  // ese caso queda marcado, para que nadie lea el total creyendo que es al
  // oficial cuando no lo es.
  const [cotizacion, setCotizacion] = useState(() => dolarGuardado());
  const [dolarManual, setDolarManual] = useState("");
  const dolar = dolarManual !== "" ? dolarManual : (cotizacion?.venta ?? "");
  const esManual = dolarManual !== "";

  const cargar = useCallback(async ({ force = false } = {}) => {
    setCargando(true);
    setError("");
    try {
      const [datos, precios] = await Promise.all([
        fetchCatalogo({ force, includeExtras: false, includeDetails: true }),
        fetchPreciosDeRemitos(),
      ]);
      setCatalogo({
        materiales: datos.materiales || [],
        categorias: datos.categorias || [],
        proveedores: datos.proveedores || [],
      });
      setRecuperables(precios);
    } catch (e) {
      setError(e?.message || "No se pudo cargar el catálogo.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // El dólar va por su lado: si la API no contesta, el costo en pesos se ve
  // igual. Sólo se pierde la columna unificada.
  useEffect(() => {
    let vivo = true;
    fetchDolarOficial().then((valor) => { if (vivo && valor) setCotizacion(valor); });
    return () => { vivo = false; };
  }, []);

  const resumen = useMemo(
    () => resumenDeModelo(catalogo.materiales, modelo, { recuperables, categorias: catalogo.categorias, criterio }),
    [catalogo.materiales, catalogo.categorias, modelo, recuperables, criterio],
  );
  // Sólo los que siguen vivos. `fetchCatalogo` trae todos -inactivos incluidos,
  // porque otras pantallas necesitan mostrar el proveedor viejo de un material-
  // así que el filtro va acá: un desplegable para ASIGNAR no puede ofrecer un
  // proveedor dado de baja.
  const proveedoresActivos = useMemo(
    () => catalogo.proveedores.filter((proveedor) => proveedor?.activo !== false),
    [catalogo.proveedores],
  );

  // Lo que la lista de faltantes tiene que mirar: el rubro que se pidió desde
  // la tabla de costos y el texto del buscador. Se filtra ANTES de agrupar para
  // que los contadores de cada proveedor digan cuántos hay de los que se ven.
  const filasFiltradas = useMemo(() => {
    const texto = sinTildes(busca.trim());
    if (!texto && !filtroRubro) return resumen.filas;
    return resumen.filas.filter((fila) => {
      if (filtroRubro && fila.rubroId !== filtroRubro) return false;
      if (!texto) return true;
      return sinTildes(fila.material.descripcion).includes(texto)
        || sinTildes(fila.material.codigo).includes(texto);
    });
  }, [resumen.filas, busca, filtroRubro]);

  const { recuperables: filasRecuperables, grupos } = useMemo(
    // Las claves de `reciencargados` son "materialId|grupo": para saber qué
    // filas hay que dejar a la vista alcanza con la parte del material.
    () => agruparFaltantes(filasFiltradas, {
      ademas: new Set([...reciencargados.keys()].map((clave) => String(clave).split("|")[0])),
    }),
    [filasFiltradas, reciencargados],
  );
  const filtrando = Boolean(busca.trim() || filtroRubro);
  // Un grupo está abierto si se lo abrió a mano; si nadie lo tocó, lo decide el
  // contexto: el de "sin proveedor" siempre -es el que hay que resolver- y
  // todos mientras haya un filtro puesto, porque buscar y no ver el resultado
  // es peor que no buscar.
  const grupoAbierto = (clave) => abiertos[clave] ?? (clave === SIN_PROVEEDOR || filtrando);
  const todosAbiertos = grupos.length > 0 && grupos.every((grupo) => grupoAbierto(grupo.clave));
  // Cuántos faltantes hay en total y cuántos quedaron a la vista, para poder
  // decir "3 de 21" al filtrar. Se cuentan MATERIALES, no renglones: el mismo
  // material aparece bajo cada proveedor que lo vende y sumar los grupos daría
  // más faltantes de los que hay.
  const faltantesTotales = resumen.total.falta + resumen.total.recuperable;
  const faltantesALaVista = useMemo(() => {
    const vistos = new Set();
    for (const grupo of grupos) for (const fila of grupo.items) vistos.add(fila.material.id);
    for (const fila of filasRecuperables) vistos.add(fila.material.id);
    return vistos.size;
  }, [grupos, filasRecuperables]);

  const tipoCambio = Number(String(dolar).replace(",", ".")) || 0;
  const total = resumen.total;
  const unificado = tipoCambio > 0 ? total.ars + total.usd * tipoCambio : null;
  const unificadoConRecuperables = tipoCambio > 0
    ? unificado + total.arsRecuperable + total.usdRecuperable * tipoCambio
    : null;

  async function aplicarRecuperables() {
    if (!filasRecuperables.length || ocupado) return;
    const cuantos = filasRecuperables.length;
    if (!window.confirm(`Se ${cuantos === 1 ? "va" : "van"} a cargar ${cuantos} precio${cuantos === 1 ? "" : "s"} tomado${cuantos === 1 ? "" : "s"} de remitos ya escaneados. ¿Seguimos?`)) return;
    setOcupado("recuperar");
    try {
      const { aplicados, fallidos } = await aplicarPreciosRecuperados(filasRecuperables);
      if (fallidos.length) {
        toast.warning(`Se cargaron ${aplicados} precios. ${fallidos.length} no se pudieron: revisá los permisos.`);
      } else {
        toast.success(`Listo: ${aplicados} precios cargados desde los remitos.`);
      }
      await cargar({ force: true });
    } catch (e) {
      toast.error(e?.message || "No se pudieron cargar los precios.");
    } finally {
      setOcupado("");
    }
  }

  /**
   * Carga el precio de un material sin salir de la pantalla.
   *
   * Es la mitad que faltaba: la lista dice qué falta y a quién pedírselo, pero
   * cuando el proveedor contesta hay que poder escribir los veinte números acá
   * mismo. Al guardar se actualiza el material EN MEMORIA, así el total de
   * arriba se mueve en el acto y se ve el avance mientras se carga.
   */
  async function guardarPrecio(fila, textoPrecio, moneda, grupo) {
    const precio = Number(String(textoPrecio).replace(/\./g, "").replace(",", "."));
    if (!(precio > 0)) {
      toast.warning("Poné un número mayor que cero.");
      return;
    }
    const material = fila.material;
    // Un solo camino, siempre el mismo: el precio entra al historial con SU
    // proveedor y su fecha. Antes había una bifurcación -si el renglón era del
    // proveedor de la ficha iba a un lado y si no a otro-, y eso era la
    // jerarquía metida en el guardado: el precio de Baron terminaba en una
    // tabla sin fecha sólo porque el material "era de" Iriarte.
    const proveedor = grupo?.proveedor || material.proveedor || null;
    const proveedorId = grupo?.proveedorId || null;

    setOcupado(`precio-${material.id}-${grupo?.clave || ""}`);
    try {
      const fecha = new Date().toISOString().slice(0, 10);
      await aplicarPrecioMaterial(material.id, {
        precio,
        moneda,
        proveedor,
        proveedor_id: proveedorId,
        fuente: "cotizacion",
      });
      // En memoria pasa lo mismo que en la base: un renglón más en el
      // historial, adelante de todo. Así el total de arriba se mueve en el acto
      // y la lista de proveedores del material queda bien sin recargar.
      setCatalogo((actual) => ({
        ...actual,
        materiales: actual.materiales.map((row) => (
          row.id === material.id
            ? {
              ...row,
              precio_unitario: precio,
              moneda,
              proveedor: proveedor ?? row.proveedor,
              proveedor_id: proveedorId ?? row.proveedor_id,
              precio_historial: [
                { precio_unitario: precio, moneda, fecha, proveedor, proveedor_id: proveedorId, fuente: "cotizacion" },
                ...(row.precio_historial || []),
              ],
              ultimo_precio: { precio_unitario: precio, moneda, fecha, proveedor, proveedor_id: proveedorId },
            }
            : row
        )),
      }));
      setRecienCargados((actual) => new Map(actual).set(`${material.id}|${grupo?.clave || ""}`, { precio, moneda }));
    } catch (e) {
      toast.error(e?.message || "No se pudo guardar el precio.");
    } finally {
      setOcupado("");
    }
  }

  /**
   * Asigna un proveedor a todo lo tildado, de una.
   *
   * Es la diferencia entre clasificar cuarenta materiales y no clasificarlos:
   * uno por uno, con un desplegable por fila, nadie llega al final de la lista.
   */
  async function aplicarProveedores() {
    const ids = [...seleccion];
    if (!elegidos.length || !ids.length) return;

    const nombres = elegidos.map((proveedor) => proveedor.nombre).join(", ");
    if (modoProveedor === "quitar"
      && !window.confirm(`Se les va a sacar ${nombres} a ${ids.length} material${ids.length === 1 ? "" : "es"}. ¿Seguimos?`)) return;

    setOcupado("masivo");
    try {
      const hechos = [];
      for (const proveedor of elegidos) {
        if (modoProveedor === "quitar") {
          const cuantos = await quitarProveedorMasivo(ids, proveedor);
          if (cuantos) hechos.push(`${proveedor.nombre} (${cuantos})`);
          continue;
        }
        // Los que ya lo tienen se dejan afuera: no hay nada que agregarles, y
        // contarlos daría un "12 materiales" que en la base fueron 4.
        const porId = new Map(catalogo.materiales.map((material) => [material.id, material]));
        const nuevos = ids.filter((id) => {
          const material = porId.get(id);
          if (!material) return true;
          return !proveedoresDeMaterial(material).some((row) => (
            row.proveedorId ? row.proveedorId === proveedor.id : row.proveedor === proveedor.nombre
          ));
        });
        if (!nuevos.length) continue;
        const cuantos = await agregarProveedorAMateriales(nuevos, proveedor);
        hechos.push(`${proveedor.nombre} (${cuantos})`);
      }

      if (!hechos.length) {
        toast.info(modoProveedor === "quitar"
          ? "Ninguno de los seleccionados tenía esos proveedores."
          : "Todos los seleccionados ya tenían esos proveedores.");
      } else {
        toast.success(`${modoProveedor === "quitar" ? "Salieron" : "Se sumaron"}: ${hechos.join(" · ")}.`);
      }
      // La lista de proveedores se vacía pero LO TILDADO SE QUEDA. Si al
      // aplicar se perdiera la selección, sumarle un proveedor más a los mismos
      // veinte materiales sería volver a buscarlos y tildarlos uno por uno.
      setElegidos([]);
      await cargar({ force: true });
    } catch (e) {
      toast.error(e?.message || "No se pudo asignar el proveedor.");
    } finally {
      setOcupado("");
    }
  }

  /** Suma un proveedor a la tanda que se va a aplicar. Sin repetir. */
  function elegirProveedor(proveedor) {
    if (!proveedor?.id) return;
    setElegidos((actual) => (actual.some((row) => row.id === proveedor.id)
      ? actual
      : [...actual, { id: proveedor.id, nombre: proveedor.nombre }]));
  }

  /**
   * El puente entre las dos mitades de la pantalla: de "a Herrajes le faltan 7"
   * a esos 7 con su casilla para escribir el precio. Sin esto la tabla de
   * costos dice qué está mal y la lista de faltantes no sabe de qué le hablan.
   */
  function irAFaltantes(rubroId) {
    setFiltroRubro(rubroId || null);
    setBusca("");
    setTab("faltan");
  }

  /** Se creó un proveedor: entra a la lista y, si vino de una fila, se le asigna. */
  async function proveedorCreado({ id, nombre }, destino) {
    setCatalogo((actual) => ({
      ...actual,
      proveedores: [...actual.proveedores, { id, nombre, activo: true }]
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")),
    }));
    setNuevoProveedor(null);
    // Se creó desde la barra: entra a la tanda como uno más, sin aplicarse
    // solo. Así se lo puede combinar con otros antes de tocar la base.
    if (destino === "seleccion") {
      elegirProveedor({ id, nombre });
      toast.success(`${nombre} quedó dado de alta y sumado a la tanda.`);
    } else {
      toast.success(`${nombre} quedó dado de alta.`);
    }
  }



  /** La lista que se le manda al proveedor: descripción, unidad y una columna vacía. */
  function exportarGrupo(grupo) {
    const nombre = grupo.proveedor || "sin-proveedor";
    // La "Ref." es la llave para reconocer el material cuando vuelve la
    // planilla. Casi ningún material tiene código propio, así que se cae al
    // principio del id: feo pero estable, que es lo único que importa acá.
    descargarXlsx(`precios-${nombre.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.xlsx`, [{
      nombre: "Lista",
      anchos: [12, 60, 12, 14, 16, 10],
      congelar: { fila: 1, col: 0 },
      filas: [
        ["Ref.", "Artículo", "Unidad", `Lleva un K${modelo}`, "Precio unitario", "Moneda"],
        ...grupo.items.map((fila) => [
          fila.material.codigo || String(fila.material.id).slice(0, 8),
          fila.material.descripcion,
          fila.material.unidad_medida || "unidad",
          fila.cantidad,
          "",
          "",
        ]),
      ],
    }]);
  }

  function exportarTodo() {
    const etiqueta = { firme: "con precio", viejo: "precio viejo", recuperable: "está en un remito", falta: "falta" };
    descargarXlsx(`costo-K${modelo}.xlsx`, [
      {
        nombre: "Por rubro",
        anchos: [34, 13, 13, 18, 18],
        congelar: { fila: 1, col: 0 },
        filas: [
          ["Rubro", "Materiales", "Con precio", "Costo ARS", "Costo USD"],
          ...resumen.rubros.map((rubro) => [rubro.nombre, rubro.items, rubro.firme + rubro.viejo, rubro.ars || "", rubro.usd || ""]),
          ["Total", total.items, total.firme + total.viejo, total.ars || "", total.usd || ""],
        ],
      },
      {
        nombre: "Detalle",
        anchos: [24, 56, 12, 12, 14, 9, 16, 20, 22],
        congelar: { fila: 1, col: 0 },
        autofiltro: "A1:I1",
        filas: [
          ["Rubro", "Artículo", "Unidad", "Cantidad", "Precio", "Moneda", "Costo", "Estado", "Proveedor"],
          // Mismo orden que el desglose de la pantalla: por rubro y, dentro de
          // cada uno, del más caro al más barato. Si el Excel sale en el orden
          // del catálogo, quien lo abre tiene que ordenarlo a mano para ver lo
          // único que importa: dónde se va la plata.
          ...[...resumen.filas]
            .sort((a, b) => (a.rubro === b.rubro
              ? paraOrdenar(b, tipoCambio) - paraOrdenar(a, tipoCambio)
              : String(a.rubro).localeCompare(String(b.rubro), "es")))
            .map((fila) => [
              fila.rubro,
              fila.material.descripcion,
              fila.material.unidad_medida || "unidad",
              fila.cantidad,
              fila.precio ?? "",
              fila.moneda,
              fila.costo || "",
              etiqueta[fila.estado],
              fila.material.proveedor || "",
            ]),
        ],
      },
    ]);
  }

  const seccion = { border: `1px solid ${C.border}`, background: C.panel, borderRadius: 13 };

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: C.bg, color: C.text, fontFamily: C.sans }}>
      {nuevoProveedor ? (
        <ModalNuevoProveedor
          onCerrar={() => setNuevoProveedor(null)}
          onCreado={(proveedor) => proveedorCreado(proveedor, nuevoProveedor.destino)}
        />
      ) : null}
      <style>{`
        .costo-fila { transition: background .14s; }
        .costo-fila:hover { background: var(--panel-2); }
        .costo-grupo { transition: border-color .16s, box-shadow .16s; }
        .costo-grupo:hover { border-color: var(--border-2); }
        @keyframes costo-barra { from { opacity: 0; transform: translateY(8px); } }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto minmax(0,1fr)", height: "100%" }}>
        <Sidebar profile={profile} signOut={signOut} />

        <main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <header style={{ minHeight: 52, display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "9px 12px 9px 54px" : "9px 18px", borderBottom: `1px solid ${C.border}`, background: C.topbar, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}` }}><Calculator size={17} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>Costo del barco</div>
              <div style={{ color: C.dim, fontSize: 10.5, marginTop: 1 }}>Materiales solamente · no incluye mano de obra ni terceros</div>
            </div>
            <button type="button" onClick={() => setNuevoProveedor({ destino: null })} title="Dar de alta un proveedor" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 11px", cursor: "pointer", fontSize: 12.5, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Plus size={14} /> {isMobile ? "" : "Proveedor"}
            </button>
            <button type="button" onClick={exportarTodo} disabled={cargando || !resumen.filas.length} title="Bajar a Excel" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 11px", cursor: "pointer", fontSize: 12.5, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <FileSpreadsheet size={14} /> {isMobile ? "" : "Excel"}
            </button>
            <button type="button" onClick={() => cargar({ force: true })} disabled={cargando} title="Actualizar" style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 9, cursor: cargando ? "default" : "pointer", opacity: cargando ? .6 : 1 }}>
              <RefreshCw size={15} className={cargando ? "spin" : ""} />
            </button>
          </header>

          {/* Selector de barco + la lente del dólar */}
          <div style={{ padding: isMobile ? 10 : "11px 16px", borderBottom: `1px solid ${C.border}`, background: C.topbarSoft, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 4, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3 }}>
              {MODELOS_BARCO.map((opcion) => {
                const activo = modelo === opcion.id;
                return (
                  <button key={opcion.id} type="button" onClick={() => { setModelo(opcion.id); setSeleccion(new Set()); setRubroAbierto(null); setFiltroRubro(null); }} style={{
                    border: "none", background: activo ? C.blueL : "transparent", color: activo ? C.blue : C.muted,
                    borderRadius: 8, padding: "7px 18px", cursor: "pointer", fontFamily: C.sans, fontSize: 13, fontWeight: 900,
                  }}>{opcion.label}</button>
                );
              })}
            </div>
            {/* Con qué precio se costea cuando hay más de un proveedor. */}
            {resumen.total.conVarios ? (
              <div style={{ display: "flex", gap: 4, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3 }}>
                {[
                  { id: "ultimo", label: "El último precio" },
                  { id: "barato", label: "El más barato" },
                ].map((opcion) => {
                  const activo = criterio === opcion.id;
                  return (
                    <button key={opcion.id} type="button" onClick={() => setCriterio(opcion.id)} title="Cambia con qué precio se costean los materiales que tienen más de un proveedor" style={{
                      border: "none", background: activo ? C.panel2 : "transparent", color: activo ? C.text : C.dim,
                      borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 850,
                    }}>{opcion.label}</button>
                  );
                })}
              </div>
            ) : null}
            <span style={{ flex: 1 }} />
            <div style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
              <div style={{ textAlign: "right", lineHeight: 1.25 }}>
                <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 800 }}>
                  {esManual ? "Dólar a mano" : "Dólar oficial vendedor"}
                </div>
                <div style={{ color: esManual ? C.violet : C.dim, fontSize: 10, fontWeight: 700 }}>
                  {esManual
                    ? "no es el oficial"
                    : cotizacion
                      ? `${cotizacion.origen === "viejo" ? "sin conexión · " : ""}${cuandoSeActualizo(cotizacion.fecha) || "actualizado"}`
                      : "buscando…"}
                </div>
              </div>
              <input
                value={dolar}
                onChange={(event) => setDolarManual(event.target.value)}
                placeholder="—"
                inputMode="decimal"
                aria-label="Cotización del dólar"
                title="Se completa con el oficial vendedor. Podés pisarlo a mano para costear a otro tipo de cambio."
                style={{
                  width: 92, border: `1px solid ${esManual ? C.violetB : C.border}`,
                  background: C.panelSolid, color: C.text, borderRadius: 8, padding: "7px 9px",
                  fontFamily: C.mono, fontSize: 12.5, outline: "none", textAlign: "right",
                }}
              />
              {esManual ? (
                <button
                  type="button"
                  onClick={() => setDolarManual("")}
                  title="Volver al dólar oficial"
                  style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 8, width: 30, height: 32, display: "grid", placeItems: "center", cursor: "pointer" }}
                >
                  <RotateCcw size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => fetchDolarOficial({ force: true }).then((valor) => valor && setCotizacion(valor))}
                  title="Volver a pedir la cotización"
                  style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 8, width: 30, height: 32, display: "grid", placeItems: "center", cursor: "pointer" }}
                >
                  <RefreshCw size={13} />
                </button>
              )}
            </div>
          </div>

          {/* `gridAutoRows: max-content` no es decorativo: las tarjetas de acá
              adentro llevan `overflow: hidden`, y en CSS Grid eso les baja el
              mínimo automático a cero. En una ventana baja -el panel del
              navegador, una notebook- las filas se achicaban en vez de
              scrollear y el número grande quedaba cortado al medio. */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 10 : 16, display: "grid", gap: 12, alignContent: "start", gridAutoRows: "max-content" }}>
            {error ? (
              <div style={{ ...seccion, borderColor: C.redB, background: C.redL, color: C.red, padding: "11px 13px", fontSize: 12.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} /> {error}
              </div>
            ) : null}

            {cargando ? (
              <div style={{ ...seccion, padding: 40, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
                <LoaderCircle size={22} className="spin" style={{ marginBottom: 8 }} />
                <div>Juntando materiales, precios y remitos…</div>
              </div>
            ) : !resumen.total.items ? (
              <div style={{ ...seccion, padding: 40, textAlign: "center" }}>
                <Wallet size={24} color={C.dim} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 14, fontWeight: 900 }}>El K{modelo} no tiene cantidades cargadas</div>
                <div style={{ color: C.dim, fontSize: 12.5, marginTop: 5 }}>
                  Las cantidades por modelo se cargan en Materiales. Sin ellas no hay nada que costear.
                </div>
              </div>
            ) : (
              <>
                {/* ── EL NÚMERO ──────────────────────────────────────────
                    Una sola cifra manda. Antes había cuatro tarjetas del mismo
                    peso y ninguna se leía primero: el costo, la cobertura y dos
                    proyecciones peleando por el mismo tamaño de letra. Ahora el
                    total ocupa la mitad izquierda, la confianza la derecha, y
                    lo demás son fichas chicas abajo. */}
                <section style={{ ...seccion, overflow: "hidden" }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(280px,.85fr)",
                    gap: isMobile ? 14 : 0,
                    padding: isMobile ? 14 : 18,
                  }}>
                    {/* El total */}
                    <div style={{ minWidth: 0, paddingRight: isMobile ? 0 : 18, borderRight: isMobile ? "none" : `1px solid ${C.border}` }}>
                      <div style={{ color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>
                        Material del K{modelo} · costo confirmado
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                        <span style={{ color: C.text, fontFamily: C.mono, fontSize: isMobile ? 28 : 36, fontWeight: 900, lineHeight: 1.05, letterSpacing: -0.5 }}>
                          {fmt(unificado != null ? unificado : total.ars)}
                        </span>
                        {unificado != null ? (
                          <span style={{ color: C.dim, fontSize: 12, fontWeight: 750 }}>
                            {fmt(total.ars)} + {fmt(total.usd, "USD")}
                          </span>
                        ) : total.usd ? (
                          <span style={{ color: C.text, fontFamily: C.mono, fontSize: 17, fontWeight: 850 }}>
                            + {fmt(total.usd, "USD")}
                          </span>
                        ) : null}
                      </div>

                      {/* Las proyecciones, como fichas: importan, pero después. */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                        {total.recuperable ? (
                          <Chip color={C.violet} soft={C.violetL} border={C.violetB} title={`${total.recuperable} materiales con el precio adentro de un remito`}>
                            + {fmt(total.arsRecuperable)} al aplicar remitos
                          </Chip>
                        ) : null}
                        {total.ahorroArs || total.ahorroUsd ? (
                          <Chip color={C.green} soft={C.greenL} border={C.greenB} title={`${total.conVarios} materiales tienen más de un precio`}>
                            − {fmt(total.ahorroArs)} comprando al más barato
                          </Chip>
                        ) : null}
                        {total.viejo ? (
                          <Chip color={C.blue} soft={C.blueL} border={C.blueB} title="Precios de más de seis meses: entran al total igual">
                            {total.viejo} con precio viejo
                          </Chip>
                        ) : null}
                      </div>
                    </div>

                    {/* La confianza */}
                    <div style={{ minWidth: 0, paddingLeft: isMobile ? 0 : 18, display: "grid", gap: 10, alignContent: "start" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>Cobertura</span>
                        <span style={{
                          fontFamily: C.mono, fontSize: 20, fontWeight: 900,
                          color: resumen.cobertura > .85 ? C.green : resumen.cobertura > .6 ? C.blue : C.red,
                        }}>
                          {pct(resumen.cobertura)}
                        </span>
                      </div>
                      <BarraCobertura total={total} />
                    </div>
                  </div>

                  {/* La frase que evita que alguien tome este número por cerrado. */}
                  <div style={{
                    borderTop: `1px solid ${C.border}`, background: C.panelSolid,
                    padding: isMobile ? "10px 14px" : "11px 18px",
                    color: C.muted, fontSize: 12, fontWeight: 700, lineHeight: 1.55,
                  }}>
                    {total.falta || total.recuperable ? (
                      <>
                        Es un <b style={{ color: C.text }}>piso</b>: faltan {total.falta + total.recuperable} de {total.items} materiales por valorizar
                        {unificadoConRecuperables != null && total.recuperable
                          ? <> y, sólo con aplicar los precios que ya están en los remitos, sube a <b style={{ color: C.text }}>{fmt(unificadoConRecuperables)}</b></>
                          : null}.
                      </>
                    ) : (
                      <>Los {total.items} materiales del K{modelo} tienen precio. El total está completo.</>
                    )}
                  </div>
                </section>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {TABS.map((opcion) => {
                    const activo = tab === opcion.id;
                    const cuenta = opcion.id === "faltan" ? total.falta + total.recuperable : 0;
                    return (
                      <button key={opcion.id} type="button" onClick={() => setTab(opcion.id)} style={{
                        border: `1px solid ${activo ? C.blueB : C.border}`, background: activo ? C.blueL : C.panelSolid,
                        color: activo ? C.blue : C.muted, borderRadius: 9, padding: "8px 14px", cursor: "pointer",
                        fontFamily: C.sans, fontSize: 12.5, fontWeight: 900,
                      }}>
                        {opcion.label}{cuenta ? ` · ${cuenta}` : ""}
                      </button>
                    );
                  })}
                </div>

                {/* ── COSTO POR RUBRO ───────────────────────────────────── */}
                {tab === "costo" ? (
                  <section style={{ ...seccion, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) 80px" : "minmax(0,2fr) 96px minmax(120px,1fr) minmax(110px,.8fr)", gap: 10, padding: "9px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: .8, textTransform: "uppercase" }}>
                      <div>Rubro</div>
                      {/* "Con precio" y "Materiales" eran dos columnas de 110px
                          para dos números que sólo significan algo juntos. Como
                          fracción ocupan una sola y le devuelven el ancho al
                          nombre del rubro, que era el que se cortaba. */}
                      {!isMobile && <div style={{ textAlign: "right" }}>Con precio</div>}
                      <div style={{ textAlign: "right" }}>Costo ARS</div>
                      {!isMobile && <div style={{ textAlign: "right" }}>Costo USD</div>}
                    </div>
                    {resumen.rubros.map((rubro, i) => {
                      const cobertura = rubro.items ? (rubro.firme + rubro.viejo) / rubro.items : 0;
                      // Peso del rubro sobre el total, para la barra. Se mide
                      // con el mismo criterio que la cifra de arriba, así lo que
                      // se ve coincide con lo que dice el número.
                      const peso = tipoCambio > 0
                        ? (unificado ? (rubro.ars + rubro.usd * tipoCambio) / unificado : 0)
                        : (total.ars ? rubro.ars / total.ars : 0);
                      const abierto = rubroAbierto === rubro.id;
                      return (
                        <div key={rubro.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                          {/* La fila no es un <button> porque adentro va otro
                              -"faltan 7"-, y un botón dentro de otro no es HTML
                              válido ni se puede tabular. */}
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={abierto}
                            onClick={() => setRubroAbierto(abierto ? null : rubro.id)}
                            onKeyDown={(evento) => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); setRubroAbierto(abierto ? null : rubro.id); } }}
                            className="costo-fila"
                            style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) 80px" : "minmax(0,2fr) 96px minmax(120px,1fr) minmax(110px,.8fr)", gap: 10, padding: "10px 14px", alignItems: "center", cursor: "pointer", background: abierto ? C.panel2 : "transparent" }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <ChevronDown size={13} color={C.dim} style={{ transform: abierto ? "rotate(180deg)" : "rotate(-90deg)", transition: "transform .16s", flexShrink: 0 }} />
                                <span style={{ fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rubro.nombre}</span>
                                {peso > 0.005 ? (
                                  <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>{pct(peso)}</span>
                                ) : null}
                              </div>
                              {/* La barra de proporción: convierte una columna de
                                  números en algo que se lee de un vistazo. */}
                              <div style={{ height: 4, borderRadius: 999, background: C.panel2, marginTop: 5, marginLeft: 21, overflow: "hidden" }}>
                                <div style={{ width: `${Math.max(peso * 100, peso > 0 ? 1.5 : 0)}%`, height: "100%", background: C.blue, borderRadius: 999 }} />
                              </div>
                              {cobertura < 1 ? (
                                <div style={{ marginTop: 4, marginLeft: 21, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(evento) => { evento.stopPropagation(); irAFaltantes(rubro.id); }}
                                    onKeyDown={(evento) => { if (evento.key === "Enter") { evento.stopPropagation(); irAFaltantes(rubro.id); } }}
                                    title={`Ver los ${rubro.items - rubro.firme - rubro.viejo} de ${rubro.nombre} que falta cotizar`}
                                    style={{ color: C.dim, fontSize: 10.5, fontWeight: 800, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2, textDecorationStyle: "dotted" }}
                                  >
                                    {/* El rojo va sólo en el número que hay que
                                        atacar. Pintar el renglón entero cuando
                                        casi todos los rubros están a medias
                                        deja una tabla toda roja que ya no
                                        señala nada. */}
                                    {pct(cobertura)} valorizado · <b style={{ color: C.red }}>faltan {rubro.items - rubro.firme - rubro.viejo}</b>
                                  </span>
                                </div>
                              ) : null}
                            </div>
                            {!isMobile && (
                              <div style={{ textAlign: "right", fontFamily: C.mono, fontSize: 12.5, color: C.muted }}>
                                <span style={{ color: cobertura === 1 ? C.green : C.text, fontWeight: 850 }}>{rubro.firme + rubro.viejo}</span>
                                <span style={{ color: C.dim }}> / {rubro.items}</span>
                              </div>
                            )}
                            <div style={{ textAlign: "right", fontFamily: C.mono, fontSize: 13.5, fontWeight: 850 }}>{rubro.ars ? fmt(rubro.ars) : "—"}</div>
                            {!isMobile && <div style={{ textAlign: "right", fontFamily: C.mono, fontSize: 13.5, fontWeight: 850, color: rubro.usd ? C.text : C.dim }}>{rubro.usd ? fmt(rubro.usd, "USD") : "—"}</div>}
                          </div>
                          {abierto ? (
                            <DetalleRubro
                              rubro={rubro}
                              filas={resumen.filas.filter((fila) => fila.rubroId === rubro.id)}
                              tipoCambio={tipoCambio}
                              isMobile={isMobile}
                              onIrAFaltantes={() => irAFaltantes(rubro.id)}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) 80px" : "minmax(0,2fr) 96px minmax(120px,1fr) minmax(110px,.8fr)", gap: 10, padding: "11px 14px", borderTop: `1px solid ${C.border2}`, background: C.panelSolid, alignItems: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 950 }}>Total K{modelo}</div>
                      {!isMobile && (
                        <div style={{ textAlign: "right", fontFamily: C.mono, fontSize: 12.5 }}>
                          <span style={{ color: C.text, fontWeight: 950 }}>{total.firme + total.viejo}</span>
                          <span style={{ color: C.dim }}> / {total.items}</span>
                        </div>
                      )}
                      <div style={{ textAlign: "right", fontFamily: C.mono, fontSize: 14, fontWeight: 950 }}>{fmt(total.ars)}</div>
                      {!isMobile && <div style={{ textAlign: "right", fontFamily: C.mono, fontSize: 14, fontWeight: 950, color: total.usd ? C.text : C.dim }}>{total.usd ? fmt(total.usd, "USD") : "—"}</div>}
                    </div>
                  </section>
                ) : null}

                {/* ── LO QUE FALTA, POR PROVEEDOR ───────────────────────── */}
                {tab === "faltan" ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {/* ── FILTROS ────────────────────────────────────────
                        Con veinte proveedores y cien faltantes, "bajá hasta
                        encontrarlo" no es una forma de trabajar. El buscador
                        atraviesa todos los grupos y los abre solo. */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                        <Search size={14} color={C.dim} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                        <input
                          value={busca}
                          onChange={(evento) => setBusca(evento.target.value)}
                          placeholder="Buscar un material o su código…"
                          aria-label="Buscar entre los materiales sin precio"
                          style={{
                            width: "100%", boxSizing: "border-box", border: `1px solid ${C.border2}`,
                            background: C.panelSolid, color: C.text, borderRadius: 9,
                            padding: "9px 32px 9px 32px", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, outline: "none",
                          }}
                        />
                        {busca ? (
                          <button type="button" onClick={() => setBusca("")} aria-label="Limpiar la búsqueda" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "flex", padding: 2 }}>
                            <X size={13} />
                          </button>
                        ) : null}
                      </div>
                      {filtroRubro ? (
                        <button type="button" onClick={() => setFiltroRubro(null)} title="Ver todos los rubros" style={{
                          border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 999,
                          padding: "6px 10px", cursor: "pointer", fontFamily: C.sans, fontSize: 11.5, fontWeight: 900,
                          display: "inline-flex", alignItems: "center", gap: 6,
                        }}>
                          {resumen.rubros.find((rubro) => rubro.id === filtroRubro)?.nombre || "Rubro"}
                          <X size={12} />
                        </button>
                      ) : null}
                      {grupos.length > 1 ? (
                        <button type="button" onClick={() => setAbiertos(todosAbiertos ? {} : Object.fromEntries(grupos.map((grupo) => [grupo.clave, true])))} style={{
                          border: `1px solid ${C.border2}`, background: C.panel, color: C.muted, borderRadius: 9,
                          padding: "8px 11px", cursor: "pointer", fontFamily: C.sans, fontSize: 11.5, fontWeight: 850, whiteSpace: "nowrap",
                        }}>
                          {todosAbiertos ? "Cerrar todo" : "Abrir todo"}
                        </button>
                      ) : null}
                    </div>

                    {/* Cuando no queda nada, el cartel de abajo ya lo dice: este
                        contador sólo repetiría el cero. */}
                    {filtrando && faltantesALaVista > 0 ? (
                      <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 800, padding: "0 2px" }}>
                        {faltantesALaVista} de {faltantesTotales} sin precio
                      </div>
                    ) : null}

                    {filasRecuperables.length ? (
                      <section style={{ ...seccion, borderColor: C.violetB, background: C.violetL, padding: isMobile ? 12 : 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ color: C.violet, fontSize: 13.5, fontWeight: 950 }}>
                            {filasRecuperables.length === 1 ? "Hay un precio que ya está en el sistema" : `${filasRecuperables.length} precios ya están en el sistema`}
                          </div>
                          <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, lineHeight: 1.5, marginTop: 3 }}>
                            Vienen de remitos que el pañol ya escaneó y vinculó. No hay que pedirle nada a nadie:
                            se pasan a la lista de precios y el costo se actualiza.
                          </div>
                        </div>
                        <button type="button" onClick={aplicarRecuperables} disabled={Boolean(ocupado)} style={{
                          border: `1px solid ${C.violetB}`, background: C.panelSolid, color: C.violet, borderRadius: 9,
                          padding: "10px 15px", cursor: ocupado ? "default" : "pointer", fontFamily: C.sans, fontSize: 12.5,
                          fontWeight: 950, display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                        }}>
                          {ocupado === "recuperar" ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
                          {filasRecuperables.length === 1 ? "Aplicarlo" : `Aplicar los ${filasRecuperables.length}`}
                        </button>
                      </section>
                    ) : null}

                    {grupos.map((grupo) => {
                      const huerfano = grupo.clave === SIN_PROVEEDOR;
                      const abierto = grupoAbierto(grupo.clave);
                      return (
                        <section key={grupo.clave} className="costo-grupo" style={{ ...seccion, overflow: "hidden", borderColor: huerfano ? C.redB : C.border }}>
                          <button type="button" onClick={() => setAbiertos((prev) => ({ ...prev, [grupo.clave]: !abierto }))} style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                            border: "none", background: huerfano ? C.redL : C.panelSolid, color: C.text,
                            cursor: "pointer", textAlign: "left", fontFamily: C.sans,
                          }}>
                            <span
                              role="checkbox"
                              tabIndex={0}
                              aria-checked={grupo.items.every((fila) => seleccion.has(fila.material.id))}
                              onClick={(evento) => { evento.stopPropagation(); alternarGrupo(grupo.items); }}
                              onKeyDown={(evento) => { if (evento.key === " " || evento.key === "Enter") { evento.stopPropagation(); evento.preventDefault(); alternarGrupo(grupo.items); } }}
                              title="Seleccionar todo el grupo"
                              style={{
                                width: 17, height: 17, borderRadius: 5, flexShrink: 0, cursor: "pointer",
                                display: "grid", placeItems: "center", boxSizing: "border-box",
                                border: `1px solid ${grupo.items.every((fila) => seleccion.has(fila.material.id)) ? C.blueB : C.border2}`,
                                background: grupo.items.every((fila) => seleccion.has(fila.material.id)) ? C.blue : C.panelSolid,
                                color: "var(--inverse-text)",
                              }}
                            >
                              {grupo.items.every((fila) => seleccion.has(fila.material.id)) ? <Check size={11} /> : null}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 950, color: huerfano ? C.red : C.text }}>
                                {huerfano ? "Sin proveedor asignado" : grupo.proveedor}
                              </div>
                              <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 750, marginTop: 2 }}>
                                {huerfano
                                  ? "No entran en ningún pedido hasta que se les asigne uno"
                                  : `${grupo.items.length} artículo${grupo.items.length === 1 ? "" : "s"} para cotizar`}
                              </div>
                            </div>
                            <Chip color={huerfano ? C.red : C.blue} soft={huerfano ? C.redL : C.blueL} border={huerfano ? C.redB : C.blueB}>
                              {grupo.items.length}
                            </Chip>
                            {!huerfano ? (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(event) => { event.stopPropagation(); exportarGrupo(grupo); }}
                                onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); exportarGrupo(grupo); } }}
                                title={`Bajar la lista para mandarle a ${grupo.proveedor}`}
                                style={{ border: `1px solid ${C.border2}`, background: C.panel, color: C.text, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                              >
                                <Send size={12} /> Pedir precios
                              </span>
                            ) : null}
                            <ChevronDown size={15} color={C.dim} style={{ transform: abierto ? "rotate(180deg)" : "none", transition: "transform .16s", flexShrink: 0 }} />
                          </button>

                          {abierto ? (
                            <div style={{ display: "grid" }}>
                              {grupo.items.map((fila) => (
                                <div key={fila.material.id} className="costo-fila" style={{
                                  display: "grid",
                                  gridTemplateColumns: isMobile ? "26px minmax(0,1fr) 150px" : "26px minmax(0,1fr) 90px 150px",
                                  gap: 10, alignItems: "center", padding: "9px 14px",
                                  borderTop: `1px solid ${C.border}`,
                                  background: seleccion.has(fila.material.id) ? C.blueL : "transparent",
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={seleccion.has(fila.material.id)}
                                    onChange={() => alternarSeleccion(fila.material.id)}
                                    aria-label={`Seleccionar ${fila.material.descripcion}`}
                                    style={{ width: 15, height: 15, accentColor: C.blue, cursor: "pointer" }}
                                  />
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {fila.material.descripcion}
                                    </div>
                                    <div style={{ color: C.dim, fontSize: 11, fontWeight: 700, marginTop: 1 }}>
                                      {fila.rubro}{fila.material.codigo ? ` · ${fila.material.codigo}` : ""}
                                    </div>
                                    {/* Los precios que ya tiene de otros proveedores, para
                                        poder comparar mientras se carga el de éste. */}
                                    {fila.precios.length ? (
                                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
                                        {fila.precios.map((otro, j) => (
                                          <span key={`${otro.proveedorId || "x"}-${j}`} style={{ color: otro === fila.barato && fila.precios.length > 1 ? C.green : C.muted, fontSize: 10.5, fontWeight: 800, fontFamily: C.mono }}>
                                            {otro.proveedor || "sin proveedor"}: {fmt(otro.precio, otro.moneda)}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                  {!isMobile ? (
                                    <div style={{ textAlign: "right", color: C.muted, fontFamily: C.mono, fontSize: 12 }}>
                                      {fila.cantidad} {fila.material.unidad_medida || "u"}
                                    </div>
                                  ) : null}
                                  <CampoPrecio
                                    fila={fila}
                                    grupo={grupo}
                                    cargado={reciencargados.get(`${fila.material.id}|${grupo.clave}`)}
                                    ocupado={ocupado === `precio-${fila.material.id}-${grupo.clave}`}
                                    onGuardar={guardarPrecio}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}

                    {/* Vacío por filtro y vacío de verdad no son lo mismo: con
                        una búsqueda puesta, "no falta ningún precio" sería
                        mentira y de las peligrosas. */}
                    {!grupos.length && !filasRecuperables.length ? (
                      filtrando ? (
                        <div style={{ ...seccion, padding: 30, textAlign: "center" }}>
                          <Search size={20} color={C.dim} style={{ marginBottom: 8 }} />
                          <div style={{ fontSize: 13.5, fontWeight: 900 }}>Nada sin precio con ese filtro</div>
                          <div style={{ color: C.dim, fontSize: 12.5, marginTop: 4 }}>
                            El K{modelo} tiene {faltantesTotales} materiales sin precio, pero ninguno coincide.
                          </div>
                          <button type="button" onClick={() => { setBusca(""); setFiltroRubro(null); }} style={{
                            marginTop: 12, border: `1px solid ${C.border2}`, background: C.panel, color: C.text,
                            borderRadius: 9, padding: "8px 13px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850,
                          }}>
                            Ver todos
                          </button>
                        </div>
                      ) : (
                        <div style={{ ...seccion, padding: 34, textAlign: "center" }}>
                          <Check size={22} color={C.green} style={{ marginBottom: 8 }} />
                          <div style={{ fontSize: 14, fontWeight: 900 }}>No falta ningún precio</div>
                          <div style={{ color: C.dim, fontSize: 12.5, marginTop: 4 }}>El costo del K{modelo} está completo.</div>
                        </div>
                      )
                    ) : null}
                  </div>
                ) : null}

                <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 700, lineHeight: 1.55, padding: "0 2px 6px" }}>
                  <Download size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
                  El costo se guarda en pesos y en dólares por separado. El total unificado se calcula al vuelo con
                  el oficial vendedor y no queda registrado: así nadie termina costeando con una cotización de hace
                  un mes sin darse cuenta.
                </div>
              </>
            )}
          </div>
          {/* ── BARRA DE SELECCIÓN ────────────────────────────────────────
              Aparece sólo cuando hay algo tildado y se apoya abajo, sobre el
              contenido: el desplegable de proveedor vive acá y no repetido en
              cada fila, que era lo que ensuciaba la lista. */}
          {seleccion.size && tab === "faltan" ? (
            <div style={{
              flexShrink: 0,
              margin: isMobile ? "0 10px 10px" : "0 16px 14px",
              animation: "costo-barra .16s ease-out",
              border: `1px solid ${modoProveedor === "quitar" ? C.redB : C.blueB}`, background: C.panelSolid, borderRadius: 12,
              boxShadow: "0 12px 34px var(--shadow)",
              padding: isMobile ? 10 : "10px 14px",
              display: "grid", gap: 7,
            }}>
              {/* Los controles en un renglón y la explicación abajo. Cuando la
                  frase compartía la fila, empujaba el desplegable a una segunda
                  línea en cuanto la ventana no era ancha. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Chip color={C.blue} soft={C.blueL} border={C.blueB}>
                {seleccion.size} seleccionado{seleccion.size === 1 ? "" : "s"}
              </Chip>
              {/* Qué se le va a hacer a lo tildado. Va ANTES del desplegable
                  porque el desplegable dispara: hay que elegir el modo primero
                  o se pisa el proveedor de veinte materiales sin querer. */}
              <div style={{ display: "flex", gap: 3, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: 3 }}>
                {[
                  { id: "sumar", label: "Agregar proveedor", corto: "Sumar", ayuda: "Se suma a los proveedores que ya tenga. Un material puede tener los que haga falta" },
                  { id: "quitar", label: "Quitar proveedor", corto: "Sacar", ayuda: "Le saca ese proveedor a los seleccionados. El precio cargado no se borra" },
                ].map((opcion) => {
                  const activo = modoProveedor === opcion.id;
                  const quita = opcion.id === "quitar";
                  return (
                    <button key={opcion.id} type="button" onClick={() => { setModoProveedor(opcion.id); setElegidos([]); }} title={opcion.ayuda} style={{
                      border: "none",
                      background: activo ? (quita ? C.redL : C.blueL) : "transparent",
                      color: activo ? (quita ? C.red : C.blue) : C.dim,
                      borderRadius: 7, padding: "6px 10px", cursor: "pointer", fontFamily: C.sans,
                      fontSize: 11.5, fontWeight: 900, whiteSpace: "nowrap",
                    }}>
                      {isMobile ? opcion.corto : opcion.label}
                    </button>
                  );
                })}
              </div>
              <span style={{ flex: 1, minWidth: 0 }} />
              {ocupado === "masivo" ? <LoaderCircle size={15} className="spin" style={{ color: C.blue }} /> : null}
              {/* El desplegable SUMA a la tanda, no aplica. Elegir uno y que se
                  guarde solo obligaba a rehacer toda la selección para el
                  segundo proveedor. */}
              <select
                value=""
                disabled={ocupado === "masivo"}
                onChange={(evento) => {
                  const valor = evento.target.value;
                  if (!valor) return;
                  if (valor === "__nuevo__") setNuevoProveedor({ destino: "seleccion" });
                  else elegirProveedor(proveedoresActivos.find((row) => row.id === valor));
                }}
                style={{
                  border: `1px solid ${modoProveedor === "quitar" ? C.redB : C.blueB}`,
                  background: modoProveedor === "quitar" ? C.redL : C.blueL,
                  color: modoProveedor === "quitar" ? C.red : C.blue,
                  borderRadius: 9,
                  padding: "8px 10px", fontFamily: C.sans, fontSize: 12.5, fontWeight: 900,
                  outline: "none", cursor: "pointer",
                  // En el teléfono se lleva un renglón entero: si comparte con
                  // el contador y "Limpiar" no entra ninguno de los tres.
                  ...(isMobile ? { flex: "1 1 100%", minWidth: 0, order: 1 } : { minWidth: 190 }),
                }}
              >
                <option value="">{elegidos.length ? "Sumar otro proveedor…" : modoProveedor === "quitar" ? "Elegir proveedor…" : "Elegir proveedor…"}</option>
                {proveedoresActivos
                  .filter((proveedor) => !elegidos.some((row) => row.id === proveedor.id))
                  .map((proveedor) => (
                    <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                  ))}
                {modoProveedor !== "quitar" ? <option value="__nuevo__">+ Crear proveedor nuevo…</option> : null}
              </select>
              <button
                type="button"
                onClick={aplicarProveedores}
                disabled={!elegidos.length || ocupado === "masivo"}
                style={{
                  border: `1px solid ${elegidos.length ? (modoProveedor === "quitar" ? C.redB : C.blueB) : C.border}`,
                  background: elegidos.length ? (modoProveedor === "quitar" ? C.red : C.blue) : C.panel,
                  color: elegidos.length ? "var(--inverse-text)" : C.dim,
                  borderRadius: 9, padding: "8px 13px", fontFamily: C.sans, fontSize: 12.5, fontWeight: 900,
                  cursor: elegidos.length && ocupado !== "masivo" ? "pointer" : "default", whiteSpace: "nowrap",
                }}
              >
                {modoProveedor === "quitar" ? "Quitar" : "Agregar"}
                {elegidos.length > 1 ? ` los ${elegidos.length}` : ""}
              </button>
              <button type="button" onClick={() => { setSeleccion(new Set()); setElegidos([]); }} style={{ border: `1px solid ${C.border2}`, background: C.panel, color: C.muted, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850, marginLeft: isMobile ? "auto" : 0 }}>
                Limpiar
              </button>
              </div>

              {/* Lo que se va a aplicar, a la vista y sacable de a uno. */}
              {elegidos.length ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {elegidos.map((proveedor) => (
                    <span key={proveedor.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      border: `1px solid ${modoProveedor === "quitar" ? C.redB : C.blueB}`,
                      background: modoProveedor === "quitar" ? C.redL : C.blueL,
                      color: modoProveedor === "quitar" ? C.red : C.blue,
                      borderRadius: 999, padding: "3px 5px 3px 10px", fontSize: 11.5, fontWeight: 900,
                    }}>
                      {proveedor.nombre}
                      <button
                        type="button"
                        onClick={() => setElegidos((actual) => actual.filter((row) => row.id !== proveedor.id))}
                        aria-label={`Sacar ${proveedor.nombre} de la tanda`}
                        style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", padding: 2 }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div style={{ color: modoProveedor === "quitar" ? C.red : C.muted, fontSize: 11.5, fontWeight: 750, paddingLeft: 2 }}>
                {modoProveedor === "quitar"
                  ? "Se les sacan a los que los tengan. El precio que haya cargado no se borra."
                  : elegidos.length > 1
                    ? `Los ${elegidos.length} quedan como proveedores de cada material: después se les pide precio a todos y se compara.`
                    : "Se suma a los que ya tengan. Podés elegir varios antes de aplicar."}
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
