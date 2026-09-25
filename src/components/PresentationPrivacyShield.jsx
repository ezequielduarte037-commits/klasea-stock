import { useLayoutEffect } from "react";

// La cuenta demo consulta datos reales. Esta barrera sólo oculta los importes
// visualmente; los permisos de escritura se bloquean aparte en la base.
const CURRENCY_VALUE = /(?:U\$S|US\$|USD|ARS|\$)\s*[-+~]?\s*\d[\d.,]*|\d[\d.,]*\s*(?:U\$S|US\$|USD|ARS)\b/i;
const CURRENCY_MARKER = /(?:U\$S|US\$|\bUSD\b|\bARS\b|\$)/i;
const ECONOMIC_FIELD = /\b(?:precios?|costos?|importes?|presupuestos?|cotizaci[oó]n(?:es)?|montos?|valor(?:es)?|subtotal(?:es)?|unitario|gastad[oa]s?|remanentes?|facturad[oa]s?|d[oó]lar(?:es)?)\b/i;
const NUMBER_VALUE = /^\s*[~+-]?\s*\d[\d.,]*(?:\s*(?:M|mil))?\s*$/i;
const PRICE_CLASS = "klasea-demo-price";
const COLUMN_CLASS = "klasea-demo-price-column";

function directText(element) {
  return [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join(" ")
    .trim();
}

function economicContext(element) {
  const parent = element.parentElement;
  if (!parent || parent.children.length > 6) return false;
  // Las vistas nuevas separan la etiqueta o el signo del número en dos nodos.
  const context = [directText(parent), ...[...parent.children]
    .filter((child) => child !== element)
    .map((child) => child.textContent || "")]
    .join(" ")
    .slice(0, 180);
  return ECONOMIC_FIELD.test(context) || CURRENCY_MARKER.test(context);
}

function shouldMask(element) {
  if (!(element instanceof Element)) return false;
  if (element.closest("[data-demo-visible='true']")) return false;

  if (element.closest("script, style, noscript")) return false;

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const context = [
      element.name,
      element.id,
      element.placeholder,
      element.getAttribute("aria-label"),
      element.closest("label")?.textContent,
      directText(element.parentElement || element),
    ].filter(Boolean).join(" ");
    // Se marca incluso vacío: cambiar el valor de un input no muta el DOM.
    return ECONOMIC_FIELD.test(context);
  }

  // No se tapa un contenedor por el precio de uno de sus hijos: se perdería
  // toda la fila o la pantalla. Las tablas se tratan aparte por columna.
  if (element.childElementCount > 0) return false;
  const text = String(element.textContent || "").trim();
  if (!text || !/\d/.test(text)) return false;
  if (CURRENCY_VALUE.test(text) || ECONOMIC_FIELD.test(text)) return true;
  return NUMBER_VALUE.test(text) && economicContext(element);
}

function maskEconomicTableColumns(table) {
  const rows = [...table.querySelectorAll("tr")];
  const headerRow = rows.find((row) => row.querySelector("th"));
  if (!headerRow) return;
  const headers = [...headerRow.querySelectorAll(":scope > th, :scope > td")];
  const economicColumns = new Set(headers
    .map((header, index) => ({ index, text: String(header.textContent || "") }))
    .filter(({ text }) => ECONOMIC_FIELD.test(text) || CURRENCY_MARKER.test(text))
    .map(({ index }) => index));

  for (const row of rows) {
    const cells = [...row.querySelectorAll(":scope > th, :scope > td")];
    cells.forEach((cell, index) => {
      cell.classList.toggle(COLUMN_CLASS, row !== headerRow && economicColumns.has(index));
    });
  }
}

function maskTree(root, originalAttributes) {
  if (!(root instanceof Element)) return;
  const elements = [root, ...root.querySelectorAll("*")];
  for (const element of elements) {
    element.classList.toggle(PRICE_CLASS, shouldMask(element));
    // Varios importes también aparecen en el tooltip al pasar el mouse.
    for (const attribute of ["title", "aria-label"]) {
      const value = element.getAttribute(attribute);
      if (!value || value === "Importe oculto") continue;
      if (!CURRENCY_VALUE.test(value) && !(ECONOMIC_FIELD.test(value) && /\d/.test(value))) continue;
      if (!originalAttributes.has(element)) originalAttributes.set(element, {});
      originalAttributes.get(element)[attribute] = value;
      element.setAttribute(attribute, "Importe oculto");
    }
  }
  const tables = new Set(root.querySelectorAll("table"));
  const parentTable = root.closest("table");
  if (parentTable) tables.add(parentTable);
  for (const table of tables) maskEconomicTableColumns(table);
}

export default function PresentationPrivacyShield({ active = false }) {
  useLayoutEffect(() => {
    if (!active) return undefined;
    const root = document.documentElement;
    const originalAttributes = new Map();
    root.dataset.presentationMode = "true";
    maskTree(root, originalAttributes);

    const pendingRoots = new Set();
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      for (const pendingRoot of pendingRoots) {
        if (pendingRoot.isConnected) maskTree(pendingRoot, originalAttributes);
      }
      pendingRoots.clear();
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const changed = mutation.target.nodeType === Node.TEXT_NODE
          ? mutation.target.parentElement
          : mutation.target;
        if (changed instanceof Element) pendingRoots.add(changed.parentElement || changed);
      }
      // requestAnimationFrame dejaba un cuadro con importes a la vista.
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label"],
    });

    return () => {
      observer.disconnect();
      pendingRoots.clear();
      delete root.dataset.presentationMode;
      document.querySelectorAll(`.${PRICE_CLASS}, .${COLUMN_CLASS}`).forEach((element) => {
        element.classList.remove(PRICE_CLASS, COLUMN_CLASS);
      });
      for (const [element, attributes] of originalAttributes) {
        for (const [attribute, value] of Object.entries(attributes)) {
          if (element.getAttribute(attribute) === "Importe oculto") element.setAttribute(attribute, value);
        }
      }
    };
  }, [active]);

  if (!active) return null;
  return (
    <>
      <style>{`
        html[data-presentation-mode="true"] .klasea-demo-price,
        html[data-presentation-mode="true"] .klasea-demo-price-column {
          visibility: hidden !important;
          user-select: none !important;
        }
        html[data-presentation-mode="true"] .klasea-demo-price:not(input):not(textarea):not(select):not(option)::after,
        html[data-presentation-mode="true"] .klasea-demo-price-column::after {
          content: "•••";
          visibility: visible !important;
          color: var(--muted, #9ca3af) !important;
          font-size: 11px !important;
          font-weight: 600 !important;
        }
        html[data-presentation-mode="true"] .klasea-demo-price-column .klasea-demo-price::after {
          content: none;
        }
        html[data-presentation-mode="true"] .recharts-yAxis .recharts-cartesian-axis-tick-value,
        html[data-presentation-mode="true"] .recharts-tooltip-wrapper {
          visibility: hidden !important;
          pointer-events: none !important;
        }
        html[data-presentation-mode="true"] body::after {
          content: "PRESENTACIÓN EXTERNA · IMPORTES OCULTOS · SOLO LECTURA";
          position: fixed;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483000;
          pointer-events: none;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(139, 92, 246, .38);
          background: rgba(20, 15, 35, .92);
          color: #c4b5fd;
          box-shadow: 0 8px 30px rgba(0, 0, 0, .28);
          font: 650 10px/1.1 'Outfit', system-ui, sans-serif;
          letter-spacing: .09em;
          white-space: nowrap;
        }
      `}</style>
    </>
  );
}
