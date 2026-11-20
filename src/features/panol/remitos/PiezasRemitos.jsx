import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, ChevronRight, ExternalLink, FileImage, FileText, Folder, FolderOpen, Inbox, LoaderCircle,
  PackageCheck, Pencil, RefreshCw, ScanLine, Ship, Trash2, Usb, X,
} from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import useDialogo from "@/features/consumibles/useDialogo";
import SelectorDestinosRemito from "@/features/panol/SelectorDestinosRemito";
import DestinosDeRemito from "@/features/panol/DestinosDeRemito";
import { carpetaFisicaDeRemito, carpetaParaMostrar, normalizarCarpetas } from "@/features/panol/carpetaRemitos";
import { urlDeRemito } from "@/features/panol/remitosArchivoApi";
import {
  CON_INGRESO, SIN_CLASIFICAR, TODOS, VISTAS, carpetasDe, destinoCorto, detalleDeRemito, fechaCorta, fechaDeRemito, nombreDeRemito, obrasDe,
} from "./archivoRemitos";

const esImagen = (mime = "", nombre = "") => String(mime).startsWith("image/") || /\.(jpe?g|png|webp|tiff?)$/i.test(nombre);

function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
  return `${(v / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function fechaHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
}

/** Hoja lateral en la PC, hoja inferior en el celular. */
export function Hoja({ titulo, sub, onCerrar, pie, chica = false, children }) {
  const ref = useRef(null);
  useDialogo(ref, onCerrar);
  return (
    <div className="rmt-capa" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className={`rmt-hoja${chica ? " is-chica" : ""}`} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1}>
        <div className="rmt-hoja-cab">
          <div style={{ minWidth: 0 }}>
            <div className="rmt-hoja-titulo">{titulo}</div>
            {sub ? <div className="rmt-hoja-sub">{sub}</div> : null}
          </div>
          <button type="button" className="rmt-cerrar" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="rmt-hoja-cuerpo">{children}</div>
        {pie ? <div className="rmt-hoja-pie">{pie}</div> : null}
      </div>
    </div>
  );
}

/** Dónde está un remito: barcos, carpetas y, si lo tiene, el ingreso. */
export function Lugares({ remito, conIngreso = true }) {
  const obras = obrasDe(remito);
  const carpetas = carpetasDe(remito);
  return (
    <span className="rmt-lugares">
      {obras.map((o) => <span key={`o-${o.id || o.codigo}`} className="rmt-lugar is-barco" title={`Barco ${o.codigo}`}>{o.codigo}</span>)}
      {carpetas.map((c) => <span key={`c-${c}`} className="rmt-lugar is-carpeta" title="Carpeta">{c}</span>)}
      {!obras.length && !carpetas.length ? <span className="rmt-lugar is-suelto" title="Sin barco ni carpeta">sin clasificar</span> : null}
      {conIngreso && remito.panol_envio_id ? <span className="rmt-lugar is-ingreso" title="Un ingreso de materiales quedó atado a este remito">con ingreso</span> : null}
    </span>
  );
}

export function FilaRemito({ remito, onAbrir }) {
  const Icono = esImagen(remito.archivo_mime, remito.archivo_nombre) ? FileImage : FileText;
  return (
    <button type="button" className="rmt-fila" onClick={() => onAbrir(remito)}>
      <span className="rmt-doc" aria-hidden="true"><Icono size={18} /></span>
      <span style={{ minWidth: 0 }}>
        <span className="rmt-nombre">{nombreDeRemito(remito)}</span>
        <span className="rmt-detalle" style={{ display: "block" }}>{detalleDeRemito(remito)}{remito.notas ? ` · ${remito.notas}` : ""}</span>
      </span>
      <span className="rmt-fecha">{fechaCorta(fechaDeRemito(remito))}</span>
      <Lugares remito={remito} />
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

/** Las carpetas: por barco, proveedor o carpeta propia, más los atajos. */
export function PanelCarpetas({ vista, onVista, grupos, carpeta, onCarpeta, totales, cargando = false }) {
  const IconoCarpeta = vista === "barco" ? Ship : Folder;
  const atajo = (key, titulo, total, Icono, alerta = false) => (
    <button
      key={key}
      type="button"
      className={`rmt-carpeta${carpeta === key ? " is-activa" : ""}${alerta && total ? " is-alerta" : ""}`}
      aria-current={carpeta === key ? "true" : undefined}
      onClick={() => onCarpeta(key)}
    >
      <Icono size={15} aria-hidden="true" />
      <span className="rmt-carpeta-nombre">{titulo}</span>
      <span className="rmt-cuenta">{cargando ? "" : total}</span>
    </button>
  );
  return (
    <>
      <div className="rmt-grupo">
        {atajo(TODOS, "Todos", totales.todos, Inbox)}
        {atajo(SIN_CLASIFICAR, "Sin clasificar", totales.sinClasificar, FolderOpen, true)}
        {atajo(CON_INGRESO, "Con ingreso", totales.conIngreso, PackageCheck)}
      </div>
      <div className="rmt-vistas" role="tablist" aria-label="Ver por">
        {VISTAS.map((v) => (
          <button key={v.valor} type="button" role="tab" aria-selected={vista === v.valor} className={`rmt-vista${vista === v.valor ? " is-activa" : ""}`} onClick={() => onVista(v.valor)}>
            {v.etiqueta}
          </button>
        ))}
      </div>
      {cargando ? null : !grupos.length ? (
        <div className="rmt-aside-vacio">
          {vista === "carpeta" ? "Todavía no hay carpetas propias. Se crean al guardar un remito." : "Nada para mostrar todavía."}
        </div>
      ) : grupos.map((g) => (
        <div key={g.titulo || "unico"} className="rmt-grupo">
          {g.titulo ? <div className="rmt-rotulo">{g.titulo}</div> : null}
          {g.carpetas.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`rmt-carpeta${carpeta === c.key ? " is-activa" : ""}`}
              aria-current={carpeta === c.key ? "true" : undefined}
              onClick={() => onCarpeta(c.key)}
            >
              <IconoCarpeta size={15} aria-hidden="true" />
              <span className="rmt-carpeta-nombre">{c.titulo}</span>
              <span className="rmt-cuenta">{c.total}</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

/** Los PDF que dejó la Pantum en esta PC y todavía no se guardaron. */
export function PendientesPC({ archivos, contextoDe, ocupado, puedeGuardar, onGuardar, onCambiar, onSacar }) {
  if (!archivos.length) return null;
  return (
    <section className="rmt-pc" aria-label="Escaneados en esta PC">
      <div className="rmt-pc-cab">
        <ScanLine size={16} aria-hidden="true" />
        <span>Escaneados en esta PC, sin guardar</span>
        <small>{archivos.length}</small>
      </div>
      {archivos.map((a) => {
        const contexto = contextoDe(a);
        const este = ocupado === a.id;
        return (
          <div key={a.id} className="rmt-pc-fila">
            <span className="rmt-doc" aria-hidden="true"><FileText size={18} /></span>
            <div className="rmt-pc-texto">
              <strong>{a.name}</strong>
              <span>
                {fmtBytes(a.size)} · {fechaHora(a.updatedAt)}
                {contexto ? <span className="rmt-lugar is-barco">{destinoCorto(contexto)}</span> : <span className="rmt-lugar is-suelto">sin datos: se preguntan</span>}
              </span>
            </div>
            <button type="button" className="ui-btn ui-btn-primario" disabled={Boolean(ocupado) || !puedeGuardar} onClick={() => onGuardar(a, contexto)}>
              {este ? <LoaderCircle size={14} className="spin" /> : null}
              {este ? "Guardando…" : "Guardar"}
            </button>
            {contexto ? (
              <button type="button" className="ui-btn" disabled={Boolean(ocupado)} onClick={() => onCambiar(a, contexto)} title="Cambiar barco, carpeta o proveedor antes de guardar">
                <Pencil size={13} /> Cambiar datos
              </button>
            ) : null}
            <button type="button" className="ui-btn ui-btn-icono ui-btn-fantasma" disabled={Boolean(ocupado)} onClick={() => onSacar(a)} aria-label={`Sacar ${a.name} sin guardarlo`} title="Sacarlo de Pendientes sin guardarlo">
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </section>
  );
}

/**
 * Los datos de un remito: al guardar uno nuevo, antes de escanear o para
 * corregir uno guardado. La pregunta principal es dónde se guarda.
 *
 * modo: "escanear" | "nuevo" | "editar"
 */
export function HojaDatos({
  modo = "nuevo", inicial = {}, archivoNombre = "", obras = [], cargandoObras = false, proveedores = [], carpetasConocidas = [],
  puedeReasignar = true, guardando = false, onGuardar, onCerrar,
}) {
  const editar = modo === "editar";
  const [proveedor, setProveedor] = useState(inicial.proveedor || "");
  const [numero, setNumero] = useState(inicial.numero || "");
  const [titulo, setTitulo] = useState(inicial.titulo || "");
  const [notas, setNotas] = useState(inicial.notas || "");
  const [obraIds, setObraIds] = useState(() => (inicial.obras || []).map((o) => String(o.id)).filter(Boolean));
  const [carpetas, setCarpetas] = useState(() => normalizarCarpetas(inicial.carpetas || []));
  const [origen, setOrigen] = useState(inicial.origen || "glass");
  const moverLugares = !editar || puedeReasignar;

  const obrasElegidas = useMemo(() => {
    const porId = new Map(obras.map((o) => [String(o.id), o]));
    for (const o of inicial.obras || []) if (o?.id) porId.set(String(o.id), o);
    return obraIds.map((id) => porId.get(String(id))).filter(Boolean);
  }, [obras, obraIds, inicial.obras]);

  function guardar() {
    if (guardando) return;
    onGuardar({
      proveedor: proveedor.trim(),
      numero: numero.trim(),
      titulo: titulo.trim(),
      notas: notas.trim(),
      obras: obrasElegidas,
      obraIds,
      carpetas,
      origen,
      carpetaFisica: carpetaFisicaDeRemito({ obras: obrasElegidas, carpetas, proveedor }),
    });
  }

  const encabezado = modo === "escanear" ? "Escanear un remito" : editar ? "Datos del remito" : "Guardar el remito";
  const accion = modo === "escanear" ? "Escanear y guardar" : editar ? "Guardar cambios" : "Guardar";

  return (
    <Hoja
      titulo={encabezado}
      sub={archivoNombre}
      onCerrar={() => { if (!guardando) onCerrar(); }}
      chica
      pie={(
        <>
          <button type="button" className="ui-btn" disabled={guardando} onClick={onCerrar}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" disabled={guardando || (moverLugares && cargandoObras)} onClick={guardar}>
            {guardando ? <LoaderCircle size={14} className="spin" /> : modo === "escanear" ? <ScanLine size={14} /> : null}
            {accion}
          </button>
        </>
      )}
    >
      {modo === "escanear" ? (
        <div className="rmt-campo">
          <span className="rmt-campo-titulo">De dónde</span>
          <div className="rmt-vistas" role="radiogroup" aria-label="De dónde se escanea" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {[["glass", "Vidrio · una hoja"], ["feeder", "Alimentador · varias"]].map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={origen === v} className={`rmt-vista${origen === v ? " is-activa" : ""}`} onClick={() => setOrigen(v)}>{t}</button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rmt-campo">
        <label htmlFor="rmt-proveedor">Proveedor</label>
        <input id="rmt-proveedor" className="ui-input" value={proveedor} onChange={(e) => setProveedor(e.target.value)} list="rmt-proveedores" autoComplete="off" />
        <datalist id="rmt-proveedores">{proveedores.map((n) => <option key={n} value={n} />)}</datalist>
      </div>

      <div className={editar ? "rmt-campos-2" : "rmt-campo"} style={editar ? undefined : { display: "contents" }}>
        {editar ? (
          <div className="rmt-campo">
            <label htmlFor="rmt-numero">Número</label>
            <input id="rmt-numero" className="ui-input" value={numero} onChange={(e) => setNumero(e.target.value)} autoComplete="off" />
          </div>
        ) : null}
        <div className="rmt-campo">
          <label htmlFor="rmt-titulo">Referencia</label>
          <input id="rmt-titulo" className="ui-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoComplete="off" />
        </div>
      </div>

      {moverLugares ? (
        <div className="rmt-campo">
          <span className="rmt-campo-titulo">Dónde se guarda</span>
          <SelectorDestinosRemito
            obras={obras}
            obraIds={obraIds}
            onObrasChange={setObraIds}
            carpetas={carpetas}
            onCarpetasChange={setCarpetas}
            carpetasConocidas={carpetasConocidas}
            proveedor={proveedor}
            cargando={cargandoObras}
            disabled={guardando}
          />
        </div>
      ) : null}

      <DestinosDeRemito
        obras={obrasElegidas}
        carpetas={carpetas}
        proveedor={proveedor}
        mostrarRutaFisica={modo === "escanear"}
        titulo={editar && !moverLugares ? "Aparece en" : "Se va a poder encontrar en"}
      />

      <div className="rmt-campo">
        <label htmlFor="rmt-notas">Nota</label>
        <textarea id="rmt-notas" className="ui-input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      {editar && inicial.carpeta_local ? (
        <div className="rmt-pc-ruta">
          <FolderOpen size={13} aria-hidden="true" />
          <span>El PDF de la PC sigue en {carpetaParaMostrar(inicial.carpeta_local)}: cambiar el lugar acá no lo mueve.</span>
        </div>
      ) : null}
    </Hoja>
  );
}

/** Un remito guardado: el papel a la vista y sus datos. */
export function HojaDetalle({ remito, puedeBorrar = false, verPrecios = false, onEditar, onBorrar, onCerrar }) {
  const [url, setUrl] = useState(null);
  const [errorUrl, setErrorUrl] = useState("");
  const imagen = esImagen(remito.archivo_mime, remito.archivo_nombre);

  useEffect(() => {
    let vivo = true;
    if (!remito.archivo_url) return undefined;
    urlDeRemito(remito.archivo_url)
      .then((u) => { if (vivo) setUrl(u || ""); })
      .catch((e) => { if (vivo) setErrorUrl(e?.message || "No se pudo abrir el archivo."); });
    return () => { vivo = false; };
  }, [remito.archivo_url]);

  const total = verPrecios && remito.total != null && remito.total !== "" && Number.isFinite(Number(remito.total))
    ? `${remito.moneda === "USD" ? "US$" : "$"} ${Number(remito.total).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "";

  return (
    <Hoja
      titulo={nombreDeRemito(remito)}
      sub={detalleDeRemito(remito)}
      onCerrar={onCerrar}
      pie={(
        <>
          {puedeBorrar ? (
            <button type="button" className="ui-btn ui-btn-fantasma rmt-izq" style={{ color: "var(--red)" }} onClick={onBorrar}>
              <Trash2 size={14} /> Borrar
            </button>
          ) : null}
          {url ? (
            <a className="ui-btn" href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} /> Abrir
            </a>
          ) : null}
          <button type="button" className="ui-btn ui-btn-primario" onClick={onEditar}>
            <Pencil size={14} /> Editar datos
          </button>
        </>
      )}
    >
      <div className="rmt-previa">
        {!remito.archivo_url ? (
          <div className="rmt-previa-nada">Este remito no tiene archivo guardado.</div>
        ) : errorUrl ? (
          <div className="rmt-previa-nada">{errorUrl}</div>
        ) : url == null ? (
          <Cargando texto="Abriendo el papel…" compacto />
        ) : imagen ? (
          <img src={url} alt={`Remito ${nombreDeRemito(remito)}`} />
        ) : (
          <iframe src={`${url}#view=FitH&toolbar=0`} title={`Remito ${nombreDeRemito(remito)}`} />
        )}
      </div>

      <div className="rmt-datos">
        <div className="rmt-dato"><span>Fecha</span><strong>{fechaCorta(fechaDeRemito(remito)) || "—"}</strong></div>
        <div className="rmt-dato"><span>Número</span><strong>{remito.numero || "—"}</strong></div>
        <div className="rmt-dato"><span>Guardado</span><strong>{fechaHora(remito.created_at) || "—"}</strong></div>
        {total ? <div className="rmt-dato"><span>Total</span><strong>{total}</strong></div> : null}
      </div>

      <div className="rmt-campo">
        <span className="rmt-campo-titulo">Dónde está</span>
        <Lugares remito={remito} conIngreso={false} />
        {remito.proveedor ? <span className="rmt-hoja-sub" style={{ marginTop: 0 }}>Y en la carpeta del proveedor {remito.proveedor}.</span> : null}
      </div>

      {remito.panol_envio_id ? (
        <Link className="rmt-aviso is-azul" style={{ marginTop: 0, textDecoration: "none" }} to={`/recepcion-panol?tab=recepcion&envio=${remito.panol_envio_id}`}>
          <PackageCheck size={17} aria-hidden="true" />
          <span className="rmt-aviso-texto"><strong>Tiene un ingreso atado.</strong> Ver qué entró con este remito.</span>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      ) : null}

      {remito.notas ? (
        <div className="rmt-campo">
          <span className="rmt-campo-titulo">Nota</span>
          <div className="rmt-nota">{remito.notas}</div>
        </div>
      ) : null}

      {remito.carpeta_local ? (
        <div className="rmt-pc-ruta">
          <FolderOpen size={13} aria-hidden="true" />
          <span>En la PC del pañol: {carpetaParaMostrar(remito.carpeta_local)}</span>
        </div>
      ) : null}
    </Hoja>
  );
}

