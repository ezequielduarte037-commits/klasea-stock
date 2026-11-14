import { useRef, useState } from "react";
import { ScanLine, Settings2 } from "lucide-react";
import {
  downloadScannerFile, fetchScannerFiles, getScannerPairingKey,
  saveScannerPairingKey, scanReceiptFromDevice,
} from "@/features/panol/scannerBridge";

/** Usa la misma vinculación de Pañol. El original se conserva hasta confirmar el ingreso. */
export default function ScannerRemito({ sede, disabled, cargados = [], onLeer, onOcupado }) {
  const [codigo, setCodigo] = useState(getScannerPairingKey);
  const [configurar, setConfigurar] = useState(false);
  const [origen, setOrigen] = useState("glass");
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [pendientes, setPendientes] = useState(null);
  const ocupadoRef = useRef(false);
  const carpeta = `Consumibles/${sede}`;

  async function ejecutar(accion) {
    if (disabled || ocupadoRef.current) return;
    ocupadoRef.current = true;
    onOcupado(true);
    setError("");
    try {
      if (!getScannerPairingKey()) {
        setConfigurar(true);
        throw new Error("Pegá el código de «Klase A - Código scanner» de esta PC para vincular la impresora.");
      }
      await accion();
    } catch (e) {
      setError(e.message || "No se pudo conectar con el escáner de esta PC.");
    } finally {
      ocupadoRef.current = false;
      onOcupado(false);
      setEstado("");
    }
  }

  async function listar() {
    const files = await fetchScannerFiles();
    const deEstaSede = files.filter((f) => String(f.carpeta || "").replace(/\\/g, "/") === carpeta);
    setPendientes(deEstaSede);
  }

  async function leer(file, row) {
    // Se muestra el archivo incluso si falla la IA: permite reintentar sin escanear otra vez.
    setPendientes((prev) => [row, ...(prev || []).filter((f) => f.id !== row.id)]);
    setEstado("Leyendo el remito…");
    await onLeer(file, row);
  }

  return (
    <div className="ing-scanner">
      <div className="ing-scanner-acciones">
        <button type="button" className="ui-btn ui-btn-primario" disabled={disabled} onClick={() => ejecutar(async () => {
          setEstado("Escaneando en la impresora…");
          const { file, row } = await scanReceiptFromDevice(origen, { carpeta });
          await leer(file, row);
        })}>
          <ScanLine size={17} /> {estado || "Escanear desde la impresora"}
        </button>
        <select className="ui-input" aria-label="Origen del escaneo" value={origen} disabled={disabled} onChange={(e) => setOrigen(e.target.value)}>
          <option value="glass">Vidrio</option>
          <option value="feeder">Alimentador</option>
        </select>
        <button type="button" className="ui-btn ui-btn-fantasma" disabled={disabled} onClick={() => ejecutar(listar)}>Ver escaneos pendientes</button>
        <button type="button" className="ui-btn ui-btn-fantasma" disabled={disabled} aria-expanded={configurar} onClick={() => setConfigurar((v) => !v)}>
          <Settings2 size={16} /> Vincular escáner
        </button>
      </div>
      <p className="ing-dim">Poné el remito en la impresora de esta PC. Después de leerlo, revisá los productos y confirmá el ingreso.</p>
      {configurar && (
        <div className="ing-scanner-vincular">
          <label className="ing-campo">
            <span className="ing-lbl">Código de vinculación de esta PC</span>
            <input className="ui-input" value={codigo} disabled={disabled} autoComplete="off" spellCheck={false} onChange={(e) => setCodigo(e.target.value)} placeholder="Pegá el código del acceso directo" />
          </label>
          <button type="button" className="ui-btn" disabled={disabled || !codigo.trim()} onClick={() => {
            try {
              setCodigo(saveScannerPairingKey(codigo));
              ejecutar(async () => { await listar(); setConfigurar(false); });
            } catch (e) { setError(e.message); }
          }}>Vincular</button>
          <small className="ing-dim">Usá el acceso «Klase A - Código scanner» del escritorio. Si ya lo vinculaste en Pañol, funciona acá también.</small>
        </div>
      )}
      {error && <p className="ing-alerta" role="alert">{error}</p>}
      {pendientes && (
        <ul className="ing-scanner-pendientes" aria-label="Escaneos pendientes de consumibles">
          {!pendientes.length && <li className="ing-dim">No hay escaneos pendientes de {sede}.</li>}
          {pendientes.map((row) => (
            <li key={row.id}>
              <span>{row.name}</span>
              {cargados.includes(row.id) ? <small className="ing-dim">Cargado en este borrador</small> : (
                <button type="button" className="ui-btn" disabled={disabled} onClick={() => ejecutar(async () => {
                  setEstado("Abriendo el escaneo…");
                  await leer(await downloadScannerFile(row), row);
                })}>Leer / reintentar</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
