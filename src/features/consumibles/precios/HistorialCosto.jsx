import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { preciosApi } from "./preciosApi.js";
import { fechaPrecio, numeroPrecio, pesos } from "./preciosLogica.js";

export default function HistorialCosto({ producto, proveedor, onCerrar }) {
  const [resultado, setResultado] = useState(null);
  const [revision, setRevision] = useState(0);
  const proveedorId = proveedor.proveedor_id;
  const proveedorNombre = proveedor.proveedor_nombre;
  const codigo = producto.codigo;

  useEffect(() => {
    let vigente = true;
    preciosApi.fetchHistorial(codigo, { proveedor_id: proveedorId, proveedor_nombre: proveedorNombre })
      .then((filas) => { if (vigente) setResultado({ revision, filas }); })
      .catch((error) => { if (vigente) setResultado({ revision, error }); });
    return () => { vigente = false; };
  }, [codigo, proveedorId, proveedorNombre, revision]);

  const filas = resultado?.filas ?? [];
  const datos = filas.map((r) => ({ fecha: fechaPrecio(r.lista.vigente_desde), costo: numeroPrecio(r.costo_ars), lista: r.lista.archivo_nombre }));
  const cargando = resultado?.revision !== revision;

  return (
    <section className="precios-panel precios-historial" aria-label={`Historial del código ${codigo}`}>
      <div className="precios-titulo-fila"><div><h3>Historial de costo · <span className="precios-num">{codigo}</span></h3><p className="precios-ayuda">{producto.descripcion} · {proveedorNombre}</p></div><button type="button" className="ui-btn ui-btn-icono ui-btn-fantasma" aria-label="Cerrar historial" onClick={onCerrar}><X size={18} /></button></div>
      {cargando ? <Cargando texto="Trayendo el historial…" /> : resultado.error ? <div role="alert" className="precios-error">{resultado.error.message}<button className="ui-btn" type="button" onClick={() => setRevision(revision + 1)}>Reintentar</button></div> : !filas.length ? <p className="precios-vacio">Este código todavía no tiene listas guardadas para el proveedor.</p> : <>
        {datos.some((d) => d.costo != null) && <div className="precios-grafico" role="img" aria-label="Evolución del costo en pesos por unidad de compra; los valores también están en la tabla">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="fecha" tick={{ fill: "var(--muted)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} minTickGap={25} />
              <YAxis width={72} tick={{ fill: "var(--muted)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => Number(v).toLocaleString("es-AR", { notation: "compact" })} />
              <Tooltip formatter={(v) => [pesos(v), "Costo ARS"]} contentStyle={{ background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }} labelStyle={{ color: "var(--muted)" }} />
              <Line type="linear" dataKey="costo" stroke="var(--blue)" strokeWidth={2} dot={{ fill: "var(--blue)", r: 3 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>}
        <p className="precios-ayuda">Costo por unidad de compra. Los cambios de dólar también cambian el costo en pesos.</p>
        <div className="precios-historial-lista">{filas.map((r) => <div key={r.id}><span><strong className="precios-num">{fechaPrecio(r.lista.vigente_desde)}</strong><small>{r.lista.archivo_nombre || "Lista de precios"}{r.lista.dolar_vendedor && ` · USD vendedor ${pesos(r.lista.dolar_vendedor)}`}</small></span><strong className="precios-num">{pesos(r.costo_ars)}</strong></div>)}</div>
      </>}
    </section>
  );
}
