import { useMemo, useState } from "react";
import { Inbox, Plus, Users } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { ESTADOS, destinoDe, estaCerrado, textoPlano, useVistaPedidos } from "../modulo";
import { Buscar, Cabecera, Grupo, PedidosEnVista, SelectorVista, Vacio } from "../ui";

// Lo que ve quien le pide a Compras: sus pedidos (o en los que está en copia),
// agrupados por el paso en que van, para saber de un vistazo qué falta.
export default function MisPedidos({ modo = "mine", requests, profile, sinLeer, loading, error, onAbrir, onNuevo }) {
  const [q, setQ] = useState("");
  const [ver, setVer] = useState("curso");
  const [vista, setVista] = useVistaPedidos("mis-pedidos", "tarjetas");

  const base = useMemo(() => (modo === "mine"
    ? requests.filter((r) => r.created_by === profile?.id)
    : requests.filter((r) => (r.followers || []).some((f) => f.user_id === profile?.id))), [requests, modo, profile?.id]);

  const enCurso = base.filter((r) => !estaCerrado(r));
  const cerrados = base.length - enCurso.length;
  const enCamino = enCurso.filter((r) => r.status === "comprado").length;
  const conMensajes = base.filter((r) => sinLeer.has(r.id)).length;

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return base
      .filter((r) => (ver === "curso" ? !estaCerrado(r) : ver === "cerrados" ? estaCerrado(r) : true))
      .filter((r) => !t || `${r.title || ""} ${textoPlano(r.description)} ${destinoDe(r)} ${r.proveedor || ""} ${r.creator?.username || ""}`.toLowerCase().includes(t));
  }, [base, ver, q]);

  const grupos = ESTADOS
    .map((e) => ({ ...e, items: visibles.filter((r) => r.status === e.value) }))
    .filter((g) => g.items.length);

  const esMio = modo === "mine";

  return (
    <>
      <Cabecera
        eyebrow="Pedidos a Compras"
        titulo={esMio ? "Mis" : "Pedidos en"}
        acento={esMio ? "pedidos" : "copia"}
        sub={base.length ? (
          <>
            <b className="mono">{enCurso.length}</b> en curso
            {enCamino > 0 && <> · <b className="mono t" data-tono="naranja">{enCamino}</b> {enCamino === 1 ? "comprado, en camino" : "comprados, en camino"}</>}
            {conMensajes > 0 && <> · <b className="mono t" data-tono="violeta">{conMensajes}</b> con mensajes nuevos</>}
          </>
        ) : (esMio ? "Todavía no hiciste ningún pedido." : "Nadie te sumó en copia todavía.")}
        acciones={esMio ? (
          <button type="button" className="ui-btn ui-btn-primario" onClick={onNuevo}><Plus size={15} /> Nuevo pedido</button>
        ) : null}
      />

      {base.length > 0 && (
        <div className="cmp-filtros">
          <Buscar value={q} onChange={setQ} placeholder="Buscar pedido, obra, proveedor…" />
          <div className="cmp-seg" role="radiogroup" aria-label="Qué pedidos ver">
            {[["curso", "En curso", enCurso.length], ["cerrados", "Recibidos y cancelados", cerrados], ["todos", "Todos", base.length]].map(([v, l, n]) => (
              <button key={v} type="button" role="radio" aria-checked={ver === v} className={ver === v ? "on" : ""} onClick={() => setVer(v)}>
                {l} <span className="n">{n}</span>
              </button>
            ))}
          </div>
          <SelectorVista vista={vista} onCambiar={setVista} />
        </div>
      )}

      {loading ? (
        <Cargando texto="Trayendo tus pedidos…" />
      ) : error ? (
        <Vacio icono={Inbox} titulo="No se pudieron traer los pedidos" texto={error} />
      ) : !base.length ? (
        <Vacio
          icono={esMio ? Inbox : Users}
          titulo={esMio ? "Pedile a Compras lo que necesites" : "Sin pedidos en copia"}
          texto={esMio
            ? "Armá el pedido con lo que hace falta y para qué obra. Desde acá seguís cada paso: cuándo lo revisan, cuándo se compra y cuándo llega."
            : "Cuando alguien te sume en copia a un pedido, lo vas a ver acá con sus novedades."}
        >
          {esMio && <button type="button" className="ui-btn ui-btn-primario" onClick={onNuevo}><Plus size={15} /> Hacer un pedido</button>}
        </Vacio>
      ) : !visibles.length ? (
        <Vacio
          icono={Inbox}
          titulo={q.trim() ? `Nada coincide con «${q.trim()}»` : ver === "curso" ? "No tenés pedidos en curso" : "No hay pedidos cerrados"}
          texto={ver === "curso" && cerrados ? "Los recibidos y cancelados están en la otra solapa." : null}
        />
      ) : (
        <div className="cmp-grupos">
          {grupos.map((g) => (
            <Grupo key={g.value} titulo={g.label} texto={g.ayuda} cuenta={g.items.length} tono={g.tono}>
              <PedidosEnVista vista={vista} pedidos={g.items} sinLeer={sinLeer} mostrarCreador={!esMio} onAbrir={onAbrir} />
            </Grupo>
          ))}
        </div>
      )}
    </>
  );
}
