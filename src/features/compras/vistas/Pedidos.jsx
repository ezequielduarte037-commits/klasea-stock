import { useMemo, useState } from "react";
import { FilterX, Inbox } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { usernameOf } from "../purchaseRequestsApi";
import { ESTADOS, FILTROS_VACIOS, PRIORIDADES, destinoDe, estaCerrado, textoPlano, useVistaPedidos } from "../modulo";
import { Buscar, Cabecera, Chip, Grupo, PedidosEnVista, SelectorVista, Vacio } from "../ui";

const POR_GRUPO = 40;

// Todos los pedidos, con filtros. Los filtros viven en la URL (los maneja la
// pantalla), así un link a una búsqueda se puede compartir.
export default function Pedidos({ requests, users, projects, sinLeer, filtros, setFiltros, loading, error, onAbrir }) {
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [vista, setVista] = useVistaPedidos("pedidos", "tarjetas");
  const set = (patch) => setFiltros((f) => ({ ...f, ...patch }));

  const cuentas = useMemo(() => {
    const c = { activos: 0, todos: requests.length };
    for (const e of ESTADOS) c[e.value] = 0;
    for (const r of requests) {
      c[r.status] = (c[r.status] || 0) + 1;
      if (!estaCerrado(r)) c.activos += 1;
    }
    return c;
  }, [requests]);

  const destinosLibres = useMemo(() => [...new Set(requests.map((r) => r.destino).filter(Boolean))].sort(), [requests]);

  const filtrados = useMemo(() => {
    const q = filtros.q.trim().toLowerCase();
    return requests.filter((r) => {
      if (filtros.status === "activos") { if (estaCerrado(r)) return false; }
      else if (filtros.status !== "todos" && r.status !== filtros.status) return false;
      if (filtros.priority !== "todos" && r.priority !== filtros.priority) return false;
      if (filtros.creator !== "todos" && r.created_by !== filtros.creator) return false;
      if (filtros.project !== "todos") {
        if (filtros.project.startsWith("dest:")) { if ((r.destino || "") !== filtros.project.slice(5)) return false; }
        else if (r.project_id !== filtros.project) return false;
      }
      if (filtros.dateFrom && r.created_at?.slice(0, 10) < filtros.dateFrom) return false;
      if (filtros.dateTo && r.created_at?.slice(0, 10) > filtros.dateTo) return false;
      if (!q) return true;
      return `${r.title || ""} ${textoPlano(r.description)} ${r.creator?.username || ""} ${destinoDe(r)} ${r.proveedor || ""}`.toLowerCase().includes(q);
    });
  }, [requests, filtros]);

  // Agrupado por estado, en el orden del recorrido, cuando se ven varios
  // estados a la vez. Filtrando uno solo, son todos iguales.
  const grupos = useMemo(() => {
    if (!["activos", "todos"].includes(filtros.status)) {
      const e = ESTADOS.find((x) => x.value === filtros.status);
      return [{ key: filtros.status, label: e?.label || filtros.status, tono: e?.tono, items: filtrados }];
    }
    return ESTADOS
      .map((e) => ({ key: e.value, label: e.label, texto: e.ayuda, tono: e.tono, items: filtrados.filter((r) => r.status === e.value) }))
      .filter((g) => g.items.length > 0);
  }, [filtrados, filtros.status]);

  const nFiltros = ["priority", "creator", "project"].filter((k) => filtros[k] !== "todos").length
    + (filtros.dateFrom ? 1 : 0) + (filtros.dateTo ? 1 : 0) + (filtros.q ? 1 : 0);
  const sinLeerVisibles = filtrados.filter((r) => sinLeer.has(r.id)).length;

  return (
    <>
      <Cabecera
        eyebrow="Compras · Pedidos"
        titulo="Todos los"
        acento="pedidos"
        sub={(
          <>
            <b className="mono">{filtrados.length}</b> {filtrados.length === 1 ? "pedido" : "pedidos"} con estos filtros
            {" "}de <b className="mono">{requests.length}</b>
            {sinLeerVisibles > 0 && <> · <b className="mono t" data-tono="violeta">{sinLeerVisibles}</b> con mensajes sin leer</>}
          </>
        )}
      />

      <div className="cmp-filtros desliza" style={{ gap: 2 }}>
        <Chip on={filtros.status === "activos"} cuenta={cuentas.activos} onClick={() => set({ status: "activos" })}>Abiertos</Chip>
        <Chip on={filtros.status === "todos"} cuenta={cuentas.todos} onClick={() => set({ status: "todos" })}>Todos</Chip>
        <span className="cmp-chip-sep" />
        {ESTADOS.map((e) => (
          <Chip key={e.value} on={filtros.status === e.value} tono={e.tono} cuenta={cuentas[e.value] || 0} onClick={() => set({ status: filtros.status === e.value ? "activos" : e.value })}>
            {e.label}
          </Chip>
        ))}
      </div>

      <div className="cmp-filtros">
        <Buscar value={filtros.q} onChange={(v) => set({ q: v })} placeholder="Buscar título, obra, proveedor, persona…" ancho />
        <select className="ui-input" style={{ width: "auto", minHeight: 36 }} value={filtros.priority} onChange={(e) => set({ priority: e.target.value })} aria-label="Prioridad">
          <option value="todos">Toda prioridad</option>
          {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select className="ui-input" style={{ width: "auto", minHeight: 36, maxWidth: 170 }} value={filtros.creator} onChange={(e) => set({ creator: e.target.value })} aria-label="Quién lo pidió">
          <option value="todos">Cualquier persona</option>
          {users.map((u) => <option key={u.id} value={u.id}>{usernameOf(u)}</option>)}
        </select>
        <select className="ui-input" style={{ width: "auto", minHeight: 36, maxWidth: 170 }} value={filtros.project} onChange={(e) => set({ project: e.target.value })} aria-label="Obra o destino">
          <option value="todos">Toda obra</option>
          <optgroup label="Obras">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
          </optgroup>
          {destinosLibres.length > 0 && (
            <optgroup label="Stock y otros destinos">
              {destinosLibres.map((d) => <option key={d} value={`dest:${d}`}>{d}</option>)}
            </optgroup>
          )}
        </select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dim)" }}>
          Desde
          <input type="date" className="ui-input" style={{ width: "auto", minHeight: 36 }} value={filtros.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dim)" }}>
          hasta
          <input type="date" className="ui-input" style={{ width: "auto", minHeight: 36 }} value={filtros.dateTo} onChange={(e) => set({ dateTo: e.target.value })} />
        </label>
        <SelectorVista vista={vista} onCambiar={setVista} />
        {nFiltros > 0 && (
          <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => setFiltros(() => ({ ...FILTROS_VACIOS, status: filtros.status }))}>
            <FilterX size={14} /> Limpiar {nFiltros}
          </button>
        )}
      </div>

      {loading ? (
        <Cargando texto="Trayendo los pedidos…" />
      ) : error ? (
        <Vacio icono={Inbox} titulo="No se pudieron traer los pedidos" texto={error} />
      ) : !filtrados.length ? (
        <Vacio icono={Inbox} titulo="Ningún pedido coincide" texto="Probá sacando algún filtro o buscando por el código de la obra." />
      ) : (
        <div className="cmp-grupos">
          {grupos.map((g) => {
            const todos = abiertos.has(g.key);
            const items = todos ? g.items : g.items.slice(0, POR_GRUPO);
            return (
              <Grupo key={g.key} titulo={g.label} texto={g.texto} cuenta={g.items.length} tono={g.tono}>
                <PedidosEnVista vista={vista} pedidos={items} sinLeer={sinLeer} onAbrir={onAbrir} />
                {g.items.length > items.length && (
                  <button type="button" className="ui-btn ui-btn-fantasma chico cmp-mas" onClick={() => setAbiertos((s) => new Set(s).add(g.key))}>
                    Ver {g.items.length - items.length} más
                  </button>
                )}
              </Grupo>
            );
          })}
        </div>
      )}
    </>
  );
}
