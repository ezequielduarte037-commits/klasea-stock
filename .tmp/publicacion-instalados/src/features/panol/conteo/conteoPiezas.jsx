/* Piezas chicas que comparten "Conteo de hoy" y el historial. */
import { CONTEO_ESTADOS } from "@/features/panol/conteo/conteoDiario";
import { TONOS } from "@/features/panol/conteo/conteoFormato";

export function Chip({ tono = "dim", children }) {
  const [color, bg, border] = TONOS[tono] || TONOS.dim;
  return <span className="conteo-chip" style={{ color, background: bg, borderColor: border }}>{children}</span>;
}

export function EstadoChip({ estado }) {
  const meta = CONTEO_ESTADOS[estado] || CONTEO_ESTADOS.pendiente;
  return <Chip tono={meta.tono}>{meta.label}</Chip>;
}
