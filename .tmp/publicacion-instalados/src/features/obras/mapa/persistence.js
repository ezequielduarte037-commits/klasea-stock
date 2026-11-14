import { supabase } from "@/supabaseClient";

/* ── Supabase memoria helpers ── */
function memoriaRowToFields(row) {
  const BOOL_KEYS = ["starlink","sternthruster","fabricadora_hielo","radar","pluma","planchada","mesa_fly","aire_acondicionado","calefactor","bow_thruster","plotter","faro","flaps"];
  const result = {};
  Object.keys(row).forEach(k => {
    if (k === "id" || k === "obra_id" || k === "obra_codigo" || k === "created_at" || k === "updated_at") return;
    result[k] = row[k] ?? (BOOL_KEYS.includes(k) ? false : "");
  });
  return result;
}

async function loadMemoriasFromSupabase() {
  try {
    const { data, error } = await supabase.from("obra_memorias").select("*");
    if (error || !data?.length) return {};
    const result = {};
    data.forEach(row => {
      const fields = memoriaRowToFields(row);
      if (row.obra_id)     result[row.obra_id]    = fields;
      if (row.obra_codigo) result[row.obra_codigo] = fields;
    });
    return result;
  } catch { return {}; }
}

async function saveMemoriaToSupabase(obraId, obraCodigo, fields) {
  try {
    const BOOL_KEYS = ["starlink","sternthruster","fabricadora_hielo","radar","pluma","planchada","mesa_fly","aire_acondicionado","calefactor","bow_thruster","plotter","faro","flaps"];
    const row = { obra_id: obraId||null, obra_codigo: obraCodigo||null };
    Object.keys(fields).forEach(k => {
      if (k.endsWith("_obs")) { row[k] = fields[k]||null; return; }
      row[k] = BOOL_KEYS.includes(k) ? (fields[k]??false) : (fields[k]||null);
    });
    await supabase.from("obra_memorias").upsert(row, { onConflict: "obra_codigo" });
  } catch(e) { console.error("Error guardando memoria:", e); }
}

// Realtime: avisa cuando cualquier usuario cambia una memoria. Devuelve la
// función para desuscribirse (usar en el cleanup del useEffect).
function subscribeMemorias(onChange) {
  const ch = supabase
    .channel("rt-obra-memorias")
    .on("postgres_changes", { event: "*", schema: "public", table: "obra_memorias" }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export { loadMemoriasFromSupabase, saveMemoriaToSupabase, subscribeMemorias };
