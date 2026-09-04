import { Building2, Folder, FolderOpen, Ship } from "lucide-react";
import { C } from "@/theme";
import {
  carpetaFisicaDeRemito,
  carpetaParaMostrar,
  destinosDeRemito,
} from "@/features/panol/carpetaRemitos";

/**
 * Todos los lugares donde va a quedar el remito, antes de guardarlo.
 *
 * Existe porque el circuito tiene dos verdades que no coinciden y confundirlas
 * hace perder papeles: el PDF de la PC del pañol esta en UNA carpeta -un archivo
 * no puede estar en dos lados de un disco- pero dentro del sistema el mismo
 * documento aparece en cada barco, en cada carpeta y en la del proveedor.
 * Mostrar las dos cosas juntas es lo que evita el "¿y ahora dónde quedó?".
 */

const ESTILO = {
  obra: { color: C.blue, soft: C.blueL, border: C.blueB, Icono: Ship },
  carpeta: { color: C.violet, soft: C.violetL, border: C.violetB, Icono: Folder },
  proveedor: { color: C.teal, soft: C.tealL, border: C.tealB, Icono: Building2 },
};

export default function DestinosDeRemito({
  obras = [],
  carpetas = [],
  proveedor = "",
  mostrarRutaFisica = true,
  titulo = "Se va a poder encontrar en",
}) {
  const destinos = destinosDeRemito({ obras, carpetas, proveedor });
  const fisica = carpetaFisicaDeRemito({ obras, carpetas, proveedor });

  return (
    <div style={{
      border: `1px solid ${C.border}`,
      background: C.panel2,
      borderRadius: 10,
      padding: "9px 11px",
      display: "grid",
      gap: 7,
    }}>
      <div style={{ color: C.dim, fontSize: 10, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {titulo}
      </div>

      {destinos.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {destinos.map((destino) => {
            const skin = ESTILO[destino.tipo] || ESTILO.carpeta;
            const { Icono } = skin;
            return (
              <span
                key={destino.clave}
                title={carpetaParaMostrar(destino.ruta)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  border: `1px solid ${skin.border}`,
                  background: skin.soft,
                  color: skin.color,
                  borderRadius: 999,
                  padding: "3px 9px",
                  fontSize: 11,
                  fontWeight: 900,
                  maxWidth: "100%",
                }}
              >
                <Icono size={11} style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {destino.etiqueta}
                </span>
              </span>
            );
          })}
        </div>
      ) : (
        <div style={{ color: C.muted, fontSize: 11.5, fontWeight: 750 }}>
          Solo en el archivo general de Remitos. Se busca igual por proveedor, número o fecha.
        </div>
      )}

      {mostrarRutaFisica ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 7, minWidth: 0 }}>
          <FolderOpen size={13} color={C.dim} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 750, minWidth: 0, lineHeight: 1.5 }}>
            El PDF queda en <b style={{ color: C.text }}>{carpetaParaMostrar(fisica)}</b>
            {destinos.length > 1 ? ", y en el sistema aparece en todos los de arriba." : "."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
