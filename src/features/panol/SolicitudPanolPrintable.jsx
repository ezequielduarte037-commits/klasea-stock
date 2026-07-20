import { C } from "@/theme";
import logoK from "@/assets/logos/logo-k.png";
import { ClipboardList, Printer, X } from "lucide-react";
import { useRef } from "react";

const ITEM_ROWS = Array.from({ length: 14 }, (_, index) => index + 1);

const paperTable = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const cell = {
  border: "1px solid #111827",
  padding: "4px 6px",
  verticalAlign: "top",
  boxSizing: "border-box",
};

const label = {
  fontSize: 8.5,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: "#334155",
  fontWeight: 900,
};

function FormCell({ title, children, colSpan = 1, height = "8mm" }) {
  return (
    <td colSpan={colSpan} style={{ ...cell, height }}>
      <div style={label}>{title}</div>
      {children ? <div style={{ color: "#0f172a", fontSize: 12, fontWeight: 700, marginTop: 3 }}>{children}</div> : null}
    </td>
  );
}

function CheckboxLine({ text }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 12, whiteSpace: "nowrap" }}>
      <span style={{ width: 11, height: 11, border: "1.4px solid #111827", display: "inline-block" }} />
      <span>{text}</span>
    </span>
  );
}

function InfoBlock() {
  return (
    <table style={{ ...paperTable, marginTop: "3mm" }}>
      <colgroup>
        <col style={{ width: "50%" }} />
        <col style={{ width: "50%" }} />
      </colgroup>
      <tbody>
        <tr>
          <FormCell title="Fecha pedido" />
          <FormCell title="Necesario para" />
        </tr>
        <tr>
          <FormCell title="Obra / barco" />
          <FormCell title="Sector / linea" />
        </tr>
        <tr>
          <FormCell title="Solicita" />
          <FormCell title="Retira" />
        </tr>
        <tr>
          <FormCell title="Prioridad" colSpan={2}>Normal / Urgente</FormCell>
        </tr>
      </tbody>
    </table>
  );
}

