const fs = require('fs');
let c = fs.readFileSync('src/features/muebles/MueblesScreen.jsx', 'utf8');

c = c.replace('import logoKlasea from "@/assets/logos/logo-klasea.png";\nimport { C } from "@/theme";', 'import logoKlasea from "@/assets/logos/logo-klasea.png";\nimport { C } from "@/theme";\nimport ProduccionTab from "./tabs/ProduccionTab";\nimport StockTab from "./tabs/StockTab";');

c = c.replace('const ESTADOS = ["No enviado", "Parcial", "Completo", "Rehacer"];', 'const ESTADOS = ["Pendiente Materiales", "Preparación", "En Enchapadora", "Flete", "Producción", "Terminado", "Instalado"];');

c = c.replace(`const ESTADO_META = {
  "No enviado": { color: C.t2,    bg: "transparent" },
  "Parcial":    { color: C.t1,    bg: "var(--panel)" },
  "Completo":   { color: C.green, bg: "rgba(16,185,129,0.1)" },
  "Rehacer":    { color: C.red,   bg: "rgba(239,68,68,0.1)" },
};`, `const ESTADO_META = {
  "Pendiente Materiales": { color: C.t2, bg: "transparent" },
  "Preparación": { color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  "En Enchapadora": { color: "#d97706", bg: "rgba(217,119,6,0.1)" },
  "Flete": { color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  "Producción": { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  "Terminado": { color: C.green, bg: "rgba(16,185,129,0.1)" },
  "Instalado": { color: "#10b981", bg: "rgba(16,185,129,0.15)" }
};`);

c = c.replace('function progreso(rows) {\n  if (!rows.length) return 0;\n  return Math.round(rows.filter(r => r.estado === "Completo").length / rows.length * 100);\n}', 'function progreso(rows) {\n  if (!rows.length) return 0;\n  return Math.round(rows.filter(r => r.estado === "Instalado" || r.estado === "Terminado").length / rows.length * 100);\n}');

c = c.replace('const [mainView,  setMainView]  = useState("muebles"); // "muebles" | "enchapadora"', 'const [mainView,  setMainView]  = useState("produccion"); // "produccion" | "stock" | "muebles" | "enchapadora"');

c = c.replace('if (estado !== "Completo") return { recibido_por: null, recibido_at: null };', 'if (estado !== "Instalado" && estado !== "Terminado") return { recibido_por: null, recibido_at: null };');

c = c.replace('await supabase.from("prod_unidad_checklist").update(trace).in("id", ids);', 'await supabase.from("prod_muebles_ordenes").update(trace).in("id", ids);');

c = c.replace('await supabase.from("prod_unidad_checklist").update({ estado }).in("id", ids);', 'await supabase.from("prod_muebles_ordenes").update({ estado_proceso: estado }).in("id", ids);');

c = c.replace('const selectBase = "id,estado,obs,mueble_id,recibido_por,recibido_at, prod_muebles(id,nombre,sector,descripcion,medidas,material)";', 'const selectBase = "id,estado:estado_proceso,obs:observaciones,mueble_id,recibido_por,recibido_at, prod_muebles(id,nombre,sector,descripcion,medidas,material)";');

c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');

c = c.replace('insert({ unidad_id: unidadId, mueble_id: mueble.id, estado: "No enviado" })', 'insert({ unidad_id: unidadId, mueble_id: mueble.id, estado_proceso: "Pendiente Materiales", proveedor: "Oberti" })');
c = c.replace('insert(\n          plantilla.map(p => ({ unidad_id: unidad.id, mueble_id: p.mueble_id, estado: "No enviado" }))\n        );', 'insert(\n          plantilla.map(p => ({ unidad_id: unidad.id, mueble_id: p.mueble_id, estado_proceso: "Pendiente Materiales", proveedor: "Oberti" }))\n        );');
c = c.replace('estado:"No enviado"', 'estado_proceso:"Pendiente Materiales", proveedor:"Oberti"');

c = c.replace('.filter(r => r.estado !== "Completo")', '.filter(r => r.estado !== "Instalado" && r.estado !== "Terminado")');

c = c.replace('.update({ estado }).eq("id",rowId);', '.update({ estado_proceso: estado }).eq("id",rowId);');
c = c.replace('.update({ obs }).eq("id",rowId);', '.update({ observaciones: obs }).eq("id",rowId);');

c = c.replace('completo: checklist.filter(r => r.estado === "Completo").length, parcial: checklist.filter(r => r.estado === "Parcial").length, rehacer: checklist.filter(r => r.estado === "Rehacer").length', 'completo: checklist.filter(r => r.estado === "Terminado" || r.estado === "Instalado").length, en_proceso: checklist.filter(r => r.estado !== "Terminado" && r.estado !== "Instalado" && r.estado !== "Pendiente Materiales").length');

