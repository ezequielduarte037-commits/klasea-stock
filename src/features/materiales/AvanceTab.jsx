import { useMemo } from "react";
import { C } from "@/theme";
import { KpiCard, Td, Th } from "@/features/rrhh/ui";
import { precioVigente } from "./api";
import { MODELOS } from "./materialesParser";

const nf = new Intl.NumberFormat("es-AR");

function materialActivo(material) {
  return material?.activo !== false;
}

function materialCategorias(material) {
  const ids = material?.areas?.length ? material.areas : [material?.categoria_id];
  return ids.filter(Boolean);
}

function hasPrecio(material) {
  const precio = precioVigente(material);
  if (precio?.precio_unitario == null || precio.precio_unitario === "") return false;
  return Number.isFinite(Number(precio.precio_unitario));
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function fmtFecha(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function modeloDesdeCodigo(codigo) {
  const raw = String(codigo ?? "").trim();
  const prefix = raw.split("-")[0]?.replace(/^K/i, "");
  return MODELOS.includes(prefix) ? prefix : null;
}

function hasModelo(material, modelo) {
  return (material?.modelos ?? []).some((row) => String(row.modelo) === modelo && Number(row.cantidad) > 0);
}

function Progress({ value, color = C.blue }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 170 }}>
      <div style={{ flex: 1, height: 8, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
      <span style={{ fontFamily: C.mono, color: C.t2, fontSize: 12, width: 34, textAlign: "right" }}>{value}%</span>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 14, padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, color: C.t0, fontWeight: 800 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return (
    <div style={{ padding: 18, textAlign: "center", fontSize: 13, color: C.t2, border: `1px dashed ${C.b0}`, borderRadius: 10 }}>
      {children}
    </div>
  );
}

function Chip({ children, color = C.t2 }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      border: `1px solid ${color}44`,
      background: `${color}14`,
      color,
      borderRadius: 999,
      padding: "3px 8px",
      fontSize: 11,
      fontWeight: 800,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

export default function AvanceTab({ categorias = [], materiales = [], batches = [], obras = [] }) {
  const data = useMemo(() => {
    const activos = materiales.filter(materialActivo);
    const conPrecio = activos.filter(hasPrecio);
    const pendientesRevision = activos.filter((m) => m.revisado === false);
    const sectoresCargados = new Set();

    for (const material of activos) {
      for (const catId of materialCategorias(material)) sectoresCargados.add(catId);
    }

    const rowsSectores = categorias.map((cat) => {
      const list = activos.filter((m) => materialCategorias(m).includes(cat.id));
      const priced = list.filter(hasPrecio).length;
      const pendientes = list.filter((m) => m.revisado === false).length;
      return {
        ...cat,
        total: list.length,
        conPrecio: priced,
        pendientes,
        pctPrecio: pct(priced, list.length),
      };
    });

    const modelos = MODELOS.map((modelo) => {
      const definidos = activos.filter((m) => hasModelo(m, modelo));
      const priced = definidos.filter(hasPrecio).length;
      return {
        modelo,
        definidos: definidos.length,
        conPrecio: priced,
        pctPrecio: pct(priced, definidos.length),
      };
    });

    const modelosByKey = new Map(modelos.map((m) => [m.modelo, m]));
    const obrasRows = (obras ?? []).map((obra) => {
      const detected = MODELOS.includes(String(obra.modelo ?? "")) ? String(obra.modelo) : modeloDesdeCodigo(obra.codigo);
      const stats = detected ? modelosByKey.get(detected) : null;
      return {
        ...obra,
        modeloDetectado: detected,
        definidos: stats?.definidos ?? 0,
        conPrecio: stats?.conPrecio ?? 0,
      };
    });

    const catById = new Map(categorias.map((cat) => [cat.id, cat.nombre]));
    const recientes = [...materiales]
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
      .slice(0, 10)
      .map((material) => ({
        ...material,
        sector: catById.get(material.categoria_id) ?? "Sin sector",
      }));

    return {
      activos,
      conPrecio,
      pendientesRevision,
      sectoresCargados,
      rowsSectores,
      modelos,
      obrasRows,
      recientes,
    };
  }, [batches, categorias, materiales, obras]);

  const total = data.activos.length;
  const pctConPrecio = pct(data.conPrecio.length, total);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiCard label="Materiales activos" value={nf.format(total)} />
        <KpiCard label="Con precio" value={`${pctConPrecio}%`} sub={`${nf.format(data.conPrecio.length)} de ${nf.format(total)}`} color={pctConPrecio >= 80 ? C.green : C.blue} />
        <KpiCard label="Pendientes revision" value={nf.format(data.pendientesRevision.length)} color={data.pendientesRevision.length ? C.amber : C.green} />
        <KpiCard label="Sectores cargados" value={nf.format(data.sectoresCargados.size)} sub={`${nf.format(categorias.length)} sectores totales`} />
      </div>

      <Section title="Cobertura por sector" subtitle="Precio vigente y pendientes de revision por sector del catalogo.">
        <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Sector</Th>
                <Th right>Materiales</Th>
                <Th right>Con precio</Th>
                <Th>% precio</Th>
                <Th right>Pendientes</Th>
              </tr>
            </thead>
            <tbody>
              {data.rowsSectores.map((row) => (
                <tr key={row.id}>
                  <Td>{row.nombre}</Td>
                  <Td right mono>{nf.format(row.total)}</Td>
                  <Td right mono color={row.conPrecio ? C.green : C.t2}>{nf.format(row.conPrecio)}</Td>
                  <Td><Progress value={row.pctPrecio} color={row.pctPrecio >= 80 ? C.green : C.blue} /></Td>
                  <Td right mono color={row.pendientes ? C.amber : C.t2}>{nf.format(row.pendientes)}</Td>
                </tr>
              ))}
              {!data.rowsSectores.length && (
                <tr>
                  <td colSpan={5} style={{ padding: 18, textAlign: "center", color: C.t2, fontSize: 13 }}>
                    Todavia no hay sectores cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Avance por modelo y obra" subtitle="BOM cargado por modelo y lectura de obras activas de produccion.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 14 }}>
          {data.modelos.map((row) => (
            <div key={row.modelo} style={{ border: `1px solid ${C.b0}`, borderRadius: 12, padding: 14, background: C.bg }}>
              <div style={{ fontSize: 10, letterSpacing: 1.3, color: C.t2, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>Modelo K{row.modelo}</div>
              <div style={{ fontFamily: C.mono, fontSize: 22, color: C.t0, fontWeight: 800 }}>{nf.format(row.definidos)}</div>
              <div style={{ fontSize: 12, color: C.t2, margin: "5px 0 10px" }}>{nf.format(row.conPrecio)} con precio</div>
              <Progress value={row.pctPrecio} color={row.pctPrecio >= 80 ? C.green : C.blue} />
            </div>
          ))}
        </div>

        {!data.obrasRows.length ? (
          <Empty>No hay obras activas para mostrar en este momento.</Empty>
        ) : (
          <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
            <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th>Obra</Th>
                  <Th>Linea</Th>
                  <Th>Modelo</Th>
                  <Th>Catalogo aplicado</Th>
                </tr>
              </thead>
              <tbody>
                {data.obrasRows.map((obra) => (
                  <tr key={obra.id ?? obra.codigo}>
                    <Td mono>{obra.codigo || "-"}</Td>
                    <Td color={obra.linea_nombre ? C.t1 : C.t2}>{obra.linea_nombre || "-"}</Td>
                    <Td>
                      {obra.modeloDetectado ? <Chip color={C.blue}>K{obra.modeloDetectado}</Chip> : <Chip color={C.amber}>modelo sin detectar</Chip>}
                    </Td>
                    <Td color={obra.modeloDetectado ? C.t1 : C.t2}>
                      {obra.modeloDetectado
                        ? `${nf.format(obra.definidos)} materiales definidos · ${nf.format(obra.conPrecio)} con precio`
                        : "No se puede reutilizar cobertura de modelo"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <Section title="Importaciones recientes" subtitle="Ultimos archivos incorporados al catalogo.">
          {!batches?.length ? (
            <Empty>Todavia no se importo ningun catalogo.</Empty>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {batches.slice(0, 8).map((batch) => (
                <div key={batch.id ?? `${batch.filename}-${batch.created_at}`} style={{ border: `1px solid ${C.b0}`, borderRadius: 10, padding: 10, background: C.bg }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <div style={{ fontSize: 13, color: C.t0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{batch.filename || "Archivo sin nombre"}</div>
                    <div style={{ fontSize: 11, color: C.t2, fontFamily: C.mono, whiteSpace: "nowrap" }}>{fmtFecha(batch.created_at)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.t2, marginTop: 5 }}>
                    {nf.format(batch.stats?.creados ?? 0)} creados · {nf.format(batch.stats?.actualizados ?? 0)} actualizados
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Materiales agregados" subtitle="Ultimos 10 materiales por fecha de alta.">
          {!data.recientes.length ? (
            <Empty>No hay materiales cargados.</Empty>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
              <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th>Sector</Th>
                    <Th>Origen</Th>
                    <Th>Fecha</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recientes.map((material) => (
                    <tr key={material.id}>
                      <Td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{material.descripcion || "-"}</Td>
                      <Td color={material.sector ? C.t1 : C.t2}>{material.sector}</Td>
                      <Td color={material.origen ? C.t1 : C.t2}>{material.origen || "-"}</Td>
                      <Td mono color={C.t2}>{fmtFecha(material.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
