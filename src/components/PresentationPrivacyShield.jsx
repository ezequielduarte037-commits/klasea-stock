import { useEffect } from "react";

// El modo presentación usa datos reales para que la demo sea representativa,
// pero no debe mostrar importes en una reunión externa. La máscara trabaja
// sobre nodos visuales; la base además bloquea cualquier escritura de estas
// cuentas mediante la migración de perfiles demo.
const CURRENCY_VALUE = /(?:U\$S|US\$|USD|ARS|\$)\s*-?\s*\d[\d.,]*/i;
const ECONOMIC_FIELD = /\b(precio|precios|costo|costos|importe|presupuesto|cotizaci[oó]n)\b/i;

function shouldMask(element) {
  if (!(element instanceof Element)) return false;
  if (element.closest("[data-demo-visible='true']")) return false;

  const text = String(element.textContent || "").trim();
  if (CURRENCY_VALUE.test(text)) return true;

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const context = [
      element.name,
      element.id,
      element.placeholder,
      element.getAttribute("aria-label"),
      element.closest("label")?.textContent,
      element.parentElement?.textContent,
    ].filter(Boolean).join(" ");
    return ECONOMIC_FIELD.test(context) && /\d/.test(String(element.value || ""));
  }

  return element.childElementCount === 0
    && ECONOMIC_FIELD.test(text)
    && /\d/.test(text);
}

function maskEconomicTableColumns(root) {
  const tables = [];
  if (root instanceof HTMLTableElement) tables.push(root);
  if (root instanceof Element || root === document.documentElement) {
    tables.push(...root.querySelectorAll("table"));
  }

  for (const table of tables) {
    const rows = [...table.querySelectorAll("tr")];
    const headerRow = rows.find((row) => row.querySelector("th"));
    if (!headerRow) continue;
    const headers = [...headerRow.querySelectorAll(":scope > th, :scope > td")];
    const economicColumns = headers
      .map((header, index) => ({ index, text: String(header.textContent || "") }))
      .filter(({ text }) => ECONOMIC_FIELD.test(text) || /\b(?:USD|ARS|U\$S)\b|\$/i.test(text))
      .map(({ index }) => index);

    for (const row of rows) {
      const cells = [...row.querySelectorAll(":scope > th, :scope > td")];
      for (const index of economicColumns) {
        const cell = cells[index];
        if (cell && cell !== headers[index]) cell.classList.add("klasea-demo-price");
      }
    }
  }
}

function maskTree(root) {
  if (!(root instanceof Element) && root !== document.documentElement) return;
  const elements = root instanceof Element
    ? [root, ...root.querySelectorAll("*")]
    : [...document.querySelectorAll("*")];
  for (const element of elements) {
    if (shouldMask(element)) element.classList.add("klasea-demo-price");
  }
  maskEconomicTableColumns(root);
}

export default function PresentationPrivacyShield({ active = false }) {
  useEffect(() => {
    if (!active) return undefined;
    const root = document.documentElement;
    root.dataset.presentationMode = "true";

    let frame = 0;
    const pendingRoots = new Set();
    const flush = () => {
      frame = 0;
      for (const pendingRoot of pendingRoots) maskTree(pendingRoot);
      pendingRoots.clear();
    };
    const schedule = (changedRoot) => {
      if (changedRoot instanceof Element) pendingRoots.add(changedRoot);
      else pendingRoots.add(document.documentElement);
      if (!frame) frame = window.requestAnimationFrame(flush);
    };

    maskTree(document.documentElement);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        schedule(mutation.type === "characterData" ? mutation.target.parentElement : mutation.target);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      delete root.dataset.presentationMode;
      document.querySelectorAll(".klasea-demo-price").forEach((element) => element.classList.remove("klasea-demo-price"));
    };
  }, [active]);

  if (!active) return null;
  return (
    <>
      <style>{`
        .klasea-demo-price {
          filter: blur(6px) !important;
          user-select: none !important;
          pointer-events: none !important;
        }
        html[data-presentation-mode="true"] .recharts-yAxis .recharts-cartesian-axis-tick-value,
        html[data-presentation-mode="true"] .recharts-tooltip-wrapper {
          filter: blur(6px) !important;
          user-select: none !important;
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
          font: 800 10px/1.1 'Outfit', system-ui, sans-serif;
          letter-spacing: .09em;
          white-space: nowrap;
        }
      `}</style>
    </>
  );
}