c = c.replace(`{/* Switcher Muebles / Enchapadora */}
              <div style={{ display: "flex", gap: 3, marginBottom: 8, background: "var(--panel)", borderRadius: 8, padding: 3, border: \`1px solid \${C.b0}\` }}>
                {[["muebles","Muebles"],["enchapadora","Enchapado"]].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setMainView(key); setMobileShowNav(key !== "enchapadora"); }}
                    style={{
                      flex: 1, padding: "6px 4px", borderRadius: 6, cursor: "pointer",
                      fontSize: 12, fontWeight: mainView === key ? 600 : 400,
                      fontFamily: C.sans, transition: "all .15s",
                      background: mainView === key ? "var(--panel-2)" : "transparent",
                      border: \`1px solid \${mainView === key ? C.b0 : "transparent"}\`,
                      color: mainView === key ? C.t0 : C.t2,
                    }}
                  >{label}</button>
                ))}
              </div>
              {mainView === "muebles" && (
                <div style={{ fontSize: 11, color: C.t2 }}>Líneas de producción</div>
              )}`, `{/* Switcher Produccion / Stock / Muebles / Enchapadora */}
              <div style={{ display: "flex", gap: 3, marginBottom: 8, background: "var(--panel)", borderRadius: 8, padding: 3, border: \`1px solid \${C.b0}\`, flexWrap: "wrap" }}>
                {[["produccion","Producción"],["stock","Stock"],["muebles","Obras"],["enchapadora","Enchapado"]].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setMainView(key); setMobileShowNav(key === "produccion" || key === "stock" || key === "muebles" ? false : false); }}
                    style={{
                      flex: 1, padding: "6px 4px", borderRadius: 6, cursor: "pointer",
                      fontSize: 11, fontWeight: mainView === key ? 700 : 500,
                      fontFamily: C.sans, transition: "all .15s",
                      background: mainView === key ? "var(--panel-2)" : "transparent",
                      border: \`1px solid \${mainView === key ? C.b0 : "transparent"}\`,
                      color: mainView === key ? C.t0 : C.t2,
                      minWidth: "40%"
                    }}
                  >{label}</button>
                ))}
              </div>
              {mainView === "muebles" && (
                <div style={{ fontSize: 11, color: C.t2, marginTop: 8 }}>Obras en progreso</div>
              )}`);

c = c.replace(`{mainView === "enchapadora" ? (
                <div style={{ padding: "20px 16px", color: C.t2, fontSize: 12, textAlign: "center", lineHeight: 1.7 }}>
                  Gestioná las listas<br />para enchapar en el<br />panel de la derecha.
                </div>
              ) : (`, `{(mainView === "produccion" || mainView === "stock" || mainView === "enchapadora") ? (
                <div style={{ padding: "20px 16px", color: C.t2, fontSize: 12, textAlign: "center", lineHeight: 1.7 }}>
                  Seleccioná la pestaña<br />"Obras"<br />para ver checklists específicos.
                </div>
              ) : (`);

c = c.replace(`{mainView === "enchapadora" ? (
              <EnchapadoView esAdmin={esAdmin} onEnsureMueblesUnidad={ensureUnidadDesdeEnchapado} />
            ) : !lineaId ? (`, `{mainView === "produccion" ? (
              <ProduccionTab esAdmin={esAdmin} onOpenMueble={setModalMueble} />
            ) : mainView === "stock" ? (
              <StockTab 
                esAdmin={esAdmin} 
                onOpenMueble={setModalMueble} 
                onAsignarObra={(o) => {
                  alert(\`Seleccioná la obra a la izquierda y agregalo desde el botón "+ Agregar Ítem" o editá su asignación.\`);
                }} 
              />
            ) : mainView === "enchapadora" ? (
              <EnchapadoView esAdmin={esAdmin} onEnsureMueblesUnidad={ensureUnidadDesdeEnchapado} />
            ) : !lineaId ? (`);

c = c.replace('{stats.completo} completo{stats.completo !== 1 ? "s" : ""}', '{stats.completo} instalados/terminados');
c = c.replace('{stats.parcial > 0 && <span style={{ color: C.t1 }}>{stats.parcial} parcial</span>}', '{stats.en_proceso > 0 && <span style={{ color: C.t1 }}>{stats.en_proceso} en producción</span>}');
c = c.replace('{stats.rehacer > 0 && <span style={{ color: C.red }}>{stats.rehacer} rehacer</span>}', '');
c = c.replace('{stats.total - stats.completo - stats.parcial - stats.rehacer} pendientes', '{stats.total - stats.completo - stats.en_proceso} pendientes');

c = c.replace('const completados = rows.filter(r => r.estado === "Completo").length;', 'const completados = rows.filter(r => r.estado === "Terminado" || r.estado === "Instalado").length;');
c = c.replace('color: r.estado === "Completo" ? C.t2 : C.t0', 'color: (r.estado === "Terminado" || r.estado === "Instalado") ? C.t2 : C.t0');
c = c.replace('textDecoration: r.estado === "Completo" ? "line-through" : "none"', 'textDecoration: (r.estado === "Terminado" || r.estado === "Instalado") ? "line-through" : "none"');

c = c.replace(`{r.estado === "Completo" && (r.recibido_por || r.recibido_at) && (
                                  <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.35, display: "grid", gap: 1 }}>
                                    {r.recibido_at && (
                                      <span>Fecha recepción: <span style={{ color: C.t1, fontWeight: 800 }}>{formatTraceDate(r.recibido_at)}</span></span>
                                    )}
                                    <span>Recibido por: <span style={{ color: C.t1, fontWeight: 800 }}>{r.recibido_por || "usuario"}</span></span>
                                  </div>
                                )}`, `{r.estado === "Instalado" && (r.recibido_por || r.recibido_at) && (
                                  <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.35, display: "grid", gap: 1 }}>
                                    {r.recibido_at && (
                                      <span>Instalado: <span style={{ color: C.t1, fontWeight: 800 }}>{formatTraceDate(r.recibido_at)}</span></span>
                                    )}
                                    <span>Por: <span style={{ color: C.t1, fontWeight: 800 }}>{r.recibido_por || "usuario"}</span></span>
                                  </div>
                                )}`);

fs.writeFileSync('src/features/muebles/MueblesScreen.jsx', c);
console.log("Done");