function ItemsTable() {
  return (
    <table style={{ ...paperTable, fontSize: 10.5 }}>
      <colgroup>
        <col style={{ width: "5%" }} />
        <col style={{ width: "43%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "32%" }} />
      </colgroup>
      <thead>
        <tr style={{ background: "#e5e7eb" }}>
          <th style={{ ...cell, padding: "3px 5px", textAlign: "center" }}>#</th>
          <th style={{ ...cell, padding: "3px 5px", textAlign: "left" }}>Material / consumible</th>
          <th style={{ ...cell, padding: "3px 5px", textAlign: "center" }}>Cant.</th>
          <th style={{ ...cell, padding: "3px 5px", textAlign: "center" }}>Unidad</th>
          <th style={{ ...cell, padding: "3px 5px", textAlign: "left" }}>Marca, medida u observacion</th>
        </tr>
      </thead>
      <tbody>
        {ITEM_ROWS.map((row) => (
          <tr key={row}>
            <td style={{ ...cell, height: "5.8mm", textAlign: "center", color: "#334155", fontWeight: 700 }}>{row}</td>
            <td style={cell} />
            <td style={cell} />
            <td style={cell} />
            <td style={cell} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BottomBlock() {
  return (
    <>
      <table style={{ ...paperTable, marginTop: "2.5mm" }}>
        <colgroup>
          <col style={{ width: "56%" }} />
          <col style={{ width: "44%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={{ ...cell, height: "18mm" }}>
              <div style={label}>Observaciones del solicitante</div>
            </td>
            <td style={{ ...cell, height: "18mm" }}>
              <div style={label}>Uso pañol</div>
              <div style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.8 }}>
                <CheckboxLine text="Preparar" />
                <CheckboxLine text="Completo" />
                <CheckboxLine text="Parcial" />
                <CheckboxLine text="Falta stock" />
                <CheckboxLine text="Consultar" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ ...paperTable, marginTop: "2mm" }}>
        <colgroup>
          <col style={{ width: "50%" }} />
          <col style={{ width: "50%" }} />
        </colgroup>
        <tbody>
          <tr>
            <FormCell title="Recibido por pañol" />
            <FormCell title="Preparado por" />
          </tr>
          <tr>
            <FormCell title="Entregado a" />
            <FormCell title="Hora entrega" />
          </tr>
          <tr>
            <FormCell title="Firma / NFC del que retira" />
            <FormCell title="Notas de preparacion / ubicaciones" />
          </tr>
        </tbody>
      </table>
    </>
  );
}

export default function SolicitudPanolPrintable({ open, onClose }) {
  const paperRef = useRef(null);

  if (!open) return null;

  const print = () => {
    if (typeof window === "undefined" || !paperRef.current) return;

    const printWindow = window.open("", "solicitud-panol-print", "width=900,height=1100");
    if (!printWindow) {
      window.alert("El navegador bloqueo la ventana de impresion. Habilita las ventanas emergentes para este sitio.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Solicitud de preparacion a panol</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            * { box-sizing: border-box; }
            html, body {
              width: 210mm;
              min-width: 210mm;
              height: 297mm;
              min-height: 297mm;
              margin: 0;
              padding: 0;
              background: #fff;
              color: #0f172a;
              font-family: Arial, Helvetica, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .solicitud-panol-print-area {
              display: block !important;
              position: static !important;
              width: 210mm !important;
              min-width: 210mm !important;
              max-width: 210mm !important;
              height: 297mm !important;
              min-height: 297mm !important;
              max-height: 297mm !important;
              margin: 0 !important;
              padding: 10mm 11mm !important;
              border: 0 !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              overflow: hidden !important;
              background: #fff !important;
            }
            .solicitud-panol-print-area table {
              display: table !important;
              width: 100% !important;
              min-width: 100% !important;
              max-width: 100% !important;
              border-collapse: collapse !important;
              table-layout: fixed !important;
            }
            .solicitud-panol-print-area tr { display: table-row !important; }
            .solicitud-panol-print-area td,
            .solicitud-panol-print-area th { display: table-cell !important; }
          </style>
        </head>
        <body>${paperRef.current.outerHTML}</body>
      </html>`);
    printWindow.document.close();

    const launchPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    if (printWindow.document.readyState === "complete") {
      window.setTimeout(launchPrint, 180);
    } else {
      printWindow.addEventListener("load", () => window.setTimeout(launchPrint, 180), { once: true });
    }
    printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Solicitud imprimible para pañol"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15, 23, 42, 0.58)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          maxHeight: "96vh",
          overflow: "auto",
          background: C.panelSolid,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
        }}
      >
        <div
          className="solicitud-panol-no-print"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: C.panelSolid,
            borderBottom: `1px solid ${C.border}`,
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <ClipboardList size={18} style={{ color: C.blue }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>Solicitud imprimible para pañol</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>Hoja A4 para preparar materiales del dia siguiente.</div>
          </div>
          <button
            type="button"
            onClick={print}
            style={{
              border: `1px solid ${C.greenB}`,
              background: C.greenL,
              color: C.green,
              borderRadius: 10,
              padding: "9px 12px",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: C.sans,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <Printer size={15} />
            Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar imprimible"
            style={{
              border: `1px solid ${C.border}`,
              background: C.panel,
              color: C.text,
              borderRadius: 10,
              padding: 9,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <section
          ref={paperRef}
          className="solicitud-panol-print-area"
          style={{
            width: "210mm",
            height: "297mm",
            margin: "18px auto",
            background: "#ffffff",
            color: "#0f172a",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            boxShadow: "0 18px 48px rgba(15, 23, 42, 0.18)",
            padding: "10mm 11mm",
            boxSizing: "border-box",
            overflow: "hidden",
            fontFamily: "Arial, Helvetica, sans-serif",
          }}
        >
          <header style={{ display: "table", width: "100%", borderBottom: "3px solid #111827", paddingBottom: "2mm" }}>
            <div style={{ display: "table-cell", width: "12mm", verticalAlign: "middle" }}>
              <img src={logoK} alt="Klase A" style={{ width: "10mm", height: "10mm", objectFit: "contain", filter: "invert(1)" }} />
            </div>
            <div style={{ display: "table-cell", verticalAlign: "middle" }}>
              <div style={{ fontSize: 19, lineHeight: 1.05, fontWeight: 900, letterSpacing: -0.2 }}>
                Solicitud de preparación a pañol
              </div>
              <div style={{ color: "#475569", fontSize: 10, marginTop: 3 }}>
                Completar y entregar a pañol para preparar materiales, consumibles o herramientas.
              </div>
            </div>
          </header>

          <InfoBlock />

          <table style={{ ...paperTable, marginTop: 0 }}>
            <tbody>
              <tr>
                <td style={{ ...cell, height: "10mm" }}>
                  <div style={label}>Tipo de pedido</div>
                  <div style={{ marginTop: 5, fontSize: 10.5 }}>
                    <CheckboxLine text="Consumibles" />
                    <CheckboxLine text="Materiales" />
                    <CheckboxLine text="Herramientas" />
                    <CheckboxLine text="Mixto" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <table style={{ ...paperTable, marginTop: "2.5mm" }}>
            <tbody>
              <tr>
                <td style={{ ...cell, height: "16mm" }}>
                  <div style={label}>Tarea a realizar</div>
                  <div style={{ color: "#94a3b8", fontSize: 9.5, marginTop: 4 }}>
                    Ej: colocar paneles, laminar pieza, instalacion electrica, reparacion, limpieza, etc.
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: "2.5mm" }}>
            <div style={{ display: "table", width: "100%", marginBottom: "1mm" }}>
              <div style={{ ...label, color: "#0f172a", display: "table-cell" }}>Items solicitados</div>
              <div style={{ color: "#64748b", fontSize: 8.5, display: "table-cell", textAlign: "right" }}>
                Pañol completa código / ubicación si corresponde.
              </div>
            </div>
            <ItemsTable />
          </div>

          <BottomBlock />

          <footer style={{ display: "table", width: "100%", marginTop: "2.5mm", paddingTop: "2mm", borderTop: "1px solid #cbd5e1", color: "#64748b", fontSize: 8.5 }}>
            <span style={{ display: "table-cell" }}>Klase A - Pañol</span>
            <span style={{ display: "table-cell", textAlign: "right" }}>Solicitud manual para digitalizar / conciliar en el sistema</span>
          </footer>
        </section>
      </div>
    </div>
  );
}
