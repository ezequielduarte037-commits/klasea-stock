/* TEMPORAL: banco de pruebas del recorrido 3D sin login. Borrar al terminar. */
import "./src/theme.css";
import "./src/theme/palette.css";
import "./src/index.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CSS_MANUAL } from "@/features/cliente/manual/estilos";
import Recorrido3D from "@/features/cliente/manual/recorrido/Recorrido3D";
import Probador3D from "@/features/cliente/manual/recorrido/Probador3D";

const q = new URLSearchParams(window.location.search);

function Banco() {
  const [modo, setModo] = useState(q.has("recorrido") ? "recorrido" : "probador");
  const tono = q.get("tono") === "noche" ? "noche" : "dia";
  const volver = () => setModo(null);
  return (
    <div className="kx">
      <style>{CSS_MANUAL}</style>
      {modo === "probador" && <Probador3D modelo="K43 tender" tono={tono} onCerrar={volver} />}
      {modo === "recorrido" && <Recorrido3D modelo="K43 tender" tono={tono} onCerrar={volver} />}
      {!modo && (
        <div style={{ padding: 32, display: "flex", gap: 12, fontFamily: "Outfit, system-ui, sans-serif" }}>
          <button type="button" onClick={() => setModo("probador")}>Abrir el probador</button>
          <button type="button" onClick={() => setModo("recorrido")}>Abrir el recorrido</button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Banco />);
