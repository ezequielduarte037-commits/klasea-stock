const fs = require('fs');
let c = fs.readFileSync('src/features/muebles/MueblesScreen.jsx', 'utf8');

// Normalize line endings
c = c.replace(/\r\n/g, '\n');

// Perform the replacements that failed before:
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

// Ensure database fetches match:
c = c.replace('async function cargarChecklist(uid){\n    setLoading(true);\n    const selectBase = "id,estado,obs,mueble_id,recibido_por,recibido_at, prod_muebles(id,nombre,sector,descripcion,medidas,material)";\n    const { data } = await supabase\n      .from("prod_unidad_checklist")\n      .select(selectBase)', 'async function cargarChecklist(uid){\n    setLoading(true);\n    const selectBase = "id,estado:estado_proceso,obs:observaciones,mueble_id,recibido_por,recibido_at, prod_muebles(id,nombre,sector,descripcion,medidas,material)";\n    const { data } = await supabase\n      .from("prod_muebles_ordenes")\n      .select(selectBase)');

c = c.replace('const retry = await supabase\n        .from("prod_unidad_checklist")\n        .select("id,estado,obs,mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material)")\n        .eq("unidad_id",uid);', 'const retry = await supabase\n        .from("prod_muebles_ordenes")\n        .select("id,estado:estado_proceso,obs:observaciones,mueble_id, prod_muebles(id,nombre,sector,descripcion,medidas,material)")\n        .eq("unidad_id",uid);');

c = c.replace('insert({ unidad_id: unidadId, mueble_id: mueble.id, estado: "No enviado" })', 'insert({ unidad_id: unidadId, mueble_id: mueble.id, estado_proceso: "Pendiente Materiales", proveedor: "Oberti" })');
c = c.replace('insert(\n          plantilla.map(p => ({ unidad_id: unidad.id, mueble_id: p.mueble_id, estado: "No enviado" }))\n        );', 'insert(\n          plantilla.map(p => ({ unidad_id: unidad.id, mueble_id: p.mueble_id, estado_proceso: "Pendiente Materiales", proveedor: "Oberti" }))\n        );');
c = c.replace('estado:"No enviado"', 'estado_proceso:"Pendiente Materiales", proveedor:"Oberti"');

c = c.replace('.filter(r => r.estado !== "Completo")', '.filter(r => r.estado !== "Instalado" && r.estado !== "Terminado")');

c = c.replace('.update({ estado }).eq("id",rowId);', '.update({ estado_proceso: estado }).eq("id",rowId);');
c = c.replace('.update({ obs }).eq("id",rowId);', '.update({ observaciones: obs }).eq("id",rowId);');

c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');
c = c.replace('.from("prod_unidad_checklist")', '.from("prod_muebles_ordenes")');

fs.writeFileSync('src/features/muebles/MueblesScreen.jsx', c);
console.log("Done refactoring UI");
