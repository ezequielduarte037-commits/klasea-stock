const fs = require('fs');
let c = fs.readFileSync('src/features/muebles/MueblesScreen.jsx', 'utf8');

c = c.replace('function MuebleModal({ mueble, onClose, onSave, onDelete, esAdmin }) {', 'function MuebleModal({ mueble, onClose, onSave, onDelete, esAdmin, onCreateLote }) {');
c = c.replace('const [form, setForm] = useState({ nombre: mueble.nombre ?? "", sector: mueble.sector ?? "", descripcion: mueble.descripcion ?? "", medidas: mueble.medidas ?? "", material: mueble.material ?? "" });', 'const [form, setForm] = useState({ nombre: mueble.nombre ?? "", sector: mueble.sector ?? "", descripcion: mueble.descripcion ?? "", medidas: mueble.medidas ?? "", material: mueble.material ?? "" });\n  const [loteQty, setLoteQty] = useState(1);\n  const [loteProv, setLoteProv] = useState("Oberti");');

c = c.replace(`{esAdmin && <>
              <button style={{ marginTop: 14, width: "100%", padding: "9px", background: C.s1, color: C.t0, fontWeight: 600, border: \`1px solid \${C.b0}\`, borderRadius: 10, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }} onClick={() => setEdit(true)}>Editar ficha</button>
              <button style={{ marginTop: 6, width: "100%", padding: "9px", background: "rgba(239,68,68,0.07)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }} onClick={() => { if (window.confirm("¿Borrar este mueble del catálogo?")) { onDelete(mueble.id); onClose(); } }}>Eliminar del catálogo</button>
            </>}`, `{esAdmin && <>
              {onCreateLote && (
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
              )}
              <button style={{ marginTop: 14, width: "100%", padding: "9px", background: C.s1, color: C.t0, fontWeight: 600, border: \`1px solid \${C.b0}\`, borderRadius: 10, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }} onClick={() => setEdit(true)}>Editar ficha</button>
              <button style={{ marginTop: 6, width: "100%", padding: "9px", background: "rgba(239,68,68,0.07)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, cursor: "pointer", fontFamily: C.sans, fontSize: 13 }} onClick={() => { if (window.confirm("¿Borrar este mueble del catálogo?")) { onDelete(mueble.id); onClose(); } }}>Eliminar del catálogo</button>
            </>}`);

const onCreateLoteProp = `onCreateLote={async (qty, prov) => {
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

c = c.replace('esAdmin={esAdmin}\n        />', `esAdmin={esAdmin}\n          ${onCreateLoteProp}\n        />`);

fs.writeFileSync('src/features/muebles/MueblesScreen.jsx', c);
console.log("Done");
