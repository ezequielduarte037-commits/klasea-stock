const fs = require('fs');
let c = fs.readFileSync('src/features/muebles/MueblesScreen.jsx', 'utf8');

c = c.replace(/\r\n/g, '\n');

// Revert ESTADOS for the checklist
c = c.replace('const ESTADOS = ["Pendiente Materiales", "Preparación", "En Enchapadora", "Flete", "Producción", "Terminado", "Instalado"];', 'const ESTADOS = ["No enviado", "Parcial", "Instalado", "Rehacer"];');

c = c.replace(`const ESTADO_META = {
  "Pendiente Materiales": { color: C.t2, bg: "transparent" },
  "Preparación": { color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  "En Enchapadora": { color: "#d97706", bg: "rgba(217,119,6,0.1)" },
  "Flete": { color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  "Producción": { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  "Terminado": { color: C.green, bg: "rgba(16,185,129,0.1)" },
  "Instalado": { color: "#10b981", bg: "rgba(16,185,129,0.15)" }
};`, `const ESTADO_META = {
  "No enviado": { color: C.t2,    bg: "transparent" },
  "Parcial":    { color: C.t1,    bg: "var(--panel)" },
  "Instalado":  { color: C.green, bg: "rgba(16,185,129,0.1)" },
  "Rehacer":    { color: C.red,   bg: "rgba(239,68,68,0.1)" },
};`);

// Revert progreso logic
c = c.replace('function progreso(rows) {\n  if (!rows.length) return 0;\n  return Math.round(rows.filter(r => r.estado === "Instalado" || r.estado === "Terminado").length / rows.length * 100);\n}', 'function progreso(rows) {\n  if (!rows.length) return 0;\n  return Math.round(rows.filter(r => r.estado === "Instalado").length / rows.length * 100);\n}');

// Remove onCreateLote prop from MuebleModal signature
c = c.replace('function MuebleModal({ mueble, onClose, onSave, onDelete, esAdmin, onCreateLote }) {', 'function MuebleModal({ mueble, onClose, onSave, onDelete, esAdmin }) {');
c = c.replace('const [loteQty, setLoteQty] = useState(1);\n  const [loteProv, setLoteProv] = useState("Oberti");', '');

// Remove Fabricar Lote block
const fabBlock = `{onCreateLote && (
                <div style={{ marginTop: 16, background: "var(--panel)", padding: 12, borderRadius: 10, border: \`1px solid \${C.b0}\` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 }}>Fabricar Lote (Stock)</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <input type="number" min="1" value={loteQty} onChange={e=>setLoteQty(Math.max(1, parseInt(e.target.value)||1))} style={{ ...INP, width: 60, padding: "5px 8px" }} />
                    <select value={loteProv} onChange={e=>setLoteProv(e.target.value)} style={{ ...INP, flex: 1, padding: "5px 8px" }}>
                      <option value="Oberti">Oberti</option>
                      <option value="Morph">Morph</option>
                    </select>
                  </div>
                  <button onClick={() => onCreateLote(loteQty, loteProv)} style={{ width: "100%", padding: "7px", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", color: C.green, fontWeight: 700, borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}>+ Mandar a Producción</button>
                </div>
              )}`;
c = c.replace(fabBlock, '');

// Remove onCreateLote prop passing
const propStr = `onCreateLote={async (qty, prov) => {
            await supabase.from("prod_muebles_ordenes").insert({
              unidad_id: null,
              mueble_id: modalMueble.id,
              estado_proceso: "Pendiente Materiales",
              proveedor: prov,
              cantidad: qty
            });
            setModalMueble(null);
            alert("Lote enviado a producción. Revisá la pestaña Producción o Stock.");
          }}`;
c = c.replace(propStr, '');

// Revert insert defaults in MueblesScreen
c = c.replace('insert({ unidad_id: unidadId, mueble_id: mueble.id, estado_proceso: "Pendiente Materiales", proveedor: "Oberti" })', 'insert({ unidad_id: unidadId, mueble_id: mueble.id, estado_proceso: "No enviado", proveedor: "Oberti" })');
c = c.replace('insert(\n          plantilla.map(p => ({ unidad_id: unidad.id, mueble_id: p.mueble_id, estado_proceso: "Pendiente Materiales", proveedor: "Oberti" }))\n        );', 'insert(\n          plantilla.map(p => ({ unidad_id: unidad.id, mueble_id: p.mueble_id, estado_proceso: "No enviado", proveedor: "Oberti" }))\n        );');

// Revert stats logic
c = c.replace('completo: checklist.filter(r => r.estado === "Terminado" || r.estado === "Instalado").length, en_proceso: checklist.filter(r => r.estado !== "Terminado" && r.estado !== "Instalado" && r.estado !== "Pendiente Materiales").length', 'completo: checklist.filter(r => r.estado === "Instalado").length, parcial: checklist.filter(r => r.estado === "Parcial").length, rehacer: checklist.filter(r => r.estado === "Rehacer").length');
c = c.replace('{stats.completo} instalados/terminados', '{stats.completo} instalado{stats.completo !== 1 ? "s" : ""}');
c = c.replace('{stats.en_proceso > 0 && <span style={{ color: C.t1 }}>{stats.en_proceso} en producción</span>}', '{stats.parcial > 0 && <span style={{ color: C.t1 }}>{stats.parcial} parcial</span>}\\n                      {stats.rehacer > 0 && <span style={{ color: C.red }}>{stats.rehacer} rehacer</span>}');
c = c.replace('{stats.total - stats.completo - stats.en_proceso} pendientes', '{stats.total - stats.completo - stats.parcial - stats.rehacer} pendientes');

// Revert row map logic
c = c.replace('const completados = rows.filter(r => r.estado === "Terminado" || r.estado === "Instalado").length;', 'const completados = rows.filter(r => r.estado === "Instalado").length;');
c = c.replace('color: (r.estado === "Terminado" || r.estado === "Instalado") ? C.t2 : C.t0', 'color: r.estado === "Instalado" ? C.t2 : C.t0');
c = c.replace('textDecoration: (r.estado === "Terminado" || r.estado === "Instalado") ? "line-through" : "none"', 'textDecoration: r.estado === "Instalado" ? "line-through" : "none"');

fs.writeFileSync('src/features/muebles/MueblesScreen.jsx', c);
console.log("Done");