/** El escáner de esta PC: conectado, sin vincular o sin puente. */
export function HojaEscaner({ escaner, onAbrirCarpeta, onCerrar }) {
  const [codigo, setCodigo] = useState(escaner.codigo || "");
  const [vinculando, setVinculando] = useState(false);
  async function vincular() {
    setVinculando(true);
    try { await escaner.vincular(codigo); } finally { setVinculando(false); }
  }
  const textos = {
    conectado: ["Escáner conectado", `La Pantum de esta PC está lista${escaner.version ? ` (puente ${escaner.version})` : ""}. Lo que se escanea aparece en la lista para guardarlo.`],
    sin_vincular: ["Falta vincular el puente", "El puente del escáner está abierto en esta PC pero falta el código. Copialo de la ventana de Klasea Scanner."],
    sin_puente: ["Esta PC no tiene el escáner", "El escáner está en la PC del pañol. Desde acá se puede subir un PDF o una foto del remito. Si esta es la PC del escáner, abrí KlaseaScannerBridge y, si Chrome pregunta por dispositivos de la red local, elegí Permitir."],
    buscando: ["Buscando el escáner…", ""],
  };
  const [titulo, texto] = textos[escaner.estado] || textos.buscando;
  return (
    <Hoja titulo={titulo} sub="KlaseaScannerBridge · Pantum" onCerrar={onCerrar} chica>
      {texto ? <p className="rmt-nota" style={{ margin: 0 }}>{texto}</p> : null}
      {escaner.ultimoError ? (
        <div className="rmt-aviso is-rojo" style={{ marginTop: 0 }}>
          <span className="rmt-aviso-texto"><strong>El último escaneo no terminó.</strong> {escaner.ultimoError}</span>
        </div>
      ) : null}
      {escaner.estado !== "conectado" ? (
        <div className="rmt-campo">
          <label htmlFor="rmt-codigo">Código de vinculación</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input id="rmt-codigo" className="ui-input" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} autoComplete="off" style={{ fontFamily: "'JetBrains Mono', monospace", flex: 1, minWidth: 0 }} />
            <button type="button" className="ui-btn ui-btn-primario" disabled={vinculando || !codigo.trim()} onClick={vincular}>
              {vinculando ? <LoaderCircle size={14} className="spin" /> : <Usb size={14} />} Vincular
            </button>
          </div>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="ui-btn" onClick={() => escaner.cargar()}>
          <RefreshCw size={14} /> Volver a buscar
        </button>
        {escaner.conectado ? (
          <button type="button" className="ui-btn" onClick={onAbrirCarpeta}>
            <FolderOpen size={14} /> Abrir la carpeta del escáner
          </button>
        ) : (
          <a className="ui-btn" href="http://127.0.0.1:17778/health" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Probar el puente
          </a>
        )}
      </div>
    </Hoja>
  );
}
