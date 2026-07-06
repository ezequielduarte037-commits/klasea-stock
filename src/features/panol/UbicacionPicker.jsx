import { useEffect, useMemo, useState } from "react";
import { MapPin, PackageOpen } from "lucide-react";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import { parseUbicacion, zonaColor } from "./ubicacionUtils";

// Selector de ubicación física de un producto del catálogo.
// Guarda en panol_materiales.ubicacion: "G2-3" (estantería-estante), "AFUERA", o null.
// "AFUERA" = vive fuera del pañol (galpón/exterior/barco) — lleva observación.

let cacheEstanterias = null;

export function UbicacionChip({ ubicacion, obs = null, size = "sm" }) {
  const { cod, nivel, afuera } = parseUbicacion(ubicacion);
  if (!cod) return null;
  const color = afuera ? "#f59e0b" : zonaColor(cod);
  const label = afuera ? "Afuera del pañol" : nivel ? `${cod} · ${nivel}º` : cod;
  return (
    <span title={obs ? `${label} — ${obs}` : label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: size === "sm" ? 10 : 11.5, fontWeight: 850, fontFamily: C.mono, color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 6, padding: size === "sm" ? "1px 6px" : "3px 8px", whiteSpace: "nowrap" }}>
      {afuera ? <PackageOpen size={size === "sm" ? 10 : 12} /> : <MapPin size={size === "sm" ? 10 : 12} />}
      {label}
    </span>
  );
}

export default function UbicacionPicker({ materialId, ubicacion = null, ubicacionObs = null, onSaved, toast, label = "Ubicación en el pañol" }) {
  const [estanterias, setEstanterias] = useState(cacheEstanterias || []);
  const parsed = parseUbicacion(ubicacion);
  const [cod, setCod] = useState(parsed.afuera ? "AFUERA" : parsed.cod);
  const [nivel, setNivel] = useState(parsed.nivel ? String(parsed.nivel) : "");
  const [obs, setObs] = useState(ubicacionObs || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (cacheEstanterias) return;
    supabase.from("panol_estanterias").select("codigo, niveles_cm").eq("activo", true).order("codigo")
      .then(({ data, error }) => {
        if (!error && data) { cacheEstanterias = data; setEstanterias(data); }
      });
  }, []);

  const selEst = useMemo(() => estanterias.find((e) => e.codigo === cod) || null, [estanterias, cod]);
  const nivelesCount = Array.isArray(selEst?.niveles_cm) ? selEst.niveles_cm.length : 0;

  const dirty = useMemo(() => {
    const current = parseUbicacion(ubicacion);
    const curCod = current.afuera ? "AFUERA" : current.cod;
    return cod !== curCod || String(current.nivel || "") !== nivel || (obs || "") !== (ubicacionObs || "");
  }, [cod, nivel, obs, ubicacion, ubicacionObs]);

  async function guardar() {
    if (!materialId) return;
    setSaving(true);
    try {
      const value = !cod ? null : cod === "AFUERA" ? "AFUERA" : (nivel ? `${cod}-${nivel}` : cod);
      const { error } = await supabase.from("panol_materiales")
        .update({ ubicacion: value, ubicacion_obs: obs.trim() || null })
        .eq("id", materialId);
      if (error) throw error;
      toast?.success(value ? `Ubicación guardada: ${cod === "AFUERA" ? "Afuera del pañol" : value}` : "Ubicación quitada.");
      onSaved?.(value, obs.trim() || null);
    } catch (e) {
      toast?.error(e.message?.includes("ubicacion") ? "Falta correr el SQL del mapa del pañol." : (e.message || "No se pudo guardar la ubicación."));
    } finally {
      setSaving(false);
    }
  }

  const inp = { background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "7px 9px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 5 }}>
        <MapPin size={11} /> {label}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <select value={cod} onChange={(e) => { setCod(e.target.value); setNivel(""); }} style={{ ...inp, cursor: "pointer", flex: "0 1 auto" }}>
          <option value="">Sin ubicar</option>
          <option value="AFUERA">🏕 Afuera del pañol</option>
          {estanterias.map((e) => <option key={e.codigo} value={e.codigo}>{e.codigo}</option>)}
        </select>
        {cod && cod !== "AFUERA" && nivelesCount > 0 && (
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} style={{ ...inp, cursor: "pointer", flex: "0 1 auto" }}>
            <option value="">Estante…</option>
            {Array.from({ length: nivelesCount }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>{i + 1}º estante</option>
            ))}
          </select>
        )}
        <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder={cod === "AFUERA" ? "¿Dónde? (ej. galpón, atrás del taller...)" : "Obs. (opcional)"} style={{ ...inp, flex: "1 1 140px" }} />
        {dirty && (
          <button type="button" onClick={guardar} disabled={saving || !materialId} style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 8, padding: "7px 12px", cursor: saving ? "default" : "pointer", fontSize: 12, fontWeight: 900, fontFamily: C.sans, opacity: saving ? 0.6 : 1 }}>
            {saving ? "..." : "Guardar"}
          </button>
        )}
      </div>
    </div>
  );
}
